const crypto = require("crypto");
const { app } = require("electron");
const { DbManager } = require("../storage/dbManager.cjs");
const { CasStore } = require("../storage/casStore.cjs");

const DEFAULT_KEYBINDINGS = [
  { id: "default-focus-search", action: "focus_search", shortcut: "Ctrl + F" },
  { id: "default-toggle-mute", action: "toggle_mute", shortcut: "Ctrl + Shift + M" },
  { id: "default-toggle-deafen", action: "toggle_deafen", shortcut: "Ctrl + Shift + D" },
  { id: "default-disconnect-voice", action: "disconnect_voice", shortcut: "Ctrl + Shift + E" },
  { id: "default-open-settings", action: "open_settings", shortcut: "Ctrl + ," },
  { id: "default-open-pinned", action: "open_pinned", shortcut: "Ctrl + P" },
  { id: "default-go-to-dashboard", action: "go_to_dashboard", shortcut: "Alt + Home" },
  { id: "default-open-server-settings", action: "open_server_settings", shortcut: "Ctrl + Shift + S" },
  { id: "default-switch-server-up", action: "switch_server_up", shortcut: "Ctrl + Alt + ArrowUp" },
  { id: "default-switch-server-down", action: "switch_server_down", shortcut: "Ctrl + Alt + ArrowDown" },
];

function normalizeKeybindings(userKeybindings) {
  if (!Array.isArray(userKeybindings) || userKeybindings.length === 0) {
    return DEFAULT_KEYBINDINGS.map((kb) => ({ ...kb, id: crypto.randomUUID() }));
  }

  const result = [...userKeybindings];
  const configuredActions = new Set(userKeybindings.map((kb) => kb.action));

  for (const def of DEFAULT_KEYBINDINGS) {
    if (!configuredActions.has(def.action)) {
      result.push({
        ...def,
        id: crypto.randomUUID(),
      });
    }
  }

  return result;
}

function safeParse(jsonStr, fallback) {
  if (!jsonStr || typeof jsonStr !== "string") return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}

class ProfileService {
  constructor() {
    this.activeProfile = null;
  }

  _getUserDataPath() {
    return app.getPath("userData");
  }

  _getDbManager(customUserDataPath = null) {
    return DbManager.getInstance(customUserDataPath || this._getUserDataPath());
  }

  _getCasStore(customUserDataPath = null) {
    return CasStore.getInstance(customUserDataPath || this._getUserDataPath());
  }

