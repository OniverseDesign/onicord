const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const GLOBAL_SCHEMAS = {
  app_config: `
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS downloads (
      download_id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT,
      source_room_code TEXT,
      downloaded_at INTEGER NOT NULL
    );
  `,
  profile: `
    CREATE TABLE IF NOT EXISTS main_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      user_id TEXT NOT NULL,
      nickname TEXT NOT NULL,
      custom_status TEXT,
      status_state TEXT NOT NULL DEFAULT 'online',
      avatar_ref TEXT,
      banner_ref TEXT,
      nameplate_style TEXT,
      avatar_effect TEXT,
      profile_bg TEXT,
      card_style TEXT,
      accent_color TEXT,
      primary_color TEXT,
      bio TEXT,
      pronouns TEXT,
      social_links_json TEXT,
      extra_json TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS server_profile_overrides (
      room_code TEXT PRIMARY KEY,
      nickname TEXT,
      avatar_ref TEXT,
      banner_ref TEXT,
      bio TEXT,
      accent_color TEXT,
      card_style TEXT,
      extra_json TEXT,
      updated_at INTEGER NOT NULL
    );
  `,
  activity: `
    CREATE TABLE IF NOT EXISTS game_playtime (
      game_key TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      cover_ref TEXT,
      activity_type TEXT NOT NULL DEFAULT 'Playing',
      total_seconds INTEGER NOT NULL DEFAULT 0,
      last_played_at INTEGER NOT NULL,
      sessions_count INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS custom_games (
      exe_path TEXT PRIMARY KEY,
      custom_name TEXT NOT NULL,
      cover_ref TEXT,
      extra_json TEXT,
      added_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity_sessions_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_key TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER NOT NULL,
      duration_seconds INTEGER NOT NULL
    );
  `,
  stickers: `
    CREATE TABLE IF NOT EXISTS sticker_packs (
      pack_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      author TEXT,
      icon_name TEXT,
      icon_ref TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      is_builtin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stickers (
      sticker_id TEXT PRIMARY KEY,
      pack_id TEXT,
      name TEXT NOT NULL,
      ext TEXT NOT NULL,
      cas_hash TEXT NOT NULL,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      use_count INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      added_at INTEGER NOT NULL,
      FOREIGN KEY (pack_id) REFERENCES sticker_packs(pack_id) ON DELETE SET NULL
    );
  `,
  addons: `
    CREATE TABLE IF NOT EXISTS installed_addons (
      plugin_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      author TEXT,
      enabled_globally INTEGER NOT NULL DEFAULT 1,
      uninstalled INTEGER NOT NULL DEFAULT 0,
      manifest_json TEXT NOT NULL,
      installed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS global_addon_storage (
      plugin_id TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (plugin_id, storage_key)
    );
  `,
  dashboard: `
    CREATE TABLE IF NOT EXISTS dashboard_islands (
      island_id TEXT PRIMARY KEY,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      w INTEGER NOT NULL,
      h INTEGER NOT NULL,
      visible INTEGER NOT NULL DEFAULT 1,
      config_json TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS personal_widget_state (
      widget_id TEXT NOT NULL,
      state_key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (widget_id, state_key)
    );
  `,
  servers_list: `
    CREATE TABLE IF NOT EXISTS joined_servers (
      room_code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon_ref TEXT,
      banner_ref TEXT,
      owner_id TEXT,
      creator_id TEXT,
      is_owner INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      folder_id TEXT,
      muted INTEGER NOT NULL DEFAULT 0,
      last_read_channel_id TEXT,
      joined_at INTEGER NOT NULL,
      last_visited_at INTEGER,
      extra_json TEXT
    );
    CREATE TABLE IF NOT EXISTS server_folders (
      folder_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS navigation_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `,
  discover: `
    CREATE TABLE IF NOT EXISTS discovered_servers (
      room_code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      language TEXT,
      member_count INTEGER NOT NULL DEFAULT 0,
      online_count INTEGER NOT NULL DEFAULT 0,
      icon_ref TEXT,
      banner_ref TEXT,
      tags_json TEXT,
      extra_json TEXT,
      last_seen_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cas_index (
      hash TEXT PRIMARY KEY,
      ext TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      last_accessed_at INTEGER NOT NULL
    );
  `,
};

