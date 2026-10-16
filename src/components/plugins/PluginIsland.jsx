import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";

function IslandIframeWidget({
  widget,
  roomCode,
  profile,
  server,
  height,
  onActivity,
  onIframeClick,
  onSummaryChange,
}) {
  const iframeRef = useRef(null);
  const p2pListenersRef = useRef(new Set());
  const onActivityRef = useRef(onActivity);
  useEffect(() => {
    onActivityRef.current = onActivity;
  }, [onActivity]);
  const widgetId = widget.id || "island-widget";
  const pluginId = widget.pluginId || "unknown-plugin";
  const permissions = new Set(
    widget.permissions || [
      "ui.plugin_island",
      "p2p.network",
      "storage",
      "user.profile",
      "server.info",
      "chat.read",
      "chat.send",
    ]
  );

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onWidgetP2PData) return;

    const handleP2PMessage = (eventData) => {
      const {
        pluginId: msgPluginId,
        widgetId: msgWidgetId,
        fullId,
        senderPeerId,
        data,
      } = eventData || {};
      const matches =
        (msgPluginId === pluginId && msgWidgetId === widgetId) ||
        fullId === `${pluginId}:${widgetId}` ||
        msgPluginId === pluginId;

      if (matches) {
        // 1. Post to iframe's window
        if (iframeRef.current?.contentWindow) {
          try {
            iframeRef.current.contentWindow.postMessage(
              { type: "ONICORD_P2P_RECEIVE", senderPeerId, data },
              "*"
            );
          } catch (e) {}
        }

        // 2. Direct dispatch to registered listeners inside the widget
        p2pListenersRef.current.forEach((cb) => {
          try {
            cb(data, senderPeerId);
          } catch (err) {
            console.error("[PluginIsland] Error in p2p listener callback:", err);
          }
        });

        // 3. Notify parent PluginIsland of activity
        onActivityRef.current?.(data, senderPeerId);
      }
    };

    const unsub = api.onWidgetP2PData(handleP2PMessage);
    return unsub;
  }, [pluginId, widgetId]);

  const handleIframeLoad = () => {
    const iframeWin = iframeRef.current?.contentWindow;
    if (!iframeWin) return;

    try {
      iframeWin.addEventListener("click", () => onIframeClick?.());
      iframeWin.addEventListener("pointerdown", () => onIframeClick?.());
    } catch (e) {}

    iframeWin.OnicordWidgetAPI = {
      meta: {
        roomCode: roomCode || server?.roomCode || "",
        peerId: profile?.id || "local",
        widgetId,
        pluginId,
        type: "island",
      },

      user: {
        getProfile: () => {
          if (!permissions.has("user.profile")) return null;
          return {
            nickname: profile?.nickname || "Usuario",
            avatar: profile?.avatar || null,
            id: profile?.id || "local",
          };
        },
      },

      server: {
        getInfo: () => {
          if (!permissions.has("server.info")) return null;
          return {
            roomCode: roomCode || server?.roomCode || "",
            serverName: server?.name || "Servidor Onicord",
            memberCount: server?.memberCount || 1,
          };
        },
      },

      chat: {
        send: (text) => {
          if (!permissions.has("chat.send")) return;
          if (window.electronAPI?.execPluginCommand) {
            window.electronAPI.execPluginCommand(text);
          }
        },
      },

      island: {
        setSummary: (text) => {
          if (typeof text === "string" && text.trim()) {
            onSummaryChange?.(text.trim());
          }
        },
      },

      p2p: {
        broadcast: (data) => {
          if (!permissions.has("p2p.network")) return;
          onActivity?.(data, "local");
          if (window.electronAPI?.sendWidgetP2PData) {
            window.electronAPI.sendWidgetP2PData({
              pluginId,
              widgetId,
              data,
            });
          }
        },
        onMessage: (callback) => {
          if (typeof callback !== "function") return () => {};
          p2pListenersRef.current.add(callback);
          return () => {
            p2pListenersRef.current.delete(callback);
          };
        },
      },

      storage: {
        get: async (key) => {
          if (!permissions.has("storage")) return null;
          const storeKey = `widget_store_${pluginId}_${widgetId}_${key}`;
          return localStorage.getItem(storeKey);
        },
        set: async (key, value) => {
          if (!permissions.has("storage")) return;
          const storeKey = `widget_store_${pluginId}_${widgetId}_${key}`;
          localStorage.setItem(storeKey, value);
        },
      },
    };

    iframeWin.dispatchEvent(new CustomEvent("onicord:widget-ready"));
  };

  const widgetHeight = height || widget.height || 275;

  return (
    <div
      style={{ height: `${widgetHeight}px` }}
      className="w-full relative overflow-hidden"
    >
      <iframe
        ref={iframeRef}
        srcDoc={widget.htmlContent || undefined}
        src={!widget.htmlContent ? widget.entryUrl : undefined}
        onLoad={handleIframeLoad}
        sandbox="allow-scripts allow-same-origin"
        className="w-full h-full border-none bg-transparent"
      />
    </div>
  );
}

