import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import SmartAnimatedImage from "../ui/SmartAnimatedImage";
import Heading from "../ui/Heading";
import MaterialIcon from "../icons/MaterialIcon";
import IslaV2 from "./IslaV2";
import BentoCustomizeBar from "./BentoCustomizeBar";
import WidgetGalleryDrawer from "./WidgetGalleryDrawer";
import { buildCombinedV2Configs } from "./dashboardV2Config";
import {
  DEFAULT_CONSTRAINTS,
  GRID_COLS,
  GRID_GAP_PX,
  MIN_VISIBLE_ROWS,
  clampGeo,
  isDarkSurfaceId,
} from "../../lib/bento-v2/bentoTypes";
import {
  cloneLayout,
  compactVertical,
  findOpenSlot,
  getGridMaxRow,
  layoutsEqual,
  resolveDrag,
  resolveResize,
} from "../../lib/bento-v2/collisionSolver";
import {
  buildConstraintsMap,
  loadV2State,
  resetV2All,
  saveV2Hidden,
  saveV2Layout,
  saveV2Styles,
} from "../../lib/bento-v2/layoutStorage";
import { useBentoFlip } from "../../lib/bento-v2/useBentoFlip";
import { soundEngine } from "../../lib/soundEngine";
import { cn } from "../../lib/cn";

const MAX_UNDO = 30;
const DRAG_HOLD_MS = 180;
const DRAG_CANCEL_DIST_PX = 6;

