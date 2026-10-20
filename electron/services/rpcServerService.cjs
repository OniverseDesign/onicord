const net = require("net");
const os = require("os");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const { setRpcActivity, clearRpcActivity } = require("../gameScanner.cjs");

const OPCODES = {
  HANDSHAKE: 0,
  FRAME: 1,
  CLOSE: 2,
  PING: 3,
  PONG: 4,
};

let activeServers = [];
let activeClientSocket = null;

// Cachés en memoria para optimizar velocidad y no repetir peticiones
const appInfoCache = new Map();
const appAssetsCache = new Map();
const gameCoverCache = new Map();

const KNOWN_EMULATORS = [
  "rpcs3", "pcsx2", "dolphin", "cemu", "yuzu", "ryujinx",
  "citra", "vita3k", "duckstation", "ppsspp", "retroarch",
  "xenia", "melonds", "mgba", "desmume", "snes9x", "fceux",
  "bsnes", "ares", "visualboyadvance", "mupen64plus"
];

function getPipePaths() {
  const isWindows = process.platform === "win32";
  if (isWindows) {
    return [
      "\\\\.\\pipe\\onicord-ipc-0",
      "\\\\.\\pipe\\discord-ipc-0",
    ];
  } else {
    const runtimeDir = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || "/tmp";
    return [
      path.join(runtimeDir, "onicord-ipc-0"),
      path.join(runtimeDir, "discord-ipc-0"),
    ];
  }
}

function encodeFrame(opcode, payload) {
  const jsonStr = JSON.stringify(payload);
  const jsonBuffer = Buffer.from(jsonStr, "utf8");
  const headerBuffer = Buffer.alloc(8);
  headerBuffer.writeInt32LE(opcode, 0);
  headerBuffer.writeInt32LE(jsonBuffer.length, 4);
  return Buffer.concat([headerBuffer, jsonBuffer]);
}

/**
 * Consulta la información pública de una aplicación registrada en Discord (Nombre e Icono)
 */
async function fetchDiscordAppInfo(clientId) {
  if (!clientId) return null;
  if (appInfoCache.has(clientId)) return appInfoCache.get(clientId);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`https://discord.com/api/v10/applications/${clientId}/rpc`, {
      signal: controller.signal,
      headers: { "User-Agent": "Onicord-Presence/0.1.4 (https://github.com/OniverseDesign)" },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const info = {
        name: data.name || null,
        icon: data.icon ? `https://cdn.discordapp.com/app-icons/${clientId}/${data.icon}.png` : null,
      };
      appInfoCache.set(clientId, info);
      return info;
    }
  } catch (err) {}
  return null;
}

/**
 * Consulta el listado de assets registrados (imágenes con claves como 'rpcs3_logo')
 */
async function fetchDiscordAppAssets(clientId) {
  if (!clientId) return [];
  if (appAssetsCache.has(clientId)) return appAssetsCache.get(clientId);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`https://discord.com/api/v10/oauth2/applications/${clientId}/assets`, {
      signal: controller.signal,
      headers: { "User-Agent": "Onicord-Presence/0.1.4" },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const assets = Array.isArray(data) ? data : [];
      appAssetsCache.set(clientId, assets);
      return assets;
    }
  } catch (err) {}
  return [];
}

/**
 * Detecta si un string corresponde a un código de serial de ROM (ej: BCES00510, BLUS30443, etc.)
 */
function isRomSerialCode(str) {
  if (!str || typeof str !== "string") return false;
  const s = str.trim();
  // PlayStation (PS1, PS2, PS3, PSP, PS Vita): BCES00510, BLUS-30111, SLUS_20011, NPEB01234
  if (/^[A-Z]{3,4}[-_]?[0-9]{4,6}$/i.test(s)) return true;
  // Nintendo Switch Title ID (16 caracteres hex empezando por 0100)
  if (/^0100[0-9A-Fa-f]{12}$/i.test(s)) return true;
  // GameCube / Wii 4-6 char disc ID: RMCE01, GM8E01, etc.
  if (/^[A-Z0-9]{4,6}$/i.test(s) && /[0-9]/.test(s) && /[A-Z]/i.test(s)) return true;
  // CRC / Hash codes: CRC: ... o [0-9A-Fa-f]{8}
  if (/^(CRC:?\s*)?[A-F0-9]{8}$/i.test(s)) return true;
  return false;
}

