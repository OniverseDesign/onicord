import React from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { useInternalClose } from "../../hooks/useAnimatedMount";

export default function DeleteStickerModal({ sticker, onClose, onConfirm }) {
  const { isClosing, triggerClose } = useInternalClose(onClose, 140);
  if (!sticker) return null;

  return createPortal(
    <div
      className={cn("onicord-modal-backdrop", isClosing && "onicord-animate-backdrop-out")}
      onClick={triggerClose}
    >
      <div
        className={cn("onicord-modal-card-destructive", isClosing && "onicord-animate-modal-out")}
        onClick={(e) => e.stopPropagation()}
      >
        {}
        <div className="mb-4">
          <h2 className="text-[20px] font-bold text-onicord-text leading-tight">
            Delete sticker
          </h2>
        </div>

        {}
        <div className="flex-1 space-y-4">
          <p className="text-[15px] leading-normal text-onicord-subtext text-left">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-onicord-text">
              \"{sticker.name || "this sticker"}\"
            </span>{" "}
            from your local library?
          </p>

          {/* 🚀 ABSTRAÍDO: Caja de previsualización unificada con bordes sutiles y fondo base */}
          <div className="onicord-modal-preview-box">
            <div className="w-14 h-14 bg-black/10 rounded-onicord-button p-2 flex items-center justify-center border border-white/[0.02]">
              <img
                src={sticker.base64}
                alt=""
                className="max-w-full max-h-full object-contain pointer-events-none"
              />
            </div>
            <div className="flex flex-col min-w-0 text-left">
              <span className="font-semibold text-onicord-text truncate text-[14px]">
                {sticker.name || "Local Sticker"}
              </span>
              <span className="font-mono text-[11px] text-onicord-muted tracking-tight uppercase">
                ID: {sticker.id}
              </span>
            </div>
          </div>

          {/* 🚀 ABSTRAÍDO: Banner de advertencia rígido con tokens Mocha */}
          <div className="onicord-modal-warning-box text-left">
            <strong className="block text-onicord-danger text-[11px] uppercase font-bold tracking-wider mb-1">
              Advertencia:
            </strong>
            This action will delete the physical file from the disk. If you need it
            again, you must re-import it or save it from the chat if
            a peer sends it again.
          </div>
        </div>

        {/* PIE DE PÁGINA */}
        <div className="pt-6 flex items-center justify-end gap-6">
          <button type="button" onClick={triggerClose} className="onicord-btn-text">
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="onicord-btn-destructive"
          >
            Delete sticker
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
