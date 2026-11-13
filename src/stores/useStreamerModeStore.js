import { create } from "zustand";
import { persist } from "zustand/middleware";

function notifyStreamerModeChange(isStreamerMode, app, isManual) {
  if (typeof window !== "undefined") {
    window.__ONICORD_STREAMER_MODE__ = isStreamerMode;
    window.dispatchEvent(
      new CustomEvent("onicord:streamer-mode-changed", {
        detail: {
          active: isStreamerMode,
          app,
          isManual,
        },
      })
    );
  }
}

export const useStreamerModeStore = create(
  persist(
    (set, get) => ({
      autoEnabled: true,
      manualActive: false,
      detectedActive: false,
      detectedApp: null,
      isStreamerMode: false,

      setAutoEnabled: (enabled) => {
        const val = Boolean(enabled);
        set((state) => {
          const isStreamerMode = Boolean(state.manualActive || (val && state.detectedActive));
          notifyStreamerModeChange(isStreamerMode, state.detectedApp, state.manualActive);
          return { autoEnabled: val, isStreamerMode };
        });
      },

      setManualActive: (active) => {
        const val = Boolean(active);
        set((state) => {
          const isStreamerMode = Boolean(val || (state.autoEnabled && state.detectedActive));
          notifyStreamerModeChange(isStreamerMode, state.detectedApp, val);
          return { manualActive: val, isStreamerMode };
        });
      },

      toggleManual: () => {
        set((state) => {
          const nextManual = !state.manualActive;
          const isStreamerMode = Boolean(nextManual || (state.autoEnabled && state.detectedActive));
          notifyStreamerModeChange(isStreamerMode, state.detectedApp, nextManual);
          return { manualActive: nextManual, isStreamerMode };
        });
      },

      setDetectedStatus: ({ active, app }) => {
        const detActive = Boolean(active);
        const detApp = app || null;
        set((state) => {
          const isStreamerMode = Boolean(state.manualActive || (state.autoEnabled && detActive));
          notifyStreamerModeChange(isStreamerMode, detApp, state.manualActive);
          return {
            detectedActive: detActive,
            detectedApp: detApp,
            isStreamerMode,
          };
        });
      },

      maskSensible: (text, placeholder = "••••••••") => {
        return get().isStreamerMode ? placeholder : text;
      },
    }),
    {
      name: "onicord_streamer_mode_store",
      partialize: (state) => ({
        autoEnabled: state.autoEnabled,
        manualActive: state.manualActive,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isStreamerMode = Boolean(
            state.manualActive || (state.autoEnabled && state.detectedActive)
          );
          notifyStreamerModeChange(
            state.isStreamerMode,
            state.detectedApp,
            state.manualActive
          );
        }
      },
    }
  )
);
