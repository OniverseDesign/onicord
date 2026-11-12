const path = require("path");
const crypto = require("crypto");
const { DbManager } = require("../storage/dbManager.cjs");
const { CasStore } = require("../storage/casStore.cjs");

const DEFAULT_CHANNELS = [
  { id: "general", type: "text", name: "general" },
  { id: "voice-lounge", type: "voice", name: "Voice Lounge" },
];

function safeParse(jsonStr, fallback) {
  if (!jsonStr || typeof jsonStr !== "string") return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}

function safeSliceUnicode(str, maxLength = 100) {
  if (!str) return "";
  const s = String(str).replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    ""
  );
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const segments = Array.from(segmenter.segment(s), (item) => item.segment);
    if (segments.length <= maxLength) return s;
    return segments.slice(0, maxLength).join("");
  }
  const codePoints = Array.from(s);
  if (codePoints.length <= maxLength) return s;
  return codePoints.slice(0, maxLength).join("");
}

/**
 * RoomMetaStore manages persistent server and channel metadata across P2P swarms
 * backed by per-server SQLite databases (`servers/<ROOM_CODE>/server.db`, `flames.db`, `addons.db`)
 * and Content-Addressed Storage (`userData/cas/`).
 */
class RoomMetaStore {
  static _dirCaches = new Map(); // normalizedUserData -> Map<safeCode, meta>
  static _locks = new Map();     // `${normalizedUserData}:${safeCode}` -> Promise

  static evictCache(userDataPath, roomCode) {
    if (!userDataPath || !roomCode) return;
    const safeCode = String(roomCode).trim().toUpperCase().replace(/[^A-F0-9]/g, "");
    const dirKey = path.resolve(userDataPath).toLowerCase();
    const shared = RoomMetaStore._dirCaches.get(dirKey);
    if (shared) {
      shared.delete(safeCode);
    }
  }

  constructor(userDataPath) {
    this.userDataPath = path.resolve(userDataPath);
    const dirKey = this.userDataPath.toLowerCase();
    if (!RoomMetaStore._dirCaches.has(dirKey)) {
      RoomMetaStore._dirCaches.set(dirKey, new Map());
    }
    this._cache = RoomMetaStore._dirCaches.get(dirKey);
  }

  _dbMgr() {
    return DbManager.getInstance(this.userDataPath);
  }

  _cas() {
    return CasStore.getInstance(this.userDataPath);
  }

