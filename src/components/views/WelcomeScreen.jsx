import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import JoinModal from "../modals/JoinModal";
import MaterialIcon from "../icons/MaterialIcon";

const MAX_AVATAR_SIZE = 512 * 1024;

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
      day: "numeric", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(isoString));
  } catch { return isoString; }
}

// ─── DRIVE RESTORE PANEL ──────────────────────────────────────────────────────
function DriveRestorePanel({ onBack, onRestoreComplete }) {
  const [step, setStep] = useState("idle"); // idle | connecting | listing | restoring | done
  const [backups, setBackups] = useState([]);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [restoredInfo, setRestoredInfo] = useState(null);
  const api = window.electronAPI;

  const handleConnect = async () => {
    setStep("connecting");
    setError(null);
    try {
      const result = await api.driveAuthorize();
      if (!result?.connected) throw new Error("No se pudo conectar.");
      setStep("listing");
      const list = await api.driveListBackups();
      setBackups(list || []);
    } catch (err) {
      setError(err.message || "Error al conectar con Google Drive.");
      setStep("idle");
    }
  };

  const handleRestore = async (backup) => {
    setStep("restoring");
    setError(null);
    let unsub = null;
    if (api.onDriveProgress) {
      unsub = api.onDriveProgress((data) => setProgress(data));
    }
    try {
      await api.driveDownloadBackup(backup.id, backup.categories);
      setRestoredInfo(backup);
      setStep("done");
    } catch (err) {
      setError(err.message || "Error al restaurar.");
      setStep("listing");
    } finally {
      if (unsub) unsub();
    }
  };

  return (
    <div className="w-full">
      {step === "idle" && (
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 rounded-2xl bg-onicord-base/40 border border-white/5 w-full text-center">
            <MaterialIcon name="cloud_upload" size={32} className="text-onicord-accent mx-auto mb-2" />
            <p className="text-sm text-onicord-muted leading-relaxed">
              Restaura tu perfil, servidores y más desde un backup guardado en Google Drive.
            </p>
          </div>
          {error && <p className="text-xs text-red-400 text-center">{error}</p>}
          <button
            type="button"
            onClick={handleConnect}
            className="flex items-center gap-2.5 px-5 py-2.5 bg-white hover:bg-gray-100 text-gray-800 font-semibold text-sm rounded-xl transition-all shadow-md w-full justify-center cursor-pointer"
          >
            <GoogleLogo />
            {t("drive.connectBtn", "Conectar con Google Drive")}
          </button>
          <button type="button" onClick={onBack} className="text-xs text-onicord-muted hover:text-white transition-colors cursor-pointer">
            ← {t("common.back", "Volver")}
          </button>
        </div>
      )}

      {step === "connecting" && (
        <div className="flex flex-col items-center gap-4 py-6">
          <span className="w-8 h-8 border-2 border-onicord-accent/30 border-t-onicord-accent rounded-full animate-spin" />
          <p className="text-sm text-onicord-muted text-center">
            {t("drive.connecting", "Abriendo Google… Autoriza el acceso en la ventana que apareció.")}
          </p>
        </div>
      )}

      {step === "listing" && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-onicord-muted uppercase tracking-wider">
            {t("drive.yourBackups", "Tus backups de Onicord")}
          </p>
          {backups.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2 text-onicord-muted">
              <MaterialIcon name="cloud_off" size={32} className="opacity-30" />
              <p className="text-xs text-center">{t("drive.noBackups", "No hay backups disponibles en Drive.")}</p>
              <button type="button" onClick={onBack} className="text-xs text-onicord-accent hover:underline mt-2 cursor-pointer">
                ← {t("drive.createFromScratch", "Crear perfil desde cero")}
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-2 max-h-[280px] overflow-y-auto minimal-scrollbar pr-1">
                {backups.map((backup) => (
                  <div key={backup.id} className="border border-white/5 rounded-xl bg-onicord-base/30 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{backup.name}</p>
                        <p className="text-[10px] text-onicord-muted mt-0.5">
                          {formatDate(backup.createdAt)} · {formatBytes(backup.size)}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {backup.categories.map((c) => (
                            <span key={c} className="text-[9px] uppercase font-bold bg-onicord-accent/10 text-onicord-accent border border-onicord-accent/20 px-1.5 py-0.5 rounded">
                              {CATEGORY_LABELS[c] || c}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRestore(backup)}
                        className="shrink-0 text-[11px] font-bold text-onicord-dark bg-onicord-accent hover:bg-onicord-accent/80 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <MaterialIcon name="restore" size={13} />
                        {t("drive.restoreAction", "Restaurar")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={onBack} className="text-xs text-onicord-muted hover:text-white transition-colors mt-1 cursor-pointer">
                ← {t("drive.createFromScratch", "Crear perfil desde cero")}
              </button>
            </>
          )}
        </div>
      )}

      {step === "restoring" && (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-full space-y-2">
            <div className="flex justify-between text-xs text-onicord-muted">
              <span>{progress?.step || t("drive.restoringData", "Restaurando tus datos...")}</span>
              <span className="font-mono font-bold text-onicord-accent">{progress?.percent || 0}%</span>
            </div>
            <div className="h-2 w-full bg-onicord-base/60 rounded-full overflow-hidden border border-white/5">
              <div
                className="h-full bg-onicord-accent rounded-full transition-all duration-300"
                style={{ width: `${progress?.percent || 0}%` }}
              />
            </div>
          </div>
          <p className="text-[11px] text-onicord-muted text-center">{t("drive.doNotClose", "No cierres la aplicación durante la restauración.")}</p>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <MaterialIcon name="check_circle" size={28} className="text-emerald-400" />
          </div>
          <div className="text-center">
            <h3 className="text-base font-bold text-white">{t("drive.restoreCompleted", "Restauración completada")}</h3>
            <p className="text-xs text-onicord-muted mt-1">
              {restoredInfo?.categories?.map((c) => CATEGORY_LABELS[c] || c).join(", ")} {t("cloudBackup.toasts.restoreSuccess", "restaurado correctamente.")}
            </p>
          </div>
          <button
            type="button"
            onClick={onRestoreComplete}
            className="onicord-btn-cta-primary w-full py-2.5 flex items-center justify-center gap-2"
          >
            {t("common.continue", "Continuar")} →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── GOOGLE LOGO ──────────────────────────────────────────────────────────────
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

// ─── MAIN WELCOME SCREEN ──────────────────────────────────────────────────────
export default function WelcomeScreen({
  initialProfile,
  onProfileSave,
  onRoomActive,
  onRestoreComplete,
}) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState(initialProfile?.nickname ?? "");
  const [avatar, setAvatar] = useState(initialProfile?.avatar ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showJoin, setShowJoin] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const fileRef = useRef(null);

  const profileReady = nickname.trim().length >= 2;
  const isElectron = Boolean(window.electronAPI);

  const buildProfile = () => ({ nickname: nickname.trim(), avatar });

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Select a valid image (PNG, JPG, WebP).");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setError("Image must be smaller than 512 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => { setAvatar(reader.result); setError(null); };
    reader.readAsDataURL(file);
  };

  const ensureProfile = async () => {
    if (!profileReady) { setError("Enter a nickname of at least 2 characters."); return null; }
    return onProfileSave(buildProfile());
  };

  const handleCreateServer = async () => {
    if (!isElectron) { setError(t("welcome.browserError")); return; }
    setBusy(true); setError(null);
    try {
      const profile = await ensureProfile();
      if (!profile) return;
      const { code } = await window.electronAPI.createRoom(profile);
      onRoomActive({ code, isHost: true });
    } catch (err) {
      setError(err.message || "No se pudo crear la sala.");
    } finally { setBusy(false); }
  };

  const handleJoin = async (code) => {
    if (!isElectron) { setError(t("welcome.usePowerShellError")); return; }
    setBusy(true); setError(null);
    try {
      const profile = await ensureProfile();
      if (!profile) return;
      const { code: joined } = await window.electronAPI.joinRoom(code, profile);
      setShowJoin(false);
      onRoomActive({ code: joined, isHost: false });
    } catch (err) {
      setError(err.message || "No se pudo unir a la sala.");
    } finally { setBusy(false); }
  };

  if (showRestore) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-onicord-overlayer px-6">
        <div className="onicord-setup-card max-w-lg w-full">
          <header className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-onicord-outer-p4 bg-onicord-accent text-2xl font-bold text-white">O</div>
            <h1 className="text-xl font-bold text-onicord-text">{t("drive.restoreTitle", "Restaurar desde Google Drive")}</h1>
          </header>
          <DriveRestorePanel
            onBack={() => setShowRestore(false)}
            onRestoreComplete={onRestoreComplete}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-onicord-overlayer px-6">
      <div className="onicord-setup-card max-w-lg">
        {!isElectron && (
          <div className="mb-6 rounded-onicord-inner border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <p className="font-semibold">{t("welcome.browserMode")}</p>
            <p className="mt-1 text-amber-200/80">{t("welcome.browserTip")}</p>
          </div>
        )}

        <header className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-onicord-outer-p4 bg-onicord-accent text-2xl font-bold text-white">O</div>
          <h1 className="text-2xl font-bold text-onicord-text">{t("welcome.title", "Oniverse Voice")}</h1>
          <p className="mt-1 text-sm text-onicord-muted">{t("welcome.subtitle")}</p>
        </header>

        <section className="mb-8">
          <h2 className="onicord-sidebar-header mb-4 px-0 text-onicord-muted">{t("welcome.yourProfile", "Tu perfil")}</h2>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="onicord-avatar-picker group relative h-24 w-24"
            >
              {avatar ? (
                <img src={avatar} alt="Profile" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-3xl text-onicord-muted group-hover:text-onicord-text">+</span>
              )}
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <div className="flex-1">
              <label htmlFor="nickname" className="mb-1 block text-sm font-medium text-onicord-text">
                {t("profileTab.nickname")}
              </label>
              <input
                id="nickname"
                type="text"
                maxLength={32}
                placeholder={t("welcome.nicknamePlaceholder", "e.g. PlayerOne")}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="onicord-input"
              />
              <p className="mt-1 text-xs text-onicord-muted">
                {t("welcome.profileTip", "Se enviará a otros pares al conectar (JSON + Imagen Base64).")}
              </p>
            </div>
          </div>
        </section>

        {error && <div className="onicord-error-banner mb-4">{error}</div>}

        <section className="grid gap-3">
          <button
            type="button"
            disabled={!profileReady || busy}
            onClick={handleCreateServer}
            className="onicord-btn-cta-primary"
          >
            {busy ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <><ServerIcon /> {t("welcome.createServer", "Crear Servidor (Generar Código)")}</>
            )}
          </button>

          <button
            type="button"
            disabled={!profileReady || busy}
            onClick={() => setShowJoin(true)}
            className="onicord-btn-cta-secondary"
          >
            <LinkIcon />
            {t("welcome.joinWithCode", "Unirse con Código")}
          </button>
        </section>

        <p className="mt-6 text-center text-xs text-onicord-muted">
          Hyperswarm + DHT · Automatic hole punching · WebRTC
        </p>
      </div>

      {showJoin && (
        <JoinModal onClose={() => setShowJoin(false)} onJoin={handleJoin} busy={busy} />
      )}
    </div>
  );
}

function ServerIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}
