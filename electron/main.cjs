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

// Configurar flags de Chromium y V8 para captura DXGI, WebAssembly JSPI, Wasm EH, SharedArrayBuffer, Mandos/HID y aislamiento
app.commandLine.appendSwitch("disable-features", "WgcScreenCapturer,WgcScreenCapturerWin,WgcScreenCapturerForWindow,WgcScreenCapturerForCursor");
app.commandLine.appendSwitch("enable-features", "DxgiScreenCapturer,SharedArrayBuffer,WebAssemblyExperimentalJSPI,WebAssemblyJSPromiseIntegration,CrossOriginOpenerPolicyReporting,CrossOriginEmbedderPolicyCredentialless,GamepadTriggerRumble,GamepadMultitouch");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-hid-blocklist");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("js-flags", "--expose-gc --experimental-wasm-jspi --experimental-wasm-legacy-eh --experimental-wasm-exnref");

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
const adBlockerService = require("./services/adBlockerService.cjs");
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
      webSecurity: false,
      allowRunningInsecureContent: true,
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

  global.mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
    const isDevUrl = isDev && process.env.VITE_DEV_SERVER_URL && navigationUrl.startsWith(process.env.VITE_DEV_SERVER_URL);
    const isLocalFile = navigationUrl.startsWith("file://");
    const isLocalhost = navigationUrl.startsWith("http://127.0.0.1:") || navigationUrl.startsWith("http://localhost:");

    if (!isDevUrl && !isLocalFile && !isLocalhost) {
      event.preventDefault();
      diagService.log("warn", "Security", `[Security] Bloqueada navegación externa de la ventana principal a: ${navigationUrl}`);
      if (navigationUrl.startsWith("http:") || navigationUrl.startsWith("https:")) {
        shell.openExternal(navigationUrl);
      }
    }
  });

  global.mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    const lvl = level === 3 ? "error" : level === 2 ? "warn" : "info";
    if (sourceId && !sourceId.includes("localhost") && !sourceId.includes("127.0.0.1") && !sourceId.startsWith("devtools:")) {
      diagService.log(lvl, "Stage-Console", `[StageSubframe] ${message} (${sourceId}:${line})`);
    }
  });

  global.mainWindow.webContents.on(
    "did-frame-finish-load",
    async (_event, isMainFrame, frameProcessId, frameRoutingId) => {
      if (isMainFrame) return;
      try {
        const { webFrameMain } = require("electron");
        const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
        if (!frame || !frame.url) return;

        // Inyección agnóstica de control de volumen maestro (Web Audio API & HTMLMediaElement)
        const volumeScript = `
          (() => {
            if (window._onicordAudioHooked) return;
            window._onicordAudioHooked = true;

            const audioContexts = new Set();
            let currentVolume = 1.0;
            let isMuted = false;

            window._onicordSetStageVolume = (vol, muted) => {
              if (typeof vol === 'number') currentVolume = vol;
              if (typeof muted === 'boolean') isMuted = muted;
              const effectiveGain = isMuted ? 0 : Math.max(0, Math.min(1, currentVolume));

              for (const ctx of audioContexts) {
                try {
                  if (ctx._onicordMasterGain) {
                    ctx._onicordMasterGain.gain.setValueAtTime(effectiveGain, ctx.currentTime);
                  }
                } catch (_) {}
              }

              try {
                document.querySelectorAll('audio, video').forEach((el) => {
                  el.volume = effectiveGain;
                  el.muted = isMuted;
                });
              } catch (_) {}
            };

            const OriginalAudioContext = window.AudioContext || window.webkitAudioContext;
            if (OriginalAudioContext) {
              const origConnect = AudioNode.prototype.connect;
              AudioNode.prototype.connect = function(target, outputIndex, inputIndex) {
                if (target && this.context && target === this.context.destination) {
                  if (!this.context._onicordMasterGain) {
                    try {
                      const gainNode = this.context.createGain();
                      const effectiveGain = isMuted ? 0 : Math.max(0, Math.min(1, currentVolume));
                      gainNode.gain.setValueAtTime(effectiveGain, this.context.currentTime);
                      origConnect.call(gainNode, this.context.destination);
                      this.context._onicordMasterGain = gainNode;
                      audioContexts.add(this.context);
                    } catch (_) {}
                  }
                  if (this.context._onicordMasterGain) {
                    return origConnect.call(this, this.context._onicordMasterGain, outputIndex, inputIndex);
                  }
                }
                return origConnect.apply(this, arguments);
              };
            }
          })();
        `;
        await frame.executeJavaScript(volumeScript).catch(() => {});

        // Aplicar volumen actual si ya fue modificado por el usuario
        if (global.currentStageVolume) {
          const volRatio = typeof global.currentStageVolume.volume === "number"
            ? Math.max(0, Math.min(1, global.currentStageVolume.volume / 100))
            : 1.0;
          const muted = Boolean(global.currentStageVolume.isMuted);
          await frame.executeJavaScript(`if (typeof window._onicordSetStageVolume === 'function') { window._onicordSetStageVolume(${volRatio}, ${muted}); }`).catch(() => {});
        }

        // Inyectar el apodo del usuario actual desde profileService de forma persistente
        const activeProfile = profileService.activeProfile;
        const currentNick = activeProfile?.nickname || activeProfile?.username || "Oniverse";
        await frame.executeJavaScript(`window._onicordUserNick = ${JSON.stringify(currentNick)};`).catch(() => {});

        const scripts = global.currentStageScripts;
        if (!scripts || !Array.isArray(scripts) || scripts.length === 0) return;

        for (const script of scripts) {
          if (typeof script === "string" && script.trim()) {
            await frame.executeJavaScript(script).catch(() => {});
          }
        }
      } catch (_) {}
    }
  );

  session.defaultSession.protocol.registerFileProtocol(
    "onicord-media",
    (request, callback) => {
      // Protección de aislamiento: bloquear cualquier solicitud originada desde un sitio web remoto no autorizado
      const referrer = (request.referrer || "").toLowerCase();
      const origin = (request.headers?.Origin || request.headers?.origin || "").toLowerCase();
      const isRemote = (u) => (u.startsWith("http://") || u.startsWith("https://")) && !u.startsWith("http://localhost") && !u.startsWith("http://127.0.0.1");

      if (isRemote(referrer) || isRemote(origin)) {
        diagService.log("warn", "Security", `[Security] Acceso denegado a onicord-media desde origen remoto: ${referrer || origin}`);
        return callback({ error: -10 }); // net::ERR_ACCESS_DENIED
      }

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

  // — Media and Hardware Permission Handlers —
  // Electron 33+ requires explicit permission grants for getUserMedia, displayMedia, and hardware devices.
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback) => {
      if (permission.startsWith("clipboard")) {
        return callback(true);
      }
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
        "pointerLock",
        "gamepad",
        "gamepads",
        "hid",
        "usb",
        "serial",
        "accessibility-events",
        "screen-wake-lock",
        "wake-lock",
      ];
      callback(allowed.includes(permission));
    }
  );

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission) => {
      if (permission.startsWith("clipboard")) {
        return true;
      }
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
        "pointerLock",
        "gamepad",
        "gamepads",
        "hid",
        "usb",
        "serial",
        "accessibility-events",
        "screen-wake-lock",
        "wake-lock",
      ];
      return allowed.includes(permission);
    }
  );

  session.defaultSession.setDevicePermissionHandler((details) => {
    if (details.deviceType === "hid" || details.deviceType === "usb") {
      return true;
    }
    return false;
  });

  createTray();

  registerIPCHandlers();
  mcpBridgeService.start();

  const startupUrl = process.argv.find((arg) => arg.startsWith("onicord://"));
  if (startupUrl) {
    handleDeepLink(startupUrl);
  }

  await ytdlpService.autoUpdateYtdlp();
  ytdlpService.startLocalStreamServer();

  adBlockerService.initAdBlocker(session.defaultSession);

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
    const responseHeaders = { ...details.responseHeaders };

    // Si es un servicio de verificación / challenge (Cloudflare Turnstile, hCaptcha, reCAPTCHA),
    // no alterar sus políticas de aislamiento ni sus encabezados CORS para evitar bloqueos por credenciales o duplicados
    const isChallengeService =
      url.includes("challenges.cloudflare.com") ||
      url.includes("cloudflare.com/cdn-cgi/challenge-platform") ||
      url.includes("hcaptcha.com") ||
      url.includes("recaptcha.net");

    if (isChallengeService) {
      for (const h of Object.keys(responseHeaders)) {
        if (h.toLowerCase() === "x-frame-options") {
          delete responseHeaders[h];
        }
      }
      return callback({ responseHeaders });
    }

    // Eliminar encabezados restrictivos de políticas previas sin importar mayúsculas/minúsculas
    for (const h of Object.keys(responseHeaders)) {
      const lower = h.toLowerCase();
      if (
        lower === "permissions-policy" ||
        lower === "x-frame-options" ||
        lower === "cross-origin-opener-policy" ||
        lower === "cross-origin-embedder-policy" ||
        lower === "cross-origin-resource-policy"
      ) {
        delete responseHeaders[h];
      }
    }

    // Permitir portapapeles, fullscreen, gamepad, micrófono, hid y control de hardware para frames y subframes
    responseHeaders["Permissions-Policy"] = [
      "clipboard-write=*, clipboard-read=*, fullscreen=*, gamepad=*, pointer-lock=*, hid=*, usb=*, microphone=*, autoplay=*",
    ];

    // Habilitar Cross-Origin Isolation para soportar WebAssembly con SharedArrayBuffer y multihilo (pthreads)
    responseHeaders["Cross-Origin-Opener-Policy"] = ["same-origin"];
    responseHeaders["Cross-Origin-Embedder-Policy"] = ["credentialless"];
    responseHeaders["Cross-Origin-Resource-Policy"] = ["cross-origin"];

    // Solo agregar Access-Control-Allow-Origin si el servidor remoto NO envió ya una política CORS
    // y si la respuesta no requiere credenciales explícitas (las peticiones con credenciales prohíben '*')
    const hasCors = Object.keys(responseHeaders).some(
      (k) => k.toLowerCase() === "access-control-allow-origin"
    );
    const hasCredentials = Object.keys(responseHeaders).some(
      (k) => k.toLowerCase() === "access-control-allow-credentials"
    );
    if (!hasCors && !hasCredentials) {
      responseHeaders["Access-Control-Allow-Origin"] = ["*"];
    }

    // Only apply Content-Security-Policy to local app files and dev server, never to 3rd-party websites
    const isAppResource =
      details.resourceType === "mainFrame" ||
      url.startsWith("file:") ||
      url.includes("127.0.0.1") ||
      url.includes("localhost");

    if (!isAppResource) {
      return callback({ responseHeaders });
    }

    const csp = isDev
      ? [
          "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com https://www.tiktok.com https://www.instagram.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https: onicord-media: http://127.0.0.1:*; media-src 'self' blob: mediastream: https: onicord-media: http://127.0.0.1:* http://localhost:*; object-src 'self' file: blob:; frame-src 'self' file: blob: onicord-media: https://www.youtube.com https://www.youtube-nocookie.com https://www.tiktok.com https://www.instagram.com https:; child-src 'self' file: blob: onicord-media: https://www.youtube.com https://www.youtube-nocookie.com https://www.tiktok.com https://www.instagram.com https:; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* ws: wss: stun: turn: https:;",
        ]
      : [
          "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com https://www.tiktok.com https://www.instagram.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https: onicord-media: http://127.0.0.1:*; media-src 'self' blob: mediastream: https: onicord-media: http://127.0.0.1:* http://localhost:*; object-src 'self' file: blob:; frame-src 'self' file: blob: onicord-media: https://www.youtube.com https://www.youtube-nocookie.com https://www.tiktok.com https://www.instagram.com https:; child-src 'self' file: blob: onicord-media: https://www.youtube.com https://www.youtube-nocookie.com https://www.tiktok.com https://www.instagram.com https:; connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* ws: wss: stun: turn: https:;",
        ];
    responseHeaders["Content-Security-Policy"] = csp;
    callback({ responseHeaders });
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
