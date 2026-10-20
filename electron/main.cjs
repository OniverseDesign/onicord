process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);
const {
  app,
  BrowserWindow,
  session,
  protocol,
  shell,
  Tray,
  Menu,
  globalShortcut,
} = require("electron");
const path = require("path");
const fs = require("fs");
const diagService = require("./services/diagService.cjs");

// Configurar flags de Chromium inmediatamente al inicio para deshabilitar WGC inestable en Windows y usar DXGI/GDI
app.commandLine.appendSwitch("disable-features", "WgcScreenCapturer,WgcScreenCapturerWin,WgcScreenCapturerForWindow,WgcScreenCapturerForCursor");
app.commandLine.appendSwitch("enable-features", "DxgiScreenCapturer");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("js-flags", "--expose-gc");

const PROTOCOL_PREFIX = "onicord"; 

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL_PREFIX, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_PREFIX);
}

try {
  const userData = app.getPath("userData");
  const profilePath = path.join(userData, "profile.json");
  if (fs.existsSync(profilePath)) {
    const raw = fs.readFileSync(profilePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.general?.disableHardwareAcceleration) {
      app.disableHardwareAcceleration();
      console.log(
        "[Onicord Core] Aceleración por hardware desactivada desde el perfil.",
      );
    }
  }
} catch (err) {}

const { startGameScanner, stopGameScanner, setBackgroundMode, setCustomGames } = require("./gameScanner.cjs");
const profileService = require("./services/profileService.cjs");
const ytdlpService = require("./services/ytdlpService.cjs");
const updateService = require("./services/updateService.cjs");
const mcpBridgeService = require("./services/mcpBridgeService.cjs");
const overlayService = require("./services/overlayService.cjs");
const globalKeybindService = require("./services/globalKeybindService.cjs");
const rpcServerService = require("./services/rpcServerService.cjs");
const { registerIPCHandlers } = require("./ipc/ipcRouter.cjs");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let tray = null;
global.isQuitting = false;
global.mainWindow = null;
global.roomManager = null;
global.pendingDeepLink = null;

function handleDeepLink(urlStr) {
  try {
    // Format 1: onicord://join/ROOMCODE (standard DHT join)
    const match = urlStr.match(/onicord:\/\/join\/([A-F0-9]{8})/i);
    if (match && match[1]) {
      const code = match[1].toUpperCase();
      console.log(`[Deep Link] Código de invitación detectado: ${code}`);
      if (global.mainWindow && !global.mainWindow.webContents.isDestroyed()) {
        global.mainWindow.webContents.send("onicord:deep-link", code);
      } else {
        global.pendingDeepLink = code;
      }
      return;
    }

    // Format 2: onicord://direct:IP:PORT/ROOMCODE (Direct TCP / Port Forwarding)
    const directMatch = urlStr.match(/onicord:\/\/direct:([^:\/]+):(\d+)\/([A-F0-9]{8})/i);
    if (directMatch) {
      const ip = directMatch[1];
      const port = parseInt(directMatch[2], 10);
      const code = directMatch[3].toUpperCase();
      const payload = { ip, port, code };
      console.log(`[Deep Link] Enlace de conexión directa detectado: ${ip}:${port} / ${code}`);
      if (global.mainWindow && !global.mainWindow.webContents.isDestroyed()) {
        global.mainWindow.webContents.send("onicord:direct-link", payload);
      } else {
        global.pendingDirectLink = payload;
      }
    }
  } catch (err) {
    console.error("[Deep Link Error] Fallo al procesar enlace:", err.message);
  }
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

try {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("onicord", process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient("onicord");
  }
} catch (protoErr) {
  console.warn("[Protocol Client] No se pudo registrar onicord://", protoErr.message);
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log(
    "[Onicord Guard] Ya hay otra instancia de la app corriendo. Cerrando proceso actual...",
  );
  app.quit();
  process.exit(0);
} else {
  app.on("second-instance", (event, commandLine) => {
    if (global.mainWindow) {
      if (!global.mainWindow.isVisible()) global.mainWindow.show();
      if (global.mainWindow.isMinimized()) global.mainWindow.restore();
      global.mainWindow.focus();
    }
    const deepLink = commandLine.find((arg) => arg.startsWith("onicord://"));
    if (deepLink) {
      handleDeepLink(deepLink);
    }
  });
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: "onicord-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true,
    },
  },
]);

