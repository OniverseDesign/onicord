const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { CasStore } = require("./casStore.cjs");

function safeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !raw.trim()) return null;
    try {
      return JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
    }
  } catch {}
  return null;
}

function ensureDirSync(targetDir) {
  const resolved = path.resolve(targetDir);
  if (fs.existsSync(resolved)) return;
  const missing = [];
  let cur = resolved;
  while (cur && !fs.existsSync(cur)) {
    missing.unshift(cur);
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  for (const dir of missing) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
  }
}

function moveToLegacyBackup(srcPath, backupRoot, relDest) {
  if (!fs.existsSync(srcPath)) return;
  try {
    const destPath = path.join(backupRoot, relDest);
    const destDir = path.dirname(destPath);
    ensureDirSync(destDir);
    if (fs.existsSync(destPath)) {
      fs.rmSync(destPath, { recursive: true, force: true });
    }
    try {
      fs.renameSync(srcPath, destPath);
    } catch {
      fs.cpSync(srcPath, destPath, { recursive: true, force: true });
      fs.rmSync(srcPath, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn(`[MigrationService] Could not archive ${srcPath}:`, err.message);
  }
}

class MigrationService {
  static _migratedPaths = new Set();

  static ensureMigrated(dbManager) {
    const userDataPath = dbManager.userDataPath;
    const key = userDataPath.toLowerCase();
    if (MigrationService._migratedPaths.has(key)) return;
    MigrationService._migratedPaths.add(key);

    const appConfigDb = dbManager.getGlobalDb("app_config");
    const migRow = appConfigDb
      .prepare("SELECT value_json FROM app_settings WHERE key = 'sqlite_cas_migration_v1'")
      .get();

    // Even if already marked migrated, clean up any stray legacy history_*.json once (gated by legacy_stray_cleanup_v2)
    if (migRow) {
      MigrationService._cleanupStrayLegacyFiles(userDataPath, dbManager, appConfigDb);
      return;
    }

    console.log(`[MigrationService] Starting SQLite + CAS migration for: ${userDataPath}`);
    const startTime = Date.now();
    const cas = CasStore.getInstance(userDataPath);
    const backupRoot = path.join(userDataPath, "backups", "legacy-json-v1");
    ensureDirSync(backupRoot);

    let localUserId = null;

    // 1. Migrate profile.json -> profile.db, app_config.db, activity.db, servers_list.db, flames.db
    const profilePath = path.join(userDataPath, "profile.json");
    const rawProfile = safeReadJson(profilePath);
    if (rawProfile && typeof rawProfile === "object") {
      localUserId = rawProfile.id || null;
      MigrationService._migrateProfile(dbManager, cas, rawProfile);
      moveToLegacyBackup(profilePath, backupRoot, "profile.json");
    }

    // 2. Migrate downloads.json -> app_config.db (downloads)
    const downloadsPath = path.join(userDataPath, "downloads.json");
    const rawDownloads = safeReadJson(downloadsPath);
    if (rawDownloads && typeof rawDownloads === "object") {
      const insertDl = appConfigDb.prepare(`
        INSERT OR REPLACE INTO downloads (download_id, file_name, file_path, size_bytes, mime_type, source_room_code, downloaded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const tx = appConfigDb.transaction((entries) => {
        for (const [dlId, info] of entries) {
          if (!info?.localPath) continue;
          let size = 0;
          try {
            if (fs.existsSync(info.localPath)) {
              size = fs.statSync(info.localPath).size;
            }
          } catch {}
          insertDl.run(
            String(dlId),
            path.basename(info.localPath),
            String(info.localPath),
            size,
            null,
            null,
            Number(info.savedAt) || Date.now()
          );
        }
      });
      tx(Object.entries(rawDownloads));
      moveToLegacyBackup(downloadsPath, backupRoot, "downloads.json");
    }

    // 3. Migrate servers.json + room-meta/*.json -> servers_list.db + servers/<CODE>/{server.db, flames.db, addons.db}
    const activeRoomCodes = MigrationService._migrateServersAndMeta(
      dbManager,
      cas,
      userDataPath,
      localUserId,
      backupRoot
    );

    // 4. Migrate chats/<CODE>/*.json -> servers/<CODE>/messages.db & servers/<CODE>/dms/dm_<PEER>.db
    MigrationService._migrateChats(dbManager, cas, userDataPath, localUserId, activeRoomCodes, backupRoot);

    // 5. Migrate files-index/<CODE>.json -> servers/<CODE>/messages.db (shared_files)
    MigrationService._migrateFilesIndex(dbManager, userDataPath, activeRoomCodes, backupRoot);

    // 6. Migrate history_<serverId>.json -> servers/<CODE>/widgets.db (music_history)
    MigrationService._migrateMusicHistory(dbManager, cas, userDataPath, activeRoomCodes, backupRoot);

    // 7. Migrate stickers/ and sticker_packs/ -> stickers.db + CAS
    MigrationService._migrateStickers(dbManager, cas, userDataPath);

    // 8. Migrate plugins/, uninstalled-plugins.json, plugins/.storage/ -> addons.db + servers/<CODE>/addons.db
    MigrationService._migrateAddons(dbManager, userDataPath, activeRoomCodes, backupRoot);

    // 9. Clean up discover-cache.json
    const discoverCachePath = path.join(userDataPath, "discover-cache.json");
    if (fs.existsSync(discoverCachePath)) {
      moveToLegacyBackup(discoverCachePath, backupRoot, "discover-cache.json");
    }

    // Mark migration complete
    appConfigDb
      .prepare("INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)")
      .run(
        "sqlite_cas_migration_v1",
        JSON.stringify({ migratedAt: Date.now(), durationMs: Date.now() - startTime }),
        Date.now()
      );

    MigrationService._cleanupStrayLegacyFiles(userDataPath, dbManager, appConfigDb);

    console.log(
      `[MigrationService] Completed SQLite + CAS migration for ${userDataPath} in ${Date.now() - startTime}ms`
    );
  }

  static _cleanupStrayLegacyFiles(userDataPath, dbManager = null, passedAppConfigDb = null) {
    const backupRoot = path.join(userDataPath, "backups", "legacy-json-v1");
    try {
      const appConfigDb = passedAppConfigDb || (dbManager ? dbManager.getGlobalDb("app_config") : null);
      if (appConfigDb) {
        const cleanupRow = appConfigDb
          .prepare("SELECT value_json FROM app_settings WHERE key = 'legacy_stray_cleanup_v2'")
          .get();
        if (cleanupRow) return;
      }

      const entries = fs.readdirSync(userDataPath);
      for (const name of entries) {
        if (
          (name.startsWith("history_") && name.endsWith(".json")) ||
          (name.startsWith("servers.json.") && name.endsWith(".tmp")) ||
          (name.startsWith("profile.json.") && name.endsWith(".tmp"))
        ) {
          const full = path.join(userDataPath, name);
          if (name.endsWith(".tmp")) {
            try {
              fs.unlinkSync(full);
            } catch {}
          } else {
            moveToLegacyBackup(full, backupRoot, path.join("history", name));
          }
        }
      }

      // Clean up any orphan server folders that do not belong to any joined server,
      // and compact any oversized server.db (>1 MB) by extracting nested data: URIs into CAS + VACUUM
      if (dbManager) {
        const cas = CasStore.getInstance(userDataPath);
        const serversListDb = dbManager.getGlobalDb("servers_list");
        const joinedRows = serversListDb.prepare("SELECT room_code FROM joined_servers").all();
        const joinedSet = new Set(joinedRows.map((r) => String(r.room_code).toUpperCase()));
        if (joinedSet.size > 0) {
          const serversDir = path.join(userDataPath, "servers");
          if (fs.existsSync(serversDir)) {
            for (const entry of fs.readdirSync(serversDir, { withFileTypes: true })) {
              if (!entry.isDirectory()) continue;
              const code = entry.name.toUpperCase();
              if (!joinedSet.has(code)) {
                dbManager.purgeServerFolder(code);
                continue;
              }
              const sDbPath = path.join(serversDir, entry.name, "server.db");
              if (fs.existsSync(sDbPath) && fs.statSync(sDbPath).size > 1024 * 1024) {
                try {
                  const sDb = dbManager.getServerDb(code, "server");
                  const logs = sDb.prepare("SELECT id, details_json FROM audit_logs WHERE details_json LIKE '%data:%'").all();
                  const updLog = sDb.prepare("UPDATE audit_logs SET details_json = ? WHERE id = ?");
                  for (const l of logs) {
                    const obj = cas.ingestObject(JSON.parse(l.details_json));
                    updLog.run(JSON.stringify(obj), l.id);
                  }
                  const mems = sDb.prepare("SELECT user_id, extra_json FROM members WHERE extra_json LIKE '%data:%'").all();
                  const updMem = sDb.prepare("UPDATE members SET extra_json = ? WHERE user_id = ?");
                  for (const m of mems) {
                    const obj = cas.ingestObject(JSON.parse(m.extra_json));
                    updMem.run(JSON.stringify(obj), m.user_id);
                  }
                  const cfgs = sDb.prepare("SELECT room_code, discover_config_json, music_json FROM server_config WHERE discover_config_json LIKE '%data:%' OR music_json LIKE '%data:%'").all();
                  const updCfg = sDb.prepare("UPDATE server_config SET discover_config_json = ?, music_json = ? WHERE room_code = ?");
                  for (const c of cfgs) {
                    const dObj = c.discover_config_json ? JSON.stringify(cas.ingestObject(JSON.parse(c.discover_config_json))) : null;
                    const mObj = c.music_json ? JSON.stringify(cas.ingestObject(JSON.parse(c.music_json))) : null;
                    updCfg.run(dObj, mObj, c.room_code);
                  }
                  sDb.exec("VACUUM");
                } catch {}
              }
            }
          }
        }
      }

      if (appConfigDb) {
        appConfigDb
          .prepare("INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)")
          .run(
            "legacy_stray_cleanup_v2",
            JSON.stringify({ cleanedAt: Date.now() }),
            Date.now()
          );
      }
    } catch {}
  }

  static _migrateProfile(dbManager, cas, p) {
    const now = Number(p.updatedAt) || Date.now();
    const profileDb = dbManager.getGlobalDb("profile");
    const appConfigDb = dbManager.getGlobalDb("app_config");
    const activityDb = dbManager.getGlobalDb("activity");
    const serversListDb = dbManager.getGlobalDb("servers_list");

    const avatarRef = cas.storeDataUri(p.avatar || null);
    const bannerRef = cas.storeDataUri(p.banner || null);

    profileDb
      .prepare(`
        INSERT OR REPLACE INTO main_profile (
          id, user_id, nickname, custom_status, status_state,
          avatar_ref, banner_ref, nameplate_style, avatar_effect,
          profile_bg, card_style, accent_color, primary_color,
          bio, pronouns, social_links_json, extra_json, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        String(p.id || "local-user"),
        String(p.nickname || "Usuario"),
        p.customStatus || "",
        p.status || "online",
        avatarRef,
        bannerRef,
        p.nameplateStyle || null,
        p.avatarEffect || null,
        p.profileBg || null,
        p.cardStyle || null,
        p.profileColor || "",
        p.primaryColor || "",
        p.bio || "",
        p.pronouns || "",
        JSON.stringify({ customLink: p.customLink || "" }),
        JSON.stringify({ showRichPresence: p.showRichPresence ?? true }),
        now
      );

    // Server profile overrides
    if (p.serverProfiles && typeof p.serverProfiles === "object") {
      const insertOverride = profileDb.prepare(`
        INSERT OR REPLACE INTO server_profile_overrides (
          room_code, nickname, avatar_ref, banner_ref, bio, accent_color, card_style, extra_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const tx = profileDb.transaction((entries) => {
        for (const [roomCode, ov] of entries) {
          if (!ov || typeof ov !== "object") continue;
          const cleanCode = String(roomCode).trim().toUpperCase();
          const ovAvatar = cas.storeDataUri(ov.avatar || null);
          const ovBanner = cas.storeDataUri(ov.banner || null);
          insertOverride.run(
            cleanCode,
            ov.nickname || null,
            ovAvatar,
            ovBanner,
            ov.bio || null,
            ov.profileColor || ov.accentColor || null,
            ov.cardStyle || null,
            JSON.stringify({
              customLink: ov.customLink || "",
              customStatus: ov.customStatus || "",
            }),
            Number(ov.updatedAt) || now
          );
        }
      });
      tx(Object.entries(p.serverProfiles));
    }

    // App Settings (audio, general, keybindings, overlay, showRichPresence)
    const upsertSetting = appConfigDb.prepare(`
      INSERT OR REPLACE INTO app_settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
    `);
    const settingsTx = appConfigDb.transaction(() => {
      if (p.audio) upsertSetting.run("audio", JSON.stringify(p.audio), now);
      if (p.general) upsertSetting.run("general", JSON.stringify(p.general), now);
      if (p.keybindings) upsertSetting.run("keybindings", JSON.stringify(p.keybindings), now);
      if (p.overlay) upsertSetting.run("overlay", JSON.stringify(p.overlay), now);
      upsertSetting.run("showRichPresence", JSON.stringify(p.showRichPresence ?? true), now);
    });
    settingsTx();

    // Custom games -> activity.db
    if (Array.isArray(p.customGames) && p.customGames.length > 0) {
      const insertGame = activityDb.prepare(`
        INSERT OR REPLACE INTO custom_games (exe_path, custom_name, cover_ref, extra_json, added_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      const gameTx = activityDb.transaction((games) => {
        for (const g of games) {
          if (!g) continue;
          const key = String(g.exePath || g.path || g.id || g.name || "");
          if (!key) continue;
          const coverRef = cas.storeDataUri(g.cover || g.icon || null);
          const copy = { ...g };
          if (coverRef) {
            if (copy.cover) copy.cover = coverRef;
            if (copy.icon) copy.icon = coverRef;
          }
          insertGame.run(key, String(g.name || key), coverRef, JSON.stringify(copy), now);
        }
      });
      gameTx(p.customGames);
    }

    // Server folders -> servers_list.db
    if (Array.isArray(p.serverFolders) && p.serverFolders.length > 0) {
      const insertFolder = serversListDb.prepare(`
        INSERT OR REPLACE INTO server_folders (folder_id, name, color, position)
        VALUES (?, ?, ?, ?)
      `);
      const folderTx = serversListDb.transaction((folders) => {
        folders.forEach((f, idx) => {
          if (!f || !f.id) return;
          insertFolder.run(
            String(f.id),
            String(f.name || "Carpeta"),
            f.color || null,
            idx
          );
        });
      });
      folderTx(p.serverFolders);
    }

    // Per-server Flames -> servers/<ROOM_CODE>/flames.db
    if (p.flame && typeof p.flame === "object" && p.id) {
      for (const [srvKey, flameObj] of Object.entries(p.flame)) {
        const cleanCode = String(srvKey).trim().toUpperCase();
        // Only migrate valid 8-hex roomCodes into server folders
        if (!/^[A-F0-9]{8}$/.test(cleanCode) || !flameObj) continue;
        try {
          const flamesDb = dbManager.getServerDb(cleanCode, "flames");
          flamesDb
            .prepare(`
              INSERT OR REPLACE INTO member_flames (
                user_id, current_streak, max_streak, tier, last_active_date,
                active_seconds_today, ignited_today, extra_json, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              String(p.id),
              Number(flameObj.currentStreak) || 0,
              Number(flameObj.highestStreak || flameObj.currentStreak) || 0,
              flameObj.tier || "none",
              flameObj.lastInteractionDate || null,
              Number(flameObj.activeSecondsToday) || 0,
              flameObj.ignitedToday ? 1 : 0,
              JSON.stringify(flameObj),
              now
            );
        } catch {}
      }
    }
  }

  static _migrateServersAndMeta(dbManager, cas, userDataPath, localUserId, backupRoot) {
    const serversPath = path.join(userDataPath, "servers.json");
    const bakPath = path.join(userDataPath, "servers.json.bak");
    const roomMetaDir = path.join(userDataPath, "room-meta");

    let serversData = safeReadJson(serversPath);
    if (!serversData || !Array.isArray(serversData.servers) || serversData.servers.length === 0) {
      const bakData = safeReadJson(bakPath);
      if (bakData && Array.isArray(bakData.servers) && bakData.servers.length > 0) {
        serversData = bakData;
      }
    }
    if (!serversData || typeof serversData !== "object") {
      serversData = { servers: [], lastServerId: null };
    }

    const serversByCode = new Map();
    if (Array.isArray(serversData.servers)) {
      for (const s of serversData.servers) {
        if (!s) continue;
        const code = String(s.roomCode || s.id || "").trim().toUpperCase();
        if (/^[A-F0-9]{8}$/.test(code)) {
          serversByCode.set(code, s);
        }
      }
    }

    const metasByCode = new Map();
    if (fs.existsSync(roomMetaDir)) {
      try {
        const files = fs.readdirSync(roomMetaDir);
        for (const f of files) {
          if (!f.endsWith(".json")) continue;
          const code = f.replace(/\.json$/i, "").trim().toUpperCase();
          if (!/^[A-F0-9]{8}$/.test(code)) continue;
          const meta = safeReadJson(path.join(roomMetaDir, f));
          if (meta && typeof meta === "object") {
            metasByCode.set(code, meta);
            if (!serversByCode.has(code) && localUserId && meta.savedMembers?.[localUserId]) {
              const isBanned = Array.isArray(meta.bannedUsers) && meta.bannedUsers.includes(localUserId);
              if (!isBanned) {
                serversByCode.set(code, {
                  id: code,
                  roomCode: code,
                  name: meta.name || `Servidor ${code.slice(0, 4)}`,
                  ownerId: meta.ownerId || null,
                  creatorId: meta.creatorID || meta.creatorId || meta.ownerId || null,
                  creatorID: meta.creatorID || meta.creatorId || meta.ownerId || null,
                  isOwner: Boolean(meta.ownerId && meta.ownerId === localUserId),
                  icon: meta.icon || null,
                  banner: meta.banner || null,
                  channels: meta.channels || [],
                  roles: meta.roles || [],
                  userRoles: meta.userRoles || {},
                  plugins: meta.plugins || [],
                  joinedAt: meta.savedMembers[localUserId]?.joinedAt || Date.now(),
                  lastVisitedAt: Date.now(),
                });
              }
            }
          }
        }
      } catch {}
    }

    const serversListDb = dbManager.getGlobalDb("servers_list");
    const insertJoined = serversListDb.prepare(`
      INSERT OR REPLACE INTO joined_servers (
        room_code, name, icon_ref, banner_ref, owner_id, creator_id, is_owner,
        position, folder_id, muted, last_read_channel_id, joined_at, last_visited_at, extra_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const allCodes = new Set([...serversByCode.keys(), ...metasByCode.keys()]);
    let pos = 0;

    for (const code of allCodes) {
      const srv = serversByCode.get(code);
      const meta = metasByCode.get(code) || {};
      const now = Date.now();

      const rawIcon = meta.icon ?? srv?.icon ?? null;
      const rawBanner = meta.banner ?? srv?.banner ?? null;
      const iconRef = cas.storeDataUri(rawIcon);
      const bannerRef = cas.storeDataUri(rawBanner);

      const resolvedOwnerId = meta.ownerId || srv?.ownerId || null;
      const resolvedCreatorId =
        meta.creatorID || meta.creatorId || srv?.creatorID || srv?.creatorId || resolvedOwnerId || null;
      const isOwner =
        srv?.isOwner !== undefined
          ? Boolean(srv.isOwner)
          : Boolean(localUserId && resolvedOwnerId === localUserId);
      const name = String(meta.name || srv?.name || `Servidor ${code.slice(0, 4)}`).trim();

      if (srv) {
        const extraSrv = {
          createdAt: srv.createdAt || srv.joinedAt || now,
          metaVersion: Math.max(meta.version || 0, srv.metaVersion || 0),
          metaUpdatedAt: Math.max(meta.updatedAt || 0, srv.metaUpdatedAt || 0),
        };
        insertJoined.run(
          code,
          name,
          iconRef,
          bannerRef,
          resolvedOwnerId,
          resolvedCreatorId,
          isOwner ? 1 : 0,
          pos++,
          srv.folderId || null,
          srv.muted ? 1 : 0,
          srv.lastChannelId || "general",
          Number(srv.joinedAt || srv.createdAt) || now,
          Number(srv.lastVisitedAt) || now,
          JSON.stringify(extraSrv)
        );
      }

      // Populate servers/<CODE>/server.db
      MigrationService._populateServerDb(
        dbManager,
        cas,
        code,
        srv,
        meta,
        name,
        iconRef,
        bannerRef,
        resolvedOwnerId,
        resolvedCreatorId
      );
    }

    if (serversData.lastServerId) {
      serversListDb
        .prepare("INSERT OR REPLACE INTO navigation_state (key, value) VALUES ('lastServerId', ?)")
        .run(String(serversData.lastServerId).trim().toUpperCase());
    }

    moveToLegacyBackup(serversPath, backupRoot, "servers.json");
    moveToLegacyBackup(bakPath, backupRoot, "servers.json.bak");
    if (fs.existsSync(roomMetaDir)) {
      moveToLegacyBackup(roomMetaDir, backupRoot, "room-meta");
    }

    return allCodes;
  }

  static _populateServerDb(
    dbManager,
    cas,
    code,
    srv,
    meta,
    name,
    iconRef,
    bannerRef,
    ownerId,
    creatorId
  ) {
    const serverDb = dbManager.getServerDb(code, "server");
    const flamesDb = dbManager.getServerDb(code, "flames");
    const addonsDb = dbManager.getServerDb(code, "addons");
    const now = Date.now();

    const rawDiscoverCfg = meta.discoverConfig ?? srv?.discoverConfig ?? null;
    const discoverCfg = rawDiscoverCfg ? cas.ingestObject(rawDiscoverCfg) : null;
    const defaultRoleCfg = meta.defaultRoleSettings ?? srv?.defaultRoleSettings ?? { enabled: false, roleId: null };
    const welcomeCfg = meta.welcomeSettings ?? srv?.welcomeSettings ?? {
      enabled: false,
      channelId: null,
      template: "¡Bienvenido {user} a {server}! 🎉",
    };
    const iceServers = meta.iceServers ?? srv?.iceServers ?? [];
    const rawMusicObj = meta.music ?? srv?.music ?? null;
    const musicObj = rawMusicObj ? cas.ingestObject(rawMusicObj) : null;

    const tx = serverDb.transaction(() => {
      serverDb
        .prepare(`
          INSERT OR REPLACE INTO server_config (
            room_code, name, description, icon_ref, banner_ref, owner_id, creator_id,
            discoverable, discover_category, discover_language, discover_tags_json, discover_config_json,
            disable_flame_system, group_by_roles, allow_executable_files,
            ice_servers_json, direct_connection_enabled, direct_ip, direct_port,
            default_role_settings_json, welcome_settings_json, music_json,
            version, updated_by, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          code,
          name,
          discoverCfg?.description || "",
          iconRef,
          bannerRef,
          ownerId,
          creatorId,
          discoverCfg?.enabled ? 1 : 0,
          discoverCfg?.category || null,
          discoverCfg?.language || null,
          JSON.stringify(discoverCfg?.tags || []),
          discoverCfg ? JSON.stringify(discoverCfg) : null,
          (meta.disableFlameSystem ?? srv?.disableFlameSystem) ? 1 : 0,
          (meta.groupByRoles ?? srv?.groupByRoles) ? 1 : 0,
          (meta.allowExecutableFiles ?? srv?.allowExecutableFiles) ? 1 : 0,
          JSON.stringify(iceServers),
          (meta.directConnectionEnabled ?? srv?.directConnectionEnabled) ? 1 : 0,
          meta.directIP ?? srv?.directIP ?? "",
          Number(meta.directPort ?? srv?.directPort) || 7777,
          JSON.stringify(defaultRoleCfg),
          JSON.stringify(welcomeCfg),
          musicObj ? JSON.stringify(musicObj) : null,
          Number(meta.version ?? srv?.metaVersion) || 0,
          meta.updatedBy || ownerId || null,
          Number(meta.updatedAt ?? srv?.metaUpdatedAt) || now
        );

      // Channels
      const channels = Array.isArray(meta.channels) && meta.channels.length > 0
        ? meta.channels
        : Array.isArray(srv?.channels) && srv.channels.length > 0
        ? srv.channels
        : [
            { id: "general", type: "text", name: "general" },
            { id: "voice-lounge", type: "voice", name: "Voice Lounge" },
          ];
      const insertChannel = serverDb.prepare(`
        INSERT OR REPLACE INTO channels (
          id, name, type, category_id, position, topic, nsfw, slowmode_sec, permissions_json, plugin_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      channels.forEach((ch, idx) => {
        if (!ch || !ch.id) return;
        insertChannel.run(
          String(ch.id),
          String(ch.name || ch.id),
          String(ch.type || "text"),
          ch.parentId || ch.category_id || null,
          idx,
          ch.topic || null,
          ch.nsfw ? 1 : 0,
          Number(ch.slowmodeSec) || 0,
          JSON.stringify({
            isPrivate: Boolean(ch.isPrivate),
            allowedRoles: Array.isArray(ch.allowedRoles) ? ch.allowedRoles : [],
            hasSpeakRestrictions: Boolean(ch.hasSpeakRestrictions),
            disallowedSpeakRoles: Array.isArray(ch.disallowedSpeakRoles) ? ch.disallowedSpeakRoles : [],
          }),
          ch.pluginId || null,
          now
        );
      });

      // Roles
      const roles = Array.isArray(meta.roles) ? meta.roles : Array.isArray(srv?.roles) ? srv.roles : [];
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

      // Members (from meta.savedMembers)
      const savedMembers = meta.savedMembers && typeof meta.savedMembers === "object" ? meta.savedMembers : {};
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

        // If member has a flame record in this server, store in flames.db
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

      // Member Roles (from meta.userRoles)
      const userRoles = meta.userRoles ?? srv?.userRoles ?? {};
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

      // Moderation (bannedUsers & kickedUsers)
      const bannedUsers = Array.isArray(meta.bannedUsers)
        ? meta.bannedUsers
        : Array.isArray(srv?.bannedUsers)
        ? srv.bannedUsers
        : [];
      const kickedUsers = meta.kickedUsers ?? srv?.kickedUsers ?? {};
      const insertMod = serverDb.prepare(`
        INSERT OR REPLACE INTO moderation (
          user_id, action_type, reason, moderator_id, nickname_snapshot, avatar_ref_snapshot, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const [kId, kTime] of Object.entries(kickedUsers)) {
        if (!kId) continue;
        insertMod.run(String(kId), "kick", null, null, null, null, Number(kTime) || now);
      }
      for (const bId of bannedUsers) {
        if (!bId) continue;
        insertMod.run(String(bId), "ban", null, null, null, null, now);
      }

      // Webhooks
      const webhooks = Array.isArray(meta.webhooks)
        ? meta.webhooks
        : Array.isArray(srv?.webhooks)
        ? srv.webhooks
        : [];
      const insertWh = serverDb.prepare(`
        INSERT OR REPLACE INTO webhooks (
          id, channel_id, name, avatar_ref, token_hash, type, target_url, interval_seconds, extra_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const wh of webhooks) {
        if (!wh || !wh.id) continue;
        const whAvatar = cas.storeDataUri(wh.avatar || null);
        const copyWh = { ...wh, avatar: whAvatar };
        insertWh.run(
          String(wh.id),
          String(wh.channelId || "general"),
          String(wh.name || "Webhook"),
          whAvatar,
          String(wh.tokenHash || ""),
          String(wh.type || "incoming"),
          wh.targetUrl || null,
          Number(wh.intervalSeconds) || 300,
          JSON.stringify(copyWh),
          Number(wh.createdAt) || now
        );
      }

      // Audit logs
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

    // Server enabled addons -> servers/<CODE>/addons.db
    const plugins = Array.isArray(meta.plugins)
      ? meta.plugins
      : Array.isArray(srv?.plugins)
      ? srv.plugins
      : [];
    if (plugins.length > 0) {
      const insertAddon = addonsDb.prepare(`
        INSERT OR REPLACE INTO server_enabled_addons (plugin_id, enabled, config_json, enabled_by, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      const addonTx = addonsDb.transaction((list) => {
        for (const pl of list) {
          if (!pl) continue;
          const pId = String(pl.id || pl.name || "").trim();
          if (!pId) continue;
          const copyPl = cas.ingestObject(pl);
          insertAddon.run(
            pId,
            pl.enabled !== false ? 1 : 0,
            JSON.stringify(copyPl),
            null,
            now
          );
        }
      });
      addonTx(plugins);
    }
  }

  static _migrateChats(dbManager, cas, userDataPath, localUserId, activeRoomCodes, backupRoot) {
    const chatsDir = path.join(userDataPath, "chats");
    if (!fs.existsSync(chatsDir)) return;

    try {
      const roomDirs = fs.readdirSync(chatsDir, { withFileTypes: true });
      for (const entry of roomDirs) {
        if (!entry.isDirectory()) continue;
        const code = entry.name.trim().toUpperCase();
        if (activeRoomCodes && activeRoomCodes.size > 0 && !activeRoomCodes.has(code)) continue;
        const roomChatDir = path.join(chatsDir, entry.name);

        // Only migrate rooms that are active or exist in chats/
        const msgDb = dbManager.getServerDb(code, "messages");
        const files = fs.readdirSync(roomChatDir);

        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          const fullPath = path.join(roomChatDir, file);
          const parsed = safeReadJson(fullPath);
          if (!parsed) continue;

          if (file === "_tombstones.json" && Array.isArray(parsed)) {
            const insertTomb = msgDb.prepare(`
              INSERT OR REPLACE INTO tombstones (message_id, channel_id, deleted_by, deleted_at)
              VALUES (?, NULL, NULL, ?)
            `);
            const now = Date.now();
            const tx = msgDb.transaction((ids) => {
              for (const id of ids) {
                if (id) insertTomb.run(String(id), now);
              }
            });
            tx(parsed);
            continue;
          }

          const channelId = file.replace(/\.json$/i, "");
          const messages = Array.isArray(parsed)
            ? parsed
            : Array.isArray(parsed.messages)
            ? parsed.messages
            : [];
          if (messages.length === 0) continue;

          if (channelId.startsWith("dm_")) {
            // Migrate to servers/<CODE>/dms/dm_<PEER>.db
            const parts = channelId.split("_");
            let peerId = channelId.slice(3);
            if (parts.length >= 3 && localUserId) {
              peerId = parts[1] === localUserId ? parts[2] : parts[1];
            }
            const dmDb = dbManager.getServerDmDb(code, peerId);
            const insertDmMsg = dmDb.prepare(`
              INSERT OR REPLACE INTO dm_messages (
                id, sender_id, sender_nickname, sender_avatar_ref, content, type,
                reply_to_id, attachments_json, reactions_json, pinned, edited_at, extra_json, timestamp
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const upsertMeta = dmDb.prepare(`
              INSERT OR REPLACE INTO dm_meta (
                peer_user_id, room_code, peer_nickname_snapshot, peer_avatar_ref_snapshot,
                last_read_message_id, unread_count, updated_at
              ) VALUES (?, ?, ?, ?, ?, 0, ?)
            `);

            const dmTx = dmDb.transaction((msgs) => {
              let lastMsgId = null;
              let peerNick = null;
              let peerAvatar = null;
              for (const m of msgs) {
                if (!m || !m.id) continue;
                const avRef = cas.storeDataUri(m.authorAvatar || null);
                const cleanMsg = { ...m, channelId, authorAvatar: avRef };
                if (m.authorId && m.authorId !== localUserId) {
                  peerNick = m.authorNickname || peerNick;
                  peerAvatar = avRef || peerAvatar;
                }
                lastMsgId = m.id;
                insertDmMsg.run(
                  String(m.id),
                  String(m.authorId || "unknown"),
                  m.authorNickname || null,
                  avRef,
                  m.text || "",
                  m.isSystemMessage ? "system" : "text",
                  m.replyToId || null,
                  m.filePath || m.fileName
                    ? JSON.stringify({
                        filePath: m.filePath,
                        fileName: m.fileName,
                        fileSize: m.fileSize,
                        fileType: m.fileType,
                      })
                    : null,
                  null,
                  m.pinned ? 1 : 0,
                  m.editedAt || null,
                  JSON.stringify(cleanMsg),
                  Number(m.timestamp) || Date.now()
                );
              }
              upsertMeta.run(peerId, code, peerNick, peerAvatar, channelId, Date.now());
            });
            dmTx(messages);
          } else {
            // Migrate to servers/<CODE>/messages.db
            const insertMsg = msgDb.prepare(`
              INSERT OR REPLACE INTO messages (
                id, channel_id, sender_id, sender_nickname, sender_avatar_ref, content, type,
                reply_to_id, thread_id, attachments_json, reactions_json, mentions_json,
                pinned, edited_at, extra_json, timestamp
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const tx = msgDb.transaction((msgs) => {
              for (const m of msgs) {
                if (!m || !m.id) continue;
                const avRef = cas.storeDataUri(m.authorAvatar || null);
                const cleanMsg = { ...m, channelId: m.channelId || channelId, authorAvatar: avRef };
                insertMsg.run(
                  String(m.id),
                  String(m.channelId || channelId),
                  String(m.authorId || "unknown"),
                  m.authorNickname || null,
                  avRef,
                  m.text || "",
                  m.isSystemMessage ? "system" : m.isWebhook ? "webhook" : m.isComplement ? "plugin" : "text",
                  m.replyToId || null,
                  m.threadParentId || null,
                  m.filePath || m.fileName
                    ? JSON.stringify({
                        filePath: m.filePath,
                        fileName: m.fileName,
                        fileSize: m.fileSize,
                        fileType: m.fileType,
                      })
                    : null,
                  null,
                  null,
                  m.pinned ? 1 : 0,
                  m.editedAt || null,
                  JSON.stringify(cleanMsg),
                  Number(m.timestamp) || Date.now()
                );
              }
            });
            tx(messages);
          }
        }
      }
      moveToLegacyBackup(chatsDir, backupRoot, "chats");
    } catch (err) {
      console.error("[MigrationService] Error migrating chats:", err.message);
    }
  }

  static _migrateFilesIndex(dbManager, userDataPath, activeRoomCodes, backupRoot) {
    const filesIndexDir = path.join(userDataPath, "files-index");
    if (!fs.existsSync(filesIndexDir)) return;

    try {
      const entries = fs.readdirSync(filesIndexDir);
      for (const file of entries) {
        if (!file.endsWith(".json")) continue;
        const code = file.replace(/\.json$/i, "").trim().toUpperCase();
        if (!/^[A-F0-9]{8}$/.test(code)) continue;
        if (activeRoomCodes && activeRoomCodes.size > 0 && !activeRoomCodes.has(code)) continue;

        const parsed = safeReadJson(path.join(filesIndexDir, file));
        const filesList = Array.isArray(parsed?.files) ? parsed.files : [];
        if (filesList.length === 0) continue;

        const msgDb = dbManager.getServerDb(code, "messages");
        const insertFile = msgDb.prepare(`
          INSERT OR REPLACE INTO shared_files (
            file_id, owner_id, name, size_bytes, mime_type, cas_hash, local_path, extra_json, uploaded_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const tx = msgDb.transaction((items) => {
          for (const f of items) {
            if (!f || !f.id) continue;
            const now = Date.now();
            insertFile.run(
              String(f.id),
              f.ownerId || null,
              String(f.name || "archivo"),
              Number(f.size) || 0,
              f.mimeType || null,
              null,
              f.realPath || null,
              JSON.stringify(f),
              Number(f.uploadedAt) || now,
              Number(f.updatedAt || f.uploadedAt) || now
            );
          }
        });
        tx(filesList);
      }
      moveToLegacyBackup(filesIndexDir, backupRoot, "files-index");
    } catch (err) {
      console.error("[MigrationService] Error migrating files-index:", err.message);
    }
  }

  static _migrateMusicHistory(dbManager, cas, userDataPath, activeRoomCodes, backupRoot) {
    try {
      const entries = fs.readdirSync(userDataPath);
      for (const file of entries) {
        if (!file.startsWith("history_") || !file.endsWith(".json")) continue;
        const rawId = file.slice("history_".length, -".json".length).trim();
        const code = rawId.toUpperCase();
        const fullPath = path.join(userDataPath, file);

        if (/^[A-F0-9]{8}$/.test(code) && (!activeRoomCodes || activeRoomCodes.size === 0 || activeRoomCodes.has(code))) {
          const tracks = safeReadJson(fullPath);
          if (Array.isArray(tracks) && tracks.length > 0) {
            const widgetsDb = dbManager.getServerDb(code, "widgets");
            const insertTrack = widgetsDb.prepare(`
              INSERT INTO music_history (
                track_id, title, author, duration, duration_seconds, thumbnail_ref,
                source, original_url, played_by_user_id, played_by_nickname, played_by_avatar_ref,
                played_by_json, played_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const tx = widgetsDb.transaction((list) => {
              // Insert oldest first so AUTOINCREMENT matches chronological order
              const ordered = [...list].reverse();
              for (const t of ordered) {
                if (!t || (!t.trackId && !t.id)) continue;
                const thumbRef = cas.storeDataUri(t.thumbnail || "");
                let pbAvatarRef = null;
                let cleanPlayedBy = null;
                if (t.playedBy && typeof t.playedBy === "object") {
                  pbAvatarRef = cas.storeDataUri(t.playedBy.avatar || null);
                  cleanPlayedBy = { ...t.playedBy, avatar: pbAvatarRef };
                }
                insertTrack.run(
                  String(t.trackId || t.id),
                  String(t.title || "Audio"),
                  String(t.author || "Unknown"),
                  String(t.duration || "0:00"),
                  Number(t.durationSeconds) || 0,
                  thumbRef,
                  String(t.source || "Audio"),
                  String(t.originalUrl || t.url || ""),
                  cleanPlayedBy?.id || null,
                  cleanPlayedBy?.nickname || cleanPlayedBy?.name || null,
                  pbAvatarRef,
                  cleanPlayedBy ? JSON.stringify(cleanPlayedBy) : null,
                  Number(t.playedAt) || Date.now()
                );
              }
            });
            tx(tracks);
          }
        }

        moveToLegacyBackup(fullPath, backupRoot, path.join("history", file));
      }
    } catch (err) {
      console.error("[MigrationService] Error migrating music history:", err.message);
    }
  }

  static _migrateStickers(dbManager, cas, userDataPath) {
    const stickersDir = path.join(userDataPath, "stickers");
    const packsDir = path.join(userDataPath, "sticker_packs");
    const stickersDb = dbManager.getGlobalDb("stickers");
    const now = Date.now();

    const hashByStickerId = new Map();

    if (fs.existsSync(stickersDir)) {
      try {
        const files = fs.readdirSync(stickersDir);
        const insertSticker = stickersDb.prepare(`
          INSERT OR REPLACE INTO stickers (
            sticker_id, pack_id, name, ext, cas_hash, is_favorite, use_count, last_used_at, added_at
          ) VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?)
        `);
        const tx = stickersDb.transaction((fileList) => {
          for (const file of fileList) {
            const ext = path.extname(file).slice(1).toLowerCase();
            if (!["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) continue;
            const id = path.basename(file, path.extname(file)).trim();
            const fullPath = path.join(stickersDir, file);
            try {
              const buf = fs.readFileSync(fullPath);
              const stored = cas.storeBuffer(buf, ext);
              if (stored) {
                hashByStickerId.set(id, { hash: stored.hash, ext: stored.ext });
                insertSticker.run(id, null, id, stored.ext, stored.hash, now);
              }
            } catch {}
          }
        });
        tx(files);
      } catch (err) {
        console.error("[MigrationService] Error migrating stickers:", err.message);
      }
    }

    if (fs.existsSync(packsDir)) {
      try {
        const packFiles = fs.readdirSync(packsDir);
        const insertPack = stickersDb.prepare(`
          INSERT OR REPLACE INTO sticker_packs (
            pack_id, name, author, icon_name, icon_ref, position, is_builtin, created_at
          ) VALUES (?, ?, ?, ?, NULL, ?, 0, ?)
        `);
        const updateStickerPack = stickersDb.prepare(`
          UPDATE stickers SET pack_id = ?, name = ? WHERE sticker_id = ?
        `);
        let pos = 0;
        for (const pFile of packFiles) {
          if (!pFile.endsWith(".onipkg") && !pFile.endsWith(".opk")) continue;
          const fullPackPath = path.join(packsDir, pFile);
          try {
            const rawBuf = fs.readFileSync(fullPackPath);
            let jsonStr = "";
            try {
              jsonStr = zlib.gunzipSync(rawBuf).toString("utf8");
            } catch {
              jsonStr = rawBuf.toString("utf8");
            }
            const pack = JSON.parse(jsonStr);
            if (pack && pack.name) {
              const packId = path.basename(pFile, path.extname(pFile));
              insertPack.run(
                packId,
                String(pack.name),
                pack.author || null,
                pack.iconName || null,
                pos++,
                now
              );
              if (Array.isArray(pack.stickers)) {
                for (const stk of pack.stickers) {
                  if (stk?.id) {
                    updateStickerPack.run(packId, String(stk.name || stk.id), String(stk.id).trim());
                  }
                }
              }
            }
          } catch {}
        }
      } catch {}
    }
  }

  static _migrateAddons(dbManager, userDataPath, activeRoomCodes, backupRoot) {
    const addonsDb = dbManager.getGlobalDb("addons");
    const pluginsDir = path.join(userDataPath, "plugins");
    const uninstalledPath = path.join(userDataPath, "uninstalled-plugins.json");
    const now = Date.now();

    const uninstalledSet = new Set();
    const rawUninstalled = safeReadJson(uninstalledPath);
    if (Array.isArray(rawUninstalled)) {
      for (const id of rawUninstalled) {
        if (id) uninstalledSet.add(String(id).trim().toLowerCase());
      }
    }

    if (fs.existsSync(pluginsDir)) {
      try {
        const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
        const insertInstalled = addonsDb.prepare(`
          INSERT OR REPLACE INTO installed_addons (
            plugin_id, name, version, author, enabled_globally, uninstalled, manifest_json, installed_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const entry of entries) {
          if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
          const manifestPath = path.join(pluginsDir, entry.name, "manifest.json");
          const manifest = safeReadJson(manifestPath);
          if (!manifest) continue;
          const pId = String(manifest.id || entry.name).trim();
          const isUninstalled =
            uninstalledSet.has(pId.toLowerCase()) || uninstalledSet.has(entry.name.toLowerCase());

          insertInstalled.run(
            pId,
            String(manifest.name || pId),
            String(manifest.version || "1.0.0"),
            manifest.author || null,
            manifest.enabled !== false ? 1 : 0,
            isUninstalled ? 1 : 0,
            JSON.stringify(manifest),
            now,
            now
          );
        }

        // Also record any explicitly uninstalled plugin IDs not on disk
        for (const uId of uninstalledSet) {
          const existing = addonsDb
            .prepare("SELECT plugin_id FROM installed_addons WHERE LOWER(plugin_id) = ?")
            .get(uId);
          if (!existing) {
            insertInstalled.run(uId, uId, "0.0.0", null, 0, 1, "{}", now, now);
          }
        }

        // Migrate plugins/.storage/*.json
        const storageDir = path.join(pluginsDir, ".storage");
        if (fs.existsSync(storageDir)) {
          const sFiles = fs.readdirSync(storageDir);
          const insertGlobalStorage = addonsDb.prepare(`
            INSERT OR REPLACE INTO global_addon_storage (plugin_id, storage_key, value_json, updated_at)
            VALUES (?, ?, ?, ?)
          `);
          for (const sf of sFiles) {
            if (!sf.endsWith(".json")) continue;
            const pluginId = path.basename(sf, ".json");
            const storeObj = safeReadJson(path.join(storageDir, sf));
            if (storeObj && typeof storeObj === "object") {
              for (const [k, v] of Object.entries(storeObj)) {
                const valJson = JSON.stringify(v);
                insertGlobalStorage.run(pluginId, k, valJson, now);
                // Seed existing server addon storage so existing servers keep their prior data
                for (const code of activeRoomCodes) {
                  try {
                    const srvAddonsDb = dbManager.getServerDb(code, "addons");
                    srvAddonsDb
                      .prepare(`
                        INSERT OR IGNORE INTO addon_server_storage (plugin_id, storage_key, value_json, updated_at)
                        VALUES (?, ?, ?, ?)
                      `)
                      .run(pluginId, k, valJson, now);
                  } catch {}
                }
              }
            }
          }
          moveToLegacyBackup(storageDir, backupRoot, "plugins-storage");
        }
      } catch (err) {
        console.error("[MigrationService] Error migrating addons:", err.message);
      }
    }

    if (fs.existsSync(uninstalledPath)) {
      moveToLegacyBackup(uninstalledPath, backupRoot, "uninstalled-plugins.json");
    }
  }
}

module.exports = { MigrationService };
