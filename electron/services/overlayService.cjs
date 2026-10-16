const { BrowserWindow, screen, ipcMain, app } = require("electron");
const path = require("path");
const fs = require("fs");

const OVERLAY_WIDTH = 260;
const OVERLAY_HEIGHT = 420;
const EDGE_MARGIN = 12;

let overlayWindow = null;
let currentSettings = {
  enabled: true,
  position: "top-left",
  opacity: 0.6,
  autoHideWhenQuiet: false,
  avatarOnly: false,
  showNameOnlyWhenSpeaking: false,
};
let isGameActive = false;
let hasVoiceData = false;
let isAppFocused = false;
let isTestMode = false;
let testModeTimer = null;
let cachedMembers = [];

/**
 * Compute { x, y } so the overlay is flush against the nearest screen edge
 * for each of the 8 anchor zones.
 */
function computePosition(zone) {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const w = OVERLAY_WIDTH;
  const h = OVERLAY_HEIGHT;
  const m = EDGE_MARGIN;

  switch (zone) {
    case "top-left":
      return { x: m, y: m };
    case "top-center":
      return { x: Math.round((sw - w) / 2), y: m };
    case "top-right":
      return { x: sw - w - m, y: m };
    case "center-left":
      return { x: m, y: Math.round((sh - h) / 2) };
    case "center-right":
      return { x: sw - w - m, y: Math.round((sh - h) / 2) };
    case "bottom-left":
      return { x: m, y: sh - h - m };
    case "bottom-center":
      return { x: Math.round((sw - w) / 2), y: sh - h - m };
    case "bottom-right":
      return { x: sw - w - m, y: sh - h - m };
    default:
      return { x: m, y: m };
  }
}

function resolveAssetPath(relativePath) {
  // Check app.getAppPath() first, then fallback to relative __dirname
  try {
    const fromAppPath = path.join(app.getAppPath(), relativePath);
    if (fs.existsSync(fromAppPath)) return fromAppPath;
  } catch (err) {}

  return path.join(__dirname, "..", path.basename(relativePath));
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return;

  const { x, y } = computePosition(currentSettings.position);
  const preloadPath = resolveAssetPath("electron/overlayPreload.cjs");

  overlayWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: OVERLAY_HEIGHT,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    resizable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");

  const htmlPath = resolveAssetPath("electron/overlay.html");
  overlayWindow.loadFile(htmlPath).catch((err) => {
    console.error(`[Overlay] Error cargando overlay.html desde ${htmlPath}:`, err);
  });

  overlayWindow.webContents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL) => {
    console.error(`[Overlay] Fallo did-fail-load (${errorCode}): ${errorDescription} en ${validatedURL}`);
  });

  overlayWindow.webContents.on("did-finish-load", () => {
    // 1. Send settings
    overlayWindow.webContents.send("overlay:settings", {
      opacity: currentSettings.opacity,
      autoHideWhenQuiet: currentSettings.autoHideWhenQuiet,
      avatarOnly: currentSettings.avatarOnly,
      showNameOnlyWhenSpeaking: currentSettings.showNameOnlyWhenSpeaking,
    });

    // 2. Replay cached voice members so overlay isn't blank
    if (cachedMembers && cachedMembers.length > 0) {
      overlayWindow.webContents.send("overlay:voice-update", cachedMembers);
      const newHeight = Math.min(
        Math.max(cachedMembers.length * 44 + 24, 68),
        OVERLAY_HEIGHT,
      );
      overlayWindow.setSize(OVERLAY_WIDTH, newHeight);
    }
  });

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

function showOverlay() {
  if (!currentSettings.enabled && !isTestMode) return;
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    createOverlayWindow();
  }
  if (overlayWindow && !overlayWindow.isVisible()) {
    overlayWindow.showInactive();
  }
}

function hideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    overlayWindow.hide();
  }
}

