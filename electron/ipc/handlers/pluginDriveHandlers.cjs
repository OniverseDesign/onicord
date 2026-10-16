const { ipcMain, BrowserWindow, dialog } = require("electron");
const pluginService = require("../../services/pluginService.cjs");
const pluginSandboxService = require("../../services/pluginSandboxService.cjs");
const driveAuthService = require("../../services/driveAuthService.cjs");
const driveService = require("../../services/driveService.cjs");
const updateService = require("../../services/updateService.cjs");
const overlayService = require("../../services/overlayService.cjs");
const profileService = require("../../services/profileService.cjs");

function registerPluginDriveHandlers() {
  // === Plugins System ===
  ipcMain.handle("plugins:list", async () => {
    return pluginService.listPlugins();
  });

  const broadcastToAll = (channel, data) => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows.forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send(channel, data);
        }
      });
    } else if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send(channel, data);
    }
  };

  const defaultBroadcaster = broadcastToAll;
  const defaultP2PBroadcaster = ({ pluginId, widgetId, data }) => {
    const p2p = global.roomManager?.p2pService || global.roomManager?.chatService?.p2p;
    if (p2p) {
      const payload = { pluginId, widgetId: widgetId || null, data };
      p2p._broadcast("onicord:widget-p2p", payload);
    }
  };

  ipcMain.handle("plugins:install-dialog", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
      title: "Seleccionar paquete de complemento (.onimod)",
      filters: [{ name: "Complemento Onicord", extensions: ["onimod"] }],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const res = await pluginService.installPluginArchive(filePath);
    if (res.success) {
      pluginSandboxService.runPlugin(res.manifest, broadcastToAll, defaultP2PBroadcaster);
    }
    return res;
  });

  ipcMain.handle("plugins:download-install", async (event, pluginId) => {
    const res = await pluginService.downloadAndInstallPlugin(pluginId);
    if (res.success && res.manifest) {
      pluginSandboxService.runPlugin(res.manifest, broadcastToAll, defaultP2PBroadcaster);
    }
    return res;
  });

  ipcMain.handle("plugins:pack-dialog", async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window, {
      title: "Seleccionar carpeta del complemento (con manifest.json)",
      properties: ["openDirectory"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const folderPath = result.filePaths[0];
    return pluginService.packPluginFolder(folderPath);
  });

  ipcMain.handle("plugins:uninstall", async (_event, pluginId) => {
    pluginSandboxService.unloadPlugin(pluginId, broadcastToAll);
    return pluginService.uninstallPlugin(pluginId);
  });

  ipcMain.handle("plugins:toggle", async (event, pluginId, enabled) => {
    const res = await pluginService.togglePlugin(pluginId, enabled);
    if (enabled) {
      const plugins = await pluginService.listPlugins();
      const p = plugins.find((item) => item.id === pluginId);
      if (p) {
        pluginSandboxService.runPlugin(p, broadcastToAll, defaultP2PBroadcaster);
      }
    } else {
      pluginSandboxService.unloadPlugin(pluginId, broadcastToAll);
    }
    return res;
  });

  ipcMain.handle("plugins:get-widgets", async () => {
    return pluginSandboxService.getAllPluginIslandWidgets();
  });

  ipcMain.handle("plugins:get-commands", async () => {
    return pluginSandboxService.getAllPluginCommands();
  });

  ipcMain.handle("plugins:get-dashboard-widgets", async () => {
    return pluginSandboxService.getRegisteredDashboardWidgets();
  });

  ipcMain.handle("plugins:send-widget-p2p-data", async (_, { pluginId, widgetId, data }) => {
    const p2p = global.roomManager?.p2pService || global.roomManager?.chatService?.p2p;
    if (p2p) {
      const payload = { pluginId, widgetId, data };
      p2p._broadcast("onicord:widget-p2p", payload);
    }
    return { success: true };
  });

  ipcMain.handle("plugins:exec-command", async (event, text, author, roomCode, channelId) => {
    return pluginSandboxService.handleChatMessage(text, author, broadcastToAll, roomCode, channelId);
  });

  // Run enabled plugins on boot
  pluginSandboxService.loadAndRunPlugins(defaultBroadcaster, defaultP2PBroadcaster);

  // === Google Drive ===
  ipcMain.handle("drive:isConnected", () => driveAuthService.isConnected());
  ipcMain.handle("drive:getEmail", () => driveAuthService.getConnectedEmail());
  ipcMain.handle("drive:getUser", () => driveAuthService.getConnectedUser());
  ipcMain.handle("drive:authorize", () => driveAuthService.authorize());
  ipcMain.handle("drive:disconnect", () => driveAuthService.disconnect());
  ipcMain.handle("drive:listBackups", () => driveService.listBackups());
  ipcMain.handle("drive:estimateSize", (_, cats) => driveService.estimateBackupSize(cats));
  ipcMain.handle("drive:createBackup", (_, cats, name) => driveService.createBackup(cats, name));
  ipcMain.handle("drive:downloadBackup", (_, fileId, cats) => driveService.downloadBackup(fileId, cats));
  ipcMain.handle("drive:deleteBackup", (_, fileId) => driveService.deleteBackup(fileId));
  ipcMain.handle("drive:getSettings", () => driveService.getBackupSettings());
  ipcMain.handle("drive:saveSettings", (_, settings) => driveService.saveBackupSettings(settings));

  // === Auto Updater ===
  ipcMain.handle("update:check", async () => {
    return await updateService.checkForUpdates();
  });
  ipcMain.handle("update:download", async () => {
    return await updateService.startDownload();
  });
  ipcMain.handle("update:install", () => {
    updateService.quitAndInstall();
  });
  ipcMain.handle("update:isPortable", () => {
    return updateService.getIsPortable();
  });

  // === Voice Overlay ===
  ipcMain.on("overlay:update-members", (_event, members) => {
    overlayService.onVoiceMembersUpdated(members);
  });

  ipcMain.handle("overlay:get-settings", () => {
    return overlayService.getSettings();
  });

  ipcMain.handle("overlay:set-settings", async (_event, settings) => {
    overlayService.applySettings(settings);
    try {
      const current = profileService.activeProfile || {};
      current.overlay = overlayService.getSettings();
      await profileService.saveProfile(current);
    } catch (err) {
      console.error("[Overlay] Error saving overlay settings:", err.message);
    }
    return overlayService.getSettings();
  });

  ipcMain.handle("overlay:trigger-test", (_event, durationMs) => {
    overlayService.triggerTestOverlay(durationMs);
    return true;
  });
}

module.exports = { registerPluginDriveHandlers };
