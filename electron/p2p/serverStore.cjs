const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const { DbManager } = require("../storage/dbManager.cjs");
const { CasStore } = require("../storage/casStore.cjs");
const { RoomMetaStore, DEFAULT_CHANNELS } = require("./roomMetaStore.cjs");

function safeParse(jsonStr, fallback) {
  if (!jsonStr || typeof jsonStr !== "string") return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}

class ServerStore {
  static _syncLookup = new Map(); // normalizedUserData -> Map<roomCode, server>
  static _locks = new Map();      // normalizedUserData -> Promise

  constructor(userDataPath) {
    this.userDataPath = path.resolve(userDataPath);
    this.filesDir = path.join(this.userDataPath, "files");
  }

  _dbMgr() {
    return DbManager.getInstance(this.userDataPath);
  }

  _cas() {
    return CasStore.getInstance(this.userDataPath);
  }

  _metaStore() {
    return new RoomMetaStore(this.userDataPath);
  }

  _withLock(fn) {
    const key = this.userDataPath.toLowerCase();
    const prev = ServerStore._locks.get(key) || Promise.resolve();
    const next = prev.then(() => fn(), () => fn());
    ServerStore._locks.set(
      key,
      next.catch((err) => {
        console.error("[ServerStore] Lock task error:", err);
      })
    );
    return next;
  }

  _getLocalProfileId() {
    try {
      const profileDb = this._dbMgr().getGlobalDb("profile");
      const row = profileDb.prepare("SELECT user_id FROM main_profile WHERE id = 1").get();
      return row?.user_id || null;
    } catch {
      return null;
    }
  }

  _assembleServerObjectSync(joinedRow) {
    const code = String(joinedRow.room_code).trim().toUpperCase();
    const meta = this._metaStore()._loadFromSqlSync(code);
    const extra = safeParse(joinedRow.extra_json, {});
    const localUserId = this._getLocalProfileId();

    const resolvedOwnerId = meta.ownerId || joinedRow.owner_id || null;
    const resolvedCreatorId =
      meta.creatorID || meta.creatorId || joinedRow.creator_id || resolvedOwnerId || null;
    const isOwner =
      localUserId && resolvedOwnerId
        ? resolvedOwnerId === localUserId
        : Boolean(joinedRow.is_owner);

    return {
      id: code,
      roomCode: code,
      name: (meta.name || joinedRow.name || `Servidor ${code.slice(0, 4)}`).trim().slice(0, 48),
      isOwner,
      ownerId: resolvedOwnerId,
      creatorId: resolvedCreatorId,
      creatorID: resolvedCreatorId,
      icon: meta.icon || joinedRow.icon_ref || null,
      banner: meta.banner || joinedRow.banner_ref || null,
      channels:
        Array.isArray(meta.channels) && meta.channels.length > 0
          ? meta.channels
          : DEFAULT_CHANNELS.map((c) => ({ ...c })),
      lastChannelId: joinedRow.last_read_channel_id || "general",
      metaVersion: Math.max(meta.version || 0, extra.metaVersion || 0),
      metaUpdatedAt: Math.max(meta.updatedAt || 0, extra.metaUpdatedAt || 0),
      createdAt: extra.createdAt || joinedRow.joined_at || Date.now(),
      joinedAt: joinedRow.joined_at || Date.now(),
      lastVisitedAt: joinedRow.last_visited_at || joinedRow.joined_at || Date.now(),
      plugins: Array.isArray(meta.plugins) ? meta.plugins : [],
      roles: Array.isArray(meta.roles) ? meta.roles : [],
      userRoles: meta.userRoles || {},
      bannedUsers: Array.isArray(meta.bannedUsers) ? meta.bannedUsers : [],
      kickedUsers: meta.kickedUsers || {},
      disableFlameSystem: Boolean(meta.disableFlameSystem),
      groupByRoles: Boolean(meta.groupByRoles),
      allowExecutableFiles: Boolean(meta.allowExecutableFiles),
      iceServers: Array.isArray(meta.iceServers) ? meta.iceServers : [],
      directConnectionEnabled: Boolean(meta.directConnectionEnabled),
      directIP: meta.directIP || "",
      directPort: meta.directPort || 7777,
      webhooks: Array.isArray(meta.webhooks) ? meta.webhooks : [],
      discoverConfig: meta.discoverConfig ?? null,
      defaultRoleSettings: meta.defaultRoleSettings ?? { enabled: false, roleId: null },
      welcomeSettings: meta.welcomeSettings ?? {
        enabled: false,
        channelId: null,
        template: "¡Bienvenido {user} a {server}! 🎉",
      },
      music: meta.music ?? null,
    };
  }

