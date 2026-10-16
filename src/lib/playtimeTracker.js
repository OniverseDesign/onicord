/**
 * Service to track, aggregate, and store game playtime based on Rich Presence activity.
 */

const STORAGE_KEY = "onicord_game_playtime_v1";

/**
 * Reads all stored game playtime records from localStorage.
 * @returns {Record<string, { name: string, cover: string|null, totalSeconds: number, lastPlayed: number }>}
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
 */
export function addPlaytime(gameName, addedSeconds, cover = null) {
  if (!gameName || addedSeconds <= 0) return;

  try {
    const current = getPlaytimeData();
    const existing = current[gameName] || {
      name: gameName,
      cover: cover || null,
      totalSeconds: 0,
      lastPlayed: Date.now(),
    };

    const nextTotal = (existing.totalSeconds || 0) + addedSeconds;
    current[gameName] = {
      ...existing,
      name: gameName,
      cover: cover || existing.cover || null,
      totalSeconds: nextTotal,
      lastPlayed: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
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
