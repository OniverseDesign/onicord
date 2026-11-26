import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import SmartAnimatedImage from "../ui/SmartAnimatedImage";
import SegmentedControl from "../ui/SegmentedControl";
import ConfirmDialogModal from "../modals/ConfirmDialogModal";
import { copyTextToClipboard } from "../../lib/clipboard";
import {
  getWebInviteUrl,
  getNativeDeepLink,
  formatInviteToken,
  formatManagedInviteToken,
} from "../../lib/inviteUtils";
import { useStreamerMode } from "../../context/StreamerModeContext";

const INVITE_DURATIONS = [
  { key: "30m", shortKey: "serverSettings.invites.duration30mShort", shortFallback: "30m", fullKey: "serverSettings.invites.duration30m", fullFallback: "30 min" },
  { key: "1h", shortKey: "serverSettings.invites.duration1hShort", shortFallback: "1h", fullKey: "serverSettings.invites.duration1h", fullFallback: "1 h" },
  { key: "6h", shortKey: "serverSettings.invites.duration6hShort", shortFallback: "6h", fullKey: "serverSettings.invites.duration6h", fullFallback: "6 h" },
  { key: "24h", shortKey: "serverSettings.invites.duration24hShort", shortFallback: "24h", fullKey: "serverSettings.invites.duration24h", fullFallback: "24 h" },
  { key: "7d", shortKey: "serverSettings.invites.duration7dShort", shortFallback: "7d", fullKey: "serverSettings.invites.duration7d", fullFallback: "7 días" },
  { key: "never", shortKey: "serverSettings.invites.durationNeverShort", shortFallback: "Nunca", fullKey: "serverSettings.invites.durationNever", fullFallback: "Sin vencimiento" },
];

