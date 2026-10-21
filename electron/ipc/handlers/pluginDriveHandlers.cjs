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
      title: "Seleccionar paquete de Onicord (.onipkg)",
      filters: [{ name: "Paquete Onicord (*.onipkg)", extensions: ["onipkg"] }],
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

  ipcMain.handle("plugins:reload", async (_event, pluginId) => {
    const plugins = await pluginService.listPlugins();
    const p = plugins.find((item) => item.id === pluginId);
    if (p) {
      pluginSandboxService.unloadPlugin(pluginId, broadcastToAll);
      pluginSandboxService.runPlugin(p, broadcastToAll, defaultP2PBroadcaster);
      return { success: true };
    }
    return { success: false, error: "Plugin not found" };
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

  ipcMain.handle("plugins:get-voice-control-buttons", async () => {
    return pluginSandboxService.getAllVoiceControlButtons();
  });

  ipcMain.handle("plugins:trigger-voice-control-button", async (_event, pluginId, buttonId, data) => {
    return pluginSandboxService.triggerVoiceControlButton(pluginId, buttonId, data, broadcastToAll);
  });

  ipcMain.handle("plugins:open-stage-view", async (event, stageDef) => {
    global.activeStageDef = stageDef;
    // SEGURIDAD: Los frameScripts ejecutables NO se aceptan desde IPC/renderers ni mensajes de red.
    // Solo se permite configurar variables seguras (como el apodo del usuario) con sanitización estricta.
    const nick = stageDef?.userNick || stageDef?.authorName;
    const safeNick = typeof nick === "string" ? nick.trim().slice(0, 20) : "";
    let scripts = [];
    if (safeNick) {
      scripts.push(`window._onicordUserNick = ${JSON.stringify(safeNick)};`);
    }
    global.currentStageScripts = scripts;

    if (stageDef?.activity && stageDef?.activity?.name) {
      try {
        const { setRpcActivity } = require("../../gameScanner.cjs");
        const pluginService = require("../../services/pluginService.cjs");
        const plugin = stageDef.pluginId && pluginService.getPlugin ? pluginService.getPlugin(stageDef.pluginId) : null;
        const iconPath = plugin?.manifest?.icon || "assets/icon.png";
        const resolvedIcon = stageDef.pluginId && pluginService.resolvePluginIcon
          ? (pluginService.resolvePluginIcon(iconPath, stageDef.pluginId) || pluginService.resolvePluginIcon("assets/icon.png", stageDef.pluginId) || pluginService.resolvePluginIcon("assets/icon.svg", stageDef.pluginId))
          : null;
        const act = stageDef.activity;
        const safeName = typeof act.name === "string" ? act.name.trim().slice(0, 100) : "Complemento";
        const safeDetails = typeof act.details === "string" ? act.details.trim().slice(0, 150) : (stageDef.title || "Complemento");
        const safeState = typeof act.state === "string" ? act.state.trim().slice(0, 100) : null;
        let safeCover = null;
        if (typeof act.cover === "string") {
          const trimmed = act.cover.trim();
          if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:image/") || trimmed.startsWith("onicord-media://")) {
            safeCover = trimmed;
          }
        }
        setRpcActivity({
          name: safeName,
          details: safeDetails,
          state: safeState,
          cover: safeCover || resolvedIcon || null,
          smallCover: safeCover ? (act.smallCover || resolvedIcon) : null,
          smallText: safeDetails,
          party: act.party || null,
          startTime: act.startTime || Date.now(),
          type: act.type || (act.isCatalog ? "launcher" : "game"),
          isCatalog: Boolean(act.isCatalog),
          source: `addon:${stageDef.pluginId || "plugin"}`,
        });
      } catch (err) {
        console.warn("[STAGE] Error seteando actividad RPC:", err.message);
      }
    }

    // Retransmitir únicamente a otras ventanas si existen, nunca al remitente
    const { BrowserWindow } = require("electron");
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      if (win && !win.isDestroyed() && event?.sender && win.webContents.id !== event.sender.id) {
        win.webContents.send("plugins:open-stage-view", stageDef);
      }
    }
    return true;
  });

  ipcMain.handle("plugins:set-stage-activity", async (event, activityData) => {
    try {
      const { setRpcActivity, clearRpcActivity } = require("../../gameScanner.cjs");
      if (!activityData || typeof activityData !== "object" || !activityData.name) {
        clearRpcActivity();
        return { success: true };
      }
      const safeName = typeof activityData.name === "string" ? activityData.name.trim().slice(0, 100) : null;
      if (!safeName) {
        clearRpcActivity();
        return { success: true };
      }

      const pluginService = require("../../services/pluginService.cjs");
      const plugin = activityData.pluginId && pluginService.getPlugin ? pluginService.getPlugin(activityData.pluginId) : null;
      const iconPath = plugin?.manifest?.icon || "assets/icon.png";
      const resolvedIcon = activityData.pluginId && pluginService.resolvePluginIcon
        ? (pluginService.resolvePluginIcon(iconPath, activityData.pluginId) || pluginService.resolvePluginIcon("assets/icon.png", activityData.pluginId) || pluginService.resolvePluginIcon("assets/icon.svg", activityData.pluginId))
        : null;

      let coverUrl = null;
      if (typeof activityData.cover === "string") {
        const trimmed = activityData.cover.trim();
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:image/") || trimmed.startsWith("onicord-media://")) {
          coverUrl = trimmed;
        } else if (activityData.pluginId && pluginService.resolvePluginIcon) {
          coverUrl = pluginService.resolvePluginIcon(trimmed, activityData.pluginId);
        }
      }

      const fallbackName = plugin?.manifest?.name || (typeof activityData.pluginName === "string" ? activityData.pluginName.slice(0, 50) : "Complemento");
      const safeDetails = typeof activityData.details === "string" ? activityData.details.trim().slice(0, 150) : fallbackName;
      const safeState = typeof activityData.state === "string" ? activityData.state.trim().slice(0, 100) : null;

      setRpcActivity({
        name: safeName,
        details: safeDetails,
        state: safeState,
        cover: coverUrl || resolvedIcon || null,
        smallCover: coverUrl ? (activityData.smallCover || resolvedIcon) : null,
        smallText: activityData.smallText || safeDetails,
        party: activityData.party || null,
        startTime: activityData.startTime || Date.now(),
        type: activityData.type || (activityData.isCatalog ? "launcher" : "game"),
        isCatalog: Boolean(activityData.isCatalog),
        source: `addon:${activityData.pluginId || "plugin"}`,
      });
      return { success: true };
    } catch (err) {
      console.warn("[STAGE] Error seteando actividad RPC:", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("plugins:close-stage-view", async (event, stageDef) => {
    global.activeStageDef = null;
    global.currentStageScripts = [];

    try {
      const { getCurrentState, clearRpcActivity } = require("../../gameScanner.cjs");
      const current = getCurrentState();
      if (!current?.source || current.source.startsWith("addon:") || current.source === "rpc") {
        clearRpcActivity();
      }
    } catch (_) {}

    const { BrowserWindow } = require("electron");
    const wins = BrowserWindow.getAllWindows();
    for (const win of wins) {
      if (win && !win.isDestroyed() && event?.sender && win.webContents.id !== event.sender.id) {
        win.webContents.send("plugins:close-stage-view", stageDef);
      }
    }
    return true;
  });

  ipcMain.handle("plugins:clear-stage-storage", async (_event, customOrigins) => {
    try {
      const { session } = require("electron");
      const defaultGameOrigins = [
        "https://pes6.optijuegos.net",
        "https://dragonballbt3.online",
        "https://nfsunderground2.site",
        "https://silentspacemarine.com",
        "https://tboi.online",
        "https://mcraft.fun",
        "https://archive.org",
      ];
      const targetOrigins = Array.isArray(customOrigins) && customOrigins.length > 0
        ? [...new Set([...defaultGameOrigins, ...customOrigins])]
        : defaultGameOrigins;

      for (const origin of targetOrigins) {
        try {
          await session.defaultSession.clearStorageData({
            origin,
            storages: [
              "appcache",
              "cookies",
              "filesystem",
              "indexdb",
              "localstorage",
              "shadercache",
              "websql",
              "serviceworkers",
              "cachestorage",
            ],
          });
        } catch (_) {}
      }

      await session.defaultSession.clearCache();
      return { success: true };
    } catch (err) {
      console.error("[STORAGE] Error clearing stage storage:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("plugins:set-stage-volume", async (_event, { volume, isMuted }) => {
    global.currentStageVolume = { volume, isMuted };
    const { BrowserWindow, webFrameMain } = require("electron");
    const wins = BrowserWindow.getAllWindows();
    const volRatio = typeof volume === "number" ? Math.max(0, Math.min(1, volume / 100)) : 1.0;
    const muted = Boolean(isMuted);
    const script = `if (typeof window._onicordSetStageVolume === 'function') { window._onicordSetStageVolume(${volRatio}, ${muted}); }`;

    for (const win of wins) {
      if (!win || win.isDestroyed()) continue;
      try {
        const mainFrame = win.webContents?.mainFrame;
        if (!mainFrame) continue;
        const subframes = webFrameMain.fromId(mainFrame.processId, mainFrame.routingId)?.frames || [];
        for (const frame of subframes) {
          try {
            frame.executeJavaScript(script).catch(() => {});
          } catch (_) {}
        }
      } catch (_) {}
    }
    return true;
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

  // === Generic Stage Share URL Capture ===
  const handleCaptureStageShareUrl = async (event, stageConfig) => {
    const { clipboard } = require("electron");
    const config = stageConfig || global.activeStageDef || {};
    const { triggerSelector, windowProperty, queryParam } = config.shareCapture || {};

    // Colectar recursivamente todos los subframes del webContents
    function collectFrames(frame) {
      let list = [frame];
      if (frame && frame.frames && frame.frames.length > 0) {
        for (const child of frame.frames) {
          list = list.concat(collectFrames(child));
        }
      }
      return list;
    }

    try {
      const allFrames = collectFrames(event.sender.mainFrame);
      const subFrames = allFrames.filter((f) => f !== event.sender.mainFrame);

      for (const frame of subFrames) {
        try {
          // 1. Primero verificar si la propiedad de ventana ya tiene el enlace activo
          if (windowProperty) {
            const propVal = await frame.executeJavaScript(`
              (() => {
                try {
                  return window["${windowProperty}"] ? String(window["${windowProperty}"]) : null;
                } catch (_) { return null; }
              })()
            `);
            if (propVal && typeof propVal === "string" && (!queryParam || propVal.includes(queryParam))) {
              return propVal.trim();
            }
          }

          // 2. Si la URL actual del iframe ya tiene el parámetro de sala
          if (queryParam) {
            const urlVal = await frame.executeJavaScript(`
              (() => {
                try {
                  if (window.location && window.location.search && window.location.search.includes("${queryParam}")) {
                    return window.location.href;
                  }
                } catch (_) {}
                return null;
              })()
            `);
            if (urlVal && typeof urlVal === "string") {
              return urlVal.trim();
            }
          }

          // 3. Si hay un botón selector (ej. #roomsShare)
          if (triggerSelector) {
            const prevClip = clipboard.readText();
            const clickInfo = await frame.executeJavaScript(`
              (() => {
                try {
                  const btn = document.querySelector("${triggerSelector}");
                  if (!btn) return { status: "not_found" };
                  if (btn.disabled) return { status: "disabled" };
                  btn.click();
                  return { status: "clicked" };
                } catch (e) {
                  return { status: "error", message: e.message };
                }
              })()
            `);

            if (clickInfo && clickInfo.status === "clicked") {
              // Esperar a que la copia asíncrona o la actualización de windowProperty ocurra
              for (let i = 0; i < 6; i++) {
                await new Promise((r) => setTimeout(r, 100));

                if (windowProperty) {
                  const prop = await frame.executeJavaScript(`
                    (() => {
                      try {
                        return window["${windowProperty}"] ? String(window["${windowProperty}"]) : null;
                      } catch (_) { return null; }
                    })()
                  `).catch(() => null);
                  if (prop && (!queryParam || prop.includes(queryParam))) {
                    return prop.trim();
                  }
                }

                const currentClip = clipboard.readText();
                if (currentClip && currentClip !== prevClip && (!queryParam || currentClip.includes(queryParam))) {
                  return currentClip.trim();
                }
              }
            } else if (clickInfo && clickInfo.status === "disabled") {
              console.debug("[Stage Link Capture] Share trigger is disabled (room not active yet).");
              return null;
            }
          }
        } catch (execErr) {
          console.debug("[Stage Link Capture] Subframe exec notice:", execErr.message);
        }
      }
    } catch (_) {}

    return null;
  };

  ipcMain.handle("stage:capture-share-url", handleCaptureStageShareUrl);
}

module.exports = { registerPluginDriveHandlers };