export default function HomeDashboardV2({
  isActive = true,
  profile,
  servers,
  peers = [],
  currentConnectedServerId,
  musicState,
  activeGame = null,
}) {
  const { t } = useTranslation();
  const [pluginWidgets, setPluginWidgets] = useState([]);
  const [recentFiles, setRecentFiles] = useState([]);
  const [widgetsBackgrounds, setWidgetsBackgrounds] = useState({});

  const configs = useMemo(() => buildCombinedV2Configs(pluginWidgets), [pluginWidgets]);
  const constraintsMap = useMemo(() => buildConstraintsMap(configs), [configs]);

  const [v2State, setV2State] = useState(() => loadV2State(buildCombinedV2Configs([])));
  const { layout, styles, hiddenIds } = v2State;

  const [isCustomizing, setIsCustomizing] = useState(false);
  const [showGallery, setShowGallery] = useState(false);

  // Undo / Redo history for layout changes
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  // Viewport sizing for square grid cells + vertical scroll
  const scrollRef = useRef(null);
  const gridRef = useRef(null);
  const [cellSize, setCellSize] = useState(90);
  const [viewportRows, setViewportRows] = useState(MIN_VISIBLE_ROWS);

  // Active drag / resize state
  const [activeOp, setActiveOp] = useState(null);
  const [pxDelta, setPxDelta] = useState({ x: 0, y: 0 });
  const initialLayoutRef = useRef(null);
  const initialCardRectRef = useRef({ left: 0, top: 0, width: 0, height: 0 });
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const pendingDragRef = useRef(null);

  const { captureRects } = useBentoFlip(gridRef, layout, activeOp?.key || null);

  // Sync plugins
  useEffect(() => {
    if (window.electronAPI?.getDashboardWidgets) {
      window.electronAPI
        .getDashboardWidgets()
        .then((list) => {
          if (Array.isArray(list)) setPluginWidgets(list);
        })
        .catch(() => {});
    }
    if (window.electronAPI?.onDashboardWidgetsUpdated) {
      return window.electronAPI.onDashboardWidgetsUpdated((list) => {
        if (Array.isArray(list)) setPluginWidgets(list);
      });
    }
  }, []);

  // Re-sync layout when plugin widgets arrive
  useEffect(() => {
    if (pluginWidgets.length === 0) return;
    setV2State((prev) => {
      const next = loadV2State(configs);
      return {
        layout: { ...next.layout, ...prev.layout },
        styles: prev.styles,
        hiddenIds: prev.hiddenIds,
      };
    });
  }, [configs, pluginWidgets.length]);

  // Measure grid width & viewport height to keep grid cells 100% square
  useEffect(() => {
    const scrollEl = scrollRef.current;
    const gridEl = gridRef.current;
    if (!scrollEl && !gridEl) return;

    const update = () => {
      const gridW = gridEl?.clientWidth || scrollEl?.clientWidth || 0;
      if (gridW <= 0) return;
      const nextCell = Math.max(48, (gridW - (GRID_COLS - 1) * GRID_GAP_PX) / GRID_COLS);
      setCellSize((prev) => (Math.abs(prev - nextCell) > 0.25 ? nextCell : prev));

      const scrollH = scrollEl?.clientHeight || 0;
      if (scrollH > 0) {
        const nextViewportRows = Math.max(
          MIN_VISIBLE_ROWS,
          Math.ceil((scrollH + GRID_GAP_PX) / (nextCell + GRID_GAP_PX))
        );
        setViewportRows((prev) => (prev !== nextViewportRows ? nextViewportRows : prev));
      }
    };

    update();
    const obs = new ResizeObserver(update);
    if (scrollEl) obs.observe(scrollEl);
    if (gridEl) obs.observe(gridEl);
    return () => obs.disconnect();
  }, []);

  // Recent files for bridged FilesWidget
  const refreshRecentFiles = useCallback(() => {
    if (window.electronAPI?.getRecentFiles) {
      window.electronAPI
        .getRecentFiles()
        .then((files) => setRecentFiles(files || []))
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    refreshRecentFiles();
    if (window.electronAPI?.onSyncComplete) {
      const unsub = window.electronAPI.onSyncComplete(() => refreshRecentFiles());
      return () => {
        if (typeof unsub === "function") unsub();
      };
    }
  }, [currentConnectedServerId, refreshRecentFiles]);

  const totalServidoresGuardados = servers?.length || 0;
  const connectedServer = servers?.find((s) => s.id === currentConnectedServerId);
  const activeConnectionsCount = peers.length;

  const ping = useMemo(() => {
    const valid = (peers || [])
      .filter((p) => p.online !== false && p.ping !== undefined && p.ping !== null && p.ping > 0)
      .map((p) => p.ping);
    if (valid.length === 0) return 0;
    return Math.round(Math.min(...valid));
  }, [peers]);

  const handleUpdateWidgetBg = useCallback((widgetId, bgData) => {
    setWidgetsBackgrounds((prev) => {
      const safePrev = prev || {};
      if (
        safePrev[widgetId]?.value === bgData?.value &&
        safePrev[widgetId]?.type === bgData?.type &&
        Boolean(safePrev[widgetId]?.unblurred) === Boolean(bgData?.unblurred)
      ) {
        return safePrev;
      }
      return { ...safePrev, [widgetId]: bgData };
    });
  }, []);

  const pushUndoSnapshot = useCallback((snapshot) => {
    setUndoStack((prev) => [...prev.slice(-(MAX_UNDO - 1)), cloneLayout(snapshot)]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const target = prev[prev.length - 1];
      captureRects();
      setV2State((curr) => {
        setRedoStack((r) => [...r, cloneLayout(curr.layout)]);
        saveV2Layout(target);
        return { ...curr, layout: cloneLayout(target) };
      });
      return prev.slice(0, -1);
    });
  }, [captureRects]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const target = prev[prev.length - 1];
      captureRects();
      setV2State((curr) => {
        setUndoStack((u) => [...u, cloneLayout(curr.layout)]);
        saveV2Layout(target);
        return { ...curr, layout: cloneLayout(target) };
      });
      return prev.slice(0, -1);
    });
  }, [captureRects]);

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Y / Escape
  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape" && activeOp && initialLayoutRef.current) {
        e.preventDefault();
        captureRects();
        const restored = cloneLayout(initialLayoutRef.current);
        setV2State((curr) => ({ ...curr, layout: restored }));
        setActiveOp(null);
        setPxDelta({ x: 0, y: 0 });
        initialLayoutRef.current = null;
        return;
      }

      if (!isCustomizing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isActive, isCustomizing, activeOp, captureRects, handleUndo, handleRedo]);

  // Pointer drag/resize loop
  useEffect(() => {
    if (!activeOp) return;

    let rafId = null;

    const onPointerMove = (e) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const gridEl = gridRef.current;
        const baseLayout = initialLayoutRef.current;
        if (!gridEl || !baseLayout) return;

        const gridRect = gridEl.getBoundingClientRect();
        const stepX = (gridRect.width + GRID_GAP_PX) / GRID_COLS;
        const stepY = cellSize + GRID_GAP_PX;

        const dx = e.clientX - pointerStartRef.current.x;
        const dy = e.clientY - pointerStartRef.current.y;
        setPxDelta({ x: dx, y: dy });

        const cellDeltaX = Math.round(dx / stepX);
        const cellDeltaY = Math.round(dy / stepY);

        const orig = baseLayout[activeOp.key];
        if (!orig) return;

        setV2State((curr) => {
          let nextLayout = curr.layout;

          if (activeOp.type === "drag") {
            const targetX = orig.x + cellDeltaX;
            const targetY = Math.max(1, orig.y + cellDeltaY);
            nextLayout = resolveDrag(
              baseLayout,
              activeOp.key,
              targetX,
              targetY,
              constraintsMap
            );
          } else if (activeOp.type === "resize") {
            const dir = activeOp.direction;
            const c = constraintsMap[activeOp.key] || DEFAULT_CONSTRAINTS;
            let nextGeo = { ...orig };

            if (dir.includes("e")) {
              nextGeo.w = orig.w + cellDeltaX;
            }
            if (dir.includes("s")) {
              nextGeo.h = orig.h + cellDeltaY;
            }
            if (dir.includes("w")) {
              const clampedX = Math.max(1, Math.min(orig.x + orig.w - c.minW, orig.x + cellDeltaX));
              nextGeo.x = clampedX;
              nextGeo.w = orig.w + (orig.x - clampedX);
            }
            if (dir.includes("n")) {
              const clampedY = Math.max(1, Math.min(orig.y + orig.h - c.minH, orig.y + cellDeltaY));
              nextGeo.y = clampedY;
              nextGeo.h = orig.h + (orig.y - clampedY);
            }

            nextGeo = clampGeo(nextGeo, c);
            nextLayout = resolveResize(
              baseLayout,
              activeOp.key,
              nextGeo,
              dir,
              constraintsMap
            );
          }

          if (layoutsEqual(curr.layout, nextLayout)) {
            return curr;
          }

          captureRects();
          soundEngine.playWidgetSnap();
          return { ...curr, layout: nextLayout };
        });
      });
    };

    const onPointerUp = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (activeOp.type === "drag") soundEngine.playCue("drop");
      else soundEngine.playCue("release");

      const startLayout = initialLayoutRef.current;
      initialLayoutRef.current = null;

      setV2State((curr) => {
        if (startLayout && !layoutsEqual(startLayout, curr.layout)) {
          saveV2Layout(curr.layout);
          queueMicrotask(() => pushUndoSnapshot(startLayout));
        }
        return curr;
      });

      setActiveOp(null);
      setPxDelta({ x: 0, y: 0 });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [activeOp, cellSize, constraintsMap, captureRects, pushUndoSnapshot]);

  // Cancel pending long-press if pointer moves > 6px before hold triggers
  useEffect(() => {
    const onMoveCancelCheck = (e) => {
      const pending = pendingDragRef.current;
      if (!pending) return;
      const dist = Math.hypot(e.clientX - pending.x, e.clientY - pending.y);
      if (dist > DRAG_CANCEL_DIST_PX) {
        clearTimeout(pending.timer);
        pendingDragRef.current = null;
      }
    };
    const onUpClear = () => {
      if (pendingDragRef.current) {
        clearTimeout(pendingDragRef.current.timer);
        pendingDragRef.current = null;
      }
    };
    window.addEventListener("pointermove", onMoveCancelCheck);
    window.addEventListener("pointerup", onUpClear);
    window.addEventListener("pointercancel", onUpClear);
    return () => {
      window.removeEventListener("pointermove", onMoveCancelCheck);
      window.removeEventListener("pointerup", onUpClear);
      window.removeEventListener("pointercancel", onUpClear);
    };
  }, []);

  const beginOperation = useCallback(
    (type, key, clientX, clientY, cardEl, direction = "") => {
      if (!gridRef.current || !cardEl) return;
      const cardRect = cardEl.getBoundingClientRect();
      const gridRect = gridRef.current.getBoundingClientRect();

      initialLayoutRef.current = cloneLayout(layout);
      initialCardRectRef.current = {
        left: cardRect.left - gridRect.left,
        top: cardRect.top - gridRect.top,
        width: cardRect.width,
        height: cardRect.height,
      };
      pointerStartRef.current = { x: clientX, y: clientY };
      setPxDelta({ x: 0, y: 0 });
      setActiveOp({ type, key, direction });
      soundEngine.playCue(type === "drag" ? "drag-start" : "press");
    },
    [layout]
  );

  const handleWidgetPointerDown = (e, key) => {
    if (e.button !== 0) return;
    if (
      e.target.closest("[data-no-drag='true']") ||
      e.target.closest(".bento-v2-resize-handle") ||
      e.target.closest("button") ||
      e.target.closest("a") ||
      e.target.closest("input") ||
      e.target.closest("select") ||
      e.target.closest("textarea") ||
      e.target.closest("canvas")
    ) {
      return;
    }

    const cardEl = e.currentTarget;
    const cx = e.clientX;
    const cy = e.clientY;

    if (isCustomizing) {
      e.preventDefault();
      beginOperation("drag", key, cx, cy, cardEl);
      return;
    }

    const timer = setTimeout(() => {
      pendingDragRef.current = null;
      beginOperation("drag", key, cx, cy, cardEl);
    }, DRAG_HOLD_MS);

    pendingDragRef.current = { timer, x: cx, y: cy };
  };

  const handleResizePointerDown = (e, key, direction) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const cardEl = e.currentTarget.closest("[data-bento-key]");
    beginOperation("resize", key, e.clientX, e.clientY, cardEl, direction);
  };

  const handleHideWidget = useCallback(
    (widgetId) => {
      captureRects();
      setV2State((curr) => {
        pushUndoSnapshot(curr.layout);
        const nextLayout = cloneLayout(curr.layout);
        delete nextLayout[widgetId];
        const compacted = compactVertical(nextLayout);
        const nextHidden = Array.from(new Set([...curr.hiddenIds, widgetId]));
        saveV2Layout(compacted);
        saveV2Hidden(nextHidden);
        return { ...curr, layout: compacted, hiddenIds: nextHidden };
      });
    },
    [captureRects, pushUndoSnapshot]
  );

  const handleToggleWidget = useCallback(
    (widgetId) => {
      captureRects();
      setV2State((curr) => {
        pushUndoSnapshot(curr.layout);
        const exists = Boolean(curr.layout[widgetId]);
        const nextLayout = cloneLayout(curr.layout);
        let nextHidden = [...curr.hiddenIds];

        if (exists) {
          delete nextLayout[widgetId];
          if (!nextHidden.includes(widgetId)) nextHidden.push(widgetId);
        } else {
          nextHidden = nextHidden.filter((id) => id !== widgetId);
          const cfg = configs.find((c) => c.id === widgetId);
          const baseGeo = clampGeo(cfg?.defaultGeo || { x: 1, y: 1, w: 3, h: 3 }, constraintsMap[widgetId]);
          nextLayout[widgetId] = findOpenSlot(nextLayout, baseGeo.w, baseGeo.h);
        }

        const compacted = compactVertical(nextLayout);
        saveV2Layout(compacted);
        saveV2Hidden(nextHidden);
        return { ...curr, layout: compacted, hiddenIds: nextHidden };
      });
    },
    [captureRects, pushUndoSnapshot, configs, constraintsMap]
  );

  const handleChangeSurface = useCallback((widgetId, surfaceId) => {
    setV2State((curr) => {
      const nextStyles = { ...curr.styles, [widgetId]: surfaceId };
      saveV2Styles(nextStyles);
      return { ...curr, styles: nextStyles };
    });
  }, []);

  const handleReset = useCallback(() => {
    captureRects();
    setV2State((curr) => {
      pushUndoSnapshot(curr.layout);
      resetV2All();
      return loadV2State(configs);
    });
  }, [captureRects, pushUndoSnapshot, configs]);

  const maxRow = useMemo(() => getGridMaxRow(layout, MIN_VISIBLE_ROWS), [layout]);
  const showGridUnderlay = isCustomizing || Boolean(activeOp);
  const visibleRows = Math.max(maxRow + (showGridUnderlay ? 1 : 0), viewportRows, MIN_VISIBLE_ROWS);
  const activeIdsSet = useMemo(() => new Set(Object.keys(layout)), [layout]);

  const bridgedProps = {
    connectedServer,
    activeConnectionsCount,
    peers,
    totalServidoresGuardados,
    recentFiles,
    cpuUsage: 8,
    ping,
    musicState,
    activeGame,
    isActive,
    profile,
  };

  return (
    <div
      style={{ gap: "calc(var(--gap) + 3px)" }}
      className="flex-1 h-full bg-transparent select-none flex flex-col animate-fade-in pr-1 min-h-0"
    >
      {/* Header */}
      <header className="onicord-dashboard-header">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div
            className={cn(
              "h-12 w-12 rounded-full flex items-center justify-center overflow-hidden shrink-0 shadow-inner select-none transition-transform duration-relaxed hover:scale-105",
              !profile?.avatar && "bg-onicord-island"
            )}
          >
            {profile?.avatar ? (
              <SmartAnimatedImage
                src={profile.avatar}
                alt={`${profile?.nickname || "User"}'s profile`}
                className="w-full h-full object-cover rounded-full"
                isAvatar={true}
              />
            ) : (
              <span className="text-sm font-black font-mono text-onicord-accent uppercase">
                {profile?.nickname ? profile.nickname.charAt(0) : "U"}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <Heading level={1} size="xl" truncate>
              {t("dashboard.welcomeUser", { nickname: profile?.nickname })}
            </Heading>
            <p className="text-xs text-onicord-muted mt-0.5 truncate">
              {isCustomizing
                ? t(
                    "dashboard.v2.customizeHint",
                    "Drag to swap, resize any edge, or change colors"
                  )
                : t("dashboard.personalDashboard")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 pl-4">
          {isCustomizing ? (
            <BentoCustomizeBar
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              onOpenGallery={() => setShowGallery(true)}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onReset={handleReset}
              onDone={() => setIsCustomizing(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsCustomizing(true)}
              className="onicord-btn-secondary border border-onicord-border bg-onicord-surface gap-1.5"
            >
              <MaterialIcon name="dashboard_customize" size={16} />
              <span>{t("dashboard.v2.customize", "Customize")}</span>
            </button>
          )}
        </div>
      </header>

      {/* Scrollable Bento Grid Viewport */}
      <div
        ref={scrollRef}
        onContextMenu={(e) => {
          if (e.target === scrollRef.current || e.target === gridRef.current) {
            e.preventDefault();
            setIsCustomizing((v) => !v);
          }
        }}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto overflow-x-hidden bento-v2-no-scrollbar rounded-onicord-outer-p4 p-0.5 transition-colors duration-normal",
          isCustomizing ? "bg-onicord-mantle/25" : "bg-onicord-mantle/10"
        )}
      >
        <div
          ref={gridRef}
          style={{
            gap: `${GRID_GAP_PX}px`,
            gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
            gridAutoRows: `${cellSize}px`,
            minHeight: `${visibleRows * cellSize + (visibleRows - 1) * GRID_GAP_PX}px`,
          }}
          className="grid relative w-full"
        >
          {/* Pixel-Aligned Square Grid Underlay */}
          {showGridUnderlay && (
            <div
              aria-hidden="true"
              style={{
                gap: `${GRID_GAP_PX}px`,
                gridTemplateColumns: `repeat(${GRID_COLS}, minmax(0, 1fr))`,
                gridAutoRows: `${cellSize}px`,
              }}
              className="absolute inset-x-0 top-0 grid pointer-events-none z-0"
            >
              {Array.from({ length: GRID_COLS * visibleRows }).map((_, idx) => (
                <div
                  key={idx}
                  className="bento-v2-grid-cell rounded-onicord-outer"
                />
              ))}
            </div>
          )}

          {/* Magnetic Snap Ghost */}
          {activeOp && layout?.[activeOp.key] && (
            <div
              style={{
                gridArea: `${layout[activeOp.key].y} / ${layout[activeOp.key].x} / span ${layout[activeOp.key].h} / span ${layout[activeOp.key].w}`,
              }}
              className="rounded-onicord-outer bg-onicord-accent/10 border-2 border-dashed border-onicord-accent/60 pointer-events-none z-10 transition-all duration-fast ease-onicord-out"
            />
          )}

          {configs.map((cfg) => {
            const geo = layout?.[cfg.id];
            if (!geo) return null;

            const isSelected = activeOp?.key === cfg.id;
            const surface = styles?.[cfg.id] || cfg.defaultSurface || "dark";
            const isDarkCard = isDarkSurfaceId(surface);
            const customBg = widgetsBackgrounds?.[cfg.id] || null;
            const WidgetComp = cfg.component;

            let wrapperStyle = {
              gridArea: `${geo.y} / ${geo.x} / span ${geo.h} / span ${geo.w}`,
            };

            if (isSelected) {
              const rect = initialCardRectRef.current;
              const dir = activeOp.direction || "";
              const minWpx = cellSize;
              const minHpx = cellSize;

              let left = rect.left;
              let top = rect.top;
              let width = rect.width;
              let height = rect.height;

              if (activeOp.type === "drag") {
                left += pxDelta.x;
                top += pxDelta.y;
              } else if (activeOp.type === "resize") {
                if (dir.includes("e")) width = Math.max(minWpx, rect.width + pxDelta.x);
                if (dir.includes("s")) height = Math.max(minHpx, rect.height + pxDelta.y);
                if (dir.includes("w")) {
                  const nextW = Math.max(minWpx, rect.width - pxDelta.x);
                  left = rect.left + (rect.width - nextW);
                  width = nextW;
                }
                if (dir.includes("n")) {
                  const nextH = Math.max(minHpx, rect.height - pxDelta.y);
                  top = rect.top + (rect.height - nextH);
                  height = nextH;
                }
              }

              wrapperStyle = {
                position: "absolute",
                zIndex: 40,
                left: 0,
                top: 0,
                width: `${width}px`,
                height: `${height}px`,
                transform: `translate3d(${left}px, ${top}px, 0) scale(0.985)`,
              };
            }

            return (
              <div
                key={cfg.id}
                data-bento-key={cfg.id}
                onPointerDown={(e) => handleWidgetPointerDown(e, cfg.id)}
                style={wrapperStyle}
                className={cn(
                  "group relative min-w-0 min-h-0 rounded-onicord-outer",
                  isSelected ? "z-titlebar" : "z-content"
                )}
              >
                <IslaV2
                  widgetId={cfg.id}
                  cols={geo.w}
                  rows={geo.h}
                  surface={surface}
                  customBackground={customBg}
                  isCustomizing={isCustomizing}
                  isDragging={isSelected}
                  usesV2Shell={!(cfg.isPlugin && cfg.pluginMeta?.frameless)}
                  onHideWidget={handleHideWidget}
                  onChangeSurface={handleChangeSurface}
                >
                  {cfg.isPlugin ? (
                    <WidgetComp
                      widgetMeta={cfg.pluginMeta || cfg}
                      roomCode={connectedServer?.roomCode}
                      peerId={profile?.id}
                      profile={profile}
                      activeGame={activeGame}
                      isActive={isActive}
                      voiceState={{ isConnected: activeConnectionsCount > 0, peers }}
                      serverDetails={{
                        name: connectedServer?.name,
                        memberCount: activeConnectionsCount + 1,
                      }}
                      setCustomBackground={(bg) => handleUpdateWidgetBg(cfg.id, bg)}
                    />
                  ) : (
                    <WidgetComp
                      {...bridgedProps}
                      setCustomBackground={(bg) => handleUpdateWidgetBg(cfg.id, bg)}
                    />
                  )}
                </IslaV2>

                {/* Ergonomic 8-way resize handles */}
                <div className="absolute inset-0 pointer-events-none z-30">
                  <div
                    onPointerDown={(e) => handleResizePointerDown(e, cfg.id, "n")}
                    className="bento-v2-resize-handle absolute -top-1.5 left-3 right-3 h-2 cursor-ns-resize pointer-events-auto"
                  />
                  <div
                    onPointerDown={(e) => handleResizePointerDown(e, cfg.id, "s")}
                    className="bento-v2-resize-handle absolute -bottom-1.5 left-3 right-3 h-2 cursor-ns-resize pointer-events-auto"
                  />
                  <div
                    onPointerDown={(e) => handleResizePointerDown(e, cfg.id, "w")}
                    className="bento-v2-resize-handle absolute -left-1.5 top-3 bottom-3 w-2 cursor-ew-resize pointer-events-auto"
                  />
                  <div
                    onPointerDown={(e) => handleResizePointerDown(e, cfg.id, "e")}
                    className="bento-v2-resize-handle absolute -right-1.5 top-3 bottom-3 w-2 cursor-ew-resize pointer-events-auto"
                  />

                  <div
                    onPointerDown={(e) => handleResizePointerDown(e, cfg.id, "nw")}
                    className="bento-v2-resize-handle absolute -top-1.5 -left-1.5 w-3 h-3 cursor-nwse-resize pointer-events-auto"
                  />
                  <div
                    onPointerDown={(e) => handleResizePointerDown(e, cfg.id, "ne")}
                    className="bento-v2-resize-handle absolute -top-1.5 -right-1.5 w-3 h-3 cursor-nesw-resize pointer-events-auto"
                  />
                  <div
                    onPointerDown={(e) => handleResizePointerDown(e, cfg.id, "sw")}
                    className="bento-v2-resize-handle absolute -bottom-1.5 -left-1.5 w-3 h-3 cursor-nesw-resize pointer-events-auto"
                  />
                  <div
                    onPointerDown={(e) => handleResizePointerDown(e, cfg.id, "se")}
                    className="bento-v2-resize-handle absolute bottom-0 right-0 w-7 h-7 cursor-nwse-resize pointer-events-auto flex items-end justify-end p-1.5"
                  >
                    <span
                      className={cn(
                        "bento-v2-resize-corner-indicator transition-opacity duration-fast",
                        isDarkCard
                          ? "text-onicord-text/55 group-hover:text-onicord-text/90"
                          : "text-onicord-dark/80 group-hover:text-onicord-dark",
                        isCustomizing
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
                      )}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <WidgetGalleryDrawer
        isOpen={showGallery}
        configs={configs}
        activeIds={activeIdsSet}
        onToggleWidget={handleToggleWidget}
        onClose={() => setShowGallery(false)}
      />
    </div>
  );
}
