export const APP_COLORS = {
  default: {
    key: "default",
    name: "Default",
    rawRgb: "30 30 46",
    rgbVar: "var(--onicord-bg-base)",
    colorVar: "rgb(var(--onicord-bg-base))",
    isLight: false,
    isStructure: true,
  },
  surface: {
    key: "surface",
    name: "Surface",
    rawRgb: "24 24 37",
    rgbVar: "var(--onicord-bg-surface)",
    colorVar: "rgb(var(--onicord-bg-surface))",
    isLight: false,
    isStructure: true,
  },
  mantle: {
    key: "mantle",
    name: "Dark",
    rawRgb: "17 17 27",
    rgbVar: "var(--onicord-bg-mantle)",
    colorVar: "rgb(var(--onicord-bg-mantle))",
    isLight: false,
    isStructure: true,
  },
  overlay: {
    key: "overlay",
    name: "Overlay",
    rawRgb: "49 50 68",
    rgbVar: "var(--onicord-bg-overlay)",
    colorVar: "rgb(var(--onicord-bg-overlay))",
    isLight: false,
    isStructure: true,
  },
  lavender: {
    key: "lavender",
    name: "Lavender",
    rawRgb: "180 190 254",
    rgbVar: "var(--onicord-lavender)",
    colorVar: "rgb(180 190 254)",
    isLight: true,
  },
  rosewater: {
    key: "rosewater",
    name: "Rosewater",
    rawRgb: "245 224 220",
    rgbVar: "var(--onicord-rosewater)",
    colorVar: "rgb(245 224 220)",
    isLight: true,
  },
  flamingo: {
    key: "flamingo",
    name: "Flamingo",
    rawRgb: "242 205 205",
    rgbVar: "var(--onicord-flamingo)",
    colorVar: "rgb(242 205 205)",
    isLight: true,
  },
  pink: {
    key: "pink",
    name: "Pink",
    rawRgb: "245 194 231",
    rgbVar: "var(--onicord-pink)",
    colorVar: "rgb(245 194 231)",
    isLight: true,
  },
  mauve: {
    key: "mauve",
    name: "Mauve",
    rawRgb: "203 166 247",
    rgbVar: "var(--onicord-mauve)",
    colorVar: "rgb(203 166 247)",
    isLight: true,
  },
  red: {
    key: "red",
    name: "Red",
    rawRgb: "243 139 168",
    rgbVar: "var(--onicord-red)",
    colorVar: "rgb(243 139 168)",
    isLight: true,
  },
  maroon: {
    key: "maroon",
    name: "Maroon",
    rawRgb: "235 160 172",
    rgbVar: "var(--onicord-maroon)",
    colorVar: "rgb(235 160 172)",
    isLight: true,
  },
  peach: {
    key: "peach",
    name: "Peach",
    rawRgb: "250 179 135",
    rgbVar: "var(--onicord-peach)",
    colorVar: "rgb(250 179 135)",
    isLight: true,
  },
  yellow: {
    key: "yellow",
    name: "Yellow",
    rawRgb: "249 226 175",
    rgbVar: "var(--onicord-yellow)",
    colorVar: "rgb(249 226 175)",
    isLight: true,
  },
  green: {
    key: "green",
    name: "Green",
    rawRgb: "166 227 161",
    rgbVar: "var(--onicord-success)",
    colorVar: "rgb(166 227 161)",
    isLight: true,
  },
  teal: {
    key: "teal",
    name: "Teal",
    rawRgb: "148 226 213",
    rgbVar: "var(--onicord-teal)",
    colorVar: "rgb(148 226 213)",
    isLight: true,
  },
  sky: {
    key: "sky",
    name: "Sky",
    rawRgb: "137 220 235",
    rgbVar: "var(--onicord-sky)",
    colorVar: "rgb(137 220 235)",
    isLight: true,
  },
  sapphire: {
    key: "sapphire",
    name: "Sapphire",
    rawRgb: "116 199 236",
    rgbVar: "var(--onicord-sapphire)",
    colorVar: "rgb(116 199 236)",
    isLight: true,
  },
  blue: {
    key: "blue",
    name: "Blue",
    rawRgb: "137 180 250",
    rgbVar: "var(--onicord-blue)",
    colorVar: "rgb(137 180 250)",
    isLight: true,
  },
};

/**
 * Lookup map of accent color names to their raw RGB channel strings.
 * Derived from APP_COLORS to avoid duplicating values.
 * Used by App.jsx to apply the active accent CSS variable on boot.
 */