function formatRemainingTime(expiresAt, nowMs, t) {
  if (!expiresAt) return t("serverSettings.invites.neverExpires", "Sin vencimiento");
  const diff = Math.max(0, Number(expiresAt) - nowMs);
  if (diff <= 0) return t("serverSettings.invites.expired", "Vencida");
  const totalMins = Math.ceil(diff / 60000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function ServerInviteTab({
  server,
  copyCode,
  copied,
  canManageInvites = false,
  onServerUpdated,
}) {
  const { t } = useTranslation();
  const { isStreamerMode } = useStreamerMode();
  const [revealedInStream, setRevealedInStream] = useState(false);
  const [shareFormat, setShareFormat] = useState("web");
  const [copiedValue, setCopiedValue] = useState(false);
  const [selectedDuration, setSelectedDuration] = useState("24h");
  const [showLegacyCreate, setShowLegacyCreate] = useState(false);
  const [busyAction, setBusyAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [rotationSuccess, setRotationSuccess] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const roomCode = server?.roomCode || server?.code || server?.id || "";
  const roomSecret = server?.roomSecret || null;
  const serverName = server?.name || "Servidor Onicord";
  const serverAvatar = server?.icon || null;
  const initial = serverName.trim()?.[0]?.toUpperCase() || "?";

  const activeInvite = server?.activeInvite || null;
  const hasManagedInvite = Boolean(activeInvite && activeInvite.inviteSecret);
  const isExpired = Boolean(
    hasManagedInvite && activeInvite.expiresAt && nowMs >= Number(activeInvite.expiresAt)
  );
  const isRevoked = Boolean(hasManagedInvite && activeInvite.revoked);
  const isManagedInviteValid = Boolean(hasManagedInvite && !isRevoked && !isExpired);

  // Use the single active expiring invite when valid; only fall back to legacy roomSecret if no managed invite has been created yet
  const showFallbackSecretInvite = !hasManagedInvite;
  const canShareInvite = isManagedInviteValid || showFallbackSecretInvite;
  const isShowingCreate = !canShareInvite || showLegacyCreate;

  const inviteToken = isManagedInviteValid
    ? formatManagedInviteToken(roomCode, activeInvite.inviteSecret)
    : showFallbackSecretInvite
      ? formatInviteToken(roomCode, roomSecret)
      : "";
  const webLink = isManagedInviteValid
    ? getWebInviteUrl(roomCode, serverName, activeInvite.inviteSecret, { isManagedInvite: true })
    : showFallbackSecretInvite
      ? getWebInviteUrl(roomCode, serverName, roomSecret)
      : "";
  const deepLink = isManagedInviteValid
    ? getNativeDeepLink(roomCode, activeInvite.inviteSecret, { isManagedInvite: true })
    : showFallbackSecretInvite
      ? getNativeDeepLink(roomCode, roomSecret)
      : "";

  const shouldMask = isStreamerMode && !revealedInStream;

  const formatMeta = useMemo(() => {
    if (shareFormat === "code") {
      return {
        value: inviteToken,
        masked: "••••••••",
        label: t("serverSettings.invites.formatCode", "Código"),
        hint: t("serverSettings.invites.codeHint", "Código seguro de invitación para unirse manualmente desde la pantalla principal."),
      };
    }
    if (shareFormat === "native") {
      return {
        value: deepLink,
        masked: "onicord://join/••••••••",
        label: t("serverSettings.invites.formatNative", "Nativo"),
        hint: t("serverSettings.invites.nativeLinkHint", "Enlace de protocolo onicord:// para abrir la app directamente."),
      };
    }
    return {
      value: webLink,
      masked: "https://onicord.com/join/••••••••",
      label: t("serverSettings.invites.formatWeb", "Enlace Web"),
      hint: t("serverSettings.invites.webLinkHint", "Abre Onicord automáticamente o guía a la descarga."),
    };
  }, [shareFormat, inviteToken, deepLink, webLink, t]);

  const displayedActiveValue = shouldMask ? formatMeta.masked : formatMeta.value;
  const isCurrentCopied = copiedValue || (shareFormat === "web" && copied);

  const currentEpoch = Math.max(1, Number(server?.currentKeyEpoch) || 1);
  const lastRotationText = server?.lastKeyRotationAt
    ? new Date(server.lastKeyRotationAt).toLocaleString()
    : null;

  const rawMemberCount = server?.savedMembers
    ? Object.keys(server.savedMembers).length
    : server?.membersCount || server?.members?.length || 1;
  const memberCount = Math.max(1, rawMemberCount);
  const onlineCount = Math.max(1, Math.min(memberCount, Math.ceil(memberCount * 0.7)));

  const refreshServerFromStore = async () => {
    if (onServerUpdated && window.electronAPI?.listServers) {
      const list = await window.electronAPI.listServers();
      const refreshed = list?.find((s) => s.roomCode === roomCode);
      if (refreshed) onServerUpdated(refreshed);
    }
  };

  const handleCopyCurrentFormat = async () => {
    if (!formatMeta.value) return;
    if (shareFormat === "web" && !isManagedInviteValid && !roomSecret && copyCode) {
      copyCode();
      return;
    }
    try {
      await copyTextToClipboard(formatMeta.value);
      setCopiedValue(true);
      setTimeout(() => setCopiedValue(false), 2000);
    } catch (e) {
      console.error("Error al copiar invitación:", e);
    }
  };

  const formatGovernanceError = (err) => {
    const msg = String(err?.message || "");
    if (msg.includes("ADMIN_KEY_NOT_REGISTERED")) {
      return t(
        "serverSettings.invites.adminKeyPending",
        "Tu clave pública de administrador aún no fue sincronizada con el propietario del servidor."
      );
    }
    if (msg.includes("UNAUTHORIZED_GOVERNANCE")) {
      return t(
        "serverSettings.invites.unauthorized",
        "Solo el propietario o un administrador autorizado puede realizar esta acción."
      );
    }
    return msg || t("serverSettings.invites.actionError", "No se pudo completar la operación.");
  };

  const handleGenerateInvite = async () => {
    if (!roomCode || busyAction || !window.electronAPI?.generateServerInvite) return;
    setBusyAction("generate");
    setActionError(null);
    try {
      await window.electronAPI.generateServerInvite(roomCode, selectedDuration);
      setNowMs(Date.now());
      setShowLegacyCreate(false);
      setCopiedValue(false);
      await refreshServerFromStore();
    } catch (err) {
      setActionError(formatGovernanceError(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleRevokeInvite = async () => {
    if (!roomCode || busyAction || !window.electronAPI?.revokeServerInvite) return;
    setBusyAction("revoke");
    setActionError(null);
    try {
      await window.electronAPI.revokeServerInvite(roomCode);
      setNowMs(Date.now());
      setCopiedValue(false);
      await refreshServerFromStore();
    } catch (err) {
      setActionError(formatGovernanceError(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmRotateKey = async () => {
    setRotateConfirmOpen(false);
    if (!roomCode || busyAction || !window.electronAPI?.rotateServerKey) return;
    setBusyAction("rotate");
    setActionError(null);
    try {
      await window.electronAPI.rotateServerKey(roomCode);
      setRotationSuccess(true);
      setTimeout(() => setRotationSuccess(false), 3000);
      await refreshServerFromStore();
    } catch (err) {
      setActionError(formatGovernanceError(err));
    } finally {
      setBusyAction(null);
    }
  };

  const formatOptions = useMemo(
    () => [
      { value: "web", label: t("serverSettings.invites.formatWeb", "Enlace Web") },
      { value: "code", label: t("serverSettings.invites.formatCode", "Código") },
      { value: "native", label: t("serverSettings.invites.formatNative", "Nativo") },
    ],
    [t]
  );

  const durationOptions = useMemo(
    () =>
      INVITE_DURATIONS.map((opt) => ({
        value: opt.key,
        label: t(opt.shortKey, opt.shortFallback),
        title: t(opt.fullKey, opt.fullFallback),
      })),
    [t]
  );

  const activeExpirySubtitle = useMemo(() => {
    if (isManagedInviteValid) {
      return activeInvite.expiresAt
        ? t("serverSettings.invites.expiresIn", "Expira en {{time}}", {
            time: formatRemainingTime(activeInvite.expiresAt, nowMs, t),
          })
        : t("serverSettings.invites.neverExpires", "Sin vencimiento");
    }
    return t("serverSettings.invites.codeHint", "Código seguro de invitación para unirse manualmente desde la pantalla principal.");
  }, [isManagedInviteValid, activeInvite, nowMs, t]);

  return (
    <div className="onicord-settings-container">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN */}
        <div className="md:col-span-6 space-y-4 min-w-0">
          {/* CARD 1: STATE-DRIVEN — EITHER ACTIVE INVITE OR CREATE INVITE */}
          {!isShowingCreate ? (
            <div className="onicord-settings-card min-w-0 overflow-hidden space-y-3">
              <div>
                <h3 className="onicord-settings-section-title !mb-0">
                  {t("serverSettings.invites.activeInviteTitle", "Invitación activa")}
                </h3>
                <p className="onicord-settings-row-desc mt-1">
                  {activeExpirySubtitle}
                </p>
              </div>

              {actionError && (
                <div className="onicord-error-banner text-xs py-2 px-3">
                  {actionError}
                </div>
              )}

              <SegmentedControl
                size="sm"
                value={shareFormat}
                onChange={(val) => {
                  setShareFormat(val);
                  setCopiedValue(false);
                }}
                options={formatOptions}
                ariaLabel={t("serverSettings.invites.activeInviteTitle", "Invitación activa")}
              />

              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="text"
                    readOnly
                    value={displayedActiveValue}
                    onFocus={(e) => e.target.select()}
                    title={shouldMask ? undefined : displayedActiveValue}
                    aria-label={formatMeta.label}
                    className="onicord-input font-mono text-xs truncate select-all"
                  />
                  {isStreamerMode && (
                    <button
                      type="button"
                      onClick={() => setRevealedInStream((r) => !r)}
                      className="onicord-icon-btn-md"
                      title={
                        revealedInStream
                          ? t("serverSettings.invites.hideCode", "Ocultar código")
                          : t("serverSettings.invites.revealCode", "Revelar código temporalmente")
                      }
                    >
                      <MaterialIcon name={revealedInStream ? "visibility_off" : "visibility"} size={16} />
                    </button>
                  )}
                </div>
                <p className="text-xs text-onicord-muted leading-relaxed">
                  {formatMeta.hint}
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyCurrentFormat}
                  className="onicord-btn-primary flex-1 gap-1.5"
                >
                  {isCurrentCopied && <MaterialIcon name="check" size={16} />}
                  <span>
                    {isCurrentCopied
                      ? t("serverSettings.invites.copiedGeneric", "¡Copiado!")
                      : t("serverSettings.invites.copySelected", "Copiar")}
                  </span>
                </button>

                {canManageInvites && isManagedInviteValid && (
                  <button
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={handleRevokeInvite}
                    className="onicord-btn-danger-soft shrink-0"
                  >
                    {busyAction === "revoke"
                      ? t("common.loading", "Cargando...")
                      : t("serverSettings.invites.revoke", "Revocar")}
                  </button>
                )}

                {canManageInvites && showFallbackSecretInvite && (
                  <button
                    type="button"
                    disabled={Boolean(busyAction)}
                    onClick={() => setShowLegacyCreate(true)}
                    className="onicord-btn-secondary-outline !flex-none shrink-0"
                  >
                    {t("serverSettings.invites.upgradeToExpiring", "Usar temporal")}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="onicord-settings-card min-w-0 overflow-hidden space-y-3">
              <div>
                <h3 className="onicord-settings-section-title !mb-0">
                  {canManageInvites
                    ? t("serverSettings.invites.createInviteTitle", "Crear invitación")
                    : t("serverSettings.invites.activeInviteTitle", "Invitación activa")}
                </h3>
                <p className="onicord-settings-row-desc mt-1">
                  {canManageInvites
                    ? t(
                        "serverSettings.invites.createInviteDesc",
                        "Solo puede existir una invitación activa a la vez. Elegí cuánto tiempo durará antes de vencer."
                      )
                    : t(
                        "serverSettings.invites.noActiveMemberHint",
                        "No hay ninguna invitación activa en este momento. Pedile a un administrador que genere una."
                      )}
                </p>
              </div>

              {actionError && (
                <div className="onicord-error-banner text-xs py-2 px-3">
                  {actionError}
                </div>
              )}

              {canManageInvites && (
                <>
                  <div className="space-y-1.5 pt-1">
                    <p className="text-xs font-semibold text-onicord-text">
                      {t("serverSettings.invites.durationLabel", "Duración de la invitación")}
                    </p>
                    <SegmentedControl
                      size="sm"
                      itemClassName="px-1"
                      disabled={Boolean(busyAction)}
                      value={selectedDuration}
                      onChange={setSelectedDuration}
                      options={durationOptions}
                      ariaLabel={t("serverSettings.invites.durationLabel", "Duración de la invitación")}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      disabled={Boolean(busyAction)}
                      onClick={handleGenerateInvite}
                      className="onicord-btn-primary flex-1"
                    >
                      {busyAction === "generate"
                        ? t("common.loading", "Cargando...")
                        : t("serverSettings.invites.createInviteBtn", "Crear invitación")}
                    </button>

                    {showLegacyCreate && canShareInvite && (
                      <button
                        type="button"
                        disabled={Boolean(busyAction)}
                        onClick={() => setShowLegacyCreate(false)}
                        className="onicord-btn-secondary shrink-0"
                      >
                        {t("common.cancel", "Cancelar")}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* CARD 2: EPOCH KEY ROTATION (OWNER & ADMINS) */}
          {canManageInvites && (
            <div className="onicord-settings-card min-w-0 overflow-hidden space-y-3">
              <div>
                <h3 className="onicord-settings-section-title !mb-0">
                  {t("serverSettings.invites.keyEpochTitle", "Clave de Cifrado por Épocas")}
                </h3>
                <p className="onicord-settings-row-desc mt-1">
                  {t(
                    "serverSettings.invites.keyEpochDesc",
                    "Rota la clave AES-256-GCM para mensajes futuros (también rota automáticamente al banear a un miembro). Los miembros legítimos conservan el historial previo."
                  )}
                </p>
              </div>

              <p className="text-xs text-onicord-muted">
                {t("serverSettings.invites.epochStatus", "Época actual: #{{epoch}}", {
                  epoch: currentEpoch,
                })}
                {lastRotationText && (
                  <> · {t("serverSettings.invites.lastRotation", "Última rotación:")} {lastRotationText}</>
                )}
              </p>

              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => setRotateConfirmOpen(true)}
                className="onicord-btn-secondary-outline w-full gap-1.5"
              >
                {rotationSuccess && (
                  <MaterialIcon name="check" size={16} className="text-onicord-success" />
                )}
                <span>
                  {busyAction === "rotate"
                    ? t("common.loading", "Cargando...")
                    : rotationSuccess
                      ? t("serverSettings.invites.keyRotatedSuccess", "¡Clave rotada a la nueva época!")
                      : t("serverSettings.invites.rotateKeyBtn", "Rotar clave de cifrado")}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: LIVE PREVIEW MIRRORING INVITEMODAL */}
        <div className="md:col-span-6 min-w-0">
          <div className="onicord-settings-card flex flex-col items-center space-y-3">
            <h3 className="onicord-settings-section-title self-start !mb-0">
              {t("settings.theme.preview", "Vista Previa en Vivo")}
            </h3>

            <div
              className={`relative w-full max-w-sm rounded-2xl bg-onicord-base/90 border border-onicord-island overflow-hidden transition-opacity duration-fast ${
                !canShareInvite ? "opacity-55" : ""
              }`}
            >
              <div className="relative flex flex-col items-center px-8 pt-10 pb-7">
                <div className="mb-5 relative">
                  <div className="w-[88px] h-[88px] rounded-full ring-4 ring-onicord-surface overflow-hidden shrink-0 bg-onicord-base">
                    {serverAvatar ? (
                      <SmartAnimatedImage
                        src={serverAvatar}
                        alt={serverName}
                        className="w-full h-full object-cover"
                        isAvatar
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-3xl font-black text-onicord-text select-none"
                        style={{
                          background:
                            "linear-gradient(135deg, rgba(var(--onicord-lavender)/0.9), rgba(var(--onicord-lavender)/0.5))",
                        }}
                      >
                        {initial}
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-sm font-medium text-onicord-muted select-none mb-1">
                  {t("inviteModal.invited", "Has sido invitado a unirte a")}
                </p>

                <h2 className="text-2xl font-extrabold text-onicord-text text-center leading-tight mb-4 select-none break-words max-w-full">
                  {serverName}
                </h2>

                <div className="flex items-center justify-center gap-2 mb-6 flex-wrap select-none">
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-onicord-success/10 border border-onicord-success/20 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-onicord-success shrink-0 animate-pulse" />
                    <span className="text-xs font-semibold text-onicord-text leading-none">
                      {onlineCount} {t("inviteModal.online", "En línea")}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-onicord-tint/10 border border-onicord-tint/60 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-onicord-tint/60 shrink-0" />
                    <span className="text-xs font-semibold text-onicord-text leading-none">
                      {memberCount}{" "}
                      {memberCount === 1
                        ? t("serverSettings.invites.member", "Miembro")
                        : t("serverSettings.invites.members", "Miembros")}
                    </span>
                  </div>
                </div>

                {isManagedInviteValid && activeInvite?.expiresAt && (
                  <p className="text-xs text-onicord-muted select-none mb-4">
                    {t("serverSettings.invites.expiresIn", "Expira en {{time}}", {
                      time: formatRemainingTime(activeInvite.expiresAt, nowMs, t),
                    })}
                  </p>
                )}

                <div className="w-full flex flex-col gap-2.5">
                  <div
                    aria-hidden="true"
                    className="w-full py-3 rounded-xl font-bold text-base text-center select-none pointer-events-none"
                    style={{
                      background: "rgba(var(--onicord-lavender)/0.85)",
                      color: "#fff",
                    }}
                  >
                    {t("inviteModal.accept", "Aceptar Invitación")}
                  </div>

                  <div
                    aria-hidden="true"
                    className="w-full py-2.5 rounded-xl font-semibold text-sm text-center text-onicord-muted select-none pointer-events-none"
                  >
                    {t("inviteModal.cancel", "Cancelar")}
                  </div>
                </div>
              </div>
            </div>

            {!canShareInvite && (
              <p className="text-xs text-onicord-muted text-center">
                {t(
                  "serverSettings.invites.inactivePreviewHint",
                  "No hay una invitación activa. Creá una nueva para volver a compartir este servidor."
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {rotateConfirmOpen && (
        <ConfirmDialogModal
          title={t("serverSettings.invites.rotateConfirmTitle", "¿Rotar clave de cifrado del servidor?")}
          message={t(
            "serverSettings.invites.rotateConfirmMessage",
            "Se creará una nueva época de cifrado (#{{nextEpoch}}). Todos los mensajes nuevos usarán la clave nueva; los miembros autorizados seguirán leyendo el historial anterior automáticamente.",
            { nextEpoch: currentEpoch + 1 }
          )}
          confirmText={t("serverSettings.invites.rotateKeyBtn", "Rotar clave de cifrado")}
          variant="warning"
          onConfirm={handleConfirmRotateKey}
          onCancel={() => setRotateConfirmOpen(false)}
        />
      )}
    </div>
  );
}