const SERVER_SCHEMAS = {
  server: `
    CREATE TABLE IF NOT EXISTS server_config (
      room_code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      icon_ref TEXT,
      banner_ref TEXT,
      owner_id TEXT,
      creator_id TEXT,
      owner_secret_hash TEXT,
      discoverable INTEGER NOT NULL DEFAULT 0,
      discover_category TEXT,
      discover_language TEXT,
      discover_tags_json TEXT,
      discover_config_json TEXT,
      system_channel_id TEXT,
      rules_text TEXT,
      disable_flame_system INTEGER NOT NULL DEFAULT 0,
      group_by_roles INTEGER NOT NULL DEFAULT 0,
      allow_executable_files INTEGER NOT NULL DEFAULT 0,
      ice_servers_json TEXT,
      direct_connection_enabled INTEGER NOT NULL DEFAULT 0,
      direct_ip TEXT,
      direct_port INTEGER NOT NULL DEFAULT 7777,
      default_role_settings_json TEXT,
      welcome_settings_json TEXT,
      afk_settings_json TEXT,
      music_json TEXT,
      version INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      category_id TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      topic TEXT,
      nsfw INTEGER NOT NULL DEFAULT 0,
      slowmode_sec INTEGER NOT NULL DEFAULT 0,
      permissions_json TEXT,
      plugin_id TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      hoist INTEGER NOT NULL DEFAULT 0,
      permissions_json TEXT NOT NULL,
      extra_json TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS members (
      user_id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      avatar_ref TEXT,
      banner_ref TEXT,
      card_style TEXT,
      accent_color TEXT,
      bio TEXT,
      status TEXT DEFAULT 'offline',
      extra_json TEXT,
      joined_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS member_roles (
      user_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (user_id, role_id)
    );
    CREATE TABLE IF NOT EXISTS moderation (
      user_id TEXT PRIMARY KEY,
      action_type TEXT NOT NULL,
      reason TEXT,
      moderator_id TEXT,
      nickname_snapshot TEXT,
      avatar_ref_snapshot TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar_ref TEXT,
      token_hash TEXT NOT NULL,
      type TEXT DEFAULT 'incoming',
      target_url TEXT,
      interval_seconds INTEGER DEFAULT 300,
      extra_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS webhook_feed_cache (
      webhook_id TEXT NOT NULL,
      item_guid TEXT NOT NULL,
      seen_at INTEGER NOT NULL,
      PRIMARY KEY (webhook_id, item_guid)
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      action TEXT NOT NULL,
      target_id TEXT,
      details_json TEXT,
      created_at INTEGER NOT NULL
    );
  `,
  flames: `
    CREATE TABLE IF NOT EXISTS member_flames (
      user_id TEXT PRIMARY KEY,
      current_streak INTEGER NOT NULL DEFAULT 0,
      max_streak INTEGER NOT NULL DEFAULT 0,
      tier TEXT DEFAULT 'none',
      last_active_date TEXT,
      active_seconds_today INTEGER NOT NULL DEFAULT 0,
      ignited_today INTEGER NOT NULL DEFAULT 0,
      extra_json TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS flame_daily_history (
      date_str TEXT PRIMARY KEY,
      active_seconds INTEGER NOT NULL DEFAULT 0,
      messages_sent INTEGER NOT NULL DEFAULT 0,
      voice_seconds INTEGER NOT NULL DEFAULT 0,
      streak_snapshot INTEGER NOT NULL DEFAULT 0
    );
  `,
  addons: `
    CREATE TABLE IF NOT EXISTS server_enabled_addons (
      plugin_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 1,
      config_json TEXT,
      enabled_by TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS addon_server_storage (
      plugin_id TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (plugin_id, storage_key)
    );
    CREATE TABLE IF NOT EXISTS addon_events_log (
      event_id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      channel_id TEXT,
      sender_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_addon_events_plugin ON addon_events_log(plugin_id, created_at DESC);
  `,
  widgets: `
    CREATE TABLE IF NOT EXISTS music_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      track_id TEXT NOT NULL,
      title TEXT NOT NULL,
      author TEXT,
      duration TEXT,
      duration_seconds INTEGER DEFAULT 0,
      thumbnail_ref TEXT,
      source TEXT,
      original_url TEXT,
      played_by_user_id TEXT,
      played_by_nickname TEXT,
      played_by_avatar_ref TEXT,
      played_by_json TEXT,
      played_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_music_history_played_at ON music_history(played_at DESC);

    CREATE TABLE IF NOT EXISTS sketch_strokes (
      stroke_id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      tool_type TEXT NOT NULL,
      color TEXT NOT NULL,
      stroke_width REAL NOT NULL,
      points_json TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sketch_channel ON sketch_strokes(channel_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS sketch_canvases (
      channel_id TEXT PRIMARY KEY,
      background_color TEXT DEFAULT '#1e1f22',
      thumbnail_ref TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS watch_party_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id TEXT NOT NULL,
      video_url TEXT NOT NULL,
      title TEXT,
      thumbnail_ref TEXT,
      started_by_user_id TEXT,
      watched_at INTEGER NOT NULL
    );
  `,
  messages: `
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      channel_id TEXT NOT NULL,
      sender_id TEXT NOT NULL,
      sender_nickname TEXT,
      sender_avatar_ref TEXT,
      content TEXT,
      type TEXT NOT NULL DEFAULT 'text',
      reply_to_id TEXT,
      thread_id TEXT,
      attachments_json TEXT,
      reactions_json TEXT,
      mentions_json TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      edited_at INTEGER,
      extra_json TEXT,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_channel_time ON messages(channel_id, timestamp ASC);

    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      message_id UNINDEXED,
      channel_id UNINDEXED,
      author_name,
      file_name,
      clean_text
    );

    CREATE TABLE IF NOT EXISTS tombstones (
      message_id TEXT PRIMARY KEY,
      channel_id TEXT,
      deleted_by TEXT,
      deleted_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shared_files (
      file_id TEXT PRIMARY KEY,
      owner_id TEXT,
      name TEXT NOT NULL,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT,
      cas_hash TEXT,
      local_path TEXT,
      extra_json TEXT,
      uploaded_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `,
};

