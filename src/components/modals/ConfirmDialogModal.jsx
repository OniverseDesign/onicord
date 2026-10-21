import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { useAnimatedMount } from "../../hooks/useAnimatedMount";

export default function ConfirmDialogModal({
  isOpen,
  title,
  message,
  warningMessage,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  type = "confirm", 
  confirmButtonClass = "",
}) {
  const confirmButtonRef = useRef(null);
  const { shouldRender, isAnimatingOut } = useAnimatedMount(isOpen, 140);

  useEffect(() => {
    if (isOpen && confirmButtonRef.current) {
      setTimeout(() => {
        confirmButtonRef.current.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  const isDanger = type === "danger";
  const isAlert = type === "alert";

  return createPortal(
    <div className={cn("onicord-modal-backdrop !z-[10000000]", isAnimatingOut && "onicord-animate-backdrop-out")}>
      {}
      <div className={cn("onicord-modal-card !z-[10000001]", isAnimatingOut && "onicord-animate-modal-out")}>
        {}
        <div className="mb-3">
          <h2 className="text-[18px] font-bold text-onicord-text leading-tight text-left">
            {title}
          </h2>
        </div>

        {}
        <div className="space-y-3 text-left">
          <p className="text-[14px] leading-relaxed text-onicord-subtext">
            {message}
          </p>

          {}
          {warningMessage && (
            <div className="onicord-modal-warning-box mt-3 text-left bg-onicord-danger/10 border border-onicord-danger/20 p-3 rounded-onicord-inner">
              <strong className="block text-onicord-danger text-[11px] uppercase font-bold tracking-wider mb-1">
                Attention:
              </strong>
              <span className="text-[12px] text-onicord-subtext leading-normal">
                {warningMessage}
              </span>
            </div>
          )}
        </div>

        {}
        <div className="pt-6 flex items-center justify-end gap-4">
          {!isAlert && (
            <button
              type="button"
              onClick={onCancel}
              className="onicord-btn-secondary"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className={cn(
              isDanger ? "onicord-btn-danger" : "onicord-btn-primary",
              confirmButtonClass
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
