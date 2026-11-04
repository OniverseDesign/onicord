import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import Select from "../ui/Select";
import { notificationManager } from "../../lib/notificationManager";

const CATEGORY_KEYS = [
  { id: "profile", icon: "person" },
  { id: "servers", icon: "dns" },
  { id: "addons", icon: "extension" },
  { id: "stickers", icon: "sticky_note_2" },
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

// ─── CARD 1: EXPORT ──────────────────────────────────────────────────────────
function ExportCard({ selectedCats, onToggleCat, estimatedSize, onExport, exporting, progress }) {
  const { t } = useTranslation();

  return (
    <div className="onicord-settings-card">
      <h3 className="onicord-settings-section-title">
        <span>{t("settings.cloudBackup.createBackupTitle", "Crear y Exportar Copia de Seguridad")}</span>
      </h3>

      <p className="onicord-settings-row-desc mb-3">
        {t("settings.backup.exportDesc", "Selecciona qué datos deseas incluir. Se generará un paquete comprimido .onipkg que puedes almacenar de forma segura o transferir a otro equipo.")}
      </p>

      <div className="space-y-1">
        {CATEGORY_KEYS.map((cat) => {
          const isSelected = selectedCats.includes(cat.id);
          const label = t(`settings.cloudBackup.categories.${cat.id}`, cat.id);
          const desc = t(`settings.cloudBackup.categories.${cat.id}Desc`, "");

          return (
            <div key={cat.id} className="onicord-settings-row">
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2">
                  <MaterialIcon name={cat.icon} size={16} className="text-onicord-accent/80" />
                  <p className="onicord-settings-row-title">{label}</p>
                </div>
                <p className="onicord-settings-row-desc">{desc}</p>
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

      <div className="onicord-settings-divider" />

      {/* Estimated size */}
      <div className="flex items-center justify-between py-1 text-xs">
        <span className="text-onicord-muted">
          {t("settings.cloudBackup.estimatedSize", "Tamaño estimado")}
        </span>
        <span className="font-mono font-semibold text-onicord-text">{formatBytes(estimatedSize)}</span>
      </div>

      {/* Progress */}
      {progress && (
        <div className="my-3 space-y-2">
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

      <div className="pt-2">
        <button
          type="button"
          onClick={onExport}
          disabled={selectedCats.length === 0 || exporting}
          className="onicord-btn-primary w-full flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <MaterialIcon name="file_download" size={16} />
          <span>
            {exporting
              ? t("settings.backup.exporting", "Empaquetando...")
              : t("settings.backup.exportBtn", "Exportar Copia de Seguridad (.onipkg)")}
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── CARD 2: IMPORT / RESTORE ────────────────────────────────────────────────
function ImportCard({ onSelectFile, inspectedBackup, onCancelInspected, onConfirmRestore, restoring, progress }) {
  const { t } = useTranslation();
  const [selectedRestoreCats, setSelectedRestoreCats] = useState([]);

  useEffect(() => {
    if (inspectedBackup?.categories) {
      setSelectedRestoreCats(inspectedBackup.categories);
    }
  }, [inspectedBackup]);

  const toggleRestoreCat = (catId) => {
    setSelectedRestoreCats((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId]
    );
  };

  return (
    <div className="onicord-settings-card">
      <h3 className="onicord-settings-section-title">
        <span>{t("settings.backup.importTitle", "Restaurar desde Archivo (.onipkg)")}</span>
      </h3>

      <p className="onicord-settings-row-desc mb-3">
        {t("settings.backup.importDesc", "Restaura tu perfil, servidores, complementos o stickers desde un archivo .onipkg guardado previamente.")}
      </p>

      {!inspectedBackup ? (
        <div className="border border-dashed border-white/10 hover:border-onicord-accent/40 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 bg-onicord-base/30 transition-colors text-center">
          <div className="w-10 h-10 rounded-xl bg-onicord-base border border-white/5 flex items-center justify-center text-onicord-accent shadow-sm">
            <MaterialIcon name="upload_file" size={22} />
          </div>
          <div>
            <p className="text-xs font-semibold text-onicord-text">
              {t("settings.backup.pickFileHint", "Selecciona una copia de seguridad en tu equipo")}
            </p>
            <p className="text-[11px] text-onicord-muted mt-0.5">
              Formato de paquete Onicord (.onipkg)
            </p>
          </div>
          <button
            type="button"
            onClick={onSelectFile}
            className="onicord-btn-secondary px-4 py-2 text-xs flex items-center gap-2 cursor-pointer mt-1"
          >
            <MaterialIcon name="folder_open" size={15} />
            <span>{t("settings.backup.browseBtn", "Examinar archivo .onipkg")}</span>
          </button>
        </div>
      ) : (
        <div className="border border-white/10 rounded-2xl bg-onicord-base/40 p-4 space-y-4">
          {/* Header of inspected backup */}
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-onicord-accent/20 border border-onicord-accent/40 flex items-center justify-center shrink-0 overflow-hidden">
                {inspectedBackup.profile?.avatar ? (
                  <img
                    src={inspectedBackup.profile.avatar}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <MaterialIcon name="person" size={20} className="text-onicord-accent" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate">
                  {inspectedBackup.profile?.nickname
                    ? inspectedBackup.profile.nickname
                    : inspectedBackup.fileName}
                </p>
                <p className="text-[10px] text-onicord-muted mt-0.5">
                  {formatDate(inspectedBackup.createdAt)} · {formatBytes(inspectedBackup.fileSize)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onCancelInspected}
              disabled={restoring}
              className="p-1 rounded-lg text-onicord-muted hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              title={t("common.close", "Cerrar")}
            >
              <MaterialIcon name="close" size={16} />
            </button>
          </div>

          {/* Categories Selector */}
          <div>
            <p className="text-[11px] font-semibold text-onicord-muted uppercase tracking-wider mb-2">
              {t("settings.cloudBackup.selectToRestore", "Selecciona qué restaurar de este backup:")}
            </p>
            <div className="space-y-1">
              {(inspectedBackup.categories || []).map((catId) => {
                const catMeta = CATEGORY_KEYS.find((x) => x.id === catId);
                const label = t(`settings.cloudBackup.categories.${catId}`, catId);
                const isSelected = selectedRestoreCats.includes(catId);

                return (
                  <div key={catId} className="onicord-settings-row !pt-2">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <MaterialIcon
                        name={catMeta?.icon || "folder"}
                        size={15}
                        className="text-onicord-accent"
                      />
                      <span className="text-xs font-medium text-white">{label}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRestoreCat(catId)}
                        className="sr-only peer"
                      />
                      <div className="onicord-toggle-slider" />
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Progress if restoring */}
          {progress && (
            <div className="space-y-2 pt-2">
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

          {/* Warning */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200/90 flex items-start gap-2.5">
            <MaterialIcon name="warning" size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              {t(
                "settings.backup.restoreWarning",
                "Al restaurar se sobreescribirán los datos locales correspondientes a las categorías seleccionadas."
              )}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onCancelInspected}
              disabled={restoring}
              className="onicord-btn-secondary py-2 text-xs flex-1 cursor-pointer"
            >
              {t("common.cancel", "Cancelar")}
            </button>
            <button
              type="button"
              onClick={() => onConfirmRestore(inspectedBackup.filePath, selectedRestoreCats)}
              disabled={restoring || selectedRestoreCats.length === 0}
              className="onicord-btn-primary py-2 text-xs flex-[2] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <MaterialIcon name="restore" size={15} />
              <span>
                {restoring
                  ? t("settings.cloudBackup.restoring", "Restaurando...")
                  : t("settings.cloudBackup.restoreSelected", "Restaurar selección")}
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── CARD 3: LOCAL VAULT & AUTO BACKUP ────────────────────────────────────────
function LocalVaultCard({
  settings,
  onUpdateSettings,
  localBackups,
  loadingLocal,
  onRestoreFromVault,
  onDeleteFromVault,
  onCreateLocalBackup,
  creatingLocal,
}) {
  const { t } = useTranslation();

  const handleToggleAuto = () => {
    onUpdateSettings({ autoBackupEnabled: !settings.autoBackupEnabled });
  };

  const handleFrequencyChange = (e) => {
    onUpdateSettings({ frequency: e.target.value });
  };

  return (
    <div className="onicord-settings-card">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="onicord-settings-section-title !mb-0">
          <span>{t("settings.backup.vaultTitle", "Bóveda Local y Copias Periódicas")}</span>
        </h3>
        <button
          type="button"
          onClick={onCreateLocalBackup}
          disabled={creatingLocal}
          className="onicord-btn-secondary py-1 px-3 text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <MaterialIcon name="add" size={14} />
          <span>
            {creatingLocal
              ? t("settings.backup.saving", "Guardando...")
              : t("settings.backup.createInVault", "Guardar copia ahora")}
          </span>
        </button>
      </div>

      <p className="onicord-settings-row-desc mb-3">
        {t("settings.backup.vaultDesc", "Onicord puede generar copias periódicas automáticas de tus datos en una carpeta interna de tu equipo.")}
      </p>

      {/* Auto Backup Row */}
      <div className="onicord-settings-row">
        <div className="min-w-0 pr-4">
          <p className="onicord-settings-row-title">
            {t("settings.cloudBackup.autoBackupEnabled", "Copias de seguridad automáticas")}
          </p>
          <p className="onicord-settings-row-desc">
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

      {/* Frequency Input Row */}
      {settings.autoBackupEnabled && (
        <div className="onicord-settings-input-row">
          <div className="min-w-0 pr-4">
            <p className="onicord-settings-row-title">
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

      <div className="onicord-settings-divider" />

      {/* History table */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <span className="text-xs font-bold text-onicord-muted uppercase tracking-wider">
            {t("settings.cloudBackup.historyTitle", "Copias en Bóveda Local")}
          </span>
          {loadingLocal && (
            <span className="text-xs text-onicord-muted animate-pulse">
              {t("settings.cloudBackup.loading", "Cargando...")}
            </span>
          )}
        </div>

        {!loadingLocal && localBackups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2 text-onicord-muted border border-white/5 rounded-2xl bg-onicord-base/20">
            <MaterialIcon name="folder_off" size={24} className="opacity-30" />
            <p className="text-xs text-center">
              {t("settings.backup.noLocalBackups", "Aún no hay copias guardadas en la bóveda local.")}
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[280px] overflow-y-auto minimal-scrollbar pr-1 pt-1">
            {localBackups.map((b) => (
              <div
                key={b.name}
                className="flex items-center justify-between p-3 rounded-xl bg-onicord-base/40 border border-white/5 hover:border-white/10 transition-colors gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">{b.name}</p>
                  <div className="flex items-center flex-wrap gap-2 mt-0.5">
                    <span className="text-[10px] text-onicord-muted">{formatDate(b.createdAt)}</span>
                    <span className="text-[10px] font-mono text-onicord-muted">· {formatBytes(b.size)}</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {b.categories.map((c) => (
                      <span
                        key={c}
                        className="text-[9px] uppercase font-bold tracking-wide bg-onicord-accent/10 text-onicord-accent border border-onicord-accent/20 px-1.5 py-0.5 rounded"
                      >
                        {t(`settings.cloudBackup.categories.${c}`, c)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onRestoreFromVault(b.filePath)}
                    className="onicord-btn-secondary px-2.5 py-1 text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <MaterialIcon name="restore" size={13} />
                    <span>{t("settings.cloudBackup.restore", "Restaurar")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteFromVault(b.name)}
                    className="p-1.5 text-red-400/70 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors cursor-pointer"
                    title={t("settings.cloudBackup.deleteBackup", "Eliminar copia")}
                  >
                    <MaterialIcon name="delete" size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN BACKUP TAB COMPONENT ───────────────────────────────────────────────
export default function BackupTab() {
  const { t } = useTranslation();
  const api = window.electronAPI;

  const [selectedCats, setSelectedCats] = useState(["profile", "servers"]);
  const [estimatedSize, setEstimatedSize] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [creatingLocal, setCreatingLocal] = useState(false);
  const [progress, setProgress] = useState(null);

  const [inspectedBackup, setInspectedBackup] = useState(null);
  const [localBackups, setLocalBackups] = useState([]);
  const [loadingLocal, setLoadingLocal] = useState(false);

  const [settings, setSettings] = useState({
    autoBackupEnabled: false,
    frequency: "weekly",
    maxBackups: 3,
    selectedCategories: ["profile", "servers"],
  });

  // Calculate size on category change
  useEffect(() => {
    let active = true;
    if (api?.backupEstimateSize) {
      api.backupEstimateSize(selectedCats).then((sz) => {
        if (active) setEstimatedSize(sz || 0);
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [selectedCats, api]);

  // Load settings & local backups
  const loadLocalVault = useCallback(async () => {
    if (!api?.backupListLocal) return;
    setLoadingLocal(true);
    try {
      const list = await api.backupListLocal();
      setLocalBackups(list || []);
    } catch (err) {
      console.error("[BackupTab] Error cargando copias locales:", err);
    } finally {
      setLoadingLocal(false);
    }
  }, [api]);

  useEffect(() => {
    if (!api) return;

    if (api.backupGetSettings) {
      api.backupGetSettings().then((s) => {
        if (s) {
          setSettings(s);
          if (Array.isArray(s.selectedCategories) && s.selectedCategories.length > 0) {
            setSelectedCats(s.selectedCategories);
          }
        }
      }).catch(() => {});
    }

    loadLocalVault();

    // Listen to progress
    let unsubProg = null;
    if (api.onBackupProgress) {
      unsubProg = api.onBackupProgress((data) => setProgress(data));
    }

    // Listen to dropped backup packages
    let unsubDrop = null;
    if (api.onBackupPackageDropped) {
      unsubDrop = api.onBackupPackageDropped(async (filePath) => {
        try {
          const inspected = await api.backupInspect(filePath);
          if (inspected?.valid) {
            setInspectedBackup(inspected);
            notificationManager.showToast(
              "Copia de seguridad",
              `Se ha cargado ${inspected.fileName}. Selecciona los elementos a restaurar.`,
              "info"
            );
          }
        } catch (err) {
          notificationManager.showToast("Error", err.message, "danger");
        }
      });
    }

    return () => {
      if (unsubProg) unsubProg();
      if (unsubDrop) unsubDrop();
    };
  }, [api, loadLocalVault]);

  const handleToggleCat = (id) => {
    const next = selectedCats.includes(id)
      ? selectedCats.filter((c) => c !== id)
      : [...selectedCats, id];
    setSelectedCats(next);
    if (api?.backupSaveSettings) {
      api.backupSaveSettings({ selectedCategories: next }).catch(() => {});
    }
  };

  const handleUpdateSettings = async (patch) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    if (api?.backupSaveSettings) {
      await api.backupSaveSettings(updated);
    }
  };

  const handleExport = async () => {
    if (!api?.backupExportDialog || selectedCats.length === 0) return;
    setExporting(true);
    setProgress(null);
    try {
      const res = await api.backupExportDialog(selectedCats);
      if (!res.canceled && res.success) {
        notificationManager.showToast(
          t("settings.cloudBackup.createBackupTitle", "Copia de Seguridad"),
          t("settings.cloudBackup.toasts.backupSuccess", {
            name: res.fileName,
            size: formatBytes(res.size),
            defaultValue: `Copia guardada: ${res.fileName} (${formatBytes(res.size)})`,
          }),
          "success"
        );
      }
    } catch (err) {
      notificationManager.showToast("Error", err.message || "Error al exportar la copia", "danger");
    } finally {
      setExporting(false);
      setProgress(null);
    }
  };

  const handleSelectFile = async () => {
    if (!api?.backupOpenDialog) return;
    try {
      const inspected = await api.backupOpenDialog();
      if (!inspected.canceled && inspected.valid) {
        setInspectedBackup(inspected);
      }
    } catch (err) {
      notificationManager.showToast("Error", err.message || "No se pudo leer el archivo", "danger");
    }
  };

  const handleRestoreFromVault = async (filePath) => {
    if (!api?.backupInspect) return;
    try {
      const inspected = await api.backupInspect(filePath);
      if (inspected.valid) {
        setInspectedBackup(inspected);
      }
    } catch (err) {
      notificationManager.showToast("Error", err.message || "No se pudo inspeccionar el archivo", "danger");
    }
  };

  const handleConfirmRestore = async (filePath, categories) => {
    if (!api?.backupRestore || categories.length === 0) return;
    setRestoring(true);
    setProgress(null);
    try {
      await api.backupRestore(filePath, categories);
      notificationManager.showToast(
        t("settings.cloudBackup.restore", "Restauración"),
        t(
          "settings.cloudBackup.toasts.restoreSuccess",
          "Copia restaurada con éxito. Reinicia la aplicación o vuelve a iniciar para aplicar todos los cambios."
        ),
        "success"
      );
      setInspectedBackup(null);
    } catch (err) {
      notificationManager.showToast("Error", err.message || "Error al restaurar", "danger");
    } finally {
      setRestoring(false);
      setProgress(null);
    }
  };

  const handleDeleteFromVault = async (filename) => {
    if (!api?.backupDeleteLocal) return;
    try {
      await api.backupDeleteLocal(filename);
      await loadLocalVault();
      notificationManager.showToast("Bóveda Local", "Copia eliminada de la bóveda local.", "info");
    } catch (err) {
      notificationManager.showToast("Error", err.message || "Error al eliminar", "danger");
    }
  };

  const handleCreateLocalBackup = async () => {
    if (!api?.backupCreateLocal) return;
    setCreatingLocal(true);
    try {
      await api.backupCreateLocal(selectedCats);
      await loadLocalVault();
      notificationManager.showToast("Bóveda Local", "Copia guardada en la bóveda con éxito.", "success");
    } catch (err) {
      notificationManager.showToast("Error", err.message || "Error al guardar en bóveda", "danger");
    } finally {
      setCreatingLocal(false);
    }
  };

  return (
    <div className="onicord-settings-container">
      {/* 1. Export Card */}
      <ExportCard
        selectedCats={selectedCats}
        onToggleCat={handleToggleCat}
        estimatedSize={estimatedSize}
        onExport={handleExport}
        exporting={exporting}
        progress={exporting ? progress : null}
      />

      {/* 2. Import / Restore Card */}
      <ImportCard
        onSelectFile={handleSelectFile}
        inspectedBackup={inspectedBackup}
        onCancelInspected={() => setInspectedBackup(null)}
        onConfirmRestore={handleConfirmRestore}
        restoring={restoring}
        progress={restoring ? progress : null}
      />

      {/* 3. Local Vault & Auto Backup Card */}
      <LocalVaultCard
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        localBackups={localBackups}
        loadingLocal={loadingLocal}
        onRestoreFromVault={handleRestoreFromVault}
        onDeleteFromVault={handleDeleteFromVault}
        onCreateLocalBackup={handleCreateLocalBackup}
        creatingLocal={creatingLocal}
      />
    </div>
  );
}
