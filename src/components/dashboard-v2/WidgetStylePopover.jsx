import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { SURFACE_OPTIONS } from "../../lib/bento-v2/bentoTypes";
import Tooltip from "../ui/Tooltip";
import { cn } from "../../lib/cn";

export default function WidgetStylePopover({
  currentSurface = "dark",
  onSelect,
  onClose,
}) {
  const { t } = useTranslation();
  const ref = useRef(null);

  useEffect(() => {
    const handleOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose?.();
      }
    };
    window.addEventListener("pointerdown", handleOutside);
    return () => window.removeEventListener("pointerdown", handleOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-no-drag="true"
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute right-0 top-9 z-popover p-2 rounded-onicord-inner bg-onicord-surface border border-onicord-border-strong shadow-onicord-elevated backdrop-blur-onicord-popover w-[176px]"
    >
      <p className="bento-v2-label-micro text-onicord-muted px-1 mb-1.5">
        {t("dashboard.v2.surface", "Surface")}
      </p>
      <div className="grid grid-cols-6 gap-1.5">
        {SURFACE_OPTIONS.map((opt) => {
          const isSelected = currentSurface === opt.id;
          return (
            <Tooltip key={opt.id} content={opt.label} side="top">
              <button
                type="button"
                onClick={() => onSelect?.(opt.id)}
                className={cn(
                  "w-5 h-5 rounded-full transition-transform duration-fast hover:scale-110 cursor-pointer border",
                  opt.swatchClass,
                  isSelected
                    ? "ring-2 ring-onicord-accent ring-offset-1 ring-offset-onicord-surface scale-110"
                    : "border-onicord-border"
                )}
              />
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
