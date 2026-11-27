import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import Tooltip from "../ui/Tooltip";
import { cn } from "../../lib/cn";
import { computeSizeMode, isDarkSurfaceId } from "../../lib/bento-v2/bentoTypes";
import { WidgetLayoutProvider } from "./WidgetLayoutContext";
import WidgetStylePopover from "./WidgetStylePopover";

const SURFACE_CLASS_MAP = {
  dark: "bg-onicord-base text-onicord-text border-onicord-border-island",
  accent: "bg-onicord-accent text-onicord-on-accent border-transparent",
  pink: "bg-onicord-pink text-onicord-dark border-transparent",
  sky: "bg-onicord-sky text-onicord-dark border-transparent",
  sapphire: "bg-onicord-sapphire text-onicord-dark border-transparent",
  success: "bg-onicord-success text-onicord-dark border-transparent",
  peach: "bg-onicord-peach text-onicord-dark border-transparent",
  yellow: "bg-onicord-yellow text-onicord-dark border-transparent",
  mauve: "bg-onicord-mauve text-onicord-dark border-transparent",
  teal: "bg-onicord-teal text-onicord-dark border-transparent",
  rosewater: "bg-onicord-rosewater text-onicord-dark border-transparent",
};

function getSurfacePillVars(surface) {
  if (!surface || surface === "dark") {
    return {
      "--widget-pill-bg": "rgb(var(--onicord-bg-mantle))",
      "--widget-pill-fg": "var(--onicord-text)",
      "--widget-pill-border": "var(--onicord-border-strong)",
    };
  }
  if (surface === "accent") {
    return {
      "--widget-pill-bg": "var(--onicord-on-accent)",
      "--widget-pill-fg": "var(--onicord-accent)",
      "--widget-pill-border": "transparent",
    };
  }
  return {
    "--widget-pill-bg": "var(--onicord-text-dark)",
    "--widget-pill-fg": `rgb(var(--onicord-${surface}))`,
    "--widget-pill-border": "transparent",
  };
}

