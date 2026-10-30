/**
 * Canvas-based notification badge generator for Windows taskbar (setOverlayIcon),
 * macOS Dock, and browser document title.
 *
 * Utilizes official onicord-danger (#f38ba8), bold typography,
 * and formatted limits (1..9 and +9).
 */

const BADGE_CACHE = new Map();
const ONICORD_DANGER_COLOR = "#f38ba8"; // Official Catppuccin Mocha Red

export function clearBadgeCache() {
  BADGE_CACHE.clear();
}

/**
 * Returns the onicord-danger color (#f38ba8).
 */
function getDangerColor() {
  return ONICORD_DANGER_COLOR;
}

/**
 * Generates a PNG Data URL (32x32) with a circular notification badge.
 * @param {number} count - Unread item count.
 * @returns {string|null} Data URL in image/png format, or null if count <= 0.
 */
export function generateBadgeDataUrl(count) {
  const num = Number(count) || 0;
  if (num <= 0) return null;

  // Formatted range: 1, 2, ..., 8, 9, and +9
  const text = num > 9 ? "+9" : String(num);

  const fontSize = text.length > 1 ? 19 : 22;
  const dangerColor = getDangerColor();
  const cacheKey = `${text}_${dangerColor}_${fontSize}`;

  if (BADGE_CACHE.has(cacheKey)) {
    return BADGE_CACHE.get(cacheKey);
  }

  if (typeof document === "undefined") return null;

  try {
    const size = 32;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const center = size / 2;
    const radius = 15.5;

    // 1. Clean circular background with danger color (#f38ba8)
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = dangerColor;
    ctx.fill();

    // 2. Bold white text sized for maximum legibility in taskbar overlays
    // 22px for 1-9 and 19px for "+9" to balance circle filling
    const fontSize = text.length > 1 ? 19 : 22;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${fontSize}px "Inter", "Segoe UI", system-ui, -apple-system, sans-serif`;
    ctx.fillText(text, center, center + 0.5);

    const dataUrl = canvas.toDataURL("image/png");
    BADGE_CACHE.set(cacheKey, dataUrl);
    return dataUrl;
  } catch (err) {
    console.warn("[BadgeGenerator] Error al dibujar insignia en canvas:", err);
    return null;
  }
}

/**
 * Updates notification badge across Windows Taskbar, macOS Dock, and document title.
 * @param {number} count - Total unread message count.
 */
export function updateAppBadge(count) {
  const num = Math.max(0, Number(count) || 0);
  if (num === 0) {
    clearBadgeCache();
  }
  const dataUrl = num > 0 ? generateBadgeDataUrl(num) : null;

  // 1. Electron IPC (Windows Taskbar Overlay / macOS Dock / Linux)
  try {
    if (window.electronAPI?.updateBadgeCount) {
      window.electronAPI.updateBadgeCount({ count: num, dataUrl });
    }
  } catch (err) {
    console.warn("[Badge] Error llamando a electronAPI.updateBadgeCount:", err);
  }

  // 2. Browser document tab title
  try {
    if (typeof document !== "undefined") {
      const baseTitle = "Onicord";
      if (num > 0) {
        const badgeStr = num > 9 ? "+9" : String(num);
        document.title = `(${badgeStr}) ${baseTitle}`;
      } else if (document.title.startsWith("(")) {
        document.title = baseTitle;
      }
    }
  } catch (_) {}
}
