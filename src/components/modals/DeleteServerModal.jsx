import React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import SmartAnimatedImage from "../ui/SmartAnimatedImage";

export default function DeleteServerModal({ server, onClose, onConfirm }) {
  const { t } = useTranslation();
  if (!server) return null;

  return createPortal(
    <div className="onicord-modal-backdrop" onClick={onClose}>
      <div
        className="onicord-modal-card-destructive"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 className="text-[20px] font-bold text-onicord-text leading-tight">
            {t("deleteServerModal.title")}
          </h2>
        </div>

        <div className="flex-1 space-y-4">
          <p className="text-[15px] leading-normal text-onicord-subtext text-left">
            {t("deleteServerModal.confirmText")}{" "}
            <span className="font-semibold text-onicord-text">
              "{server.name}"
            </span>
          </p>

          {/* Preview box */}
          <div className="onicord-modal-preview-box">
            {server.icon ? (
              <SmartAnimatedImage
                src={server.icon}
                alt=""
                className="h-10 w-10 rounded-[12px] object-cover"
                isAvatar
              />
            ) : (
              <div className="onicord-server-icon-fallback h-10 w-10 text-sm rounded-onicord-inner">
                {server.name?.slice(0, 2)}
              </div>
            )}
            <div className="flex flex-col min-w-0 text-left">
              <span className="font-semibold text-onicord-text truncate text-[14px]">
                {server.name}
              </span>
              <span className="text-[11px] text-onicord-muted font-mono tracking-wider truncate uppercase">
                ID: {server.roomCode || server.id?.slice(0, 8)}
              </span>
            </div>
          </div>
        </div>

        <div className="pt-6 flex items-center justify-end gap-6">
          <button type="button" onClick={onClose} className="onicord-btn-text">
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="onicord-btn-destructive"
          >
            {t("deleteServerModal.deleteButton")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