export default function IslaV2({
  widgetId,
  cols = 2,
  rows = 2,
  surface = "dark",
  customBackground = null,
  isCustomizing = false,
  isDragging = false,
  usesV2Shell = false,
  onHideWidget,
  onChangeSurface,
  children,
  className = "",
}) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ widthPx: 260, heightPx: 220 });
  const [showStylePicker, setShowStylePicker] = useState(false);

  useEffect(() => {
    if (!isCustomizing) {
      setShowStylePicker(false);
    }
  }, [isCustomizing]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateDims = (rect) => {
      const nextW = Math.round(rect.width);
      const nextH = Math.round(rect.height);
      if (nextW <= 0 || nextH <= 0) return;

      setDims((prev) => {
        const prevMode = computeSizeMode(cols, rows, prev.widthPx, prev.heightPx);
        const nextMode = computeSizeMode(cols, rows, nextW, nextH);
        const diffW = Math.abs(prev.widthPx - nextW);
        const diffH = Math.abs(prev.heightPx - nextH);
        if (prevMode === nextMode && diffW < 8 && diffH < 8) {
          return prev;
        }
        return { widthPx: nextW, heightPx: nextH };
      });
    };

    updateDims(el.getBoundingClientRect());
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        updateDims(entry.contentRect);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cols, rows]);

  const sizeMode = useMemo(
    () => computeSizeMode(cols, rows, dims.widthPx, dims.heightPx),
    [cols, rows, dims.widthPx, dims.heightPx]
  );

  const aspectRatio = useMemo(
    () => (dims.heightPx > 0 ? dims.widthPx / dims.heightPx : cols / Math.max(1, rows)),
    [dims.widthPx, dims.heightPx, cols, rows]
  );

  const fontWdth = useMemo(
    () => Math.round(Math.max(75, Math.min(100, 75 + ((aspectRatio - 0.55) / (1.35 - 0.55)) * 25))),
    [aspectRatio]
  );

  const fontWdthTall = useMemo(() => Math.max(75, fontWdth - 8), [fontWdth]);

  const isDarkSurface = isDarkSurfaceId(surface) && !customBackground?.type;
  const surfaceClasses = SURFACE_CLASS_MAP[surface] || SURFACE_CLASS_MAP.dark;
  const pillVars = useMemo(() => getSurfacePillVars(surface), [surface]);

  const customizeButtons = isCustomizing ? (
    <div
      data-no-drag="true"
      onPointerDown={(e) => e.stopPropagation()}
      className="flex items-center gap-1.5 shrink-0"
    >
      <div className="relative">
        <Tooltip content={t("dashboard.v2.changeStyle", "Change style")} side="bottom">
          <button
            type="button"
            onClick={() => setShowStylePicker((v) => !v)}
            className="bento-v2-pill-icon cursor-pointer active:scale-90"
          >
            <MaterialIcon name="palette" size={15} />
          </button>
        </Tooltip>

        {showStylePicker && (
          <WidgetStylePopover
            currentSurface={surface}
            onSelect={(nextSurface) => {
              onChangeSurface?.(widgetId, nextSurface);
              setShowStylePicker(false);
            }}
            onClose={() => setShowStylePicker(false)}
          />
        )}
      </div>

      <Tooltip content={t("dashboard.v2.hideWidget", "Hide widget")} side="bottom">
        <button
          type="button"
          onClick={() => onHideWidget?.(widgetId)}
          className="bento-v2-pill-icon hover:bg-onicord-danger hover:text-onicord-on-danger cursor-pointer active:scale-90"
        >
          <MaterialIcon name="close" size={15} />
        </button>
      </Tooltip>
    </div>
  ) : null;

  const layoutCtxValue = useMemo(
    () => ({
      cols,
      rows,
      area: cols * rows,
      widthPx: dims.widthPx,
      heightPx: dims.heightPx,
      aspectRatio,
      fontWdth,
      sizeMode,
      surface,
      isDarkSurface,
      isCustomizing,
      customizeButtons,
    }),
    [
      cols,
      rows,
      dims.widthPx,
      dims.heightPx,
      aspectRatio,
      fontWdth,
      sizeMode,
      surface,
      isDarkSurface,
      isCustomizing,
      customizeButtons,
    ]
  );

  return (
    <div
      ref={containerRef}
      style={{
        containerType: "size",
        "--widget-wdth": fontWdth,
        "--widget-wdth-tall": fontWdthTall,
        ...pillVars,
      }}
      className={cn(
        "relative w-full h-full rounded-onicord-outer border overflow-hidden flex flex-col select-none transition-colors duration-normal",
        surfaceClasses,
        isCustomizing && "cursor-grab active:cursor-grabbing",
        isDragging && "shadow-2xl ring-2 ring-onicord-accent/70",
        className
      )}
    >
      {/* Full-bleed media background support */}
      {customBackground?.type === "image" && customBackground.value && (
        <>
          <div
            className={cn(
              "absolute inset-0 z-0 pointer-events-none transition-all duration-slow",
              customBackground.unblurred
                ? "opacity-100"
                : "scale-110 blur-md opacity-70 transform-gpu"
            )}
            style={{
              backgroundImage: `url(${customBackground.value})`,
              backgroundPosition: "center",
              backgroundSize: "cover",
            }}
          />
          <div
            className={cn(
              "absolute inset-0 z-0 pointer-events-none",
              customBackground.unblurred ? "bg-onicord-scrim/20" : "bg-onicord-scrim"
            )}
          />
        </>
      )}

      {/* Fallback floating edit buttons only for non-v2-shell bridged widgets */}
      {isCustomizing && !usesV2Shell && (
        <div className="absolute top-3.5 right-3.5 z-30">
          {customizeButtons}
        </div>
      )}

      {/* Widget Content */}
      <WidgetLayoutProvider value={layoutCtxValue}>
        <div className="relative z-10 flex-1 w-full min-h-0 flex flex-col">
          {children}
        </div>
      </WidgetLayoutProvider>
    </div>
  );
}
