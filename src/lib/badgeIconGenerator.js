/**
 * Generador de insignias (badges) en Canvas para la barra de tareas de Windows (setOverlayIcon),
 * macOS Dock y navegadores.
 *
 * Utiliza el color oficial onicord-danger (Catppuccin Mocha Red #f38ba8), tipografía en bold 16px
 * y limitación a 1..9 y +9.
 */

const BADGE_CACHE = new Map();
const ONICORD_DANGER_COLOR = "#f38ba8"; // Catppuccin Mocha Red oficial

export function clearBadgeCache() {
  BADGE_CACHE.clear();
}

/**
 * Obtiene el color onicord-danger (#f38ba8).
 */
function getDangerColor() {
  return ONICORD_DANGER_COLOR;
}

/**
 * Genera un Data URL PNG (32x32) con la insignia circular onicord-danger de notificaciones.
 * @param {number} count Número de elementos sin leer
 * @returns {string|null} Data URL en formato image/png o null si count <= 0
 */
export function generateBadgeDataUrl(count) {
  const num = Number(count) || 0;
  if (num <= 0) return null;

  // Formato requerido: 1, 2, ..., 8, 9, y +9
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

    // 1. Fondo circular limpio con onicord-danger (#f38ba8)
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = dangerColor;
    ctx.fill();

    // 2. Texto blanco puro en negrita: tamaño aumentado para máxima legibilidad en barra de tareas
    // 22px para números 1-9 y 19px para "+9" para llenar armónicamente el círculo
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
 * Actualiza la insignia en Windows Taskbar (setOverlayIcon), macOS Dock y título de pestaña.
 * @param {number} count Total de mensajes sin leer
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

  // 2. Título de la pestaña en navegador
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