  _loadAllServersSync() {
    const dbMgr = this._dbMgr();
    const serversListDb = dbMgr.getGlobalDb("servers_list");
    const rows = serversListDb
      .prepare("SELECT * FROM joined_servers ORDER BY last_visited_at DESC")
      .all();

    const servers = rows.map((r) => this._assembleServerObjectSync(r));
    this._updateSyncCache(servers);
    return servers;
  }

  _updateSyncCache(servers) {
    const key = this.userDataPath.toLowerCase();
    const map = new Map();
    if (Array.isArray(servers)) {
      for (const s of servers) {
        if (s && s.roomCode) {
          map.set(String(s.roomCode).trim().toUpperCase(), s);
        }
      }
    }
    ServerStore._syncLookup.set(key, map);
  }

  getServerByRoomCodeSync(roomCode) {
    if (!roomCode) return null;
    const code = String(roomCode).trim().toUpperCase();
    const key = this.userDataPath.toLowerCase();
    const cachedMap = ServerStore._syncLookup.get(key);
    if (cachedMap && cachedMap.has(code)) {
      return cachedMap.get(code);
    }
    try {
      const serversListDb = this._dbMgr().getGlobalDb("servers_list");
      const row = serversListDb
        .prepare("SELECT * FROM joined_servers WHERE room_code = ?")
        .get(code);
      if (!row) return null;
      const srv = this._assembleServerObjectSync(row);
      if (!ServerStore._syncLookup.has(key)) {
        ServerStore._syncLookup.set(key, new Map());
      }
      ServerStore._syncLookup.get(key).set(code, srv);
      return srv;
    } catch {
      return null;
    }
  }

  _readServers() {
    return this._loadAllServersSync();
  }

  async list() {
    return this._withLock(async () => {
      return this._loadAllServersSync();
    });
  }

  async getLastActive() {
    return this._withLock(async () => {
      const serversListDb = this._dbMgr().getGlobalDb("servers_list");
      const navRow = serversListDb
        .prepare("SELECT value FROM navigation_state WHERE key = 'lastServerId'")
        .get();
      if (navRow?.value) {
        const exists = serversListDb
          .prepare("SELECT room_code FROM joined_servers WHERE room_code = ?")
          .get(navRow.value);
        if (exists) return navRow.value;
      }
      const firstRow = serversListDb
        .prepare("SELECT room_code FROM joined_servers ORDER BY last_visited_at DESC LIMIT 1")
        .get();
      return firstRow?.room_code || null;
    });
  }

  async setLastActive(serverId) {
    return this._withLock(async () => {
      const serversListDb = this._dbMgr().getGlobalDb("servers_list");
      const code = serverId ? String(serverId).trim().toUpperCase() : null;
      let nextId = null;
      if (code) {
        const matched = serversListDb
          .prepare("SELECT room_code FROM joined_servers WHERE room_code = ?")
          .get(code);
        if (matched) nextId = matched.room_code;
      }
      if (!nextId) {
        const first = serversListDb
          .prepare("SELECT room_code FROM joined_servers ORDER BY last_visited_at DESC LIMIT 1")
          .get();
        nextId = first?.room_code || null;
      }
      serversListDb
        .prepare("INSERT OR REPLACE INTO navigation_state (key, value) VALUES ('lastServerId', ?)")
        .run(nextId);
      return { ok: true, id: nextId };
    });
  }

  async get(serverId) {
    if (!serverId) return null;
    return this._withLock(async () => {
      const code = String(serverId).trim().toUpperCase();
      const serversListDb = this._dbMgr().getGlobalDb("servers_list");
      const row = serversListDb
        .prepare("SELECT * FROM joined_servers WHERE room_code = ?")
        .get(code);
      if (!row) return null;
      const srv = this._assembleServerObjectSync(row);
      const key = this.userDataPath.toLowerCase();
      if (!ServerStore._syncLookup.has(key)) {
        ServerStore._syncLookup.set(key, new Map());
      }
      ServerStore._syncLookup.get(key).set(code, srv);
      return { ...srv };
    });
  }

