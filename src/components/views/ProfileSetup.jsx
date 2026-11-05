import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";

const MAX_AVATAR_SIZE = 8 * 1024 * 1024;

const CATEGORY_LABELS = {
  profile: "Perfil",
  servers: "Servidores + Chat",
  addons: "Complementos",
  stickers: "Stickers",
};

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

// ─── ONIPKG RESTORE PANEL ─────────────────────────────────────────────────────
function OnipkgRestorePanel({ onBack, onRestoreComplete }) {
  const { t } = useTranslation();
  const [step, setStep] = useState("idle"); // idle | inspected | restoring | done
  const [inspectedBackup, setInspectedBackup] = useState(null);
  const [selectedCats, setSelectedCats] = useState([]);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const api = window.electronAPI;

  const handleSelectFile = async () => {
    if (!api?.backupOpenDialog) {
      setError("La API nativa de copias de seguridad no está disponible.");
      return;
    }
    setError(null);
    try {
      const res = await api.backupOpenDialog();
      if (!res.canceled && res.valid) {
        setInspectedBackup(res);
        setSelectedCats(res.categories || ["profile", "servers"]);
        setStep("inspected");
      }
    } catch (err) {
      setError(err.message || "Error al leer el archivo de copia.");
    }
  };

  const handleToggleCat = (catId) => {
    setSelectedCats((prev) =>
      prev.includes(catId) ? prev.filter((c) => c !== catId) : [...prev, catId]
    );
  };

  const handleRestore = async () => {
    if (!inspectedBackup || selectedCats.length === 0) return;
    setStep("restoring");
    setError(null);

    let unsub = null;
    if (api?.onBackupProgress) {
      unsub = api.onBackupProgress((data) => setProgress(data));
    }

    try {
      await api.backupRestore(inspectedBackup.filePath, selectedCats);
      setStep("done");
    } catch (err) {
      setError(err.message || "Error durante la restauración.");
      setStep("inspected");
    } finally {
      if (unsub) unsub();
    }
  };

  return (
    <div className="w-full">
      {step === "idle" && (
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-2xl bg-onicord-base/40 border border-white/5 w-full text-center">
            <div className="w-12 h-12 rounded-full bg-onicord-accent/10 border border-onicord-accent/20 flex items-center justify-center mx-auto mb-3 text-onicord-accent">
              <MaterialIcon name="settings_backup_restore" size={28} />
            </div>
            <p className="text-sm text-onicord-muted leading-relaxed">
              Restaura tu perfil, servidores, chats guardados y complementos desde un archivo{" "}
              <span className="font-mono text-onicord-accent font-semibold">.onipkg</span>.
            </p>
          </div>

          {error && <p className="onicord-error-banner text-xs w-full text-center">{error}</p>}

          <button
            type="button"
            onClick={handleSelectFile}
            className="onicord-btn-cta-primary w-full py-2.5 flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            <MaterialIcon name="folder_open" size={18} />
            Seleccionar archivo .onipkg
          </button>

          <button
            type="button"
            onClick={onBack}
            className="text-xs text-onicord-muted hover:text-white transition-colors cursor-pointer"
          >
            ← {t("common.back", "Volver y crear perfil nuevo")}
          </button>
        </div>
      )}

      {step === "inspected" && inspectedBackup && (
        <div className="flex flex-col gap-4">
          {/* Card preview of the backup */}
          <div className="border border-onicord-accent/30 rounded-xl bg-onicord-base/40 p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-onicord-accent/20 border border-onicord-accent/40 flex items-center justify-center shrink-0 overflow-hidden">
                {inspectedBackup.profile?.avatar ? (
                  <img
                    src={inspectedBackup.profile.avatar}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <MaterialIcon name="person" size={24} className="text-onicord-accent" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white truncate">
                  {inspectedBackup.profile?.nickname || inspectedBackup.fileName}
                </p>
                <p className="text-[11px] text-onicord-muted mt-0.5">
                  {formatDate(inspectedBackup.createdAt)} · {formatBytes(inspectedBackup.fileSize)}
                </p>
              </div>
            </div>

            {/* Included Categories Selector */}
            <div className="mt-4 pt-3 border-t border-white/5 space-y-2">
              <p className="text-[10px] uppercase font-bold text-onicord-muted tracking-wider">
                Categorías a restaurar:
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {(inspectedBackup.categories || []).map((catId) => {
                  const isSelected = selectedCats.includes(catId);
                  return (
                    <button
                      key={catId}
                      type="button"
                      onClick={() => handleToggleCat(catId)}
                      className={`flex items-center justify-between p-2 rounded-lg border text-left text-xs transition-all cursor-pointer ${
                        isSelected
                          ? "bg-onicord-accent/15 border-onicord-accent/40 text-white"
                          : "bg-onicord-base/30 border-white/5 text-onicord-muted hover:border-white/10"
                      }`}
                    >
                      <span className="font-medium truncate">{CATEGORY_LABELS[catId] || catId}</span>
                      <MaterialIcon
                        name={isSelected ? "check_box" : "check_box_outline_blank"}
                        size={15}
                        className={isSelected ? "text-onicord-accent" : "opacity-40"}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error && <p className="onicord-error-banner text-xs">{error}</p>}

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleRestore}
              disabled={selectedCats.length === 0}
              className="onicord-btn-cta-primary w-full py-2.5 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <MaterialIcon name="restore" size={18} />
              Restaurar Copia de Seguridad
            </button>
            <button
              type="button"
              onClick={() => {
                setInspectedBackup(null);
                setStep("idle");
              }}
              className="text-xs text-onicord-muted hover:text-white transition-colors cursor-pointer text-center py-1"
            >
              Seleccionar otro archivo
            </button>
          </div>
        </div>
      )}

      {step === "restoring" && (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-full space-y-2">
            <div className="flex justify-between text-xs text-onicord-muted">
              <span>{progress?.step || "Restaurando tus datos..."}</span>
              <span className="font-mono font-bold text-onicord-accent">{progress?.percent || 0}%</span>
            </div>
            <div className="h-2 w-full bg-onicord-base/60 rounded-full overflow-hidden border border-white/5">
              <div
                className="h-full bg-onicord-accent rounded-full transition-all duration-300"
                style={{ width: `${progress?.percent || 0}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-onicord-muted text-center">
            No cierres la aplicación durante el proceso de restauración.
          </p>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <MaterialIcon name="check_circle" size={32} className="text-emerald-400" />
          </div>
          <div className="text-center">
            <h3 className="text-base font-bold text-white">¡Restauración completada!</h3>
            <p className="text-xs text-onicord-muted mt-1 leading-relaxed">
              Tus datos han sido restaurados correctamente en Onicord.
            </p>
          </div>
          <button
            type="button"
            onClick={onRestoreComplete}
            className="onicord-btn-cta-primary w-full py-2.5 flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            {t("common.continue", "Continuar")} →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── MAIN PROFILE SETUP COMPONENT ─────────────────────────────────────────────
export default function ProfileSetup({ initialProfile, onComplete, onRestoreComplete }) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState(initialProfile?.nickname ?? "");
  const [avatar, setAvatar] = useState(initialProfile?.avatar ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showRestore, setShowRestore] = useState(false);
  const fileRef = useRef(null);

  const profileReady = nickname.trim().length >= 2;
  const isElectron = Boolean(window.electronAPI);

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecciona una imagen válida (PNG, JPG, GIF, WebP).");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setError("La imagen debe ser menor a 8 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatar(reader.result);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!profileReady) return;
    setBusy(true);
    setError(null);
    try {
      const profile = {
        id: initialProfile?.id,
        nickname: nickname.trim(),
        avatar,
        audio: initialProfile?.audio,
      };
      const saved = window.electronAPI?.saveProfile
        ? await window.electronAPI.saveProfile(profile)
        : { ...profile, id: profile.id || crypto.randomUUID() };
      onComplete(saved);
    } catch (err) {
      setError(err.message || "No se pudo guardar el perfil.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center bg-onicord-mantle px-6">
      <div className="onicord-setup-card max-w-md w-full">
        {showRestore ? (
          <>
            <header className="mb-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-onicord-outer-p4 bg-onicord-accent text-xl font-bold text-white shadow-lg shadow-onicord-accent/20">
                O
              </div>
              <h1 className="text-xl font-bold text-onicord-text">
                Restaurar Copia de Seguridad
              </h1>
              <p className="text-xs text-onicord-muted mt-1">
                Recupera tu cuenta y servidores desde un paquete .onipkg
              </p>
            </header>
            <OnipkgRestorePanel
              onBack={() => setShowRestore(false)}
              onRestoreComplete={onRestoreComplete}
            />
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <header className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-onicord-outer-p4 bg-onicord-accent text-xl font-bold text-white shadow-lg shadow-onicord-accent/20">
                O
              </div>
              <h1 className="text-2xl font-bold text-onicord-text">
                {t("profileSetup.title", "Configura tu perfil")}
              </h1>
              <p className="mt-1 text-xs text-onicord-muted">
                {t("profileSetup.subtitle", "Se usará en todos tus servidores guardados")}
              </p>
            </header>

            <div className="mt-6 flex items-center gap-4">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="onicord-avatar-picker h-20 w-20 shrink-0"
              >
                {avatar ? (
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-2xl text-onicord-muted">
                    +
                  </span>
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <div className="flex-1">
                <label className="text-xs font-medium text-onicord-muted">
                  {t("profileTab.nickname", "Nombre de usuario")}
                </label>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={32}
                  className="onicord-input mt-1 w-full"
                  placeholder={t("profileTab.yourNamePlaceholder", "e.g. PlayerOne")}
                  autoFocus
                />
              </div>
            </div>

            {error && <p className="onicord-error-banner mt-4 text-xs">{error}</p>}

            <button
              type="submit"
              disabled={!profileReady || busy}
              className="onicord-btn-cta-primary w-full mt-6 py-2.5 flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
            >
              {busy ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <>
                  <span>{t("common.continue", "Continuar")}</span>
                  <MaterialIcon name="arrow_forward" size={16} />
                </>
              )}
            </button>

            {isElectron && (
              <>
                <div className="relative my-5 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10" />
                  </div>
                  <span className="relative bg-onicord-surface px-2.5 text-[10px] text-onicord-muted uppercase tracking-wider">
                    o si ya tienes una copia
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowRestore(true)}
                  className="onicord-btn-secondary w-full py-2 flex items-center justify-center gap-2 text-xs cursor-pointer border border-white/10 hover:border-white/20 transition-all"
                >
                  <MaterialIcon name="settings_backup_restore" size={16} className="text-onicord-accent" />
                  <span>{t("settings.backup.importTitle", "Restaurar desde archivo .onipkg")}</span>
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
