import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import Select from "../ui/Select";
import { notificationManager } from "../../lib/notificationManager";

const CATEGORY_KEYS = [
  {
    id: "profile",
    icon: "person",
  },
  {
    id: "servers",
    icon: "dns",
  },
  {
    id: "addons",
    icon: "extension",
  },
  {
    id: "stickers",
    icon: "sticky_note_2",
  },
];

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(isoString) {
  if (!isoString) return "";
  try {
    return new Intl.DateTimeFormat("es", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

// ─── STATUS CARD ──────────────────────────────────────────────────────────────
function ConnectionCard({ isConnected, user, onConnect, onDisconnect, connecting }) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [user?.picture]);

  return (
    <div className="onicord-settings-card">
      <div className="flex items-center justify-between gap-3">
        <h3 className="onicord-settings-section-title flex items-center gap-2">
          {t("settings.cloudBackup.title", "Google Drive")}
        </h3>
      </div>

      {isConnected ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 shrink-0 bg-onicord-base/60 flex items-center justify-center shadow-inner">
              {user?.picture && !imgError ? (
                <img
                  src={user.picture}
                  alt={user.name || user.email || "Google Profile"}
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <MaterialIcon name="account_circle" size={26} className="text-onicord-accent" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {user?.email || t("settings.cloudBackup.googleAccount", "Cuenta de Google")}
              </p>
              <p className="text-[11px] text-onicord-muted mt-0.5">
                {t("settings.cloudBackup.statusConnected", "Drive conectado · Carpeta privada de Onicord")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDisconnect}
            className="text-xs font-semibold text-red-400 hover:text-red-300 border border-red-400/20 hover:border-red-300/30 bg-red-400/5 hover:bg-red-400/10 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            {t("settings.cloudBackup.disconnect", "Desconectar")}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <p className="onicord-settings-row-desc mb-4">
            {t("settings.cloudBackup.connectDesc", "Conecta tu cuenta de Google para hacer backups de tu perfil, servidores y más. Los datos se guardan en una carpeta privada de tu Drive (solo Onicord puede verla).")}
          </p>
          <button
            type="button"
            onClick={onConnect}
            disabled={connecting}
            className="flex items-center gap-2.5 px-4 py-2.5 bg-white hover:bg-gray-100 text-gray-800 font-semibold text-sm rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {connecting ? (
              <span className="w-4 h-4 border-2 border-gray-400 border-t-gray-800 rounded-full animate-spin" />
            ) : (
              <GoogleLogo />
            )}
            {connecting
              ? t("settings.cloudBackup.connecting", "Abriendo Google...")
              : t("settings.cloudBackup.connectBtn", "Conectar con Google Drive")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── BACKUP CARD ──────────────────────────────────────────────────────────────
function BackupCard({ selectedCats, onToggleCat, estimatedSize, onBackup, progress }) {
  const { t } = useTranslation();

  return (
    <div className="onicord-settings-card">
      <h3 className="onicord-settings-section-title flex items-center gap-2">
        {t("settings.cloudBackup.createBackupTitle", "Crear Backup")}
      </h3>

      <p className="onicord-settings-row-desc mb-4">
        {t("settings.cloudBackup.createBackupDesc", "Selecciona qué incluir en el backup. Los datos se comprimen en un ZIP y se suben a tu Drive.")}
      </p>

      <div className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-onicord-base/20 mb-5">
        {CATEGORY_KEYS.map((cat) => {
          const isSelected = selectedCats.includes(cat.id);
          const label = t(`settings.cloudBackup.categories.${cat.id}`, cat.id);
          const desc = t(`settings.cloudBackup.categories.${cat.id}Desc`, "");

          return (
            <div
              key={cat.id}
              className="flex items-center justify-between p-3.5 hover:bg-white/[0.02] transition-colors"
            >
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{label}</span>
                </div>
                <p className="text-[11px] text-onicord-muted mt-0.5 leading-relaxed">{desc}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleCat(cat.id)}
                  className="sr-only peer"
                />
                <div className="onicord-toggle-slider" />
              </label>
            </div>
          );
        })}
      </div>

      {/* Tamaño estimado */}
      <div className="flex items-center justify-between mb-4 p-2.5 rounded-lg bg-onicord-base/40 border border-white/5">
        <span className="text-xs text-onicord-muted">
          {t("settings.cloudBackup.estimatedSize", "Tamaño estimado")}
        </span>
        <span className="text-xs font-bold text-white font-mono">{formatBytes(estimatedSize)}</span>
      </div>

      {/* Progress */}
      {progress && (
        <div className="mb-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-onicord-muted">
            <span>{progress.step}</span>
            <span className="font-mono font-bold text-onicord-accent">{progress.percent}%</span>
          </div>
          <div className="h-1.5 w-full bg-onicord-base/60 rounded-full overflow-hidden">
            <div
              className="h-full bg-onicord-accent rounded-full transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onBackup}
        disabled={selectedCats.length === 0 || !!progress}
        className="onicord-btn-primary w-full flex items-center justify-center gap-2 cursor-pointer"
      >
        {progress
          ? t("settings.cloudBackup.uploading", "Subiendo...")
          : t("settings.cloudBackup.backupNow", "Hacer Backup Ahora")}
      </button>
    </div>
  );
}

// ─── AUTO BACKUP OPTIONS CARD ─────────────────────────────────────────────────
function AutoBackupCard({ settings, onUpdateSettings }) {
  const { t } = useTranslation();

  const handleToggleAuto = () => {
    onUpdateSettings({ autoBackupEnabled: !settings.autoBackupEnabled });
  };

  const handleToggleReplace = () => {
    onUpdateSettings({ replacePrevious: !settings.replacePrevious });
  };

  const handleFrequencyChange = (e) => {
    onUpdateSettings({ frequency: e.target.value });
  };

  return (
    <div className="onicord-settings-card">
      <h3 className="onicord-settings-section-title flex items-center gap-2">
        {t("settings.cloudBackup.autoBackupTitle", "Programación y Opciones")}
      </h3>

      <div className="divide-y divide-white/5 border border-white/5 rounded-xl overflow-hidden bg-onicord-base/20">
        {/* Switch: Backups automáticos */}
        <div className="flex items-center justify-between p-3.5 hover:bg-white/[0.02] transition-colors">
          <div className="min-w-0 pr-4">
            <p className="text-sm font-semibold text-white">
              {t("settings.cloudBackup.autoBackupEnabled", "Backups automáticos")}
            </p>
            <p className="text-[11px] text-onicord-muted mt-0.5 leading-relaxed">
              {t("settings.cloudBackup.autoBackupDesc", "Realiza copias de seguridad de fondo periódicamente con tus elementos seleccionados.")}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={settings.autoBackupEnabled ?? false}
              onChange={handleToggleAuto}
              className="sr-only peer"
            />
            <div className="onicord-toggle-slider" />
          </label>
        </div>

        {/* Frecuencia Dropdown (Solo si backups automáticos está activo) */}
        {settings.autoBackupEnabled && (
          <div className="flex items-center justify-between p-3.5 hover:bg-white/[0.02] transition-colors">
            <div className="min-w-0 pr-4">
              <p className="text-sm font-semibold text-white">
                {t("settings.cloudBackup.frequency", "Frecuencia de backup")}
              </p>
            </div>
            <Select
              value={settings.frequency || "weekly"}
              onChange={handleFrequencyChange}
              align="right"
              className="w-[170px] shrink-0"
              options={[
                { value: "daily", label: t("settings.cloudBackup.freqDaily", "Todos los días") },
                { value: "weekly", label: t("settings.cloudBackup.freqWeekly", "Una vez por semana") },
                { value: "biweekly", label: t("settings.cloudBackup.freqBiweekly", "Cada 15 días") },
                { value: "monthly", label: t("settings.cloudBackup.freqMonthly", "Una vez al mes") },
              ]}
            />
          </div>
        )}

        {/* Switch: Reemplazar backup anterior */}
        <div className="flex items-center justify-between p-3.5 hover:bg-white/[0.02] transition-colors">
          <div className="min-w-0 pr-4">
            <p className="text-sm font-semibold text-white">
              {t("settings.cloudBackup.replacePrevious", "Reemplazar backup anterior")}
            </p>
            <p className="text-[11px] text-onicord-muted mt-0.5 leading-relaxed">
              {t("settings.cloudBackup.replacePreviousDesc", "Elimina los backups anteriores en Drive para mantener solo la copia más reciente.")}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={settings.replacePrevious ?? false}
              onChange={handleToggleReplace}
              className="sr-only peer"
            />
            <div className="onicord-toggle-slider" />
          </label>
        </div>
      </div>
    </div>
  );
}

// ─── HISTORY CARD ─────────────────────────────────────────────────────────────
function HistoryCard({ backups, loadingBackups, onRestore, onDelete, restoringId, deletingId }) {
  const { t } = useTranslation();
  const [expandedRestore, setExpandedRestore] = useState(null);
  const [restoreCats, setRestoreCats] = useState({});

  const toggleRestoreCat = (backupId, catId) => {
    setRestoreCats((prev) => {
      const current = prev[backupId] || [];
      const next = current.includes(catId) ? current.filter((c) => c !== catId) : [...current, catId];
      return { ...prev, [backupId]: next };
    });
  };

  const getRestoreCats = (backup) => restoreCats[backup.id] || backup.categories;

  return (
    <div className="onicord-settings-card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="onicord-settings-section-title !mb-0 flex items-center gap-2">
          {t("settings.cloudBackup.historyTitle", "Historial de Backups")}
        </h3>
        {loadingBackups && (
          <span className="text-xs text-onicord-muted animate-pulse">
            {t("settings.cloudBackup.loading", "Cargando...")}
          </span>
        )}
      </div>

      {!loadingBackups && backups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-onicord-muted">
          <p className="text-xs text-center">
            {t("settings.cloudBackup.noBackups", "No hay backups en Drive todavía.")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {backups.map((backup) => (
            <div
              key={backup.id}
              className="border border-white/5 rounded-xl bg-onicord-base/30 overflow-hidden"
            >
              <div className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">{backup.name}</p>
                  <div className="flex items-center flex-wrap gap-2 mt-1">
                    <span className="text-[10px] text-onicord-muted">{formatDate(backup.createdAt)}</span>
                    <span className="text-[10px] font-mono font-bold text-onicord-muted">{formatBytes(backup.size)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {backup.categories.map((c) => {
                      const label = t(`settings.cloudBackup.categories.${c}`, c);
                      return (
                        <span key={c} className="text-[9px] uppercase font-bold tracking-wide bg-onicord-accent/10 text-onicord-accent border border-onicord-accent/20 px-1.5 py-0.5 rounded">
                          {label}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setExpandedRestore(expandedRestore === backup.id ? null : backup.id)}
                    className="text-[11px] font-semibold text-onicord-accent hover:text-white border border-onicord-accent/30 hover:border-white/20 bg-onicord-accent/5 hover:bg-white/5 px-2.5 py-1 rounded-lg transition-all flex items-center justify-center cursor-pointer"
                  >
                    {t("settings.cloudBackup.restore", "Restaurar")}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(backup.id)}
                    disabled={deletingId === backup.id}
                    className="flex items-center justify-center p-1.5 text-red-400/60 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all cursor-pointer disabled:opacity-40"
                    title={t("settings.cloudBackup.deleteBackup", "Eliminar backup")}
                  >
                    {deletingId === backup.id ? (
                      <span className="w-3.5 h-3.5 border border-red-400/40 border-t-red-400 rounded-full animate-spin block" />
                    ) : (
                      <MaterialIcon name="delete" size={15} />
                    )}
                  </button>
                </div>
              </div>

              {/* Restore panel */}
              {expandedRestore === backup.id && (
                <div className="border-t border-white/5 p-3 bg-onicord-base/20 space-y-2">
                  <p className="text-[11px] text-onicord-muted mb-2">
                    {t("settings.cloudBackup.selectToRestore", "Selecciona qué restaurar de este backup:")}
                  </p>
                  <div className="space-y-1.5">
                    {backup.categories.map((catId) => {
                      const catMeta = CATEGORY_KEYS.find((x) => x.id === catId);
                      const label = t(`settings.cloudBackup.categories.${catId}`, catId);
                      const selected = getRestoreCats(backup).includes(catId);
                      return (
                        <div
                          key={catId}
                          className="flex items-center justify-between p-2 rounded-lg bg-onicord-base/40 border border-white/5"
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <MaterialIcon name={catMeta?.icon || "folder"} size={14} className="text-onicord-accent" />
                            <span className="text-xs font-medium text-white">{label}</span>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => toggleRestoreCat(backup.id, catId)}
                              className="sr-only peer"
                            />
                            <div className="onicord-toggle-slider" />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRestore(backup.id, getRestoreCats(backup))}
                    disabled={restoringId === backup.id || getRestoreCats(backup).length === 0}
                    className="w-full mt-2 py-2 text-xs font-bold bg-onicord-accent hover:bg-onicord-accent/80 text-onicord-dark rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {restoringId === backup.id ? (
                      <span className="w-3.5 h-3.5 border-2 border-onicord-dark/30 border-t-onicord-dark rounded-full animate-spin" />
                    ) : (
                      <MaterialIcon name="download" size={14} />
                    )}
                    {restoringId === backup.id
                      ? t("settings.cloudBackup.restoring", "Restaurando...")
                      : t("settings.cloudBackup.restoreSelected", "Restaurar selección")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── MAIN TAB ─────────────────────────────────────────────────────────────────
export default function CloudBackupTab() {
  const { t } = useTranslation();
  const [isConnected, setIsConnected] = useState(false);
  const [user, setUser] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [backups, setBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [selectedCats, setSelectedCats] = useState(["profile", "servers"]);
  const [estimatedSize, setEstimatedSize] = useState(0);
  const [progress, setProgress] = useState(null);
  const [restoringId, setRestoringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [backupSettings, setBackupSettings] = useState({
    autoBackupEnabled: false,
    frequency: "weekly",
    replacePrevious: false,
    selectedCategories: ["profile", "servers"],
  });

  const api = window.electronAPI;

  const checkConnection = useCallback(async () => {
    if (!api?.driveIsConnected) return;
    const connected = await api.driveIsConnected();
    setIsConnected(connected);
    if (connected) {
      if (api.driveGetUser) {
        const userInfo = await api.driveGetUser();
        setUser(userInfo);
      } else if (api.driveGetEmail) {
        const em = await api.driveGetEmail();
        setUser({ email: em });
      }
    }
  }, [api]);

  const loadBackups = useCallback(async () => {
    if (!api?.driveListBackups) return;
    setLoadingBackups(true);
    try {
      const list = await api.driveListBackups();
      setBackups(list || []);
    } catch (err) {
      console.error("[CloudBackupTab] Error loading backups:", err);
    } finally {
      setLoadingBackups(false);
    }
  }, [api]);

  const loadBackupSettings = useCallback(async () => {
    if (!api?.driveGetSettings) return;
    try {
      const s = await api.driveGetSettings();
      if (s) {
        setBackupSettings(s);
        if (s.selectedCategories && Array.isArray(s.selectedCategories)) {
          setSelectedCats(s.selectedCategories);
        }
      }
    } catch (err) {
      console.error("[CloudBackupTab] Error loading settings:", err);
    }
  }, [api]);

  useEffect(() => {
    checkConnection();
    loadBackupSettings();
  }, [checkConnection, loadBackupSettings]);

  useEffect(() => {
    if (!isConnected) return;
    loadBackups();
  }, [isConnected, loadBackups]);

  // Estimate size when categories change
  useEffect(() => {
    if (!api?.driveEstimateSize || selectedCats.length === 0) {
      setEstimatedSize(0);
      return;
    }
    api.driveEstimateSize(selectedCats).then(setEstimatedSize).catch(() => {});
  }, [selectedCats, api]);

  // Listen to progress events
  useEffect(() => {
    if (!api?.onDriveProgress) return;
    const unsub = api.onDriveProgress((data) => {
      setProgress(data);
      if (data.percent >= 100) {
        setTimeout(() => setProgress(null), 1500);
      }
    });
    return unsub;
  }, [api]);

  const updateBackupSettings = async (partial) => {
    const next = { ...backupSettings, ...partial, selectedCategories: selectedCats };
    setBackupSettings(next);
    if (api?.driveSaveSettings) {
      try {
        await api.driveSaveSettings(next);
      } catch (err) {
        console.error("[CloudBackupTab] Error saving backup settings:", err);
      }
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const result = await api.driveAuthorize();
      if (result?.connected) {
        setIsConnected(true);
        if (result.user) {
          setUser(result.user);
        } else {
          setUser({ email: result.email });
        }
        await loadBackups();
        notificationManager.showToast(
          t("settings.cloudBackup.title", "Google Drive"),
          t("settings.cloudBackup.toasts.connectSuccess", "¡Google Drive conectado correctamente!"),
          "success"
        );
      }
    } catch (err) {
      notificationManager.showToast(
        t("common.error", "Error"),
        err.message || t("settings.cloudBackup.toasts.connectError", "No se pudo conectar con Google Drive."),
        "danger"
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.driveDisconnect();
      setIsConnected(false);
      setUser(null);
      setBackups([]);
      notificationManager.showToast(
        t("settings.cloudBackup.title", "Google Drive"),
        t("settings.cloudBackup.toasts.disconnectSuccess", "Cuenta de Google desconectada."),
        "info"
      );
    } catch (err) {
      notificationManager.showToast(
        t("common.error", "Error"),
        err.message || t("settings.cloudBackup.toasts.disconnectError", "Error al desconectar."),
        "danger"
      );
    }
  };

  const handleToggleCat = (id) => {
    const next = selectedCats.includes(id)
      ? selectedCats.filter((c) => c !== id)
      : [...selectedCats, id];
    setSelectedCats(next);
    updateBackupSettings({ selectedCategories: next });
  };

  const handleBackup = async () => {
    if (selectedCats.length === 0) return;
    try {
      const result = await api.driveCreateBackup(selectedCats);
      await loadBackups();
      notificationManager.showToast(
        t("settings.cloudBackup.createBackupTitle", "Backup"),
        t("settings.cloudBackup.toasts.backupSuccess", "Backup completado: {{name}} ({{size}})", {
          name: result.name,
          size: formatBytes(result.size),
        }),
        "success"
      );
    } catch (err) {
      setProgress(null);
      notificationManager.showToast(
        t("common.error", "Error"),
        err.message || t("settings.cloudBackup.toasts.backupError", "Error al crear el backup."),
        "danger"
      );
    }
  };

  const handleRestore = async (fileId, cats) => {
    setRestoringId(fileId);
    try {
      await api.driveDownloadBackup(fileId, cats);
      notificationManager.showToast(
        t("settings.cloudBackup.restore", "Restauración"),
        t("settings.cloudBackup.toasts.restoreSuccess", "Restauración completada. Reinicia la app para aplicar todos los cambios."),
        "success"
      );
    } catch (err) {
      notificationManager.showToast(
        t("common.error", "Error"),
        err.message || t("settings.cloudBackup.toasts.restoreError", "Error al restaurar."),
        "danger"
      );
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async (fileId) => {
    setDeletingId(fileId);
    try {
      await api.driveDeleteBackup(fileId);
      setBackups((prev) => prev.filter((b) => b.id !== fileId));
      notificationManager.showToast(
        t("settings.cloudBackup.createBackupTitle", "Backup"),
        t("settings.cloudBackup.toasts.deleteSuccess", "Backup eliminado."),
        "info"
      );
    } catch (err) {
      notificationManager.showToast(
        t("common.error", "Error"),
        err.message || t("settings.cloudBackup.toasts.deleteError", "Error al eliminar."),
        "danger"
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="onicord-settings-container">
      <ConnectionCard
        isConnected={isConnected}
        user={user}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        connecting={connecting}
      />

      {isConnected && (
        <>
          <BackupCard
            selectedCats={selectedCats}
            onToggleCat={handleToggleCat}
            estimatedSize={estimatedSize}
            onBackup={handleBackup}
            progress={progress}
          />
          <AutoBackupCard
            settings={backupSettings}
            onUpdateSettings={updateBackupSettings}
          />
          <HistoryCard
            backups={backups}
            loadingBackups={loadingBackups}
            onRestore={handleRestore}
            onDelete={handleDelete}
            restoringId={restoringId}
            deletingId={deletingId}
          />
        </>
      )}
    </div>
  );
}

// ─── GOOGLE LOGO SVG ──────────────────────────────────────────────────────────
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.707A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.96L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
