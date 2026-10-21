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
    const data = JSON.parse(raw) || {};
    let modified = false;
    for (const key of Object.keys(data)) {
      if (
        key === "Arcade" ||
        key === "Onicord Arcade" ||
        data[key]?.type === "launcher" ||
        data[key]?.isCatalog
      ) {
        delete data[key];
        modified = true;
      }
    }
    if (modified) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
    return data;
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
  if (
    !gameName ||
    addedSeconds <= 0 ||
    gameName === "Arcade" ||
    gameName === "Onicord Arcade" ||
    type === "launcher"
  ) {
    return;
  }

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
  let lastTimestamp = Date.now();
  let interval = null;

  const flushElapsed = () => {
    if (currentActive?.name) {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - lastTimestamp) / 1000);
      if (elapsedSeconds > 0) {
        addPlaytime(
          currentActive.name,
          elapsedSeconds,
          currentActive.cover,
          currentActive.type || "game"
        );
        lastTimestamp = now;
      }
    }
  };

  const handleActivityChange = (activity) => {
    // 1. Guardar cualquier segundo acumulado del juego previo antes de cambiar
    flushElapsed();

    const isIgnored =
      !activity ||
      !activity.name ||
      activity.name === "Arcade" ||
      activity.name === "Onicord Arcade" ||
      activity.type === "music" ||
      activity.type === "launcher" ||
      activity.isCatalog === true;

    if (isIgnored) {
      currentActive = null;
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      return;
    }

    // 2. Si es el mismo juego activo que ya está corriendo, NO reiniciar el temporizador
    if (currentActive && currentActive.name === activity.name) {
      if (activity.cover && !currentActive.cover) currentActive.cover = activity.cover;
      if (activity.type && !currentActive.type) currentActive.type = activity.type;
      return;
    }

    // 3. Iniciar seguimiento del nuevo juego
    currentActive = { ...activity };
    lastTimestamp = Date.now();

    // Acumular periódicamente cada 5 segundos
    if (!interval) {
      interval = setInterval(() => {
        flushElapsed();
      }, 5000);
    }
  };

  // Consultar estado inicial
  api.getCurrentGame?.().then((game) => {
    if (game?.name) handleActivityChange(game);
  });

  // Escuchar cambios de actividad
  const unsub = api.onGameActivityChanged?.((game) => {
    handleActivityChange(game);
  });

  // Guardar tiempo si se cierra o recarga la aplicación
  const handleBeforeUnload = () => {
    flushElapsed();
  };
  window.addEventListener("beforeunload", handleBeforeUnload);

  return () => {
    flushElapsed();
    if (interval) clearInterval(interval);
    unsub?.();
    window.removeEventListener("beforeunload", handleBeforeUnload);
  };
}
