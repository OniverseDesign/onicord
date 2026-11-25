import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import AvatarPicker from "../ui/AvatarPicker";

const CATEGORY_KEYS = {
  profile: "profileSetup.catProfile",
  servers: "profileSetup.catServers",
  addons: "profileSetup.catAddons",
  stickers: "profileSetup.catStickers",
  emojis: "profileSetup.catEmojis",
};

const CATEGORY_FALLBACKS = {
  profile: "Perfil y Cuenta",
  servers: "Servidores + Mensajes",
  addons: "Complementos",
  stickers: "Stickers",
  emojis: "Emojis",
};

function applyRestoredPacks(restoreResult) {
  const targets = [
    ["onicord_emoji_packs", restoreResult?.restoredEmojiPacks],
    ["onicord_stickers_packs", restoreResult?.restoredStickerPacks],
  ];
  for (const [storageKey, incoming] of targets) {
    if (!incoming || Object.keys(incoming).length === 0) continue;
    try {
      const existing = JSON.parse(localStorage.getItem(storageKey) || "{}");
      const merged = { ...existing };
      for (const [packName, ids] of Object.entries(incoming)) {
        if (!Array.isArray(ids) || ids.length === 0) continue;
        const prevIds = Array.isArray(merged[packName]) ? merged[packName] : [];
        merged[packName] = Array.from(new Set([...prevIds, ...ids]));
      }
      localStorage.setItem(storageKey, JSON.stringify(merged));
    } catch {}
  }
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(isoString, lang = "es") {
  if (!isoString) return "";
  try {
    return new Intl.DateTimeFormat(lang, {
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
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState("idle"); // idle | inspected | restoring | done
  const [inspectedBackup, setInspectedBackup] = useState(null);
  const [selectedCats, setSelectedCats] = useState([]);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [avatarError, setAvatarError] = useState(false);
  const api = window.electronAPI;

  const handleSelectFile = async () => {
    if (!api?.backupOpenDialog) {
      setError(
        t(
          "profileSetup.apiNotAvailable",
          "La API nativa de copias de seguridad no está disponible."
        )
      );
      return;
    }
    setError(null);
    try {
      const res = await api.backupOpenDialog();
      if (!res.canceled && res.valid) {
        setInspectedBackup(res);
        setSelectedCats(res.categories || ["profile", "servers"]);
        setAvatarError(false);
        setStep("inspected");
      }
    } catch (err) {
      setError(
        err.message ||
          t("profileSetup.readBackupError", "Error al leer el archivo de copia.")
      );
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
      const res = await api.backupRestore(inspectedBackup.filePath, selectedCats);
      applyRestoredPacks(res);
      setStep("done");
    } catch (err) {
      setError(
        err.message ||
          t(
            "profileSetup.restoreGenericError",
            "Error durante la restauración."
          )
      );
      setStep("inspected");
    } finally {
      if (unsub) unsub();
    }
  };

  return (
    <div className="w-full">
      {step === "idle" && (
        <div className="flex flex-col gap-5 py-2">
          <div
            onClick={handleSelectFile}
            className="p-8 rounded-onicord-inner bg-onicord-base/40 border-2 border-dashed border-onicord-border-strong hover:border-onicord-accent/50 hover:bg-onicord-base/60 transition-all text-center cursor-pointer group"
          >
            <div className="w-14 h-14 rounded-2xl bg-onicord-accent/10 border border-onicord-accent/25 flex items-center justify-center mx-auto mb-3 text-onicord-accent group-hover:scale-105 transition-transform">
              <MaterialIcon name="settings_backup_restore" size={28} />
            </div>
            <h4 className="text-sm font-bold text-onicord-text mb-1">
              {t("profileSetup.restoreIdleTitle", "Restaurar cuenta")}
            </h4>
            <p className="text-xs text-onicord-muted max-w-sm mx-auto leading-relaxed">
              {t(
                "profileSetup.restoreIdleDesc",
                "Recupera tu perfil, servidores, salas y mensajes desde un backup"
              )}
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-onicord-button bg-onicord-danger/10 border border-onicord-danger/25 text-xs text-onicord-danger text-left">
              <MaterialIcon name="error_outline" size={16} className="shrink-0" />
              <span className="flex-1 leading-snug">{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-3">
            <button
              type="button"
              onClick={onBack}
              className="onicord-btn-secondary h-10 px-4 rounded-onicord-button text-xs sm:text-sm font-semibold text-onicord-text transition-colors cursor-pointer"
            >
              {t("profileSetup.backToSetup", "Volver a crear perfil")}
            </button>

            <button
              type="button"
              onClick={handleSelectFile}
              className="onicord-btn-primary h-10 px-5 rounded-onicord-button text-xs sm:text-sm font-semibold cursor-pointer shadow-md hover:shadow-onicord-accent/20 transition-all"
            >
              {t("profileSetup.browseBackup", "Examinar archivo .onipkg")}
            </button>
          </div>
        </div>
      )}

      {step === "inspected" && inspectedBackup && (
        <div className="flex flex-col gap-4 py-1">
          {/* Card preview of the backup */}
          <div className="flex flex-col sm:flex-row gap-5 items-stretch border border-onicord-accent/30 rounded-onicord-inner bg-onicord-base/50 p-4">
            {/* Left side: Profile snapshot */}
            <div className="flex sm:flex-col items-center justify-center text-center sm:w-44 shrink-0 gap-3 pb-3 sm:pb-0 sm:pr-2">
              <div className="relative w-20 h-20 rounded-full bg-onicord-accent/20 border-2 border-onicord-accent/40 flex items-center justify-center shrink-0 overflow-hidden shadow-sm">
                {inspectedBackup.profile?.avatar && !avatarError ? (
                  <img
                    src={inspectedBackup.profile.avatar}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={() => setAvatarError(true)}
                  />
                ) : (
                  <div className="flex items-center justify-center w-full h-full bg-onicord-accent/25 text-onicord-accent font-bold text-2xl uppercase">
                    {inspectedBackup.profile?.nickname?.charAt(0) || (
                      <MaterialIcon name="person" size={32} />
                    )}
                  </div>
                )}
              </div>
              <div className="text-left sm:text-center min-w-0 flex-1">
                <h4 className="text-sm font-bold text-onicord-text truncate">
                  {inspectedBackup.profile?.nickname || inspectedBackup.fileName}
                </h4>
                <p className="text-xs text-onicord-muted mt-0.5 truncate">
                  {formatDate(inspectedBackup.createdAt, i18n?.language || "es")}
                </p>
                <span className="inline-block text-2xs font-mono text-onicord-faded mt-1">
                  {formatBytes(inspectedBackup.fileSize)}
                </span>
              </div>
            </div>

            {/* Right side: Included Categories Selector */}
            <div className="flex-1 flex flex-col justify-between min-w-0">
              <div>
                <p className="text-xs uppercase font-bold text-onicord-muted tracking-wider mb-2">
                  {t("profileSetup.categoriesToRestore", "Categorías a restaurar:")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(inspectedBackup.categories || []).map((catId) => {
                    const isSelected = selectedCats.includes(catId);
                    return (
                      <button
                        key={catId}
                        type="button"
                        onClick={() => handleToggleCat(catId)}
                        className={`flex items-center justify-between p-2.5 rounded-onicord-button border text-left text-xs transition-all cursor-pointer ${
                          isSelected
                            ? "bg-onicord-accent/15 border-onicord-accent/40 text-onicord-text font-medium shadow-sm"
                            : "bg-onicord-base/30 border-onicord-border text-onicord-muted hover:border-onicord-border-strong"
                        }`}
                      >
                        <span className="truncate">
                          {t(CATEGORY_KEYS[catId] || catId, CATEGORY_FALLBACKS[catId] || catId)}
                        </span>
                        <MaterialIcon
                          name={isSelected ? "check_circle" : "radio_button_unchecked"}
                          size={16}
                          className={isSelected ? "text-onicord-accent" : "opacity-30"}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-onicord-button bg-onicord-danger/10 border border-onicord-danger/25 text-xs text-onicord-danger text-left">
              <MaterialIcon name="error_outline" size={16} className="shrink-0" />
              <span className="flex-1 leading-snug">{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-3">
            <button
              type="button"
              onClick={() => {
                setInspectedBackup(null);
                setAvatarError(false);
                setStep("idle");
              }}
              className="onicord-btn-secondary h-10 px-4 rounded-onicord-button text-xs sm:text-sm font-semibold text-onicord-text transition-colors cursor-pointer"
            >
              {t("profileSetup.selectAnotherFile", "Seleccionar otro archivo")}
            </button>

            <button
              type="button"
              onClick={handleRestore}
              disabled={selectedCats.length === 0}
              className="onicord-btn-primary h-10 px-5 rounded-onicord-button text-xs sm:text-sm font-semibold cursor-pointer shadow-md hover:shadow-onicord-accent/20 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("profileSetup.restoreBackupBtn", "Restaurar Copia de Seguridad")}
            </button>
          </div>
        </div>
      )}

      {step === "restoring" && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-14 h-14 rounded-2xl bg-onicord-accent/15 border border-onicord-accent/30 flex items-center justify-center text-onicord-accent animate-pulse">
            <MaterialIcon name="cloud_sync" size={30} />
          </div>
          <div className="w-full max-w-md space-y-2 text-center">
            <h4 className="text-sm font-bold text-onicord-text">
              {t("profileSetup.restoringTitle", "Restaurando tus datos")}
            </h4>
            <div className="flex justify-between text-xs text-onicord-muted px-1">
              <span className="truncate">
                {progress?.step ||
                  t("profileSetup.restoringStepDefault", "Procesando archivos...")}
              </span>
              <span className="font-mono font-bold text-onicord-accent">
                {progress?.percent || 0}%
              </span>
            </div>
            <div className="h-2.5 w-full bg-onicord-base rounded-full overflow-hidden border border-onicord-border p-[2px]">
              <div
                className="h-full bg-onicord-accent rounded-full transition-all duration-relaxed"
                style={{ width: `${progress?.percent || 0}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-onicord-muted text-center max-w-xs leading-relaxed">
            {t(
              "profileSetup.restoringWarning",
              "Por favor, no cierres la aplicación durante el proceso de restauración."
            )}
          </p>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-onicord-success/15 border border-onicord-success/30 flex items-center justify-center text-onicord-success shadow-lg shadow-emerald-500/10">
            <MaterialIcon name="check_circle" size={32} />
          </div>
          <div>
            <h3 className="text-base font-bold text-onicord-text">
              {t("profileSetup.restoreDoneTitle", "¡Restauración completada!")}
            </h3>
            <p className="text-xs text-onicord-muted mt-1 leading-relaxed max-w-xs">
              {t(
                "profileSetup.restoreDoneDesc",
                "Tus servidores, perfil y configuraciones se han restaurado correctamente."
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onRestoreComplete}
            className="onicord-btn-primary h-10 px-6 rounded-onicord-button text-xs sm:text-sm font-semibold cursor-pointer shadow-md hover:shadow-onicord-accent/20 transition-all mt-2"
          >
            {t("common.continue", "Continuar")}
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
  const [customStatus, setCustomStatus] = useState(initialProfile?.customStatus ?? "");
  const [avatar, setAvatar] = useState(initialProfile?.avatar ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showRestore, setShowRestore] = useState(false);
  const fileRef = useRef(null);

  const profileReady = nickname.trim().length >= 2;
  const isElectron = Boolean(window.electronAPI);

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
        customStatus: customStatus.trim() || undefined,
        audio: initialProfile?.audio,
      };
      const saved = window.electronAPI?.saveProfile
        ? await window.electronAPI.saveProfile(profile)
        : { ...profile, id: profile.id || crypto.randomUUID() };
      onComplete(saved);
    } catch (err) {
      setError(
        err.message || t("profileSetup.saveError", "No se pudo guardar el perfil.")
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-onicord-mantle px-4 sm:px-6 overflow-hidden select-none">
      {/* Subtle ambient lighting */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-onicord-accent/5 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-onicord-accent/5 blur-[120px]" />

      <div className="relative z-10 w-full max-w-[620px] rounded-onicord-outer-p4 border border-onicord-border-strong bg-onicord-surface p-6 sm:p-7 shadow-2xl shadow-black/50 onicord-animate-modal-in">
        {showRestore ? (
          <>
            <header className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-onicord-text tracking-tight">
                  {t("profileSetup.restoreTitle", "Restaurar Copia de Seguridad")}
                </h2>
                <p className="text-xs text-onicord-muted mt-0.5">
                  {t(
                    "profileSetup.restoreSubtitle",
                    "Recupera tu cuenta, configuración y servidores desde un backup"
                  )}
                </p>
              </div>
            </header>
            <OnipkgRestorePanel
              onBack={() => setShowRestore(false)}
              onRestoreComplete={onRestoreComplete}
            />
          </>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col">
            {/* Modal Header without any logo */}
            <header className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-onicord-text tracking-tight">
                  {t("profileSetup.title", "Configura tu perfil")}
                </h2>
                <p className="text-xs text-onicord-muted mt-0.5">
                  {t(
                    "profileSetup.subtitle",
                    "Tu identidad visible en todos tus servidores y canales"
                  )}
                </p>
              </div>
            </header>

            {/* Two-column layout matching the reference image */}
            <div className="flex flex-col sm:flex-row gap-6 items-stretch">
              {/* Left Column: Avatar & Action Buttons */}
              <div className="flex flex-col items-center justify-center text-center sm:w-52 shrink-0 py-1">
                <AvatarPicker
                  ref={fileRef}
                  src={avatar}
                  onChange={setAvatar}
                  onError={setError}
                  initial={nickname.trim() ? nickname.trim().charAt(0).toUpperCase() : ""}
                  fallbackIcon="person"
                  size="xl"
                  disabled={busy}
                  title={t("profileSetup.changeAvatar", "Cambiar foto")}
                  removeTitle={t("profileSetup.deleteAvatar", "Eliminar foto")}
                />

                <div className="mt-3">
                  <h4 className="text-xs font-semibold text-onicord-text">
                    {t("profileSetup.avatarLabel", "Foto de perfil")}
                  </h4>
                  <p className="text-xs text-onicord-muted mt-0.5">
                    {t("profileSetup.avatarHint", "Máx. 8 MB · PNG, JPG, WebP")}
                  </p>
                </div>

                {/* Action buttons below avatar (no icons on buttons) */}
                <div className="flex items-center gap-1.5 mt-3.5">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="onicord-btn-secondary h-8 px-3 rounded-onicord-button text-xs font-semibold border border-onicord-border-strong hover:border-onicord-border-strong hover:bg-onicord-hover transition-all cursor-pointer text-onicord-text"
                  >
                    {avatar
                      ? t("profileSetup.changeAvatar", "Cambiar foto")
                      : t("profileSetup.uploadAvatar", "Subir imagen")}
                  </button>
                  {avatar && (
                    <button
                      type="button"
                      onClick={() => setAvatar(null)}
                      className="onicord-btn-danger-soft h-8 px-2.5 rounded-onicord-button text-xs font-semibold transition-all cursor-pointer"
                    >
                      {t("common.delete", "Eliminar")}
                    </button>
                  )}
                </div>
              </div>

              {/* Right Column: Fields */}
              <div className="flex-1 flex flex-col justify-between min-w-0 py-1">
                <div className="space-y-4">
                  {/* Nickname Input Field */}
                  <div className="space-y-1.5 text-left w-full">
                    <div className="flex items-center justify-between">
                      <label className="onicord-field-label !mb-0">
                        {t("profileTab.nickname", "Nombre de usuario")}{" "}
                        <span className="text-onicord-accent">*</span>
                      </label>
                      <span className="text-2xs font-mono text-onicord-faded">
                        {nickname.length}/32
                      </span>
                    </div>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      maxLength={32}
                      className="onicord-input h-10 px-3.5 text-sm rounded-onicord-button bg-onicord-base border border-onicord-border-strong text-onicord-text placeholder:text-onicord-faded focus:border-onicord-accent focus:ring-1 focus:ring-onicord-accent transition-all w-full"
                      placeholder={t("profileTab.yourNamePlaceholder", "e.g. PlayerOne")}
                      autoFocus
                    />
                    <p className="text-xs text-onicord-faded pt-0.5">
                      {t(
                        "profileSetup.minCharsHint",
                        "Mínimo 2 caracteres · Visible en todos los servidores"
                      )}
                    </p>
                  </div>

                  {/* Custom Status Field (optional) */}
                  <div className="space-y-1.5 text-left w-full">
                    <label className="onicord-field-label !mb-0 flex items-center gap-1.5">
                      <span>{t("profileTab.statusLabel", "Estado personalizado")}</span>
                      <span className="text-2xs text-onicord-faded font-normal">
                        ({t("common.optional", "Opcional")})
                      </span>
                    </label>
                    <input
                      type="text"
                      value={customStatus}
                      onChange={(e) => setCustomStatus(e.target.value)}
                      maxLength={64}
                      className="onicord-input h-10 px-3.5 text-sm rounded-onicord-button bg-onicord-base border border-onicord-border-strong text-onicord-text placeholder:text-onicord-faded focus:border-onicord-accent focus:ring-1 focus:ring-onicord-accent transition-all w-full"
                      placeholder={t(
                        "profileTab.statusPlaceholder",
                        "Ej. En llamada de voz / Programando..."
                      )}
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-2.5 mt-3 rounded-onicord-button bg-onicord-danger/10 border border-onicord-danger/25 text-xs text-onicord-danger text-left">
                    <MaterialIcon name="error_outline" size={15} className="shrink-0" />
                    <span className="flex-1 leading-snug">{error}</span>
                  </div>
                )}

                {/* Footer Action Buttons (Same h-10 height, no icons) */}
                <div className="flex items-center justify-between gap-3 pt-4 mt-2">
                  {isElectron ? (
                    <button
                      type="button"
                      onClick={() => setShowRestore(true)}
                      className="onicord-btn-secondary h-10 px-4 rounded-onicord-button border border-onicord-border-strong hover:border-onicord-border-strong text-xs sm:text-sm font-semibold text-onicord-text transition-colors cursor-pointer"
                    >
                      {t("profileSetup.restoreAccount", "Restaurar cuenta")}
                    </button>
                  ) : (
                    <div />
                  )}

                  <button
                    type="submit"
                    disabled={!profileReady || busy}
                    className="onicord-btn-primary h-10 px-6 rounded-onicord-button text-xs sm:text-sm font-semibold flex items-center justify-center cursor-pointer shadow-md hover:shadow-onicord-accent/20 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {busy ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-onicord-dark border-t-transparent" />
                    ) : (
                      t("common.continue", "Continuar")
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