/**
 * Detecta si la aplicación es un emulador
 */
function isEmulator(appName) {
  if (!appName || typeof appName !== "string") return false;
  const lower = appName.toLowerCase();
  return KNOWN_EMULATORS.some((emu) => lower.includes(emu)) || lower.includes("emulator") || lower.includes("emulador");
}

/**
 * Obtiene el nombre del proceso desde su PID en Windows de forma ligera
 */
function getProcessNameByPid(pid) {
  return new Promise((resolve) => {
    if (!pid || process.platform !== "win32") return resolve(null);
    exec(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { timeout: 1500 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      const match = stdout.match(/^"([^"]+)"/);
      resolve(match ? match[1] : null);
    });
  });
}

/**
 * Busca la carátula oficial en alta resolución del videojuego en Wikipedia
 */
async function resolveGameCover(rawTitle) {
  if (!rawTitle || typeof rawTitle !== "string") return null;

  // Limpiar título de marcas registradas, corchetes y tags de región
  const cleanTitle = rawTitle
    .replace(/[®™©]/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s*\([^)]*(USA|EUR|JAP|v\d+(\.\d+)?|disc\s*\d+)[^)]*\)/gi, "")
    .trim();

  if (!cleanTitle || cleanTitle.length < 2) return null;
  const cacheKey = cleanTitle.toLowerCase();
  if (gameCoverCache.has(cacheKey)) {
    return gameCoverCache.get(cacheKey);
  }

  // 1. Wikipedia Summary API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800);
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanTitle)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Onicord-Presence/0.1.4 (https://github.com/OniverseDesign)" },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.thumbnail && data.thumbnail.source) {
        gameCoverCache.set(cacheKey, data.thumbnail.source);
        return data.thumbnail.source;
      }
    }
  } catch (err) {}

  // 2. Wikipedia Summary con sufijo "(video game)" si no lo tiene
  if (!cleanTitle.toLowerCase().includes("video game") && !cleanTitle.toLowerCase().includes("game")) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(`${cleanTitle} (video game)`)}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Onicord-Presence/0.1.4" },
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data.thumbnail && data.thumbnail.source) {
          gameCoverCache.set(cacheKey, data.thumbnail.source);
          return data.thumbnail.source;
        }
      }
    } catch (err) {}
  }

  return null;
}

/**
 * Resuelve una imagen de Discord (URL directa, asset key o fallback icon)
 */
function resolveDiscordAsset(assetKey, clientId, appAssets, fallbackIcon) {
  if (!assetKey) return fallbackIcon || null;
  if (assetKey.startsWith("http://") || assetKey.startsWith("https://") || assetKey.startsWith("data:")) {
    return assetKey;
  }
  if (assetKey.startsWith("mp:")) {
    return `https://media.discordapp.net/${assetKey.slice(3)}`;
  }
  if (/^\d+$/.test(assetKey) && clientId) {
    return `https://cdn.discordapp.com/app-assets/${clientId}/${assetKey}.png`;
  }
  if (Array.isArray(appAssets) && clientId) {
    const found = appAssets.find((a) => a.name === assetKey);
    if (found && found.id) {
      return `https://cdn.discordapp.com/app-assets/${clientId}/${found.id}.png`;
    }
  }
  return fallbackIcon || null;
}

