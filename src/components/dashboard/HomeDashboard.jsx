import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Isla from "../ui/Isla";
import SmartAnimatedImage from "../ui/SmartAnimatedImage";
import IconEstrella from "../icons/Estrella.svg?react";
import {
  CONFIG_ISLAS,
  WIDGET_COMPONENTS,
  STORAGE_KEY,
  getCombinedConfigs,
  getWidgetComponent,
  setDynamicPluginConfigs,
} from "./dashboardConfig";
import { soundEngine } from "../../lib/soundEngine";

export default function HomeDashboard({
  profile,
  servers,
  onAddServer,
  peers = [],
  currentConnectedServerId,
  islas, 
  setIslas, 
  musicState,
  activeGame = null,
}) {
  const { t } = useTranslation();
  // Check if environment is development
  const isDevelopment = process.env.NODE_ENV === "development";
  const totalServidoresGuardados = servers?.length || 0;
  const connectedServer = servers?.find(
    (s) => s.id === currentConnectedServerId,
  );
  const activeConnectionsCount = peers.length;

  const [cpuUsage, setCpuUsage] = useState(8);
  const [recentFiles, setRecentFiles] = useState([]);

  // Derive ping dynamically from peers — uses the minimum (best) RTT of all
  // online peers with valid ping data. Falls back to 0 when disconnected.
  const ping = useMemo(() => {
    const validPings = (peers || [])
      .filter((p) => p.online !== false && p.ping !== undefined && p.ping !== null && p.ping > 0)
      .map((p) => p.ping);
    if (validPings.length === 0) return 0;
    return Math.round(Math.min(...validPings));
  }, [peers]);

  const [widgetsBackgrounds, setWidgetsBackgrounds] = useState({});
  const [isPluginWidgetsLoaded, setIsPluginWidgetsLoaded] = useState(false);

  useEffect(() => {
    if (window.electronAPI?.getDashboardWidgets) {
      window.electronAPI.getDashboardWidgets().then((widgets) => {
        if (Array.isArray(widgets) && widgets.length > 0) {
          setDynamicPluginConfigs(widgets);
          setIsPluginWidgetsLoaded(true);
        }
      }).catch(() => {});
    }

    if (window.electronAPI?.onDashboardWidgetsUpdated) {
      const unsub = window.electronAPI.onDashboardWidgetsUpdated((widgets) => {
        if (Array.isArray(widgets)) {
          setDynamicPluginConfigs(widgets);
          setIsPluginWidgetsLoaded((prev) => !prev);
        }
      });
      return unsub;
    }
  }, []);

  const handleUpdateWidgetBg = useCallback((widgetId, bgData) => {
    setWidgetsBackgrounds((prev) => {
      if (
        prev[widgetId]?.value === bgData?.value &&
        prev[widgetId]?.type === bgData?.type
      ) {
        return prev;
      }
      return {
        ...prev,
        [widgetId]: bgData,
      };
    });
  }, []);

  const [isEditable, setIsEditable] = useState(false);
  const [activeOp, setActiveOp] = useState(null);
  const [mouseStart, setMouseStart] = useState({ x: 0, y: 0 });
  const [currentPxDelta, setCurrentPxDelta] = useState({ x: 0, y: 0 });

  const [initialCardRect, setInitialCardRect] = useState({
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
  });

  const initialGeometryRef = useRef({ x: 1, y: 1, w: 1, h: 1 });
  const initialLayoutRef = useRef({});
  const pressTimer = useRef(null);
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  const widgetPropsFeed = {
    connectedServer,
    activeConnectionsCount,
    peers,
    totalServidoresGuardados,
    recentFiles,
    cpuUsage,
    ping,
    musicState,
    activeGame,
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      const rect = containerRef.current.getBoundingClientRect();
      setContainerSize({ w: rect.width, h: rect.height });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  const actualizarHistorialArchivos = () => {
    if (window.electronAPI?.getRecentFiles) {
      window.electronAPI
        .getRecentFiles()
        .then((files) => {
          console.log(
            "[Onicord Bento UI] Fresh database data received, count:",
            files?.length,
          );
          setRecentFiles(files || []);
        })
        .catch((err) =>
          console.error("[Onicord Bento Error] Falló el fetch del index:", err),
        );
    }
  };

  useEffect(() => {
    actualizarHistorialArchivos();

    if (window.electronAPI?.onSyncComplete) {
      const desuscribir = window.electronAPI.onSyncComplete((data) => {
        console.log(
          "[Onicord Bento Signal] Outbound P2P upload event detected:",
          data,
        );
        actualizarHistorialArchivos();
      });

      return () => {
        if (typeof desuscribir === "function") desuscribir();
      };
    }
  }, [currentConnectedServerId]); 

  const celdaEstaOcupada = (x, y, w, h, currentKey, elLayout) => {
    if (x < 1 || x + w - 1 > 12 || y < 1 || y + h - 1 > 6) return true;
    return Object.keys(elLayout).some((k) => {
      if (k === currentKey) return false;
      const o = elLayout[k];
      return x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y;
    });
  };

  const resolverColisionesCascada = (currentKey, nextGeo, lasIslas) => {
    let copiaFinal = {};
    copiaFinal[currentKey] = { ...nextGeo };

    const layoutOriginal = initialLayoutRef.current && Object.keys(initialLayoutRef.current).length > 0
      ? initialLayoutRef.current
      : lasIslas;

    const otherKeys = Object.keys(lasIslas)
      .filter((k) => k !== currentKey)
      .sort((a, b) => {
        const geoA = layoutOriginal[a] || lasIslas[a];
        const geoB = layoutOriginal[b] || lasIslas[b];
        if (geoA.y !== geoB.y) return geoA.y - geoB.y;
        return geoA.x - geoB.x;
      });

    const celdasSeTocan = (g1, g2) => {
      return (
        g1.x < g2.x + g2.w &&
        g1.x + g1.w > g2.x &&
        g1.y < g2.y + g2.h &&
        g1.y + g1.h > g2.y
      );
    };

    const encontrarEspacioMasCercano = (key, originalGeo, elLayout) => {
      const Comp = WIDGET_COMPONENTS[key];
      const minW = Comp?.minW || 1;
      const minH = Comp?.minH || 1;
      let mejorGeo = null;
      let mejorDistancia = Infinity;

      for (let y = 1; y <= 6; y++) {
        for (let x = 1; x <= 12; x++) {
          if (x + originalGeo.w - 1 <= 12 && y + originalGeo.h - 1 <= 6) {
            const propuesta = { x, y, w: originalGeo.w, h: originalGeo.h };
            const ocupado = Object.keys(elLayout).some((placedKey) =>
              celdasSeTocan(propuesta, elLayout[placedKey])
            );

            if (!ocupado) {
              const dist = Math.hypot(x - originalGeo.x, y - originalGeo.y);
              if (dist < mejorDistancia) {
                mejorDistancia = dist;
                mejorGeo = propuesta;
              }
            }
          }
        }
      }

      if (mejorGeo) return mejorGeo;

      mejorDistancia = Infinity;
      for (let y = 1; y <= 6; y++) {
        for (let x = 1; x <= 12; x++) {
          if (x + minW - 1 <= 12 && y + minH - 1 <= 6) {
            const propuesta = { x, y, w: minW, h: minH };
            const ocupado = Object.keys(elLayout).some((placedKey) =>
              celdasSeTocan(propuesta, elLayout[placedKey])
            );
            if (!ocupado) {
              const dist = Math.hypot(x - originalGeo.x, y - originalGeo.y);
              if (dist < mejorDistancia) {
                mejorDistancia = dist;
                mejorGeo = propuesta;
              }
            }
          }
        }
      }

      return mejorGeo || { x: originalGeo.x, y: originalGeo.y, w: minW, h: minH };
    };

    otherKeys.forEach((key) => {
      const originalGeo = layoutOriginal[key] || lasIslas[key];
      const choca = Object.keys(copiaFinal).some((placedKey) =>
        celdasSeTocan(originalGeo, copiaFinal[placedKey])
      );

      if (choca) {
        copiaFinal[key] = encontrarEspacioMasCercano(key, originalGeo, copiaFinal);
      } else {
        copiaFinal[key] = { ...originalGeo };
      }
    });

    return copiaFinal;
  };

  useEffect(() => {
    if (!activeOp) return;

    let animationFrameId = null;

    const handlePointerMove = (e) => {
      if (animationFrameId) return;

      animationFrameId = requestAnimationFrame(() => {
        animationFrameId = null;
        if (!containerRef.current) return;
        const currentRect = containerRef.current.getBoundingClientRect();

        const cellWidth = currentRect.width / 12;
        const cellHeight = currentRect.height / 6;

      const deltaX = e.clientX - mouseStart.x;
      const deltaY = e.clientY - mouseStart.y;
      setCurrentPxDelta({ x: deltaX, y: deltaY });

      const cellDeltaX = Math.round(deltaX / cellWidth);
      const cellDeltaY = Math.round(deltaY / cellHeight);

      const { x, y, w, h } = initialGeometryRef.current;

      setIslas((currentIslas) => {
        let nextLogicalGeo = { ...currentIslas[activeOp.key] };

        if (activeOp.type === "drag") {
          nextLogicalGeo.x = Math.round(
            Math.max(1, Math.min(12 - w + 1, x + cellDeltaX)),
          );
          nextLogicalGeo.y = Math.round(
            Math.max(1, Math.min(6 - h + 1, y + cellDeltaY)),
          );
        } else if (activeOp.type === "resize") {
          const dir = activeOp.direction;
          const WidgetAsociado = WIDGET_COMPONENTS[activeOp.key];
          const limitW = WidgetAsociado?.minW || 2;
          const limitH = WidgetAsociado?.minH || 2;

          if (dir.includes("e"))
            nextLogicalGeo.w = Math.round(
              Math.max(limitW, Math.min(12 - x + 1, w + cellDeltaX)),
            );
          if (dir.includes("s"))
            nextLogicalGeo.h = Math.round(
              Math.max(limitH, Math.min(6 - y + 1, h + cellDeltaY)),
            );
          if (dir.includes("w")) {
            const potentialX = Math.round(
              Math.max(1, Math.min(x + w - limitW, x + cellDeltaX)),
            );
            nextLogicalGeo.w = Math.round(w + (x - potentialX));
            nextLogicalGeo.x = potentialX;
          }
          if (dir.includes("n")) {
            const potentialY = Math.round(
              Math.max(1, Math.min(y + h - limitH, y + cellDeltaY)),
            );
            nextLogicalGeo.h = Math.round(h + (y - potentialY));
            nextLogicalGeo.y = potentialY;
          }
        }

        if (
          currentIslas[activeOp.key].x === nextLogicalGeo.x &&
          currentIslas[activeOp.key].y === nextLogicalGeo.y &&
          currentIslas[activeOp.key].w === nextLogicalGeo.w &&
          currentIslas[activeOp.key].h === nextLogicalGeo.h
        ) {
          return currentIslas;
        }

        soundEngine.playWidgetSnap();

        return resolverColisionesCascada(
          activeOp.key,
          nextLogicalGeo,
          currentIslas,
        );
      });
      });
    };

    const handlePointerUp = () => {
      if (activeOp?.type === "drag") {
        soundEngine.playCue("drop");
      } else if (activeOp?.type === "resize") {
        soundEngine.playCue("release");
      }

      setIslas((estadoPrevio) => {
        const copiaFinal = { ...estadoPrevio };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(copiaFinal));
        return copiaFinal;
      });

      setActiveOp(null);
      setIsEditable(false);
      setCurrentPxDelta({ x: 0, y: 0 });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [activeOp, mouseStart]); 

  const handleBodyPointerDown = (e, key) => {
    if (
      e.target.closest(".resize-handle") ||
      e.target.closest("button") ||
      e.target.closest("a") ||
      e.target.closest("canvas") ||
      e.target.closest("select") ||
      e.target.closest("input") ||
      e.target.closest("textarea")
    )
      return;

    const clientX = e.clientX;
    const clientY = e.clientY;
    const rect = e.currentTarget.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();

    pressTimer.current = setTimeout(() => {
      setIsEditable(true);
      setActiveOp({ type: "drag", key });
      soundEngine.playCue("drag-start");
      setMouseStart({ x: clientX, y: clientY });
      initialGeometryRef.current = { ...(islas?.[key] || CONFIG_ISLAS.find(c => c.id === key)?.defaultGeo || { x: 1, y: 1, w: 1, h: 1 }) };
      initialLayoutRef.current = { ...islas };
      setInitialCardRect({
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
        right: containerRect.right - rect.right,
        bottom: containerRect.bottom - rect.bottom,
        width: rect.width,
        height: rect.height,
      });
    }, 200);
  };

  const handleResizePointerDown = (e, key, direction) => {
    e.stopPropagation();
    e.preventDefault();
    setIsEditable(true);
    setActiveOp({ type: "resize", key, direction });
    soundEngine.playCue("press");
    setMouseStart({ x: e.clientX, y: e.clientY });
    initialGeometryRef.current = { ...(islas?.[key] || CONFIG_ISLAS.find(c => c.id === key)?.defaultGeo || { x: 1, y: 1, w: 1, h: 1 }) };
    initialLayoutRef.current = { ...islas };

    const rect = e.currentTarget.closest("[data-key]").getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    setInitialCardRect({
      left: rect.left - containerRect.left,
      top: rect.top - containerRect.top,
      right: containerRect.right - rect.right,
      bottom: containerRect.bottom - rect.bottom,
      width: rect.width,
      height: rect.height,
    });
  };

  const handlePointerUpLocal = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  return (
    <div
      style={{ gap: "calc(var(--gap) + 3px)" }}
      className="flex-1 h-full bg-transparent select-none flex flex-col animate-fade-in pr-1"
    >
      <header className="onicord-dashboard-header">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {}
          <div className={`h-12 w-12 rounded-full flex items-center justify-center overflow-hidden shrink-0 shadow-inner select-none transition-transform duration-300 hover:scale-105 active:scale-95 ${profile?.avatar ? "" : "bg-onicord-island"}`}>
            {profile?.avatar ? (
              <SmartAnimatedImage
                src={profile.avatar} 
                alt={`${profile?.nickname || 'User'}'s profile`}
                className="w-full h-full object-cover rounded-full"
                isAvatar={true}
              />
            ) : null}

            {}
            <span
              className="text-sm font-black font-mono text-onicord-accent uppercase"
              style={{ display: profile?.avatar ? "none" : "flex" }}
            >
              {profile?.nickname ? profile.nickname.charAt(0) : "U"}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-onicord-text tracking-wide truncate">
              {t("dashboard.welcomeUser", { nickname: profile?.nickname })}
            </h1>
            <p className="text-xs text-onicord-muted mt-0.5 truncate">
              {t("dashboard.personalDashboard")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 pl-4">
          {}
          {isDevelopment && (
            <button
              onClick={async () => {
                console.log(
                  "%c🚀 [KABU Lab Bento Matrix] ¡Guardando Layout Base en Scripts de Widgets!",
                  "color: #89b4fa; font-weight: bold;",
                );

                if (window.electronAPI?.saveDevDefaultLayout) {
                  const res = await window.electronAPI.saveDevDefaultLayout(islas);
                  if (res?.success) {
                    console.log(`[Bento Matrix] Layout base actualizado en ${res.updatedCount} archivos.`);
                    alert(`💾 ¡Layout base guardado exitosamente en ${res.updatedCount} archivos de widgets!`);
                  } else {
                    console.error("[Bento Matrix Error]", res?.error);
                    alert(`❌ Error guardando layout base: ${res?.error || "Desconocido"}`);
                  }
                } else {
                  if (islas) {
                    Object.keys(islas).forEach((key) => {
                      console.log(`${key}:`, JSON.stringify(islas[key]));
                    });
                  }
                  alert("Layout copiado a la consola.");
                }
              }}
              className="px-4 py-2 bg-onicord-island text-onicord-text border border-white/10 font-semibold rounded-onicord-inner text-xs transition-all duration-150 active:scale-95 hover:bg-white/5 cursor-pointer shadow-sm"
            >
              Fijar Layout Base (💾)
            </button>
          )}
        </div>
      </header>

      <div
        ref={containerRef}
        style={{
          gap: "calc(var(--gap) + 3px)",
          gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
          gridTemplateRows: "repeat(6, minmax(0, 1fr))",
        }}
        className="onicord-bento-grid relative w-full h-full"
      >
        {/* Snap Preview Shadow */}
        {activeOp && islas?.[activeOp.key] && (
          <div
            style={{
              gridArea: `${islas[activeOp.key].y} / ${islas[activeOp.key].x} / span ${islas[activeOp.key].h} / span ${islas[activeOp.key].w}`,
            }}
            className="bg-white/5 border border-dashed border-white/20 rounded-onicord-outer-p4 pointer-events-none z-10 transition-all duration-150 ease-out"
          />
        )}

        {getCombinedConfigs().map((meta) => {
          const key = meta.id;
          if (islas && !Object.prototype.hasOwnProperty.call(islas, key)) {
            return null; 
          }

          const geo = (islas && islas[key]) ? islas[key] : meta.defaultGeo;
          const isSelected = activeOp?.key === key; 

          const WidgetComponent = getWidgetComponent(key);
          if (!WidgetComponent) return null;

          const variantViva =
            WidgetComponent?.bgVariant || meta.bgVariant || "dark";
          const badgeVivo =
            t("widgets.badges." + key, WidgetComponent?.badgeText || meta.badgeText || "Module");

          const customBg = widgetsBackgrounds[key] || null;

          let customStyle = {
            gridArea: `${geo.y} / ${geo.x} / span ${geo.h} / span ${geo.w}`,
          };

          if (isSelected) {
            const dir = activeOp.direction || "";
            customStyle = {
              position: "absolute",
              zIndex: 100,
              left: `${initialCardRect.left + (activeOp.type === "drag" || dir.includes("w") ? currentPxDelta.x : 0)}px`,
              top: `${initialCardRect.top + (activeOp.type === "drag" || dir.includes("n") ? currentPxDelta.y : 0)}px`,
              width: `${initialCardRect.width + (activeOp.type === "resize" && dir.includes("e") ? currentPxDelta.x : activeOp.type === "resize" && dir.includes("w") ? -currentPxDelta.x : 0)}px`,
              height: `${initialCardRect.height + (activeOp.type === "resize" && dir.includes("s") ? currentPxDelta.y : activeOp.type === "resize" && dir.includes("n") ? -currentPxDelta.y : 0)}px`,
            };
          }

          const isPluginWidget = meta.isPlugin || key.includes(":");

          return (
            <div
              key={key}
              data-key={key}
              onPointerDown={(e) => handleBodyPointerDown(e, key)} 
              onPointerUp={handlePointerUpLocal}
              style={customStyle}
              className={`min-w-0 min-h-0 rounded-onicord-outer-p4 ${
                isSelected
                  ? "transition-none shadow-2xl border-onicord-accent/80 scale-x-[0.98] scale-y-[0.98]"
                  : "transition-all duration-500 ease-out transform-gpu scale-100 border-transparent"
              }`}
            >
              <Isla
                isEditable={isEditable && activeOp?.key === key}
                badgeText={badgeVivo}
                bgVariant={variantViva}
                className="h-full w-full"
                customBackground={customBg}
              >
                {isPluginWidget ? (
                  <WidgetComponent
                    widgetMeta={meta.pluginMeta || meta}
                    roomCode={connectedServer?.roomCode}
                    peerId={profile?.id}
                    profile={profile}
                    activeGame={activeGame}
                    voiceState={{ isConnected: activeConnectionsCount > 0, peers }}
                    serverDetails={{ name: connectedServer?.name, memberCount: activeConnectionsCount + 1 }}
                    setCustomBackground={(bgData) => handleUpdateWidgetBg(key, bgData)}
                  />
                ) : (
                  <WidgetComponent
                    {...widgetPropsFeed}
                    profile={profile}
                    musicState={musicState}
                    setCustomBackground={(bgData) => handleUpdateWidgetBg(key, bgData)}
                  />
                )}
              </Isla>

              {}
              <div className="absolute inset-0 pointer-events-none rounded-onicord-outer-p4 border border-transparent group-hover:border-onicord-accent/20 transition-colors duration-200">
                <div
                  onPointerDown={(e) => handleResizePointerDown(e, key, "n")}
                  className="resize-handle onicord-bento-resize-edge-h top-[-3px]"
                />
                <div
                  onPointerDown={(e) => handleResizePointerDown(e, key, "s")}
                  className="resize-handle onicord-bento-resize-edge-h bottom-[-3px] top-auto"
                />
                <div
                  onPointerDown={(e) => handleResizePointerDown(e, key, "w")}
                  className="resize-handle onicord-bento-resize-edge-v left-[-3px]"
                />
                <div
                  onPointerDown={(e) => handleResizePointerDown(e, key, "e")}
                  className="resize-handle onicord-bento-resize-edge-v right-[-3px] left-auto"
                />

                <div
                  onPointerDown={(e) => handleResizePointerDown(e, key, "nw")}
                  className="resize-handle absolute top-[-3px] left-[-3px] w-2 h-2 cursor-nwse-resize pointer-events-auto"
                />
                <div
                  onPointerDown={(e) => handleResizePointerDown(e, key, "ne")}
                  className="resize-handle absolute top-[-3px] right-[-3px] w-2 h-2 cursor-nesw-resize pointer-events-auto"
                />
                <div
                  onPointerDown={(e) => handleResizePointerDown(e, key, "sw")}
                  className="resize-handle absolute bottom-[-3px] left-[-3px] w-2 h-2 cursor-nesw-resize pointer-events-auto"
                />
                <div
                  onPointerDown={(e) => handleResizePointerDown(e, key, "se")}
                  className="resize-handle absolute bottom-[-3px] right-[-3px] w-2 h-2 cursor-nwse-resize pointer-events-auto"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
