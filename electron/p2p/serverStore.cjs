const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const DEFAULT_CHANNELS = [
  { id: "general", type: "text", name: "general" },
  { id: "voice-lounge", type: "voice", name: "Voice Lounge" },
];

function safeParseJson(raw, filePathToRepair = null) {
  if (!raw || typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        let candidate = match[0];
        while (candidate.length > 0) {
          try {
            const parsed = JSON.parse(candidate);
            if (filePathToRepair) {
              try {
                const fsSync = require("fs");
                fsSync.writeFileSync(filePathToRepair, JSON.stringify(parsed, null, 2), "utf-8");
                console.log(`[ServerStore] Auto-repaired corrupted JSON file on disk: ${filePathToRepair}`);
              } catch (e) {}
            }
            return parsed;
          } catch {
            const lastBrace = candidate.lastIndexOf("}");
            if (lastBrace <= 0) break;
            candidate = candidate.slice(0, lastBrace);
          }
        }
      }
    } catch (e) {}
  }
  return null;
}

class ServerStore {
  constructor(userDataPath) {
    this.userDataPath = userDataPath;
    this.filePath = path.join(userDataPath, "servers.json");
    this.filesDir = path.join(userDataPath, "files");
    this._syncCache = new Map();
    this._writeQueue = Promise.resolve();
  }

  _updateSyncCache(servers) {
    if (Array.isArray(servers)) {
      for (const s of servers) {
        if (s && s.roomCode) {
          this._syncCache.set(String(s.roomCode).trim().toUpperCase(), s);
        }
      }
    }
  }

  getServerByRoomCodeSync(roomCode) {
    if (!roomCode) return null;
    const code = String(roomCode).trim().toUpperCase();
    if (this._syncCache.has(code)) {
      return this._syncCache.get(code);
    }
    try {
      const fsSync = require("fs");
      if (fsSync.existsSync(this.filePath)) {
        const raw = fsSync.readFileSync(this.filePath, "utf-8");
        const data = JSON.parse(raw);
        if (Array.isArray(data?.servers)) {
          this._updateSyncCache(data.servers);
          return this._findServer(data, code);
        }
      }
    } catch (e) {}
    return null;
  }

