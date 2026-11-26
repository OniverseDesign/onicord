import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import Heading from "../ui/Heading";
import Text from "../ui/Text";
import { copyTextToClipboard } from "../../lib/clipboard";
import { soundEngine } from "../../lib/soundEngine";
import { useAnimatedMount } from "../../hooks/useAnimatedMount";
import { cn } from "../../lib/cn";

export default function PeerSecurityModal({
  member,
  onClose,
  onVerificationChanged,
}) {
  const { t } = useTranslation();
  const isOpen = Boolean(member);
  const { shouldRender, isAnimatingOut } = useAnimatedMount(isOpen, 140);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copiedSafety, setCopiedSafety] = useState(false);
  const [verification, setVerification] = useState(null);

  const targetUserId = member?.userId || member?.id || null;
  const targetPeerId = member?.peerId || null;

  const loadVerification = useCallback(async () => {
    if (!targetUserId && !targetPeerId) return;
    setLoading(true);
    try {
      const res = await window.electronAPI?.getPeerVerification?.({
        userId: targetUserId,
        peerId: targetPeerId,
      });
      setVerification(res || null);
    } catch (err) {
      console.error("[PeerSecurityModal] Error loading peer verification:", err);
      setVerification(null);
    } finally {
      setLoading(false);
    }
  }, [targetUserId, targetPeerId]);

  useEffect(() => {
    if (isOpen) {
      soundEngine.playNav("open");
      setCopiedSafety(false);
      loadVerification();
    }
  }, [isOpen, loadVerification]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        soundEngine.playNav("close");
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!shouldRender) return null;

  const status = verification?.status || "unavailable";
  const safetyGroups = Array.isArray(verification?.safetyNumberGroups)
    ? verification.safetyNumberGroups
    : [];
  const isVerified = status === "verified";
  const canVerify =
    Boolean(verification?.peerPublicKey) &&
    status !== "unauthenticated" &&
    status !== "unavailable";

  const statusMeta = (() => {
    switch (status) {
      case "verified":
        return {
          icon: "verified_user",
          boxClass: "bg-onicord-success/10 border-onicord-success/30 text-onicord-success",
          title: t("security.statusVerifiedTitle", "Identidad verificada"),
          desc: t(
            "security.statusVerifiedDesc",
            "Marcaste la clave pública de este contacto como verificada."
          ),
        };
      case "key_changed":
        return {
          icon: "gpp_maybe",
          boxClass: "bg-onicord-danger/10 border-onicord-danger/30 text-onicord-danger",
          title: t("security.statusKeyChangedTitle", "Clave de seguridad cambiada"),
          desc: t(
            "security.statusKeyChangedDesc",
            "Este usuario se conectó con una clave criptográfica distinta a la registrada anteriormente. Verifica el Safety Number por otro medio."
          ),
        };
      case "unauthenticated":
        return {
          icon: "gpp_bad",
          boxClass: "bg-onicord-warning/10 border-onicord-warning/30 text-onicord-warning",
          title: t("security.statusUnauthTitle", "Transporte no autenticado"),
          desc: t(
            "security.statusUnauthDesc",
            "Esta conexión no completó autenticación Noise XX, por lo que no puede marcarse como verificada."
          ),
        };
      case "unavailable":
        return {
          icon: "shield",
          boxClass: "bg-onicord-tint/5 border-onicord-border text-onicord-muted",
          title: t("security.statusUnavailableTitle", "Clave aún no disponible"),
          desc: t(
            "security.statusUnavailableDesc",
            "Aún no se ha observado una sesión P2P autenticada con este usuario en este dispositivo."
          ),
        };
      default:
        return {
          icon: "shield",
          boxClass: "bg-onicord-info/10 border-onicord-info/25 text-onicord-info",
          title: t("security.statusUnverifiedTitle", "Sin verificar"),
          desc: t(
            "security.statusUnverifiedDesc",
            "Compara este Safety Number con tu contacto por una llamada o canal externo de confianza."
          ),
        };
    }
  })();

  const transportLabel = (() => {
    switch (verification?.transportAuth) {
      case "noise-hyperswarm":
        return t("security.transportHyperswarm", "Noise XX · Hyperswarm");
      case "noise-direct-tcp":
        return t("security.transportDirectTcp", "Noise XX · Direct TCP");
      case "offline":
        return t("security.transportOffline", "Sin conexión activa (TOFU)");
      case "unauthenticated":
        return t("security.transportUnauthenticated", "No autenticado");
      default:
        return t("security.transportUnknown", "Desconocido");
    }
  })();

  const handleToggleVerify = async () => {
    if (!canVerify || saving) return;
    setSaving(true);
    try {
      const nextVerified = !isVerified;
      const res = await window.electronAPI?.setPeerVerified?.({
        userId: targetUserId,
        peerPublicKey: verification.peerPublicKey,
        verified: nextVerified,
      });
      if (res?.ok && res.verification) {
        setVerification(res.verification);
        soundEngine.playCue(nextVerified ? "success" : "click");
        onVerificationChanged?.({
          userId: targetUserId,
          peerId: verification.peerPublicKey,
          status: res.verification.status,
        });
      }
    } catch (err) {
      console.error("[PeerSecurityModal] Error toggling verification:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleCopySafety = () => {
    if (!verification?.safetyNumber) return;
    copyTextToClipboard(verification.safetyNumber);
    setCopiedSafety(true);
    setTimeout(() => setCopiedSafety(false), 2000);
  };

  return createPortal(
    <div
      className={cn(
        "onicord-modal-backdrop !z-modal-nested p-4",
        isAnimatingOut && "onicord-animate-backdrop-out"
      )}
      onClick={() => {
        soundEngine.playNav("close");
        onClose?.();
      }}
      role="presentation"
    >
      <div
        className={cn(
          "onicord-modal-card !z-modal-nested-card w-full max-w-md",
          isAnimatingOut && "onicord-animate-modal-out"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-onicord-accent/15 border border-onicord-accent/25 flex items-center justify-center shrink-0 text-onicord-accent">
              <MaterialIcon name={statusMeta.icon} size={20} />
            </div>
            <div className="min-w-0">
              <Heading level={2} size="lg" className="leading-tight truncate">
                {t("security.modalTitle", "Verificar Seguridad")}
              </Heading>
              <Text variant="xs" color="muted" truncate>
                {member?.nickname || t("common.user", "Usuario")}
              </Text>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEngine.playNav("close");
              onClose?.();
            }}
            className="onicord-icon-btn shrink-0"
            aria-label={t("common.close", "Cerrar")}
          >
            <MaterialIcon name="close" size="base" />
          </button>
        </div>

        {loading ? (
          <div className="py-10 flex flex-col items-center justify-center gap-2 text-onicord-muted">
            <span className="w-5 h-5 border-2 border-onicord-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">{t("common.loading", "Cargando...")}</span>
          </div>
        ) : (
          <div className="space-y-4 text-left">
            {/* Status banner */}
            <div className={cn("p-3 rounded-xl border flex items-start gap-2.5", statusMeta.boxClass)}>
              <MaterialIcon name={statusMeta.icon} size={18} className="shrink-0 mt-0.5" />
              <div className="min-w-0 space-y-0.5">
                <p className="text-xs font-bold leading-snug">{statusMeta.title}</p>
                <p className="text-2xs leading-relaxed opacity-90">{statusMeta.desc}</p>
              </div>
            </div>

            {/* 60-digit Safety Number Grid */}
            {safetyGroups.length === 12 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-bold uppercase tracking-wider text-onicord-muted">
                    {t("security.safetyNumberLabel", "Safety Number (60 dígitos)")}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopySafety}
                    className="text-2xs font-semibold text-onicord-accent hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <MaterialIcon name={copiedSafety ? "check" : "content_copy"} size={13} />
                    <span>
                      {copiedSafety
                        ? t("common.copied", "¡Copiado!")
                        : t("common.copy", "Copiar")}
                    </span>
                  </button>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 bg-onicord-base/70 border border-onicord-border rounded-xl p-3 font-mono text-sm font-bold text-onicord-text text-center tracking-wider select-all">
                  {safetyGroups.map((grp, idx) => (
                    <span
                      key={idx}
                      className="py-1 px-1.5 rounded-lg bg-onicord-tint/5 border border-onicord-border/60"
                    >
                      {grp}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Identity Fingerprints & Transport */}
            <div className="bg-onicord-base/50 border border-onicord-border rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-2xs">
                <span className="text-onicord-muted font-semibold">
                  {t("security.transportLabel", "Autenticación de transporte")}
                </span>
                <span className="font-mono font-bold text-onicord-text">{transportLabel}</span>
              </div>

              {verification?.peerFingerprint && (
                <div className="space-y-0.5 pt-2 border-t border-onicord-border">
                  <span className="text-2xs font-semibold text-onicord-muted block">
                    {t("security.peerFingerprintLabel", "Huella del contacto")}
                  </span>
                  <p className="text-xs font-mono font-bold text-onicord-text select-all break-all">
                    {verification.peerFingerprint}
                  </p>
                </div>
              )}

              {verification?.localFingerprint && (
                <div className="space-y-0.5 pt-2 border-t border-onicord-border">
                  <span className="text-2xs font-semibold text-onicord-muted block">
                    {t("security.localFingerprintLabel", "Tu huella local")}
                  </span>
                  <p className="text-xs font-mono font-bold text-onicord-subtext select-all break-all">
                    {verification.localFingerprint}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-5 flex items-center justify-end gap-3 empty:hidden">
          {canVerify && (
            <button
              type="button"
              disabled={saving || loading}
              onClick={handleToggleVerify}
              className={cn(
                isVerified ? "onicord-btn-secondary" : "onicord-btn-primary",
                "flex items-center gap-1.5"
              )}
            >
              <MaterialIcon
                name={isVerified ? "remove_moderator" : "verified_user"}
                size={16}
              />
              <span>
                {isVerified
                  ? t("security.unmarkVerifiedBtn", "Quitar verificación")
                  : t("security.markVerifiedBtn", "Marcar como verificado")}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
