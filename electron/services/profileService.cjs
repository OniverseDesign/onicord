const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { app } = require("electron");

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

class ProfileService {
  constructor() {
    this.activeProfile = null;
  }

  getProfilePath() {
    return path.join(app.getPath("userData"), "profile.json");
  }

  async loadProfile() {
    try {
      const filePath = this.getProfilePath();
      const raw = await fsPromises.readFile(filePath, "utf8");
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            parsed = JSON.parse(match[0]);
            await this.saveProfileToDisk(parsed);
            console.log(`[ProfileService] Auto-repaired corrupted profile JSON at ${filePath}`);
          } catch {}
        }
      }
      if (parsed && typeof parsed === "object") {
        this.activeProfile = parsed;
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  async saveProfileToDisk(profile) {
    if (!profile) return;
    const filePath = this.getProfilePath();
    const dir = path.dirname(filePath);
    await fsPromises.mkdir(dir, { recursive: true });
    const tmpPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const data = JSON.stringify(profile, null, 2);
    await fsPromises.writeFile(tmpPath, data, "utf8");
    try {
      await fsPromises.rename(tmpPath, filePath);
    } catch {
      await fsPromises.copyFile(tmpPath, filePath);
      await fsPromises.unlink(tmpPath).catch(() => {});
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
    if (roomManager && roomManager.roomCode && typeof roomManager.onServerProfileUpdated === "function") {
      await roomManager.onServerProfileUpdated(roomManager.roomCode, saved).catch(console.error);
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
    const rawKey = String(serverIdOrRoomCode).trim();
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
    if (!override) {
      try {
        const { ServerStore } = require("../p2p/serverStore.cjs");
        const store = new ServerStore(app.getPath("userData"));
        const sList = store._readServers ? store._readServers() : [];
        const s = sList.find(
          (srv) =>
            (srv.id && String(srv.id).toUpperCase() === safeKey) ||
            (srv.roomCode && String(srv.roomCode).toUpperCase() === safeKey)
        );
        if (s) {
          const codeKey = s.roomCode ? String(s.roomCode).trim().toUpperCase() : null;
          const idKey = s.id ? String(s.id).trim() : null;
          override = (codeKey && serverProfiles[codeKey]) || (idKey && serverProfiles[idKey]);
        }
      } catch (e) {}
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
    } catch (e) {}
    return raw.toUpperCase();
  }

  async saveServerProfile(serverId, data, roomManager) {
    if (!serverId) throw new Error("Server ID is required");
    const current = (await this.loadProfile()) || {};
    if (!current.serverProfiles) current.serverProfiles = {};

    const safeKey = (await this._resolveRoomCode(serverId)) || String(serverId).trim().toUpperCase();
    const existing = current.serverProfiles[safeKey] || {};

    current.serverProfiles[safeKey] = {
      ...existing,
      nickname: data.nickname !== undefined ? (data.nickname ? data.nickname.trim() : null) : (existing.nickname || null),
      avatar: data.avatar !== undefined ? data.avatar : (existing.avatar || null),
      customLink: data.customLink !== undefined ? data.customLink : (existing.customLink || ""),
      profileColor: data.profileColor !== undefined ? data.profileColor : (existing.profileColor || ""),
      customStatus: data.customStatus !== undefined ? data.customStatus : (existing.customStatus || ""),
      updatedAt: Date.now(),
    };

    // If completely empty, clean it up
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
