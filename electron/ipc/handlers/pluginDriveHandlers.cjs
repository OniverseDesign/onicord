const { ipcMain, BrowserWindow, dialog } = require("electron");
const pluginService = require("../../services/pluginService.cjs");
const pluginSandboxService = require("../../services/pluginSandboxService.cjs");
const driveAuthService = require("../../services/driveAuthService.cjs");
const driveService = require("../../services/driveService.cjs");
const updateService = require("../../services/updateService.cjs");
const overlayService = require("../../services/overlayService.cjs");
const profileService = require("../../services/profileService.cjs");
const diagService = require("../../services/diagService.cjs");

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

  ipcMain.handle("plugins:open-stage-view", async (event, rawStageDef) => {
    let stageDef = rawStageDef || {};
    if (stageDef?.pluginId) {
      stageDef = pluginSandboxService.resolveStage(stageDef.pluginId, stageDef);
    }
    global.activeStageDef = stageDef;
    const fallbackNick = profileService.activeProfile?.nickname || profileService.activeProfile?.username || "Oniverse";
    let candidateNick = stageDef?.userNick || stageDef?.authorName;
    if (!candidateNick || candidateNick === "Jugador" || candidateNick === "PLAYER") {
      candidateNick = fallbackNick;
    }
    const safeNick = typeof candidateNick === "string" && candidateNick.trim() ? candidateNick.trim().slice(0, 20) : fallbackNick;
    let scripts = [];

    // 1. Inyectar siempre el puente agnóstico de confirmaciones nativas de Onicord y puente de mandos (Gamepad API)
    const bridgeScript = `
      try {
        window.onicord = window.onicord || {};
        if (!window.onicord.confirm) {
          window.onicord.confirm = function(opts) {
            return new Promise(function(resolve) {
              var reqId = "req_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
              function onMsg(ev) {
                if (ev.data && ev.data.type === "ONICORD_CONFIRM_RESPONSE" && ev.data.requestId === reqId) {
                  window.removeEventListener("message", onMsg);
                  resolve(Boolean(ev.data.confirmed));
                }
              }
              window.addEventListener("message", onMsg);
              window.parent.postMessage(Object.assign({
                type: "ONICORD_REQUEST_CONFIRM",
                requestId: reqId
              }, opts || {}), "*");
            });
          };
        }

        // Puente agnóstico de Gamepad API para juegos en iframe
        if (!window._onicordGamepadBridgeInstalled) {
          window._onicordGamepadBridgeInstalled = true;
          window._onicordSyncedGamepads = [];

          window.addEventListener("message", function(ev) {
            if (ev.data && ev.data.type === "ONICORD_GAMEPAD_STATE" && Array.isArray(ev.data.pads)) {
              window._onicordSyncedGamepads = ev.data.pads;
              if (window.isaacPadReader && typeof window.isaacPadReader.wake === "function") {
                window.isaacPadReader.wake();
              }
              if (!window._onicordGamepadEventDispatched && ev.data.pads.some(function(p) { return p && p.connected; })) {
                window._onicordGamepadEventDispatched = true;
                try {
                  var p0 = ev.data.pads.find(function(p) { return p && p.connected; });
                  window.dispatchEvent(new CustomEvent("gamepadconnected", { detail: { gamepad: p0 } }));
                } catch (_) {}
              }
            }
          });

          var origGetGamepads = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : function() { return []; };
          navigator.getGamepads = function() {
            var native = origGetGamepads();
            if (native && Array.from(native).some(function(p) { return p && p.connected; })) {
              return native;
            }
            if (window._onicordSyncedGamepads && window._onicordSyncedGamepads.length > 0) {
              return window._onicordSyncedGamepads;
            }
            return native || [];
          };
        }
      } catch (_) {}
    `;
    scripts.push(bridgeScript);

    // 2. Inyectar el apodo del usuario sanitizado
    scripts.push(`window._onicordUserNick = ${JSON.stringify(safeNick)};`);

    // 3. Inyectar los frameScripts configurados en la etapa
    if (Array.isArray(stageDef?.frameScripts)) {
      for (const s of stageDef.frameScripts) {
        if (typeof s === "string" && s.trim()) {
          scripts.push(s);
        }
      }
    }

    global.currentStageScripts = scripts;

    // Ejecutar inmediatamente los scripts en todos los subframes existentes
    try {
      if (event?.sender?.mainFrame) {
        const subFrames = collectFrames(event.sender.mainFrame).filter((f) => f !== event.sender.mainFrame);
        for (const frame of subFrames) {
          for (const s of scripts) {
            if (typeof s === "string" && s.trim()) {
              frame.executeJavaScript(s).catch(() => {});
            }
          }
        }
      }
    } catch (_) {}

    // Determinar la actividad efectiva a reportar (Launcher vs Juego)
    let act = stageDef?.activity;
    const isGameTarget = Boolean(stageDef?.url && !stageDef?.entryPoint && !stageDef?.htmlContent && !stageDef?.isCatalog);

    if (isGameTarget) {
      if (!act || act.isCatalog || act.name === "Arcade" || act.type === "launcher") {
        act = {
          name: stageDef.title || stageDef.name || "Juego",
          details: stageDef.details || "Arcade",
          state: stageDef.state || "En partida",
          cover: stageDef.cover || null,
          smallCover: stageDef.smallCover || null,
          smallText: stageDef.smallText || stageDef.details || "Arcade",
          party: stageDef.party || null,
          startTime: stageDef.startTime || Date.now(),
          type: "game",
          isCatalog: false,
        };
      }
    }

    if (act && act.name) {
      try {
        const { setRpcActivity } = require("../../gameScanner.cjs");
        const pluginService = require("../../services/pluginService.cjs");
        const plugin = stageDef.pluginId && pluginService.getPlugin ? pluginService.getPlugin(stageDef.pluginId) : null;
        const iconPath = plugin?.manifest?.icon || "assets/icon.png";
        const resolvedIcon = stageDef.pluginId && pluginService.resolvePluginIcon
          ? (pluginService.resolvePluginIcon(iconPath, stageDef.pluginId) || pluginService.resolvePluginIcon("assets/icon.png", stageDef.pluginId) || pluginService.resolvePluginIcon("assets/icon.svg", stageDef.pluginId))
          : null;
        const safeName = typeof act.name === "string" ? act.name.trim().slice(0, 100) : "Complemento";
        const safeDetails = typeof act.details === "string" ? act.details.trim().slice(0, 150) : (stageDef.title || "Complemento");
        const safeState = typeof act.state === "string" ? act.state.trim().slice(0, 100) : null;
        let safeCover = null;
        if (typeof act.cover === "string") {
          const trimmed = act.cover.trim();
          if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:image/") || trimmed.startsWith("onicord-media://")) {
            safeCover = trimmed;
          } else if (stageDef.pluginId && pluginService.resolvePluginIcon) {
            safeCover = pluginService.resolvePluginIcon(trimmed, stageDef.pluginId);
          }
        }
        setRpcActivity({
          name: safeName,
          details: safeDetails,
          state: safeState,
          cover: safeCover || resolvedIcon || null,
          smallCover: safeCover ? (act.smallCover || resolvedIcon) : null,
          smallText: act.smallText || safeDetails,
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
      let targetOrigins = [];
      if (Array.isArray(customOrigins) && customOrigins.length > 0) {
        targetOrigins = customOrigins;
      } else if (global.activeStageDef?.url) {
        try {
          targetOrigins = [new URL(global.activeStageDef.url).origin];
        } catch (_) {}
      }

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
    const { clipboard, BrowserWindow } = require("electron");
    const config = stageConfig || global.activeStageDef || {};
    const { triggerSelector, windowProperty, queryParam, urlPattern } = config.shareCapture || {};

    let effectiveUrlPattern = urlPattern;
    if (!effectiveUrlPattern && (config.url || "").includes("garticphone.com")) {
      effectiveUrlPattern = "garticphone\\.com/(?:[a-zA-Z]{2}/)?([-_a-zA-Z0-9]{6,16})|garticphone\\.com/.*[?&]c=";
    }

    diagService.log("info", "StageCapture", `[StageCapture] Started. url: ${config.url}, urlPattern: ${effectiveUrlPattern}, queryParam: ${queryParam}`);

    const normalizeUrl = (u) => {
      if (!u || typeof u !== "string") return null;
      let trimmed = u.trim();
      if (trimmed.startsWith("garticphone.com")) {
        trimmed = "https://" + trimmed;
      } else if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
        if (/^(?:\/?[a-zA-Z]{2}\/)?[a-zA-Z0-9]{6,16}$/.test(trimmed)) {
          trimmed = "https://garticphone.com/" + trimmed.replace(/^\//, "");
        } else if (trimmed.includes(".com") || trimmed.includes(".io") || trimmed.includes("c=")) {
          trimmed = "https://" + trimmed;
        }
      }
      return trimmed.startsWith("http") ? trimmed : null;
    };

    const isMatch = (url) => {
      if (!url || typeof url !== "string") return false;
      const trimmed = url.trim();
      if (trimmed.includes("garticphone.com") && (trimmed.endsWith("/lobby") || trimmed.includes("/lobby/") || trimmed.includes("/lobby?"))) {
        return false;
      }
      if (effectiveUrlPattern) {
        try {
          return new RegExp(effectiveUrlPattern, "i").test(trimmed);
        } catch (_) {
          return false;
        }
      }
      if (queryParam) {
        return trimmed.includes(queryParam);
      }
      return Boolean(trimmed);
    };

    // 0. Pre-verificación del portapapeles: si el usuario ya copió el enlace dentro del juego
    try {
      const initialClip = clipboard.readText();
      const normClip = normalizeUrl(initialClip);
      diagService.log("info", "StageCapture", `[StageCapture] Clip: "${initialClip}" (norm: ${normClip}, match: ${isMatch(normClip)})`);
      if (normClip && isMatch(normClip)) {
        const stageUrl = config.url || "";
        const stageHost = stageUrl.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
        const clipHost = normClip.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
        if (stageHost && (clipHost.includes(stageHost) || stageHost.includes(clipHost))) {
          diagService.log("info", "StageCapture", `[StageCapture] Returned from initial clipboard: ${normClip}`);
          return normClip;
        }
      }
    } catch (_) {}

    const collectFrames = (frame) => {
      if (!frame) return [];
      const list = [frame];
      try {
        const children = frame.frames || [];
        for (const child of children) {
          list.push(...collectFrames(child));
        }
      } catch (_) {}
      return list;
    };

    try {
      let subFrames = [];
      try {
        const allFrames = collectFrames(event?.sender?.mainFrame);
        subFrames = allFrames.filter((f) => f !== event?.sender?.mainFrame);
      } catch (fErr) {
        diagService.log("warn", "StageCapture", `[StageCapture] Error collecting frames: ${fErr.message}`);
      }

      if (subFrames.length === 0) {
        try {
          const wins = BrowserWindow.getAllWindows();
          for (const win of wins) {
            if (!win || win.isDestroyed()) continue;
            const frames = collectFrames(win.webContents?.mainFrame);
            for (const f of frames) {
              if (f !== win.webContents?.mainFrame && !subFrames.includes(f)) {
                subFrames.push(f);
              }
            }
          }
        } catch (_) {}
      }

      diagService.log("info", "StageCapture", `[StageCapture] Subframes count: ${subFrames.length}`);

      for (const frame of subFrames) {
        try {
          diagService.log("info", "StageCapture", `[StageCapture] Evaluating subframe url: ${frame.url}`);

          // 1. Invocar helper _onicordGetActiveRoomLink (con soporte async) o verificar windowProperty
          const initialCheck = await frame.executeJavaScript(`
            (async () => {
              try {
                if (typeof window._onicordGetActiveRoomLink === 'function') {
                  const link = await window._onicordGetActiveRoomLink();
                  if (link) return link;
                }
                const propKey = ${JSON.stringify(windowProperty || '_onicordRoomLink')};
                if (window[propKey]) {
                  const p = String(window[propKey]);
                  if (p) return p;
                }
                return null;
              } catch (_) { return null; }
            })()
          `).catch(() => null);

          const normInitial = normalizeUrl(initialCheck);
          diagService.log("info", "StageCapture", `[StageCapture] Step 1 initialCheck: "${initialCheck}" (match: ${isMatch(normInitial)})`);
          if (normInitial && isMatch(normInitial)) {
            return normInitial;
          }

          // 2. Si la URL actual del subframe ya tiene el enlace de la sala
          if (effectiveUrlPattern || queryParam) {
            const urlVal = await frame.executeJavaScript(`
              (() => {
                try {
                  if (window.location && window.location.href) {
                    return window.location.href;
                  }
                } catch (_) {}
                return null;
              })()
            `).catch(() => null);

            const normUrl = normalizeUrl(urlVal);
            diagService.log("info", "StageCapture", `[StageCapture] Step 2 subframe href: "${urlVal}" (match: ${isMatch(normUrl)})`);
            if (normUrl && isMatch(normUrl)) {
              return normUrl;
            }
          }

          // 3. Fallback al botón selector o búsqueda agnóstica de invitar/compartir
          if (triggerSelector || queryParam || effectiveUrlPattern) {
            const clickInfo = await frame.executeJavaScript(`
              (() => {
                try {
                  const isGartic = window.location.hostname.includes('garticphone.com');
                  const pathname = window.location.pathname || '';

                  // Si está en la pantalla principal de Gartic Phone (no en el lobby ni en sala), auto-pulsar INICIAR
                  if (isGartic && !pathname.includes('/lobby') && !/[-_a-zA-Z0-9]{6,16}/.test(pathname.replace(/^\\/[a-zA-Z]{2}\\/?/, ''))) {
                    const startButtons = Array.from(document.querySelectorAll('button, [role="button"], a, input[type="button"], div, span'));
                    const startBtn = startButtons.find(el => {
                      if (el.children.length > 3) return false;
                      const txt = (el.textContent || '').trim().toLowerCase();
                      return txt === 'iniciar' || txt === 'start' || txt === 'começar' || txt === 'crear sala' || txt === 'create room';
                    });
                    if (startBtn) {
                      try {
                        startBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
                        startBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                        startBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
                        startBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                      } catch (_) {}
                      if (typeof startBtn.click === 'function') startBtn.click();
                      return { status: "auto_started", message: "Auto-pulsado botón INICIAR en portada" };
                    }
                  }

                  let btn = null;
                  const sel = ${JSON.stringify(triggerSelector || "")};
                  if (sel) {
                    try { btn = document.querySelector(sel); } catch (_) {}
                  }

                  if (!btn) {
                    const elements = Array.from(document.querySelectorAll('button, [role="button"], a, input[type="button"], div, span'));
                    btn = elements.find(el => {
                      if (el.children.length > 3) return false;
                      const txt = (el.textContent || '').trim().toLowerCase();
                      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                      const title = (el.getAttribute('title') || '').toLowerCase();
                      const id = (el.id || '').toLowerCase();
                      const cls = (el.className || '').toString().toLowerCase();
                      return (
                        txt === 'invitar' || txt === 'invite' || txt === 'copiar' || txt === 'convidar' ||
                        txt.includes('invitar') || txt.includes('invite') || txt.includes('copiar enlace') || txt.includes('copy link') || txt.includes('convidar') ||
                        aria.includes('invit') || aria.includes('share') || aria.includes('copiar') || aria.includes('link') ||
                        title.includes('invit') || title.includes('share') || title.includes('copiar') || title.includes('link') ||
                        cls.includes('invite') || cls.includes('share') || cls.includes('btlobby') || cls.includes('btinvite') ||
                        id.includes('invite') || id.includes('share')
                      );
                    });
                  }

                  if (!btn) {
                    const allBtnTexts = Array.from(document.querySelectorAll('button, [role="button"]')).map(b => (b.textContent || '').trim().slice(0, 30));
                    return { status: "not_found", buttonsFound: allBtnTexts, location: window.location.href };
                  }

                  const attrUrl = btn.getAttribute("data-url") || btn.getAttribute("data-link") || btn.getAttribute("data-share") || btn.dataset?.url || btn.dataset?.link;
                  if (attrUrl) {
                    return { status: "found_attr", url: attrUrl };
                  }
                  if (btn.disabled) return { status: "disabled" };
                  try {
                    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
                    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
                    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                  } catch (_) {}
                  if (typeof btn.click === 'function') btn.click();
                  return { status: "clicked", tag: btn.tagName, text: (btn.textContent || '').trim().slice(0, 30) };
                } catch (e) {
                  return { status: "error", message: e.message };
                }
              })()
            `).catch(() => null);

            diagService.log("info", "StageCapture", `[StageCapture] Step 3 clickInfo: ${JSON.stringify(clickInfo)}`);

            if (clickInfo && clickInfo.status === "found_attr" && clickInfo.url) {
              const normAttr = normalizeUrl(clickInfo.url);
              if (normAttr && isMatch(normAttr)) return normAttr;
            }

            if (clickInfo && (clickInfo.status === "clicked" || clickInfo.status === "auto_started")) {
              // Esperar a que la copia asíncrona o la actualización ocurra (hasta 3s)
              for (let i = 0; i < 20; i++) {
                await new Promise((r) => setTimeout(r, 150));

                const prop = await frame.executeJavaScript(`
                  (async () => {
                    try {
                      // 1. Helper / propiedad
                      if (typeof window._onicordGetActiveRoomLink === 'function') {
                        const l = await window._onicordGetActiveRoomLink();
                        if (l) return l;
                      }
                      const propKey = ${JSON.stringify(windowProperty || '_onicordRoomLink')};
                      if (window[propKey]) {
                        return String(window[propKey]);
                      }

                      // 2. Si entramos al lobby de Gartic Phone, buscar el botón invitar y pulsarlo
                      const pathname = window.location.pathname || '';
                      if (window.location.hostname.includes('garticphone.com') && pathname.includes('/lobby')) {
                        const elements = Array.from(document.querySelectorAll('button, [role="button"], a, input[type="button"], div, span'));
                        const invBtn = elements.find(el => {
                          if (el.children.length > 3) return false;
                          const txt = (el.textContent || '').trim().toLowerCase();
                          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                          const title = (el.getAttribute('title') || '').toLowerCase();
                          const cls = (el.className || '').toString().toLowerCase();
                          return (
                            txt === 'invitar' || txt === 'invite' || txt === 'copiar' || txt === 'convidar' ||
                            txt.includes('invitar') || txt.includes('invite') || txt.includes('copiar enlace') || txt.includes('copy link') ||
                            aria.includes('invit') || aria.includes('share') || aria.includes('copiar') ||
                            cls.includes('invite') || cls.includes('share') || cls.includes('btlobby') || cls.includes('btinvite')
                          );
                        });
                        if (invBtn) {
                          try {
                            invBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
                            invBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                            invBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
                            invBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                          } catch (_) {}
                          if (typeof invBtn.click === 'function') invBtn.click();
                        }
                      }
                      return null;
                    } catch (_) { return null; }
                  })()
                `).catch(() => null);

                const normProp = normalizeUrl(prop);
                if (normProp && isMatch(normProp)) {
                  diagService.log("info", "StageCapture", `[StageCapture] Success from prop/helper: ${normProp}`);
                  return normProp;
                }

                const currentClip = clipboard.readText();
                const normClip = normalizeUrl(currentClip);
                if (normClip && isMatch(normClip)) {
                  diagService.log("info", "StageCapture", `[StageCapture] Success from clipboard poll: ${normClip}`);
                  return normClip;
                }
              }
            } else if (clickInfo && clickInfo.status === "disabled") {
              diagService.log("info", "StageCapture", `[StageCapture] Share trigger is disabled (room not active yet).`);
            }
          }
        } catch (execErr) {
          diagService.log("warn", "StageCapture", `[StageCapture] Subframe exec error: ${execErr.message}`);
        }
      }
    } catch (fatalErr) {
      diagService.log("error", "StageCapture", `[StageCapture] Fatal error in capture loop: ${fatalErr.message}`);
    }

    diagService.log("info", "StageCapture", `[StageCapture] Finished with null (no room link detected).`);
    return null;
  };

  ipcMain.handle("stage:capture-share-url", handleCaptureStageShareUrl);
}

module.exports = { registerPluginDriveHandlers };
