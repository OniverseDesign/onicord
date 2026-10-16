const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { app } = require("electron");

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
    if (profile.id) return profile;
    const upgraded = { ...profile, id: crypto.randomUUID() };
    await this.saveProfileToDisk(upgraded);
    this.activeProfile = upgraded;
    return upgraded;
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
        inputVolume: profile.audio?.inputVolume ?? existing?.audio?.inputVolume ?? 100,
        outputVolume: profile.audio?.outputVolume ?? existing?.audio?.outputVolume ?? 100,
        autoVad: profile.audio?.autoVad ?? existing?.audio?.autoVad ?? true,
        vadThreshold: profile.audio?.vadThreshold ?? existing?.audio?.vadThreshold ?? 50,
        noiseSuppression: profile.audio?.noiseSuppression ?? existing?.audio?.noiseSuppression ?? true,
        echoCancellation: profile.audio?.echoCancellation ?? existing?.audio?.echoCancellation ?? true,
        autoGainControl: profile.audio?.autoGainControl ?? existing?.audio?.autoGainControl ?? true,
        inputMode: profile.audio?.inputMode ?? existing?.audio?.inputMode ?? "vad",
        pttHotkey: profile.audio?.pttHotkey ?? existing?.audio?.pttHotkey ?? "Control",
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
        disableHardwareAcceleration: profile.general?.disableHardwareAcceleration ?? existing?.general?.disableHardwareAcceleration ?? false,
        language: profile.general?.language ?? existing?.general?.language ?? "es",
        zoomLevel: profile.general?.zoomLevel ?? existing?.general?.zoomLevel ?? 100,
        enableQuickSuggestions: profile.general?.enableQuickSuggestions ?? existing?.general?.enableQuickSuggestions ?? true,
        enableContinuousAnimations: profile.general?.enableContinuousAnimations ?? existing?.general?.enableContinuousAnimations ?? true,
      },

      keybindings: Array.isArray(profile.keybindings)
        ? profile.keybindings
        : (existing?.keybindings || []),
      serverFolders: Array.isArray(profile.serverFolders)
        ? profile.serverFolders
        : (existing?.serverFolders || []),

      overlay: {
        enabled: profile.overlay?.enabled ?? existing?.overlay?.enabled ?? true,
        position: profile.overlay?.position ?? existing?.overlay?.position ?? "top-left",
        opacity: profile.overlay?.opacity ?? existing?.overlay?.opacity ?? 0.6,
        autoHideWhenQuiet: profile.overlay?.autoHideWhenQuiet ?? existing?.overlay?.autoHideWhenQuiet ?? false,
        avatarOnly: profile.overlay?.avatarOnly ?? existing?.overlay?.avatarOnly ?? false,
        showNameOnlyWhenSpeaking: profile.overlay?.showNameOnlyWhenSpeaking ?? existing?.overlay?.showNameOnlyWhenSpeaking ?? false,
      },

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
    if (typeof global.updateGlobalShortcuts === "function") {
      global.updateGlobalShortcuts(saved.keybindings);
    }
    global.mainWindow?.webContents.send("profile:updated", saved);
    return saved;
  }
}

module.exports = new ProfileService();
