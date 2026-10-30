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

// In-memory caches for fast responses and deduplicating upstream metadata requests
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
 * Fetches public application metadata registered in Discord's developer portal (Name and Icon).
 * @param {string} clientId - The Discord Application/Client ID.
 * @returns {Promise<{name: string|null, icon: string|null}|null>}
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
 * Fetches registered rich presence asset keys from Discord API (e.g., 'rpcs3_logo').
 * @param {string} clientId - The Discord Application/Client ID.
 * @returns {Promise<Array<{id: string, name: string, type: number}>>}
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
 * Detects whether a string matches a known ROM serial/title code format (e.g. BCES00510, BLUS30443).
 * @param {string} str - Candidate string to evaluate.
 * @returns {boolean}
 */
function isRomSerialCode(str) {
  if (!str || typeof str !== "string") return false;
  const s = str.trim();
  // PlayStation (PS1, PS2, PS3, PSP, PS Vita): BCES00510, BLUS-30111, SLUS_20011, NPEB01234
  if (/^[A-Z]{3,4}[-_]?[0-9]{4,6}$/i.test(s)) return true;
  // Nintendo Switch Title ID (16 hex chars starting with 0100)
  if (/^0100[0-9A-Fa-f]{12}$/i.test(s)) return true;
  // GameCube / Wii 4-6 char disc ID: RMCE01, GM8E01, etc.
  if (/^[A-Z0-9]{4,6}$/i.test(s) && /[0-9]/.test(s) && /[A-Z]/i.test(s)) return true;
  // CRC / Hash codes: CRC: ... o [0-9A-Fa-f]{8}
  if (/^(CRC:?\s*)?[A-F0-9]{8}$/i.test(s)) return true;
  return false;
}

/**
 * Detects whether an application name corresponds to a known console emulator.
 * @param {string} appName - The application or executable title.
 * @returns {boolean}
 */
function isEmulator(appName) {
  if (!appName || typeof appName !== "string") return false;
  const lower = appName.toLowerCase();
  return KNOWN_EMULATORS.some((emu) => lower.includes(emu)) || lower.includes("emulator") || lower.includes("emulador");
}

/**
 * Queries process name from PID on Windows using a lightweight tasklist filter.
 * @param {number} pid - Process identifier.
 * @returns {Promise<string|null>}
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
 * Searches Wikipedia API for the official high-resolution cover art of a video game.
 * @param {string} rawTitle - Raw game title string.
 * @returns {Promise<string|null>} URL of the cover art thumbnail or null.
 */
async function resolveGameCover(rawTitle) {
  if (!rawTitle || typeof rawTitle !== "string") return null;

  // Clean title of trademark symbols, square brackets, and regional tags
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

  // 2. Wikipedia Summary with "(video game)" disambiguation suffix
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
 * Resolves a Discord asset identifier into an absolute media URL (direct URL, asset key, or fallback).
 * @param {string} assetKey - Discord asset name or URL.
 * @param {string} clientId - The client/application ID.
 * @param {Array} appAssets - List of known assets for the client.
 * @param {string|null} fallbackIcon - Fallback application icon URL.
 * @returns {string|null}
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

      // Asynchronously prefetch application metadata and assets
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

        // Immediately respond with ACK frame to the client
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

        // Process activity and enrich metadata
        (async () => {
          // Fetch application info if not yet available in cache
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

          // Process name (PID) fallback if application name is unregistered
          if (!clientInfo.appName && pid) {
            const proc = await getProcessNameByPid(pid);
            if (proc) {
              const cleanProc = proc.replace(/\.exe$/i, "");
              clientInfo.appName = cleanProc.toUpperCase();
            }
          }

          const isSerial = isRomSerialCode(act.state);
          const isEmu = isEmulator(clientInfo.appName) || (isSerial && Boolean(act.details));

          let finalName = act.name || clientInfo.appName || "Game";
          let finalDetails = act.details || null;
          let finalState = isSerial ? null : (act.state || null);

          // If running in an emulator with game details (e.g., RPCS3 with God of War III)
          if (isEmu && act.details) {
            finalName = act.details; // Title: game name
            finalDetails = clientInfo.appName || "Emulator"; // Subtitle: emulator name
            finalState = null; // Suppress raw ROM serial code (e.g., BCES00510)
          } else if (isEmu && !act.details) {
            finalName = clientInfo.appName || "Emulator";
            finalDetails = isSerial ? null : (act.state || "In Menus");
            finalState = null;
          }

          // Resolve cover image and emulator icon
          const appCover = resolveDiscordAsset(
            act.assets?.large_image || act.assets?.largeImage,
            clientInfo.clientId,
            clientInfo.assets,
            clientInfo.appIcon
          );

          // Fetch true game cover art from Wikipedia when running inside an emulator
          let gameCover = null;
          let smallCover = null;

          if (isEmu && act.details) {
            gameCover = await resolveGameCover(act.details);
            if (gameCover) {
              smallCover = appCover; // Use emulator icon as sub-badge
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
  // On Unix systems, remove orphaned socket file if it exists
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
          // Buffer incomplete; await remaining frame bytes
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
