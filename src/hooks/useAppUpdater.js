import { useEffect, useRef } from "react";
import { notificationManager } from "../lib/notificationManager";

export function useAppUpdater() {
  const hasNotifiedRef = useRef(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const handleUpdate = (version) => {
      if (!version || hasNotifiedRef.current) return;
      hasNotifiedRef.current = true;
      notificationManager.notifyUpdateAvailable(version);
    };

    // 1. Listen for push events from Electron update service
    const unsubscribe = api.onUpdateStatus?.((data) => {
      if (data?.status === "available" && data?.version) {
        handleUpdate(data.version);
      }
    });

    // 2. Guaranteed initial update check 4 seconds after launch
    const timer = setTimeout(async () => {
      if (api.checkForUpdates) {
        try {
          const res = await api.checkForUpdates();
          if (res?.status === "ok" && res?.updateInfo?.version) {
            handleUpdate(res.updateInfo.version);
          }
        } catch (err) {
          console.warn("[AppUpdater] Initial update check failed:", err);
        }
      }
    }, 4000);

    // 3. Periodic check every 2 hours while application remains open
    const interval = setInterval(async () => {
      if (api.checkForUpdates) {
        try {
          const res = await api.checkForUpdates();
          if (res?.status === "ok" && res?.updateInfo?.version) {
            handleUpdate(res.updateInfo.version);
          }
        } catch (_) {}
      }
    }, 2 * 60 * 60 * 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);
}