function handleClientMessage(socket, opcode, payload, clientInfo) {
  switch (opcode) {
    case OPCODES.HANDSHAKE: {
      clientInfo.clientId = payload.client_id || payload.clientId || null;
      clientInfo.version = payload.v || 1;

      // Precargar en segundo plano la info de la app
      if (clientInfo.clientId) {
        fetchDiscordAppInfo(clientInfo.clientId).then((info) => {
          if (info) {
            clientInfo.appName = info.name;
            clientInfo.appIcon = info.icon;
          }
        }).catch(() => {});
        fetchDiscordAppAssets(clientInfo.clientId).then((assets) => {
          clientInfo.assets = assets;
        }).catch(() => {});
      }

      const readyResponse = {
        cmd: "DISPATCH",
        data: {
          v: 1,
          config: {
            cdn_host: "cdn.discordapp.com",
            api_endpoint: "//discord.com/api",
            environment: "production",
          },
          user: {
            id: clientInfo.clientId || "100000000000000000",
            username: "Onicord User",
            discriminator: "0000",
            avatar: null,
          },
        },
        evt: "READY",
        nonce: null,
      };
      socket.write(encodeFrame(OPCODES.FRAME, readyResponse));
      break;
    }

    case OPCODES.FRAME: {
      const { cmd, args, nonce } = payload;
      if (cmd === "SET_ACTIVITY") {
        const act = args?.activity;
        const pid = args?.pid;

        // Responder confirmación ACK al cliente de inmediato
        const ackResponse = {
          cmd: "SET_ACTIVITY",
          data: act || null,
          evt: null,
          nonce: nonce || null,
        };
        socket.write(encodeFrame(OPCODES.FRAME, ackResponse));

        if (!act) {
          clearRpcActivity();
          return;
        }

        // Procesar actividad y enriquecer metadatos
        (async () => {
          // Si aún no tenemos info de la app, intentar obtenerla
          if (clientInfo.clientId && !clientInfo.appName) {
            const info = await fetchDiscordAppInfo(clientInfo.clientId);
            if (info) {
              clientInfo.appName = info.name;
              clientInfo.appIcon = info.icon;
            }
          }
          if (clientInfo.clientId && (!clientInfo.assets || clientInfo.assets.length === 0)) {
            clientInfo.assets = await fetchDiscordAppAssets(clientInfo.clientId);
          }

          // Fallback por proceso (PID) si la app no tiene nombre registrado
          if (!clientInfo.appName && pid) {
            const proc = await getProcessNameByPid(pid);
            if (proc) {
              const cleanProc = proc.replace(/\.exe$/i, "");
              clientInfo.appName = cleanProc.toUpperCase();
            }
          }

          const isSerial = isRomSerialCode(act.state);
          const isEmu = isEmulator(clientInfo.appName) || (isSerial && Boolean(act.details));

          let finalName = act.name || clientInfo.appName || "Juego";
          let finalDetails = act.details || null;
          let finalState = isSerial ? null : (act.state || null);

          // Si es un emulador y tiene detalles del juego (ej: RPCS3 con God of War III)
          if (isEmu && act.details) {
            finalName = act.details; // Título: nombre del juego
            finalDetails = clientInfo.appName || "Emulador"; // Subtítulo: nombre del emulador
            finalState = null; // Suprimir el serial de la ROM (BCES00510)
          } else if (isEmu && !act.details) {
            finalName = clientInfo.appName || "Emulador";
            finalDetails = isSerial ? null : (act.state || "En los menús");
            finalState = null;
          }

          // Resolver carátula e icono de emulador
          const appCover = resolveDiscordAsset(
            act.assets?.large_image || act.assets?.largeImage,
            clientInfo.clientId,
            clientInfo.assets,
            clientInfo.appIcon
          );

          // Buscar la carátula real del juego en Wikipedia si estamos emulando
          let gameCover = null;
          let smallCover = null;

          if (isEmu && act.details) {
            gameCover = await resolveGameCover(act.details);
            if (gameCover) {
              smallCover = appCover; // El logo del emulador como sub-icono
            }
          }

          const transformed = {
            name: finalName,
            details: finalDetails,
            state: finalState,
            cover: gameCover || appCover,
            smallCover: smallCover,
            type: "game",
            startTime: act.timestamps?.start
              ? (act.timestamps.start > 1e11 ? act.timestamps.start : act.timestamps.start * 1000)
              : Date.now(),
            party: act.party && Array.isArray(act.party.size)
              ? { size: act.party.size[0], max: act.party.size[1] }
              : null,
            source: "rpc",
          };

          setRpcActivity(transformed);
        })().catch((err) => {
          console.warn("[RPC Server] Error procesando SET_ACTIVITY:", err.message);
        });
      } else if (cmd === "PING") {
        socket.write(encodeFrame(OPCODES.PONG, { nonce: nonce || null }));
      }
      break;
    }

    case OPCODES.PING: {
      socket.write(encodeFrame(OPCODES.PONG, payload));
      break;
    }

    case OPCODES.CLOSE: {
      socket.end();
      break;
    }

    default:
      break;
  }
}

