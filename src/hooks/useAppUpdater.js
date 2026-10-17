import { useEffect, useRef } from "react";
import { notificationManager } from "../lib/notificationManager";

export function useAppUpdater() {
  const hasCheckedRef = useRef(false);
  const hasNotifiedRef = useRef(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onUpdateStatus) return;

    const unsubscribe = api.onUpdateStatus((data) => {
      if (data?.status === "available" && data?.version && !hasNotifiedRef.current) {
        hasNotifiedRef.current = true;
        notificationManager.notifyUpdateAvailable(data.version);
      }
    });

    const timer = setTimeout(() => {
      if (!hasCheckedRef.current && api?.checkForUpdates) {
        hasCheckedRef.current = true;
        api.checkForUpdates().catch((err) => {
          console.warn("[AppUpdater] Initial update check failed:", err);
        });
      }
    }, 3000);

    return () => {
      clearTimeout(timer);
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);
}
