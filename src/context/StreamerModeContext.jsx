import React, { createContext, useContext, useEffect } from "react";
import { useStreamerModeStore } from "../stores/useStreamerModeStore";

const StreamerModeContext = createContext(null);

export function StreamerModeProvider({ children }) {
  useEffect(() => {
    let isMounted = true;

    if (window.electronAPI?.getStreamerStatus) {
      window.electronAPI
        .getStreamerStatus()
        .then((status) => {
          if (isMounted && status) {
            useStreamerModeStore.getState().setDetectedStatus({
              active: Boolean(status.active),
              app: status.app || null,
            });
          }
        })
        .catch(console.error);
    }

    const unsub = window.electronAPI?.onStreamerModeDetected?.((data) => {
      if (isMounted && data) {
        useStreamerModeStore.getState().setDetectedStatus({
          active: Boolean(data.active),
          app: data.app || null,
        });
      }
    });

    return () => {
      isMounted = false;
      unsub?.();
    };
  }, []);

  return (
    <StreamerModeContext.Provider value={null}>
      {children}
    </StreamerModeContext.Provider>
  );
}

export function useStreamerMode() {
  const isStreamerMode = useStreamerModeStore((s) => s.isStreamerMode);
  const isDetected = useStreamerModeStore((s) => s.detectedActive);
  const detectedApp = useStreamerModeStore((s) => s.detectedApp);
  const autoEnabled = useStreamerModeStore((s) => s.autoEnabled);
  const manualActive = useStreamerModeStore((s) => s.manualActive);
  const setAutoEnabled = useStreamerModeStore((s) => s.setAutoEnabled);
  const setManualActive = useStreamerModeStore((s) => s.setManualActive);
  const toggleManual = useStreamerModeStore((s) => s.toggleManual);
  const maskSensible = useStreamerModeStore((s) => s.maskSensible);

  return {
    isStreamerMode,
    isDetected,
    detectedApp,
    autoEnabled,
    manualActive,
    setAutoEnabled,
    setManualActive,
    toggleManual,
    maskSensible,
  };
}
