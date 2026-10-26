import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";

const StreamerModeContext = createContext(null);

const STORAGE_KEY_AUTO = "onicord_streamer_mode_auto";
const STORAGE_KEY_MANUAL = "onicord_streamer_mode_manual";

export function StreamerModeProvider({ children }) {
  const [autoEnabled, setAutoEnabledState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_AUTO);
      return saved !== null ? saved === "true" : true;
    } catch {
      return true;
    }
  });

  const [manualActive, setManualActiveState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MANUAL);
      return saved === "true";
    } catch {
      return false;
    }
  });

  const [detectedState, setDetectedState] = useState({
    active: false,
    app: null,
  });

  const setAutoEnabled = useCallback((enabled) => {
    const val = Boolean(enabled);
    setAutoEnabledState(val);
    try {
      localStorage.setItem(STORAGE_KEY_AUTO, String(val));
    } catch {}
  }, []);

  const setManualActive = useCallback((active) => {
    const val = Boolean(active);
    setManualActiveState(val);
    try {
      localStorage.setItem(STORAGE_KEY_MANUAL, String(val));
    } catch {}
  }, []);

  const toggleManual = useCallback(() => {
    setManualActiveState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY_MANUAL, String(next));
      } catch {}
      return next;
    });
  }, []);

  // Escuchar detección periódica de procesos de OBS / streaming desde Electron
  useEffect(() => {
    let isMounted = true;

    if (window.electronAPI?.getStreamerStatus) {
      window.electronAPI.getStreamerStatus().then((status) => {
        if (isMounted && status) {
          setDetectedState({
            active: Boolean(status.active),
            app: status.app || null,
          });
        }
      }).catch(console.error);
    }

    const unsub = window.electronAPI?.onStreamerModeDetected?.((data) => {
      if (isMounted && data) {
        setDetectedState({
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

  // Modo streamer está activo si el usuario lo forzó manualmente O si está en auto y se detectó OBS
  const isStreamerMode = useMemo(() => {
    return Boolean(manualActive || (autoEnabled && detectedState.active));
  }, [manualActive, autoEnabled, detectedState.active]);

  // Disparar evento global para que componentes no-React (ej. notificationManager) puedan consultar
  useEffect(() => {
    window.__ONICORD_STREAMER_MODE__ = isStreamerMode;
    window.dispatchEvent(
      new CustomEvent("onicord:streamer-mode-changed", {
        detail: {
          active: isStreamerMode,
          app: detectedState.app,
          isManual: manualActive,
        },
      })
    );
  }, [isStreamerMode, detectedState.app, manualActive]);

  const maskSensible = useCallback(
    (text, placeholder = "••••••••") => {
      if (!isStreamerMode) return text;
      return placeholder;
    },
    [isStreamerMode]
  );

  const value = useMemo(
    () => ({
      isStreamerMode,
      isDetected: detectedState.active,
      detectedApp: detectedState.app,
      autoEnabled,
      manualActive,
      setAutoEnabled,
      setManualActive,
      toggleManual,
      maskSensible,
    }),
    [
      isStreamerMode,
      detectedState.active,
      detectedState.app,
      autoEnabled,
      manualActive,
      setAutoEnabled,
      setManualActive,
      toggleManual,
      maskSensible,
    ]
  );

  return (
    <StreamerModeContext.Provider value={value}>
      {children}
    </StreamerModeContext.Provider>
  );
}

export function useStreamerMode() {
  const ctx = useContext(StreamerModeContext);
  if (!ctx) {
    return {
      isStreamerMode: Boolean(window.__ONICORD_STREAMER_MODE__),
      isDetected: false,
      detectedApp: null,
      autoEnabled: true,
      manualActive: false,
      setAutoEnabled: () => {},
      setManualActive: () => {},
      toggleManual: () => {},
      maskSensible: (t, p = "••••••••") => (window.__ONICORD_STREAMER_MODE__ ? p : t),
    };
  }
  return ctx;
}
