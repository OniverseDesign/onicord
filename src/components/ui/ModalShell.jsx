import React, { useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { IconClose } from "../icons/StreamIcons";
import MaterialIcon from "../icons/MaterialIcon";
import { soundEngine } from "../../lib/soundEngine";
import { useInternalClose } from "../../hooks/useAnimatedMount";

export default function ModalShell({
  title,
  subtitle,
  sections,
  activeSection,
  onSectionChange,
  onClose,
  children,
  footer,
  sidebarFooter,
}) {
  const contentRef = useRef(null);
  const { isClosing, triggerClose } = useInternalClose(onClose, 140);

  useEffect(() => {
    soundEngine.playNav("open");
  }, []);

  const handleClose = useCallback(() => {
    soundEngine.playNav("close");
    triggerClose();
  }, [triggerClose]);

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
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeSection]);

  return createPortal(
    <div
      className={cn(
        "onicord-modal-backdrop md:p-8",
        isClosing && "onicord-animate-backdrop-out"
      )}
      onClick={handleClose}
      role="presentation"
    >
      {/* CARD PRINCIPAL */}
      <div
        className={cn(
          "onicord-modal-card-settings",
          isClosing && "onicord-animate-modal-out"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* BARRA LATERAL (SIDEBAR NAV) */}
        {Array.isArray(sections) && sections.length > 0 && (
          <aside className="flex w-[250px] shrink-0 flex-col bg-onicord-mantle py-4 px-2 m-3 rounded-2xl border border-onicord-island">
            <div className="mb-2 px-4">
              <h2 className="text-xl font-bold tracking-wide text-onicord-accent">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1 truncate text-xs text-onicord-text">
                  {subtitle}
                </p>
              )}
            </div>

            <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-2">
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => {
                    soundEngine.playNav("select");
                    onSectionChange?.(section.id);
                  }}
                  className={cn(
                    "onicord-modal-nav-item flex items-center gap-2.5",
                    activeSection === section.id && "onicord-modal-nav-item-active",
                  )}
                >
                  {section.icon && (
                    <MaterialIcon
                      name={section.icon}
                      size="sm"
                      className="shrink-0 opacity-70"
                    />
                  )}
                  <span>{section.label}</span>
                </button>
              ))}
            </nav>
            {sidebarFooter && (
              <div className="mt-auto pt-2 px-2 shrink-0">
                {sidebarFooter}
              </div>
            )}
          </aside>
        )}

        {/* CONTENIDO PRINCIPAL */}
        <div className="flex min-w-0 flex-1 flex-col bg-onicord-surface rounded-2xl border border-onicord-island m-3 overflow-hidden">
          <header className="onicord-modal-content-header">
            <h3 className="text-xl font-semibold text-onicord-text">
              {Array.isArray(sections) && sections.length > 0
                ? sections.find((s) => s.id === activeSection)?.label
                : title}
            </h3>
            <button
              type="button"
              onClick={handleClose}
              className="onicord-icon-btn"
              aria-label="Close"
            >
              <IconClose size="base" />
            </button>
          </header>

          <div ref={contentRef} className="onicord-modal-content-body minimal-scrollbar">{children}</div>

          {footer && (
            <footer className="onicord-modal-footer">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ModalField({ label, hint, children }) {
  return (
    <div className="">
      <label className="onicord-field-label">
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-3 text-xs text-onicord-faded leading-normal">
          {hint}
        </p>
      )}
    </div>
  );
}

export const ModalInput = React.forwardRef(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn("onicord-input", className)}
        {...props}
      />
    );
  },
);

ModalInput.displayName = "ModalInput";

export function ModalButton({
  variant = "primary",
  children,
  className = "",
  ...props
}) {
  const variantStyles =
    variant === "primary"
      ? "onicord-btn-primary"
      : variant === "danger"
        ? "onicord-btn-destructive"
        : "onicord-btn-secondary";

  return (
    <button
      type="button"
      className={cn(variantStyles, className)}
      {...props}
    >
      {children}
    </button>
  );
}
