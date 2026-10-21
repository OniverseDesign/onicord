import React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { IconClose } from "../icons/StreamIcons";
import SmartAnimatedImage from "../ui/SmartAnimatedImage";

export default function DeleteMessageModal({
  message,
  authorName,
  authorAvatar,
  onClose,
  onConfirm,
}) {
  const { t } = useTranslation();
  const timeStr =
    new Date(message.timestamp).toLocaleDateString("es", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) +
    " " +
    new Date(message.timestamp).toLocaleTimeString("es", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const cleanText = message?.text?.includes("[FILE_ATTACHMENT]:")
    ? message.text.split("[FILE_ATTACHMENT]:")[0].trim() || t("chat.attachment", "Archivo adjunto")
    : message?.text || "";

  return createPortal(
    <div className="onicord-modal-backdrop" onClick={onClose}>
      <div
        className="onicord-modal-card-destructive !max-w-[480px] w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="onicord-icon-btn absolute right-5 top-5"
          aria-label={t("common.close", "Cerrar")}
        >
          <IconClose size="base" />
        </button>

        <div className="pb-3 shrink-0">
          <h2 className="text-xl font-bold text-onicord-text tracking-wide">
            {t("chat.deleteModalTitle", "Eliminar mensaje")}
          </h2>
          <p className="mt-1 text-[14px] text-onicord-muted leading-normal">
            {t("chat.deleteModalConfirm", "¿Estás seguro de que deseas eliminar este mensaje? Esta acción no se puede deshacer.")}
          </p>
        </div>

        <div className="space-y-4 flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Preview box */}
          <div className="onicord-modal-preview-box !items-start !justify-start gap-3.5 p-3.5 max-h-[220px] overflow-hidden shrink-0">
            <div className={`h-10 w-10 shrink-0 overflow-hidden rounded-full select-none ${authorAvatar ? "" : "bg-onicord-accent"}`}>
              {authorAvatar ? (
                <SmartAnimatedImage
                  src={authorAvatar}
                  alt=""
                  className="h-full w-full object-cover rounded-full"
                  isAvatar={true}
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-onicord-surface">
                  {(authorName || "?").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1 text-left flex flex-col max-h-[190px]">
              <div className="flex items-baseline gap-2 shrink-0">
                <span className="text-[14px] font-semibold text-onicord-text truncate">
                  {authorName}
                </span>
                <time className="text-[11px] text-onicord-muted shrink-0">
                  {timeStr}
                </time>
              </div>
              <div className="mt-1 overflow-y-auto max-h-[155px] pr-1.5 minimal-scrollbar break-words [overflow-wrap:anywhere] whitespace-pre-wrap select-text text-[13.5px] text-onicord-text leading-relaxed font-normal">
                {cleanText}
              </div>
            </div>
          </div>

          {/* Consejo banner */}
          <div className="onicord-modal-warning-box shrink-0 text-left">
            <strong className="block text-onicord-success text-[11px] uppercase font-bold tracking-wider mb-1">
              {t("common.tip", "Consejo")}:
            </strong>
            <span className="text-[12.5px] leading-relaxed text-onicord-muted">
              {t(
                "chat.shiftDeleteTip",
                "Puedes mantener pulsado Shift al hacer clic en eliminar mensaje para omitir esta confirmación en el futuro."
              )}
            </span>
          </div>
        </div>

        <div className="pt-5 flex items-center justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="onicord-btn-secondary">
            {t("common.cancel", "Cancelar")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="onicord-btn-destructive"
          >
            {t("common.delete", "Eliminar")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
