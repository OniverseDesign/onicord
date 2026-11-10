import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import SandboxedPluginFrame from "./SandboxedPluginFrame";

function IslandIframeWidget({
  widget,
  roomCode,
  profile,
  server,
  voice,
  height,
  onActivity,
  onIframeClick,
  onSummaryChange,
}) {
  const widgetHeight = height || widget.height || 275;

  return (
    <div
      style={{ height: `${widgetHeight}px` }}
      className="w-full relative overflow-hidden"
    >
      <SandboxedPluginFrame
        widget={widget}
        roomCode={roomCode}
        profile={profile}
        server={server}
        voice={voice}
        type="island"
        onActivity={onActivity}
        onIframeClick={onIframeClick}
        onSummaryChange={onSummaryChange}
      />
    </div>
  );
}

export default function PluginIsland({ roomCode, profile, server, voice }) {
  const { t } = useTranslation();
  const [installedWidgets, setInstalledWidgets] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Visibility state: defaults to capsule mode (56px)
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  // Isolated summaries dictionary per addon/widget ({ [widgetKey]: { text, updatedAt } })
  const [widgetSummaries, setWidgetSummaries] = useState({});

  const idleTimerRef = useRef(null);
  const isExpanded = isPinned || isHovered;

  // 2-minute idle rest timer (120000ms)
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      setIsPinned(false);
    }, 120000);
  }, []);

  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (window.electronAPI?.getPluginWidgets) {
      window.electronAPI.getPluginWidgets().then((initialWidgets) => {
        if (Array.isArray(initialWidgets)) {
          setInstalledWidgets(initialWidgets);
        }
      });
    }

    if (window.electronAPI?.onPluginWidgetsUpdated) {
      const cleanup = window.electronAPI.onPluginWidgetsUpdated((updatedWidgets) => {
        if (Array.isArray(updatedWidgets)) {
          setInstalledWidgets(updatedWidgets);
        }
      });
      return cleanup;
    }
  }, []);

  // Hot reactive filtering matching plugins enabled on active server
  const widgets = useMemo(() => {
    if (!Array.isArray(installedWidgets) || installedWidgets.length === 0) return [];
    const serverPlugins = server?.plugins;
    if (!Array.isArray(serverPlugins) || serverPlugins.length === 0) {
      return [];
    }
    return installedWidgets.filter((w) => {
      const pluginId = w.pluginId;
      if (!pluginId) return false;
      const sp = serverPlugins.find(
        (p) =>
          p.id === pluginId ||
          (p.id && (p.id.includes(pluginId) || pluginId.includes(p.id))) ||
          (p.name && w.title && p.name.toLowerCase() === w.title.toLowerCase())
      );
      // Only display if server explicitly enabled this addon and configured to show in island
      if (!sp || sp.enabled === false) return false;
      if (sp.config?.showInIsland === false) return false;
      if (w.showInIsland === false && sp.config?.showInIsland === undefined) return false;
      return true;
    });
  }, [installedWidgets, server?.plugins]);

  useEffect(() => {
    if (currentIndex >= widgets.length && widgets.length > 0) {
      setCurrentIndex(widgets.length - 1);
    }
  }, [widgets.length, currentIndex]);

  const activeWidget = widgets[currentIndex] || widgets[0];
  const hasWidgets = Boolean(widgets.length > 0 && activeWidget);
  const [cachedActiveWidget, setCachedActiveWidget] = useState(activeWidget);
  const [cachedWidgets, setCachedWidgets] = useState(widgets);

  useEffect(() => {
    if (hasWidgets) {
      setCachedActiveWidget(activeWidget);
      setCachedWidgets(widgets);
    }
  }, [hasWidgets, activeWidget, widgets]);

  const displayWidget = activeWidget || cachedActiveWidget;
  const displayWidgets = widgets.length > 0 ? widgets : cachedWidgets;

  const handleSummaryChange = useCallback((text, widgetIndex) => {
    if (typeof text !== "string" || !text.trim()) return;
    const target = (widgets && widgetIndex !== undefined ? widgets[widgetIndex] : null) || activeWidget;
    if (!target) return;
    const key = target.id || target.pluginId;
    const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setWidgetSummaries((prev) => ({
      ...prev,
      [key]: { text: text.trim(), updatedAt: now },
    }));
  }, [widgets, activeWidget]);

  const handleWidgetActivity = useCallback((data, senderPeerId, widgetIndex) => {
    if (widgetIndex !== undefined && widgetIndex !== currentIndex) {
      setCurrentIndex(widgetIndex);
    }
    setIsPinned(true);
    resetIdleTimer();

    if (!data || typeof data !== "object") return;

    // Generic activity summary provided by any addon
    const genericText =
      data.summary ||
      data.description ||
      data.text ||
      data.message ||
      data.title;

    if (typeof genericText === "string" && genericText.trim()) {
      const target = (widgets && widgetIndex !== undefined ? widgets[widgetIndex] : null) || activeWidget;
      if (!target) return;
      const key = target.id || target.pluginId;
      const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setWidgetSummaries((prev) => ({
        ...prev,
        [key]: { text: genericText.trim(), updatedAt: now },
      }));
    }
  }, [widgets, activeWidget, currentIndex, resetIdleTimer]);

  const handleIframeClick = () => {
    setIsPinned(true);
    resetIdleTimer();
  };

  const handleMouseEnter = () => {
    if (!isPinned) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isPinned) {
      setIsHovered(false);
    }
  };

  const handleCapsuleClick = (e) => {
    e.stopPropagation();
    setIsPinned(true);
    setIsHovered(false);
    resetIdleTimer();
  };

  const handlePrev = (e) => {
    e?.stopPropagation();
    if (widgets.length <= 1) return;
    const nextIdx = currentIndex > 0 ? currentIndex - 1 : widgets.length - 1;
    setCurrentIndex(nextIdx);
    resetIdleTimer();
  };

  const handleNext = (e) => {
    e?.stopPropagation();
    if (widgets.length <= 1) return;
    const nextIdx = currentIndex < widgets.length - 1 ? currentIndex + 1 : 0;
    setCurrentIndex(nextIdx);
    resetIdleTimer();
  };

  const hasMultipleWidgets = displayWidgets.length > 1;
  const widgetHeight = displayWidget?.height || (hasMultipleWidgets ? 255 : 280);

  const activeKey = displayWidget?.id || displayWidget?.pluginId;
  const activeSummaryData = activeKey ? widgetSummaries[activeKey] : null;
  const currentSummaryText =
    activeSummaryData?.text ||
    displayWidget?.description ||
    displayWidget?.title ||
    t("plugins.activePlugin", "Complemento activo");
  const currentUpdateTime = activeSummaryData?.updatedAt || "";

  if (!displayWidget || displayWidgets.length === 0) {
    return null;
  }

  return (
    <div
      className={`w-full overflow-hidden transition-all duration-300 ease-in-out shrink-0 flex flex-col ${
        hasWidgets
          ? "max-h-[600px] opacity-100 scale-100 pointer-events-auto"
          : "max-h-0 opacity-0 scale-95 pointer-events-none -mb-[calc(var(--gap)+3px)]"
      }`}
    >
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          height: isExpanded
            ? `${widgetHeight + (hasMultipleWidgets ? 30 : 0)}px`
            : "56px",
        }}
        className="w-full shrink-0 bg-onicord-base rounded-onicord-outer-p4 border border-onicord-island overflow-hidden relative flex flex-col justify-between select-none shadow-sm transition-all duration-300 ease-out"
      >
        {/* 1. Capsule Mode (visible when collapsed to 56px) */}
        {!isExpanded && (
          <div
            onClick={handleCapsuleClick}
            className="w-full h-[56px] px-3 py-2 flex items-center gap-2.5 cursor-pointer select-none transition-colors hover:bg-white/[0.04]"
          >
            {/* Addon avatar / profile icon */}
            <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 shrink-0 overflow-hidden flex items-center justify-center shadow-inner">
              {displayWidget.icon ? (
                <img
                  src={displayWidget.icon}
                  alt={displayWidget.title || displayWidget.pluginName || "Addon"}
                  className="w-full h-full object-cover"
                />
              ) : (
                <MaterialIcon
                  name={displayWidget.materialIcon || "extension"}
                  size={20}
                  className="text-onicord-text opacity-90"
                />
              )}
            </div>

            {/* Addon metadata: Name, badge, and latest activity summary */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-bold text-xs text-onicord-text truncate leading-tight">
                  {displayWidget.title || displayWidget.pluginName || t("plugins.islandPlugin", "Complemento")}
                </span>
                <MaterialIcon
                  name="smart_toy"
                  size={14}
                  fill={true}
                  weight={400}
                  className="text-indigo-400 shrink-0"
                  title={t("plugins.islandPlugin", "Complemento")}
                />
                {currentUpdateTime && (
                  <span className="text-[10px] text-onicord-muted shrink-0 ml-auto tabular-nums">
                    {currentUpdateTime}
                  </span>
                )}
              </div>

              {/* Latest activity description */}
              <p className="text-[11px] text-onicord-subtext truncate mt-0.5 leading-tight">
                {currentSummaryText}
              </p>
            </div>

            {/* Capsule carousel indicator when multiple addons are active */}
            {hasMultipleWidgets && (
              <div className="flex items-center gap-1 shrink-0 ml-1">
                {displayWidgets.map((_, idx) => (
                  <span
                    key={idx}
                    className={`rounded-full transition-all duration-200 ${
                      idx === currentIndex
                        ? "bg-onicord-text w-1.5 h-1.5 opacity-90"
                        : "bg-white/20 w-1 h-1"
                    }`}
                  />
                ))}
            </div>
          )}
        </div>
      )}

      {/* 2. Expanded Mode (full widget + carousel) */}
      <div
        className={`w-full flex-1 min-h-0 relative ${
          isExpanded ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none hidden"
        }`}
      >
        {displayWidgets.map((widget, idx) => (
          <div
            key={widget.id || widget.pluginId || idx}
            style={{ display: idx === currentIndex ? "block" : "none" }}
            className="w-full h-full"
          >
            {widget.entryUrl || widget.htmlContent ? (
              <IslandIframeWidget
                widget={widget}
                roomCode={roomCode}
                profile={profile}
                server={server}
                voice={voice}
                height={widgetHeight}
                onActivity={(data, senderPeerId) =>
                  handleWidgetActivity(data, senderPeerId, idx)
                }
                onIframeClick={handleIframeClick}
                onSummaryChange={(text) => handleSummaryChange(text, idx)}
              />
            ) : widget.content ? (
              <p className="p-4 text-onicord-subtext text-xs leading-relaxed">
                {widget.content}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {/* Pagination / Carousel controls (expanded mode with multiple addons) */}
      {isExpanded && hasMultipleWidgets && (
        <div className="flex items-center justify-center gap-2 pb-2.5 pt-0.5 shrink-0 select-none">
          <button
            onClick={handlePrev}
            className="p-0.5 rounded-full transition-colors flex items-center justify-center text-onicord-muted hover:text-onicord-text hover:bg-white/5 cursor-pointer active:scale-90"
            title={t("plugins.prevPlugin", "Anterior complemento")}
          >
            <MaterialIcon name="chevron_left" size={16} />
          </button>

          <div className="flex items-center gap-1.5 px-0.5">
            {displayWidgets.map((_, idx) => (
              <span
                key={idx}
                onClick={() => {
                  setCurrentIndex(idx);
                  resetIdleTimer();
                }}
                className={`rounded-full transition-all duration-200 cursor-pointer ${
                  idx === currentIndex
                    ? "bg-onicord-text w-2 h-2 opacity-95"
                    : "bg-white/25 hover:bg-white/40 w-1.5 h-1.5"
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            className="p-0.5 rounded-full transition-colors flex items-center justify-center text-onicord-muted hover:text-onicord-text hover:bg-white/5 cursor-pointer active:scale-90"
            title={t("plugins.nextPlugin", "Siguiente complemento")}
          >
            <MaterialIcon name="chevron_right" size={16} />
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
