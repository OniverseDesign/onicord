const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { StringDecoder } = require("string_decoder");
const serverService = require("./serverService.cjs");

// =========================================================================
// SECURITY LIMITS & CONSTANTS
// =========================================================================
const MAX_CACHED_SERVERS = 300;
const MAX_PENDING_REQUESTS_PER_SERVER = 25;
const KNOCK_RATE_LIMIT_MS = 2 * 60 * 1000; // 2 minutes between knocks from same applicant
const KNOCK_PENDING_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours TTL for outgoing knock approvals
const ANNOUNCE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TOAST_THROTTLE_MS = 4000; // 4 seconds between knock toasts to prevent UI freeze
const MAX_DISCOVER_BUFFER_BYTES = 1024 * 1024; // 1 MB strict line limit on discover sockets
const DISCOVER_RATE_CAPACITY = 40;
const DISCOVER_RATE_REFILL_PER_SEC = 20;

const ALLOWED_DISCOVER_TYPES = new Set([
  "onicord:discover-request",
  "onicord:discover-req",
  "onicord:discover-res",
  "onicord:discover-announce",
  "onicord:discover-unannounce",
  "onicord:knock-request",
  "onicord:knock-req",
  "onicord:knock-approved",
  "onicord:knock-rejected",
]);

const LIMITS = {
  name: 60,
  description: 300,
  category: 30,
  tag: 25,
  maxTags: 8,
  roomCode: 32,
  applicantName: 32,
  knockMessage: 150,
  avatarOrBanner: 8 * 1024 * 1024, // 8 MB max to allow high-res base64 banners/avatars
};

function sanitizeString(str, maxLength, fallback = "") {
  if (typeof str !== "string") return fallback;
  // Strip control characters (except common whitespace) and trim
  const clean = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
  return clean.slice(0, maxLength);
}

function sanitizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .filter((t) => typeof t === "string" && t.trim().length > 0)
    .slice(0, LIMITS.maxTags)
    .map((t) => sanitizeString(t.replace(/^#/, ""), LIMITS.tag))
    .filter(Boolean);
}

function sanitizeImage(img) {
  if (typeof img !== "string") return null;
  const trimmed = img.trim();
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("onicord-media://") ||
    trimmed.startsWith("data:image/")
  ) {
    if (trimmed.length <= LIMITS.avatarOrBanner) {
      if (trimmed.startsWith("data:image/")) {
        try {
          const udp = global.discoverService?._getUserDataPath?.() || app?.getPath?.("userData");
          if (udp) {
            const { CasStore } = require("../storage/casStore.cjs");
            return CasStore.getInstance(udp).storeDataUri(trimmed);
          }
        } catch {}
      }
      return trimmed;
    }
  }
  return null;
}

class DiscoverService {
  constructor() {
    global.discoverService = this;
    this.cacheFile = null;
    this.userDataPathOverride = null;
    this.discoveredServers = new Map(); // roomCode -> serverMeta
    this.knockRateLimits = new Map(); // applicantId -> timestamp
    this.pendingOutgoingKnocks = new Map(); // roomCode -> { requestedAt, announcerPeerId }
    this.discoverSwarm = null;
    this.discoverPeers = new Map(); // peerId -> { id, socket, decoder, rateTokens, rateLastRefill, rateDropCount, rateWindowStart }
    this._discoverBuffers = new Map();
    this.lastToastNotification = 0;
    this.saveTimeout = null;
    this.announceInterval = null;
    this.cleanupInterval = null;
    this.isInitialized = false;
  }

  _getUserDataPath() {
    if (this.userDataPathOverride) return this.userDataPathOverride;
    try {
      return app?.getPath?.("userData") || null;
    } catch {
      return null;
    }
  }

  _getDiscoverDb() {
    const userDataPath = this._getUserDataPath();
    if (!userDataPath) return null;
    const { DbManager } = require("../storage/dbManager.cjs");
    return DbManager.getInstance(userDataPath).getGlobalDb("discover");
  }

  _loadCache() {
    try {
      const db = this._getDiscoverDb();
      if (!db) return;
      const rows = db.prepare("SELECT * FROM discovered_servers").all();
      const now = Date.now();
      for (const r of rows) {
        if (r.room_code && r.last_seen_at && now - r.last_seen_at < ANNOUNCE_EXPIRY_MS) {
          const extra = r.extra_json ? JSON.parse(r.extra_json) : {};
          const code = String(r.room_code).toUpperCase().trim();
          this.discoveredServers.set(code, {
            ...extra,
            roomCode: code,
            name: r.name,
            description: r.description || "",
            category: r.category || "General",
            tags: r.tags_json ? JSON.parse(r.tags_json) : [],
            memberCount: r.member_count || 1,
            icon: r.icon_ref || null,
            banner: r.banner_ref || null,
            lastSeen: r.last_seen_at,
          });
        }
      }
    } catch (err) {
      console.warn("[DiscoverService] Error leyendo caché local en discover.db:", err.message);
    }
  }

  _saveCacheDebounced() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null;
      try {
        const db = this._getDiscoverDb();
        if (!db) return;
        const list = Array.from(this.discoveredServers.values());
        const tx = db.transaction((items) => {
          db.prepare("DELETE FROM discovered_servers").run();
          const insert = db.prepare(`
            INSERT OR REPLACE INTO discovered_servers (
              room_code, name, description, category, language,
              member_count, online_count, icon_ref, banner_ref,
              tags_json, extra_json, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
          `);
          for (const srv of items) {
            if (!srv?.roomCode) continue;
            insert.run(
              String(srv.roomCode).toUpperCase().trim(),
              String(srv.name || srv.roomCode),
              srv.description || "",
              srv.category || "General",
              srv.language || "es",
              Number(srv.memberCount) || 1,
              srv.icon || null,
              srv.banner || null,
              JSON.stringify(srv.tags || []),
              JSON.stringify(srv),
              Number(srv.lastSeen) || Date.now()
            );
          }
        });
        tx(list);
      } catch (err) {
        console.warn("[DiscoverService] Error guardando caché local en discover.db:", err.message);
      }
    }, 3000);
  }

  _broadcast(channel, data) {
    try {
      const wins = BrowserWindow?.getAllWindows?.() || [];
      for (const win of wins) {
        if (win && !win.isDestroyed()) {
          win.webContents.send(channel, data);
        }
      }
    } catch {}
  }

  async ensureDiscoverSwarm() {
    if (this.discoverSwarm) return this.discoverSwarm;
    try {
      const Hyperswarm = require("hyperswarm");
      const swarm = new Hyperswarm({ maxPeers: 32 }); // Ephemeral identity isolated from room swarm
      swarm.on("connection", (socket, peerInfo) => this._handleDiscoverConnection(socket, peerInfo));
      const globalDiscoverTopic = crypto
        .createHash("sha256")
        .update("__ONICORD_GLOBAL_DISCOVER_V1__")
        .digest();
      swarm.join(globalDiscoverTopic, { server: true, client: true });
      this.discoverSwarm = swarm;
      return swarm;
    } catch (err) {
      console.warn("[DiscoverService] No se pudo iniciar discoverSwarm aislado:", err.message);
      return null;
    }
  }

  _handleDiscoverConnection(socket, peerInfo) {
    const b4a = require("b4a");
    const peerId = peerInfo?.publicKey
      ? b4a.toString(peerInfo.publicKey, "hex")
      : `ephem_${crypto.randomBytes(8).toString("hex")}`;

    if (this.discoverPeers.has(peerId)) {
      try {
        socket.destroy();
      } catch {}
      return;
    }

    const peer = {
      id: peerId,
      socket,
      decoder: new StringDecoder("utf8"),
      rateTokens: DISCOVER_RATE_CAPACITY,
      rateLastRefill: Date.now(),
      rateDropCount: 0,
      rateWindowStart: Date.now(),
    };

    this.discoverPeers.set(peerId, peer);
    this._discoverBuffers.set(peerId, "");

    socket.on("data", (chunk) => this._onDiscoverData(peerId, chunk));
    socket.on("error", () => {});
    socket.on("close", () => this._removeDiscoverPeer(peerId));

    this.syncAndAnnounceLocalServers(peerId).catch(() => {});
  }

  _removeDiscoverPeer(peerId) {
    const peer = this.discoverPeers.get(peerId);
    if (!peer) return;
    try {
      peer.decoder?.end();
    } catch {}
    try {
      peer.socket?.destroy();
    } catch {}
    this.discoverPeers.delete(peerId);
    this._discoverBuffers.delete(peerId);
  }

  _consumeDiscoverRateToken(peer) {
    const now = Date.now();
    const elapsedSec = Math.max(0, (now - peer.rateLastRefill) / 1000);
    peer.rateTokens = Math.min(
      DISCOVER_RATE_CAPACITY,
      peer.rateTokens + elapsedSec * DISCOVER_RATE_REFILL_PER_SEC
    );
    peer.rateLastRefill = now;

    if (peer.rateTokens >= 1) {
      peer.rateTokens -= 1;
      return true;
    }

    if (now - peer.rateWindowStart > 10000) {
      peer.rateWindowStart = now;
      peer.rateDropCount = 0;
    }
    peer.rateDropCount += 1;
    return false;
  }

  async _onDiscoverData(peerId, chunk) {
    const peer = this.discoverPeers.get(peerId);
    if (!peer) return;
    if (!peer.decoder) peer.decoder = new StringDecoder("utf8");

    const prev = this._discoverBuffers.get(peerId) || "";
    const decoded = Buffer.isBuffer(chunk) ? peer.decoder.write(chunk) : String(chunk);
    const combined = prev + decoded;

    if (combined.length > MAX_DISCOVER_BUFFER_BYTES) {
      console.warn(`[DiscoverService] Buffer overflow desde peer ${peerId}. Cerrando socket.`);
      this._removeDiscoverPeer(peerId);
      return;
    }

    const { decodeMessages } = require("../network/p2pService.cjs");
    const { messages, remaining } = decodeMessages(combined);
    this._discoverBuffers.set(peerId, remaining);

    for (const msg of messages) {
      if (!msg || typeof msg.type !== "string" || !ALLOWED_DISCOVER_TYPES.has(msg.type)) {
        // Strict parser: ignore any non-discover packet type completely
        continue;
      }
      if (!this._consumeDiscoverRateToken(peer)) {
        if (peer.rateDropCount > 50) {
          console.warn(`[DiscoverService] Flood sostenido de ${peerId}. Desconectando.`);
          this._removeDiscoverPeer(peerId);
          return;
        }
        continue;
      }
      await this._handleDiscoverMessage(peerId, msg.type, msg.payload);
    }
  }

  async _handleDiscoverMessage(peerId, type, payload) {
    if (type === "onicord:discover-request" || type === "onicord:discover-req") {
      await this.syncAndAnnounceLocalServers(peerId).catch(() => {});
      return;
    }
    if (type === "onicord:discover-res" && payload && Array.isArray(payload.servers)) {
      for (const srv of payload.servers.slice(0, 50)) {
        await this.handleIncomingAnnouncement(srv, false, peerId);
      }
      return;
    }
    if (type === "onicord:discover-announce" && payload) {
      await this.handleIncomingAnnouncement(payload, false, peerId);
      return;
    }
    if (type === "onicord:discover-unannounce" && payload) {
      await this.handleIncomingUnannounce(payload, peerId);
      return;
    }
    if ((type === "onicord:knock-request" || type === "onicord:knock-req") && payload) {
      await this.handleIncomingKnock(payload);
      return;
    }
    if (type === "onicord:knock-approved" && payload) {
      await this.handleKnockApproved(payload);
      return;
    }
    if (type === "onicord:knock-rejected" && payload) {
      await this.handleKnockRejected(payload);
      return;
    }
  }

  _sendDiscoverToPeer(peerId, type, payload) {
    const peer = this.discoverPeers.get(peerId);
    if (!peer?.socket || peer.socket.destroyed) return;
    try {
      const { encodeMessage, safeWriteSocket } = require("../network/p2pService.cjs");
      safeWriteSocket(peer.socket, encodeMessage(type, payload));
    } catch {}
  }

  _broadcastDiscover(type, payload) {
    if (this.discoverPeers.size === 0) return;
    try {
      const { encodeMessage, safeWriteSocket } = require("../network/p2pService.cjs");
      const encoded = encodeMessage(type, payload);
      for (const peer of this.discoverPeers.values()) {
        if (peer?.socket && !peer.socket.destroyed) {
          safeWriteSocket(peer.socket, encoded);
        }
      }
    } catch {}
  }

  _prunePendingOutgoingKnocks() {
    const now = Date.now();
    for (const [code, entry] of this.pendingOutgoingKnocks.entries()) {
      if (!entry || now - (entry.requestedAt || 0) > KNOCK_PENDING_TTL_MS) {
        this.pendingOutgoingKnocks.delete(code);
      }
    }
  }

  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this._loadCache();
    this.ensureDiscoverSwarm().catch(() => {});

    // Heartbeat: sync local public servers and broadcast discoveries every 60 seconds
    this.announceInterval = setInterval(() => {
      this.syncAndAnnounceLocalServers();
    }, 60000);

    // Initial check right after startup
    setTimeout(() => {
      this.syncAndAnnounceLocalServers();
    }, 500);

    console.log("[DiscoverService] Servicio nativo de descubrimiento P2P inicializado con enjambre aislado.");
  }

  async stop() {
    if (this.announceInterval) {
      clearInterval(this.announceInterval);
      this.announceInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    for (const peerId of Array.from(this.discoverPeers.keys())) {
      this._removeDiscoverPeer(peerId);
    }
    this.discoverPeers.clear();
    this._discoverBuffers.clear();
    if (this.discoverSwarm) {
      const s = this.discoverSwarm;
      this.discoverSwarm = null;
      try {
        await s.destroy();
      } catch {}
    }
    this.isInitialized = false;
  }

  async syncAndAnnounceLocalServers(targetPeerId = null) {
    try {
      await this.ensureDiscoverSwarm();
      const allServers = await serverService.listServers();
      let hasChanges = false;

      for (const s of allServers) {
        const conf = s.discoverConfig;
        const code = s.roomCode ? String(s.roomCode).toUpperCase().trim() : null;
        if (!code) continue;

        if (conf?.enabled) {
          const accessMode = conf.accessMode === "approval" ? "approval" : "public";
          const srvMeta = {
            roomCode: code,
            name: s.name,
            icon: s.icon || null,
            banner: s.banner || null,
            description: conf.description || s.description || "",
            category: conf.category || "General",
            tags: Array.isArray(conf.tags) ? conf.tags : [],
            accessMode,
            memberCount: s.savedMembers ? Object.keys(s.savedMembers).length : 1,
            ownerPublicKey: s.ownerPublicKey || null,
            ...(accessMode === "public" && s.roomSecret ? { roomSecret: s.roomSecret } : {}),
            lastSeen: Date.now(),
          };

          await this.handleIncomingAnnouncement(srvMeta, true);

          if (targetPeerId) {
            this._sendDiscoverToPeer(targetPeerId, "onicord:discover-announce", srvMeta);
          } else {
            this._broadcastDiscover("onicord:discover-announce", srvMeta);
          }
        } else {
          // If discover is disabled, ensure the server is immediately removed from discovered servers & cache
          if (this.discoveredServers.has(code)) {
            this.discoveredServers.delete(code);
            hasChanges = true;
            this._broadcastDiscover("onicord:discover-unannounce", { roomCode: code });
          }
        }
      }

      // If replying to a specific discover peer, share known cached discoveries (never expose non-public secrets)
      if (targetPeerId) {
        for (const srv of this.getDiscoveredServers()) {
          this._sendDiscoverToPeer(targetPeerId, "onicord:discover-announce", srv);
        }
      }

      if (hasChanges) {
        this._saveCacheDebounced();
        this._broadcast("plugins:discover-servers-updated", this.getDiscoveredServers());
      }
    } catch (err) {
      console.error("[DiscoverService] Error sincronizando servidores locales:", err.message);
    }
  }

  requestPeerDiscoveries() {
    try {
      this.ensureDiscoverSwarm()
        .then(() => {
          this._broadcastDiscover("onicord:discover-request", { timestamp: Date.now() });
        })
        .catch(() => {});
    } catch (_) {}
  }

  async handleIncomingAnnouncement(serverMeta, isLocalOrigin = false, fromPeerId = null) {
    if (!serverMeta?.roomCode) return;

    const rawCode = sanitizeString(serverMeta.roomCode, LIMITS.roomCode).toUpperCase();
    // Validate roomCode: strictly alphanumeric and dashes
    if (!rawCode || !/^[A-Z0-9_\-]+$/.test(rawCode)) return;

    // Anti-Spoofing: If not from local origin, check if we OWN this server locally
    if (!isLocalOrigin) {
      try {
        const store = serverService.getServerStore();
        const localServer = await store.getServerByRoomCode(rawCode);
        if (localServer && localServer.isOwner) {
          return;
        }
      } catch (_) {}
    }

    const existing = this.discoveredServers.get(rawCode);
    const accessMode = serverMeta.accessMode === "approval" ? "approval" : "public";
    let safeRoomSecret = null;
    if (accessMode === "public" && typeof serverMeta.roomSecret === "string") {
      try {
        const cryptoService = require("./cryptoService.cjs");
        if (cryptoService.isValidRoomSecret(serverMeta.roomSecret)) {
          safeRoomSecret = serverMeta.roomSecret.trim();
        }
      } catch {}
    }

    // Sanitize all incoming fields strictly
    const sanitized = {
      roomCode: rawCode,
      name: sanitizeString(serverMeta.name, LIMITS.name, `Servidor ${rawCode}`),
      description: sanitizeString(serverMeta.description, LIMITS.description, ""),
      category: sanitizeString(serverMeta.category, LIMITS.category, "General"),
      tags: sanitizeTags(serverMeta.tags),
      accessMode,
      memberCount: Math.min(Math.max(1, parseInt(serverMeta.memberCount, 10) || 1), 1000000),
      icon: sanitizeImage(serverMeta.icon),
      banner: sanitizeImage(serverMeta.banner),
      announcerPeerId: isLocalOrigin ? "__local__" : (fromPeerId || existing?.announcerPeerId || null),
      ownerPublicKey:
        typeof serverMeta.ownerPublicKey === "string" && /^[0-9a-f]{64}$/i.test(serverMeta.ownerPublicKey.trim())
          ? serverMeta.ownerPublicKey.trim().toLowerCase()
          : (existing?.ownerPublicKey || null),
      ...(safeRoomSecret ? { roomSecret: safeRoomSecret } : {}),
      lastSeen: Date.now(),
    };

    // Cache Quota / LRU Eviction: prevent unbounded growth
    if (this.discoveredServers.size >= MAX_CACHED_SERVERS && !this.discoveredServers.has(rawCode)) {
      const entries = Array.from(this.discoveredServers.entries()).sort(
        (a, b) => (a[1].lastSeen || 0) - (b[1].lastSeen || 0)
      );
      const toRemove = entries.slice(0, 10);
      for (const [key] of toRemove) {
        this.discoveredServers.delete(key);
      }
    }

    this.discoveredServers.set(rawCode, sanitized);
    this._saveCacheDebounced();
    this._broadcast("plugins:discover-servers-updated", this.getDiscoveredServers());
  }

  async handleIncomingUnannounce(payload, fromPeerId = null) {
    if (!payload?.roomCode) return false;
    const rawCode = sanitizeString(payload.roomCode, LIMITS.roomCode).toUpperCase();
    if (!rawCode) return false;
    const existing = this.discoveredServers.get(rawCode);
    if (!existing) return false;

    const matchesAnnouncer = Boolean(
      fromPeerId && existing.announcerPeerId && fromPeerId === existing.announcerPeerId
    );
    let matchesOwnerSig = false;
    if (!matchesAnnouncer && existing.ownerPublicKey && payload.signature) {
      try {
        const cryptoService = require("./cryptoService.cjs");
        matchesOwnerSig = cryptoService.verifyPayload(
          { action: "unannounce", roomCode: rawCode },
          payload.signature,
          existing.ownerPublicKey
        );
      } catch {}
    }

    if (!matchesAnnouncer && !matchesOwnerSig) {
      console.warn(
        `[DiscoverService] Rechazado discover-unannounce no autorizado para ${rawCode} desde ${fromPeerId || "unknown"}`
      );
      return false;
    }

    this.discoveredServers.delete(rawCode);
    this._saveCacheDebounced();
    this._broadcast("plugins:discover-servers-updated", this.getDiscoveredServers());
    return true;
  }

  getDiscoveredServers() {
    const now = Date.now();
    const list = [];
    for (const [code, srv] of this.discoveredServers.entries()) {
      if (srv.lastSeen && now - srv.lastSeen < ANNOUNCE_EXPIRY_MS) {
        list.push(srv);
      } else {
        this.discoveredServers.delete(code);
      }
    }
    return list;
  }

  async sendKnockRequest(payload) {
    if (!payload?.roomCode) return { success: false, error: "Falta roomCode" };

    const targetCode = sanitizeString(payload.roomCode, LIMITS.roomCode).toUpperCase();
    if (!targetCode) return { success: false, error: "Código inválido" };

    const sanitizedPayload = {
      type: "KNOCK_REQUEST",
      roomCode: targetCode,
      applicant: {
        id: sanitizeString(payload.applicant?.id, 64),
        nickname: sanitizeString(payload.applicant?.nickname || payload.applicant?.username, LIMITS.applicantName, "Usuario P2P"),
        avatar: sanitizeImage(payload.applicant?.avatar),
      },
      message: sanitizeString(payload.message, LIMITS.knockMessage, null),
      timestamp: Date.now(),
    };

    if (!sanitizedPayload.applicant.id) {
      return { success: false, error: "Identidad de usuario inválida" };
    }

    this._prunePendingOutgoingKnocks();
    const knownSrv = this.discoveredServers.get(targetCode);
    this.pendingOutgoingKnocks.set(targetCode, {
      requestedAt: Date.now(),
      announcerPeerId: knownSrv?.announcerPeerId || null,
    });

    const store = serverService.getServerStore();
    const localTarget = await store.getServerByRoomCode(targetCode);

    if (localTarget) {
      return await this.handleIncomingKnock(sanitizedPayload);
    }

    await this.ensureDiscoverSwarm();
    this._broadcastDiscover("onicord:knock-request", sanitizedPayload);

    return { success: true };
  }

  async handleKnockApproved(payload, roomManagerArg = null) {
    if (!payload?.roomCode) return false;
    const targetCode = sanitizeString(payload.roomCode, LIMITS.roomCode).toUpperCase();
    const roomManager = roomManagerArg || global.roomManager;
    const myProfile = roomManager?.profile || roomManager?.p2pService?.profile;
    const myId = myProfile?.id;
    if (!myId || payload.applicantId !== myId || !targetCode) return false;

    this._prunePendingOutgoingKnocks();
    const pending = this.pendingOutgoingKnocks.get(targetCode);
    if (!pending) {
      console.warn(`[DiscoverService] Ignorado knock-approved no solicitado para ${targetCode}`);
      return false;
    }
    this.pendingOutgoingKnocks.delete(targetCode);

    const serverName = payload.serverName || payload.serverData?.name || targetCode;
    const secretFromPayload =
      typeof payload.roomSecret === "string" && payload.roomSecret.trim() ? payload.roomSecret.trim() : null;
    try {
      await serverService.joinServer(targetCode, serverName, myProfile, secretFromPayload);
      roomManager?.connectToRoom(targetCode, false, myProfile, { isBackground: true }).catch(() => {});
    } catch (joinErr) {
      console.error("[DiscoverService] Error auto-joining approved server:", joinErr.message);
    }
    global.mainWindow?.webContents.send("plugins:show-toast", {
      title: "¡Solicitud Aprobada!",
      message: `Tu solicitud para unirte a "${serverName}" ha sido aprobada.`,
      type: "success",
    });
    global.mainWindow?.webContents.send("discover:knock-status-changed", {
      roomCode: targetCode,
      status: "approved",
      serverName,
    });
    return true;
  }

  async handleKnockRejected(payload, roomManagerArg = null) {
    if (!payload?.roomCode) return false;
    const targetCode = sanitizeString(payload.roomCode, LIMITS.roomCode).toUpperCase();
    const roomManager = roomManagerArg || global.roomManager;
    const myId = roomManager?.profile?.id || roomManager?.p2pService?.profile?.id;
    if (!myId || payload.applicantId !== myId || !targetCode) return false;

    this._prunePendingOutgoingKnocks();
    const pending = this.pendingOutgoingKnocks.get(targetCode);
    if (!pending) {
      console.warn(`[DiscoverService] Ignorado knock-rejected no solicitado para ${targetCode}`);
      return false;
    }
    this.pendingOutgoingKnocks.delete(targetCode);

    global.mainWindow?.webContents.send("plugins:show-toast", {
      title: "Solicitud Rechazada",
      message: `Tu solicitud para unirte al servidor ${targetCode} fue rechazada.`,
      type: "warning",
    });
    global.mainWindow?.webContents.send("discover:knock-status-changed", {
      roomCode: targetCode,
      status: "rejected",
    });
    return true;
  }

  async handleIncomingKnock(payload) {
    const targetCode = sanitizeString(payload.roomCode || "", LIMITS.roomCode).toUpperCase();
    if (!targetCode) return { success: false, error: "Código inválido" };

    const applicantId = sanitizeString(payload.applicant?.id, 64);
    if (!applicantId) return { success: false, error: "ID inválido" };

    try {
      const store = serverService.getServerStore();
      const server = await store.getServerByRoomCode(targetCode);
      if (!server) return { success: false, error: "Servidor no encontrado" };

      // Verify that the local user is the server owner or has admin / manage_server permissions
      const profileService = require("./profileService.cjs");
      const localUserId =
        profileService.activeProfile?.id ||
        global.roomManager?.profile?.id ||
        global.roomManager?.p2pService?.profile?.id ||
        null;
      const { RoomMetaStore, checkAdminPermission } = require("../p2p/roomMetaStore.cjs");
      const roomMetaStore =
        global.roomManager?.roomMetaStore || new RoomMetaStore(this._getUserDataPath());
      const meta = await roomMetaStore.load(targetCode);

      const isOwner = Boolean(
        server.isOwner ||
        (localUserId &&
          (server.ownerId === localUserId ||
            server.creatorId === localUserId ||
            server.creatorID === localUserId ||
            meta?.ownerId === localUserId ||
            meta?.creatorId === localUserId ||
            meta?.creatorID === localUserId))
      );

      let hasAdminOrManagePerm = false;
      if (localUserId && meta) {
        if (checkAdminPermission(meta, localUserId)) {
          hasAdminOrManagePerm = true;
        } else if (meta.roles && meta.userRoles?.[localUserId]) {
          const uRoles = meta.userRoles[localUserId];
          const roleIds = Array.isArray(uRoles) ? uRoles : [uRoles];
          for (const rId of roleIds) {
            const role = meta.roles.find((r) => r.id === rId);
            if (
              role?.permissions &&
              (role.permissions.admin === true || role.permissions.manage_server === true)
            ) {
              hasAdminOrManagePerm = true;
              break;
            }
          }
        }
      }

      if (!isOwner && !hasAdminOrManagePerm) {
        return { success: false, ignored: true, error: "Sin permisos de administrador" };
      }

      // Rate-limiting check: Prevent flooding from same applicant
      const now = Date.now();
      const lastKnock = this.knockRateLimits.get(applicantId) || 0;
      if (now - lastKnock < KNOCK_RATE_LIMIT_MS) {
        console.warn(`[DiscoverService] Rate-limit activo: knock bloqueado para ${applicantId}`);
        return { success: false, error: "Espera un momento antes de volver a solicitar." };
      }
      this.knockRateLimits.set(applicantId, now);

      const conf = server.discoverConfig || {
        enabled: true,
        accessMode: "approval",
        pendingRequests: [],
      };

      const existingRequests = Array.isArray(conf.pendingRequests) ? conf.pendingRequests : [];

      // Queue Cap Check: Prevent disk exhaustion DoS
      if (existingRequests.length >= MAX_PENDING_REQUESTS_PER_SERVER) {
        console.warn(`[DiscoverService] Servidor ${targetCode} tiene la cola de solicitudes llena (${MAX_PENDING_REQUESTS_PER_SERVER}).`);
        return { success: false, error: "La lista de solicitudes de este servidor está llena." };
      }

      const alreadyPending = existingRequests.some((r) => r.applicant?.id === applicantId);
      if (alreadyPending) {
        return { success: true, message: "Solicitud ya pendiente." };
      }

      const sanitizedApplicant = {
        id: applicantId,
        nickname: sanitizeString(payload.applicant?.nickname || payload.applicant?.username, LIMITS.applicantName, "Usuario P2P"),
        avatar: sanitizeImage(payload.applicant?.avatar),
      };

      const knockEntry = {
        applicant: sanitizedApplicant,
        message: sanitizeString(payload.message, LIMITS.knockMessage, null),
        timestamp: now,
      };

      const updatedRequests = [
        ...existingRequests,
        knockEntry,
      ];

      const updatedServer = await serverService.updateServer(
        server.id,
        {
          discoverConfig: {
            ...conf,
            pendingRequests: updatedRequests,
          },
        },
        global.roomManager
      );

      // Debounce toast notifications so admin's UI is not frozen by rapid notifications
      if (now - this.lastToastNotification > TOAST_THROTTLE_MS) {
        this.lastToastNotification = now;
        this._broadcast("plugins:show-toast", {
          titleKey: "discover.toastKnockTitle",
          messageKey: "discover.toastKnockMsg",
          messageParams: { applicant: sanitizedApplicant.nickname, server: server.name },
          type: "info",
        });
      }

      this._broadcast("discover:knock-received", {
        roomCode: targetCode,
        ...knockEntry,
      });
      this._broadcast("server:updated", updatedServer);
      return { success: true };
    } catch (err) {
      console.error("[DiscoverService] Error procesando knock entrante:", err.message);
      return { success: false, error: err.message };
    }
  }

  async approveKnock(roomCode, applicant) {
    const targetCode = sanitizeString(roomCode, LIMITS.roomCode).toUpperCase();
    const applicantId = sanitizeString(applicant?.id, 64);
    if (!targetCode || !applicantId) return { success: false, error: "Datos inválidos" };

    try {
      const store = serverService.getServerStore();
      const server = await store.getServerByRoomCode(targetCode);
      if (!server) return { success: false, error: "Servidor no encontrado" };

      const conf = server.discoverConfig || {};
      const currentPending = Array.isArray(conf.pendingRequests) ? conf.pendingRequests : [];
      const filteredPending = currentPending.filter((r) => r.applicant?.id !== applicantId);

      // Add applicant to server's savedMembers safely
      const savedMembers = { ...(server.savedMembers || {}) };
      savedMembers[applicantId] = {
        id: applicantId,
        nickname: sanitizeString(applicant.nickname || applicant.username, LIMITS.applicantName, "Miembro"),
        avatar: sanitizeImage(applicant.avatar),
        joinedAt: Date.now(),
      };

      const updated = await serverService.updateServer(
        server.id,
        {
          savedMembers,
          discoverConfig: {
            ...conf,
            pendingRequests: filteredPending,
          },
        },
        global.roomManager
      );

      this._broadcast("server:updated", updated);

      await this.ensureDiscoverSwarm();
      this._broadcastDiscover("onicord:knock-approved", {
        roomCode: targetCode,
        applicantId: applicantId,
        serverName: sanitizeString(server.name, LIMITS.name),
        ...(server.roomSecret ? { roomSecret: server.roomSecret } : {}),
        timestamp: Date.now(),
      });

      return { success: true };
    } catch (err) {
      console.error("[DiscoverService] Error aprobando knock:", err.message);
      return { success: false, error: err.message };
    }
  }

  async rejectKnock(roomCode, applicant) {
    const targetCode = sanitizeString(roomCode, LIMITS.roomCode).toUpperCase();
    const applicantId = sanitizeString(applicant?.id, 64);
    if (!targetCode || !applicantId) return { success: false, error: "Datos inválidos" };

    try {
      const store = serverService.getServerStore();
      const server = await store.getServerByRoomCode(targetCode);
      if (!server) return { success: false, error: "Servidor no encontrado" };

      const conf = server.discoverConfig || {};
      const currentPending = Array.isArray(conf.pendingRequests) ? conf.pendingRequests : [];
      const filteredPending = currentPending.filter((r) => r.applicant?.id !== applicantId);

      const updated = await serverService.updateServer(
        server.id,
        {
          discoverConfig: {
            ...conf,
            pendingRequests: filteredPending,
          },
        },
        global.roomManager
      );

      this._broadcast("server:updated", updated);

      await this.ensureDiscoverSwarm();
      this._broadcastDiscover("onicord:knock-rejected", {
        roomCode: targetCode,
        applicantId: applicantId,
      });

      return { success: true };
    } catch (err) {
      console.error("[DiscoverService] Error rechazando knock:", err.message);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new DiscoverService();
