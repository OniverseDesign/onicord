const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const serverService = require("./serverService.cjs");

// =========================================================================
// SECURITY LIMITS & CONSTANTS
// =========================================================================
const MAX_CACHED_SERVERS = 300;
const MAX_PENDING_REQUESTS_PER_SERVER = 25;
const KNOCK_RATE_LIMIT_MS = 2 * 60 * 1000; // 2 minutes between knocks from same applicant
const ANNOUNCE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TOAST_THROTTLE_MS = 4000; // 4 seconds between knock toasts to prevent UI freeze

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
          const { CasStore } = require("../storage/casStore.cjs");
          return CasStore.getInstance(app.getPath("userData")).storeDataUri(trimmed);
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
    this.discoveredServers = new Map(); // roomCode -> serverMeta
    this.knockRateLimits = new Map(); // applicantId -> timestamp
    this.lastToastNotification = 0;
    this.saveTimeout = null;
    this.announceInterval = null;
    this.isInitialized = false;
  }

  _getDiscoverDb() {
    const { DbManager } = require("../storage/dbManager.cjs");
    return DbManager.getInstance(app.getPath("userData")).getGlobalDb("discover");
  }

  _loadCache() {
    try {
      const db = this._getDiscoverDb();
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
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
  }

  init() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    this._loadCache();

    // Heartbeat: sync local public servers and broadcast discoveries every 60 seconds
    this.announceInterval = setInterval(() => {
      this.syncAndAnnounceLocalServers();
    }, 60000);

    // Initial check right after startup
    setTimeout(() => {
      this.syncAndAnnounceLocalServers();
    }, 500);

    console.log("[DiscoverService] Servicio nativo de descubrimiento P2P inicializado con blindaje de seguridad.");
  }

  async syncAndAnnounceLocalServers(targetPeerId = null) {
    try {
      const allServers = await serverService.listServers();
      let hasChanges = false;

      for (const s of allServers) {
        const conf = s.discoverConfig;
        const code = s.roomCode ? String(s.roomCode).toUpperCase().trim() : null;
        if (!code) continue;

        if (conf?.enabled) {
          const srvMeta = {
            roomCode: code,
            name: s.name,
            icon: s.icon || null,
            banner: s.banner || null,
            description: conf.description || s.description || "",
            category: conf.category || "General",
            tags: Array.isArray(conf.tags) ? conf.tags : [],
            accessMode: conf.accessMode || "public",
            memberCount: s.savedMembers ? Object.keys(s.savedMembers).length : 1,
            lastSeen: Date.now(),
          };

          await this.handleIncomingAnnouncement(srvMeta, true);

          // Broadcast through P2P room manager if connected
          if (global.roomManager?.p2pService) {
            if (targetPeerId) {
              global.roomManager.p2pService._sendToPeer(targetPeerId, "onicord:discover-announce", srvMeta);
            } else {
              global.roomManager.p2pService._broadcast("onicord:discover-announce", srvMeta);
            }
          }
        } else {
          // If discover is disabled, ensure the server is immediately removed from discovered servers & cache
          if (this.discoveredServers.has(code)) {
            this.discoveredServers.delete(code);
            hasChanges = true;
            if (global.roomManager?.p2pService) {
              global.roomManager.p2pService._broadcast("onicord:discover-unannounce", { roomCode: code });
            }
          }
        }
      }

      // If replying to a specific peer (e.g. on profile handshake or discover-request), also share known cached discoveries
      if (targetPeerId && global.roomManager?.p2pService) {
        for (const srv of this.getDiscoveredServers()) {
          global.roomManager.p2pService._sendToPeer(targetPeerId, "onicord:discover-announce", srv);
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
      if (global.roomManager?.p2pService) {
        global.roomManager.p2pService._broadcast("onicord:discover-request", { timestamp: Date.now() });
      }
    } catch (_) {}
  }

  async handleIncomingAnnouncement(serverMeta, isLocalOrigin = false) {
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
          // If we own or host this server locally, never allow external announcements to overwrite it
          return;
        }
      } catch (_) {}
    }

    // Sanitize all incoming fields strictly
    const sanitized = {
      roomCode: rawCode,
      name: sanitizeString(serverMeta.name, LIMITS.name, `Servidor ${rawCode}`),
      description: sanitizeString(serverMeta.description, LIMITS.description, ""),
      category: sanitizeString(serverMeta.category, LIMITS.category, "General"),
      tags: sanitizeTags(serverMeta.tags),
      accessMode: serverMeta.accessMode === "approval" ? "approval" : "public",
      memberCount: Math.min(Math.max(1, parseInt(serverMeta.memberCount, 10) || 1), 1000000),
      icon: sanitizeImage(serverMeta.icon),
      banner: sanitizeImage(serverMeta.banner),
      lastSeen: Date.now(),
    };

    // Cache Quota / LRU Eviction: prevent unbounded growth
    if (this.discoveredServers.size >= MAX_CACHED_SERVERS && !this.discoveredServers.has(rawCode)) {
      // Find and remove oldest entries
      const entries = Array.from(this.discoveredServers.entries()).sort(
        (a, b) => (a[1].lastSeen || 0) - (b[1].lastSeen || 0)
      );
      const toRemove = entries.slice(0, 10); // Prune batch of 10
      for (const [key] of toRemove) {
        this.discoveredServers.delete(key);
      }
    }

    this.discoveredServers.set(rawCode, sanitized);
    this._saveCacheDebounced();
    this._broadcast("plugins:discover-servers-updated", this.getDiscoveredServers());
  }

  getDiscoveredServers() {
    const now = Date.now();
    const list = [];
    for (const [code, srv] of this.discoveredServers.entries()) {
      if (srv.lastSeen && now - srv.lastSeen < ANNOUNCE_EXPIRY_MS) {
        list.push(srv);
      } else {
        // Expire naturally
        this.discoveredServers.delete(code);
      }
    }
    return list;
  }

  async sendKnockRequest(payload) {
    if (!payload?.roomCode) return { success: false, error: "Falta roomCode" };

    const targetCode = sanitizeString(payload.roomCode, LIMITS.roomCode).toUpperCase();
    if (!targetCode) return { success: false, error: "Código inválido" };

    // Sanitize applicant payload before transmitting
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

    const store = serverService.getServerStore();
    const localTarget = await store.getServerByRoomCode(targetCode);

    // If local target exists, process directly
    if (localTarget) {
      return await this.handleIncomingKnock(sanitizedPayload);
    }

    // Broadcast across P2P swarm (do not restrict to targetCode since applicant is not in targetCode yet)
    if (global.roomManager?.p2pService) {
      global.roomManager.p2pService._broadcast("onicord:knock-request", sanitizedPayload);
    }

    return { success: true };
  }

  async handleIncomingKnock(payload) {
    const targetCode = sanitizeString(payload.roomCode || "", LIMITS.roomCode).toUpperCase();
    if (!targetCode) return { success: false, error: "Código inválido" };

    const applicantId = sanitizeString(payload.applicant?.id, 64);
    if (!applicantId) return { success: false, error: "ID inválido" };

    // Rate-limiting check: Prevent flooding from same applicant
    const now = Date.now();
    const lastKnock = this.knockRateLimits.get(applicantId) || 0;
    if (now - lastKnock < KNOCK_RATE_LIMIT_MS) {
      console.warn(`[DiscoverService] Rate-limit activo: knock bloqueado para ${applicantId}`);
      return { success: false, error: "Espera un momento antes de volver a solicitar." };
    }
    this.knockRateLimits.set(applicantId, now);

    try {
      const store = serverService.getServerStore();
      const server = await store.getServerByRoomCode(targetCode);
      if (!server) return { success: false, error: "Servidor no encontrado" };

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

      const updatedRequests = [
        ...existingRequests,
        {
          applicant: sanitizedApplicant,
          message: sanitizeString(payload.message, LIMITS.knockMessage, null),
          timestamp: now,
        },
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

      // Emit approval to applicant peer over P2P (do not filter by targetCode since applicant is not yet in the room)
      if (global.roomManager?.p2pService) {
        global.roomManager.p2pService._broadcast(
          "onicord:knock-approved",
          {
            roomCode: targetCode,
            applicantId: applicantId,
            serverName: sanitizeString(server.name, LIMITS.name),
            timestamp: Date.now(),
          }
        );
      }

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

      if (global.roomManager?.p2pService) {
        global.roomManager.p2pService._broadcast(
          "onicord:knock-rejected",
          {
            roomCode: targetCode,
            applicantId: applicantId,
          }
        );
      }

      return { success: true };
    } catch (err) {
      console.error("[DiscoverService] Error rechazando knock:", err.message);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new DiscoverService();