  _safeCode(roomCode) {
    return String(roomCode || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-F0-9]/g, "");
  }

  _withLock(roomCode, fn) {
    const safe = this._safeCode(roomCode);
    const key = `${this.userDataPath.toLowerCase()}:${safe}`;
    const prev = RoomMetaStore._locks.get(key) || Promise.resolve();
    const next = prev.then(() => fn(), () => fn());
    RoomMetaStore._locks.set(
      key,
      next.catch((err) => {
        console.error(`[RoomMetaStore] Lock task error (${roomCode}):`, err);
      })
    );
    return next;
  }

  _createDefaultMeta(safeCode) {
    return {
      roomCode: safeCode,
      creatorID: null,
      creatorId: null,
      version: 0,
      updatedAt: 0,
      updatedBy: null,
      name: null,
      icon: null,
      banner: null,
      channels: DEFAULT_CHANNELS.map((c) => ({ ...c })),
      roles: [],
      userRoles: {},
      plugins: [],
      music: null,
      disableFlameSystem: false,
      groupByRoles: false,
      allowExecutableFiles: false,
      iceServers: [],
      directConnectionEnabled: false,
      directIP: "",
      directPort: 7777,
      ownerId: null,
      savedMembers: {},
      bannedUsers: [],
      kickedUsers: {},
      auditLog: [],
      webhooks: [],
      discoverConfig: null,
      defaultRoleSettings: { enabled: false, roleId: null },
      welcomeSettings: {
        enabled: false,
        channelId: null,
        template: "¡Bienvenido {user} a {server}! 🎉",
      },
      afkSettings: {
        channelId: null,
        timeout: 300,
      },
    };
  }

  _loadFromSqlSync(safeCode) {
    if (!safeCode) return this._createDefaultMeta("");
    try {
      const dbMgr = this._dbMgr();
      const serverDb = dbMgr.getServerDb(safeCode, "server");
      const flamesDb = dbMgr.getServerDb(safeCode, "flames");
      const addonsDb = dbMgr.getServerDb(safeCode, "addons");

      const cfg = serverDb
        .prepare("SELECT * FROM server_config WHERE room_code = ?")
        .get(safeCode);
      if (!cfg) {
        const def = this._createDefaultMeta(safeCode);
        this._cache.set(safeCode, def);
        return def;
      }

      // Channels
      const channelRows = serverDb
        .prepare("SELECT * FROM channels ORDER BY position ASC")
        .all();
      const channels =
        channelRows.length > 0
          ? channelRows.map((ch) => {
              const perms = safeParse(ch.permissions_json, {});
              return {
                id: ch.id,
                name: ch.name,
                type: ch.type,
                parentId: ch.category_id || null,
                isPrivate: Boolean(perms.isPrivate),
                allowedRoles: Array.isArray(perms.allowedRoles) ? perms.allowedRoles : [],
                hasSpeakRestrictions: Boolean(perms.hasSpeakRestrictions),
                disallowedSpeakRoles: Array.isArray(perms.disallowedSpeakRoles)
                  ? perms.disallowedSpeakRoles
                  : [],
              };
            })
          : DEFAULT_CHANNELS.map((c) => ({ ...c }));

      // Roles
      const roleRows = serverDb.prepare("SELECT * FROM roles ORDER BY position ASC").all();
      const roles = roleRows.map((r) => {
        const extra = safeParse(r.extra_json, {});
        return {
          ...extra,
          id: r.id,
          name: r.name,
          color: r.color,
          position: r.position,
          hoist: Boolean(r.hoist),
          permissions: safeParse(r.permissions_json, {}),
        };
      });

      // Member Roles
      const memberRoleRows = serverDb.prepare("SELECT * FROM member_roles").all();
      const userRoles = {};
      for (const mr of memberRoleRows) {
        if (!userRoles[mr.user_id]) userRoles[mr.user_id] = [];
        userRoles[mr.user_id].push(mr.role_id);
      }

      // Flames by user_id
      const flameRows = flamesDb.prepare("SELECT * FROM member_flames").all();
      const flamesByUser = {};
      for (const fl of flameRows) {
        const extraFl = safeParse(fl.extra_json, {});
        flamesByUser[fl.user_id] = {
          ...extraFl,
          currentStreak: fl.current_streak,
          highestStreak: fl.max_streak,
          lastInteractionDate: fl.last_active_date,
          serverId: safeCode,
        };
      }

      // Members
      const memberRows = serverDb.prepare("SELECT * FROM members").all();
      const savedMembers = {};
      for (const m of memberRows) {
        const extraM = safeParse(m.extra_json, {});
        savedMembers[m.user_id] = {
          ...extraM,
          id: m.user_id,
          nickname: m.nickname,
          avatar: m.avatar_ref || extraM.avatar || null,
          banner: m.banner_ref || extraM.banner || null,
          profileColor: m.accent_color || extraM.profileColor || "",
          customStatus: m.bio || extraM.customStatus || "",
          status: m.status || "offline",
          joinedAt: m.joined_at,
          updatedAt: m.last_seen_at,
          ...(flamesByUser[m.user_id] ? { flame: flamesByUser[m.user_id] } : {}),
        };
      }

      // Moderation (kicks & bans)
      const modRows = serverDb.prepare("SELECT * FROM moderation").all();
      const bannedUsers = [];
      const kickedUsers = {};
      for (const mod of modRows) {
        if (mod.action_type === "ban") {
          bannedUsers.push(mod.user_id);
        } else if (mod.action_type === "kick") {
          kickedUsers[mod.user_id] = mod.created_at;
        }
      }

      // Webhooks
      const whRows = serverDb.prepare("SELECT * FROM webhooks ORDER BY created_at ASC").all();
      const webhooks = whRows.map((wh) => {
        const extraWh = safeParse(wh.extra_json, {});
        return {
          ...extraWh,
          id: wh.id,
          channelId: wh.channel_id,
          name: wh.name,
          avatar: wh.avatar_ref || null,
          tokenHash: wh.token_hash,
          type: wh.type || "incoming",
          targetUrl: wh.target_url || null,
          intervalSeconds: wh.interval_seconds || 300,
          createdAt: wh.created_at,
        };
      });

      // Audit logs
      const logRows = serverDb
        .prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100")
        .all();
      const auditLog = logRows.map((l) => {
        const details = safeParse(l.details_json, {});
        return {
          ...details,
          id: l.id,
          action: l.action,
          timestamp: l.created_at,
        };
      });

      // Enabled addons
      const addonRows = addonsDb.prepare("SELECT * FROM server_enabled_addons").all();
      const plugins = addonRows.map((a) => {
        const cfgJson = safeParse(a.config_json, {});
        return {
          ...cfgJson,
          id: cfgJson.id || a.plugin_id,
          enabled: Boolean(a.enabled),
        };
      });

      const resolvedCreatorId = cfg.creator_id || cfg.owner_id || null;
      const meta = {
        roomCode: safeCode,
        creatorID: resolvedCreatorId,
        creatorId: resolvedCreatorId,
        version: cfg.version || 0,
        updatedAt: cfg.updated_at || 0,
        updatedBy: cfg.updated_by || null,
        name: cfg.name || null,
        icon: cfg.icon_ref || null,
        banner: cfg.banner_ref || null,
        channels,
        roles,
        userRoles,
        plugins,
        music: safeParse(cfg.music_json, null),
        disableFlameSystem: Boolean(cfg.disable_flame_system),
        groupByRoles: Boolean(cfg.group_by_roles),
        allowExecutableFiles: Boolean(cfg.allow_executable_files),
        iceServers: safeParse(cfg.ice_servers_json, []),
        directConnectionEnabled: Boolean(cfg.direct_connection_enabled),
        directIP: cfg.direct_ip || "",
        directPort: cfg.direct_port || 7777,
        ownerId: cfg.owner_id || null,
        savedMembers,
        bannedUsers,
        kickedUsers,
        auditLog,
        webhooks,
        discoverConfig: safeParse(cfg.discover_config_json, null),
        defaultRoleSettings: safeParse(cfg.default_role_settings_json, {
          enabled: false,
          roleId: null,
        }),
        welcomeSettings: safeParse(cfg.welcome_settings_json, {
          enabled: false,
          channelId: null,
          template: "¡Bienvenido {user} a {server}! 🎉",
        }),
        afkSettings: safeParse(cfg.afk_settings_json, {
          channelId: null,
          timeout: 300,
        }),
      };

      this._cache.set(safeCode, meta);
      return meta;
    } catch (err) {
      console.error(`[RoomMetaStore] Error loading meta from SQLite for ${safeCode}:`, err.message);
      const def = this._createDefaultMeta(safeCode);
      this._cache.set(safeCode, def);
      return def;
    }
  }

  async _loadUnlocked(safeCode, forceReload = false) {
    if (this._cache.has(safeCode)) {
      const cached = this._cache.get(safeCode);
      if (!forceReload || (cached && cached.version > 0)) {
        return cached;
      }
    }
    return this._loadFromSqlSync(safeCode);
  }

  async load(roomCode, forceReload = false) {
    const safeCode = this._safeCode(roomCode);
    if (!forceReload && this._cache.has(safeCode)) {
      return this._cache.get(safeCode);
    }
    return this._withLock(safeCode, () => this._loadUnlocked(safeCode, forceReload));
  }

  _saveToSqlSync(safeCode, meta) {
    if (!safeCode || !meta || typeof meta !== "object") return meta;
    const dbMgr = this._dbMgr();
    const cas = this._cas();
    const serverDb = dbMgr.getServerDb(safeCode, "server");
    const flamesDb = dbMgr.getServerDb(safeCode, "flames");
    const addonsDb = dbMgr.getServerDb(safeCode, "addons");
    const now = Date.now();

    meta.roomCode = safeCode;
    meta.icon = cas.storeDataUri(meta.icon || null);
    meta.banner = cas.storeDataUri(meta.banner || null);

    const resolvedCreatorId = meta.creatorID || meta.creatorId || meta.ownerId || null;
    meta.creatorID = resolvedCreatorId;
    meta.creatorId = resolvedCreatorId;

    const discoverCfg = meta.discoverConfig ? cas.ingestObject(meta.discoverConfig) : null;
    const musicCfg = meta.music ? cas.ingestObject(meta.music) : null;
    const defaultRoleCfg = meta.defaultRoleSettings ?? { enabled: false, roleId: null };
    const welcomeCfg = meta.welcomeSettings ?? {
      enabled: false,
      channelId: null,
      template: "¡Bienvenido {user} a {server}! 🎉",
    };
    const afkCfg = meta.afkSettings ?? {
      channelId: null,
      timeout: 300,
    };

    const tx = serverDb.transaction(() => {
      serverDb
        .prepare(`
          INSERT OR REPLACE INTO server_config (
            room_code, name, description, icon_ref, banner_ref, owner_id, creator_id,
            discoverable, discover_category, discover_language, discover_tags_json, discover_config_json,
            disable_flame_system, group_by_roles, allow_executable_files,
            ice_servers_json, direct_connection_enabled, direct_ip, direct_port,
            default_role_settings_json, welcome_settings_json, afk_settings_json, music_json,
            version, updated_by, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          safeCode,
          String(meta.name || `Servidor ${safeCode.slice(0, 4)}`),
          discoverCfg?.description || "",
          meta.icon,
          meta.banner,
          meta.ownerId || null,
          resolvedCreatorId,
          discoverCfg?.enabled ? 1 : 0,
          discoverCfg?.category || null,
          discoverCfg?.language || null,
          JSON.stringify(discoverCfg?.tags || []),
          discoverCfg ? JSON.stringify(discoverCfg) : null,
          meta.disableFlameSystem ? 1 : 0,
          meta.groupByRoles ? 1 : 0,
          meta.allowExecutableFiles ? 1 : 0,
          JSON.stringify(meta.iceServers || []),
          meta.directConnectionEnabled ? 1 : 0,
          meta.directIP || "",
          Number(meta.directPort) || 7777,
          JSON.stringify(defaultRoleCfg),
          JSON.stringify(welcomeCfg),
          JSON.stringify(afkCfg),
          musicCfg ? JSON.stringify(musicCfg) : null,
          Number(meta.version) || 0,
          meta.updatedBy || null,
          Number(meta.updatedAt) || now
        );

      // Replace channels
      serverDb.prepare("DELETE FROM channels").run();
      const channels =
        Array.isArray(meta.channels) && meta.channels.length > 0
          ? meta.channels
          : DEFAULT_CHANNELS.map((c) => ({ ...c }));
      const insertChannel = serverDb.prepare(`
        INSERT OR REPLACE INTO channels (
          id, name, type, category_id, position, topic, nsfw, slowmode_sec, permissions_json, plugin_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      channels.forEach((ch, idx) => {
        if (!ch || !ch.id) return;
        insertChannel.run(
          String(ch.id),
          safeSliceUnicode(String(ch.name || ch.id), 100),
          String(ch.type || "text"),
          ch.parentId || null,
          idx,
          ch.topic || null,
          ch.nsfw ? 1 : 0,
          Number(ch.slowmodeSec) || 0,
          JSON.stringify({
            isPrivate: Boolean(ch.isPrivate),
            allowedRoles: Array.isArray(ch.allowedRoles) ? ch.allowedRoles : [],
            hasSpeakRestrictions: Boolean(ch.hasSpeakRestrictions),
            disallowedSpeakRoles: Array.isArray(ch.disallowedSpeakRoles)
              ? ch.disallowedSpeakRoles
              : [],
          }),
          ch.pluginId || null,
          now
        );
      });

      // Replace roles
      serverDb.prepare("DELETE FROM roles").run();
      const roles = Array.isArray(meta.roles) ? meta.roles : [];
      const insertRole = serverDb.prepare(`
        INSERT OR REPLACE INTO roles (
          id, name, color, position, hoist, permissions_json, extra_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      roles.forEach((r, idx) => {
        if (!r || !r.id) return;
        insertRole.run(
          String(r.id),
          String(r.name || "Rol"),
          String(r.color || "#99aab5"),
          r.position !== undefined ? Number(r.position) : idx,
          r.hoist ? 1 : 0,
          JSON.stringify(r.permissions || {}),
          JSON.stringify(r),
          now
        );
      });

      // Replace members
      serverDb.prepare("DELETE FROM members").run();
      const savedMembers =
        meta.savedMembers && typeof meta.savedMembers === "object" ? meta.savedMembers : {};
      const insertMember = serverDb.prepare(`
        INSERT OR REPLACE INTO members (
          user_id, nickname, avatar_ref, banner_ref, card_style, accent_color, bio, status, extra_json, joined_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const [mId, mData] of Object.entries(savedMembers)) {
        if (!mId || !mData || typeof mData !== "object") continue;
        const cleanMember = cas.ingestObject(mData);
        const mAvatar = cleanMember.avatar || null;
        const mBanner = cleanMember.banner || null;
        mData.avatar = mAvatar;
        if (mData.banner !== undefined) mData.banner = mBanner;

        insertMember.run(
          String(mId),
          String(cleanMember.nickname || "Usuario"),
          mAvatar,
          mBanner,
          cleanMember.cardStyle || null,
          cleanMember.profileColor || cleanMember.accentColor || null,
          cleanMember.bio || cleanMember.customStatus || null,
          cleanMember.status || "offline",
          JSON.stringify(cleanMember),
          Number(cleanMember.joinedAt || cleanMember.updatedAt) || now,
          Number(cleanMember.updatedAt || cleanMember.lastSeen) || now
        );

        if (mData.flame && typeof mData.flame === "object") {
          try {
            flamesDb
              .prepare(`
                INSERT OR REPLACE INTO member_flames (
                  user_id, current_streak, max_streak, tier, last_active_date,
                  active_seconds_today, ignited_today, extra_json, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `)
              .run(
                String(mId),
                Number(mData.flame.currentStreak) || 0,
                Number(mData.flame.highestStreak || mData.flame.currentStreak) || 0,
                mData.flame.tier || "none",
                mData.flame.lastInteractionDate || null,
                Number(mData.flame.activeSecondsToday) || 0,
                mData.flame.ignitedToday ? 1 : 0,
                JSON.stringify(mData.flame),
                Number(mData.updatedAt) || now
              );
          } catch {}
        }
      }

      // Replace member_roles
      serverDb.prepare("DELETE FROM member_roles").run();
      const userRoles = meta.userRoles && typeof meta.userRoles === "object" ? meta.userRoles : {};
      const insertMemberRole = serverDb.prepare(`
        INSERT OR REPLACE INTO member_roles (user_id, role_id) VALUES (?, ?)
      `);
      for (const [uId, rList] of Object.entries(userRoles)) {
        const arr = Array.isArray(rList) ? rList : rList ? [rList] : [];
        for (const rId of arr) {
          if (uId && rId) {
            insertMemberRole.run(String(uId), String(rId));
          }
        }
      }

      // Replace moderation
      serverDb.prepare("DELETE FROM moderation").run();
      const insertMod = serverDb.prepare(`
        INSERT OR REPLACE INTO moderation (
          user_id, action_type, reason, moderator_id, nickname_snapshot, avatar_ref_snapshot, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const kickedUsers =
        meta.kickedUsers && typeof meta.kickedUsers === "object" ? meta.kickedUsers : {};
      for (const [kId, kTime] of Object.entries(kickedUsers)) {
        if (!kId) continue;
        insertMod.run(String(kId), "kick", null, null, null, null, Number(kTime) || now);
      }
      const bannedUsers = Array.isArray(meta.bannedUsers) ? meta.bannedUsers : [];
      for (const bId of bannedUsers) {
        if (!bId) continue;
        insertMod.run(String(bId), "ban", null, null, null, null, now);
      }

      // Replace webhooks
      serverDb.prepare("DELETE FROM webhooks").run();
      const webhooks = Array.isArray(meta.webhooks) ? meta.webhooks : [];
      const insertWh = serverDb.prepare(`
        INSERT OR REPLACE INTO webhooks (
          id, channel_id, name, avatar_ref, token_hash, type, target_url, interval_seconds, extra_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const wh of webhooks) {
        if (!wh || !wh.id) continue;
        wh.avatar = cas.storeDataUri(wh.avatar || null);
        insertWh.run(
          String(wh.id),
          String(wh.channelId || "general"),
          String(wh.name || "Webhook"),
          wh.avatar,
          String(wh.tokenHash || ""),
          String(wh.type || "incoming"),
          wh.targetUrl || null,
          Number(wh.intervalSeconds) || 300,
          JSON.stringify(wh),
          Number(wh.createdAt) || now
        );
      }

      // Replace audit_logs
      serverDb.prepare("DELETE FROM audit_logs").run();
      const auditLogs = Array.isArray(meta.auditLog) ? meta.auditLog : [];
      const insertLog = serverDb.prepare(`
        INSERT OR REPLACE INTO audit_logs (id, actor_id, action, target_id, details_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const entry of auditLogs) {
        if (!entry || !entry.id) continue;
        const cleanEntry = cas.ingestObject(entry);
        insertLog.run(
          String(cleanEntry.id),
          cleanEntry.actorId || cleanEntry.userId || null,
          String(cleanEntry.action || cleanEntry.type || "event"),
          cleanEntry.targetId || null,
          JSON.stringify(cleanEntry),
          Number(cleanEntry.timestamp || cleanEntry.createdAt) || now
        );
      }
    });
    tx();

    // Update server_enabled_addons in addons.db
    const plugins = Array.isArray(meta.plugins) ? meta.plugins : [];
    const addonTx = addonsDb.transaction((list) => {
      addonsDb.prepare("DELETE FROM server_enabled_addons").run();
      const insertAddon = addonsDb.prepare(`
        INSERT OR REPLACE INTO server_enabled_addons (plugin_id, enabled, config_json, enabled_by, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const pl of list) {
        if (!pl) continue;
        const pId = String(pl.id || pl.name || "").trim();
        if (!pId) continue;
        const ingested = cas.ingestObject(pl);
        insertAddon.run(
          pId,
          ingested.enabled !== false ? 1 : 0,
          JSON.stringify(ingested),
          null,
          now
        );
      }
    });
    addonTx(plugins);

    this._cache.set(safeCode, meta);
    return meta;
  }

  async _saveUnlocked(safeCode, meta) {
    return this._saveToSqlSync(safeCode, meta);
  }

  async save(roomCode, meta) {
    const safeCode = this._safeCode(roomCode);
    return this._withLock(safeCode, () => this._saveUnlocked(safeCode, meta));
  }

  merge(roomCode, remote, senderUserId) {
    if (!remote?.version) return Promise.resolve({ applied: false, meta: null });
    const safeCode = this._safeCode(roomCode);
    return this._withLock(safeCode, async () => {
      const local = await this._loadUnlocked(safeCode, false);
      const localCreator = local.creatorID || local.creatorId;
      const remoteCreator = remote.creatorID || remote.creatorId;
      const isLocalUninitialized =
        (!local.ownerId && !localCreator) || local.version === 0 || (!local.name && !local.icon);
      let isAuthorized = false;

      const isSenderOwnerOrCreator =
        senderUserId &&
        ((local.ownerId && local.ownerId === senderUserId) ||
          (localCreator && localCreator === senderUserId) ||
          (remote.ownerId && remote.ownerId === senderUserId && isLocalUninitialized));
      const isSenderAdmin = senderUserId && checkAdminPermission(local, senderUserId);
      const isAuthorOwnerOrAdmin =
        remote.updatedBy &&
        ((local.ownerId && local.ownerId === remote.updatedBy) ||
          (localCreator && localCreator === remote.updatedBy) ||
          checkAdminPermission(local, remote.updatedBy));

      if (isLocalUninitialized) {
        isAuthorized = Boolean(remote.ownerId || remoteCreator || remote.version);
      } else if (localCreator && remoteCreator && localCreator !== remoteCreator) {
        isAuthorized = false;
      } else if (isSenderOwnerOrCreator || isSenderAdmin) {
        isAuthorized = true;
      } else if (!senderUserId) {
        isAuthorized = true;
      } else if (remote.version > local.version && isAuthorOwnerOrAdmin) {
        isAuthorized = true;
      }

      if (!isAuthorized) {
        console.log(
          `[RoomMeta] Metadata update skipped for room ${roomCode}: Sender=${senderUserId}, RemoteOwner=${remote.ownerId}, LocalOwner=${local.ownerId}, RemoteV=${remote.version}, LocalV=${local.version}`
        );
        return { applied: false, meta: local };
      }

      const remoteAuthorId = remote.updatedBy || senderUserId;
      const remoteAuth = getAuthorityLevel(local, remoteAuthorId);
      const localAuthorId = local.updatedBy || local.ownerId;
      const localAuth = getAuthorityLevel(local, localAuthorId);

      let newer = false;
      if (isLocalUninitialized) {
        newer = true;
      } else if (remote.version > local.version) {
        newer = true;
      } else if (remote.version < local.version) {
        newer = false;
      } else if (remoteAuth > localAuth) {
        newer = true;
      } else if (remoteAuth < localAuth) {
        newer = false;
      } else if (isSenderOwnerOrCreator || isSenderAdmin) {
        newer = (remote.updatedAt || 0) > (local.updatedAt || 0);
      } else {
        newer = false;
      }

      if (!newer) return { applied: false, meta: local };

      // Merge Audit Logs
      const localLog = Array.isArray(local.auditLog) ? local.auditLog : [];
      const remoteLog = Array.isArray(remote.auditLog) ? remote.auditLog : [];

      const logMap = new Map();
      for (const entry of [...localLog, ...remoteLog]) {
        if (entry && entry.id) {
          logMap.set(entry.id, entry);
        }
      }
      const mergedAuditLog = Array.from(logMap.values())
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 100);

      const resolvedBannedUsers = Array.isArray(remote.bannedUsers)
        ? remote.bannedUsers
        : Array.isArray(local.bannedUsers)
        ? local.bannedUsers
        : [];
      const resolvedKickedUsers = remote.kickedUsers ?? local.kickedUsers ?? {};

      const mergedSavedMembers = {};
      const isRemoteAuthoritative = Boolean(
        isSenderOwnerOrCreator || isSenderAdmin || isLocalUninitialized
      );
      if (
        isRemoteAuthoritative &&
        remote.savedMembers &&
        typeof remote.savedMembers === "object"
      ) {
        for (const [mId, mData] of Object.entries(remote.savedMembers)) {
          if (!mData) continue;
          const existing = local.savedMembers?.[mId];
          if (!existing || (mData.updatedAt || 0) >= (existing.updatedAt || 0)) {
            mergedSavedMembers[mId] = { ...(existing || {}), ...mData };
          } else {
            mergedSavedMembers[mId] = { ...mData, ...existing };
          }
        }
        if (local.savedMembers && typeof local.savedMembers === "object") {
          for (const [mId, localMember] of Object.entries(local.savedMembers)) {
            if (!localMember || mergedSavedMembers[mId]) continue;
            if ((localMember.joinedAt || 0) > (remote.updatedAt || 0)) {
              mergedSavedMembers[mId] = localMember;
            }
          }
        }
      } else {
        Object.assign(mergedSavedMembers, local.savedMembers || {});
        if (remote.savedMembers && typeof remote.savedMembers === "object") {
          for (const [mId, mData] of Object.entries(remote.savedMembers)) {
            if (!mData) continue;
            const existing = mergedSavedMembers[mId];
            if (!existing || (mData.updatedAt || 0) >= (existing.updatedAt || 0)) {
              mergedSavedMembers[mId] = { ...(existing || {}), ...mData };
            } else {
              mergedSavedMembers[mId] = { ...mData, ...existing };
            }
          }
        }
      }

      for (const bId of resolvedBannedUsers) {
        delete mergedSavedMembers[bId];
      }
      if (resolvedKickedUsers && typeof resolvedKickedUsers === "object") {
        for (const [kId, kickTime] of Object.entries(resolvedKickedUsers)) {
          const member = mergedSavedMembers[kId];
          if (member && kickTime && kickTime >= (member.joinedAt || 0)) {
            delete mergedSavedMembers[kId];
          }
        }
      }

      const resolvedCreatorId =
        local.creatorID ||
        local.creatorId ||
        remote.creatorID ||
        remote.creatorId ||
        local.ownerId ||
        remote.ownerId ||
        null;

      const resolvedChannels =
        Array.isArray(remote.channels) && remote.channels.length > 0
          ? remote.channels
          : Array.isArray(local.channels) && local.channels.length > 0
          ? local.channels
          : DEFAULT_CHANNELS.map((c) => ({ ...c }));

      const resolvedRoles =
        Array.isArray(remote.roles) && remote.roles.length > 0
          ? remote.roles
          : Array.isArray(local.roles) && local.roles.length > 0
          ? local.roles
          : [];

      const resolvedIcon = remote.icon !== undefined ? remote.icon : local.icon;
      const resolvedBanner =
        remote.banner !== undefined ? remote.banner : local.banner ?? null;

      const merged = {
        roomCode: safeCode,
        creatorID: resolvedCreatorId,
        creatorId: resolvedCreatorId,
        version: remote.version,
        updatedAt: remote.updatedAt || Date.now(),
        updatedBy: remote.updatedBy || senderUserId || remote.ownerId || null,
        name: remote.name ?? local.name,
        icon: resolvedIcon,
        banner: resolvedBanner,
        channels: resolvedChannels,
        roles: resolvedRoles,
        userRoles: remote.userRoles ?? local.userRoles ?? {},
        plugins: remote.plugins ?? local.plugins ?? [],
        music: remote.music !== undefined ? remote.music : local.music,
        disableFlameSystem:
          remote.disableFlameSystem !== undefined
            ? remote.disableFlameSystem
            : local.disableFlameSystem ?? false,
        groupByRoles:
          remote.groupByRoles !== undefined
            ? remote.groupByRoles
            : local.groupByRoles ?? false,
        allowExecutableFiles:
          remote.allowExecutableFiles !== undefined
            ? remote.allowExecutableFiles
            : local.allowExecutableFiles ?? false,
        iceServers: remote.iceServers ?? local.iceServers ?? [],
        directConnectionEnabled:
          remote.directConnectionEnabled !== undefined
            ? remote.directConnectionEnabled
            : local.directConnectionEnabled ?? false,
        directIP: remote.directIP ?? local.directIP ?? "",
        directPort: remote.directPort ?? local.directPort ?? 7777,
        ownerId: remote.ownerId ?? local.ownerId ?? null,
        savedMembers: mergedSavedMembers,
        bannedUsers: remote.bannedUsers ?? local.bannedUsers ?? [],
        kickedUsers: remote.kickedUsers ?? local.kickedUsers ?? {},
        auditLog: mergedAuditLog,
        webhooks: Array.isArray(remote.webhooks) ? remote.webhooks : local.webhooks ?? [],
        discoverConfig:
          remote.discoverConfig !== undefined
            ? remote.discoverConfig
            : local.discoverConfig ?? null,
        defaultRoleSettings:
          remote.defaultRoleSettings !== undefined
            ? remote.defaultRoleSettings
            : local.defaultRoleSettings ?? { enabled: false, roleId: null },
        welcomeSettings:
          remote.welcomeSettings !== undefined
            ? remote.welcomeSettings
            : local.welcomeSettings ?? {
                enabled: false,
                channelId: null,
                template: "¡Bienvenido {user} a {server}! 🎉",
              },
        afkSettings:
          remote.afkSettings !== undefined
            ? remote.afkSettings
            : local.afkSettings ?? {
                channelId: null,
                timeout: 300,
              },
      };
      await this._saveUnlocked(safeCode, merged);
      return { applied: true, meta: merged };
    });
  }

  async bump(roomCode, patch, updatedByUserId) {
    const safeCode = this._safeCode(roomCode);
    return this._withLock(safeCode, async () => {
      const local = await this._loadUnlocked(safeCode, false);
      const resolvedCreatorId =
        local.creatorID ||
        local.creatorId ||
        patch.creatorID ||
        patch.creatorId ||
        local.ownerId ||
        patch.ownerId ||
        null;
      const next = {
        ...local,
        ...patch,
        creatorID: resolvedCreatorId,
        creatorId: resolvedCreatorId,
        roomCode: safeCode,
        version: local.version + 1,
        updatedAt: Date.now(),
        updatedBy: updatedByUserId || null,
      };
      await this._saveUnlocked(safeCode, next);
      return next;
    });
  }

  async updateSavedMembers(roomCode, savedMembers) {
    const safeCode = this._safeCode(roomCode);
    return this._withLock(safeCode, async () => {
      const local = await this._loadUnlocked(safeCode, false);
      const mergedSavedMembers = { ...(local.savedMembers || {}) };
      if (savedMembers && typeof savedMembers === "object") {
        for (const [mId, mData] of Object.entries(savedMembers)) {
          if (!mData) continue;
          const existing = mergedSavedMembers[mId];
          if (!existing || (mData.updatedAt || 0) >= (existing.updatedAt || 0)) {
            mergedSavedMembers[mId] = mData;
          }
        }
      }
      local.savedMembers = mergedSavedMembers;
      await this._saveUnlocked(safeCode, local);
      return local;
    });
  }

  async removeSavedMember(roomCode, userId) {
    if (!userId) return null;
    const safeCode = this._safeCode(roomCode);
    return this._withLock(safeCode, async () => {
      const local = await this._loadUnlocked(safeCode, false);
      if (local.savedMembers && local.savedMembers[userId]) {
        const updatedSavedMembers = { ...local.savedMembers };
        delete updatedSavedMembers[userId];
        local.savedMembers = updatedSavedMembers;
        await this._saveUnlocked(safeCode, local);
      }
      return local;
    });
  }

  async getWebhooks(roomCode, includeHash = false) {
    const meta = await this.load(roomCode);
    const list = Array.isArray(meta.webhooks) ? meta.webhooks : [];
    if (includeHash) return list;
    return list.map(({ tokenHash, ...safe }) => safe);
  }

  async addWebhook(
    roomCode,
    { name, channelId, avatar, type = "incoming", targetUrl = null, intervalSeconds = 300 },
    createdByUserId
  ) {
    const meta = await this.load(roomCode);
    const webhooks = Array.isArray(meta.webhooks) ? [...meta.webhooks] : [];

    const id = "wh_" + crypto.randomBytes(8).toString("hex");
    const rawToken = crypto.randomBytes(24).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const newWebhook = {
      id,
      name: safeSliceUnicode(String(name || "Webhook").trim(), 100),
      channelId: channelId || "general",
      avatar: this._cas().storeDataUri(avatar || null),
      tokenHash,
      type: type === "pull_poller" ? "pull_poller" : "incoming",
      targetUrl: targetUrl || null,
      intervalSeconds: Math.max(30, parseInt(intervalSeconds, 10) || 300),
      createdAt: Date.now(),
      createdBy: createdByUserId || null,
    };

    webhooks.push(newWebhook);
    const updatedMeta = await this.bump(roomCode, { webhooks }, createdByUserId);
    const { tokenHash: _, ...safeWebhook } = newWebhook;
    return { webhook: safeWebhook, rawToken, meta: updatedMeta };
  }

  async updateWebhook(roomCode, webhookId, patch = {}, updatedByUserId) {
    const meta = await this.load(roomCode);
    const webhooks = Array.isArray(meta.webhooks) ? [...meta.webhooks] : [];
    const idx = webhooks.findIndex((w) => w.id === webhookId);
    if (idx === -1) throw new Error("Webhook not found");

    const existing = webhooks[idx];
    const updated = {
      ...existing,
      name:
        patch.name !== undefined ? safeSliceUnicode(String(patch.name).trim(), 100) : existing.name,
      channelId: patch.channelId !== undefined ? patch.channelId : existing.channelId,
      avatar:
        patch.avatar !== undefined
          ? this._cas().storeDataUri(patch.avatar)
          : existing.avatar,
      targetUrl: patch.targetUrl !== undefined ? patch.targetUrl : existing.targetUrl,
      intervalSeconds:
        patch.intervalSeconds !== undefined
          ? Math.max(30, parseInt(patch.intervalSeconds, 10) || 300)
          : existing.intervalSeconds,
      updatedAt: Date.now(),
    };

    webhooks[idx] = updated;
    const updatedMeta = await this.bump(roomCode, { webhooks }, updatedByUserId);
    const { tokenHash: _, ...safeWebhook } = updated;
    return { webhook: safeWebhook, meta: updatedMeta };
  }

  async deleteWebhook(roomCode, webhookId, updatedByUserId) {
    const meta = await this.load(roomCode);
    const webhooks = (Array.isArray(meta.webhooks) ? meta.webhooks : []).filter(
      (w) => w.id !== webhookId
    );
    const updatedMeta = await this.bump(roomCode, { webhooks }, updatedByUserId);
    return { success: true, meta: updatedMeta };
  }

  async regenerateWebhookToken(roomCode, webhookId, updatedByUserId) {
    const meta = await this.load(roomCode);
    const webhooks = Array.isArray(meta.webhooks) ? [...meta.webhooks] : [];
    const idx = webhooks.findIndex((w) => w.id === webhookId);
    if (idx === -1) throw new Error("Webhook not found");

    const rawToken = crypto.randomBytes(24).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    webhooks[idx] = {
      ...webhooks[idx],
      tokenHash,
      tokenRegeneratedAt: Date.now(),
    };

    const updatedMeta = await this.bump(roomCode, { webhooks }, updatedByUserId);
    const { tokenHash: _, ...safeWebhook } = webhooks[idx];
    return { webhook: safeWebhook, rawToken, meta: updatedMeta };
  }
}

function checkAdminPermission(meta, userId) {
  if (!userId) return false;
  if (
    (meta.creatorID && meta.creatorID === userId) ||
    (meta.creatorId && meta.creatorId === userId)
  )
    return true;
  if (meta.ownerId && meta.ownerId === userId) return true;
  if (!meta.roles || !meta.userRoles) return false;

  const uRoles = meta.userRoles[userId];
  if (!uRoles) return false;

  const roleIds = Array.isArray(uRoles) ? uRoles : [uRoles];
  for (const rId of roleIds) {
    const role = meta.roles.find((r) => r.id === rId);
    if (role && role.permissions && role.permissions.admin === true) {
      return true;
    }
  }
  return false;
}

function getAuthorityLevel(meta, userId) {
  if (!userId) return 0;
  if (meta.ownerId && meta.ownerId === userId) return 3; // Owner
  if (
    (meta.creatorID && meta.creatorID === userId) ||
    (meta.creatorId && meta.creatorId === userId)
  )
    return 3; // Creator
  if (checkAdminPermission(meta, userId)) return 2; // Admin
  const uRoles = meta.userRoles?.[userId];
  if (uRoles || (meta.savedMembers && meta.savedMembers[userId])) return 1; // Member
  return 0; // Guest
}

module.exports = { RoomMetaStore, checkAdminPermission, getAuthorityLevel, DEFAULT_CHANNELS };
