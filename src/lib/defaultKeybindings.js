/**
 * Default Keybindings and Keybinding Normalization Utilities for Onicord
 */

export const DEFAULT_KEYBINDINGS = [
  { id: "default-focus-search", action: "focus_search", shortcut: "Ctrl + F" },
  { id: "default-toggle-mute", action: "toggle_mute", shortcut: "Ctrl + Shift + M" },
  { id: "default-toggle-deafen", action: "toggle_deafen", shortcut: "Ctrl + Shift + D" },
  { id: "default-disconnect-voice", action: "disconnect_voice", shortcut: "Ctrl + Shift + E" },
  { id: "default-open-settings", action: "open_settings", shortcut: "Ctrl + ," },
  { id: "default-open-pinned", action: "open_pinned", shortcut: "Ctrl + P" },
  { id: "default-go-to-dashboard", action: "go_to_dashboard", shortcut: "Alt + Home" },
  { id: "default-open-server-settings", action: "open_server_settings", shortcut: "Ctrl + Shift + S" },
  { id: "default-switch-server-up", action: "switch_server_up", shortcut: "Ctrl + Alt + ArrowUp" },
  { id: "default-switch-server-down", action: "switch_server_down", shortcut: "Ctrl + Alt + ArrowDown" },
];

export const isMac =
  typeof navigator !== "undefined"
    ? /Mac|iPhone|iPod|iPad/i.test(navigator.platform || navigator.userAgent)
    : typeof process !== "undefined" && process.platform === "darwin";

/**
 * Standardize shortcut representation regardless of key order, case or whitespace
 * e.g. "Ctrl + Shift + F" <=> "shift + ctrl + f" => "ctrl+shift+f"
 * Handles "control" -> "ctrl", "comma" / "," -> ",", "cmd"/"command" -> "meta", "option" -> "alt", etc.
 */
export function canonicalizeShortcut(str) {
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

/**
 * Normalizes user keybindings by providing defaults for any standard actions that
 * have not yet been defined by the user. Preserves all user custom bindings.
 */
export function normalizeKeybindings(userKeybindings) {
  const generateId = () => {
    try {
      return crypto.randomUUID();
    } catch {
      return `kb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }
  };

  if (!Array.isArray(userKeybindings) || userKeybindings.length === 0) {
    return DEFAULT_KEYBINDINGS.map((kb) => ({
      ...kb,
      id: generateId(),
    }));
  }

  const result = [...userKeybindings];
  const configuredActions = new Set(userKeybindings.map((kb) => kb.action));

  for (const def of DEFAULT_KEYBINDINGS) {
    if (!configuredActions.has(def.action)) {
      result.push({
        ...def,
        id: generateId(),
      });
    }
  }

  return result;
}

