const { uIOhook, UiohookKey } = require("uiohook-napi");
const diagService = require("./diagService.cjs");

// Map numeric keycode to key name: { 50: "M", 30: "A", 66: "F8", ... }
const KEYCODE_TO_NAME = {};
for (const [keyName, code] of Object.entries(UiohookKey)) {
  KEYCODE_TO_NAME[code] = keyName;
}

// Modifier keys that should not trigger on their own
const MODIFIER_NAMES = new Set([
  "Ctrl",
  "CtrlRight",
  "Alt",
  "AltRight",
  "Shift",
  "ShiftRight",
  "Meta",
  "MetaRight",
]);

/**
 * Standardize shortcut representation regardless of key order or spacing
 * e.g. "Ctrl + Shift + Mouse5" <=> "shift + ctrl + mouse 5" => "ctrl+shift+mouse5"
 */
function canonicalizeShortcut(str) {
  if (!str) return "";
  const tokens = str
    .toLowerCase()
    .replace(/\s+/g, "")
    .split("+")
    .filter(Boolean)
    .map((token) => {
      if (token === "control") return "ctrl";
      if (token === "comma" || token === ",") return ",";
      if (token === "cmd" || token === "command") return "meta";
      if (token === "option") return "alt";
      const m = token.match(/^mouse(\d+)$/);
      if (m) return `mouse${m[1]}`;
      return token;
    });

  const modifierOrder = { ctrl: 1, alt: 2, shift: 3, meta: 4 };
  const modifiers = [];
  const keys = [];

  for (const token of tokens) {
    if (modifierOrder[token]) {
      modifiers.push(token);
    } else {
      keys.push(token);
    }
  }

  modifiers.sort((a, b) => modifierOrder[a] - modifierOrder[b]);
  keys.sort();

  return [...modifiers, ...keys].join("+");
}

class GlobalKeybindService {
  constructor() {
    this.mainWindow = null;
    this.keybindings = [];
    this.isAppFocused = true;
    this.isRunning = false;
    this.lastTriggerTime = 0;
    this.lastTriggerAction = null;
    this.currentModifiers = {
      ctrl: false,
      shift: false,
      alt: false,
      meta: false,
    };
  }

  init(mainWindow, initialKeybindings) {
    this.mainWindow = mainWindow;
    this.keybindings = Array.isArray(initialKeybindings)
      ? initialKeybindings
      : [];

    try {
      uIOhook.on("mousedown", this.handleMouseDown.bind(this));
      uIOhook.on("keydown", this.handleKeyDown.bind(this));
      uIOhook.on("keyup", this.handleKeyUp.bind(this));
      uIOhook.start();
      this.isRunning = true;
      diagService.log(
        "info",
        "Keybinds",
        `[GlobalKeybind] uIOhook global input listener iniciado con éxito (${this.keybindings.length} atajos registrados).`,
      );
    } catch (err) {
      diagService.log(
        "error",
        "Keybinds",
        `[GlobalKeybind] Error iniciando uIOhook: ${err.message}`,
      );
    }
  }

  setAppFocused(focused) {
    this.isAppFocused = Boolean(focused);
  }

  updateKeybindings(keybindings) {
    this.keybindings = Array.isArray(keybindings) ? keybindings : [];
    diagService.log(
      "info",
      "Keybinds",
      `[GlobalKeybind] Atajos actualizados: ${this.keybindings.length} registrados.`,
    );
  }

  handleKeyUp(e) {
    const rawKey = KEYCODE_TO_NAME[e.keycode];
    if (!rawKey) return;

    if (rawKey === "Ctrl" || rawKey === "CtrlRight") this.currentModifiers.ctrl = false;
    else if (rawKey === "Shift" || rawKey === "ShiftRight") this.currentModifiers.shift = false;
    else if (rawKey === "Alt" || rawKey === "AltRight") this.currentModifiers.alt = false;
    else if (rawKey === "Meta" || rawKey === "MetaRight") this.currentModifiers.meta = false;
  }

