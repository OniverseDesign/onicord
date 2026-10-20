/**
 * Service to track, aggregate, and store game playtime based on Rich Presence activity.
 */

const STORAGE_KEY = "onicord_game_playtime_v1";

/**
 * Reads all stored game playtime records from localStorage.
 * @returns {Record<string, { name: string, cover: string|null, type?: string, totalSeconds: number, lastPlayed: number }>}
 */
export function getPlaytimeData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch (err) {
    console.error("[PlaytimeTracker] Error loading playtime data:", err);
    return {};
  }
}

/**
 * Adds elapsed seconds to a game's total playtime record.
 * @param {string} gameName 
 * @param {number} addedSeconds 
 * @param {string|null} cover 
 * @param {string} type 
 */
export function addPlaytime(gameName, addedSeconds, cover = null, type = "game") {
  if (!gameName || addedSeconds <= 0) return;

  try {
    const current = getPlaytimeData();
    const existing = current[gameName] || {
      name: gameName,
      cover: cover || null,
      type: type || "game",
      totalSeconds: 0,
      lastPlayed: Date.now(),
    };

    const nextTotal = (existing.totalSeconds || 0) + addedSeconds;
    current[gameName] = {
      ...existing,
      name: gameName,
      cover: cover || existing.cover || null,
      type: type || existing.type || "game",
      totalSeconds: nextTotal,
      lastPlayed: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    // Emitir evento para que cualquier widget montado actualice sus estadísticas en vivo
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("onicord-playtime-updated", { detail: current }));
    }
  } catch (err) {
    console.error("[PlaytimeTracker] Error saving playtime:", err);
  }
}

/**
 * Formats total seconds into a readable hours/minutes string.
 * Examples: 3600 -> "1h 00m", 2700 -> "45m", 7300 -> "2h 01m"
 * @param {number} totalSeconds 
 * @returns {string}
 */
export function formatPlaytime(totalSeconds = 0) {
  if (!totalSeconds || totalSeconds < 60) {
    return "< 1 min";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }
  return `${minutes}m`;
}

/**
 * Formats a timestamp into a fuzzy relative date string (e.g. "Hoy", "Ayer", "Hace 3 días").
 * @param {number} timestamp 
 * @returns {string}
 */
export function formatRelativeDate(timestamp, t = null) {
  if (!timestamp) return "";
  const now = Date.now();
  const diffDays = Math.floor((now - timestamp) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t ? t("time.today", "Hoy") : "0d";
  if (diffDays === 1) return t ? t("time.yesterday", "Ayer") : "1d";
  if (diffDays < 7) return t ? t("time.daysAgo", "Hace {{count}} días", { count: diffDays }) : `${diffDays}d`;
  if (diffDays < 30) return t ? t("time.weeksAgo", "Hace {{count}} sem", { count: Math.floor(diffDays / 7) }) : `${Math.floor(diffDays / 7)}w`;
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Inicializador de seguimiento global de tiempo.
 * Se ejecuta a nivel raíz de la aplicación para acumular tiempo independientemente de qué vista esté abierta.
 */
export function initGlobalPlaytimeTracker() {
  const api = window.electronAPI;
  if (!api || typeof window === "undefined") return () => {};

  let currentActive = null;
  let interval = null;

  const startTracking = (activity) => {
    if (interval) clearInterval(interval);
    if (!activity || !activity.name || activity.type === "music") {
      currentActive = null;
      return;
    }

    currentActive = activity;
    // Registro inicial
    addPlaytime(activity.name, 1, activity.cover, activity.type || "game");

    // Registro acumulativo cada 10 segundos
    interval = setInterval(() => {
      if (currentActive?.name) {
        addPlaytime(currentActive.name, 10, currentActive.cover, currentActive.type || "game");
      }
    }, 10000);
  };

  // Consultar estado inicial
  api.getCurrentGame?.().then((game) => {
    if (game?.name) startTracking(game);
  });

  // Escuchar cambios de actividad
  const unsub = api.onGameActivityChanged?.((game) => {
    if (game?.name) {
      startTracking(game);
    } else {
      if (interval) clearInterval(interval);
      currentActive = null;
    }
  });

  return () => {
    if (interval) clearInterval(interval);
    unsub?.();
  };
}
