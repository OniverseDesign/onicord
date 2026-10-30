/**
 * Service to track, aggregate, and store game playtime based on Rich Presence activity.
 */

const STORAGE_KEY = "onicord_game_playtime_v1";
const LEGACY_CATALOG_NAMES = new Set(["Arcade", "Onicord Arcade", "Cinema"]);

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
        LEGACY_CATALOG_NAMES.has(key) ||
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
 * @param {boolean} isCatalog
 */
export function addPlaytime(gameName, addedSeconds, cover = null, type = "game", isCatalog = false) {
  if (
    !gameName ||
    addedSeconds <= 0 ||
    type === "launcher" ||
    isCatalog === true
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
    // Dispatch event so any mounted widgets refresh their live stats
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
 * Formats a timestamp into a fuzzy relative date string (e.g. "Today", "Yesterday", "3 days ago").
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
 * Global playtime tracking initializer.
 * Runs at the application root to continuously accumulate gameplay duration across all views.
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
    // 1. Flush accumulated elapsed time for the previous game before switching
    flushElapsed();

    const isIgnored =
      !activity ||
      !activity.name ||
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

    // 2. If already tracking this exact game, keep timer running without resetting
    if (currentActive && currentActive.name === activity.name) {
      if (activity.cover && !currentActive.cover) currentActive.cover = activity.cover;
      if (activity.type && !currentActive.type) currentActive.type = activity.type;
      return;
    }

    // 3. Begin tracking newly activated game
    currentActive = { ...activity };
    lastTimestamp = Date.now();

    // Flush elapsed time periodically every 5 seconds
    if (!interval) {
      interval = setInterval(() => {
        flushElapsed();
      }, 5000);
    }
  };

  // Query initial activity state
  api.getCurrentGame?.().then((game) => {
    if (game?.name) handleActivityChange(game);
  });

  // Subscribe to game activity updates
  const unsub = api.onGameActivityChanged?.((game) => {
    handleActivityChange(game);
  });

  // Flush playtime on window reload or unload
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