  async getByRoomCode(roomCode) {
    return this.get(roomCode);
  }

  async getServerByRoomCode(roomCode) {
    return this.get(roomCode);
  }

  async updateServer(serverId, patch) {
    return this.updateSettings(serverId, patch);
  }

  async add({ name, roomCode, isOwner, ownerId, creatorId, creatorID, icon, banner }) {
    return this._withLock(async () => {
      const code = String(roomCode).trim().toUpperCase();
      const now = Date.now();
      const cas = this._cas();
      const serversListDb = this._dbMgr().getGlobalDb("servers_list");
      const metaStore = this._metaStore();
      const existingMeta = metaStore._loadFromSqlSync(code);

      const iconRef = cas.storeDataUri(icon || existingMeta?.icon || null);
      const bannerRef = cas.storeDataUri(banner || existingMeta?.banner || null);

      const existingRow = serversListDb
        .prepare("SELECT * FROM joined_servers WHERE room_code = ?")
        .get(code);

      const localUserId = this._getLocalProfileId();
      const resolvedOwnerId = ownerId || existingMeta?.ownerId || existingRow?.owner_id || null;
      const resolvedCreatorId =
        creatorID ||
        creatorId ||
        existingMeta?.creatorID ||
        existingMeta?.creatorId ||
        existingRow?.creator_id ||
        resolvedOwnerId ||
        null;

      let resolvedIsOwner = false;
      if (isOwner !== undefined) {
        resolvedIsOwner = Boolean(isOwner);
      } else if (resolvedOwnerId && localUserId) {
        resolvedIsOwner = resolvedOwnerId === localUserId;
      } else if (existingRow) {
        resolvedIsOwner = Boolean(existingRow.is_owner);
      }

      const resolvedName = (
        (name && !name.trim().startsWith("Servidor ") ? name : null) ||
        existingMeta?.name ||
        existingRow?.name ||
        name ||
        `Servidor ${code.slice(0, 4)}`
      )
        .trim()
        .slice(0, 48);

      const extraObj = existingRow ? safeParse(existingRow.extra_json, {}) : {};
      if (!extraObj.createdAt) extraObj.createdAt = now;
      extraObj.metaVersion = Math.max(existingMeta?.version || 0, resolvedIsOwner ? 1 : 0);
      extraObj.metaUpdatedAt = Math.max(existingMeta?.updatedAt || 0, resolvedIsOwner ? now : 0);

      serversListDb
        .prepare(`
          INSERT OR REPLACE INTO joined_servers (
            room_code, name, icon_ref, banner_ref, owner_id, creator_id, is_owner,
            position, folder_id, muted, last_read_channel_id, joined_at, last_visited_at, extra_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          code,
          resolvedName,
          iconRef,
          bannerRef,
          resolvedOwnerId,
          resolvedCreatorId,
          resolvedIsOwner ? 1 : 0,
          existingRow?.position ?? 0,
          existingRow?.folder_id ?? null,
          existingRow?.muted ?? 0,
          existingRow?.last_read_channel_id || "general",
          now,
          now,
          JSON.stringify(extraObj)
        );

      serversListDb
        .prepare("INSERT OR REPLACE INTO navigation_state (key, value) VALUES ('lastServerId', ?)")
        .run(code);

      // Ensure server.db is initialized for this server
      if (!existingMeta || existingMeta.version === 0) {
        metaStore._saveToSqlSync(code, {
          ...existingMeta,
          roomCode: code,
          name: resolvedName,
          icon: iconRef,
          banner: bannerRef,
          ownerId: resolvedOwnerId,
          creatorID: resolvedCreatorId,
          creatorId: resolvedCreatorId,
          version: existingMeta?.version || (resolvedIsOwner ? 1 : 0),
          updatedAt: existingMeta?.updatedAt || (resolvedIsOwner ? now : 0),
        });
      }

      const serverFilesDir = path.join(this.filesDir, code);
      await fs.mkdir(serverFilesDir, { recursive: true }).catch(() => {});

      const all = this._loadAllServersSync();
      return all.find((s) => s.roomCode === code) || null;
    });
  }

  async touch(serverId, patch = {}) {
    return this._withLock(async () => {
      const code = String(serverId).trim().toUpperCase();
      const serversListDb = this._dbMgr().getGlobalDb("servers_list");
      const row = serversListDb
        .prepare("SELECT * FROM joined_servers WHERE room_code = ?")
        .get(code);
      if (!row) return null;

      const nextChannel = patch.lastChannelId || row.last_read_channel_id || "general";
      const nextName = patch.name?.trim() ? patch.name.trim().slice(0, 48) : row.name;
      const now = Date.now();

      serversListDb
        .prepare(`
          UPDATE joined_servers
          SET name = ?, last_read_channel_id = ?, last_visited_at = ?
          WHERE room_code = ?
        `)
        .run(nextName, nextChannel, now, code);

      serversListDb
        .prepare("INSERT OR REPLACE INTO navigation_state (key, value) VALUES ('lastServerId', ?)")
        .run(code);

      const all = this._loadAllServersSync();
      return all.find((s) => s.roomCode === code) || null;
    });
  }

  async remove(serverId) {
    return this._withLock(async () => {
      const targetCode = String(serverId || "").trim().toUpperCase();
      const dbMgr = this._dbMgr();
      const serversListDb = dbMgr.getGlobalDb("servers_list");

      serversListDb.prepare("DELETE FROM joined_servers WHERE room_code = ?").run(targetCode);

      const navRow = serversListDb
        .prepare("SELECT value FROM navigation_state WHERE key = 'lastServerId'")
        .get();
      if (navRow?.value === targetCode) {
        const nextRow = serversListDb
          .prepare("SELECT room_code FROM joined_servers ORDER BY last_visited_at DESC LIMIT 1")
          .get();
        serversListDb
          .prepare("INSERT OR REPLACE INTO navigation_state (key, value) VALUES ('lastServerId', ?)")
          .run(nextRow?.room_code || null);
      }

      if (targetCode && /^[A-F0-9]{8}$/.test(targetCode)) {
        try {
          RoomMetaStore.evictCache(this.userDataPath, targetCode);
        } catch {}

        try {
          dbMgr.purgeServerFolder(targetCode);
          const serverFilesDir = path.join(this.filesDir, targetCode);
          if (fsSync.existsSync(serverFilesDir)) {
            fsSync.rmSync(serverFilesDir, { recursive: true, force: true });
          }
          console.log(
            `[ServerStore] Completely purged server ${targetCode} (servers/${targetCode} SQLite DBs & files) from disk.`
          );
        } catch (e) {
          console.error(`[ServerStore] Error purging disk files for server ${targetCode}:`, e);
        }
      }

      this._loadAllServersSync();
      return { ok: true };
    });
  }

  getFilesDir(roomCode) {
    return path.join(this.filesDir, String(roomCode).trim().toUpperCase());
  }

  async updateSettings(serverId, settings) {
    return this._withLock(async () => {
      const code = String(serverId).trim().toUpperCase();
      const serversListDb = this._dbMgr().getGlobalDb("servers_list");
      const row = serversListDb
        .prepare("SELECT * FROM joined_servers WHERE room_code = ?")
        .get(code);
      if (!row) {
        console.warn(`[ServerStore] updateSettings: Server ${serverId} not found locally.`);
        return null;
      }

      const cas = this._cas();
      const metaStore = this._metaStore();
      const meta = metaStore._loadFromSqlSync(code);
      const now = Date.now();

      if (settings.name?.trim()) meta.name = settings.name.trim().slice(0, 48);
      if (settings.icon !== undefined) meta.icon = cas.storeDataUri(settings.icon);
      if (settings.banner !== undefined) meta.banner = cas.storeDataUri(settings.banner);
      if (Array.isArray(settings.roles)) meta.roles = settings.roles;
      if (settings.userRoles) meta.userRoles = settings.userRoles;
      if (settings.music !== undefined) meta.music = settings.music;
      if (settings.disableFlameSystem !== undefined)
        meta.disableFlameSystem = settings.disableFlameSystem;
      if (settings.groupByRoles !== undefined) meta.groupByRoles = settings.groupByRoles;
      if (settings.allowExecutableFiles !== undefined)
        meta.allowExecutableFiles = settings.allowExecutableFiles;
      if (Array.isArray(settings.iceServers)) meta.iceServers = settings.iceServers;
      if (settings.directConnectionEnabled !== undefined)
        meta.directConnectionEnabled = settings.directConnectionEnabled;
      if (settings.directIP !== undefined) meta.directIP = settings.directIP;
      if (settings.directPort !== undefined) meta.directPort = settings.directPort;
      if (settings.ownerId !== undefined) meta.ownerId = settings.ownerId;
      if (Array.isArray(settings.bannedUsers)) meta.bannedUsers = settings.bannedUsers;
      if (settings.kickedUsers !== undefined) meta.kickedUsers = settings.kickedUsers;
      if (Array.isArray(settings.plugins)) meta.plugins = settings.plugins;
      if (Array.isArray(settings.webhooks)) meta.webhooks = settings.webhooks;
      if (settings.discoverConfig !== undefined) meta.discoverConfig = settings.discoverConfig;
      if (settings.defaultRoleSettings !== undefined)
        meta.defaultRoleSettings = settings.defaultRoleSettings;
      if (settings.welcomeSettings !== undefined) meta.welcomeSettings = settings.welcomeSettings;

      if (Array.isArray(settings.channels)) {
        meta.channels = settings.channels.map((c) => {
          const isCat = c.type === "category" || String(c.id).startsWith("cat-");
          return {
            id: c.id,
            type: isCat
              ? "category"
              : c.type === "voice"
              ? "voice"
              : c.type === "forum"
              ? "forum"
              : "text",
            name: String(c.name ?? "").trim().slice(0, 32),
            parentId: c.parentId ?? null,
            isPrivate: Boolean(c.isPrivate),
            allowedRoles: Array.isArray(c.allowedRoles) ? c.allowedRoles : [],
            hasSpeakRestrictions: Boolean(c.hasSpeakRestrictions),
            disallowedSpeakRoles: Array.isArray(c.disallowedSpeakRoles)
              ? c.disallowedSpeakRoles
              : [],
          };
        });
      }

      meta.version = (meta.version || 1) + 1;
      meta.updatedAt = now;
      metaStore._saveToSqlSync(code, meta);

      const extraObj = safeParse(row.extra_json, {});
      extraObj.metaVersion = meta.version;
      extraObj.metaUpdatedAt = meta.updatedAt;

      serversListDb
        .prepare(`
          UPDATE joined_servers
          SET name = ?, icon_ref = ?, banner_ref = ?, owner_id = ?, extra_json = ?
          WHERE room_code = ?
        `)
        .run(
          meta.name || row.name,
          meta.icon ?? row.icon_ref,
          meta.banner ?? row.banner_ref,
          meta.ownerId || row.owner_id,
          JSON.stringify(extraObj),
          code
        );

      const all = this._loadAllServersSync();
      return all.find((s) => s.roomCode === code) || null;
    });
  }

  async applySyncedMeta(roomCode, meta) {
    if (!meta?.version) return null;
    return this._withLock(async () => {
      const code = String(roomCode).trim().toUpperCase();
      const serversListDb = this._dbMgr().getGlobalDb("servers_list");
      const row = serversListDb
        .prepare("SELECT * FROM joined_servers WHERE room_code = ?")
        .get(code);
      if (!row) return null;

      const cas = this._cas();
      const iconRef = meta.icon !== undefined ? cas.storeDataUri(meta.icon) : row.icon_ref;
      const bannerRef = meta.banner !== undefined ? cas.storeDataUri(meta.banner) : row.banner_ref;
      const nextName = meta.name ? String(meta.name).trim().slice(0, 48) : row.name;
      const nextOwnerId = meta.ownerId || row.owner_id;
      const nextCreatorId = meta.creatorID || meta.creatorId || row.creator_id || nextOwnerId;
      const localUserId = this._getLocalProfileId();
      const nextIsOwner =
        localUserId && nextOwnerId ? (nextOwnerId === localUserId ? 1 : 0) : row.is_owner;

      const extraObj = safeParse(row.extra_json, {});
      extraObj.metaVersion = meta.version;
      extraObj.metaUpdatedAt = meta.updatedAt || Date.now();

      serversListDb
        .prepare(`
          UPDATE joined_servers
          SET name = ?, icon_ref = ?, banner_ref = ?, owner_id = ?, creator_id = ?, is_owner = ?, extra_json = ?
          WHERE room_code = ?
        `)
        .run(
          nextName,
          iconRef,
          bannerRef,
          nextOwnerId,
          nextCreatorId,
          nextIsOwner,
          JSON.stringify(extraObj),
          code
        );

      const all = this._loadAllServersSync();
      return all.find((s) => s.roomCode === code) || null;
    });
  }
}

module.exports = { ServerStore, DEFAULT_CHANNELS };