function getAppIconPath() {
  const candidates = [
    path.join(__dirname, "../dist/icon.png"),
    path.join(__dirname, "../build/icon.png"),
    path.join(__dirname, "../public/icon.png"),
    path.join(process.resourcesPath, "icon.png"),
    path.join(process.resourcesPath, "build/icon.png"),
    path.join(process.resourcesPath, "public/icon.png"),
    path.join(process.resourcesPath, "app.asar/dist/icon.png"),
    path.join(process.resourcesPath, "app.asar/build/icon.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function createTray() {
  if (tray) return;
  const iconPath = getAppIconPath();
  if (!iconPath) {
    console.warn(
      "[Onicord Tray] No se encontró la ruta del icono para la bandeja del sistema.",
    );
    return;
  }

  tray = new Tray(iconPath);
  global.tray = tray;
  if (global.currentAppIcon && !global.currentAppIcon.isEmpty()) {
    try {
      tray.setImage(global.currentAppIcon.resize({ width: 32, height: 32, quality: "best" }));
    } catch (_) {}
  }
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Mostrar Onicord",
      click: () => {
        if (global.mainWindow) {
          global.mainWindow.show();
          global.mainWindow.focus();
        }
      },
    },
    {
      label: "Salir",
      click: () => {
        global.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Onicord");
  tray.setContextMenu(contextMenu);

  const restoreWindow = () => {
    if (global.mainWindow) {
      if (global.mainWindow.isMinimized()) global.mainWindow.restore();
      global.mainWindow.show();
      global.mainWindow.focus();
    }
  };

  tray.on("click", restoreWindow);
  tray.on("double-click", restoreWindow);
}

function createWindow() {
  global.mainWindow = new BrowserWindow({
    width: 1200,
    height: 700,
    minWidth: 1200,
    minHeight: 700,
    frame: false,
    show: false,
    fullscreenable: true,
    icon: global.currentAppIcon || getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      plugins: true,
      pdfViewerEnabled: true,
    },
    backgroundColor: "#1e1e2e",
  });

  global.mainWindow.on("focus", () => {
    overlayService.setAppFocused(true);
    globalKeybindService.setAppFocused(true);
  });

  global.mainWindow.on("blur", () => {
    overlayService.setAppFocused(false);
    globalKeybindService.setAppFocused(false);
  });

  global.mainWindow.on("minimize", () => {
    globalKeybindService.setAppFocused(false);
    if (!overlayService.getHasVoiceData()) {
      setBackgroundMode(true);
    }
    try {
      session.defaultSession.clearCache();
      if (typeof global.gc === "function") {
        global.gc();
      }
    } catch (e) {}
  });

  global.mainWindow.on("restore", () => {
    globalKeybindService.setAppFocused(true);
    setBackgroundMode(false);
  });

  global.mainWindow.on("hide", () => {
    globalKeybindService.setAppFocused(false);
    if (!overlayService.getHasVoiceData()) {
      setBackgroundMode(true);
    }
    try {
      session.defaultSession.clearCache();
      if (typeof global.gc === "function") {
        global.gc();
      }
    } catch (e) {}
  });

  global.mainWindow.on("show", () => {
    globalKeybindService.setAppFocused(true);
    setBackgroundMode(false);
  });

  global.mainWindow.webContents.on("enter-html-full-screen", () => {
    diagService.log("info", "Console", "[OniDiag][MAIN] webContents enter-html-full-screen fired!");
    try { global.mainWindow?.setFullScreen(true); } catch (e) { diagService.log("error", "Console", `[OniDiag][MAIN] Error setting fullscreen: ${e.message}`); }
  });

  global.mainWindow.webContents.on("leave-html-full-screen", () => {
    diagService.log("info", "Console", "[OniDiag][MAIN] webContents leave-html-full-screen fired!");
    try { global.mainWindow?.setFullScreen(false); } catch (e) { diagService.log("error", "Console", `[OniDiag][MAIN] Error leaving fullscreen: ${e.message}`); }
  });

  global.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http:") || url.startsWith("https:")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  session.defaultSession.protocol.registerFileProtocol(
    "onicord-media",
    (request, callback) => {
      let urlPath = request.url.replace("onicord-media://", "");
      urlPath = urlPath.split("?")[0];
      if (urlPath.startsWith("win-disk/")) {
        urlPath = urlPath.replace("win-disk/", "");
      }
      urlPath = decodeURIComponent(urlPath);

      if (/^[a-zA-Z]\//.test(urlPath)) {
        urlPath = urlPath.charAt(0) + ":" + urlPath.slice(1);
      }

      if (urlPath.includes("..")) {
        console.warn(`🚨 Bloqueado intento de Path Traversal: ${urlPath}`);
        return callback({ error: -10 });
      }

      try {
        const absolutePath = path.resolve(urlPath);
        const ext = path.extname(absolutePath).toLowerCase();
        const listaNegra = [
          ".js",
          ".cjs",
          ".mjs",
          ".vbs",
          ".bat",
          ".cmd",
          ".exe",
          ".sh",
          ".lnk",
          ".html",
        ];

        if (listaNegra.includes(ext)) {
          console.warn(
            `🚨 Bloqueado intento de cargar archivo ejecutable/script: ${ext}`,
          );
          return callback({ error: -10 });
        }

        const extensionesSeguras = [
          ".jpg",
          ".jpeg",
          ".png",
          ".gif",
          ".webp",
          ".mp4",
          ".webm",
          ".ogg",
          ".mp3",
          ".wav",
          ".zip",
          ".rar",
          ".7z",
          ".tar",
          ".gz",
          ".pdf",
          ".txt",
        ];

        const mimeTypes = {
          ".pdf": "application/pdf",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".gif": "image/gif",
          ".webp": "image/webp",
          ".mp4": "video/mp4",
          ".webm": "video/webm",
          ".mp3": "audio/mpeg",
          ".wav": "audio/wav",
          ".ogg": "audio/ogg",
          ".txt": "text/plain",
        };

        if (ext === ".pdf") {
          diagService.log("info", "Console", `[OniDiag][PDF] Protocol request for PDF: ${absolutePath}`);
        }

        const mimeType = mimeTypes[ext];
        if (mimeType) {
          return callback({ path: absolutePath, mimeType });
        }

        return callback({ path: absolutePath });
      } catch (error) {
        console.error("Error decodificando ruta en protocolo:", error);
        return callback({ error: -2 });
      }
    },
  );

  global.mainWindow.webContents.on("did-finish-load", () => {
    if (global.pendingDeepLink) {
      global.mainWindow.webContents.send(
        "onicord:deep-link",
        global.pendingDeepLink,
      );
      console.log(
        `[Deep Link] Pending code sent to frontend: ${global.pendingDeepLink}`,
      );
      global.pendingDeepLink = null; 
    }
    if (global.pendingDirectLink) {
      global.mainWindow.webContents.send("onicord:direct-link", global.pendingDirectLink);
      console.log(`[Direct Link] Enlace directo pendiente enviado al frontend: ${JSON.stringify(global.pendingDirectLink)}`);
      global.pendingDirectLink = null;
    }
  });

  if (isDev) {
    global.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    global.mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    global.mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  global.mainWindow.once("ready-to-show", () => {
    const isHidden = process.argv.includes("--hidden");
    const startMinimized =
      profileService.activeProfile?.general?.startMinimized;
    if (isHidden || (startMinimized && process.argv.includes("--hidden"))) {
      console.log("[Onicord Core] Invocación en segundo plano (minimizado).");
    } else {
      global.mainWindow.maximize();
      global.mainWindow.show();
    }
  });

  global.mainWindow.on("close", (event) => {
    if (global.isQuitting) return;
    const settings = profileService.activeProfile?.general;
    const shouldMinimize = settings?.minimizeToTray !== false;

    if (shouldMinimize) {
      if (!tray) {
        createTray();
      }
      if (tray) {
        event.preventDefault();
        global.mainWindow.hide();
      }
    }
  });

  global.mainWindow.on("closed", () => {
    global.mainWindow = null;
  });
}



app.whenReady().then(async () => {
  if (process.platform === "win32") {
    const aumid = app.isPackaged ? "com.onicord.voice" : process.execPath;
    app.setAppUserModelId(aumid);
    diagService.log("info", "Console", `[Onicord Core] AUMID configurado: ${aumid} (isPackaged: ${app.isPackaged})`);
  }
  await profileService.loadProfile();

  // — Media Permission Handlers —
  // Electron 33+ requires explicit permission grants for getUserMedia/getDisplayMedia.
  // Without these, Chromium silently blocks microphone and screen capture access.
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      const allowed = [
        "media",
        "mediaKeySystem",
        "display-capture",
        "audioCapture",
        "videoCapture",
        "clipboard-read",
        "clipboard-write",
        "clipboard-sanitized-write",
        "fullscreen",
      ];
      callback(allowed.includes(permission));
    }
  );

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission) => {
      const allowed = [
        "media",
        "mediaKeySystem",
        "display-capture",
        "audioCapture",
        "videoCapture",
        "clipboard-read",
        "clipboard-write",
        "clipboard-sanitized-write",
        "fullscreen",
      ];
      return allowed.includes(permission);
    }
  );

  createTray();

  registerIPCHandlers();
  mcpBridgeService.start();

  const startupUrl = process.argv.find((arg) => arg.startsWith("onicord://"));
  if (startupUrl) {
    handleDeepLink(startupUrl);
  }

  await ytdlpService.autoUpdateYtdlp();
  ytdlpService.startLocalStreamServer();

  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        "*://*.cdninstagram.com/*",
        "*://*.fbcdn.net/*",
        "*://*.tiktokcdn.com/*",
        "*://*.muscdn.com/*",
      ],
    },
    (details, callback) => {
      delete details.requestHeaders["Referer"];
      delete details.requestHeaders["referer"];
      delete details.requestHeaders["Origin"];
      delete details.requestHeaders["origin"];
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        "*://*.youtube.com/*",
        "*://*.youtube-nocookie.com/*",
      ],
    },
    (details, callback) => {
      const ref =
        details.requestHeaders["Referer"] ||
        details.requestHeaders["referer"] ||
        "";
      if (!ref || ref.startsWith("file:") || ref.startsWith("chrome-extension:")) {
        details.requestHeaders["Referer"] = "https://github.com/OniverseDesign/onicord";
      }
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url || "";
    // Only apply Content-Security-Policy to local app files and dev server, never to 3rd-party websites
    const isAppResource =
      details.resourceType === "mainFrame" ||
      url.startsWith("file:") ||
      url.includes("127.0.0.1") ||
      url.includes("localhost");

    if (!isAppResource) {
      return callback({ responseHeaders: details.responseHeaders });
    }

    const csp = isDev
      ? [
          "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com https://www.tiktok.com https://www.instagram.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https: onicord-media: http://127.0.0.1:*; media-src 'self' blob: mediastream: https: onicord-media: http://127.0.0.1:* http://localhost:*; object-src 'self' file: blob:; frame-src 'self' file: blob: onicord-media: https://www.youtube.com https://www.youtube-nocookie.com https://www.tiktok.com https://www.instagram.com https:; child-src 'self' file: blob: onicord-media: https://www.youtube.com https://www.youtube-nocookie.com https://www.tiktok.com https://www.instagram.com https:; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* ws: wss: stun: turn: https:;",
        ]
      : [
          "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com https://www.tiktok.com https://www.instagram.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https: onicord-media: http://127.0.0.1:*; media-src 'self' blob: mediastream: https: onicord-media: http://127.0.0.1:* http://localhost:*; object-src 'self' file: blob:; frame-src 'self' file: blob: onicord-media: https://www.youtube.com https://www.youtube-nocookie.com https://www.tiktok.com https://www.instagram.com https:; child-src 'self' file: blob: onicord-media: https://www.youtube.com https://www.youtube-nocookie.com https://www.tiktok.com https://www.instagram.com https:; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* ws: wss: stun: turn: https:;",
        ];
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": csp,
      },
    });
  });

  createWindow();
  updateService.init(global.mainWindow);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  global.updateScannerState = (showRP, customGames) => {
    if (customGames) {
      setCustomGames(customGames);
    }
    if (showRP) {
      rpcServerService.startRpcServer();
      startGameScanner(global.mainWindow, (newState) => {
        if (global.roomManager) {
          global.roomManager.setLocalActivity(newState);
        }
        // Overlay: solo se activa para videojuegos, no para software/apps de trabajo
        const isGame = newState && newState.name && (newState.type === "game" || newState.type === "client");
        overlayService.setGameActive(Boolean(isGame));
      });
    } else {
      rpcServerService.stopRpcServer();
      stopGameScanner();
      const emptyState = {
        name: null,
        cover: null,
        type: "game",
        startTime: null,
      };
      if (global.roomManager) {
        global.roomManager.setLocalActivity(emptyState);
      }
      global.mainWindow?.webContents.send("game-activity-changed", emptyState);
      overlayService.setGameActive(false);
    }
  };

  // Load overlay settings from profile
  const activeProfile = profileService.activeProfile;
  overlayService.loadSettings(activeProfile?.overlay);

  globalKeybindService.init(global.mainWindow, activeProfile?.keybindings);

  global.updateGlobalShortcuts = (keybindings) => {
    globalKeybindService.updateKeybindings(keybindings);
  };

  const showRP = activeProfile
    ? (activeProfile.showRichPresence ?? true)
    : true;
  global.updateScannerState(showRP, activeProfile?.customGames);
});

app.on("will-quit", () => {
  globalKeybindService.stop();
  rpcServerService.stopRpcServer();
});

app.on("before-quit", () => {
  global.isQuitting = true;
  globalKeybindService.stop();
  rpcServerService.stopRpcServer();
  overlayService.destroyOverlay();
});

app.on("window-all-closed", async () => {
  console.log(
    "[Onicord System] Cerrando ventanas detectado. Purgando buffers de red...",
  );
  try {
    if (
      global.roomManager &&
      typeof global.roomManager.leaveRoom === "function"
    ) {
      await global.roomManager.leaveRoom();
    }
  } catch (err) {
    console.error("Error en la purga final de salida:", err);
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
