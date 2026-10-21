const { exec } = require("child_process");
const gamesDB = require("./games.json");

const gamesMap = new Map();
let customGamesList = [];

function rebuildGamesMap() {
  gamesMap.clear();

  // 1. Cargar catálogo base oficial
  for (const g of gamesDB) {
    if (!g.exe) continue;
    gamesMap.set(g.exe.toLowerCase(), {
      ...g,
      priority: g.priority ?? 50,
      type: g.type || "game",
      isCustom: false,
    });
  }

  // 2. Fusionar con lista blanca personalizada del usuario
  for (const cg of customGamesList) {
    if (cg.enabled === false) continue;
    if (!cg.exe) continue;
    gamesMap.set(cg.exe.toLowerCase(), {
      exe: cg.exe,
      title: cg.title || cg.name || cg.exe,
      cover: cg.cover || null,
      type: cg.type || "game",
      priority: cg.priority ?? 85,
      isCustom: true,
    });
  }
}

// Inicializar mapa de juegos
rebuildGamesMap();

let currentState = { name: null, cover: null, type: "game", startTime: null };
let lockedGame = null;
let rpcActivity = null; // Prioridad máxima si un juego se comunica vía IPC/RPC
let scannerStarted = false;
let scanInProgress = false;
let timer = null;
let currentSessionId = 0;
let onActivityChangeCallback = null;
let globalMainWindow = null;

const SCAN_INTERVAL = 5000;
const LOCK_PRIORITY = 100;
const EXE_REGEX = /^"([^"]+)"/;

function getActiveProcesses() {
  const isWindows = process.platform === "win32";
  const cmd = isWindows ? "tasklist /FO CSV /NH" : "ps -e -o comm=";

  return new Promise((resolve) => {
    exec(
      cmd,
      { maxBuffer: 1024 * 1024 * 5 },
      (err, stdout) => {
        if (err) return resolve(new Set());
        const set = new Set();
        if (isWindows) {
          for (const line of stdout.split(/\r?\n/)) {
            const match = line.match(EXE_REGEX);
            if (match && match[1]) set.add(match[1].toLowerCase());
          }
        } else {
          for (const line of stdout.split(/\r?\n|\n/)) {
            const cleanLine = line.trim();
            if (cleanLine) set.add(cleanLine.toLowerCase());
          }
        }
        resolve(set);
      },
    );
  });
}

function detectBestGame(runningSet) {
  let bestGame = null;
  for (const exe of runningSet) {
    const game = gamesMap.get(exe);
    if (game && (!bestGame || game.priority > bestGame.priority)) {
      bestGame = game;
    }
  }
  return bestGame;
}

function broadcast(mainWindow) {
  const targetWin = mainWindow || globalMainWindow;
  if (targetWin && !targetWin.isDestroyed()) {
    targetWin.webContents.send("game-activity-changed", currentState);
  }
}

function getSpotifySong() {
  return new Promise((resolve) => {
    const isWindows = process.platform === "win32";
    if (isWindows) {
      exec(
        `powershell -Command "Get-Process Spotify -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle} | Select-Object -ExpandProperty MainWindowTitle"`,
        { timeout: 2000 },
        (err, stdout) => {
          if (err || !stdout) return resolve(null);
          const title = stdout.trim();
          if (title && title !== "") {
            resolve(title);
          } else {
            resolve("Spotify");
          }
        }
      );
    } else {
      exec(
        `dbus-send --print-reply --dest=org.mpris.MediaPlayer2.spotify /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:org.mpris.MediaPlayer2.Player string:Metadata 2>/dev/null`,
        { timeout: 2000 },
        (err, stdout) => {
          if (err || !stdout) return resolve(null);
          const titleMatch = stdout.match(/string\s+"xesam:title"\s*\n\s*variant\s+string\s+"([^"]+)"/s);
          const artistMatch = stdout.match(/string\s+"xesam:artist"\s*\n\s*variant\s+array\s+\[\s*string\s+"([^"]+)"/s);

          const title = titleMatch ? titleMatch[1] : null;
          const artist = artistMatch ? artistMatch[1] : null;

          if (title && artist) {
            resolve(`${artist} - ${title}`);
          } else if (title) {
            resolve(title);
          } else {
            resolve(null);
          }
        }
      );
    }
  });
}

function updateState(bestGame, customTitle) {
  const targetName = customTitle || bestGame?.title || null;
  currentState = bestGame
    ? {
        name: targetName,
        cover: bestGame.cover,
        type: bestGame.type || "game",
        startTime:
          currentState.name === targetName
            ? currentState.startTime
            : Date.now(),
        source: bestGame.isCustom ? "custom" : "builtin",
      }
    : { name: null, cover: null, type: "game", startTime: null };

  console.log(`[Rich Presence] Actividad (${currentState.type}): ${currentState.name || "Nada"}`);
}

