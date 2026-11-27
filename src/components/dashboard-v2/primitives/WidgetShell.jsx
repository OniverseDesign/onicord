import { cn } from "../../../lib/cn";
import { useWidgetLayout } from "../WidgetLayoutContext";

const PADDING_BY_MODE = {
  micro: "p-2.5",
  compact: "p-3.5",
  strip: "px-4 py-3",
  pillar: "p-3.5",
  standard: "p-4",
  expanded: "p-5",
};

export default function WidgetShell({
  title,
  headerRight = null,
  footer = null,
  hideHeaderInMicro = true,
  className = "",
  children,
}) {
  const { sizeMode, isCustomizing, customizeButtons } = useWidgetLayout();
  const paddingClass = PADDING_BY_MODE[sizeMode] || PADDING_BY_MODE.standard;
  const showEditControls = isCustomizing && Boolean(customizeButtons);
  const showHeader =
    (!(hideHeaderInMicro && sizeMode === "micro") && (title || headerRight)) ||
    showEditControls;

  return (
    <div
      className={cn(
        "w-full h-full flex flex-col justify-between min-h-0 min-w-0",
        paddingClass,
        className
      )}
    >
      {showHeader && (
        <div className="relative z-20 flex items-center justify-between gap-2 shrink-0 min-w-0 mb-1.5">
          {title && !(hideHeaderInMicro && sizeMode === "micro") ? (
            <span className="bento-v2-widget-title bento-v2-ink-muted truncate">
              {title}
            </span>
          ) : (
            <span />
          )}
          {(headerRight || showEditControls) && (
            <div
              className="flex items-center gap-1.5 shrink-0"
              data-no-drag="true"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {!(hideHeaderInMicro && sizeMode === "micro") && headerRight}
              {showEditControls && customizeButtons}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        {children}
      </div>

      {footer && sizeMode !== "micro" && (
        <div className="shrink-0 pt-2 mt-1.5 border-t bento-v2-ink-divider">
          {footer}
        </div>
      )}
    </div>
  );
}