  loadProfileSync(customUserDataPath = null) {
    try {
      const dbMgr = this._getDbManager(customUserDataPath);
      const profileDb = dbMgr.getGlobalDb("profile");
      const appConfigDb = dbMgr.getGlobalDb("app_config");
      const activityDb = dbMgr.getGlobalDb("activity");
      const serversListDb = dbMgr.getGlobalDb("servers_list");

      const mainRow = profileDb.prepare("SELECT * FROM main_profile WHERE id = 1").get();
      if (!mainRow) return null;

      const socialLinks = safeParse(mainRow.social_links_json, {});
      const extraMain = safeParse(mainRow.extra_json, {});

      // Load app_settings from app_config.db
      const settingsRows = appConfigDb.prepare("SELECT key, value_json FROM app_settings").all();
      const settingsMap = {};
      for (const r of settingsRows) {
        settingsMap[r.key] = safeParse(r.value_json, null);
      }

      // Load server_profile_overrides from profile.db
      const overrideRows = profileDb.prepare("SELECT * FROM server_profile_overrides").all();
      const serverProfiles = {};
      for (const ov of overrideRows) {
        const extraOv = safeParse(ov.extra_json, {});
        serverProfiles[ov.room_code] = {
          nickname: ov.nickname || null,
          avatar: ov.avatar_ref || null,
          banner: ov.banner_ref || null,
          bio: ov.bio || "",
          profileColor: ov.accent_color || "",
          cardStyle: ov.card_style || null,
          customLink: extraOv.customLink || "",
          customStatus: extraOv.customStatus || "",
          updatedAt: ov.updated_at || mainRow.updated_at,
        };
      }

      // Load customGames from activity.db
      const customGameRows = activityDb.prepare("SELECT * FROM custom_games ORDER BY added_at ASC").all();
      const customGames = customGameRows.map((g) => {
        const extraG = safeParse(g.extra_json, {});
        return {
          ...extraG,
          exePath: g.exe_path,
          name: g.custom_name,
          cover: g.cover_ref || extraG.cover || null,
        };
      });

      // Load serverFolders from servers_list.db
      const folderRows = serversListDb.prepare("SELECT * FROM server_folders ORDER BY position ASC").all();
      const serverFolders = folderRows.map((f) => ({
        id: f.folder_id,
        name: f.name,
        color: f.color,
      }));

      // Load local user's flame streaks from each joined server's flames.db
      const flame = {};
      const joinedRows = serversListDb.prepare("SELECT room_code FROM joined_servers").all();
      for (const jr of joinedRows) {
        const rCode = jr.room_code;
        if (!rCode) continue;
        try {
          const flamesDb = dbMgr.getServerDb(rCode, "flames");
          const flRow = flamesDb
            .prepare("SELECT * FROM member_flames WHERE user_id = ?")
            .get(mainRow.user_id);
          if (flRow) {
            const extraFl = safeParse(flRow.extra_json, {});
            flame[rCode] = {
              ...extraFl,
              currentStreak: flRow.current_streak,
              highestStreak: flRow.max_streak,
              lastInteractionDate: flRow.last_active_date,
              serverId: rCode,
            };
          }
        } catch {}
      }

      const assembled = {
        id: mainRow.user_id,
        nickname: mainRow.nickname,
        avatar: mainRow.avatar_ref || null,
        banner: mainRow.banner_ref || null,
        customLink: socialLinks.customLink || "",
        profileColor: mainRow.accent_color || "",
        showRichPresence:
          settingsMap.showRichPresence !== undefined
            ? Boolean(settingsMap.showRichPresence)
            : (extraMain.showRichPresence ?? true),
        customStatus: mainRow.custom_status || "",
        flame,
        status: mainRow.status_state || "online",
        audio: settingsMap.audio || {
          inputDeviceId: "",
          outputDeviceId: "",
          inputDeviceLabel: "",
          outputDeviceLabel: "",
          inputVolume: 100,
          outputVolume: 100,
          autoVad: true,
          vadThreshold: 50,
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
          inputMode: "vad",
          pttHotkey: "Control",
          dynamicsCompression: true,
          autoDucking: true,
          autoDuckingAmount: 50,
          peerVolumes: {},
        },
        general: settingsMap.general || {
          openAtLogin: false,
          minimizeToTray: true,
          startMinimized: false,
          enableNotifications: true,
          enableSoundEffects: true,
          sfxLevel: 2,
          disableHardwareAcceleration: false,
          language: "es",
          zoomLevel: 100,
          enableQuickSuggestions: true,
          enableContinuousAnimations: true,
          enableOpenGraph: true,
        },
        keybindings: normalizeKeybindings(settingsMap.keybindings || []),
        serverFolders,
        serverProfiles,
        overlay: settingsMap.overlay || {
          enabled: true,
          position: "top-left",
          opacity: 0.6,
          autoHideWhenQuiet: false,
          avatarOnly: false,
          showNameOnlyWhenSpeaking: false,
        },
        customGames,
        updatedAt: mainRow.updated_at || Date.now(),
      };

      if (!customUserDataPath) {
        this.activeProfile = assembled;
      }
      return assembled;
    } catch (err) {
      console.error("[ProfileService] Error loading profile from SQLite:", err.message);
      return null;
    }
  }

  async loadProfile() {
    return this.loadProfileSync();
  }

