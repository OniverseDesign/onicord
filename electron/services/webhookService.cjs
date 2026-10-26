const http = require("http");
const url = require("url");
const crypto = require("crypto");
const { app } = require("electron");

class WebhookService {
  constructor() {
    this.port = parseInt(process.env.ONICORD_WEBHOOK_PORT || "42885", 10);
    this.activePort = null;
    this.server = null;
    this._rateLimits = new Map(); // Map<webhookId, { count: number, resetAt: number }>
  }

  start(attemptPort = null) {
    if (this.server) return;
    const targetPort = attemptPort || this.port;

    const server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Webhook-Token");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const parsedUrl = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);
      const pathname = parsedUrl.pathname || "";

      // Health check endpoint
      if (req.method === "GET" && (pathname === "/health" || pathname === "/api/webhooks/health")) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", activePort: this.activePort, timestamp: Date.now() }));
        return;
      }

      // Webhook ingestion endpoint: /api/webhooks/:roomCode/:webhookId
      const webhookMatch = pathname.match(/^\/api\/webhooks\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)/);
      if (req.method === "POST" && webhookMatch) {
        const roomCode = webhookMatch[1].toUpperCase();
        const webhookId = webhookMatch[2];

        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
          if (body.length > 2 * 1024 * 1024) { // 2MB max payload limit
            req.destroy();
          }
        });

        req.on("end", async () => {
          try {
            const queryObj = Object.fromEntries(parsedUrl.searchParams.entries());
            await this.handleWebhookPost(req, res, roomCode, webhookId, body, queryObj);
          } catch (err) {
            console.error("[WebhookService Error]:", err);
            if (!res.headersSent) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: err.message || "Internal server error" }));
            }
          }
        });
        return;
      }

      // Default 404
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Endpoint not found" }));
    });

    server.once("error", (err) => {
      if (err.code === "EADDRINUSE" && targetPort < 42895) {
        console.log(`[Onicord Webhook 🔄] Port ${targetPort} in use. Retrying on ${targetPort + 1}...`);
        this.server = null;
        this.start(targetPort + 1);
      } else {
        console.error("[Onicord Webhook ❌] Failed to bind HTTP listener:", err.message);
        this.server = null;
      }
    });

    server.listen(targetPort, "127.0.0.1", () => {
      this.activePort = targetPort;
      this.server = server;
      console.log(`[Onicord Webhook 🚀] Ingress HTTP service listening on http://127.0.0.1:${this.activePort}`);
    });
  }

  stop() {
    if (this.server) {
      try {
        this.server.close();
      } catch {}
      this.server = null;
      this.activePort = null;
    }
  }

  getBaseUrl() {
    const port = this.activePort || this.port;
    return `http://127.0.0.1:${port}`;
  }

  _checkRateLimit(webhookId, maxRequests = 10, windowMs = 5000) {
    const now = Date.now();
    let entry = this._rateLimits.get(webhookId);
    if (!entry || now > entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      this._rateLimits.set(webhookId, entry);
      return true;
    }
    if (entry.count >= maxRequests) {
      return false;
    }
    entry.count++;
    return true;
  }

  async handleWebhookPost(req, res, roomCode, webhookId, bodyStr, queryParams) {
    // 1. Verify room and roomManager availability
    if (!global.roomManager || !global.roomManager.roomMetaStore) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Room manager is currently unavailable" }));
      return;
    }

    // 2. Fetch webhook definition from RoomMetaStore
    const webhooks = await global.roomManager.roomMetaStore.getWebhooks(roomCode, true);
    const webhook = (webhooks || []).find((w) => w.id === webhookId);

    if (!webhook) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Webhook '${webhookId}' not found in room '${roomCode}'` }));
      return;
    }

    // 3. Extract and authenticate incoming token
    let incomingToken = null;
    const authHeader = req.headers["authorization"] || "";
    if (authHeader.startsWith("Bearer ")) {
      incomingToken = authHeader.slice(7).trim();
    } else if (req.headers["x-webhook-token"]) {
      incomingToken = String(req.headers["x-webhook-token"]).trim();
    } else if (queryParams && queryParams.token) {
      incomingToken = String(queryParams.token).trim();
    }

    if (!incomingToken) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized: Missing authentication token" }));
      return;
    }

    const incomingHash = crypto.createHash("sha256").update(incomingToken).digest("hex");
    let isAuthorized = false;
    try {
      if (webhook.tokenHash && Buffer.byteLength(incomingHash) === Buffer.byteLength(webhook.tokenHash)) {
        isAuthorized = crypto.timingSafeEqual(Buffer.from(incomingHash), Buffer.from(webhook.tokenHash));
      }
    } catch {}

    if (!isAuthorized) {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden: Invalid webhook token" }));
      return;
    }

    // 4. Rate limiting check
    if (!this._checkRateLimit(webhookId, 10, 5000)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too Many Requests: Rate limit exceeded (max 10 reqs / 5s)" }));
      return;
    }

    // 5. Parse payload (supports Discord standard format)
    let payload = {};
    if (bodyStr && bodyStr.trim()) {
      try {
        payload = JSON.parse(bodyStr);
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Malformed JSON payload: " + e.message }));
        return;
      }
    }

    const content = typeof payload.content === "string" ? payload.content : "";
    const embeds = Array.isArray(payload.embeds) ? payload.embeds : [];
    const username = payload.username ? String(payload.username).trim().slice(0, 48) : null;
    const avatar_url = payload.avatar_url ? String(payload.avatar_url).trim() : null;

    if (!content.trim() && embeds.length === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payload must contain either 'content' or 'embeds'" }));
      return;
    }

    // 6. Dispatch message through chatService & P2P swarm
    const channelId = payload.channel_id || webhook.channelId || "general";
    const sentMessage = await global.roomManager.sendWebhookMessage({
      roomCode,
      channelId,
      webhook,
      content,
      embeds,
      username,
      avatar_url,
    });

    // 7. Emit directly to local React UI with decrypted content
    try {
      const cryptoService = require("./cryptoService.cjs");
      const decryptedMsg = {
        ...sentMessage,
        text: cryptoService.decrypt(roomCode, sentMessage.text),
      };
      global.mainWindow?.webContents.send("chat:message", decryptedMsg);
    } catch (e) {}

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      success: true,
      messageId: sentMessage.id,
      channelId: sentMessage.channelId,
      timestamp: sentMessage.timestamp,
    }));
  }
}

module.exports = new WebhookService();
