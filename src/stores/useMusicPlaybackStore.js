import { create } from "zustand";

function formatPlaybackSeconds(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Atomic playback progress store for the global music player.
 * Isolates high-frequency `timeupdate` ticks from MusicContext, MusicIsland, and MusicPlayerWidget.
 */
export const useMusicPlaybackStore = create((set) => ({
  currentTimeSec: 0,
  currentTimeFormatted: "0:00",
  durationSec: 0,
  progressPercent: 0,

  setPlaybackProgress: (currentSec, durationSec) => {
    const safeCur = Number.isFinite(currentSec) && currentSec >= 0 ? currentSec : 0;
    const safeDur = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 0;
    const nextPercent = safeDur > 0 ? Math.min(100, Math.max(0, (safeCur / safeDur) * 100)) : 0;
    const nextFormatted = formatPlaybackSeconds(safeCur);

    set((state) => {
      if (
        state.currentTimeFormatted === nextFormatted &&
        Math.abs(state.progressPercent - nextPercent) < 0.25 &&
        state.durationSec === safeDur
      ) {
        return state;
      }
      return {
        currentTimeSec: safeCur,
        currentTimeFormatted: nextFormatted,
        durationSec: safeDur,
        progressPercent: nextPercent,
      };
    });
  },

  resetPlayback: () => {
    set((state) => {
      if (
        state.currentTimeSec === 0 &&
        state.currentTimeFormatted === "0:00" &&
        state.durationSec === 0 &&
        state.progressPercent === 0
      ) {
        return state;
      }
      return {
        currentTimeSec: 0,
        currentTimeFormatted: "0:00",
        durationSec: 0,
        progressPercent: 0,
      };
    });
  },
}));
