const http = require("http");
const path = require("path");
const diagService = require("./diagService.cjs");

class McpBridgeService {
  constructor() {
    this.port = parseInt(process.env.ONICORD_MCP_PORT || "42884", 10);
    this.activePort = null;
    this.server = null;
  }

  start(attemptPort = null) {
    if (this.server) return;
    const targetPort = attemptPort || this.port;

    const server = http.createServer((req, res) => {
      // Allow local CORS
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed. Use POST." }));
        return;
      }

      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 5 * 1024 * 1024) {
          req.destroy();
        }
      });

      req.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}");
          const { method, params } = payload;
          const result = await this.handleMethod(method, params || {});
          const instanceInfo = this._getInstanceInfo();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, instanceInfo, result }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, instanceInfo: this._getInstanceInfo(), error: err.message, stack: err.stack }));
        }
      });
    });

    server.once("error", (err) => {
      if (err.code === "EADDRINUSE" && targetPort < 42894) {
        console.log(`[Onicord MCP Bridge 🔄] Port ${targetPort} in use by another instance. Trying ${targetPort + 1}...`);
        this.server = null;
        this.start(targetPort + 1);
      } else {
        console.warn(`[Onicord MCP Bridge ⚠️] Bridge server error on port ${targetPort}: ${err.message}`);
      }
    });

    server.listen(targetPort, "127.0.0.1", () => {
      this.activePort = targetPort;
      this.server = server;
      console.log(`[Onicord MCP Bridge 🔌] Listening on http://127.0.0.1:${targetPort} (${this._getInstanceInfo().nickname})`);
    });
  }

  _getInstanceInfo() {
    const p2p = global.roomManager?.p2pService;
    return {
      port: this.activePort,
      nickname: p2p?.profile?.nickname || "Unknown",
      peerId: p2p?.profile?.peerId || null,
      userDataDir: process.argv.find((a) => a.startsWith("--user-data-dir=")) || "default",
    };
  }

  async handleMethod(method, params) {
    switch (method) {
      case "get_live_logs": {
        const { limit = 100, category, level, search } = params;
        let logs = diagService.getLocalLogs();

        if (category) {
          const catLower = category.toLowerCase();
          logs = logs.filter((l) => (l.category || "").toLowerCase() === catLower);
        }
        if (level) {
          const levelLower = level.toLowerCase();
          logs = logs.filter((l) => (l.level || "").toLowerCase() === levelLower);
        }
        if (search) {
          const searchLower = search.toLowerCase();
          logs = logs.filter((l) => (l.message || "").toLowerCase().includes(searchLower));
        }

        const boundedLogs = logs.slice(-Math.abs(limit));
        return { count: boundedLogs.length, totalInMemory: logs.length, logs: boundedLogs };
      }

      case "request_peer_logs": {
        const { target } = params;
        if (!global.roomManager || !global.roomManager.p2pService) {
          throw new Error("No active room manager or P2P service.");
        }
        const p2p = global.roomManager.p2pService;
        let targetPeerId = target;

        if (target && p2p.peers) {
          for (const [id, peerObj] of p2p.peers.entries()) {
            if (peerObj.profile?.nickname?.toLowerCase() === target.toLowerCase()) {
              targetPeerId = id;
              break;
            }
          }
        }

        if (!targetPeerId) {
          throw new Error(`Peer "${target}" not found in current connected peers.`);
        }

        const logData = await p2p.requestPeerLogs(targetPeerId);
        return { peerId: targetPeerId, logData };
      }

      case "clear_logs": {
        diagService.clearLogs();
        return { cleared: true };
      }

      case "get_webrtc_stats": {
        if (!global.mainWindow || global.mainWindow.webContents.isDestroyed()) {
          return { activeVoice: false, peers: [], reason: "Window renderer not available" };
        }

        try {
          const stats = await global.mainWindow.webContents.executeJavaScript(`
            (() => {
              const vm = window.voiceManager;
              if (!vm) return { activeVoice: false, peers: [] };

              const peersInfo = [];
              if (vm.peers) {
                for (const [peerId, peer] of vm.peers.entries()) {
                  if (!peer) continue;
                  const receivers = peer._pc ? peer._pc.getReceivers().map(r => ({ kind: r.track?.kind, readyState: r.track?.readyState, enabled: r.track?.enabled, muted: r.track?.muted })) : [];
                  peersInfo.push({
                    peerId,
                    connectionState: peer._pc ? peer._pc.connectionState : "unknown",
                    iceConnectionState: peer._pc ? peer._pc.iceConnectionState : "unknown",
                    destroyed: Boolean(peer.destroyed),
                    receivers,
                    liveStats: peer.liveStats || {},
                    volume: vm.getPeerVolume ? vm.getPeerVolume(peerId) : 100,
                  });
                }
              }

              return {
                activeVoice: Boolean(vm.localStream),
                channelId: vm.channelId || null,
                localPeerId: vm.localPeerId || null,
                topology: vm.networkTopology || "mesh",
                isStreaming: Boolean(vm.localVideoStream && vm.localVideoStream.getVideoTracks().some(t => t.enabled)),
                peerCount: peersInfo.length,
                peers: peersInfo,
              };
            })()
          `);
          return stats;
        } catch (jsErr) {
          return { activeVoice: false, error: jsErr.message };
        }
      }

      case "get_app_state": {
        const p2p = global.roomManager?.p2pService;
        let rendererVoiceActive = false;

        if (global.mainWindow && !global.mainWindow.webContents.isDestroyed()) {
          try {
            rendererVoiceActive = await global.mainWindow.webContents.executeJavaScript(
              `Boolean(window.voiceManager?.localStream)`
            );
          } catch (e) {}
        }

        return {
          roomActive: Boolean(global.roomManager?.activeRoomCode),
          roomCode: global.roomManager?.activeRoomCode || null,
          localProfile: p2p?.profile || null,
          connectedP2pPeers: p2p?.peers ? [...p2p.peers.keys()] : [],
          voiceActive: rendererVoiceActive,
        };
      }

      case "trigger_action": {
        const { action, shortcut } = params;
        if (!action) throw new Error("Missing action parameter.");

        if (global.mainWindow && !global.mainWindow.webContents.isDestroyed()) {
          global.mainWindow.webContents.send("onicord:mcp-trigger-action", { action, shortcut });
        }

        return { triggered: true, action, shortcut };
      }

      case "send_input_event": {
        const { type, keyCode, modifiers } = params;
        if (!global.mainWindow || global.mainWindow.webContents.isDestroyed()) {
          throw new Error("Main window not available.");
        }
        global.mainWindow.webContents.sendInputEvent({
          type: type || "keyDown",
          keyCode: keyCode || "Control",
          modifiers: modifiers || [],
        });
        return { sent: true, type, keyCode };
      }

      case "join_voice_channel": {
        const { channelId } = params;
        if (!channelId) throw new Error("Missing channelId parameter.");
        if (global.mainWindow && !global.mainWindow.webContents.isDestroyed()) {
          global.mainWindow.webContents.send("voice:join-channel", channelId);
        }
        return { joining: true, channelId };
      }

      case "leave_voice_channel": {
        if (global.mainWindow && !global.mainWindow.webContents.isDestroyed()) {
          global.mainWindow.webContents.send("voice:leave-channel");
        }
        return { leaving: true };
      }

      case "toggle_media": {
        const { action } = params;
        if (global.mainWindow && !global.mainWindow.webContents.isDestroyed()) {
          global.mainWindow.webContents.send("voice:toggle-media", action);
        }
        return { toggling: true, action };
      }

      default:
        throw new Error(`Unknown MCP Bridge method: "${method}"`);
    }
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

module.exports = new McpBridgeService();