function updateOverlayData(members) {
  cachedMembers = Array.isArray(members) ? members : [];
  hasVoiceData = cachedMembers.length > 0;

  if (!overlayWindow || overlayWindow.isDestroyed()) return;

  overlayWindow.webContents.send("overlay:voice-update", cachedMembers);

  // Auto-resize: each member row ~44px + 12px padding top/bottom
  if (hasVoiceData) {
    const newHeight = Math.min(
      Math.max(cachedMembers.length * 44 + 24, 68),
      OVERLAY_HEIGHT,
    );
    overlayWindow.setSize(OVERLAY_WIDTH, newHeight);
  }
}

function applySettings(settings) {
  currentSettings = { ...currentSettings, ...settings };

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    // Update position
    const { x, y } = computePosition(currentSettings.position);
    overlayWindow.setPosition(x, y);

    // Forward settings to overlay HTML
    overlayWindow.webContents.send("overlay:settings", {
      opacity: currentSettings.opacity,
      autoHideWhenQuiet: currentSettings.autoHideWhenQuiet,
      avatarOnly: currentSettings.avatarOnly,
      showNameOnlyWhenSpeaking: currentSettings.showNameOnlyWhenSpeaking,
    });
  }

  evaluateVisibility();
}

function evaluateVisibility() {
  const shouldBeVisible =
    isTestMode ||
    (isGameActive &&
      currentSettings.enabled &&
      hasVoiceData &&
      !isAppFocused);

  if (shouldBeVisible) {
    showOverlay();
  } else {
    hideOverlay();
    // Liberar memoria RAM completa del segundo renderer de Chromium si no se está jugando o no se está en voz
    if (!isTestMode && (!isGameActive || !hasVoiceData || !currentSettings.enabled)) {
      destroyOverlay();
    }
  }
}

function setAppFocused(focused) {
  isAppFocused = Boolean(focused);
  evaluateVisibility();
}

function setGameActive(active) {
  isGameActive = Boolean(active);
  evaluateVisibility();
}

function onVoiceMembersUpdated(members) {
  updateOverlayData(members);
  evaluateVisibility();
}

function triggerTestOverlay(durationMs = 10000) {
  isTestMode = true;
  if (testModeTimer) clearTimeout(testModeTimer);

  const testList = (cachedMembers && cachedMembers.length > 0)
    ? cachedMembers
    : [
        {
          peerId: "preview-1",
          nickname: "You (Speaking)",
          avatar: null,
          isSpeaking: true,
          muted: false,
          deafened: false,
        },
        {
          peerId: "preview-2",
          nickname: "Subb",
          avatar: null,
          isSpeaking: false,
          muted: false,
          deafened: false,
        },
        {
          peerId: "preview-3",
          nickname: "Juancarlo",
          avatar: null,
          isSpeaking: false,
          muted: true,
          deafened: false,
        },
      ];

  evaluateVisibility();

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send("overlay:voice-update", testList);
    const newHeight = Math.min(
      Math.max(testList.length * 44 + 24, 68),
      OVERLAY_HEIGHT,
    );
    overlayWindow.setSize(OVERLAY_WIDTH, newHeight);
  }

  testModeTimer = setTimeout(() => {
    isTestMode = false;
    evaluateVisibility();
  }, durationMs);
}

function destroyOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
    overlayWindow = null;
  }
}

function getSettings() {
  return { ...currentSettings };
}

function getHasVoiceData() {
  return hasVoiceData;
}

function loadSettings(settings) {
  if (settings && typeof settings === "object") {
    currentSettings = {
      enabled: settings.enabled ?? true,
      position: settings.position ?? "top-left",
      opacity: settings.opacity ?? 0.6,
      autoHideWhenQuiet: settings.autoHideWhenQuiet ?? false,
      avatarOnly: settings.avatarOnly ?? false,
      showNameOnlyWhenSpeaking: settings.showNameOnlyWhenSpeaking ?? false,
    };
  }
  evaluateVisibility();
}

module.exports = {
  createOverlayWindow,
  showOverlay,
  hideOverlay,
  updateOverlayData,
  applySettings,
  setGameActive,
  setAppFocused,
  onVoiceMembersUpdated,
  triggerTestOverlay,
  destroyOverlay,
  getSettings,
  getHasVoiceData,
  loadSettings,
};
