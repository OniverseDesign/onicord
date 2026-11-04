export const DEFAULT_GENERAL = {
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
  autoDownloadAppUpdates: true,
  autoUpdatePlugins: true,
  autoDownloadFiles: true,
  autoDownloadMaxSizeMB: 500,
  downloadDirectory: "",
};

export function normalizeGeneralSettings(general) {
  let sfxLevel;
  if (general?.sfxLevel !== undefined) {
    sfxLevel = Math.max(0, Math.min(3, Number(general.sfxLevel)));
  } else {
    try {
      const saved = typeof localStorage !== "undefined" ? localStorage.getItem("onicord_sfx_level") : null;
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 3) {
          sfxLevel = parsed;
        }
      }
    } catch {}
    if (sfxLevel === undefined) {
      sfxLevel = general?.enableSoundEffects === false ? 0 : 2;
    }
  }

  return {
    openAtLogin: general?.openAtLogin !== undefined ? Boolean(general.openAtLogin) : false,
    minimizeToTray: general?.minimizeToTray !== undefined ? Boolean(general.minimizeToTray) : true,
    startMinimized: general?.startMinimized !== undefined ? Boolean(general.startMinimized) : false,
    enableNotifications: general?.enableNotifications !== undefined ? Boolean(general.enableNotifications) : true,
    enableSoundEffects: sfxLevel > 0,
    sfxLevel,
    disableHardwareAcceleration: general?.disableHardwareAcceleration !== undefined ? Boolean(general.disableHardwareAcceleration) : false,
    language: general?.language || "es",
    zoomLevel: general?.zoomLevel !== undefined ? Number(general.zoomLevel) : 100,
    enableQuickSuggestions: general?.enableQuickSuggestions !== undefined ? Boolean(general.enableQuickSuggestions) : true,
    enableContinuousAnimations: general?.enableContinuousAnimations !== undefined ? Boolean(general.enableContinuousAnimations) : true,
    enableOpenGraph: general?.enableOpenGraph !== undefined ? Boolean(general.enableOpenGraph) : true,
    autoDownloadAppUpdates: general?.autoDownloadAppUpdates !== undefined ? Boolean(general.autoDownloadAppUpdates) : true,
    autoUpdatePlugins: general?.autoUpdatePlugins !== undefined ? Boolean(general.autoUpdatePlugins) : true,
    autoDownloadFiles: general?.autoDownloadFiles !== undefined ? Boolean(general.autoDownloadFiles) : true,
    autoDownloadMaxSizeMB:
      general?.autoDownloadMaxSizeMB !== undefined
        ? Number(general.autoDownloadMaxSizeMB)
        : 500,
    downloadDirectory: typeof general?.downloadDirectory === "string" ? general.downloadDirectory : "",
  };
}

export function getStoredGeneralSettings() {
  try {
    if (typeof localStorage === "undefined") return { ...DEFAULT_GENERAL };
    const raw = localStorage.getItem("onicord_general_settings");
    if (!raw) return { ...DEFAULT_GENERAL };
    return normalizeGeneralSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_GENERAL };
  }
}