const DM_SCHEMA = `
  CREATE TABLE IF NOT EXISTS dm_meta (
    peer_user_id TEXT PRIMARY KEY,
    room_code TEXT NOT NULL,
    peer_nickname_snapshot TEXT,
    peer_avatar_ref_snapshot TEXT,
    last_read_message_id TEXT,
    unread_count INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dm_messages (
    id TEXT PRIMARY KEY,
    sender_id TEXT NOT NULL,
    sender_nickname TEXT,
    sender_avatar_ref TEXT,
    content TEXT,
    type TEXT NOT NULL DEFAULT 'text',
    reply_to_id TEXT,
    attachments_json TEXT,
    reactions_json TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    edited_at INTEGER,
    extra_json TEXT,
    timestamp INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dm_messages_time ON dm_messages(timestamp ASC);

  CREATE VIRTUAL TABLE IF NOT EXISTS dm_messages_fts USING fts5(
    message_id UNINDEXED,
    author_name,
    file_name,
    clean_text
  );

  CREATE TABLE IF NOT EXISTS dm_tombstones (
    message_id TEXT PRIMARY KEY,
    deleted_by TEXT,
    deleted_at INTEGER NOT NULL
  );
`;

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

class DbManager {
  static _instances = new Map();

  static getInstance(userDataPath) {
    const resolved = path.resolve(userDataPath);
    const key = resolved.toLowerCase();
    if (!DbManager._instances.has(key)) {
      const instance = new DbManager(resolved);
      DbManager._instances.set(key, instance);
      instance.startPeriodicWalCheckpoints();
      try {
        const { MigrationService } = require("./migrationService.cjs");
        MigrationService.ensureMigrated(instance);
      } catch (err) {
        console.error("[DbManager] Migration check error:", err.message);
      }
    }
    return DbManager._instances.get(key);
  }

  constructor(userDataPath) {
    this.userDataPath = path.resolve(userDataPath);
    this.globalDbDir = path.join(this.userDataPath, "db");
    this.serversBaseDir = path.join(this.userDataPath, "servers");

    ensureDirSync(this.globalDbDir);
    ensureDirSync(this.serversBaseDir);

    this._globalConnections = new Map(); // dbName -> Database
    this._serverConnections = new Map(); // `${roomCode}:${dbName}` -> { db, lastUsed }
    this._dmConnections = new Map();     // `${roomCode}:${peerUserId}` -> { db, lastUsed }
    this._maxOpenDynamicDbs = 40;
  }