function createPipeServer(pipePath) {
  // En Unix, eliminar archivo socket anterior si quedó huérfano
  if (process.platform !== "win32") {
    try {
      if (fs.existsSync(pipePath)) {
        fs.unlinkSync(pipePath);
      }
    } catch {}
  }

  const server = net.createServer((socket) => {
    console.log(`[RPC Server] Cliente conectado en: ${pipePath}`);
    activeClientSocket = socket;
    const clientInfo = { clientId: null, appName: null, appIcon: null, assets: [] };

    let buffer = Buffer.alloc(0);

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= 8) {
        const opcode = buffer.readInt32LE(0);
        const length = buffer.readInt32LE(4);

        if (length < 0 || length > 1024 * 1024 * 2) {
          console.warn("[RPC Server] Trama con longitud inválida, desconectando.");
          socket.destroy();
          return;
        }

        if (buffer.length < 8 + length) {
          // Esperar más datos
          break;
        }

        const payloadBuffer = buffer.slice(8, 8 + length);
        buffer = buffer.slice(8 + length);

        try {
          const payload = JSON.parse(payloadBuffer.toString("utf8"));
          handleClientMessage(socket, opcode, payload, clientInfo);
        } catch (err) {
          console.warn("[RPC Server] Error parseando JSON de trama:", err.message);
        }
      }
    });

    socket.on("close", () => {
      console.log(`[RPC Server] Cliente desconectado de: ${pipePath}`);
      if (activeClientSocket === socket) {
        activeClientSocket = null;
        clearRpcActivity();
      }
    });

    socket.on("error", (err) => {
      console.warn(`[RPC Server] Error en socket del cliente:`, err.message);
    });
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" || err.code === "EACCES") {
      console.log(`[RPC Server] Pipe ocupado o inaccesible (${pipePath}). Modo fallback activo.`);
    } else {
      console.warn(`[RPC Server] Error en servidor ${pipePath}:`, err.message);
    }
  });

  try {
    server.listen(pipePath, () => {
      console.log(`[RPC Server] Escuchando en: ${pipePath}`);
    });
  } catch (err) {
    console.warn(`[RPC Server] No se pudo iniciar escucha en ${pipePath}:`, err.message);
  }

  return server;
}

function startRpcServer() {
  stopRpcServer();
  const paths = getPipePaths();
  for (const p of paths) {
    try {
      const srv = createPipeServer(p);
      activeServers.push({ server: srv, path: p });
    } catch (e) {
      console.warn(`[RPC Server] Error al crear pipe server en ${p}:`, e.message);
    }
  }
}

function stopRpcServer() {
  for (const item of activeServers) {
    try {
      item.server.close();
      if (process.platform !== "win32" && fs.existsSync(item.path)) {
        fs.unlinkSync(item.path);
      }
    } catch {}
  }
  activeServers = [];
  activeClientSocket = null;
}

module.exports = { startRpcServer, stopRpcServer };
