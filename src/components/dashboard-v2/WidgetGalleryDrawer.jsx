import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import Heading from "../ui/Heading";
import Text from "../ui/Text";
import { useAnimatedMount } from "../../hooks/useAnimatedMount";
import { soundEngine } from "../../lib/soundEngine";
import { cn } from "../../lib/cn";

export default function WidgetGalleryDrawer({
  isOpen,
  configs = [],
  activeIds = new Set(),
  onToggleWidget,
  onClose,
}) {
  const { t } = useTranslation();
  const { shouldRender, isAnimatingOut } = useAnimatedMount(isOpen, 140);

  const handleClose = useCallback(() => {
    soundEngine.playNav?.("close");
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      soundEngine.playNav?.("open");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, handleClose]);

  if (!shouldRender) return null;

  return createPortal(
    <div
      className={cn(
        "onicord-modal-backdrop",
        isAnimatingOut && "onicord-animate-backdrop-out"
      )}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "onicord-modal-card-wide border border-onicord-border",
          isAnimatingOut && "onicord-animate-modal-out"
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 mb-3 border-b border-onicord-border">
          <div className="min-w-0">
            <Heading level={2} size="lg" className="leading-tight">
              {t("dashboard.v2.galleryTitle", "Widget Gallery")}
            </Heading>
            <Text variant="xs" color="muted" className="mt-1">
              {t(
                "dashboard.v2.galleryDesc",
                "Enable or disable modules. The grid rearranges automatically without breaking your layout."
              )}
            </Text>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("common.close", "Close")}
            className="onicord-icon-btn shrink-0"
          >
            <MaterialIcon name="close" size={18} />
          </button>
        </div>

        {/* Single-column list matching Onicord Settings / Modal rows */}
        <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto bento-v2-no-scrollbar pr-0.5">
          {configs.map((cfg) => {
            const isAdded = activeIds.has(cfg.id);
            const localizedTitle = cfg.isPlugin
              ? cfg.title
              : t(`widgets.badges.${cfg.id}`, cfg.title);
            const localizedDesc = cfg.isPlugin
              ? t("dashboard.v2.widgetDesc.plugin", cfg.description)
              : t(`dashboard.v2.widgetDesc.${cfg.id}`, cfg.description);

            return (
              <label
                key={cfg.id}
                className={cn(
                  "onicord-settings-row p-3 rounded-onicord-inner border transition-colors duration-fast cursor-pointer select-none",
                  isAdded
                    ? "bg-onicord-mantle/80 border-onicord-accent/40 hover:bg-onicord-base/60"
                    : "bg-onicord-mantle/55 border-onicord-border/60 hover:bg-onicord-base/50"
                )}
              >
                <div className="flex items-center gap-3 min-w-0 pr-4">
                  <div
                    className={cn(
                      "onicord-icon-badge shrink-0",
                      isAdded
                        ? "text-onicord-accent bg-onicord-base"
                        : "text-onicord-muted bg-onicord-base/40"
                    )}
                  >
                    <MaterialIcon name={cfg.icon || "widgets"} size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="onicord-settings-row-title truncate">
                        {localizedTitle}
                      </span>
                      {cfg.isPlugin && (
                        <span className="px-1.5 py-0.5 rounded-onicord-chip text-2xs font-mono font-semibold bg-onicord-overlay text-onicord-subtext shrink-0">
                          Plugin
                        </span>
                      )}
                    </div>
                    <p className="onicord-settings-row-desc truncate mt-0.5">
                      {localizedDesc}
                    </p>
                  </div>
                </div>

                <span className="relative inline-flex items-center shrink-0">
                  <input
                    type="checkbox"
                    checked={isAdded}
                    onChange={() => onToggleWidget?.(cfg.id)}
                    className="sr-only peer"
                  />
                  <div className="onicord-toggle-slider" />
                </span>
              </label>
            );
          })}
        </div>

        {/* Footer */}
        <div className="pt-4 mt-3 border-t border-onicord-border flex items-center justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="onicord-btn-secondary"
          >
            {t("dashboard.v2.done", "Done")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