  _configurePragmas(db) {
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("foreign_keys = ON");
    db.pragma("cache_size = -16000");
    db.pragma("temp_store = MEMORY");
    db.pragma("busy_timeout = 5000");
  }

  _configureDb(db, schemaSql) {
    this._configurePragmas(db);
    if (schemaSql) {
      db.exec(schemaSql);
      try {
        db.exec("ALTER TABLE server_config ADD COLUMN afk_settings_json TEXT;");
      } catch (_) {}
    }
    return db;
  }

  _safeRoomCode(roomCode) {
    return String(roomCode || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "");
  }

  _safePeerId(peerUserId) {
    return String(peerUserId || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  /**
   * Opens or returns a cached personal/global database from `userData/db/<name>.db`.
   * Valid names: 'app_config', 'profile', 'activity', 'stickers', 'addons', 'dashboard', 'servers_list', 'discover'
   */
  getGlobalDb(rawName) {
    const name = String(rawName || "").replace(/\.db$/i, "");
    const schema = GLOBAL_SCHEMAS[name];
    if (!schema) {
      throw new Error(`[DbManager] Unknown global database: ${rawName}`);
    }
    if (this._globalConnections.has(name)) {
      const existing = this._globalConnections.get(name);
      if (existing.open) return existing;
      this._globalConnections.delete(name);
    }

    ensureDirSync(this.globalDbDir);
    const dbPath = path.join(this.globalDbDir, `${name}.db`);
    const db = new Database(dbPath);
    this._configureDb(db, schema);
    this._globalConnections.set(name, db);
    return db;
  }

  /**
   * Returns the isolated folder path for a server: `userData/servers/<ROOM_CODE>`
   */
  getServerDir(roomCode) {
    const code = this._safeRoomCode(roomCode);
    if (!code) throw new Error("[DbManager] Invalid roomCode for getServerDir");
    const dir = path.join(this.serversBaseDir, code);
    ensureDirSync(dir);
    return dir;
  }

  _evictLruIfNeeded() {
    const totalDynamic = this._serverConnections.size + this._dmConnections.size;
    if (totalDynamic <= this._maxOpenDynamicDbs) return;

    let oldestKey = null;
    let oldestTime = Infinity;
    let isDm = false;

    for (const [k, entry] of this._serverConnections.entries()) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = k;
        isDm = false;
      }
    }
    for (const [k, entry] of this._dmConnections.entries()) {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldestKey = k;
        isDm = true;
      }
    }

