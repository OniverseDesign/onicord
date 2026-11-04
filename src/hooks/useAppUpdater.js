import { useEffect, useRef } from "react";
import { notificationManager } from "../lib/notificationManager";

export function useAppUpdater() {
  const hasNotifiedAppRef = useRef(false);
  const hasNotifiedDownloadedRef = useRef(false);
  const hasCheckedPluginsRef = useRef(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    // 1. Listen for push events from Electron update service
    const unsubscribe = api.onUpdateStatus?.((data) => {
      if (data?.status === "downloaded" && data?.version) {
        if (!hasNotifiedDownloadedRef.current) {
          hasNotifiedDownloadedRef.current = true;
          notificationManager.notifyUpdateDownloaded(data.version);
        }
      } else if (data?.status === "available" && data?.version && data?.isPortable) {
        if (!hasNotifiedAppRef.current) {
          hasNotifiedAppRef.current = true;
          notificationManager.notifyUpdateAvailable(data.version);
        }
      }
    });

    // 2. Guaranteed initial app update check 4 seconds after launch
    const timer = setTimeout(async () => {
      if (api.checkForUpdates) {
        try {
          const res = await api.checkForUpdates();
          if (res?.status === "ok" && res?.updateInfo?.version && res?.updateInfo?.isPortable) {
            if (!hasNotifiedAppRef.current) {
              hasNotifiedAppRef.current = true;
              notificationManager.notifyUpdateAvailable(res.updateInfo.version);
            }
          }
        } catch (err) {
          console.warn("[AppUpdater] Initial update check failed:", err);
        }
      }
    }, 4000);

    // 3. Periodic app update check every 2 hours
    const interval = setInterval(async () => {
      if (api.checkForUpdates) {
        try {
          await api.checkForUpdates();
        } catch (_) {}
      }
    }, 2 * 60 * 60 * 1000);

    // 4. Background Plugin (Addon) Updates Check
    const checkPluginUpdatesRoutine = async () => {
      if (!api.checkPluginUpdates) return;
      try {
        const result = await api.checkPluginUpdates();
        if (result?.success && Array.isArray(result.updates) && result.updates.length > 0) {
          // Check if auto-update is allowed from profile
          let autoUpdate = true;
          if (api.getProfile) {
            try {
              const prof = await api.getProfile();
              if (prof?.general?.autoUpdatePlugins === false) {
                autoUpdate = false;
              }
            } catch (_) {}
          }

          if (autoUpdate && api.updateAllPlugins) {
            const updateRes = await api.updateAllPlugins();
            if (updateRes?.success && updateRes.updatedCount > 0) {
              notificationManager.showToast(
                "Complementos actualizados",
                `Se han actualizado automáticamente ${updateRes.updatedCount} complemento(s) a su última versión.`,
                "info",
                10000,
                { type: "open_settings", section: "plugins" }
              );
            }
          } else {
            notificationManager.showToast(
              "Actualización de complementos",
              `Hay ${result.updates.length} complemento(s) con actualizaciones disponibles.`,
              "info",
              10000,
              { type: "open_settings", section: "plugins" }
            );
          }
        }
      } catch (err) {
        console.warn("[AppUpdater] Error en verificación de complementos:", err);
      }
    };

    const pluginTimer = setTimeout(() => {
      if (!hasCheckedPluginsRef.current) {
        hasCheckedPluginsRef.current = true;
        checkPluginUpdatesRoutine();
      }
    }, 8000);

    const pluginInterval = setInterval(checkPluginUpdatesRoutine, 4 * 60 * 60 * 1000);

    return () => {
      clearTimeout(timer);
      clearTimeout(pluginTimer);
      clearInterval(interval);
      clearInterval(pluginInterval);
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);
}