  async recoverMissingServersFromRoomMeta(data) {
    if (!data || !Array.isArray(data.servers)) return false;
    try {
      const fsSync = require("fs");
      const roomMetaDir = path.join(this.userDataPath, "room-meta");
      if (!fsSync.existsSync(roomMetaDir)) return false;

      const files = fsSync.readdirSync(roomMetaDir);
      let changed = false;

      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const roomCode = file.replace(".json", "").toUpperCase();
        const exists = data.servers.some(
          (s) => s.roomCode && String(s.roomCode).trim().toUpperCase() === roomCode
        );
        if (!exists) {
          try {
            const fullMetaPath = path.join(roomMetaDir, file);
            const raw = fsSync.readFileSync(fullMetaPath, "utf-8");
            const meta = safeParseJson(raw, fullMetaPath);
            if (meta && (meta.name || meta.roomCode)) {
              const recoveredServer = {
                id: roomCode,
                name: meta.name || `Servidor ${roomCode.slice(0, 4)}`,
                roomCode: roomCode,
                isOwner: meta.isOwner ?? true,
                ownerId: meta.ownerId || null,
                icon: meta.icon || null,
                banner: meta.banner || null,
                channels: Array.isArray(meta.channels) && meta.channels.length > 0 ? meta.channels : DEFAULT_CHANNELS.map((c) => ({ ...c })),
                lastChannelId: "general",
                metaVersion: meta.version || 1,
                metaUpdatedAt: meta.updatedAt || Date.now(),
                createdAt: Date.now(),
                lastVisitedAt: Date.now(),
                plugins: meta.plugins || [],
                roles: meta.roles || [],
                userRoles: meta.userRoles || {},
                disableFlameSystem: meta.disableFlameSystem ?? false,
                groupByRoles: meta.groupByRoles ?? false,
                allowExecutableFiles: meta.allowExecutableFiles ?? false,
              };
              data.servers.push(recoveredServer);
              changed = true;
              console.log(`[ServerStore] Restored server "${recoveredServer.name}" (${roomCode}) from room-meta backup!`);
            }
          } catch (e) {
            console.error(`[ServerStore] Error recovering server from ${file}:`, e);
          }
        }
      }

      if (changed) {
        await this._write(data);
      }
      return changed;
    } catch (err) {
      console.error("[ServerStore] Error recovering servers from room-meta:", err);
      return false;
    }
  }

  async _read() {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const data = safeParseJson(raw, this.filePath) || { servers: [], lastServerId: null };
      const rawServers = Array.isArray(data.servers) ? data.servers : [];
      let updated = false;

      const deduplicatedMap = new Map();

      for (const s of rawServers) {
        if (!s) continue;
        const cleanCode = String(s.roomCode || s.id || "").trim().toUpperCase();
        if (!cleanCode) continue;

        s.roomCode = cleanCode;
        s.id = cleanCode;
        if (s.allowExecutableFiles === undefined) {
          s.allowExecutableFiles = false;
        }

        if (deduplicatedMap.has(cleanCode)) {
          const prev = deduplicatedMap.get(cleanCode);
          // Merge duplicates keeping non-empty/most recent fields
          const merged = {
            ...prev,
            ...s,
            id: cleanCode,
            roomCode: cleanCode,
            name: (s.name && !s.name.startsWith("Servidor ")) ? s.name : prev.name,
            icon: s.icon || prev.icon || null,
            banner: s.banner || prev.banner || null,
            channels: (Array.isArray(s.channels) && s.channels.length > 0) ? s.channels : prev.channels,
            metaVersion: Math.max(s.metaVersion || 0, prev.metaVersion || 0),
            metaUpdatedAt: Math.max(s.metaUpdatedAt || 0, prev.metaUpdatedAt || 0),
            lastVisitedAt: Math.max(s.lastVisitedAt || 0, prev.lastVisitedAt || 0),
          };
          deduplicatedMap.set(cleanCode, merged);
          updated = true;
        } else {
          deduplicatedMap.set(cleanCode, s);
        }
      }

      const servers = Array.from(deduplicatedMap.values());
      if (servers.length !== rawServers.length) {
        updated = true;
      }
      data.servers = servers;

      this._updateSyncCache(servers);
      if (updated) {
        try {
          await this._write(data);
        } catch (e) {}
      }

      return {
        servers,
        lastServerId: data.lastServerId ?? null,
      };
    } catch {
      const fallbackData = { servers: [], lastServerId: null };
      await this.recoverMissingServersFromRoomMeta(fallbackData);
      return fallbackData;
    }
  }

  async _write(data) {
    if (data && data.servers) {
      this._updateSyncCache(data.servers);
    }

    this._writeQueue = this._writeQueue.then(async () => {
      const dir = path.dirname(this.filePath);
      await fs.mkdir(dir, { recursive: true });
      const tmpPath = `${this.filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
      const content = JSON.stringify(data, null, 2);
      await fs.writeFile(tmpPath, content, "utf8");
      try {
        await fs.rename(tmpPath, this.filePath);
      } catch (e) {
        try {
          await fs.copyFile(tmpPath, this.filePath);
          await fs.unlink(tmpPath).catch(() => {});
        } catch (e2) {}
      }
    }).catch(() => {});

    return this._writeQueue;
  }

  async list() {
    const data = await this._read();
    await this.recoverMissingServersFromRoomMeta(data);

    // Final safety deduplication before returning to UI
    const seen = new Set();
    const cleanList = [];
    for (const s of data.servers) {
      const code = String(s.roomCode || s.id || "").trim().toUpperCase();
      if (code && !seen.has(code)) {
        seen.add(code);
        cleanList.push(s);
      }
    }

    return cleanList.sort(
      (a, b) => (b.lastVisitedAt || 0) - (a.lastVisitedAt || 0),
    );
  }

  async getLastActive() {
    const data = await this._read();
    return data.lastServerId ?? null;
  }

  async setLastActive(serverId) {
    const data = await this._read();
    const exists = data.servers.some((s) => s.id === serverId);
    data.lastServerId = exists ? serverId : (data.servers[0]?.id ?? null);
    await this._write(data);
    return { ok: true, id: data.lastServerId };
  }

  _findServer(data, idOrCode) {
    if (!idOrCode || !data?.servers) return null;
    const str = String(idOrCode).trim();
    const upper = str.toUpperCase();
    return (
      data.servers.find(
        (s) =>
          s.id === str ||
          String(s.id).toUpperCase() === upper ||
          (s.roomCode && String(s.roomCode).trim().toUpperCase() === upper)
      ) ?? null
    );
  }

  async get(serverId) {
    const data = await this._read();
    return this._findServer(data, serverId);
  }

  async getByRoomCode(roomCode) {
    const data = await this._read();
    return this._findServer(data, roomCode);
  }

  async add({ name, roomCode, isOwner, ownerId }) {
    const data = await this._read();
    const code = String(roomCode).trim().toUpperCase();

    // First, attempt to restore missing servers from room-meta backup
    await this.recoverMissingServersFromRoomMeta(data);

    let existing = this._findServer(data, code);
    if (existing) {
      existing.lastVisitedAt = Date.now();
      if (name?.trim()) existing.name = name.trim().slice(0, 48);
      if (isOwner !== undefined) existing.isOwner = Boolean(isOwner);
      if (ownerId) existing.ownerId = ownerId;
      data.lastServerId = existing.id;
      await this._write(data);
      return existing;
    }

    // Try reading room-meta file directly as fallback to preserve settings
    let metaBackup = null;
    try {
      const fsSync = require("fs");
      const roomMetaPath = path.join(this.userDataPath, "room-meta", `${code}.json`);
      if (fsSync.existsSync(roomMetaPath)) {
        metaBackup = JSON.parse(fsSync.readFileSync(roomMetaPath, "utf-8"));
      }
    } catch (e) {}

    const server = {
      id: code,
      name: (name || metaBackup?.name || `Servidor ${code.slice(0, 4)}`).trim().slice(0, 48),
      roomCode: code,
      isOwner: isOwner !== undefined ? Boolean(isOwner) : (metaBackup?.isOwner ?? true),
      ownerId: ownerId || metaBackup?.ownerId || null,
      icon: metaBackup?.icon || null,
      banner: metaBackup?.banner || null,
      channels: Array.isArray(metaBackup?.channels) && metaBackup.channels.length > 0 ? metaBackup.channels : DEFAULT_CHANNELS.map((c) => ({ ...c })),
      lastChannelId: "general",
      metaVersion: metaBackup?.version || (isOwner ? 1 : 0),
      metaUpdatedAt: metaBackup?.updatedAt || (isOwner ? Date.now() : 0),
      createdAt: Date.now(),
      lastVisitedAt: Date.now(),
      plugins: metaBackup?.plugins || [],
      roles: metaBackup?.roles || [],
      userRoles: metaBackup?.userRoles || {},
      disableFlameSystem: metaBackup?.disableFlameSystem || false,
      groupByRoles: metaBackup?.groupByRoles || false,
      allowExecutableFiles: metaBackup?.allowExecutableFiles || false,
      iceServers: metaBackup?.iceServers || [],
      directConnectionEnabled: metaBackup?.directConnectionEnabled || false,
      directIP: metaBackup?.directIP || "",
      directPort: metaBackup?.directPort || 7777,
    };

    data.servers.push(server);
    data.lastServerId = server.id;
    await this._write(data);

    const serverFilesDir = path.join(this.filesDir, code);
    await fs.mkdir(serverFilesDir, { recursive: true });

    return server;
  }

  async touch(serverId, patch = {}) {
    const data = await this._read();
    const server = this._findServer(data, serverId);
    if (!server) return null;

    if (patch.lastChannelId) server.lastChannelId = patch.lastChannelId;
    if (patch.name?.trim()) server.name = patch.name.trim().slice(0, 48);
    server.lastVisitedAt = Date.now();
    data.lastServerId = server.id;
    await this._write(data);
    return server;
  }

  async remove(serverId) {
    const data = await this._read();
    const server = this._findServer(data, serverId);
    if (server) {
      data.servers = data.servers.filter((s) => s.id !== server.id);
      if (data.lastServerId === server.id) {
        data.lastServerId = data.servers[0]?.id ?? null;
      }
      await this._write(data);

      if (server.roomCode) {
        const code = String(server.roomCode).trim().toUpperCase();
        try {
          const fsSync = require("fs");
          const roomMetaPath = path.join(this.userDataPath, "room-meta", `${code}.json`);
          const serverFilesDir = path.join(this.filesDir, code);

          if (fsSync.existsSync(roomMetaPath)) {
            fsSync.rmSync(roomMetaPath, { force: true });
          }
          if (fsSync.existsSync(serverFilesDir)) {
            fsSync.rmSync(serverFilesDir, { recursive: true, force: true });
          }
          console.log(`[ServerStore] Completely purged server ${code} (room-meta & files) from disk.`);
        } catch (e) {
          console.error(`[ServerStore] Error purging disk files for server ${code}:`, e);
        }
      }
    }
    return { ok: true };
  }

  getFilesDir(roomCode) {
    return path.join(this.filesDir, String(roomCode).trim().toUpperCase());
  }

  async updateSettings(serverId, settings) {
    const data = await this._read();
    await this.recoverMissingServersFromRoomMeta(data);
    let server = this._findServer(data, serverId);
    if (!server) {
      console.warn(`[ServerStore] updateSettings: Server ${serverId} not found locally — trying recovery...`);
      await this.recoverMissingServersFromRoomMeta(data);
      server = this._findServer(data, serverId);
      if (!server) {
        console.error(`[ServerStore] updateSettings: Server ${serverId} could not be recovered.`);
        return null;
      }
    }

    if (settings.name?.trim()) server.name = settings.name.trim().slice(0, 48);
    if (settings.icon !== undefined) server.icon = settings.icon;
    if (settings.banner !== undefined) server.banner = settings.banner;

    if (Array.isArray(settings.roles)) server.roles = settings.roles;
    if (settings.userRoles) server.userRoles = settings.userRoles;
    if (settings.music !== undefined) server.music = settings.music;
    if (settings.disableFlameSystem !== undefined) server.disableFlameSystem = settings.disableFlameSystem;
    if (settings.groupByRoles !== undefined) server.groupByRoles = settings.groupByRoles;
    if (settings.allowExecutableFiles !== undefined) server.allowExecutableFiles = settings.allowExecutableFiles;
    if (Array.isArray(settings.iceServers)) server.iceServers = settings.iceServers;
    if (settings.directConnectionEnabled !== undefined) server.directConnectionEnabled = settings.directConnectionEnabled;
    if (settings.directIP !== undefined) server.directIP = settings.directIP;
    if (settings.directPort !== undefined) server.directPort = settings.directPort;
    if (settings.ownerId !== undefined) server.ownerId = settings.ownerId;
    if (Array.isArray(settings.bannedUsers)) server.bannedUsers = settings.bannedUsers;
    if (settings.kickedUsers !== undefined) server.kickedUsers = settings.kickedUsers;
    if (Array.isArray(settings.plugins)) server.plugins = settings.plugins;

    if (Array.isArray(settings.channels)) {
      server.channels = settings.channels.map((c) => {
        const isCat = c.type === "category" || String(c.id).startsWith("cat-");
        return {
          id: c.id,
          type: isCat ? "category" : c.type === "voice" ? "voice" : "text",
          name: String(c.name ?? "")
            .trim()
            .slice(0, 32),
          parentId: c.parentId ?? null,
        };
      });
    }
    server.metaVersion = (server.metaVersion || 1) + 1;
    server.metaUpdatedAt = Date.now();
    await this._write(data);
    return server;
  }

  async applySyncedMeta(roomCode, meta) {
    if (!meta?.version) return null;
    const code = String(roomCode).trim().toUpperCase();
    const data = await this._read();
    const server = data.servers.find((s) => s.roomCode === code);
    if (!server) return null;

    // FIX 2: Authority validation already happened in RoomMetaStore.merge().
    // onServerMetaUpdated is only called after merge() accepted the data,
    // so we always apply here without repeating the version check, which
    // avoids divergence between room-meta/*.json and servers.json.
    if (meta.name) server.name = meta.name;
    if (meta.icon !== undefined) server.icon = meta.icon;
    if (meta.banner !== undefined) server.banner = meta.banner;
    if (Array.isArray(meta.channels)) server.channels = meta.channels;

    if (Array.isArray(meta.roles)) server.roles = meta.roles;
    if (meta.userRoles) server.userRoles = meta.userRoles;
    if (Array.isArray(meta.plugins)) server.plugins = meta.plugins;
    // FIX 3: Use !== undefined so null values (clearing music) are applied.
    if (meta.music !== undefined) server.music = meta.music;
    if (meta.disableFlameSystem !== undefined) server.disableFlameSystem = meta.disableFlameSystem;
    if (meta.groupByRoles !== undefined) server.groupByRoles = meta.groupByRoles;
    if (meta.allowExecutableFiles !== undefined) server.allowExecutableFiles = meta.allowExecutableFiles;
    // FIX 3: Use Array.isArray so an empty [] properly clears custom ICE servers.
    if (Array.isArray(meta.iceServers)) server.iceServers = meta.iceServers;
    if (meta.directConnectionEnabled !== undefined) server.directConnectionEnabled = meta.directConnectionEnabled;
    if (meta.directIP !== undefined) server.directIP = meta.directIP;
    if (meta.directPort !== undefined) server.directPort = meta.directPort;
    if (meta.ownerId) server.ownerId = meta.ownerId;
    if (Array.isArray(meta.bannedUsers)) server.bannedUsers = meta.bannedUsers;
    if (meta.kickedUsers) server.kickedUsers = meta.kickedUsers;
    if (Array.isArray(meta.auditLog)) server.auditLog = meta.auditLog;

    server.metaVersion = meta.version;
    server.metaUpdatedAt = meta.updatedAt;
    await this._write(data);
    return server;
  }
}

module.exports = { ServerStore, DEFAULT_CHANNELS };