  handleKeyDown(e) {
    const rawKey = KEYCODE_TO_NAME[e.keycode];
    if (!rawKey) return;

    // Track modifiers
    if (rawKey === "Ctrl" || rawKey === "CtrlRight") this.currentModifiers.ctrl = true;
    else if (rawKey === "Shift" || rawKey === "ShiftRight") this.currentModifiers.shift = true;
    else if (rawKey === "Alt" || rawKey === "AltRight") this.currentModifiers.alt = true;
    else if (rawKey === "Meta" || rawKey === "MetaRight") this.currentModifiers.meta = true;

    // Ignore solitary modifier presses
    if (MODIFIER_NAMES.has(rawKey)) return;

    let keyName = rawKey;
    if (keyName === "Space") keyName = "Space";

    const hasCtrl = Boolean(e.ctrlKey || this.currentModifiers.ctrl);
    const hasShift = Boolean(e.shiftKey || this.currentModifiers.shift);
    const hasAlt = Boolean(e.altKey || this.currentModifiers.alt);
    const hasMeta = Boolean(e.metaKey || this.currentModifiers.meta);

    const parts = [];
    if (hasCtrl) parts.push("Ctrl");
    if (hasShift) parts.push("Shift");
    if (hasAlt) parts.push("Alt");
    if (hasMeta) parts.push("Meta");
    parts.push(keyName);

    const hasModifiers = hasCtrl || hasAlt || hasMeta;
    const isFunctionKey = /^F\d+$/i.test(keyName);

    const pressed = parts.join(" + ");
    this.matchAndDispatch(pressed, {
      isMouse: false,
      hasModifiers,
      isFunctionKey,
    });
  }

  handleMouseDown(e) {
    const hasCtrl = Boolean(e.ctrlKey || this.currentModifiers.ctrl);
    const hasShift = Boolean(e.shiftKey || this.currentModifiers.shift);
    const hasAlt = Boolean(e.altKey || this.currentModifiers.alt);
    const hasMeta = Boolean(e.metaKey || this.currentModifiers.meta);

    // 1 = Left, 2 = Right, 3 = Middle (Mouse3), 4 = Mouse4, 5 = Mouse5
    // Ignore normal left/right clicks if no modifier keys are held
    if (e.button < 3 && !hasCtrl && !hasShift && !hasAlt && !hasMeta) {
      return;
    }

    const mouseName =
      e.button === 3
        ? "Mouse3"
        : e.button === 4
          ? "Mouse4"
          : e.button === 5
            ? "Mouse5"
            : `Mouse${e.button}`;

    const parts = [];
    if (hasCtrl) parts.push("Ctrl");
    if (hasShift) parts.push("Shift");
    if (hasAlt) parts.push("Alt");
    if (hasMeta) parts.push("Meta");
    parts.push(mouseName);

    const pressed = parts.join(" + ");
    this.matchAndDispatch(pressed, {
      isMouse: true,
      hasModifiers: hasCtrl || hasShift || hasAlt || hasMeta,
    });
  }

  matchAndDispatch(
    pressedShortcut,
    { isMouse, hasModifiers, isFunctionKey },
  ) {
    if (!this.keybindings || this.keybindings.length === 0) return;

    const pressedCanonical = canonicalizeShortcut(pressedShortcut);

    let match = this.keybindings.find(
      (kb) => canonicalizeShortcut(kb.shortcut) === pressedCanonical,
    );

    if (!match && process.platform === "darwin" && pressedCanonical.includes("meta")) {
      const asCtrl = pressedCanonical.replace("meta", "ctrl");
      match = this.keybindings.find(
        (kb) => canonicalizeShortcut(kb.shortcut) === asCtrl,
      );
    }

    if (!match) return;

    // Core shortcut safety rule:
    // Single-key shortcuts (without Ctrl/Alt/Meta, non-mouse, non-F1-F24) must NEVER
    // be dispatched by the OS-level global hook (uIOhook).
    // 1) In the background, they would interfere with typing in any other application (Word, browsers, games).
    // 2) In the foreground, they are already captured by the Onicord window DOM (keydown),
    //    where we can reliably check if the user is focused on an input, textarea, or chat element.
    if (!isMouse && !hasModifiers && !isFunctionKey) {
      return;
    }

    // 120ms debounce to prevent duplicate triggers
    const now = Date.now();
    if (
      this.lastTriggerAction === match.action &&
      now - this.lastTriggerTime < 120
    ) {
      return;
    }
    this.lastTriggerTime = now;
    this.lastTriggerAction = match.action;

    diagService.log(
      "info",
      "Keybinds",
      `[GlobalKeybind] Triggering action: ${match.action} (${pressedShortcut} -> ${pressedCanonical}) [App focused: ${this.isAppFocused}]`,
    );

    const targetWin =
      this.mainWindow && !this.mainWindow.isDestroyed()
        ? this.mainWindow
        : global.mainWindow && !global.mainWindow.isDestroyed()
          ? global.mainWindow
          : null;

    if (targetWin) {
      targetWin.webContents.send("onicord:global-keybind", {
        action: match.action,
        shortcut: match.shortcut,
        isMouse,
        hasModifiers,
        isFunctionKey,
      });
    }
  }

  stop() {
    if (this.isRunning) {
      try {
        uIOhook.stop();
        this.isRunning = false;
        diagService.log("info", "Keybinds", "[GlobalKeybind] uIOhook detenido.");
      } catch (err) {}
    }
  }
}

module.exports = new GlobalKeybindService();