    if (oldestKey) {
      const map = isDm ? this._dmConnections : this._serverConnections;
      const entry = map.get(oldestKey);
      map.delete(oldestKey);
      try {
        if (entry?.db?.open) entry.db.close();
      } catch {}
    }
  }

  /**
   * Opens or returns a cached server-scoped database from `userData/servers/<ROOM_CODE>/<dbName>.db`.
   * Valid dbNames: 'server', 'flames', 'addons', 'widgets', 'messages'
   */
  getServerDb(roomCode, rawDbName) {
    const code = this._safeRoomCode(roomCode);
    const dbName = String(rawDbName || "").replace(/\.db$/i, "");
    if (!code) throw new Error(`[DbManager] Invalid roomCode for getServerDb(${dbName})`);
    const schema = SERVER_SCHEMAS[dbName];
    if (!schema) throw new Error(`[DbManager] Unknown server database: ${rawDbName}`);

    const key = `${code}:${dbName}`;
    if (this._serverConnections.has(key)) {
      const entry = this._serverConnections.get(key);
      if (entry.db && entry.db.open) {
        entry.lastUsed = Date.now();
        return entry.db;
      }
      this._serverConnections.delete(key);
    }

    this._evictLruIfNeeded();
    const srvDir = this.getServerDir(code);
    const dbPath = path.join(srvDir, `${dbName}.db`);
    const db = new Database(dbPath);
    this._configureDb(db, schema);
    this._serverConnections.set(key, { db, lastUsed: Date.now() });
    return db;
  }

  /**
   * Opens or returns a cached DM database inside the server's folder:
   * `userData/servers/<ROOM_CODE>/dms/dm_<PEER_USER_ID>.db`
   */
  getServerDmDb(roomCode, peerUserId) {
    const code = this._safeRoomCode(roomCode);
    const peerId = this._safePeerId(peerUserId);
    if (!code || !peerId) {
      throw new Error(`[DbManager] Invalid roomCode or peerUserId for getServerDmDb`);
    }

    const key = `${code}:${peerId}`;
    if (this._dmConnections.has(key)) {
      const entry = this._dmConnections.get(key);
      if (entry.db && entry.db.open) {
        entry.lastUsed = Date.now();
        return entry.db;
      }
      this._dmConnections.delete(key);
    }

    this._evictLruIfNeeded();
    const dmsDir = path.join(this.getServerDir(code), "dms");
    ensureDirSync(dmsDir);
    const dbPath = path.join(dmsDir, `dm_${peerId}.db`);
    const db = new Database(dbPath);
    this._configureDb(db, DM_SCHEMA);
    this._dmConnections.set(key, { db, lastUsed: Date.now() });
    return db;
  }

  /**
   * Lists all DM peer IDs that have a DM database inside `userData/servers/<ROOM_CODE>/dms/`
   */
  listServerDmPeerIds(roomCode) {
    const code = this._safeRoomCode(roomCode);
    if (!code) return [];
    const dmsDir = path.join(this.serversBaseDir, code, "dms");
    if (!fs.existsSync(dmsDir)) return [];
    try {
      const entries = fs.readdirSync(dmsDir);
      const peers = [];
      for (const name of entries) {
        if (name.startsWith("dm_") && name.endsWith(".db")) {
          peers.push(name.slice(3, -3));
        }
      }
      return peers;
    } catch {
      return [];
    }
  }

  /**
   * Closes all open SQLite connections for a specific server (`server.db`, `flames.db`, `addons.db`, `widgets.db`, `messages.db`, and all `dms/dm_*.db`).
   */
  closeServerDbs(roomCode) {
    const code = this._safeRoomCode(roomCode);
    if (!code) return;
    const prefix = `${code}:`;

    for (const [key, entry] of this._serverConnections.entries()) {
      if (key.startsWith(prefix)) {
        this._serverConnections.delete(key);
        try {
          if (entry?.db?.open) entry.db.close();
        } catch {}
      }
    }
    for (const [key, entry] of this._dmConnections.entries()) {
      if (key.startsWith(prefix)) {
        this._dmConnections.delete(key);
        try {
          if (entry?.db?.open) entry.db.close();
        } catch {}
      }
    }
  }

  /**
   * Closes and deletes the entire `userData/servers/<ROOM_CODE>/` folder cleanly.
   */
  purgeServerFolder(roomCode) {
    const code = this._safeRoomCode(roomCode);
    if (!code) return false;
    this.closeServerDbs(code);
    const srvDir = path.join(this.serversBaseDir, code);
    if (fs.existsSync(srvDir)) {
      try {
        fs.rmSync(srvDir, { recursive: true, force: true });
        return true;
      } catch (err) {
        console.error(`[DbManager] Error deleting server folder ${srvDir}:`, err.message);
        return false;
      }
    }
    return true;
  }

  /**
   * Starts a background timer that triggers passive WAL checkpoints every intervalMs (defaults to 10m).
   */
  startPeriodicWalCheckpoints(intervalMs = 10 * 60 * 1000) {
    if (this._checkpointInterval) return;
    this._checkpointInterval = setInterval(() => {
      try {
        this.checkpointWalAll();
      } catch (err) {
        console.warn("[DbManager] Error en checkpoint periódico WAL:", err.message);
      }
    }, intervalMs);
    if (this._checkpointInterval.unref) {
      this._checkpointInterval.unref();
    }
  }

  /**
   * Executes a passive WAL checkpoint across all currently open database connections.
   * Flushes committed WAL transactions to the main .db file without blocking active readers.
   */
  checkpointWalAll() {
    for (const [, db] of this._globalConnections.entries()) {
      try {
        if (db?.open) db.pragma("wal_checkpoint(PASSIVE)");
      } catch (_) {}
    }
    for (const [, entry] of this._serverConnections.entries()) {
      try {
        if (entry?.db?.open) entry.db.pragma("wal_checkpoint(PASSIVE)");
      } catch (_) {}
    }
    for (const [, entry] of this._dmConnections.entries()) {
      try {
        if (entry?.db?.open) entry.db.pragma("wal_checkpoint(PASSIVE)");
      } catch (_) {}
    }
  }

  /**
   * Safely exports an atomic, fully-consistent snapshot of an open Database to targetFilePath
   * using SQLite's native online backup API (db.backup).
   */
  async backupDatabase(db, targetFilePath) {
    if (!db || !db.open) {
      throw new Error("[DbManager] Cannot backup a closed database instance.");
    }
    const dir = path.dirname(targetFilePath);
    ensureDirSync(dir);
    return await db.backup(targetFilePath);
  }

  /**
   * Generates clean atomic backups of all requested SQLite databases into stagingDir.
   * Consolidates all WAL pages so the backup contains only clean .db files without .db-wal or .db-shm.
   */
  async prepareDatabasesForBackup(stagingDir, categories = ["profile", "servers"]) {
    ensureDirSync(stagingDir);

    if (categories.includes("profile")) {
      const targetDbDir = path.join(stagingDir, "db");
      ensureDirSync(targetDbDir);

      for (const dbName of Object.keys(GLOBAL_SCHEMAS)) {
        try {
          const db = this.getGlobalDb(dbName);
          const targetPath = path.join(targetDbDir, `${dbName}.db`);
          await db.backup(targetPath);
        } catch (err) {
          console.warn(`[DbManager] Warning backing up global db ${dbName}:`, err.message);
        }
      }
    }

    if (categories.includes("servers") && fs.existsSync(this.serversBaseDir)) {
      const targetServersDir = path.join(stagingDir, "servers");
      ensureDirSync(targetServersDir);

      try {
        const serverRooms = fs.readdirSync(this.serversBaseDir, { withFileTypes: true });
        for (const entry of serverRooms) {
          if (!entry.isDirectory()) continue;
          const roomCode = entry.name;
          const srcRoomDir = path.join(this.serversBaseDir, roomCode);
          const destRoomDir = path.join(targetServersDir, roomCode);
          ensureDirSync(destRoomDir);

          const roomFiles = fs.readdirSync(srcRoomDir, { withFileTypes: true });
          for (const rf of roomFiles) {
            if (rf.isFile() && rf.name.endsWith(".db")) {
              const dbBaseName = rf.name.replace(/\.db$/i, "");
              const srcDbPath = path.join(srcRoomDir, rf.name);
              const destDbPath = path.join(destRoomDir, rf.name);

              const connKey = `${roomCode}:${dbBaseName}`;
              let dbInstance = this._serverConnections.get(connKey)?.db;
              let shouldClose = false;

              if (!dbInstance || !dbInstance.open) {
                try {
                  dbInstance = new Database(srcDbPath);
                  shouldClose = true;
                } catch (e) {
                  console.warn(`[DbManager] No se pudo abrir ${srcDbPath} para backup:`, e.message);
                  continue;
                }
              }

              try {
                await dbInstance.backup(destDbPath);
              } catch (err) {
                console.warn(`[DbManager] Falló backup atómico de ${rf.name}:`, err.message);
              } finally {
                if (shouldClose) {
                  try { dbInstance.close(); } catch (_) {}
                }
              }
            }
          }
        }
      } catch (err) {
        console.warn("[DbManager] Warning backing up server databases:", err.message);
      }
    }
  }

  /**
   * Closes all open global and per-server connections (e.g., on app quit or account reset).
   */
  closeAll() {
    if (this._checkpointInterval) {
      clearInterval(this._checkpointInterval);
      this._checkpointInterval = null;
    }
    for (const [, entry] of this._dmConnections.entries()) {
      try {
        if (entry?.db?.open) entry.db.close();
      } catch {}
    }
    this._dmConnections.clear();

    for (const [, entry] of this._serverConnections.entries()) {
      try {
        if (entry?.db?.open) entry.db.close();
      } catch {}
    }
    this._serverConnections.clear();

    for (const [, db] of this._globalConnections.entries()) {
      try {
        if (db?.open) db.close();
      } catch {}
    }
    this._globalConnections.clear();
  }
}

module.exports = { DbManager, GLOBAL_SCHEMAS, SERVER_SCHEMAS, DM_SCHEMA };