async function runScan(mainWindow, sessionId) {
  if (scanInProgress || sessionId !== currentSessionId) return;

  // Si hay una actividad de RPC activa, tiene prioridad absoluta sobre el escáner
  if (rpcActivity) {
    broadcast(mainWindow);
    return;
  }

  scanInProgress = true;

  try {
    const runningProcesses = await getActiveProcesses();

    if (sessionId !== currentSessionId) return;
    if (rpcActivity) return;

    if (lockedGame && runningProcesses.has(lockedGame.exe.toLowerCase())) {
      if (lockedGame.type === "music") {
        const song = await getSpotifySong();
        const songTitle = song || lockedGame.title;
        if (songTitle !== currentState.name) {
          updateState(lockedGame, songTitle);
          if (onActivityChangeCallback) onActivityChangeCallback(currentState);
        }
      }
      broadcast(mainWindow);
      return;
    }

    lockedGame = null;
    const bestGame = detectBestGame(runningProcesses);

    let gameTitle = bestGame ? bestGame.title : null;
    if (bestGame && bestGame.type === "music") {
      try {
        const song = await getSpotifySong();
        if (song) {
          gameTitle = song;
        }
      } catch (err) {
        console.error("Error reading Spotify title:", err);
      }
    }

    const hasChanged = bestGame
      ? gameTitle !== currentState.name ||
        bestGame.cover !== currentState.cover
      : currentState.name !== null;

    if (hasChanged) {
      updateState(bestGame, gameTitle);
      lockedGame = bestGame?.priority >= LOCK_PRIORITY ? bestGame : null;
      if (onActivityChangeCallback) onActivityChangeCallback(currentState);
    }

    broadcast(mainWindow);
  } catch (e) {
    console.error("[Scanner Loop Error]", e);
  } finally {
    scanInProgress = false;
  }
}

let isBackgroundMode = false;

function setBackgroundMode(bg) {
  isBackgroundMode = Boolean(bg);
}

function setCustomGames(list) {
  customGamesList = Array.isArray(list) ? list : [];
  rebuildGamesMap();
  // Si el escáner está activo y no hay actividad RPC, forzar chequeo inmediato
  if (scannerStarted && globalMainWindow && !rpcActivity) {
    runScan(globalMainWindow, currentSessionId);
  }
}

function setRpcActivity(activity) {
  if (activity && activity.name) {
    rpcActivity = activity;
    currentState = {
      name: activity.name,
      details: activity.details || null,
      state: activity.state || null,
      cover: activity.cover || null,
      smallCover: activity.smallCover || null,
      type: activity.type || "game",
      isCatalog: Boolean(activity.isCatalog),
      startTime: activity.startTime || Date.now(),
      party: activity.party || null,
      source: activity.source || "rpc",
    };
  } else {
    rpcActivity = null;
    currentState = { name: null, cover: null, type: "game", startTime: null };
  }

  if (onActivityChangeCallback) onActivityChangeCallback(currentState);
  broadcast(globalMainWindow);
}

function clearRpcActivity() {
  rpcActivity = null;
  currentState = { name: null, cover: null, type: "game", startTime: null };
  if (onActivityChangeCallback) onActivityChangeCallback(currentState);
  broadcast(globalMainWindow);

  // Retornar limpiamente al escáner de procesos
  if (scannerStarted && globalMainWindow) {
    runScan(globalMainWindow, currentSessionId);
  }
}

function startGameScanner(mainWindow, onStateChange) {
  globalMainWindow = mainWindow;
  if (scannerStarted) return;

  onActivityChangeCallback = onStateChange;

  scannerStarted = true;
  currentSessionId++;
  const sessionId = currentSessionId;

  console.log("[Rich Presence] Motor de Escaneo Iniciado.");

  async function loop() {
    if (!scannerStarted) return;
    await runScan(mainWindow, sessionId);

    if (scannerStarted && sessionId === currentSessionId) {
      const interval = isBackgroundMode ? 30000 : SCAN_INTERVAL;
      timer = setTimeout(loop, interval);
    }
  }
  loop();
}

function stopGameScanner() {
  scannerStarted = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  scanInProgress = false;
  currentSessionId++;
  console.log("[Rich Presence] Motor detenido.");
}

function getCurrentState() {
  return currentState;
}

module.exports = {
  startGameScanner,
  stopGameScanner,
  getCurrentState,
  setBackgroundMode,
  setCustomGames,
  setRpcActivity,
  clearRpcActivity,
  getActiveProcesses,
};
