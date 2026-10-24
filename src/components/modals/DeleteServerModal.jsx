import React from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import SmartAnimatedImage from "../ui/SmartAnimatedImage";
import { cn } from "../../lib/cn";
import { useInternalClose } from "../../hooks/useAnimatedMount";

export default function DeleteServerModal({ server, onClose, onConfirm }) {
  const { t } = useTranslation();
  const { isClosing, triggerClose } = useInternalClose(onClose, 140);
  if (!server) return null;

  return createPortal(
    <div
      className={cn("onicord-modal-backdrop", isClosing && "onicord-animate-backdrop-out")}
      onClick={triggerClose}
    >
      <div
        className={cn(
          "onicord-modal-card-destructive !max-w-[440px] w-full",
          isClosing && "onicord-animate-modal-out"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4">
          <h2 className="text-[20px] font-bold text-onicord-text leading-tight">
            {t("deleteServerModal.title", "Eliminar servidor")}
          </h2>
        </div>

        <div className="flex-1 space-y-4">
          <p className="text-[15px] leading-normal text-onicord-subtext text-left">
            {t("deleteServerModal.confirmText", "¿Estás seguro de que deseas eliminar este servidor? Esta acción destruirá los canales locales.")}{" "}
            <span className="font-semibold text-onicord-text break-words">
              "{server.name}"
            </span>
          </p>

          {/* Preview box */}
          <div className="onicord-modal-preview-box !justify-start items-center gap-3.5 p-3.5">
            <div className="h-12 w-12 shrink-0 rounded-[14px] overflow-hidden bg-onicord-surface flex items-center justify-center border border-white/10 select-none shadow-sm">
              {server.icon ? (
                <SmartAnimatedImage
                  src={server.icon}
                  alt=""
                  className="h-full w-full rounded-[14px] object-cover"
                  isAvatar
                />
              ) : (
                <div className="onicord-server-icon-fallback h-full w-full text-base font-bold rounded-[14px] flex items-center justify-center text-onicord-text">
                  {server.name?.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="flex flex-col min-w-0 flex-1 text-left">
              <span className="font-bold text-onicord-text truncate text-[15px]" title={server.name}>
                {server.name}
              </span>
              <span className="text-[11px] text-onicord-muted font-mono tracking-wider truncate uppercase mt-0.5">
                ID: {server.roomCode || server.id}
              </span>
            </div>
          </div>
        </div>

        <div className="pt-6 flex items-center justify-end gap-3">
          <button type="button" onClick={triggerClose} className="onicord-btn-secondary">
            {t("common.cancel", "Cancelar")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="onicord-btn-destructive"
          >
            {t("deleteServerModal.deleteButton", "Eliminar servidor")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
