import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ModalInput } from "../ui/ModalShell";
import Heading from "../ui/Heading";
import Text from "../ui/Text";
import AvatarPicker from "../ui/AvatarPicker";
import { IconClose } from "../icons/StreamIcons";
import { cn } from "../../lib/cn";
import { parseInviteUrl } from "../../lib/inviteUtils";
import { soundEngine } from "../../lib/soundEngine";
import { useInternalClose } from "../../hooks/useAnimatedMount";

export default function AddServerModal({ profile, onClose, onCreated }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(null);
  const [inviteInput, setInviteInput] = useState("");
  const [busyAction, setBusyAction] = useState(null);
  const [error, setError] = useState(null);

  const nameInputRef = useRef(null);
  const { isClosing, triggerClose } = useInternalClose(onClose, 140);

  const handleClose = useCallback(() => {
    if (busyAction) return;
    soundEngine.playNav("close");
    triggerClose();
  }, [busyAction, triggerClose]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  useEffect(() => {
    const timer = setTimeout(() => {
      nameInputRef.current?.focus();
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const parsedInvite = useMemo(() => {
    const parsedUrl = parseInviteUrl(inviteInput);
    if (parsedUrl && /^[A-F0-9]{8}$/i.test(parsedUrl.roomCode)) {
      return {
        valid: true,
        code: parsedUrl.roomCode.toUpperCase(),
        ip: parsedUrl.ip || null,
        port: parsedUrl.port || null,
      };
    }

    const trimmed = inviteInput.replace(/\s+/g, "");
    if (/^[a-fA-F0-9]{8}$/.test(trimmed)) {
      return {
        valid: true,
        code: trimmed.toUpperCase(),
        ip: null,
        port: null,
      };
    }

    return { valid: false, code: "", ip: null, port: null };
  }, [inviteInput]);

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || busyAction) return;

    setBusyAction("create");
    setError(null);
    try {
      let server = await window.electronAPI.createServer(
        trimmedName,
        profile,
        icon,
      );
      if (icon && server?.id && !server?.icon && window.electronAPI.updateServerSettings) {
        const updated = await window.electronAPI.updateServerSettings(server.id, { icon });
        if (updated) server = updated;
      }
      await onCreated(server);
    } catch (err) {
      setError(err.message || "Could not create server");
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoin = async () => {
    if (!parsedInvite.valid || busyAction) return;

    setBusyAction("join");
    setError(null);
    try {
      let server = await window.electronAPI.joinServer(
        parsedInvite.code,
        "",
        profile,
      );
      if (
        parsedInvite.ip &&
        parsedInvite.port &&
        server?.id &&
        window.electronAPI.updateServerSettings
      ) {
        const updated = await window.electronAPI.updateServerSettings(server.id, {
          directConnectionEnabled: true,
          directIP: parsedInvite.ip,
          directPort: parsedInvite.port,
        });
        if (updated) server = updated;
      }
      await onCreated(server);
    } catch (err) {
      setError(err.message || "Could not join server");
    } finally {
      setBusyAction(null);
    }
  };

  return createPortal(
    <div
      className={cn("onicord-modal-backdrop p-4", isClosing && "onicord-animate-backdrop-out")}
      onClick={handleClose}
      role="presentation"
    >
      <div
        className={cn(
          "onicord-modal-card !max-w-[440px] w-full p-6 sm:p-7 relative overflow-hidden",
          isClosing && "onicord-animate-modal-out",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={Boolean(busyAction)}
          className="onicord-icon-btn absolute right-4 top-4 z-10"
          aria-label={t("common.close", "Cerrar")}
        >
          <IconClose size="base" />
        </button>

        {/* Centered Header */}
        <div className="text-center px-4">
          <Heading level={2} size="2xl" className="text-center">
            {t("addServerModal.title", "Crea tu servidor")}
          </Heading>
          <Text variant="sm" color="muted" className="mt-2 leading-relaxed text-center">
            {t(
              "addServerModal.subtitle",
              "Tu servidor es donde te reúnes con tus amigos. Crea el tuyo y empieza a hablar.",
            )}
          </Text>
        </div>

        {/* Server Icon Picker */}
        <div className="my-6 flex justify-center">
          <AvatarPicker
            src={icon}
            onChange={setIcon}
            onError={setError}
            initial={name.trim() ? name.trim().slice(0, 2).toUpperCase() : ""}
            fallbackIcon="dns"
            size="lg"
            disabled={Boolean(busyAction)}
            title={
              icon
                ? t("addServerModal.changeIcon", "Cambiar icono")
                : t("addServerModal.uploadIcon", "Subir")
            }
            removeTitle={t("addServerModal.removeIcon", "Eliminar icono")}
          />
        </div>

        {/* Create Server Section */}
        <div>
          <label className="mb-2 block text-xs font-semibold text-onicord-subtext select-none">
            {t("addServerModal.serverNameLabel", "Nombre del servidor")}{" "}
            <span className="text-onicord-danger">*</span>
          </label>
          <ModalInput
            ref={nameInputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim() && !busyAction) {
                e.preventDefault();
                handleCreate();
              }
            }}
            maxLength={48}
            disabled={Boolean(busyAction)}
            placeholder={t("addServerModal.createPlaceholder", "Ej: Squad Gaming")}
            className="h-10"
          />
          <button
            type="button"
            disabled={Boolean(busyAction) || !name.trim()}
            onClick={handleCreate}
            className="onicord-btn-primary w-full mt-3 h-10"
          >
            {busyAction === "create"
              ? t("common.saving", "Guardando...")
              : t("addServerModal.createButton", "Crear servidor")}
          </button>
        </div>

        {/* Join Server Section */}
        <div className="mt-6 pt-5 border-t border-onicord-border">
          <Heading level={3} size="lg" className="text-center mb-3">
            {t("addServerModal.haveInviteTitle", "¿Ya tienes una invitación?")}
          </Heading>
          <ModalInput
            value={inviteInput}
            onChange={(e) => setInviteInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && parsedInvite.valid && !busyAction) {
                e.preventDefault();
                handleJoin();
              }
            }}
            disabled={Boolean(busyAction)}
            placeholder={t("addServerModal.invitePlaceholder", "A1B2C3D4 o enlace de invitación")}
            className="h-10"
          />
          <button
            type="button"
            disabled={Boolean(busyAction) || !parsedInvite.valid}
            onClick={handleJoin}
            className="onicord-btn-secondary w-full mt-2.5 h-10 bg-onicord-overlay/60 hover:bg-onicord-overlay border border-onicord-border text-onicord-text"
          >
            {busyAction === "join"
              ? t("common.loading", "Cargando...")
              : t("addServerModal.joinButton", "Únete a un servidor")}
          </button>
        </div>

        {error && (
          <p className="onicord-error-banner mt-4 animate-fade-in">
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
