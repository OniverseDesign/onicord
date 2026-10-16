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

  const cleanText = message.text?.includes("[FILE_ATTACHMENT]:")
    ? message.text.split("[FILE_ATTACHMENT]:")[0].trim() || "Archivo adjunto"
    : message.text;

  return createPortal(
    <div className="onicord-modal-backdrop" onClick={onClose}>
      {}
      <div
        className="onicord-modal-card-destructive"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="onicord-icon-btn absolute right-5 top-5"
        >
          <IconClose size="base" />
        </button>

        <div className="pb-4">
          <h2 className="text-xl font-bold text-onicord-text tracking-wide">
            Delete message
          </h2>
          <p className="mt-1.5 text-[15px] text-onicord-muted leading-normal">
            Are you sure you want to delete this message?
          </p>
        </div>

        <div className="space-y-5">
          {}
          <div className="onicord-modal-preview-box">
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
            <div className="min-w-0 flex-1 pt-0.5 text-left">
              <div className="flex items-baseline gap-2">
                <span className="text-[14px] font-medium text-onicord-text">
                  {authorName}
                </span>
                <time className="text-[11px] text-onicord-muted">
                  {timeStr}
                </time>
              </div>
              <p className="mt-0.5 break-words text-[14px] text-onicord-text whitespace-pre-wrap leading-relaxed">
                {cleanText}
              </p>
            </div>
          </div>

          {}
          <div className="onicord-modal-warning-box">
            <strong className="block text-onicord-success text-[11px] uppercase font-bold tracking-wider mb-1">
              Consejo:
            </strong>
            Puedes mantener pulsado{" "}
            <span className="font-semibold text-onicord-text">{t("chat.shift")}</span>{" "}
            when you click on{" "}
            <span className="font-semibold text-onicord-text">
              delete message
            </span>{" "}
            to ignore this confirmation completely.
          </div>
        </div>

        <div className="pt-6 flex items-center justify-end gap-6">
          <button type="button" onClick={onClose} className="onicord-btn-text">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="onicord-btn-destructive"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
