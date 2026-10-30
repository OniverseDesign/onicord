const { app, ipcMain, shell, Notification, BrowserWindow, nativeImage, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const diagService = require("../../services/diagService.cjs");
const weatherService = require("../../services/weatherService.cjs");
const openGraphService = require("../../services/openGraphService.cjs");

// State for hardware monitors
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = process.hrtime.bigint();

function registerSystemDiagHandlers() {
  // === Window controls & OS ===
  ipcMain.on("show-item-in-folder", (event, fullPath) => {
    if (fullPath) {
      shell.showItemInFolder(fullPath);
    }
  });

  ipcMain.on("window:minimize", () => {
    global.mainWindow?.minimize();
  });

  ipcMain.handle("window:isMinimized", () => {
    return global.mainWindow && !global.mainWindow.isDestroyed()
      ? global.mainWindow.isMinimized()
      : false;
  });

  ipcMain.on("window:maximize", () => {
    if (global.mainWindow?.isMaximized()) global.mainWindow.unmaximize();
    else global.mainWindow?.maximize();
  });

  ipcMain.on("window:setFullscreen", (_event, flag) => {
    if (global.mainWindow) {
      global.mainWindow.setFullScreen(Boolean(flag));
      global.mainWindow.webContents?.send("window:fullscreen-change", Boolean(flag));
    }
  });

  ipcMain.handle("window:isFullscreen", () => {
    return Boolean(global.mainWindow?.isFullScreen());
  });

  ipcMain.on("window:close", () => {
    global.mainWindow?.close();
  });

  ipcMain.on("window:focus", () => {
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      if (global.mainWindow.isMinimized()) global.mainWindow.restore();
      if (!global.mainWindow.isVisible()) global.mainWindow.show();
      global.mainWindow.focus();
    }
  });

  ipcMain.on("app:update-icon", (_event, dataUrl) => {
    try {
      if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return;
      const img = nativeImage.createFromDataURL(dataUrl);
      if (img.isEmpty()) return;

      global.currentAppIcon = img;

      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.setIcon(img);
      }
      if (global.tray && !global.tray.isDestroyed()) {
        const trayImg = img.resize({ width: 32, height: 32, quality: "best" });
        global.tray.setImage(trayImg);
      }
      if (process.platform === "darwin" && app.dock) {
        app.dock.setIcon(img);
      }
    } catch (err) {
      console.error("[DynamicIcon] Error al actualizar icono:", err);
    }
  });

  ipcMain.on("app:update-badge", (_event, payload) => {
    try {
      const count = Number(payload?.count) || 0;
      const dataUrl = payload?.dataUrl;

      // 1. Windows: Use setOverlayIcon exclusively with the rendered PNG canvas
      if (process.platform === "win32") {
        // On Windows, avoid calling app.setBadgeCount with count > 0 because Chromium's
        // native API draws an unstyled black badge that overrides setOverlayIcon.
        if (typeof app.setBadgeCount === "function") {
          try {
            app.setBadgeCount(0);
          } catch (_) {}
        }

        const targetWin = BrowserWindow.fromWebContents(_event.sender) || global.mainWindow;
        if (targetWin && !targetWin.isDestroyed()) {
          if (count > 0 && typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) {
            const badgeImg = nativeImage.createFromDataURL(dataUrl);
            if (!badgeImg.isEmpty()) {
              const desc = `${count > 9 ? "+9" : count} mensajes sin leer`;
              targetWin.setOverlayIcon(badgeImg, desc);
            } else {
              targetWin.setOverlayIcon(null, "");
            }
          } else {
            targetWin.setOverlayIcon(null, "");
          }
        }
      }

      // 2. macOS: Dock badge
      if (process.platform === "darwin" && app.dock) {
        const badgeStr = count > 9 ? "+9" : count > 0 ? String(count) : "";
        app.dock.setBadge(badgeStr);
      }

      // 3. Linux / Unity ONLY
      if (process.platform === "linux" && typeof app.setBadgeCount === "function") {
        app.setBadgeCount(count);
      }
    } catch (err) {
      console.error("[DynamicBadge] Error al actualizar badge:", err);
    }
  });

  ipcMain.on("window:open-external", (_event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        shell.openExternal(url);
      } else {
        console.warn("⚠️ Intento bloqueado de abrir URL no segura:", url);
      }
    } catch (err) {
      console.error("⚠️ URL inválida rechazada:", err);
    }
  });

  function getNotificationIcon() {
    const candidates = [
      path.join(__dirname, "../../../dist/icon.png"),
      path.join(__dirname, "../../../build/icon.png"),
      path.join(__dirname, "../../../public/icon.png"),
      path.join(process.resourcesPath, "icon.png"),
      path.join(process.resourcesPath, "build/icon.png"),
      path.join(process.resourcesPath, "public/icon.png"),
      path.join(app.getAppPath(), "build/icon.png"),
      path.join(app.getAppPath(), "dist/icon.png"),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    return undefined;
  }

  function displayOSNotification({ title, body, silent = false }) {
    if (!Notification.isSupported()) {
      console.warn("[OS Notification] Notification.isSupported() devolvió false");
      diagService.log("warn", "Console", "[OS Notification] Notification.isSupported() devolvió false");
      return { success: false, reason: "NOT_SUPPORTED" };
    }

    const iconPath = getNotificationIcon();
    const notifOptions = {
      title: title || "Onicord",
      body: body || "",
      silent: Boolean(silent),
    };

    if (iconPath) {
      notifOptions.icon = iconPath;
    }

    const notif = new Notification(notifOptions);

    notif.on("click", () => {
      const mainWindow = global.mainWindow || BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
    });

    notif.on("failed", (_event, error) => {
      console.error("[OS Notification Failed]", error);
      diagService.log("error", "Console", `[OS Notification Failed] ${error}`);
    });

    notif.show();
    diagService.log("info", "Console", `[OS Notification] Notification displayed: "${title}" - "${body}"`);
    return { success: true };
  }

  ipcMain.on("show-os-notification", (_event, { title, body }) => {
    try {
      displayOSNotification({ title, body });
    } catch (err) {
      console.error("[OS Notification Error]", err);
      diagService.log("error", "Console", `[OS Notification Error] ${err.message}`);
    }
  });

  ipcMain.handle("system:test-notification", async (_event, customData) => {
    try {
      const title = customData?.title || "Onicord";
      const body = customData?.body || "Desktop notifications are working correctly.";
      return displayOSNotification({ title, body });
    } catch (err) {
      console.error("[OS Test Notification Error]", err);
      return { success: false, error: err.message };
    }
  });

  // === Diagnostics ===
  ipcMain.handle("diagnostics:getLocal", async () => {
    return diagService.getLocalLogs();
  });

  ipcMain.handle("diagnostics:clear", async () => {
    diagService.clearLogs();
    return { success: true };
  });

  ipcMain.handle("diagnostics:request", async (_event, peerId) => {
    if (!global.roomManager) return { success: false };
    global.roomManager.requestPeerDiagnostics(peerId);
    return { success: true };
  });

  ipcMain.handle("diagnostics:log", async (_event, level, category, message) => {
    diagService.log(level, category, message);
    return { success: true };
  });

  ipcMain.handle("diagnostics:exportAllUserLogs", async () => {
    try {
      const logsDir = path.join(process.cwd(), "logs");
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }

      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
      const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
      const formattedTimestamp = `${dateStr}_${timeStr}`;

      const sanitize = (name) => String(name || "usuario").trim().replace(/[^a-zA-Z0-9_\-]/g, "_");

      const savedFiles = [];

      let auditLog = [];
      try {
        if (global.roomManager?.roomCode && global.roomManager?.roomMetaStore) {
          const meta = await global.roomManager.roomMetaStore.load(global.roomManager.roomCode);
          if (Array.isArray(meta?.auditLog)) {
            auditLog = meta.auditLog.map((entry) => {
              const d = new Date(entry.timestamp || Date.now());
              const p = (n) => String(n).padStart(2, "0");
              const avatar = entry.avatar && entry.avatar.startsWith("data:image") ? `${entry.avatar.slice(0, 40)}...[base64_truncated]` : entry.avatar;
              return {
                ...entry,
                avatar,
                formattedDate: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
              };
            });
          }
        }
      } catch (e) {
        console.warn("[Diag Export] Could not attach audit log:", e.message);
      }

      const localNickname = global.roomManager?.profile?.nickname || "local_user";
      const localFileName = `onidiag_log_${sanitize(localNickname)}_${formattedTimestamp}.json`;
      const localFilePath = path.join(logsDir, localFileName);

      const localPackage = {
        timestamp: Date.now(),
        formattedDate: `${dateStr} ${timeStr.replace(/-/g, ":")}`,
        user: {
          nickname: localNickname,
          id: global.roomManager?.profile?.id || "local",
          isLocal: true,
        },
        environment: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
        },
        auditLog,
        logs: diagService.getLocalLogs(),
      };

      fs.writeFileSync(localFilePath, JSON.stringify(localPackage, null, 2), "utf8");
      savedFiles.push(localFileName);

      if (global.roomManager) {
        const peerResults = await global.roomManager.collectAllPeerLogs(2000);
        for (const peerItem of peerResults) {
          const peerNick = peerItem.nickname || peerItem.peerId || "peer";
          const peerFileName = `onidiag_log_${sanitize(peerNick)}_${formattedTimestamp}.json`;
          const peerFilePath = path.join(logsDir, peerFileName);

          const peerPackage = {
            timestamp: Date.now(),
            formattedDate: `${dateStr} ${timeStr.replace(/-/g, ":")}`,
            user: {
              nickname: peerNick,
              peerId: peerItem.peerId,
              isLocal: false,
            },
            logs: peerItem.logs || [],
          };

          fs.writeFileSync(peerFilePath, JSON.stringify(peerPackage, null, 2), "utf8");
          savedFiles.push(peerFileName);
        }
      }

      return {
        success: true,
        count: savedFiles.length,
        savedFiles,
      };
    } catch (err) {
      console.error("[OniDiag Export Error]:", err);
      return { success: false, error: err.message };
    }
  });

  // === OpenGraph Scanner (Delegated to openGraphService) ===
  ipcMain.handle("opengraph:fetch", async (_event, targetUrl) => {
    return openGraphService.fetchOpenGraph(targetUrl);
  });

  // === Hardware & System ===
  ipcMain.handle("hardware:getNetworkSpeed", async () => {
    const swarmBytes = (global.roomManager?.p2pService?.swarm?.connections?.size || 0) * 1024 * 12.5;
    const totalBytes = swarmBytes + global.activeDownloadBytesThisSecond;
    global.activeDownloadBytesThisSecond = 0;

    const speedKbs = totalBytes / 1024;
    if (speedKbs > 1024) {
      return `${(speedKbs / 1024).toFixed(1)} MB/s`;
    }
    return `${speedKbs.toFixed(1)} KB/s`;
  });

  ipcMain.handle("hardware:getRealCPU", async () => {
    const cpus = os.cpus().length || 1;
    const currentUsage = process.cpuUsage();
    const currentTime = process.hrtime.bigint();

    const userDelta = currentUsage.user - lastCpuUsage.user;
    const sysDelta = currentUsage.system - lastCpuUsage.system;
    const cpuDelta = userDelta + sysDelta;
    const timeDelta = Number(currentTime - lastCpuTime) / 1000;

    lastCpuUsage = currentUsage;
    lastCpuTime = currentTime;

    if (timeDelta === 0) return "0.0";

    const cpuPercent = (cpuDelta / timeDelta / cpus) * 100;
    return Math.max(0, Math.min(100, cpuPercent)).toFixed(1);
  });

  ipcMain.handle("hardware:getRealRAM", async () => {
    const mem = process.memoryUsage();
    return `${Math.round(mem.rss / 1024 / 1024)} MB`;
  });

  ipcMain.handle("system:getDiagnostics", async () => {
    let pkg = {};
    try {
      pkg = require("../../package.json");
    } catch (e) {}

    const cpus = os.cpus();
    const cpuModel = cpus && cpus.length > 0 ? cpus[0].model.trim() : "CPU";
    const cpuCores = cpus ? cpus.length : 1;

    let osName = os.type();
    if (osName === "Windows_NT") {
      const releaseParts = os.release().split(".");
      const major = parseInt(releaseParts[0], 10);
      const build = parseInt(releaseParts[2] || "0", 10);
      if (major === 10) {
        osName = build >= 22000 ? "Windows 11" : "Windows 10";
      } else if (major === 6) {
        if (releaseParts[1] === "3") osName = "Windows 8.1";
        else if (releaseParts[1] === "2") osName = "Windows 8";
        else if (releaseParts[1] === "1") osName = "Windows 7";
      }
    } else if (osName === "Darwin") {
      osName = "macOS";
    }

    return {
      app: pkg.name || "onicord",
      version: app.getVersion() || pkg.version || "0.1.0",
      buildType: "Standalone P2P",
      electron: process.versions.electron || "Desconocido",
      chromium: process.versions.chrome || "Desconocido",
      node: process.versions.node || "Desconocido",
      v8: process.versions.v8 || "Desconocido",
      platform: process.platform,
      arch: process.arch,
      osName: `${osName} (${os.release()})`,
      cpuModel,
      cpuCores,
      totalRamGB: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(1) + " GB",
      freeRamGB: (os.freemem() / (1024 * 1024 * 1024)).toFixed(1) + " GB",
      processRamMB: Math.round(process.memoryUsage().rss / 1024 / 1024) + " MB",
      hyperswarmVersion: pkg.dependencies?.hyperswarm ? pkg.dependencies.hyperswarm.replace("^", "") : "4.9.0",
      uptimeSeconds: Math.floor(process.uptime()),
    };
  });

  // === Weather ===
  ipcMain.handle("weather:search", async (event, cityName) => {
    return weatherService.search(cityName);
  });
  ipcMain.handle("weather:searchCities", async (event, currentName) => {
    return weatherService.searchCities(currentName);
  });
  ipcMain.handle("weather:loadForecast", async (event, { lat, lon }) => {
    return weatherService.loadForecast(lat, lon);
  });

  // === Game & App Presence ===
  ipcMain.handle("game:get-current", () => {
    const { getCurrentState } = require("../../gameScanner.cjs");
    return getCurrentState();
  });

  ipcMain.handle("streamer:get-status", () => {
    const { getStreamerStatus } = require("../../gameScanner.cjs");
    return getStreamerStatus ? getStreamerStatus() : { active: false, app: null };
  });

  async function autoClassifyProgram(filePath, targetPath) {
    const parsedTarget = path.parse(targetPath);
    const parsedFile = path.parse(filePath);
    const exeName = parsedTarget.base;
    const cleanBaseName = parsedFile.ext.toLowerCase() === ".lnk" ? parsedFile.name : parsedTarget.name;

    // 1. Official base catalog games.json
    try {
      const gamesDB = require("../../games.json");
      const inDb = gamesDB.find((g) => g.exe && g.exe.toLowerCase() === exeName.toLowerCase());
      if (inDb) {
        return {
          title: inDb.title || cleanBaseName,
          type: inDb.type || "game",
          cover: inDb.cover || null,
        };
      }
    } catch {}

    // Format clean candidate title
    let candidateTitle = cleanBaseName
      .replace(/[_-]+/g, " ")
      .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
      .trim();
    if (candidateTitle) {
      candidateTitle = candidateTitle.charAt(0).toUpperCase() + candidateTitle.slice(1);
    } else {
      candidateTitle = cleanBaseName;
    }

    // 2. Directory and executable name heuristics
    const lowerPath = targetPath.toLowerCase();
    const lowerExe = exeName.toLowerCase();

    const gameIndicators = [
      "steamapps", "steam", "epic games", "riot games", "ubisoft", "gog galaxy",
      "gog", "juegos", "games", "game", "ea desktop", "origin games", "battlenet",
      "unity", "unreal", "godot"
    ];
    const appIndicators = [
      "adobe", "blender", "studio", "code", "jetbrains", "intellij", "pycharm",
      "webstorm", "rider", "visual studio", "office", "microsoft", "discord",
      "slack", "browser", "chrome", "firefox", "brave", "edge", "opera",
      "notepad", "sublime", "git", "terminal", "obs-studio", "fl studio", "ableton"
    ];

    let detectedType = null;
    if (gameIndicators.some((kw) => lowerPath.includes(kw) || lowerExe.includes(kw))) {
      detectedType = "game";
    } else if (appIndicators.some((kw) => lowerPath.includes(kw) || lowerExe.includes(kw))) {
      detectedType = "app";
    }

    // 3. Lightweight query to Wikipedia API
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);
      const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(candidateTitle)}`;
      const res = await fetch(searchUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "Onicord-Presence/0.1.4 (https://github.com/OniverseDesign)" },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const text = `${data.title || ""} ${data.description || ""} ${data.extract || ""}`.toLowerCase();

        const isWikiGame = /\b(video game|videojuego|roguelike|rpg|shooter|gameplay|arcade|action-adventure|platformer)\b/i.test(text);
        const isWikiApp = /\b(software|application|suite|digital audio|editor|compiler|3d computer|utility|development)\b/i.test(text);

        if (isWikiGame) {
          detectedType = "game";
          if (data.title && !data.title.includes("(")) {
            candidateTitle = data.title;
          }
        } else if (isWikiApp) {
          detectedType = "app";
          if (data.title && !data.title.includes("(")) {
            candidateTitle = data.title;
          }
        }
      }
    } catch {}

    if (!detectedType) {
      detectedType = lowerPath.includes("program files") && !lowerPath.includes("game") ? "app" : "game";
    }

    return {
      title: candidateTitle,
      type: detectedType,
      cover: null,
    };
  }

  ipcMain.handle("dialog:openExecutable", async () => {
    const win = BrowserWindow.getFocusedWindow() || global.mainWindow;
    const isWindows = process.platform === "win32";
    const filters = isWindows
      ? [
          { name: "Juegos y Aplicaciones (*.exe, *.lnk)", extensions: ["exe", "lnk"] },
          { name: "Ejecutables (*.exe)", extensions: ["exe"] },
          { name: "Accesos directos (*.lnk)", extensions: ["lnk"] },
          { name: "Todos los archivos", extensions: ["*"] },
        ]
      : [{ name: "Todos los archivos", extensions: ["*"] }];

    const result = await dialog.showOpenDialog(win, {
      title: "Seleccionar Juego o Aplicación",
      properties: ["openFile"],
      filters,
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    let targetPath = filePath;

    if (isWindows && filePath.toLowerCase().endsWith(".lnk")) {
      try {
        const link = shell.readShortcutLink(filePath);
        if (link && link.target && fs.existsSync(link.target)) {
          targetPath = link.target;
        }
      } catch (e) {
        console.warn("[dialog:openExecutable] Error leyendo shortcut:", e.message);
      }
    }

    const parsedTarget = path.parse(targetPath);
    let iconDataUrl = null;
    try {
      const iconTarget = fs.existsSync(targetPath) ? targetPath : filePath;
      const nativeImg = await app.getFileIcon(iconTarget, { size: "large" });
      if (nativeImg && !nativeImg.isEmpty()) {
        iconDataUrl = nativeImg.toDataURL();
      }
    } catch (err) {
      console.warn("[dialog:openExecutable] No se pudo extraer icono:", err.message);
    }

    const classification = await autoClassifyProgram(filePath, targetPath);

    return {
      filePath: targetPath,
      fileName: parsedTarget.base,
      title: classification.title,
      type: classification.type,
      icon: classification.cover || iconDataUrl,
    };
  });

  ipcMain.handle("system:extractFileIcon", async (_event, filePath) => {
    if (!filePath || typeof filePath !== "string") return null;
    try {
      const nativeImg = await app.getFileIcon(filePath, { size: "large" });
      if (nativeImg && !nativeImg.isEmpty()) {
        return nativeImg.toDataURL();
      }
      return null;
    } catch (err) {
      console.warn("[system:extractFileIcon] Error extrayendo icono:", err.message);
      return null;
    }
  });
}

module.exports = { registerSystemDiagHandlers };