export default function PluginIsland({ roomCode, profile, server }) {
  const { t } = useTranslation();
  const [installedWidgets, setInstalledWidgets] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Estados de visibilidad dinámica: Inicia en modo cápsula (56px) por defecto
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [latestDescription, setLatestDescription] = useState("");
  const [lastUpdateTime, setLastUpdateTime] = useState("");

  const idleTimerRef = useRef(null);
  const isExpanded = isPinned || isHovered;

  // Temporizador de reposo de 2 minutos (120000ms)
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

  // Filtrado reactivo en caliente según los complementos habilitados en este servidor
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
      // Solo mostrar si el servidor tiene explícitamente el complemento habilitado
      return Boolean(sp && sp.enabled !== false);
    });
  }, [installedWidgets, server?.plugins]);

  useEffect(() => {
    if (currentIndex >= widgets.length && widgets.length > 0) {
      setCurrentIndex(widgets.length - 1);
    }
  }, [widgets.length, currentIndex]);

  const activeWidget = widgets[currentIndex] || widgets[0];

  useEffect(() => {
    if (activeWidget && !latestDescription) {
      setLatestDescription(
        activeWidget.description || activeWidget.title || "Complemento activo"
      );
    }
  }, [activeWidget, latestDescription]);


  const handleSummaryChange = useCallback((text, widgetIndex) => {
    if (widgetIndex !== undefined && widgetIndex !== currentIndex) {
      setCurrentIndex(widgetIndex);
    }
    if (typeof text === "string" && text.trim()) {
      setLatestDescription(text.trim());
      setLastUpdateTime(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    }
  }, [currentIndex]);

  const handleWidgetActivity = useCallback((data, senderPeerId, widgetIndex) => {
    if (widgetIndex !== undefined && widgetIndex !== currentIndex) {
      setCurrentIndex(widgetIndex);
    }
    setIsPinned(true);
    resetIdleTimer();

    if (!data || typeof data !== "object") return;

    // Resumen genérico de actividad provisto por cualquier complemento
    const genericText =
      data.summary ||
      data.description ||
      data.text ||
      data.message ||
      data.title;

    if (typeof genericText === "string" && genericText.trim()) {
      setLatestDescription(genericText.trim());
      setLastUpdateTime(
        new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    }
  }, [currentIndex, resetIdleTimer]);

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
    setLatestDescription(widgets[nextIdx]?.description || "");
    resetIdleTimer();
  };

  const handleNext = (e) => {
    e?.stopPropagation();
    if (widgets.length <= 1) return;
    const nextIdx = currentIndex < widgets.length - 1 ? currentIndex + 1 : 0;
    setCurrentIndex(nextIdx);
    setLatestDescription(widgets[nextIdx]?.description || "");
    resetIdleTimer();
  };

  const hasMultipleWidgets = widgets.length > 1;
  const widgetHeight = activeWidget?.height || (hasMultipleWidgets ? 255 : 280);

  if (widgets.length === 0 || !activeWidget) {
    return null;
  }

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        height: isExpanded
          ? `${widgetHeight + (hasMultipleWidgets ? 30 : 0)}px`
          : "56px",
      }}
      className="shrink-0 bg-onicord-base rounded-onicord-outer-p4 border border-onicord-island overflow-hidden relative flex flex-col justify-between select-none shadow-sm transition-all duration-300 ease-out"
    >
      {/* 1. MODO CÁPSULA (Visible cuando la isla está colapsada a 56px) */}
      {!isExpanded && (
        <div
          onClick={handleCapsuleClick}
          className="w-full h-[56px] px-3 py-2 flex items-center gap-2.5 cursor-pointer select-none transition-colors hover:bg-white/[0.04]"
        >
          {/* Avatar / Imagen de perfil del Addon */}
          <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 shrink-0 overflow-hidden flex items-center justify-center shadow-inner">
            {activeWidget.icon ? (
              <img
                src={activeWidget.icon}
                alt={activeWidget.title || activeWidget.pluginName || "Addon"}
                className="w-full h-full object-cover"
              />
            ) : (
              <MaterialIcon
                name={activeWidget.materialIcon || "extension"}
                size={20}
                className="text-onicord-text opacity-90"
              />
            )}
          </div>

          {/* Información: Nombre + Badge + Hora / Descripción de la última actividad */}
          <div className="flex-1 min-w-0 flex flex-col justify-center">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-bold text-xs text-onicord-text truncate leading-tight">
                {activeWidget.title || activeWidget.pluginName || t("plugins.islandPlugin", "Complemento")}
              </span>
              <MaterialIcon
                name="smart_toy"
                size={14}
                fill={true}
                weight={400}
                className="text-indigo-400 shrink-0"
                title={t("plugins.islandPlugin", "Complemento")}
              />
              {lastUpdateTime && (
                <span className="text-[10px] text-onicord-muted shrink-0 ml-auto tabular-nums">
                  {lastUpdateTime}
                </span>
              )}
            </div>

            {/* Descripción de la última actualización (SIN EMOJIS) */}
            <p className="text-[11px] text-onicord-subtext truncate mt-0.5 leading-tight">
              {latestDescription ||
                activeWidget.description ||
                activeWidget.title ||
                t("plugins.activePlugin", "Complemento activo")}
            </p>
          </div>

          {/* Indicador de carrusel en cápsula si hay más de 1 addon */}
          {hasMultipleWidgets && (
            <div className="flex items-center gap-1 shrink-0 ml-1">
              {widgets.map((_, idx) => (
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

      {/* 2. MODO EXPANDIDO (Widget completo + carrusel) */}
      <div
        className={`w-full flex-1 min-h-0 relative ${
          isExpanded ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none hidden"
        }`}
      >
        {widgets.map((widget, idx) => (
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
                height={widgetHeight}
                onActivity={(data, senderPeerId) =>
                  handleWidgetActivity(data, senderPeerId, idx)
                }
                onIframeClick={handleIframeClick}
                onSummaryChange={(text) => handleSummaryChange(text, idx)}
              />
            ) : widget.render ? (
              <div
                dangerouslySetInnerHTML={{
                  __html:
                    typeof widget.render === "function"
                      ? widget.render()
                      : widget.render,
                }}
                className="p-4 text-onicord-text text-xs"
              />
            ) : widget.content ? (
              <p className="p-4 text-onicord-subtext text-xs leading-relaxed">
                {widget.content}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {/* Indicadores de Paginación / Carrusel (SÓLO si está expandido y hay más de 1 addon) */}
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
            {widgets.map((_, idx) => (
              <span
                key={idx}
                onClick={() => {
                  setCurrentIndex(idx);
                  setLatestDescription(widgets[idx]?.description || "");
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
  );
}
