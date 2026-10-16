const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("overlayAPI", {
  onVoiceMembersUpdate: (callback) => {
    const handler = (_event, members) => callback(members);
    ipcRenderer.on("overlay:voice-update", handler);
    return () => ipcRenderer.removeListener("overlay:voice-update", handler);
  },
  onSettingsUpdate: (callback) => {
    const handler = (_event, settings) => callback(settings);
    ipcRenderer.on("overlay:settings", handler);
    return () => ipcRenderer.removeListener("overlay:settings", handler);
  },
});
