import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";

const COLORS = [
  // Vibrant classic sticky note colors
  "#FFFFFF", // White (General notes)
  "#FF3366", // Neon pink/red (Alerts / high priority)
  "#FF9933", // Orange (In-progress tasks / warnings)
  "#FFFF00", // Yellow (Classic sticky note)
  "#33FF57", // Lime green (Approved / completed tasks)
  "#33CCFF", // Sky blue (Brainstorming / info)
  "#CC66FF", // Purple / violet (Category grouping)

  // Soft pastel variants
  "#FFB8B1", // Pastel coral
  "#FFE5A3", // Soft cream
  "#B3F5BC", // Pastel mint green
  "#BCE6FF", // Pastel blue
  "#E8AEFF", // Pastel lavender
];

export default function SketchpadWidget({ connectedServer, profile }) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const isDrawing = useRef(false);
  const currentStroke = useRef(null);
  const spacePressed = useRef(false);

  const [currentColor, setCurrentColor] = useState(COLORS[5]); // Default to soft peach/salmon
  const [brushWidth, setBrushWidth] = useState(4);
  const [activeTool, setActiveTool] = useState("brush"); // "brush" | "eraser"
  const [remoteCursors, setRemoteCursors] = useState({});
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  // Cursor hover state for custom circle cursor drawing
  const [isHovering, setIsHovering] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Viewport camera states
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  // Vector strokes history list
  const [strokes, setStrokes] = useState([]);
  const [undoneStrokes, setUndoneStrokes] = useState([]);

  // Server binding
  const serverId = connectedServer?.roomCode || connectedServer?.id || "solo";
  const serverName =
    connectedServer?.name || t("widgets.sketchpad.solo", "SOLO / OFFLINE");

  const lastLoadedServerId = useRef(serverId);

  // Load strokes on server change
  useEffect(() => {
    const key = `onicord_sketchpad_strokes_${serverId}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        setStrokes(JSON.parse(saved));
      } catch (e) {
        setStrokes([]);
      }
    } else {
      setStrokes([]);
    }
    setUndoneStrokes([]);
    // Reset view camera
    setZoom(1);
    setPan({ x: 0, y: 0 });

    // Mark as finished loading
    lastLoadedServerId.current = serverId;
  }, [serverId]);

  const updateAndSaveStrokes = (updater) => {
    setStrokes((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (serverId === lastLoadedServerId.current) {
        const key = `onicord_sketchpad_strokes_${serverId}`;
        localStorage.setItem(key, JSON.stringify(next));
      }
      return next;
    });
  };

  // Keyboard Spacebar listener for Panning
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (e.code === "Space") {
        if (document.activeElement === containerRef.current) {
          e.preventDefault();
          spacePressed.current = true;
          if (canvasRef.current) {
            canvasRef.current.style.cursor = "grab";
          }
        }
      }
    };
    const handleGlobalKeyUp = (e) => {
      if (e.code === "Space") {
        spacePressed.current = false;
        if (canvasRef.current) {
          canvasRef.current.style.cursor = "none";
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("keyup", handleGlobalKeyUp);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("keyup", handleGlobalKeyUp);
    };
  }, []);

  // Cleanup old cursors
  useEffect(() => {
    const interval = setInterval(() => {
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
    return () => clearInterval(interval);
  }, []);

  // Redraw hook when strokes, zoom, pan, activeTool, or mousePos changes
  useEffect(() => {
    redrawCanvas();
  }, [
    strokes,
    zoom,
    pan,
    canvasSize,
    isHovering,
    mousePos,
    activeTool,
    brushWidth,
    currentColor,
  ]);

  // Listen to remote drawing and cursor updates
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsub = window.electronAPI.onSketchDraw((data) => {
      if (data.serverId !== serverId) return;

      const myId = profile?.id || "self";
      if (data.userId === myId) return; // Ignore events sent by ourselves

      if (data.type === "cursor") {
        setRemoteCursors((prev) => ({
          ...prev,
          [data.userId]: {
            nickname: data.nickname || "User",
            x: data.x,
            y: data.y,
            color: data.color || "#00F0FF",
            time: Date.now(),
          },
        }));
      } else if (data.type === "draw") {
        setStrokes((prev) => {
          const updated = [...prev];
          let stroke = updated.findLast(
            (s) => s.userId === data.userId && !s.isComplete,
          );
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
          return updated;
        });
      } else if (data.type === "stroke-end") {
        updateAndSaveStrokes((prev) => {
          const updated = [...prev];
          const stroke = updated.findLast(
            (s) => s.userId === data.userId && !s.isComplete,
          );
          if (stroke) {
            stroke.isComplete = true;
          }
          return updated;
        });
      } else if (data.type === "clear") {
        updateAndSaveStrokes([]);
        setUndoneStrokes([]);
      }
    });

    return () => unsub();
  }, [serverId, profile]);

  // Redraw canvas vector contents
  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Apply camera pan & zoom translation
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Render strokes
    strokes.forEach((stroke) => {
      drawStroke(ctx, stroke);
    });

    // Render current local active stroke
    if (currentStroke.current) {
      drawStroke(ctx, currentStroke.current);
    }

    ctx.restore();

    // Render local user's custom brush size circle cursor (in screen coordinates)
    if (isHovering && !isPanning && !spacePressed.current) {
      ctx.beginPath();
      ctx.arc(mousePos.x, mousePos.y, (brushWidth * zoom) / 2, 0, 2 * Math.PI);
      ctx.strokeStyle =
        activeTool === "eraser"
          ? "rgba(255, 117, 143, 0.85)"
          : "rgba(255, 255, 255, 0.7)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  };

  const drawStroke = (ctx, stroke) => {
    if (!stroke.points || stroke.points.length === 0) return;
    ctx.save();
    if (stroke.isEraser) {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.strokeStyle = stroke.color;
    }
    ctx.lineWidth = stroke.width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    if (stroke.points.length === 1) {
      ctx.arc(
        stroke.points[0].x,
        stroke.points[0].y,
        stroke.width / 2,
        0,
        2 * Math.PI,
      );
      ctx.fillStyle = stroke.isEraser ? "rgba(0,0,0,1)" : stroke.color;
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
        stroke.points[i].y,
      );
      ctx.stroke();
    }
    ctx.restore();
  };

  // Adjust resolution on resize (maintaining vector clarity)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const oldWidth = canvas.width;
      const oldHeight = canvas.height;

      canvas.width = rect.width;
      canvas.height = rect.height;
      setCanvasSize({ w: rect.width, h: rect.height });

      if (oldWidth > 0 && oldHeight > 0) {
        const dx = (rect.width - oldWidth) / 2;
        const dy = (rect.height - oldHeight) / 2;
        if (dx !== 0 || dy !== 0) {
          setPan((prev) => ({
            x: prev.x + dx,
            y: prev.y + dy,
          }));
        }
      }
    };

    resizeCanvas();
    const observer = new ResizeObserver(resizeCanvas);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  // Mouse camera calculations
  const getCanvasMousePos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e) => {
    const pos = getCanvasMousePos(e);

    // Right-click (button 2) or Spacebar triggers Panning
    if (e.button === 2 || spacePressed.current) {
      setIsPanning(true);
      panStart.current = { x: pos.x - pan.x, y: pos.y - pan.y };
      if (canvasRef.current) {
        canvasRef.current.style.cursor = "grabbing";
      }
      return;
    }

    // Left-click (button 0) draws
    if (e.button === 0) {
      isDrawing.current = true;
      const wX = (pos.x - pan.x) / zoom;
      const wY = (pos.y - pan.y) / zoom;

      currentStroke.current = {
        points: [{ x: wX, y: wY }],
        color: currentColor,
        width: brushWidth,
        userId: profile?.id || "self",
        nickname: profile?.nickname || "Me",
        isEraser: activeTool === "eraser",
      };
      redrawCanvas();
    }
  };

  const handlePointerMove = (e) => {
    const pos = getCanvasMousePos(e);
    const wX = (pos.x - pan.x) / zoom;
    const wY = (pos.y - pan.y) / zoom;

    // Track coordinates locally for circle cursor
    setMousePos(pos);

    // Broadcast cursor positions for Figma-style pointer tracking
    if (connectedServer && window.electronAPI?.sendSketchDraw) {
      window.electronAPI.sendSketchDraw({
        type: "cursor",
        x: wX,
        y: wY,
        userId: profile?.id || "self",
        nickname: profile?.nickname || "Me",
        color: currentColor,
        serverId,
      });
    }

    if (isPanning) {
      setPan({
        x: pos.x - panStart.current.x,
        y: pos.y - panStart.current.y,
      });
      return;
    }

    if (isDrawing.current && currentStroke.current) {
      const lastPt =
        currentStroke.current.points[currentStroke.current.points.length - 1];
      currentStroke.current.points.push({ x: wX, y: wY });

      if (connectedServer && window.electronAPI?.sendSketchDraw) {
        window.electronAPI.sendSketchDraw({
          type: "draw",
          x0: lastPt.x,
          y0: lastPt.y,
          x1: wX,
          y1: wY,
          color: currentColor,
          width: brushWidth,
          userId: profile?.id || "self",
          nickname: profile?.nickname || "Me",
          serverId,
          isEraser: currentStroke.current.isEraser,
        });
      }
      redrawCanvas();
    }
  };

  const handlePointerUp = () => {
    if (isPanning) {
      setIsPanning(false);
      if (canvasRef.current) {
        canvasRef.current.style.cursor = spacePressed.current ? "grab" : "none";
      }
      return;
    }

    if (isDrawing.current && currentStroke.current) {
      isDrawing.current = false;
      const finishedStroke = currentStroke.current;
      updateAndSaveStrokes((prev) => [...prev, finishedStroke]);
      setUndoneStrokes([]); // clear redo stack

      if (connectedServer && window.electronAPI?.sendSketchDraw) {
        window.electronAPI.sendSketchDraw({
          type: "stroke-end",
          userId: profile?.id || "self",
          serverId,
        });
      }

      currentStroke.current = null;
      redrawCanvas();
    }
  };

  // Zoom on mouse wheel position
  const handleWheel = (e) => {
    e.preventDefault();
    const pos = getCanvasMousePos(e);

    const worldX = (pos.x - pan.x) / zoom;
    const worldY = (pos.y - pan.y) / zoom;

    const zoomFactor = 1.15;
    const newZoom =
      e.deltaY < 0
        ? Math.min(zoom * zoomFactor, 8)
        : Math.max(zoom / zoomFactor, 0.2);

    const newPanX = pos.x - worldX * newZoom;
    const newPanY = pos.y - worldY * newZoom;

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const handleZoomOut = () => {
    setZoom((z) => Math.max(z / 1.15, 0.2));
  };

  const handleZoomIn = () => {
    setZoom((z) => Math.min(z * 1.15, 8));
  };

  const handleUndo = () => {
    updateAndSaveStrokes((prev) => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const popped = updated.pop();
      setUndoneStrokes((u) => [...u, popped]);
      return updated;
    });
  };

  const handleRedo = () => {
    if (undoneStrokes.length > 0) {
      const updatedRedo = [...undoneStrokes];
      const popped = updatedRedo.pop();
      setUndoneStrokes(updatedRedo);
      updateAndSaveStrokes((prev) => [...prev, popped]);
    }
  };

  const handleClear = () => {
    updateAndSaveStrokes([]);
    setUndoneStrokes([]);
    if (connectedServer && window.electronAPI?.sendSketchDraw) {
      window.electronAPI.sendSketchDraw({
        type: "clear",
        serverId,
      });
    }
  };

  const handleResetCamera = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleKeyDown = (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (e.key === "y" || e.key === "Y") {
        e.preventDefault();
        handleRedo();
      }
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ containerType: "inline-size" }}
      className="onicord-widget-shell w-full h-full p-4 flex flex-col justify-between select-none relative focus:outline-none focus-within:border-white/10 group"
    >
      {/* Widget Header */}
      <div className="onicord-widget-header p-2 flex justify-between items-center w-full gap-2 shrink-0 z-10 mb-2">
        <h3
          style={{ fontSize: "clamp(0.6rem, 3.5cqi, 0.8rem)" }}
          className="onicord-widget-title font-bold text-onicord-text truncate"
        >
          {t("widgets.sketchpad.title", "PIZARRA DE DIBUJO")}
        </h3>

        {/* Active server bound badge*/}
        <div className="flex items-center shrink-0">
          <span
            style={{ fontSize: "clamp(0.55rem, 3cqi, 0.62rem)" }}
            className="onicord-widget-badge-dynamic shrink-0 px-2 py-0.5 font-medium"
            title={serverName}
          >
            {serverName}
          </span>
        </div>
      </div>

      {/* Drawing board canvas container */}
      <div
        className="flex-1 w-full relative min-h-[90px] rounded-2xl bg-onicord-mantle border border-onicord-island overflow-hidden shadow-inner"
        onPointerDown={(e) => e.stopPropagation()} // Stop dragging card
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()} // prevent context menu on right click pan
          onPointerEnter={() => setIsHovering(true)}
          onPointerLeave={() => {
            setIsHovering(false);
            if (isDrawing.current) handlePointerUp();
          }}
          className="absolute inset-0 touch-none"
          style={{
            width: canvasSize.w ? `${canvasSize.w}px` : "100%",
            height: canvasSize.h ? `${canvasSize.h}px` : "100%",
            cursor: spacePressed.current ? "grab" : "none",
          }}
        />

        {/* Figma-style Remote Cursors */}
        {Object.keys(remoteCursors).map((uid) => {
          const c = remoteCursors[uid];
          // Map world coordinates back to screen space using camera transform
          const x = c.x * zoom + pan.x;
          const y = c.y * zoom + pan.y;

          // Only display if cursor is within viewport bounds
          if (canvasRef.current) {
            const w = canvasRef.current.width;
            const h = canvasRef.current.height;
            if (x < 0 || x > w || y < 0 || y > h) return null;
          }

          return (
            <div
              key={uid}
              style={{ left: x, top: y }}
              className="absolute pointer-events-none transition-all duration-75 ease-out select-none z-30 flex flex-col items-start"
            >
              {/* Cursor pointer arrow */}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M1 1L5.5 13L8 8L13 5.5L1 1Z"
                  fill={c.color}
                  stroke="#000000"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              {/* Name badge */}
              <span
                style={{ backgroundColor: c.color }}
                className="px-1.5 py-0.5 rounded text-[8px] font-black text-black shadow-lg mt-1 truncate max-w-[70px]"
              >
                {c.nickname}
              </span>
            </div>
          );
        })}

        {/* Floating Zoom & Reiniciar controls */}
        <div className="absolute bottom-4 left-4 flex items-center gap-1.5 bg-onicord-surface/90 border border-onicord-island p-1.5 px-3 rounded-xl backdrop-blur-md z-20 pointer-events-auto shadow-xl select-none">
          <button
            type="button"
            onClick={handleZoomOut}
            className="w-4 h-4 flex items-center justify-center text-onicord-muted hover:text-onicord-text rounded transition-colors text-sm hover:bg-white/5 cursor-pointer"
          >
            <MaterialIcon name="remove" size={16} />
          </button>
          <span className="text-[12px] w-fit font-mono font-bold text-onicord-subtext w-10 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            className="w-4 h-4 flex items-center justify-center text-onicord-muted hover:text-onicord-text rounded transition-colors text-sm hover:bg-white/5 cursor-pointer"
          >
            <MaterialIcon name="add" size={16} />
          </button>
          <div className="w-[1px] h-3.5 bg-white/15" />
          <button
            type="button"
            onClick={handleResetCamera}
            className="text-[10px] font-bold text-onicord-muted hover:text-onicord-text transition-colors cursor-pointer tracking-wider items-center flex gap-1.5 rounded hover:bg-white/5"
          >
            <MaterialIcon name="settings_backup_restore" size={16} />
          </button>
        </div>
      </div>

      {/* Control Tools Footer Bar */}
      <div
        className="onicord-widget-footer-sep flex justify-center items-center z-10 shrink-0 gap-2 flex-wrap transition-all duration-300 ease-in-out opacity-0 max-h-0 overflow-hidden pointer-events-none mt-0 group-hover:opacity-100 group-hover:max-h-[100px] group-hover:pointer-events-auto group-hover:mt-2 group-hover:pt-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-between">
          {/* Leftmost Tool Selectors */}
          <div className="flex items-center bg-onicord-surface/80 border border-onicord-island rounded-xl p-1 shrink-0 shadow-inner h-[38px] gap-1">
            <button
              type="button"
              onClick={() => setActiveTool("brush")}
              className={`w-8 h-[30px] flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                activeTool === "brush"
                  ? "bg-onicord-accent text-onicord-text-dark shadow-sm"
                  : "text-onicord-muted hover:text-onicord-text hover:bg-white/5"
              }`}
              title={t("widgets.sketchpad.brushTool", "Pincel")}
            >
              <MaterialIcon name="brush" size={16} />
            </button>
            <button
              type="button"
              onClick={() => setActiveTool("eraser")}
              className={`w-8 h-[30px] flex items-center justify-center rounded-lg transition-all cursor-pointer ${
                activeTool === "eraser"
                  ? "bg-onicord-accent text-onicord-text-dark shadow-sm"
                  : "text-onicord-muted hover:text-onicord-text hover:bg-white/5"
              }`}
              title={t("widgets.sketchpad.eraserTool", "Goma de borrar")}
            >
              <MaterialIcon name="ink_eraser" size={16} />
            </button>
          </div>

          {/* 2-Row Color Palette */}
          <div className="flex flex-col gap-1.5 select-none shrink-0 py-0.5 justify-center">
            {/* Row 1 */}
            <div className="flex items-center gap-2">
              {COLORS.slice(0, 6).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCurrentColor(c);
                    setActiveTool("brush");
                  }}
                  className={`w-5 h-5 rounded-full border shrink-0 transition-all ${
                    currentColor === c && activeTool === "brush"
                      ? "border-white scale-110 shadow-lg shadow-white/10"
                      : "border-transparent hover:opacity-100 hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            {/* Row 2 */}
            <div className="flex items-center gap-2">
              {COLORS.slice(6, 12).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setCurrentColor(c);
                    setActiveTool("brush");
                  }}
                  className={`w-5 h-5 rounded-full border shrink-0 transition-all ${
                    currentColor === c && activeTool === "brush"
                      ? "border-white scale-110 shadow-lg shadow-white/10"
                      : "border-transparent hover:opacity-100 hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Slider & Actions Container */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-between">
          {/* Brush thickness container */}
          <div className="flex items-center bg-onicord-surface/80 border border-onicord-island rounded-xl px-3 py-1.5 gap-3 shrink-0 shadow-inner h-[38px]">
            <span className="text-[10px] font-mono font-bold text-onicord-muted text-right uppercase">
              {brushWidth}PX
            </span>
            <input
              type="range"
              min="1"
              max="20"
              value={brushWidth}
              onChange={(e) => setBrushWidth(Number(e.target.value))}
              className="w-16 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[rgb(var(--onicord-lavender))]"
            />
            {/* dynamic size circle preview */}
            <div className="w-5 h-5 rounded-full flex items-center justify-center bg-onicord-mantle border border-onicord-island shrink-0">
              <div
                className="rounded-full transition-all duration-100"
                style={{
                  backgroundColor:
                    activeTool === "eraser" ? "#ff758f" : currentColor,
                  width: `${Math.max(2, Math.min(16, brushWidth))}px`,
                  height: `${Math.max(2, Math.min(16, brushWidth))}px`,
                }}
              />
            </div>
          </div>

          {/* Undo/Redo actions group */}
          <div className="flex items-center bg-onicord-surface/80 border border-onicord-island rounded-xl p-1 shrink-0 shadow-inner h-[38px]">
            <button
              type="button"
              onClick={handleUndo}
              disabled={strokes.length === 0}
              className="w-8 h-[30px] flex items-center justify-center rounded-lg text-onicord-muted hover:text-onicord-text hover:bg-white/5 disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer"
              title={t("widgets.sketchpad.undo", "Deshacer (Ctrl+Z)")}
            >
              <MaterialIcon name="undo" size={16} />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={undoneStrokes.length === 0}
              className="w-8 h-[30px] flex items-center justify-center rounded-lg text-onicord-muted hover:text-onicord-text hover:bg-white/5 disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer"
              title={t("widgets.sketchpad.redo", "Rehacer (Ctrl+Shift+Z)")}
            >
              <MaterialIcon name="redo" size={16} />
            </button>
          </div>

          {/* Clear board button */}
          <button
            type="button"
            onClick={handleClear}
            className="px-2 py-2 rounded-xl bg-onicord-danger/10 border border-onicord-danger/20 hover:bg-onicord-danger/20 text-onicord-danger font-bold text-[10px] tracking-wider transition-colors cursor-pointer shrink-0 h-[38px] flex items-center justify-center uppercase"
          >
            {t("common.clear", "LIMPIAR")}
          </button>
        </div>
      </div>
    </div>
  );
}

SketchpadWidget.widgetId = "sketchpad";
SketchpadWidget.badgeText = "Collaborative Space";
SketchpadWidget.bgVariant = "dark";
SketchpadWidget.defaultGeo = { x: 10, y: 1, w: 3, h: 6 };
SketchpadWidget.minW = 2;
SketchpadWidget.minH = 2;