  async saveProfileToDisk(profile) {
    if (!profile) return;
    const dbMgr = this._getDbManager();
    const cas = this._getCasStore();
    const profileDb = dbMgr.getGlobalDb("profile");
    const appConfigDb = dbMgr.getGlobalDb("app_config");
    const activityDb = dbMgr.getGlobalDb("activity");
    const serversListDb = dbMgr.getGlobalDb("servers_list");
    const now = Number(profile.updatedAt) || Date.now();

    // 1. Ingest avatar/banner into CAS
    const avatarRef = cas.storeDataUri(profile.avatar || null);
    const bannerRef = cas.storeDataUri(profile.banner || null);
    profile.avatar = avatarRef;
    if (profile.banner !== undefined) profile.banner = bannerRef;

    // 2. Save main_profile & server_profile_overrides in profile.db
    const profileTx = profileDb.transaction(() => {
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
          String(profile.id),
          String(profile.nickname || "Usuario"),
          profile.customStatus || "",
          profile.status || "online",
          avatarRef,
          bannerRef,
          profile.nameplateStyle || null,
          profile.avatarEffect || null,
          profile.profileBg || null,
          profile.cardStyle || null,
          profile.profileColor || "",
          profile.primaryColor || "",
          profile.bio || "",
          profile.pronouns || "",
          JSON.stringify({ customLink: profile.customLink || "" }),
          JSON.stringify({ showRichPresence: profile.showRichPresence ?? true }),
          now
        );

      profileDb.prepare("DELETE FROM server_profile_overrides").run();
      if (profile.serverProfiles && typeof profile.serverProfiles === "object") {
        const insertOv = profileDb.prepare(`
          INSERT OR REPLACE INTO server_profile_overrides (
            room_code, nickname, avatar_ref, banner_ref, bio, accent_color, card_style, extra_json, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const [rCode, ov] of Object.entries(profile.serverProfiles)) {
          if (!ov || typeof ov !== "object") continue;
          const cleanCode = String(rCode).trim().toUpperCase();
          const ovAvatar = cas.storeDataUri(ov.avatar || null);
          const ovBanner = cas.storeDataUri(ov.banner || null);
          ov.avatar = ovAvatar;
          if (ov.banner !== undefined) ov.banner = ovBanner;
          insertOv.run(
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
      }
    });
    profileTx();

    // 3. Save settings in app_config.db
    const upsertSetting = appConfigDb.prepare(`
      INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
    `);
    const appCfgTx = appConfigDb.transaction(() => {
      if (profile.audio) upsertSetting.run("audio", JSON.stringify(profile.audio), now);
      if (profile.general) upsertSetting.run("general", JSON.stringify(profile.general), now);
      if (profile.keybindings) upsertSetting.run("keybindings", JSON.stringify(profile.keybindings), now);
      if (profile.overlay) upsertSetting.run("overlay", JSON.stringify(profile.overlay), now);
      upsertSetting.run("showRichPresence", JSON.stringify(profile.showRichPresence ?? true), now);
    });
    appCfgTx();

    // 4. Save customGames in activity.db
    if (Array.isArray(profile.customGames)) {
      const actTx = activityDb.transaction((games) => {
        activityDb.prepare("DELETE FROM custom_games").run();
        const insertGame = activityDb.prepare(`
          INSERT OR REPLACE INTO custom_games (exe_path, custom_name, cover_ref, extra_json, added_at)
          VALUES (?, ?, ?, ?, ?)
        `);
        for (const g of games) {
          if (!g) continue;
          const key = String(g.exePath || g.path || g.id || g.name || "");
          if (!key) continue;
          const coverRef = cas.storeDataUri(g.cover || g.icon || null);
          if (coverRef) {
            if (g.cover) g.cover = coverRef;
            if (g.icon) g.icon = coverRef;
          }
          insertGame.run(key, String(g.name || key), coverRef, JSON.stringify(g), now);
        }
      });
      actTx(profile.customGames);
    }

    // 5. Save serverFolders in servers_list.db
    if (Array.isArray(profile.serverFolders)) {
      const foldersTx = serversListDb.transaction((folders) => {
        serversListDb.prepare("DELETE FROM server_folders").run();
        const insertFolder = serversListDb.prepare(`
          INSERT OR REPLACE INTO server_folders (folder_id, name, color, position) VALUES (?, ?, ?, ?)
        `);
        folders.forEach((f, idx) => {
          if (!f || !f.id) return;
          insertFolder.run(String(f.id), String(f.name || "Carpeta"), f.color || null, idx);
        });
      });
      foldersTx(profile.serverFolders);
    }

    // 6. Save per-server flame streaks in each server's servers/<ROOM_CODE>/flames.db
    if (profile.flame && typeof profile.flame === "object" && profile.id) {
      for (const [srvKey, flameObj] of Object.entries(profile.flame)) {
        const cleanCode = String(srvKey).trim().toUpperCase();
        if (!/^[A-F0-9]{8}$/.test(cleanCode) || !flameObj) continue;
        try {
          const flamesDb = dbMgr.getServerDb(cleanCode, "flames");
          flamesDb
            .prepare(`
              INSERT OR REPLACE INTO member_flames (
                user_id, current_streak, max_streak, tier, last_active_date,
                active_seconds_today, ignited_today, extra_json, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `)
            .run(
              String(profile.id),
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

  async getProfile() {
    const profile = await this.loadProfile();
    if (!profile) return null;
    let modified = false;
    if (!profile.id) {
      profile.id = crypto.randomUUID();
      modified = true;
    }
    const normalizedKb = normalizeKeybindings(profile.keybindings);
    if (!profile.keybindings || profile.keybindings.length !== normalizedKb.length) {
      profile.keybindings = normalizedKb;
      modified = true;
    }
    if (modified) {
      await this.saveProfileToDisk(profile);
    }
    this.activeProfile = profile;
    return profile;
  }

  async saveProfile(profile, roomManager) {
    if (!profile?.nickname?.trim()) throw new Error("Nickname is required");
    const existing = await this.loadProfile();

    const saved = {
      id: profile.id || existing?.id || crypto.randomUUID(),
      nickname: profile.nickname.trim(),
      avatar: profile.avatar || null,
      customLink: profile.customLink ?? existing?.customLink ?? "",
      profileColor: profile.profileColor ?? existing?.profileColor ?? "",
      showRichPresence: profile.showRichPresence ?? existing?.showRichPresence ?? true,
      customStatus: profile.customStatus ?? existing?.customStatus ?? "",
      flame: profile.flame ?? existing?.flame ?? {},
      status: profile.status ?? existing?.status ?? "online",

      audio: {
        inputDeviceId: profile.audio?.inputDeviceId ?? existing?.audio?.inputDeviceId ?? "",
        outputDeviceId: profile.audio?.outputDeviceId ?? existing?.audio?.outputDeviceId ?? "",
        inputDeviceLabel: profile.audio?.inputDeviceLabel ?? existing?.audio?.inputDeviceLabel ?? "",
        outputDeviceLabel: profile.audio?.outputDeviceLabel ?? existing?.audio?.outputDeviceLabel ?? "",
        inputVolume: profile.audio?.inputVolume ?? existing?.audio?.inputVolume ?? 100,
        outputVolume: profile.audio?.outputVolume ?? existing?.audio?.outputVolume ?? 100,
        autoVad: profile.audio?.autoVad ?? existing?.audio?.autoVad ?? true,
        vadThreshold: profile.audio?.vadThreshold ?? existing?.audio?.vadThreshold ?? 50,
        noiseSuppression: profile.audio?.noiseSuppression ?? existing?.audio?.noiseSuppression ?? true,
        echoCancellation: profile.audio?.echoCancellation ?? existing?.audio?.echoCancellation ?? true,
        autoGainControl: profile.audio?.autoGainControl ?? existing?.audio?.autoGainControl ?? true,
        inputMode: profile.audio?.inputMode ?? existing?.audio?.inputMode ?? "vad",
        pttHotkey: profile.audio?.pttHotkey ?? existing?.audio?.pttHotkey ?? "Control",
        dynamicsCompression: profile.audio?.dynamicsCompression ?? existing?.audio?.dynamicsCompression ?? true,
        autoDucking: profile.audio?.autoDucking ?? existing?.audio?.autoDucking ?? true,
        autoDuckingAmount: profile.audio?.autoDuckingAmount ?? existing?.audio?.autoDuckingAmount ?? 50,
        peerVolumes: {
          ...(existing?.audio?.peerVolumes || {}),
          ...(profile.audio?.peerVolumes || {}),
        },
      },

      general: {
        openAtLogin: profile.general?.openAtLogin ?? existing?.general?.openAtLogin ?? false,
        minimizeToTray: profile.general?.minimizeToTray ?? existing?.general?.minimizeToTray ?? true,
        startMinimized: profile.general?.startMinimized ?? existing?.general?.startMinimized ?? false,
        enableNotifications: profile.general?.enableNotifications ?? existing?.general?.enableNotifications ?? true,
        enableSoundEffects: profile.general?.enableSoundEffects ?? existing?.general?.enableSoundEffects ?? true,
        sfxLevel: profile.general?.sfxLevel !== undefined
          ? Number(profile.general.sfxLevel)
          : (existing?.general?.sfxLevel !== undefined
              ? Number(existing.general.sfxLevel)
              : (profile.general?.enableSoundEffects === false ? 0 : 2)),
        disableHardwareAcceleration: profile.general?.disableHardwareAcceleration ?? existing?.general?.disableHardwareAcceleration ?? false,
        language: profile.general?.language ?? existing?.general?.language ?? "es",
        zoomLevel: profile.general?.zoomLevel ?? existing?.general?.zoomLevel ?? 100,
        enableQuickSuggestions: profile.general?.enableQuickSuggestions ?? existing?.general?.enableQuickSuggestions ?? true,
        enableContinuousAnimations: profile.general?.enableContinuousAnimations ?? existing?.general?.enableContinuousAnimations ?? true,
        enableOpenGraph: profile.general?.enableOpenGraph ?? existing?.general?.enableOpenGraph ?? true,
      },

      keybindings: normalizeKeybindings(
        Array.isArray(profile.keybindings)
          ? profile.keybindings
          : (existing?.keybindings || [])
      ),
      serverFolders: Array.isArray(profile.serverFolders)
        ? profile.serverFolders
        : (existing?.serverFolders || []),
      serverProfiles: (profile.serverProfiles && typeof profile.serverProfiles === "object")
        ? profile.serverProfiles
        : (existing?.serverProfiles || {}),

      overlay: {
        enabled: profile.overlay?.enabled ?? existing?.overlay?.enabled ?? true,
        position: profile.overlay?.position ?? existing?.overlay?.position ?? "top-left",
        opacity: profile.overlay?.opacity ?? existing?.overlay?.opacity ?? 0.6,
        autoHideWhenQuiet: profile.overlay?.autoHideWhenQuiet ?? existing?.overlay?.autoHideWhenQuiet ?? false,
        avatarOnly: profile.overlay?.avatarOnly ?? existing?.overlay?.avatarOnly ?? false,
        showNameOnlyWhenSpeaking: profile.overlay?.showNameOnlyWhenSpeaking ?? existing?.overlay?.showNameOnlyWhenSpeaking ?? false,
      },

      customGames: Array.isArray(profile.customGames)
        ? profile.customGames
        : (existing?.customGames || []),

      updatedAt: Date.now(),
    };

    await this.saveProfileToDisk(saved);
    this.activeProfile = saved;

    if (saved.general) {
      try {
        app.setLoginItemSettings({
          openAtLogin: saved.general.openAtLogin,
          path: process.execPath,
          args: saved.general.startMinimized ? ["--hidden"] : [],
        });
      } catch (err) {
        console.error("Error al configurar inicio automático:", err);
      }
    }

    if (roomManager && typeof roomManager.setProfile === "function") {
      roomManager.setProfile(saved);
    }
    if (roomManager && typeof roomManager.onServerProfileUpdated === "function") {
      const activeRooms = roomManager.rooms?.size > 0 ? [...roomManager.rooms.keys()] : (roomManager.roomCode ? [roomManager.roomCode] : []);
      for (const rCode of activeRooms) {
        await roomManager.onServerProfileUpdated(rCode, saved).catch(console.error);
      }
    }
    if (typeof global.updateGlobalShortcuts === "function") {
      global.updateGlobalShortcuts(saved.keybindings);
    }
    global.mainWindow?.webContents.send("profile:updated", saved);
    return saved;
  }

  getEffectiveProfile(profile, serverIdOrRoomCode) {
    if (!profile) return null;
    if (!serverIdOrRoomCode) return profile;
    const targetKey = (typeof serverIdOrRoomCode === "object" && serverIdOrRoomCode !== null)
      ? (serverIdOrRoomCode.roomCode || serverIdOrRoomCode.id || "")
      : serverIdOrRoomCode;
    const rawKey = String(targetKey).trim();
    const safeKey = rawKey.toUpperCase();
    const serverProfiles = profile.serverProfiles || {};
    let override = serverProfiles[rawKey] || serverProfiles[safeKey];
    if (!override) {
      for (const [key, val] of Object.entries(serverProfiles)) {
        if (key && (key === rawKey || key.toUpperCase() === safeKey)) {
          override = val;
          break;
        }
      }
    }
    if (!override) return profile;

    return {
      ...profile,
      nickname: (override.nickname && override.nickname.trim()) || profile.nickname,
      avatar: override.avatar !== undefined && override.avatar !== null && override.avatar !== "" ? override.avatar : profile.avatar,
      customLink: override.customLink !== undefined ? override.customLink : "",
      profileColor: override.profileColor !== undefined && override.profileColor !== "" ? override.profileColor : profile.profileColor,
      customStatus: override.customStatus !== undefined ? override.customStatus : "",
      isServerProfile: true,
      serverProfileRoomCode: safeKey,
    };
  }

  async _resolveRoomCode(serverIdOrRoomCode) {
    if (!serverIdOrRoomCode) return null;
    const raw = String(serverIdOrRoomCode).trim();
    try {
      const { ServerStore } = require("../p2p/serverStore.cjs");
      const store = new ServerStore(app.getPath("userData"));
      const server = (await store.get(raw)) || (await store.getByRoomCode(raw.toUpperCase()));
      if (server?.roomCode) {
        return server.roomCode.toUpperCase();
      }
    } catch {}
    return raw.toUpperCase();
  }

  async saveServerProfile(serverId, data, roomManager) {
    if (!serverId) throw new Error("Server ID is required");
    const current = (await this.loadProfile()) || {};
    if (!current.serverProfiles) current.serverProfiles = {};

    const safeKey = (await this._resolveRoomCode(serverId)) || String(serverId).trim().toUpperCase();
    const existing = current.serverProfiles[safeKey] || {};
    const cas = this._getCasStore();

    current.serverProfiles[safeKey] = {
      ...existing,
      nickname: data.nickname !== undefined ? (data.nickname ? data.nickname.trim() : null) : (existing.nickname || null),
      avatar: data.avatar !== undefined ? cas.storeDataUri(data.avatar) : (existing.avatar || null),
      customLink: data.customLink !== undefined ? data.customLink : (existing.customLink || ""),
      profileColor: data.profileColor !== undefined ? data.profileColor : (existing.profileColor || ""),
      customStatus: data.customStatus !== undefined ? data.customStatus : (existing.customStatus || ""),
      updatedAt: Date.now(),
    };

    const entry = current.serverProfiles[safeKey];
    if (!entry.nickname && !entry.avatar && !entry.customLink && !entry.profileColor && !entry.customStatus) {
      delete current.serverProfiles[safeKey];
    }

    current.updatedAt = Date.now();
    await this.saveProfileToDisk(current);
    this.activeProfile = current;

    if (roomManager && typeof roomManager.onServerProfileUpdated === "function") {
      await roomManager.onServerProfileUpdated(safeKey, current);
    }

    global.mainWindow?.webContents.send("profile:updated", current);
    return current;
  }

  async deleteServerProfile(serverId, roomManager) {
    if (!serverId) return null;
    const current = await this.loadProfile();
    if (!current || !current.serverProfiles) return current;

    const safeKey = (await this._resolveRoomCode(serverId)) || String(serverId).trim().toUpperCase();
    delete current.serverProfiles[safeKey];
    delete current.serverProfiles[serverId];

    current.updatedAt = Date.now();
    await this.saveProfileToDisk(current);
    this.activeProfile = current;

    if (roomManager && typeof roomManager.onServerProfileUpdated === "function") {
      await roomManager.onServerProfileUpdated(safeKey, current);
    }

    global.mainWindow?.webContents.send("profile:updated", current);
    return current;
  }
}

module.exports = new ProfileService();