export const ACCENT_PALETTE = Object.fromEntries(
  Object.values(APP_COLORS)
    .filter((c) => !c.isStructure)
    .map((c) => [c.key, c.rawRgb])
);

/**
 * Converts RGB channels (0-255) to HSL ({ h: 0..360, s: 0..100, l: 0..100 })
 */
export function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Converts HSL ({ h: 0..360, s: 0..100, l: 0..100 }) to RGB string ("r g b")
 */
export function hslToRawRgb(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return `${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}`;
}

/**
 * Parses hex string or "R G B" space separated string to { r, g, b }
 */
export function parseRgb(colorStr) {
  if (!colorStr) return { r: 180, g: 190, b: 254 };
  if (colorStr.startsWith("#")) {
    const hex = colorStr.replace("#", "");
    const fullHex = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const num = parseInt(fullHex, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  const parts = colorStr.split(/\s+/).map(Number);
  if (parts.length >= 3 && !parts.some(isNaN)) {
    return { r: parts[0], g: parts[1], b: parts[2] };
  }
  return { r: 180, g: 190, b: 254 };
}

// Baseline structural layers definitions (Mocha dark baseline)
const STRUCTURE_BASES_DARK = {
  mantle:  { baseL: 8.6,  baseS: 22.7, cssVar: "--color-mantle-rgb",  bgVar: "--onicord-bg-mantle" },
  surface: { baseL: 12.0, baseS: 21.3, cssVar: "--color-surface-rgb", bgVar: "--onicord-bg-surface" },
  base:    { baseL: 14.9, baseS: 21.1, cssVar: "--color-base-rgb",    bgVar: "--onicord-bg-base" },
  overlay: { baseL: 22.9, baseS: 16.2, cssVar: "--color-overlay-rgb", bgVar: "--onicord-bg-overlay" },
};

// Baseline structural layers definitions (Light mode baseline)
const STRUCTURE_BASES_LIGHT = {
  base:    { baseL: 97.5, baseS: 12.0, cssVar: "--color-base-rgb",    bgVar: "--onicord-bg-base" },
  surface: { baseL: 93.5, baseS: 15.0, cssVar: "--color-surface-rgb", bgVar: "--onicord-bg-surface" },
  mantle:  { baseL: 88.0, baseS: 18.0, cssVar: "--color-mantle-rgb",  bgVar: "--onicord-bg-mantle" },
  overlay: { baseL: 83.0, baseS: 20.0, cssVar: "--color-overlay-rgb", bgVar: "--onicord-bg-overlay" },
};

// Semantic text color maps per mode (dynamically tuned to accentHue)
const TEXT_BASES_DARK = {
  "--onicord-text":            { baseL: 88.0, baseS: 25.0 },
  "--onicord-subtext":         { baseL: 78.0, baseS: 20.0 },
  "--onicord-muted":           { baseL: 58.0, baseS: 15.0 },
  "--onicord-faded":           { baseL: 42.0, baseS: 12.0 },
  "--onicord-text-dark":       { baseL: 8.5,  baseS: 22.0 },
  "--onicord-text-dark-sub":   { baseL: 12.0, baseS: 20.0 },
  "--onicord-text-dark-muted": { baseL: 22.0, baseS: 16.0 },
};

const TEXT_BASES_LIGHT = {
  "--onicord-text":            { baseL: 12.0, baseS: 25.0 },
  "--onicord-subtext":         { baseL: 22.0, baseS: 20.0 },
  "--onicord-muted":           { baseL: 42.0, baseS: 15.0 },
  "--onicord-faded":           { baseL: 58.0, baseS: 12.0 },
  "--onicord-text-dark":       { baseL: 8.5,  baseS: 22.0 },
  "--onicord-text-dark-sub":   { baseL: 12.0, baseS: 20.0 },
  "--onicord-text-dark-muted": { baseL: 22.0, baseS: 16.0 },
};

// Unified dynamic shadow maps per mode
const SHADOW_VARIABLES = {
  dark: {
    "--onicord-shadow-sm": "0 1px 3px 0 rgba(0, 0, 0, 0.4)",
    "--onicord-shadow-md": "0 4px 12px -2px rgba(0, 0, 0, 0.5)",
    "--onicord-shadow-lg": "0 10px 25px -3px rgba(0, 0, 0, 0.6)",
    "--onicord-shadow-2xl": "0 25px 50px -12px rgba(0, 0, 0, 0.75)",
    "--onicord-shadow-inner": "inset 0 2px 4px 0 rgba(0, 0, 0, 0.35)",
    "--onicord-shadow-elevated": "0 8px 24px rgba(0, 0, 0, 0.5)",
    "--onicord-shadow-header": "0 1px 0 rgba(0, 0, 0, 0.4), 0 1.5px 0 rgba(0, 0, 0, 0.2)",
  },
  light: {
    "--onicord-shadow-sm": "0 1px 2px 0 rgba(15, 23, 42, 0.05)",
    "--onicord-shadow-md": "0 4px 12px -2px rgba(15, 23, 42, 0.08)",
    "--onicord-shadow-lg": "0 10px 25px -3px rgba(15, 23, 42, 0.12)",
    "--onicord-shadow-2xl": "0 20px 40px -10px rgba(15, 23, 42, 0.16)",
    "--onicord-shadow-inner": "inset 0 2px 4px 0 rgba(15, 23, 42, 0.06)",
    "--onicord-shadow-elevated": "0 8px 24px rgba(15, 23, 42, 0.09)",
    "--onicord-shadow-header": "0 1px 0 rgba(0, 0, 0, 0.06), 0 1.5px 0 rgba(0, 0, 0, 0.03)",
  },
};

/**
 * Applies Material Design 3 style dynamic colors & light/dark mode to the root document.
 * @param {Object} options
 * @param {string} [options.accentKeyOrHex="lavender"] - Preset name ("lavender") or hex ("#ff0055")
 * @param {number} [options.saturationPercentage=50] - Saturation % (0 = monochrome, 50 = default subtle tint, 100+ = vibrant)
 * @param {number} [options.lightnessOffset=0] - Lightness offset % (-20 to +20)
 * @param {string} [options.mode="dark"] - Theme mode ("dark" or "light")
 */
export function applyDynamicTheme({
  accentKeyOrHex = "lavender",
  saturationPercentage = 50,
  lightnessOffset = 0,
  mode = "dark",
}) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const isLight = mode === "light";

  if (isLight) {
    root.classList.add("light-mode");
    root.setAttribute("data-theme", "light");
  } else {
    root.classList.remove("light-mode");
    root.removeAttribute("data-theme");
  }

  // Apply shadow variables
  const shadowVars = SHADOW_VARIABLES[isLight ? "light" : "dark"];
  Object.entries(shadowVars).forEach(([varName, val]) => {
    root.style.setProperty(varName, val);
  });

  let accentRawRgb = "203 166 247";
  if (accentKeyOrHex.startsWith("#")) {
    const { r, g, b } = parseRgb(accentKeyOrHex);
    accentRawRgb = `${r} ${g} ${b}`;
  } else {
    accentRawRgb = ACCENT_PALETTE[accentKeyOrHex] || "203 166 247";
  }

  // Set active accent color variable
  root.style.setProperty("--onicord-lavender", accentRawRgb);

  // Extract accent hue
  const { r, g, b } = parseRgb(accentRawRgb);
  const { h: accentHue } = rgbToHsl(r, g, b);

  // Saturation factor: 50% slider value = 1.0 multiplier (default subtle tint)
  const satFactor = Math.max(0, Number(saturationPercentage)) / 50;
  const lightOffset = Number(lightnessOffset) || 0;

  const structureBases = isLight ? STRUCTURE_BASES_LIGHT : STRUCTURE_BASES_DARK;

  // Recalculate each structural layer
  Object.values(structureBases).forEach(({ baseL, baseS, cssVar, bgVar }) => {
    const calculatedS = Math.min(100, Math.max(0, baseS * satFactor));
    const calculatedL = Math.min(99, Math.max(1, baseL + lightOffset));
    const rawRgb = hslToRawRgb(accentHue, calculatedS, calculatedL);

    root.style.setProperty(cssVar, rawRgb);
    root.style.setProperty(bgVar, rawRgb);
  });

  // Recalculate dynamic text color variables tinted by accentHue
  const textBases = isLight ? TEXT_BASES_LIGHT : TEXT_BASES_DARK;
  Object.entries(textBases).forEach(([varName, { baseL, baseS }]) => {
    const calculatedS = Math.min(100, Math.max(0, baseS * satFactor));
    const calculatedL = Math.min(99, Math.max(1, baseL));
    const rawRgb = hslToRawRgb(accentHue, calculatedS, calculatedL);

    root.style.setProperty(varName, `rgb(${rawRgb})`);
  });
}


