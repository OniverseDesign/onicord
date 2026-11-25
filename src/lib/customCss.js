export const STORAGE_CUSTOM_CSS_KEY = "onicord_theme_custom_css";
export const STORAGE_CUSTOM_CSS_ENABLED_KEY = "onicord_theme_custom_css_enabled";
export const STORAGE_WINDOW_MICA_KEY = "onicord_window_mica";
export const RUNTIME_STYLE_TAG_ID = "onicord-runtime-styles";
export const MAX_CUSTOM_CSS_BYTES = 512 * 1024; // 512 KB

export const CUSTOM_CSS_QUICK_REFERENCE = [
  { token: "var(--onicord-accent)", descKey: "accent" },
  { token: "var(--onicord-on-accent)", descKey: "onAccent" },
  { token: "var(--onicord-text)", descKey: "text" },
  { token: "var(--onicord-subtext)", descKey: "subtext" },
  { token: "var(--onicord-muted)", descKey: "muted" },
  { token: "rgb(var(--onicord-bg-base))", descKey: "bgBase" },
  { token: "rgb(var(--onicord-bg-surface))", descKey: "bgSurface" },
  { token: "rgb(var(--onicord-bg-mantle))", descKey: "bgMantle" },
  { token: "var(--onicord-border)", descKey: "border" },
  { token: ".onicord-chat-input-bar", descKey: "chatInput" },
  { token: ".onicord-settings-card", descKey: "settingsCard" },
];

/**
 * Checks whether safe mode (?safecss=1) is active in the current URL.
 */
export function isSafeCssMode() {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("safecss") === "1";
  } catch {
    return false;
  }
}

/**
 * Reads persisted custom CSS and its enabled state from localStorage.
 */
export function getCustomCSSState() {
  if (typeof window === "undefined") {
    return { css: "", enabled: true };
  }
  const css = localStorage.getItem(STORAGE_CUSTOM_CSS_KEY) || "";
  const enabledRaw = localStorage.getItem(STORAGE_CUSTOM_CSS_ENABLED_KEY);
  const enabled = enabledRaw === null ? true : enabledRaw !== "false";
  return { css, enabled };
}

/**
 * Injects or clears the runtime custom CSS <style> tag using textContent.
 * Skips injection when safe mode (?safecss=1) is active.
 */
export function applyCustomCSS(css, enabled = true) {
  if (typeof document === "undefined") return false;

  const safeMode = isSafeCssMode();
  let styleTag = document.getElementById(RUNTIME_STYLE_TAG_ID);

  if (safeMode || !enabled || !css) {
    if (styleTag) {
      styleTag.textContent = "";
    }
    return !safeMode;
  }

  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = RUNTIME_STYLE_TAG_ID;
    document.head.appendChild(styleTag);
  }

  styleTag.textContent = css;
  return true;
}

/**
 * Persists custom CSS and enabled flag to localStorage and applies it to the DOM.
 */
export function saveCustomCSSState(css, enabled = true) {
  if (typeof window !== "undefined") {
    if (css) {
      localStorage.setItem(STORAGE_CUSTOM_CSS_KEY, css);
    } else {
      localStorage.removeItem(STORAGE_CUSTOM_CSS_KEY);
    }
    localStorage.setItem(STORAGE_CUSTOM_CSS_ENABLED_KEY, enabled ? "true" : "false");
  }
  return applyCustomCSS(css, enabled);
}

/**
 * Performs a lightweight brace balance check on CSS, ignoring comments and quoted strings.
 */
export function validateCssBraces(css) {
  if (!css) {
    return { valid: true, unclosedCount: 0, extraClosingCount: 0 };
  }

  // Strip /* ... */ comments and '...' / "..." strings
  const stripped = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(["'])(?:\\.|(?!\1)[^\\\r\n])*\1/g, "");

  let depth = 0;
  let extraClosingCount = 0;

  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      if (depth > 0) {
        depth -= 1;
      } else {
        extraClosingCount += 1;
      }
    }
  }

  return {
    valid: depth === 0 && extraClosingCount === 0,
    unclosedCount: depth,
    extraClosingCount,
  };
}

/**
 * Reads whether Windows Mica window translucency is enabled.
 */
export function getWindowMicaEnabled() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_WINDOW_MICA_KEY) === "true";
}

/**
 * Applies or removes Windows Mica translucency on both the DOM root and Electron window.
 */
export async function applyWindowMica(enabled) {
  if (typeof document !== "undefined") {
    if (enabled) {
      document.documentElement.setAttribute("data-window-mica", "true");
    } else {
      document.documentElement.removeAttribute("data-window-mica");
    }
  }

  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_WINDOW_MICA_KEY, enabled ? "true" : "false");
    if (window.electronAPI?.setWindowBackgroundMaterial) {
      try {
        return await window.electronAPI.setWindowBackgroundMaterial(enabled ? "mica" : "none");
      } catch {
        return { ok: false, supported: false };
      }
    }
  }
  return { ok: true, supported: false };
}
