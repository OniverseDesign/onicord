import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import Tooltip from "../../ui/Tooltip";
import ColorPickerPopout, { isLightHex } from "../../ui/ColorPickerPopout";
import { triggerServerFlameInteraction } from "../../../lib/flameService";
import { cn } from "../../../lib/cn";
import { useWidgetLayout } from "../WidgetLayoutContext";
import WidgetShell from "../primitives/WidgetShell";

const DEFAULT_BRUSH_COLOR = "#33CCFF";

export default function SketchpadWidgetV2({ connectedServer, profile }) {
  const { t } = useTranslation();
  const { sizeMode } = useWidgetLayout();

  const canvasRef = useRef(null);
  const hostRef = useRef(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef(null);
  const spacePressed = useRef(false);
  const panStart = useRef({ x: 0, y: 0 });

  const [currentColor, setCurrentColor] = useState(DEFAULT_BRUSH_COLOR);
  const [brushWidth, setBrushWidth] = useState(4);
  const [activeTool, setActiveTool] = useState("brush");
  const [remoteCursors, setRemoteCursors] = useState({});
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const [undoneStrokes, setUndoneStrokes] = useState([]);
  const [toolsExpanded, setToolsExpanded] = useState(false);

  // Live refs so pointer/wheel/draw handlers never read stale closures
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const strokesRef = useRef(strokes);
  const activeToolRef = useRef(activeTool);
  const brushWidthRef = useRef(brushWidth);
  const currentColorRef = useRef(currentColor);
  const isHoveringRef = useRef(false);
  const isPanningRef = useRef(false);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const canvasSizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  panRef.current = pan;
  zoomRef.current = zoom;
  strokesRef.current = strokes;
  activeToolRef.current = activeTool;
  brushWidthRef.current = brushWidth;
  currentColorRef.current = currentColor;

  const serverId = connectedServer?.roomCode || connectedServer?.id || "solo";
  const serverName = connectedServer?.name || t("widgets.sketchpad.solo", "SOLO");
  const lastLoadedServerId = useRef(serverId);

  useEffect(() => {
    const key = `onicord_sketchpad_strokes_${serverId}`;
    let initial = [];
    try {
      const saved = localStorage.getItem(key);
      const parsed = saved ? JSON.parse(saved) : [];
      initial = Array.isArray(parsed) ? parsed : [];
    } catch {
      initial = [];
    }
    strokesRef.current = initial;
    panRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;
    setStrokes(initial);
    setUndoneStrokes([]);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    lastLoadedServerId.current = serverId;
  }, [serverId]);

  const updateAndSaveStrokes = (updater) => {
    setStrokes((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      strokesRef.current = next;
      if (serverId === lastLoadedServerId.current) {
        try {
          localStorage.setItem(`onicord_sketchpad_strokes_${serverId}`, JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  };

  const drawStroke = (ctx, stroke) => {
    if (!stroke?.points || stroke.points.length === 0) return;
    ctx.save();
    if (stroke.isEraser) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "#000000";
      ctx.fillStyle = "#000000";
    } else {
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
    }
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    if (stroke.points.length === 1) {
      ctx.arc(stroke.points[0].x, stroke.points[0].y, stroke.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (stroke.points.length === 2) {
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      ctx.lineTo(stroke.points[1].x, stroke.points[1].y);
      ctx.stroke();
    } else {
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      let i;
      for (i = 1; i < stroke.points.length - 1; i++) {
        const xc = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
        const yc = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
        ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, xc, yc);
      }
      ctx.quadraticCurveTo(
        stroke.points[i].x,
        stroke.points[i].y,
        stroke.points[i].x,
        stroke.points[i].y
      );
      ctx.stroke();
    }
    ctx.restore();
  };

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { w, h, dpr } = canvasSizeRef.current;
    if (!w || !h) return;

    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(panRef.current.x, panRef.current.y);
    ctx.scale(zoomRef.current, zoomRef.current);
    strokesRef.current.forEach((s) => drawStroke(ctx, s));
    if (currentStroke.current) drawStroke(ctx, currentStroke.current);
    ctx.restore();

    if (
      isHoveringRef.current &&
      !isPanningRef.current &&
      !spacePressed.current &&
      activeToolRef.current !== "pan"
    ) {
      const inkColor = hostRef.current ? getComputedStyle(hostRef.current).color : "#cdd6f4";
      ctx.save();
      ctx.beginPath();
      ctx.arc(
        mousePosRef.current.x,
        mousePosRef.current.y,
        (brushWidthRef.current * zoomRef.current) / 2,
        0,
        Math.PI * 2
      );
      ctx.strokeStyle = activeToolRef.current === "eraser" ? "#ff758f" : inkColor;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.25;
      ctx.stroke();
      ctx.restore();
    }
  };

  const redrawRef = useRef(redrawCanvas);
  redrawRef.current = redrawCanvas;

  // Spacebar panning support when hovering or focused on sketchpad
  useEffect(() => {
    const onDown = (e) => {
      if (e.code !== "Space") return;
      const activeEl = document.activeElement;
      if (activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA") return;
      if (isHoveringRef.current || activeEl === hostRef.current) {
        e.preventDefault();
        if (!spacePressed.current) {
          spacePressed.current = true;
          setIsSpaceDown(true);
          redrawRef.current();
        }
      }
    };
    const resetSpace = () => {
      if (spacePressed.current) {
        spacePressed.current = false;
        setIsSpaceDown(false);
        redrawRef.current();
      }
    };
    const onUp = (e) => {
      if (e.code === "Space") resetSpace();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", resetSpace);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", resetSpace);
    };
  }, []);

  // Expire stale remote cursors
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setRemoteCursors((prev) => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach((uid) => {
          if (now - next[uid].time > 3000) {
            delete next[uid];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Re-render canvas when React state changes
  useEffect(() => {
    redrawCanvas();
  }, [strokes, zoom, pan, canvasSize, activeTool, brushWidth, currentColor, isPanning, isSpaceDown]);

  // P2P sketchpad sync listener
  useEffect(() => {
    if (!window.electronAPI?.onSketchDraw) return;
    const unsub = window.electronAPI.onSketchDraw((data) => {
      if (data.serverId !== serverId) return;
      const myId = profile?.id || "self";
      if (data.userId === myId) return;

      if (data.type === "cursor") {
        setRemoteCursors((prev) => ({
          ...prev,
          [data.userId]: {
            nickname: data.nickname || "User",
            x: data.x,
            y: data.y,
            color: data.color || DEFAULT_BRUSH_COLOR,
            time: Date.now(),
          },
        }));
      } else if (data.type === "draw") {
        setStrokes((prev) => {
          const updated = [...prev];
          let stroke = updated.findLast((s) => s.userId === data.userId && !s.isComplete);
          if (!stroke) {
            stroke = {
              points: [{ x: data.x0, y: data.y0 }],
              color: data.color,
              width: data.width,
              userId: data.userId,
              nickname: data.nickname,
              isEraser: data.isEraser,
            };
            updated.push(stroke);
          }
          stroke.points.push({ x: data.x1, y: data.y1 });
          strokesRef.current = updated;
          return updated;
        });
      } else if (data.type === "stroke-end") {
        updateAndSaveStrokes((prev) => {
          const updated = [...prev];
          const stroke = updated.findLast((s) => s.userId === data.userId && !s.isComplete);
          if (stroke) stroke.isComplete = true;
          return updated;
        });
      } else if (data.type === "clear") {
        updateAndSaveStrokes([]);
        setUndoneStrokes([]);
      }
    });
    return () => unsub?.();
  }, [serverId, profile]);

  // Measure host container & size canvas backing store with DPR
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (rect.width <= 0 || rect.height <= 0) return;

      const dpr = window.devicePixelRatio || 1;
      const prevW = canvasSizeRef.current.w;
      const prevH = canvasSizeRef.current.h;

      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      canvasSizeRef.current = { w, h, dpr };
      setCanvasSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));

      if (prevW > 0 && prevH > 0) {
        const dx = (w - prevW) / 2;
        const dy = (h - prevH) / 2;
        if (dx !== 0 || dy !== 0) {
          setPan((prev) => {
            const next = { x: prev.x + dx, y: prev.y + dy };
            panRef.current = next;
            return next;
          });
        }
      }

      redrawRef.current();
    };

    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(host);
    return () => obs.disconnect();
  }, []);

  const getPos = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e) => {
    e.stopPropagation();
    e.preventDefault();
    hostRef.current?.focus({ preventScroll: true });
    e.currentTarget.setPointerCapture?.(e.pointerId);

    const pos = getPos(e);
    mousePosRef.current = pos;

    if (
      e.button === 2 ||
      e.button === 1 ||
      spacePressed.current ||
      activeToolRef.current === "pan"
    ) {
      isPanningRef.current = true;
      setIsPanning(true);
      panStart.current = { x: pos.x - panRef.current.x, y: pos.y - panRef.current.y };
      return;
    }

    if (e.button === 0) {
      const wX = (pos.x - panRef.current.x) / zoomRef.current;
      const wY = (pos.y - panRef.current.y) / zoomRef.current;
      isDrawing.current = true;
      currentStroke.current = {
        points: [{ x: wX, y: wY }],
        color: currentColorRef.current,
        width: brushWidthRef.current,
        userId: profile?.id || "self",
        nickname: profile?.nickname || "Me",
        isEraser: activeToolRef.current === "eraser",
      };
      redrawCanvas();
    }
  };

  const handlePointerMove = (e) => {
    const pos = getPos(e);
    mousePosRef.current = pos;

    const wX = (pos.x - panRef.current.x) / zoomRef.current;
    const wY = (pos.y - panRef.current.y) / zoomRef.current;

    if (connectedServer && window.electronAPI?.sendSketchDraw) {
      window.electronAPI.sendSketchDraw({
        type: "cursor",
        x: wX,
        y: wY,
        userId: profile?.id || "self",
        nickname: profile?.nickname || "Me",
        color: currentColorRef.current,
        serverId,
      });
    }

    if (isPanningRef.current) {
      const nextPan = {
        x: pos.x - panStart.current.x,
        y: pos.y - panStart.current.y,
      };
      panRef.current = nextPan;
      setPan(nextPan);
      redrawCanvas();
      return;
    }

    if (isDrawing.current && currentStroke.current) {
      const last = currentStroke.current.points[currentStroke.current.points.length - 1];
      currentStroke.current.points.push({ x: wX, y: wY });
      if (connectedServer && window.electronAPI?.sendSketchDraw) {
        window.electronAPI.sendSketchDraw({
          type: "draw",
          x0: last.x,
          y0: last.y,
          x1: wX,
          y1: wY,
          color: currentStroke.current.color,
          width: currentStroke.current.width,
          userId: profile?.id || "self",
          nickname: profile?.nickname || "Me",
          serverId,
          isEraser: currentStroke.current.isEraser,
        });
      }
      redrawCanvas();
      return;
    }

    redrawCanvas();
  };

  const handlePointerUp = (e) => {
    e?.currentTarget?.releasePointerCapture?.(e.pointerId);

    if (isPanningRef.current) {
      isPanningRef.current = false;
      setIsPanning(false);
      redrawCanvas();
      return;
    }

    if (isDrawing.current && currentStroke.current) {
      isDrawing.current = false;
      const finished = currentStroke.current;
      currentStroke.current = null;
      updateAndSaveStrokes((prev) => [...prev, finished]);
      setUndoneStrokes([]);

      if (connectedServer && window.electronAPI?.sendSketchDraw) {
        window.electronAPI.sendSketchDraw({
          type: "stroke-end",
          userId: profile?.id || "self",
          serverId,
        });
      }
      if (connectedServer && serverId !== "solo") {
        triggerServerFlameInteraction(profile, connectedServer);
      }
      redrawCanvas();
    }
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    const currZoom = zoomRef.current;
    const currPan = panRef.current;
    const wX = (pos.x - currPan.x) / currZoom;
    const wY = (pos.y - currPan.y) / currZoom;
    const factor = 1.15;
    const nextZoom = e.deltaY < 0 ? Math.min(currZoom * factor, 8) : Math.max(currZoom / factor, 0.2);
    const nextPan = { x: pos.x - wX * nextZoom, y: pos.y - wY * nextZoom };

    zoomRef.current = nextZoom;
    panRef.current = nextPan;
    setZoom(nextZoom);
    setPan(nextPan);
  };

  const handleWheelRef = useRef(null);
  handleWheelRef.current = handleWheel;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onNativeWheel = (e) => handleWheelRef.current?.(e);
    canvas.addEventListener("wheel", onNativeWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onNativeWheel);
  }, []);

  const handleUndo = () => {
    updateAndSaveStrokes((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      const popped = copy.pop();
      setUndoneStrokes((u) => [...u, popped]);
      return copy;
    });
  };

  const handleRedo = () => {
    if (undoneStrokes.length === 0) return;
    const copy = [...undoneStrokes];
    const popped = copy.pop();
    setUndoneStrokes(copy);
    updateAndSaveStrokes((prev) => [...prev, popped]);
  };

  const handleClear = () => {
    updateAndSaveStrokes([]);
    setUndoneStrokes([]);
    if (connectedServer && window.electronAPI?.sendSketchDraw) {
      window.electronAPI.sendSketchDraw({ type: "clear", serverId });
    }
  };

  const handleKeyDown = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
    } else if (e.key.toLowerCase() === "y") {
      e.preventDefault();
      handleRedo();
    }
  };

  const isCompactMode = sizeMode === "micro" || sizeMode === "compact";
  const showFloatingDock = !isCompactMode || toolsExpanded;
  const gridSpacing = Math.max(8, 22 * zoom);
  const canvasCursor = isPanning
    ? "grabbing"
    : isSpaceDown || activeTool === "pan"
      ? "grab"
      : "none";

  return (
    <WidgetShell
      title={t("widgets.sketchpad.title", "Pizarra")}
      headerRight={
        <>
          <Tooltip content={serverName} side="bottom">
            <span className="bento-v2-pill font-mono max-w-[110px] truncate">
              <span className="truncate">{serverName}</span>
            </span>
          </Tooltip>
          {isCompactMode && (
            <Tooltip content={t("widgets.sketchpad.tools", "Tools")} side="bottom">
              <button
                type="button"
                onClick={() => setToolsExpanded((v) => !v)}
                className="bento-v2-pill-icon cursor-pointer active:scale-90"
              >
                <MaterialIcon name={toolsExpanded ? "close" : "brush"} size={14} />
              </button>
            </Tooltip>
          )}
        </>
      }
    >
      <div
        ref={hostRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        data-no-drag="true"
        className="relative flex-1 w-full min-h-0 rounded-onicord-inner bg-onicord-mantle border bento-v2-ink-divider overflow-hidden focus:outline-none"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgb(var(--onicord-tint-rgb) / 0.14) 1px, transparent 1px)",
          backgroundSize: `${gridSpacing}px ${gridSpacing}px`,
          backgroundPosition: `${pan.x % gridSpacing}px ${pan.y % gridSpacing}px`,
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onContextMenu={(e) => e.preventDefault()}
          onPointerEnter={(e) => {
            isHoveringRef.current = true;
            mousePosRef.current = getPos(e);
            redrawCanvas();
          }}
          onPointerLeave={() => {
            isHoveringRef.current = false;
            redrawCanvas();
          }}
          className="absolute inset-0 w-full h-full touch-none block"
          style={{ cursor: canvasCursor }}
        />

        {/* Remote Cursors */}
        {Object.keys(remoteCursors).map((uid) => {
          const c = remoteCursors[uid];
          const x = c.x * zoom + pan.x;
          const y = c.y * zoom + pan.y;
          if (x < 0 || y < 0 || x > canvasSize.w || y > canvasSize.h) return null;
          return (
            <div
              key={uid}
              style={{ left: x, top: y }}
              className="absolute pointer-events-none z-20 flex flex-col items-start"
            >
              <span
                style={{ backgroundColor: c.color }}
                className="w-2.5 h-2.5 rounded-full border border-onicord-mantle"
              />
              <span
                style={{ backgroundColor: c.color }}
                className="px-1.5 py-0.5 rounded-onicord-chip text-2xs font-black text-onicord-dark mt-0.5 truncate max-w-[70px]"
              >
                {c.nickname}
              </span>
            </div>
          );
        })}

        {/* Floating Zoom Pill */}
        {!isCompactMode && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute top-2.5 left-2.5 z-20 bento-v2-pill-group gap-1 px-1.5 backdrop-blur-onicord-popover"
          >
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(z / 1.15, 0.2))}
              className="w-6 h-full flex items-center justify-center rounded-full hover:opacity-80 cursor-pointer"
            >
              <MaterialIcon name="remove" size={13} />
            </button>
            <span className="px-1.5 text-2xs font-mono font-bold">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(z * 1.15, 8))}
              className="w-6 h-full flex items-center justify-center rounded-full hover:opacity-80 cursor-pointer"
            >
              <MaterialIcon name="add" size={13} />
            </button>
            <Tooltip content={t("widgets.sketchpad.resetView", "Reset")} side="bottom">
              <button
                type="button"
                onClick={() => {
                  zoomRef.current = 1;
                  panRef.current = { x: 0, y: 0 };
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="w-6 h-full flex items-center justify-center rounded-full hover:opacity-80 cursor-pointer"
              >
                <MaterialIcon name="center_focus_strong" size={13} />
              </button>
            </Tooltip>
          </div>
        )}

        {/* Always-accessible Floating Tools Dock */}
        {showFloatingDock && (
          <div className="absolute bottom-2.5 left-2.5 right-2.5 z-20 flex flex-wrap items-center justify-center gap-2 pointer-events-none">
            <div
              onPointerDown={(e) => e.stopPropagation()}
              className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 px-3 py-2 rounded-onicord-inner bg-onicord-surface/95 border border-onicord-border-strong backdrop-blur-onicord-popover shadow-md"
            >
              {/* Tool switcher: Brush / Eraser / Pan */}
              <div className="bento-v2-pill-group gap-1 px-1">
                <Tooltip content={t("widgets.sketchpad.brushTool", "Pincel")} side="top">
                  <button
                    type="button"
                    onClick={() => setActiveTool("brush")}
                    style={
                      activeTool === "brush"
                        ? { backgroundColor: "var(--widget-pill-fg)", color: "var(--widget-pill-bg)" }
                        : undefined
                    }
                    className="w-7 h-full rounded-full flex items-center justify-center cursor-pointer"
                  >
                    <MaterialIcon name="brush" size={14} />
                  </button>
                </Tooltip>
                <Tooltip content={t("widgets.sketchpad.eraserTool", "Goma")} side="top">
                  <button
                    type="button"
                    onClick={() => setActiveTool("eraser")}
                    style={
                      activeTool === "eraser"
                        ? { backgroundColor: "var(--widget-pill-fg)", color: "var(--widget-pill-bg)" }
                        : undefined
                    }
                    className="w-7 h-full rounded-full flex items-center justify-center cursor-pointer"
                  >
                    <MaterialIcon name="ink_eraser" size={14} />
                  </button>
                </Tooltip>
                <Tooltip content={t("widgets.sketchpad.panTool", "Pan canvas")} side="top">
                  <button
                    type="button"
                    onClick={() => setActiveTool("pan")}
                    style={
                      activeTool === "pan"
                        ? { backgroundColor: "var(--widget-pill-fg)", color: "var(--widget-pill-bg)" }
                        : undefined
                    }
                    className="w-7 h-full rounded-full flex items-center justify-center cursor-pointer"
                  >
                    <MaterialIcon name="pan_tool" size={14} />
                  </button>
                </Tooltip>
              </div>

              <span className="w-px h-5 bg-onicord-border shrink-0" aria-hidden="true" />

              {/* Native App Color Picker & Brush Size */}
              <div className="flex items-center gap-2.5">
                <ColorPickerPopout
                  value={currentColor}
                  onChange={(hex) => {
                    setCurrentColor(hex);
                    if (activeTool !== "brush") setActiveTool("brush");
                  }}
                  side="top"
                  align="center"
                  stopDragPropagation
                >
                  <Tooltip content={t("widgets.sketchpad.colorPicker", "Color")} side="top">
                    <button
                      type="button"
                      style={{ backgroundColor: currentColor }}
                      aria-label={t("widgets.sketchpad.colorPicker", "Color")}
                      className="w-7 h-7 rounded-full border-2 border-onicord-border-strong shadow-sm flex items-center justify-center cursor-pointer transition-transform duration-fast hover:scale-105 active:scale-95"
                    >
                      <MaterialIcon
                        name="palette"
                        size={14}
                        className={
                          isLightHex(currentColor) ? "text-onicord-dark" : "text-onicord-on-scrim"
                        }
                      />
                    </button>
                  </Tooltip>
                </ColorPickerPopout>

                <input
                  type="range"
                  min="1"
                  max="20"
                  value={brushWidth}
                  onChange={(e) => setBrushWidth(Number(e.target.value))}
                  className="w-16 h-1 rounded-full bg-onicord-tint/20 accent-onicord-accent cursor-pointer"
                />
                <span className="text-2xs font-mono font-bold text-onicord-muted w-5 text-right">
                  {brushWidth}
                </span>
              </div>

              <span className="w-px h-5 bg-onicord-border shrink-0" aria-hidden="true" />

              {/* History & Clear Actions */}
              <div className="flex items-center gap-1.5">
                <Tooltip content={t("widgets.sketchpad.undo", "Undo (Ctrl+Z)")} side="top">
                  <span className="inline-flex">
                    <button
                      type="button"
                      onClick={handleUndo}
                      disabled={strokes.length === 0}
                      className="bento-v2-pill-icon disabled:opacity-30 cursor-pointer"
                    >
                      <MaterialIcon name="undo" size={14} />
                    </button>
                  </span>
                </Tooltip>
                <Tooltip content={t("widgets.sketchpad.redo", "Redo (Ctrl+Shift+Z)")} side="top">
                  <span className="inline-flex">
                    <button
                      type="button"
                      onClick={handleRedo}
                      disabled={undoneStrokes.length === 0}
                      className="bento-v2-pill-icon disabled:opacity-30 cursor-pointer"
                    >
                      <MaterialIcon name="redo" size={14} />
                    </button>
                  </span>
                </Tooltip>
                <Tooltip content={t("common.clear", "Clear")} side="top">
                  <button
                    type="button"
                    onClick={handleClear}
                    className="bento-v2-pill-icon hover:bg-onicord-danger hover:text-onicord-on-danger cursor-pointer"
                  >
                    <MaterialIcon name="delete_sweep" size={14} />
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
        )}
      </div>
    </WidgetShell>
  );
}
