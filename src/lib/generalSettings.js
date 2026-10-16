export const DEFAULT_GENERAL = {
  openAtLogin: false,
  minimizeToTray: true,
  startMinimized: false,
  enableNotifications: true,
  enableSoundEffects: true,
  disableHardwareAcceleration: false,
  language: "es",
  zoomLevel: 100,
  enableQuickSuggestions: true,
  enableContinuousAnimations: true,
};

export function normalizeGeneralSettings(general) {
  return {
    openAtLogin: general?.openAtLogin !== undefined ? Boolean(general.openAtLogin) : false,
    minimizeToTray: general?.minimizeToTray !== undefined ? Boolean(general.minimizeToTray) : true,
    startMinimized: general?.startMinimized !== undefined ? Boolean(general.startMinimized) : false,
    enableNotifications: general?.enableNotifications !== undefined ? Boolean(general.enableNotifications) : true,
    enableSoundEffects: general?.enableSoundEffects !== undefined ? Boolean(general.enableSoundEffects) : true,
    disableHardwareAcceleration: general?.disableHardwareAcceleration !== undefined ? Boolean(general.disableHardwareAcceleration) : false,
    language: general?.language || "es",
    zoomLevel: general?.zoomLevel !== undefined ? Number(general.zoomLevel) : 100,
    enableQuickSuggestions: general?.enableQuickSuggestions !== undefined ? Boolean(general.enableQuickSuggestions) : true,
    enableContinuousAnimations: general?.enableContinuousAnimations !== undefined ? Boolean(general.enableContinuousAnimations) : true,
  };
}
