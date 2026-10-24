import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { notificationManager } from "../../lib/notificationManager";
import FlameBadge from "../ui/FlameBadge";
import MaterialIcon from "../icons/MaterialIcon";
import Select from "../ui/Select";
import { updateAppBadge } from "../../lib/badgeIconGenerator";

export default function DevSandboxTab({ profile, onProfileChange, servers = [], activeServerId = null }) {
  const { t } = useTranslation();
  
  const initialServer = servers.find((s) => s.id === activeServerId) || servers[0];
  const [selectedServerId, setSelectedServerId] = useState(
    initialServer ? (initialServer.roomCode || initialServer.id) : ""
  );
  
  const [flameDays, setFlameDays] = useState(0);
  const [highestDays, setHighestDays] = useState(0);
  const [exportingLogs, setExportingLogs] = useState(false);
  const [allowLocalStreamExpand, setAllowLocalStreamExpand] = useState(
    () => localStorage.getItem("onicord_dev_allow_local_stream_expand") === "true"
  );

  const handleSaveAllUserLogs = async () => {
    if (exportingLogs) return;
    setExportingLogs(true);
    try {
      if (window.electronAPI?.exportAllUserLogs) {
        const result = await window.electronAPI.exportAllUserLogs();
        if (result && result.success) {
          notificationManager.showToast(
            "OniDiag",
            `Logs guardados exitosamente (${result.count} archivo(s) en /logs/)`,
            "success"
          );
        } else {
          notificationManager.showToast("OniDiag", result?.error || "Error al guardar logs", "danger");
        }
      } else {
        notificationManager.showToast("Error", "API de logs no disponible", "danger");
      }
    } catch (err) {
      console.error("Error al exportar logs:", err);
      notificationManager.showToast("Error", "Falló la exportación de logs", "danger");
    } finally {
      setExportingLogs(false);
    }
  };

  useEffect(() => {
    const userFlame = profile?.flame || {};
    const serverFlame = (userFlame && typeof userFlame === "object" && !("currentStreak" in userFlame))
      ? (userFlame[selectedServerId] || {})
      : userFlame;

    setFlameDays(serverFlame.currentStreak || 0);
    setHighestDays(serverFlame.highestStreak || serverFlame.currentStreak || 0);
  }, [selectedServerId, profile?.flame]);

  const handleApplyUserFlame = async (days) => {
    if (!selectedServerId) {
      notificationManager.showToast("Error", "No server selected", "danger");
      return;
    }

    setFlameDays(days);
    const newHighest = Math.max(highestDays, days);
    setHighestDays(newHighest);

    const userFlame = profile?.flame || {};
    const isMap = userFlame && typeof userFlame === "object" && !("currentStreak" in userFlame);

    const updatedServerFlame = {
      currentStreak: days,
      highestStreak: newHighest,
      lastInteractionDate: new Date().toISOString().split("T")[0],
      serverId: selectedServerId,
    };

    const updatedFlameMap = isMap
      ? { ...userFlame, [selectedServerId]: updatedServerFlame }
      : { ...userFlame, [selectedServerId]: updatedServerFlame };

    delete updatedFlameMap.currentStreak;
    delete updatedFlameMap.highestStreak;
    delete updatedFlameMap.lastInteractionDate;
    delete updatedFlameMap.serverId;

    const updatedProfile = {
      ...profile,
      flame: updatedFlameMap,
    };

    if (window.electronAPI?.saveProfile) {
      await window.electronAPI.saveProfile(updatedProfile);
    }
    if (onProfileChange) onProfileChange(updatedProfile);
  };

  const handleTriggerToast = (type) => {
    if (type === "success") notificationManager.showToast("Success", "Operation completed successfully", "success");
    if (type === "info") notificationManager.showToast("Information", "System informative notification", "info");
    if (type === "warning") notificationManager.showToast("Warning", "Potentially dangerous action", "warning");
    if (type === "danger") notificationManager.showToast("Error", "Critical error processing request", "danger");
  };

  const [testingOSNotif, setTestingOSNotif] = useState(false);

  const handleTriggerOSNotif = async () => {
    if (testingOSNotif) return;
    setTestingOSNotif(true);
    try {
      const res = await notificationManager.notifySystem(
        t("settings.devSandbox.testNotifTitle", "Onicord Dev Sandbox"),
        t("settings.devSandbox.testNotifBody", "This is a test of a native operating system notification.")
      );
      if (res && res.success === false) {
        notificationManager.showToast(
          "OniDiag",
          t("settings.devSandbox.notifNotSupported", "Notification.isSupported() returned false or notification failed"),
          "danger"
        );
      } else {
        notificationManager.showToast(
          "OniDiag",
          t("settings.devSandbox.notifDispatched", "Native OS notification sent successfully"),
          "success"
        );
      }
    } catch (err) {
      console.error("Error triggering OS notification:", err);
      notificationManager.showToast("Error", err.message || "Failed to trigger OS notification", "danger");
    } finally {
      setTimeout(() => setTestingOSNotif(false), 1000);
    }
  };

  const handlePlaySound = (soundName) => {
    notificationManager.playSound(soundName);
  };

  return (
    <div className="onicord-settings-container">
      {/* BANNER AVISO DEV */}
      <div className="onicord-settings-card bg-amber-500/10 border-amber-500/30 flex items-center gap-3.5 p-4">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
          <MaterialIcon name="developer_mode" size={24} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-amber-300">
            {t("settings.devSandbox.title", "Entorno Sandbox de Desarrollo")}
          </h3>
          <p className="text-xs text-onicord-muted leading-relaxed mt-0.5">
            {t("settings.devSandbox.subtitle", "Esta pestaña solo es visible en modo desarrollo. Permite probar notificaciones, flamas e IPC en tiempo real.")}
          </p>
        </div>
      </div>

      {/* TARJETA 1: PROBADOR DE FLAMAS */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between">
          <h3 className="onicord-settings-section-title !mb-0">
            <span>{t("settings.devSandbox.flamesTitle", "Simulador de Flamas por Servidor")}</span>
          </h3>
          <FlameBadge days={flameDays} size="md" />
        </div>
        <p className="onicord-settings-row-desc">
          {t("settings.devSandbox.flamesDesc", "Prueba el progreso visual de la racha de flamas en los badges de perfil.")}
        </p>

        {servers.length > 0 && (
          <div className="flex items-center gap-3 pt-2">
            <span className="text-xs font-semibold text-onicord-muted shrink-0">
              {t("settings.devSandbox.targetServer", "Servidor Objetivo:")}
            </span>
            <Select
              value={selectedServerId}
              onChange={(e) => setSelectedServerId(e.target.value)}
              className="flex-1"
              options={servers.map((s) => ({
                value: s.roomCode || s.id,
                label: s.name,
              }))}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
          {[0, 1, 5, 10, 20, 35, 65].map((d) => (
            <button
              key={d}
              onClick={() => handleApplyUserFlame(d)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                flameDays === d
                  ? "bg-onicord-accent text-onicord-dark border-onicord-accent font-bold"
                  : "bg-onicord-base/60 text-onicord-text border-white/10 hover:bg-white/10"
              }`}
            >
              {t("settings.devSandbox.set", "Fijar")} {d}d
            </button>
          ))}
        </div>
      </div>

      {/* TARJETA 2: PROBADOR DE TOASTS */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.devSandbox.toastTitle", "Notificaciones Toast In-App")}</span>
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <button
            onClick={() => handleTriggerToast("success")}
            className="px-3 py-2 rounded-xl bg-onicord-success/20 text-onicord-success border border-onicord-success/30 hover:bg-onicord-success/30 text-xs font-bold transition-all cursor-pointer"
          >
            {t("common.success", "Éxito")}
          </button>
          <button
            onClick={() => handleTriggerToast("info")}
            className="px-3 py-2 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-500/30 hover:bg-sky-500/30 text-xs font-bold transition-all cursor-pointer"
          >
            {t("common.info", "Información")}
          </button>
          <button
            onClick={() => handleTriggerToast("warning")}
            className="px-3 py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 text-xs font-bold transition-all cursor-pointer"
          >
            {t("common.warning", "Advertencia")}
          </button>
          <button
            onClick={() => handleTriggerToast("danger")}
            className="px-3 py-2 rounded-xl bg-onicord-danger/20 text-onicord-danger border border-onicord-danger/30 hover:bg-onicord-danger/30 text-xs font-bold transition-all cursor-pointer"
          >
            {t("common.error", "Error")}
          </button>
        </div>
      </div>

      {/* TARJETA 3: NOTIFICACIONES DE SISTEMA Y EFECTOS DE SONIDO */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.devSandbox.systemNotifTitle", "Notificaciones del Sistema y Sonidos")}</span>
        </h3>

        <div className="space-y-3">
          <button
            onClick={handleTriggerOSNotif}
            disabled={testingOSNotif}
            className="px-3.5 py-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 text-xs font-bold transition-all cursor-pointer flex items-center gap-2 active:scale-95 disabled:opacity-50"
          >
            <MaterialIcon name="desktop_windows" size={16} />
            <span>
              {testingOSNotif
                ? t("common.sending", "Enviando...")
                : t("settings.devSandbox.launchNotif", "Lanzar Notificación Nativa del Sistema Operativo")}
            </span>
          </button>

          <div className="pt-2 border-t border-white/5">
            <span className="text-[11px] font-semibold text-onicord-muted block mb-2">
              {t("settings.devSandbox.soundTestTitle", "Prueba de Sonidos de Interfaz:")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {["join", "leave", "mute", "unmute", "deaf", "undeaf", "message", "notification"].map((snd) => (
                <button
                  key={snd}
                  onClick={() => handlePlaySound(snd)}
                  className="px-2.5 py-1.5 rounded-lg bg-onicord-base hover:bg-onicord-overlay border border-white/10 text-xs font-mono text-onicord-muted transition-colors cursor-pointer capitalize"
                >
                  {snd}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* TARJETA 4: DIAGNÓSTICO ONIDIAG */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between gap-4">
          <h3 className="onicord-settings-section-title !mb-0">
            <span>{t("settings.devSandbox.diagTitle", "Diagnóstico P2P y Exportación OniDiag")}</span>
          </h3>
          <button
            disabled={exportingLogs}
            onClick={handleSaveAllUserLogs}
            className="px-3.5 py-1.5 rounded-xl bg-onicord-accent hover:opacity-90 text-onicord-dark text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <MaterialIcon name={exportingLogs ? "sync" : "download"} size={14} className={exportingLogs ? "animate-spin" : ""} />
            <span>
              {exportingLogs
                ? t("common.saving", "Guardando...")
                : t("settings.devSandbox.saveLogs", "Guardar todos los Logs locales")}
            </span>
          </button>
        </div>
        <p className="onicord-settings-row-desc mt-2">
          {t("settings.devSandbox.diagHelp", "Recopila y guarda un archivo JSON independiente para el usuario local y para cada peer conectado en la carpeta /logs/.")}
        </p>
      </div>

      {/* TARJETA 5: CONFIGURACIÓN TRANSMISIÓN PROPIA */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="onicord-settings-section-title !mb-0">
              <span>{t("settings.devSandbox.localStreamExpandTitle", "Ver Transmisión Propia en Pantalla Grande")}</span>
            </h3>
            <p className="onicord-settings-row-desc mt-1">
              {t("settings.devSandbox.localStreamExpandDesc", "Permite expandir y maximizar tu propia transmisión de pantalla a vista completa en lugar de restringirse solo a la ventana flotante PiP.")}
            </p>
          </div>
          <input
            type="checkbox"
            checked={allowLocalStreamExpand}
            onChange={(e) => {
              const checked = e.target.checked;
              setAllowLocalStreamExpand(checked);
              localStorage.setItem("onicord_dev_allow_local_stream_expand", String(checked));
              notificationManager.showToast(
                "Developer",
                checked
                  ? t("settings.devSandbox.localStreamEnabledToast", "Transmisión propia en pantalla grande activada")
                  : t("settings.devSandbox.localStreamDisabledToast", "Transmisión propia limitada a ventana PiP"),
                "info"
              );
            }}
            className="toggle toggle-primary shrink-0"
          />
        </div>
      </div>

      {/* TARJETA 6: PRUEBA DE INSIGNIA / BADGE EN BARRA DE TAREAS */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.devSandbox.badgeTestTitle", "Insignia de Notificación en Barra de Tareas (Overlay Badge)")}</span>
        </h3>
        <p className="onicord-settings-row-desc -mt-2">
          {t("settings.devSandbox.badgeTestDesc", "Prueba el contador de mensajes sin leer sobre el icono de la app en Windows (setOverlayIcon), macOS Dock y título de pestaña.")}
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              updateAppBadge(1);
              window.dispatchEvent(new CustomEvent("onicord:test-unread", { detail: { count: 1 } }));
              notificationManager.showToast("Badge", "Insignia establecida en 1", "info");
            }}
            className="px-3 py-1.5 rounded-xl bg-onicord-base hover:bg-white/10 text-white border border-white/10 text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
          >
            <span className="w-2 h-2 rounded-full bg-onicord-danger" />
            <span>Badge: 1</span>
          </button>

          <button
            type="button"
            onClick={() => {
              updateAppBadge(5);
              window.dispatchEvent(new CustomEvent("onicord:test-unread", { detail: { count: 5 } }));
              notificationManager.showToast("Badge", "Insignia establecida en 5", "info");
            }}
            className="px-3 py-1.5 rounded-xl bg-onicord-base hover:bg-white/10 text-white border border-white/10 text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
          >
            <span className="w-2 h-2 rounded-full bg-onicord-danger" />
            <span>Badge: 5</span>
          </button>

          <button
            type="button"
            onClick={() => {
              updateAppBadge(9);
              window.dispatchEvent(new CustomEvent("onicord:test-unread", { detail: { count: 9 } }));
              notificationManager.showToast("Badge", "Insignia establecida en 9", "info");
            }}
            className="px-3 py-1.5 rounded-xl bg-onicord-base hover:bg-white/10 text-white border border-white/10 text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
          >
            <span className="w-2 h-2 rounded-full bg-onicord-danger" />
            <span>Badge: 9</span>
          </button>

          <button
            type="button"
            onClick={() => {
              updateAppBadge(15);
              window.dispatchEvent(new CustomEvent("onicord:test-unread", { detail: { count: 15 } }));
              notificationManager.showToast("Badge", "Insignia establecida en +9", "info");
            }}
            className="px-3.5 py-1.5 rounded-xl bg-onicord-danger/20 hover:bg-onicord-danger/30 text-onicord-danger border border-onicord-danger/40 text-xs font-bold cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
          >
            <span className="w-2 h-2 rounded-full bg-onicord-danger" />
            <span>Badge: +9</span>
          </button>

          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem("onicord_unreads");
                localStorage.setItem("onicord_unreads", "{}");
              } catch (_) {}
              updateAppBadge(0);
              window.dispatchEvent(new CustomEvent("onicord:test-unread", { detail: { reset: true } }));
              notificationManager.showToast("Badge", "Insignia limpiada (0)", "success");
            }}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-onicord-muted hover:text-white border border-white/5 text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-all active:scale-95"
          >
            <MaterialIcon name="cleaning_services" size={14} />
            <span>Limpiar (0)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
