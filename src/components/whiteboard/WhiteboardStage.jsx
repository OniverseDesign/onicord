import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Lock } from "lucide-react";
import WhiteboardElement, { ShapeSvg } from "./WhiteboardElement";
import WhiteboardToolbar from "./WhiteboardToolbar";
import WhiteboardContextBar from "./WhiteboardContextBar";
import {
  WB_PEN_COLORS,
  WB_STAMPS,
  createWbId,
  screenToWorld,
  worldToScreen,
  distToSegment,
  getUserColorTheme,
} from "./whiteboardConstants";
import { ANCHOR_SIDES, getAnchorPos } from "./whiteboardGeometry";
import { buildSmartConnectorPath } from "./connectorRouting";
import { exportElementsToPng } from "./exportWhiteboardPng";
import { useWhiteboardSync } from "./useWhiteboardSync";
import { useWhiteboardShortcuts } from "./useWhiteboardShortcuts";
import { normalizeKeybindings } from "../../lib/defaultKeybindings";
import { cn } from "../../lib/cn";

export default function WhiteboardStage({
  server,
  channel,
  profile,
  canEdit = true,
}) {
  const roomCode = server?.roomCode || server?.id || "local";
  const channelId = channel?.id || "default-board";
  const myId = profile?.id || "self";
  const myName = profile?.nickname || profile?.username || "User";
  const userTheme = useMemo(() => getUserColorTheme(myId), [myId]);

  const containerRef = useRef(null);
  const strokesCanvasRef = useRef(null);
  const cursorsCanvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  // Camera
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  panRef.current = pan;
  zoomRef.current = zoom;

  // Tool state
  const [activeTool, setActiveTool] = useState(canEdit ? "select" : "hand");
  const [penColor, setPenColor] = useState(userTheme.fill || WB_PEN_COLORS[1]);
  const [penWidth, setPenWidth] = useState(4);
  const [isHighlighter, setIsHighlighter] = useState(false);
  const [activeColor, setActiveColor] = useState(userTheme);
  const [activeShapeKind, setActiveShapeKind] = useState("rect");
  const [activeConnectorKind, setActiveConnectorKind] = useState("arrow");
  const [activeStamp, setActiveStamp] = useState(WB_STAMPS[0]);
  const [activeSticker, setActiveSticker] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);

  // Selection & inline editing
  const [selectedIds, setSelectedIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [marqueeBox, setMarqueeBox] = useState(null);
  const [snapGuides, setSnapGuides] = useState({ x: null, y: null });
  const [contextColorOpen, setContextColorOpen] = useState(false);
  const [contextShapeOpen, setContextShapeOpen] = useState(false);
  const [contextAlignOpen, setContextAlignOpen] = useState(false);

  // Interaction refs
  const spacePressed = useRef(false);
  const interactionRef = useRef(null);
  const currentStrokeRef = useRef(null);
  const [draftConnector, setDraftConnector] = useState(null);
  const [draftShape, setDraftShape] = useState(null);
  const lastCursorSentAt = useRef(0);
  const lastElementSyncAt = useRef(0);

  const resetBoardUi = useCallback(() => {
    setSelectedIds([]);
    setEditingId(null);
    setPan({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const {
    elementsMap,
    setElementsMap,
    elementsMapRef,
    undoStack,
    redoStack,
    remoteCursors,
    remoteEditing,
    remoteInProgressStrokes,
    emitWbEvent,
    saveToStorage,
    upsertElement,
    upsertBatch,
    deleteElementsByIds,
    handleUndo,
    handleRedo,
    clearBoard,
  } = useWhiteboardSync({
    roomCode,
    channelId,
    myId,
    myName,
    onBoardResetUi: resetBoardUi,
  });

  // Broadcast active editing indicator so peers avoid editing the same box
  useEffect(() => {
    emitWbEvent({ type: "editing-element", elementId: editingId || null });
  }, [editingId, emitWbEvent]);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedElements = useMemo(
    () =>
      selectedIds
        .map((id) => elementsMap.get(id))
        .filter((el) => el && !el.deleted),
    [selectedIds, elementsMap]
  );
  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;

  const deleteSelectedElements = useCallback(() => {
    if (!canEdit || selectedIds.length === 0) return;
    const remainingLocked = selectedIds.filter((id) => elementsMapRef.current.get(id)?.locked);
    deleteElementsByIds(selectedIds);
    setSelectedIds(remainingLocked);
  }, [canEdit, selectedIds, deleteElementsByIds, elementsMapRef]);

  const groupSelectedElements = useCallback(() => {
    if (!canEdit || selectedIds.length < 2) return;
    const gid = createWbId();
    const batch = [];
    selectedIds.forEach((id) => {
      const el = elementsMapRef.current.get(id);
      if (el && !el.deleted) batch.push({ ...el, groupId: gid });
    });
    upsertBatch(batch);
  }, [canEdit, selectedIds, upsertBatch, elementsMapRef]);

  const ungroupSelectedElements = useCallback(() => {
    if (!canEdit || selectedIds.length === 0) return;
    const gids = new Set();
    selectedIds.forEach((id) => {
      const el = elementsMapRef.current.get(id);
      if (el?.groupId) gids.add(el.groupId);
    });
    if (gids.size === 0) return;
    const batch = [];
    elementsMapRef.current.forEach((el) => {
      if (el && !el.deleted && el.groupId && gids.has(el.groupId)) {
        batch.push({ ...el, groupId: null });
      }
    });
    upsertBatch(batch);
  }, [canEdit, selectedIds, upsertBatch, elementsMapRef]);

  const bringToFrontSelected = useCallback(() => {
    if (!canEdit || selectedIds.length === 0) return;
    let maxZ = 10;
    elementsMapRef.current.forEach((el) => {
      if (el && !el.deleted && el.type !== "stroke" && el.type !== "connector") {
        maxZ = Math.max(maxZ, el.zIndex ?? (el.type === "section" ? 1 : 10));
      }
    });
    const batch = [];
    selectedIds.forEach((id, idx) => {
      const el = elementsMapRef.current.get(id);
      if (el && !el.deleted && el.type !== "connector") {
        batch.push({ ...el, zIndex: maxZ + 1 + idx });
      }
    });
    upsertBatch(batch);
  }, [canEdit, selectedIds, upsertBatch, elementsMapRef]);

  const sendToBackSelected = useCallback(() => {
    if (!canEdit || selectedIds.length === 0) return;
    let minZ = 10;
    elementsMapRef.current.forEach((el) => {
      if (el && !el.deleted && el.type !== "stroke" && el.type !== "connector") {
        minZ = Math.min(minZ, el.zIndex ?? (el.type === "section" ? 1 : 10));
      }
    });
    const targetZ = Math.max(1, minZ - 1);
    const batch = [];
    selectedIds.forEach((id) => {
      const el = elementsMapRef.current.get(id);
      if (el && !el.deleted && el.type !== "connector") {
        batch.push({ ...el, zIndex: targetZ });
      }
    });
    upsertBatch(batch);
  }, [canEdit, selectedIds, upsertBatch, elementsMapRef]);

  const toggleLockSelected = useCallback(() => {
    if (!canEdit || selectedIds.length === 0) return;
    const anyUnlocked = selectedIds.some((id) => {
      const el = elementsMapRef.current.get(id);
      return el && !el.deleted && !el.locked;
    });
    const batch = [];
    selectedIds.forEach((id) => {
      const el = elementsMapRef.current.get(id);
      if (el && !el.deleted && el.type !== "connector") {
        batch.push({ ...el, locked: anyUnlocked });
      }
    });
    upsertBatch(batch);
  }, [canEdit, selectedIds, upsertBatch, elementsMapRef]);

  const wbKeybindings = useMemo(
    () => normalizeKeybindings(profile?.keybindings),
    [profile?.keybindings]
  );

  const getShortcutLabel = useCallback(
    (action, fallback) => {
      const found = wbKeybindings.find((kb) => kb.action === action);
      return found?.shortcut || fallback;
    },
    [wbKeybindings]
  );

  useWhiteboardShortcuts({
    canEdit,
    editingId,
    setEditingId,
    selectedIds,
    setSelectedIds,
    elementsMapRef,
    wbKeybindings,
    spacePressed,
    setActiveTool,
    setOpenMenu,
    setContextColorOpen,
    setContextShapeOpen,
    setContextAlignOpen,
    handleUndo,
    handleRedo,
    deleteSelectedElements,
    groupSelectedElements,
    ungroupSelectedElements,
    bringToFrontSelected,
    sendToBackSelected,
    toggleLockSelected,
    upsertBatch,
  });

  const visibleElements = useMemo(() => {
    const list = [];
    elementsMap.forEach((el) => {
      if (!el.deleted) list.push(el);
    });
    return list;
  }, [elementsMap]);

  const strokes = useMemo(
    () => visibleElements.filter((el) => el.type === "stroke"),
    [visibleElements]
  );
  const connectors = useMemo(
    () => visibleElements.filter((el) => el.type === "connector"),
    [visibleElements]
  );

  // Canvas 1: Vector strokes only (never redrawn on remote cursor movement)
  const drawStrokesCanvas = useCallback(() => {
    const canvas = strokesCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.floor(canvasSize.w * dpr);
    const targetH = Math.floor(canvasSize.h * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const renderInProgressStroke = (st) => {
      const pts = st.points || [];
      if (pts.length === 0) return;
      const w = st.w || 1;
      const h = st.h || 1;
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = st.style?.stroke || "#FFFFFF";
      ctx.lineWidth = st.style?.strokeWidth || 4;
      if (st.style?.isHighlighter) ctx.globalAlpha = 0.35;
      ctx.beginPath();
      pts.forEach((pt, idx) => {
        const px = pt.rx !== undefined ? (st.x || 0) + pt.rx * w : pt.x;
        const py = pt.ry !== undefined ? (st.y || 0) + pt.ry * h : pt.y;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      if (pts.length === 1) {
        const px = pts[0].rx !== undefined ? (st.x || 0) + pts[0].rx * w : pts[0].x;
        const py = pts[0].ry !== undefined ? (st.y || 0) + pts[0].ry * h : pts[0].y;
        ctx.lineTo(px + 0.1, py + 0.1);
      }
      ctx.stroke();
      ctx.restore();
    };

    // Legacy strokes without bounding box fallback; new strokes are rendered as interactive WhiteboardElement SVGs
    strokes.filter((st) => st.w === undefined).forEach(renderInProgressStroke);
    if (currentStrokeRef.current) renderInProgressStroke(currentStrokeRef.current);
    remoteInProgressStrokes.current.forEach(renderInProgressStroke);
    ctx.restore();
  }, [canvasSize, pan, zoom, strokes, remoteInProgressStrokes]);

  useEffect(() => {
    drawStrokesCanvas();
  }, [drawStrokesCanvas]);

  // Canvas 2: Remote cursors only (lightweight 30fps updates)
  const drawCursorsCanvas = useCallback(() => {
    const canvas = cursorsCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.floor(canvasSize.w * dpr);
    const targetH = Math.floor(canvasSize.h * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);

    Object.values(remoteCursors).forEach((cur) => {
      const pos = worldToScreen(cur.x, cur.y, pan, zoom);
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.fillStyle = cur.color || "#38BDF8";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 14);
      ctx.lineTo(10, 10);
      ctx.closePath();
      ctx.fill();

      const label = cur.nickname || "User";
      ctx.font = "600 11px sans-serif";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = cur.color || "#38BDF8";
      ctx.beginPath();
      ctx.roundRect(10, 10, tw + 12, 20, 6);
      ctx.fill();
      ctx.fillStyle = "#09090B";
      ctx.fillText(label, 16, 24);
      ctx.restore();
    });
  }, [canvasSize, pan, zoom, remoteCursors]);

  useEffect(() => {
    drawCursorsCanvas();
  }, [drawCursorsCanvas]);

  const handleWheel = (e) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (e.ctrlKey || e.metaKey || !e.shiftKey) {
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const nextZoom = Math.min(4, Math.max(0.2, zoom * factor));
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = (mx - pan.x) / zoom;
      const wy = (my - pan.y) / zoom;
      setZoom(nextZoom);
      setPan({ x: mx - wx * nextZoom, y: my - wy * nextZoom });
    } else {
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  const eraseAtPoint = (wx, wy) => {
    const threshold = 14 / zoom;
    for (const st of strokes) {
      const w = st.w || 1;
      const h = st.h || 1;
      const pts = (st.points || []).map((p) => ({
        x: p.rx !== undefined ? (st.x || 0) + p.rx * w : p.x,
        y: p.ry !== undefined ? (st.y || 0) + p.ry * h : p.y,
      }));
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSegment(wx, wy, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y) <= threshold) {
          deleteElementsByIds([st.id]);
          return;
        }
      }
      if (pts.length === 1 && Math.hypot(wx - pts[0].x, wy - pts[0].y) <= threshold) {
        deleteElementsByIds([st.id]);
        return;
      }
    }
  };

  const handleStagePointerDown = (e) => {
    setOpenMenu(null);
    setContextColorOpen(false);
    setContextShapeOpen(false);
    setContextAlignOpen(false);
    if (editingId) setEditingId(null);

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (e.button === 1 || spacePressed.current || activeTool === "hand" || !canEdit) {
      interactionRef.current = {
        mode: "pan",
        startX: e.clientX,
        startY: e.clientY,
        origPan: { ...pan },
      };
      return;
    }

    if (e.button !== 0) return;
    const world = screenToWorld(e.clientX, e.clientY, rect, pan, zoom);

    if (activeTool === "select") {
      if (!e.shiftKey) setSelectedIds([]);
      interactionRef.current = {
        mode: "marquee",
        startWorld: world,
        additive: e.shiftKey,
        initialIds: e.shiftKey ? [...selectedIds] : [],
      };
      setMarqueeBox({ x: world.x, y: world.y, w: 0, h: 0 });
      return;
    }

    if (activeTool === "pen") {
      const newStroke = {
        id: createWbId(),
        type: "stroke",
        points: [world],
        style: { stroke: penColor, strokeWidth: penWidth, isHighlighter },
      };
      currentStrokeRef.current = newStroke;
      interactionRef.current = { mode: "draw" };
      drawStrokesCanvas();
      return;
    }

    if (activeTool === "eraser") {
      interactionRef.current = { mode: "erase" };
      eraseAtPoint(world.x, world.y);
      return;
    }

    if (activeTool === "sticky") {
      e.preventDefault();
      const sticky = upsertElement({
        id: createWbId(),
        type: "sticky",
        x: world.x - 90,
        y: world.y - 90,
        w: 180,
        h: 180,
        text: "",
        authorName: myName,
        style: { fill: activeColor.fill, stroke: activeColor.stroke },
      });
      setSelectedIds([sticky.id]);
      setEditingId(sticky.id);
      return;
    }

    if (activeTool === "text" || activeTool === "shape" || activeTool === "section") {
      e.preventDefault();
      interactionRef.current = {
        mode: "create-shape",
        startWorld: world,
        kind:
          activeTool === "section"
            ? "section"
            : activeTool === "text"
              ? "text"
              : activeShapeKind,
      };
      setDraftShape({
        x: world.x,
        y: world.y,
        w: 2,
        h: 2,
        isSection: activeTool === "section",
        isText: activeTool === "text",
      });
      return;
    }

    if (activeTool === "stamp") {
      const stamp = upsertElement({
        id: createWbId(),
        type: "stamp",
        x: world.x - 24,
        y: world.y - 24,
        w: 48,
        h: 48,
        text: activeStamp,
      });
      setSelectedIds([stamp.id]);
      return;
    }

    if (activeTool === "sticker" && activeSticker) {
      const stkEl = upsertElement({
        id: createWbId(),
        type: "sticker",
        x: world.x - 60,
        y: world.y - 60,
        w: 120,
        h: 120,
        stickerId: activeSticker.id,
        stickerName: activeSticker.name,
        ext: activeSticker.ext,
      });
      setSelectedIds([stkEl.id]);
      return;
    }

    if (activeTool === "table") {
      const table = upsertElement({
        id: createWbId(),
        type: "table",
        x: world.x - 180,
        y: world.y - 75,
        w: 360,
        h: 150,
        rows: 3,
        cols: 3,
        cells: [
          ["Columna 1", "Columna 2", "Columna 3"],
          ["", "", ""],
          ["", "", ""],
        ],
      });
      setSelectedIds([table.id]);
      setActiveTool("select");
      return;
    }

    if (activeTool === "connector") {
      interactionRef.current = { mode: "create-connector", startWorld: world };
      setDraftConnector({
        x1: world.x,
        y1: world.y,
        x2: world.x,
        y2: world.y,
        kind: activeConnectorKind,
      });
    }
  };

  const handleStagePointerMove = (e) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const world = screenToWorld(e.clientX, e.clientY, rect, pan, zoom);

    const now = Date.now();
    if (now - lastCursorSentAt.current > 35) {
      lastCursorSentAt.current = now;
      emitWbEvent({ type: "cursor", x: world.x, y: world.y, color: userTheme.fill });
    }

    const emitLiveBatchSync = (items) => {
      if (!items || items.length === 0) return;
      const t = Date.now();
      if (t - lastElementSyncAt.current > 35) {
        lastElementSyncAt.current = t;
        const payloadItems = items.map((it) => ({
          ...it,
          updatedAt: t,
          updatedBy: myId,
        }));
        if (payloadItems.length === 1) {
          emitWbEvent({ type: "op:upsert", element: payloadItems[0] });
        } else {
          emitWbEvent({ type: "op:batch-upsert", elements: payloadItems });
        }
      }
    };

    const inter = interactionRef.current;
    if (!inter) return;

    if (inter.mode === "pan") {
      setPan({
        x: inter.origPan.x + (e.clientX - inter.startX),
        y: inter.origPan.y + (e.clientY - inter.startY),
      });
    } else if (inter.mode === "draw" && currentStrokeRef.current) {
      currentStrokeRef.current.points.push(world);
      drawStrokesCanvas();
      emitWbEvent({ type: "stroke-progress", stroke: currentStrokeRef.current });
    } else if (inter.mode === "erase") {
      eraseAtPoint(world.x, world.y);
    } else if (inter.mode === "marquee") {
      setMarqueeBox({
        x: Math.min(inter.startWorld.x, world.x),
        y: Math.min(inter.startWorld.y, world.y),
        w: Math.abs(world.x - inter.startWorld.x),
        h: Math.abs(world.y - inter.startWorld.y),
      });
    } else if (inter.mode === "drag") {
      let dx = (e.clientX - inter.startX) / zoom;
      let dy = (e.clientY - inter.startY) / zoom;

      let guideX = null;
      let guideY = null;
      const movableOrig = (inter.origItems || []).filter((it) => it.w > 0 || it.h > 0);
      if (!e.altKey && movableOrig.length > 0) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const it of movableOrig) {
          minX = Math.min(minX, it.x + dx);
          maxX = Math.max(maxX, it.x + dx + it.w);
          minY = Math.min(minY, it.y + dy);
          maxY = Math.max(maxY, it.y + dy + it.h);
        }
        const dragXs = [minX, (minX + maxX) / 2, maxX];
        const dragYs = [minY, (minY + maxY) / 2, maxY];
        const draggedIds = new Set((inter.origItems || []).map((it) => it.id));
        const snapThresh = 6 / zoom;
        let bestDx = Infinity;
        let bestDy = Infinity;

        elementsMapRef.current.forEach((other) => {
          if (
            !other ||
            other.deleted ||
            draggedIds.has(other.id) ||
            other.type === "connector" ||
            other.type === "stroke"
          ) {
            return;
          }
          const ox1 = other.x || 0;
          const ox2 = ox1 + (other.w || 0);
          const oxC = (ox1 + ox2) / 2;
          const oy1 = other.y || 0;
          const oy2 = oy1 + (other.h || 0);
          const oyC = (oy1 + oy2) / 2;

          for (const tx of [ox1, oxC, ox2]) {
            for (const sx of dragXs) {
              const diff = tx - sx;
              if (Math.abs(diff) < snapThresh && Math.abs(diff) < Math.abs(bestDx)) {
                bestDx = diff;
                guideX = tx;
              }
            }
          }
          for (const ty of [oy1, oyC, oy2]) {
            for (const sy of dragYs) {
              const diff = ty - sy;
              if (Math.abs(diff) < snapThresh && Math.abs(diff) < Math.abs(bestDy)) {
                bestDy = diff;
                guideY = ty;
              }
            }
          }
        });

        if (guideX !== null) dx += bestDx;
        else {
          const snappedMinX = Math.round(minX / 24) * 24;
          if (Math.abs(snappedMinX - minX) < 8 / zoom) dx += snappedMinX - minX;
        }
        if (guideY !== null) dy += bestDy;
        else {
          const snappedMinY = Math.round(minY / 24) * 24;
          if (Math.abs(snappedMinY - minY) < 8 / zoom) dy += snappedMinY - minY;
        }
      }
      setSnapGuides({ x: guideX, y: guideY });

      const updatedItems = [];
      setElementsMap((prev) => {
        const next = new Map(prev);
        for (const item of inter.origItems || []) {
          const cur = next.get(item.id);
          if (!cur) continue;
          const updatedEl =
            cur.type === "connector" && !cur.fromId && !cur.toId
              ? {
                  ...cur,
                  x1: item.x1 + dx,
                  y1: item.y1 + dy,
                  x2: item.x2 + dx,
                  y2: item.y2 + dy,
                }
              : { ...cur, x: item.x + dx, y: item.y + dy };
          next.set(item.id, updatedEl);
          updatedItems.push(updatedEl);
        }
        return next;
      });
      emitLiveBatchSync(updatedItems);
    } else if (inter.mode === "resize") {
      const dx = (e.clientX - inter.startX) / zoom;
      const dy = (e.clientY - inter.startY) / zoom;
      const cur = elementsMapRef.current.get(inter.id);
      if (cur) {
        let { origX: x, origY: y, origW: w, origH: h, dir } = inter;
        if (dir.includes("e")) w = Math.max(40, w + dx);
        if (dir.includes("s")) h = Math.max(40, h + dy);
        if (dir.includes("w")) {
          const nw = Math.max(40, w - dx);
          x += w - nw;
          w = nw;
        }
        if (dir.includes("n")) {
          const nh = Math.max(40, h - dy);
          y += h - nh;
          h = nh;
        }
        if (e.shiftKey && inter.origW > 0 && inter.origH > 0) {
          const ratio = inter.origW / inter.origH;
          if (Math.abs(dx) >= Math.abs(dy * ratio)) {
            h = Math.max(40, w / ratio);
            if (dir.includes("n")) y = inter.origY + inter.origH - h;
          } else {
            w = Math.max(40, h * ratio);
            if (dir.includes("w")) x = inter.origX + inter.origW - w;
          }
        }
        const updatedEl = { ...cur, x, y, w, h };
        setElementsMap((prev) => {
          const next = new Map(prev);
          next.set(inter.id, updatedEl);
          return next;
        });
        emitLiveBatchSync([updatedEl]);
      }
    } else if (inter.mode === "radius") {
      const dx = (e.clientX - inter.startX) / zoom;
      const dy = (e.clientY - inter.startY) / zoom;
      const delta = (dx + dy) * 0.6;
      const cur = elementsMapRef.current.get(inter.id);
      if (cur) {
        const maxR = Math.min(cur.w || 0, cur.h || 0) / 2;
        const nextRadius = Math.max(0, Math.min(maxR, Math.round(inter.origRadius + delta)));
        const updatedEl = { ...cur, style: { ...cur.style, borderRadius: nextRadius } };
        setElementsMap((prev) => {
          const next = new Map(prev);
          next.set(inter.id, updatedEl);
          return next;
        });
        emitLiveBatchSync([updatedEl]);
      }
    } else if (inter.mode === "rotate") {
      const angle = (Math.atan2(world.y - inter.cy, world.x - inter.cx) * 180) / Math.PI;
      let nextRot = inter.origRotation + (angle - inter.startAngle);
      if (e.shiftKey) nextRot = Math.round(nextRot / 45) * 45;
      const cur = elementsMapRef.current.get(inter.id);
      if (cur) {
        const updatedEl = { ...cur, rotation: Math.round(nextRot) };
        setElementsMap((prev) => {
          const next = new Map(prev);
          next.set(inter.id, updatedEl);
          return next;
        });
        emitLiveBatchSync([updatedEl]);
      }
    } else if (inter.mode === "create-shape") {
      const rawDx = world.x - inter.startWorld.x;
      const rawDy = world.y - inter.startWorld.y;
      let w = Math.abs(rawDx);
      let h = Math.abs(rawDy);
      if (e.shiftKey) {
        const side = Math.max(w, h);
        w = side;
        h = side;
      }
      setDraftShape({
        x: rawDx < 0 ? inter.startWorld.x - w : inter.startWorld.x,
        y: rawDy < 0 ? inter.startWorld.y - h : inter.startWorld.y,
        w,
        h,
        isSection: inter.kind === "section",
        isText: inter.kind === "text",
      });
    } else if (inter.mode === "create-connector") {
      const snapThreshold = 22 / zoom;
      let snapped = null;
      let bestDist = snapThreshold;
      elementsMapRef.current.forEach((cand) => {
        if (
          !cand ||
          cand.deleted ||
          cand.id === inter.fromId ||
          (cand.type !== "shape" &&
            cand.type !== "sticky" &&
            cand.type !== "section" &&
            cand.type !== "image" &&
            cand.type !== "table")
        ) {
          return;
        }
        for (const side of ANCHOR_SIDES) {
          const pos = getAnchorPos(cand, side);
          const d = Math.hypot(world.x - pos.x, world.y - pos.y);
          if (d < bestDist) {
            bestDist = d;
            snapped = { toId: cand.id, toSide: side, x: pos.x, y: pos.y };
          }
        }
      });
      setDraftConnector((prev) =>
        prev
          ? {
              ...prev,
              x2: snapped ? snapped.x : world.x,
              y2: snapped ? snapped.y : world.y,
              toId: snapped ? snapped.toId : null,
              toSide: snapped ? snapped.toSide : null,
            }
          : null
      );
    }
  };

  const handleStagePointerUp = () => {
    setSnapGuides({ x: null, y: null });
    const inter = interactionRef.current;
    interactionRef.current = null;
    if (!inter) return;

    if (inter.mode === "marquee") {
      const mb = marqueeBox;
      setMarqueeBox(null);
      if (mb && (mb.w >= 4 || mb.h >= 4)) {
        const hitIds = new Set(inter.initialIds || []);
        elementsMapRef.current.forEach((el) => {
          if (!el || el.deleted) return;
          if (el.type === "stroke" && el.w === undefined) return;
          let ex1, ey1, ex2, ey2;
          if (el.type === "connector") {
            const fromEl = el.fromId ? elementsMapRef.current.get(el.fromId) : null;
            const toEl = el.toId ? elementsMapRef.current.get(el.toId) : null;
            const p1 = fromEl && !fromEl.deleted && el.fromSide ? getAnchorPos(fromEl, el.fromSide) : { x: el.x1, y: el.y1 };
            const p2 = toEl && !toEl.deleted && el.toSide ? getAnchorPos(toEl, el.toSide) : { x: el.x2, y: el.y2 };
            ex1 = Math.min(p1.x, p2.x);
            ey1 = Math.min(p1.y, p2.y);
            ex2 = Math.max(p1.x, p2.x);
            ey2 = Math.max(p1.y, p2.y);
          } else {
            ex1 = el.x || 0;
            ey1 = el.y || 0;
            ex2 = ex1 + (el.w || 0);
            ey2 = ey1 + (el.h || 0);
          }
          if (ex1 <= mb.x + mb.w && ex2 >= mb.x && ey1 <= mb.y + mb.h && ey2 >= mb.y) {
            hitIds.add(el.id);
          }
        });
        setSelectedIds(Array.from(hitIds));
      } else if (!inter.additive) {
        setSelectedIds([]);
      }
      return;
    }

    if (inter.mode === "draw" && currentStrokeRef.current) {
      const finished = currentStrokeRef.current;
      currentStrokeRef.current = null;
      const pts = finished.points || [];
      if (pts.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        const w = Math.max(16, maxX - minX);
        const h = Math.max(16, maxY - minY);
        const normPts = pts.map((p) => ({
          rx: (p.x - minX) / w,
          ry: (p.y - minY) / h,
        }));
        upsertElement({
          ...finished,
          x: minX,
          y: minY,
          w,
          h,
          points: normPts,
        });
      }
    } else if (inter.mode === "drag") {
      const finalItems = (inter.origItems || [])
        .map((it) => elementsMapRef.current.get(it.id))
        .filter(Boolean);
      upsertBatch(finalItems, { recordUndo: true, broadcast: true });
    } else if (inter.mode === "resize" || inter.mode === "radius" || inter.mode === "rotate") {
      const el = elementsMapRef.current.get(inter.id);
      if (el) upsertElement(el, { recordUndo: true, broadcast: true });
    } else if (inter.mode === "create-shape") {
      const ds = draftShape;
      setDraftShape(null);
      const isTooSmall = !ds || (ds.w < 12 && ds.h < 12);
      const isText = inter.kind === "text";
      const isSection = inter.kind === "section";
      const finalEl = upsertElement({
        id: createWbId(),
        type: isSection ? "section" : isText ? "text" : "shape",
        x: isTooSmall ? (isText ? inter.startWorld.x - 10 : inter.startWorld.x - 75) : ds.x,
        y: isTooSmall ? (isText ? inter.startWorld.y - 16 : inter.startWorld.y - 75) : ds.y,
        w: isTooSmall ? (isSection ? 360 : isText ? 220 : 150) : Math.max(40, ds.w),
        h: isTooSmall ? (isSection ? 240 : isText ? 48 : 150) : Math.max(36, ds.h),
        text: isSection ? "Sección" : "",
        style: isText
          ? { color: "#F4F4F5", fontSize: 18 }
          : {
              fill: activeColor.fill,
              stroke: activeColor.stroke,
              strokeWidth: 2,
              strokeStyle: "solid",
              shapeKind: inter.kind,
              borderRadius: 0,
            },
      });
      setSelectedIds([finalEl.id]);
      if (isText) setEditingId(finalEl.id);
    } else if (inter.mode === "create-connector") {
      const dc = draftConnector;
      setDraftConnector(null);
      if (dc && Math.hypot(dc.x2 - dc.x1, dc.y2 - dc.y1) > 10) {
        const conn = upsertElement({
          id: createWbId(),
          type: "connector",
          x1: dc.x1,
          y1: dc.y1,
          x2: dc.x2,
          y2: dc.y2,
          fromId: inter.fromId || null,
          fromSide: inter.fromSide || null,
          toId: dc.toId || null,
          toSide: dc.toSide || null,
          style: { stroke: "#A1A1AA", strokeWidth: 2.5, connectorKind: dc.kind },
        });
        setSelectedIds([conn.id]);
      }
      if (inter.fromId) setActiveTool("select");
    }
  };

  const handleElementPointerDown = (e, el) => {
    e.stopPropagation();
    if (activeTool === "eraser" && canEdit) {
      deleteElementsByIds([el.id]);
      return;
    }
    if (
      activeTool !== "select" &&
      activeTool !== "sticky" &&
      activeTool !== "text" &&
      activeTool !== "stamp" &&
      activeTool !== "sticker" &&
      canEdit
    ) {
      return;
    }
    if (editingId && editingId !== el.id) handleFinishEdit();
    if (
      activeTool === "text" &&
      canEdit &&
      !el.locked &&
      (el.type === "shape" || el.type === "sticky" || el.type === "text" || el.type === "section")
    ) {
      e.preventDefault();
      setSelectedIds([el.id]);
      setEditingId(el.id);
      return;
    }

    const getGroupMembers = (targetEl) => {
      if (!targetEl.groupId) return [targetEl.id];
      const members = [];
      elementsMapRef.current.forEach((cand) => {
        if (cand && !cand.deleted && cand.groupId === targetEl.groupId) members.push(cand.id);
      });
      return members.length > 0 ? members : [targetEl.id];
    };

    let nextSelectedIds;
    if (e.shiftKey) {
      const groupMembers = getGroupMembers(el);
      const allIn = groupMembers.every((id) => selectedSet.has(id));
      nextSelectedIds = allIn
        ? selectedIds.filter((id) => !groupMembers.includes(id))
        : Array.from(new Set([...selectedIds, ...groupMembers]));
      setSelectedIds(nextSelectedIds);
    } else if (selectedSet.has(el.id)) {
      nextSelectedIds = selectedIds;
    } else {
      nextSelectedIds = getGroupMembers(el);
      setSelectedIds(nextSelectedIds);
    }

    if (!canEdit) return;
    const origItems = nextSelectedIds
      .map((id) => elementsMapRef.current.get(id))
      .filter((item) => item && !item.deleted && !item.locked)
      .map((item) => ({
        id: item.id,
        x: item.x || 0,
        y: item.y || 0,
        w: item.w || 0,
        h: item.h || 0,
        x1: item.x1 || 0,
        y1: item.y1 || 0,
        x2: item.x2 || 0,
        y2: item.y2 || 0,
      }));
    interactionRef.current = {
      mode: "drag",
      origItems,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

  const handleElementDoubleClick = (e, el) => {
    e.stopPropagation();
    if (!canEdit || el.locked) return;
    if (el.type === "sticky" || el.type === "shape" || el.type === "text" || el.type === "section") {
      setSelectedIds([el.id]);
      setEditingId(el.id);
    }
  };

  const handleResizeStart = (e, el, dir) => {
    if (!canEdit || el.locked) return;
    interactionRef.current = {
      mode: "resize",
      id: el.id,
      dir,
      startX: e.clientX,
      startY: e.clientY,
      origX: el.x,
      origY: el.y,
      origW: el.w,
      origH: el.h,
    };
  };

  const handleRadiusStart = (e, el) => {
    if (!canEdit || el.locked) return;
    interactionRef.current = {
      mode: "radius",
      id: el.id,
      startX: e.clientX,
      startY: e.clientY,
      origRadius: el.style?.borderRadius ?? 0,
    };
  };

  const handleRotateStart = (e, el) => {
    if (!canEdit || el.locked) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const world = screenToWorld(e.clientX, e.clientY, rect, pan, zoom);
    const cx = (el.x || 0) + (el.w || 0) / 2;
    const cy = (el.y || 0) + (el.h || 0) / 2;
    interactionRef.current = {
      mode: "rotate",
      id: el.id,
      cx,
      cy,
      startAngle: (Math.atan2(world.y - cy, world.x - cx) * 180) / Math.PI,
      origRotation: el.rotation || 0,
    };
  };

  const handleConnectStart = (e, el, side) => {
    if (!canEdit || el.locked) return;
    const anchor = getAnchorPos(el, side);
    interactionRef.current = {
      mode: "create-connector",
      fromId: el.id,
      fromSide: side,
      startWorld: anchor,
    };
    setDraftConnector({
      x1: anchor.x,
      y1: anchor.y,
      x2: anchor.x,
      y2: anchor.y,
      kind: activeConnectorKind || "arrow",
    });
  };

  const handleElementTextChange = (id, newText) => {
    const current = elementsMapRef.current.get(id);
    if (!current || current.locked) return;
    const updatedEl = { ...current, text: newText, updatedAt: Date.now(), updatedBy: myId };
    setElementsMap((prev) => {
      const next = new Map(prev);
      next.set(id, updatedEl);
      saveToStorage(next);
      return next;
    });
    emitWbEvent({ type: "op:upsert", element: updatedEl });
  };

  const handleTableCellChange = (id, rIdx, cIdx, val) => {
    const current = elementsMapRef.current.get(id);
    if (!current || current.locked) return;
    const nextCells = (current.cells || []).map((row, r) =>
      r === rIdx ? row.map((cell, c) => (c === cIdx ? val : cell)) : row
    );
    const updatedEl = { ...current, cells: nextCells, updatedAt: Date.now(), updatedBy: myId };
    setElementsMap((prev) => {
      const next = new Map(prev);
      next.set(id, updatedEl);
      saveToStorage(next);
      return next;
    });
    emitWbEvent({ type: "op:upsert", element: updatedEl });
  };

  const handleModifyTable = (tableEl, op) => {
    if (!tableEl || tableEl.locked) return;
    const curCells = tableEl.cells || [["", ""], ["", ""]];
    const rows = curCells.length;
    const cols = curCells[0]?.length || 1;
    let nextCells = curCells;
    let nextW = tableEl.w || 360;
    let nextH = tableEl.h || 150;
    if (op === "addRow") {
      nextCells = [...curCells, Array(cols).fill("")];
      nextH += 40;
    } else if (op === "removeRow" && rows > 1) {
      nextCells = curCells.slice(0, -1);
      nextH = Math.max(60, nextH - 40);
    } else if (op === "addCol") {
      nextCells = curCells.map((r, ri) => [...r, ri === 0 ? `Col ${cols + 1}` : ""]);
      nextW += 110;
    } else if (op === "removeCol" && cols > 1) {
      nextCells = curCells.map((r) => r.slice(0, -1));
      nextW = Math.max(120, nextW - 110);
    }
    upsertElement({
      ...tableEl,
      rows: nextCells.length,
      cols: nextCells[0]?.length || 1,
      cells: nextCells,
      w: nextW,
      h: nextH,
    });
  };

  const handleFinishEdit = () => {
    if (editingId) {
      const el = elementsMapRef.current.get(editingId);
      if (el) upsertElement(el, { recordUndo: true, broadcast: true });
      setEditingId(null);
    }
  };

  const uploadAndInsertImage = useCallback(
    async (file, worldPos) => {
      if (!canEdit || !file || !file.type?.startsWith("image/") || !window.electronAPI) return;
      let naturalW = 280;
      let naturalH = 200;
      try {
        const objectUrl = URL.createObjectURL(file);
        await new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            const scale = Math.min(1, 360 / Math.max(img.width || 1, img.height || 1));
            naturalW = Math.max(60, Math.round((img.width || 280) * scale));
            naturalH = Math.max(60, Math.round((img.height || 200) * scale));
            URL.revokeObjectURL(objectUrl);
            resolve();
          };
          img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve();
          };
          img.src = objectUrl;
        });
      } catch {
        // default size
      }

      try {
        let meta = null;
        const nativePath =
          file.path ||
          (window.electronAPI.getNativePath ? await window.electronAPI.getNativePath(file) : null);
        if (nativePath && window.electronAPI.processDroppedMeta) {
          meta = await window.electronAPI.processDroppedMeta(roomCode, nativePath);
        } else if (window.electronAPI.uploadClipboardImage) {
          meta = await window.electronAPI.uploadClipboardImage(roomCode, await file.arrayBuffer());
        }
        if (!meta?.id) return;
        const imgEl = upsertElement({
          id: createWbId(),
          type: "image",
          x: worldPos.x - naturalW / 2,
          y: worldPos.y - naturalH / 2,
          w: naturalW,
          h: naturalH,
          fileId: meta.id,
          fileName: meta.name || file.name || "image.png",
          fileSize: meta.size || file.size || 0,
          thumbnail: meta.thumbnail || null,
          roomCode,
        });
        setSelectedIds([imgEl.id]);
        setActiveTool("select");
      } catch (err) {
        console.error("[WhiteboardStage] Error uploading image:", err);
      }
    },
    [canEdit, roomCode, upsertElement]
  );

  useEffect(() => {
    const onPaste = async (e) => {
      if (!canEdit) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable || editingId !== null) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type?.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            await uploadAndInsertImage(blob, {
              x: (canvasSize.w / 2 - panRef.current.x) / zoomRef.current,
              y: (canvasSize.h / 2 - panRef.current.y) / zoomRef.current,
            });
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [canEdit, editingId, canvasSize.w, canvasSize.h, uploadAndInsertImage]);

  const handleStageDragOver = (e) => {
    if (canEdit && e.dataTransfer?.types?.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const handleStageDrop = async (e) => {
    if (!canEdit) return;
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const world = screenToWorld(e.clientX, e.clientY, rect, panRef.current, zoomRef.current);
    let offset = 0;
    for (const file of Array.from(files)) {
      if (file.type?.startsWith("image/")) {
        await uploadAndInsertImage(file, { x: world.x + offset, y: world.y + offset });
        offset += 28;
      }
    }
  };

  const contextBarPos = useMemo(() => {
    if (selectedElements.length === 0) return null;
    if (selectedElements.length === 1 && editingId === selectedElements[0].id) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity;
    let hasBox = false;
    for (const el of selectedElements) {
      if (el.type === "stroke" && el.w === undefined) continue;
      hasBox = true;
      if (el.type === "connector") {
        const fromEl = el.fromId ? elementsMap.get(el.fromId) : null;
        const toEl = el.toId ? elementsMap.get(el.toId) : null;
        const p1 = fromEl && !fromEl.deleted && el.fromSide ? getAnchorPos(fromEl, el.fromSide) : { x: el.x1 || 0, y: el.y1 || 0 };
        const p2 = toEl && !toEl.deleted && el.toSide ? getAnchorPos(toEl, el.toSide) : { x: el.x2 || 0, y: el.y2 || 0 };
        minX = Math.min(minX, p1.x, p2.x);
        maxX = Math.max(maxX, p1.x, p2.x);
        minY = Math.min(minY, p1.y, p2.y);
      } else {
        minX = Math.min(minX, el.x || 0);
        maxX = Math.max(maxX, (el.x || 0) + (el.w || 0));
        minY = Math.min(minY, el.y || 0);
      }
    }
    return hasBox ? worldToScreen((minX + maxX) / 2, minY, pan, zoom) : null;
  }, [selectedElements, elementsMap, editingId, pan, zoom]);

  const commonProps = useMemo(() => {
    if (selectedElements.length === 0) return null;
    return {
      allShapes: selectedElements.every((el) => el.type === "shape"),
      allConnectors: selectedElements.every((el) => el.type === "connector"),
      allStrokes: selectedElements.every((el) => el.type === "stroke"),
      allColorable: selectedElements.every(
        (el) =>
          el.type === "shape" ||
          el.type === "sticky" ||
          el.type === "connector" ||
          el.type === "text" ||
          el.type === "stroke"
      ),
      hasDuplicatable: selectedElements.some((el) => el.type !== "connector"),
      alignableCount: selectedElements.filter(
        (el) => el.type !== "connector" && !el.locked
      ).length,
      hasGroup: selectedElements.some((el) => Boolean(el.groupId)),
      hasLayerable: selectedElements.some((el) => el.type !== "connector"),
      allLocked: selectedElements.every((el) => Boolean(el.locked)),
      anyLocked: selectedElements.some((el) => Boolean(el.locked)),
      count: selectedElements.length,
    };
  }, [selectedElements]);

  const handleAlignSelected = (mode) => {
    const items = selectedElements.filter(
      (el) => el.type !== "connector" && !el.locked
    );
    if (items.length < 2) return;
    const minX = Math.min(...items.map((el) => el.x || 0));
    const maxX = Math.max(...items.map((el) => (el.x || 0) + (el.w || 0)));
    const minY = Math.min(...items.map((el) => el.y || 0));
    const maxY = Math.max(...items.map((el) => (el.y || 0) + (el.h || 0)));
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    upsertBatch(
      items.map((el) => {
        const w = el.w || 0;
        const h = el.h || 0;
        let nx = el.x || 0;
        let ny = el.y || 0;
        if (mode === "left") nx = minX;
        else if (mode === "centerH") nx = midX - w / 2;
        else if (mode === "right") nx = maxX - w;
        else if (mode === "top") ny = minY;
        else if (mode === "centerV") ny = midY - h / 2;
        else if (mode === "bottom") ny = maxY - h;
        return { ...el, x: nx, y: ny };
      })
    );
    setContextAlignOpen(false);
  };

  const handleDistributeSelected = (axis) => {
    const items = selectedElements.filter(
      (el) => el.type !== "connector" && !el.locked
    );
    if (items.length < 3) return;
    if (axis === "horizontal") {
      const sorted = [...items].sort((a, b) => (a.x || 0) - (b.x || 0));
      const firstX = sorted[0].x || 0;
      const lastRight = (sorted[sorted.length - 1].x || 0) + (sorted[sorted.length - 1].w || 0);
      const gap = (lastRight - firstX - sorted.reduce((acc, el) => acc + (el.w || 0), 0)) / (sorted.length - 1);
      let cursor = firstX;
      upsertBatch(
        sorted.map((el) => {
          const updated = { ...el, x: cursor };
          cursor += (el.w || 0) + gap;
          return updated;
        })
      );
    } else {
      const sorted = [...items].sort((a, b) => (a.y || 0) - (b.y || 0));
      const firstY = sorted[0].y || 0;
      const lastBottom = (sorted[sorted.length - 1].y || 0) + (sorted[sorted.length - 1].h || 0);
      const gap = (lastBottom - firstY - sorted.reduce((acc, el) => acc + (el.h || 0), 0)) / (sorted.length - 1);
      let cursor = firstY;
      upsertBatch(
        sorted.map((el) => {
          const updated = { ...el, y: cursor };
          cursor += (el.h || 0) + gap;
          return updated;
        })
      );
    }
    setContextAlignOpen(false);
  };

  // Export handlers (Board, Section, Group/Selection)
  const handleExportBoard = () => {
    exportElementsToPng({
      elements: visibleElements,
      allElementsMap: elementsMap,
      getAnchorPos,
      filename: channel?.name || "pizarra",
    });
  };

  const handleExportSection = (sectionEl) => {
    if (!sectionEl) return;
    const sx1 = sectionEl.x || 0;
    const sy1 = sectionEl.y || 0;
    const sx2 = sx1 + (sectionEl.w || 0);
    const sy2 = sy1 + (sectionEl.h || 0);
    const containedIds = new Set([sectionEl.id]);
    const items = [sectionEl];
    for (const el of visibleElements) {
      if (el.id === sectionEl.id) continue;
      if (el.type === "stroke") {
        const inside = (el.points || []).some(
          (p) => p.x >= sx1 && p.x <= sx2 && p.y >= sy1 && p.y <= sy2
        );
        if (inside) items.push(el);
      } else if (el.type !== "connector") {
        const ex1 = el.x || 0;
        const ey1 = el.y || 0;
        const ex2 = ex1 + (el.w || 0);
        const ey2 = ey1 + (el.h || 0);
        if (ex1 <= sx2 && ex2 >= sx1 && ey1 <= sy2 && ey2 >= sy1) {
          containedIds.add(el.id);
          items.push(el);
        }
      }
    }
    for (const c of connectors) {
      if (containedIds.has(c.fromId) || containedIds.has(c.toId)) items.push(c);
    }
    exportElementsToPng({
      elements: items,
      allElementsMap: elementsMap,
      getAnchorPos,
      filename: sectionEl.text || "seccion",
    });
  };

  const handleExportSelection = () => {
    if (selectedElements.length === 0) return;
    const selIdSet = new Set(selectedElements.map((e) => e.id));
    const items = [...selectedElements];
    for (const c of connectors) {
      if (!selIdSet.has(c.id) && selIdSet.has(c.fromId) && selIdSet.has(c.toId)) {
        items.push(c);
      }
    }
    exportElementsToPng({
      elements: items,
      allElementsMap: elementsMap,
      getAnchorPos,
      filename: `${channel?.name || "pizarra"}-grupo`,
    });
  };

  const gridStep = zoom < 0.5 ? 48 : 24;
  const dotSpacing = gridStep * zoom;

  return (
    <div
      ref={containerRef}
      onWheel={handleWheel}
      onDragOver={handleStageDragOver}
      onDrop={handleStageDrop}
      onPointerDown={handleStagePointerDown}
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerUp}
      style={{
        backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.14) 1px, transparent 1px)`,
        backgroundSize: `${dotSpacing}px ${dotSpacing}px`,
        backgroundPosition: `${pan.x - dotSpacing / 2}px ${pan.y - dotSpacing / 2}px`,
      }}
      className={cn(
        "relative w-full h-full overflow-hidden bg-onicord-base select-none",
        activeTool === "hand" || !canEdit
          ? "cursor-grab active:cursor-grabbing"
          : activeTool === "pen" || activeTool === "shape" || activeTool === "connector"
            ? "cursor-crosshair"
            : "cursor-default"
      )}
    >
      {!canEdit && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center gap-1.5 pointer-events-none">
          <Lock size={14} />
          <span>Modo solo lectura en este canal de pizarra</span>
        </div>
      )}

      {/* Canvas 1: Vector strokes */}
      <canvas ref={strokesCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-10" />

      {/* Canvas 2: Remote cursors (isolated from strokes redraw) */}
      <canvas ref={cursorsCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-[35]" />

      {/* World-Transformed SVG Layer (Connectors + Smart Snap Guides) */}
      <svg className="absolute inset-0 w-full h-full overflow-visible pointer-events-none z-[25]">
        <defs>
          <marker id="wb-arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="context-stroke" />
          </marker>
          <marker id="wb-arrowhead-selected" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#38BDF8" />
          </marker>
        </defs>
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {connectors.map((c) => {
            const fromEl = c.fromId ? elementsMap.get(c.fromId) : null;
            const toEl = c.toId ? elementsMap.get(c.toId) : null;
            const startPos = fromEl && !fromEl.deleted && c.fromSide ? getAnchorPos(fromEl, c.fromSide) : { x: c.x1, y: c.y1 };
            const endPos = toEl && !toEl.deleted && c.toSide ? getAnchorPos(toEl, c.toSide) : { x: c.x2, y: c.y2 };
            const resolvedConn = { ...c, x1: startPos.x, y1: startPos.y, x2: endPos.x, y2: endPos.y };
            const isSel = selectedSet.has(c.id);
            const isLine = c.style?.connectorKind === "line";
            return (
              <path
                key={c.id}
                d={buildSmartConnectorPath(resolvedConn, elementsMap)}
                fill="none"
                stroke={isSel ? "#38BDF8" : c.style?.stroke || "#A1A1AA"}
                strokeWidth={c.style?.strokeWidth || 2.5}
                markerEnd={isLine ? undefined : isSel ? "url(#wb-arrowhead-selected)" : "url(#wb-arrowhead)"}
                className="pointer-events-auto cursor-pointer"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (activeTool === "eraser" && canEdit) {
                    deleteElementsByIds([c.id]);
                  } else if (e.shiftKey) {
                    setSelectedIds((prev) =>
                      prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                    );
                  } else {
                    setSelectedIds([c.id]);
                  }
                }}
              />
            );
          })}
          {draftConnector && (
            <path
              d={buildSmartConnectorPath(
                {
                  ...draftConnector,
                  fromId: interactionRef.current?.fromId || null,
                  fromSide: interactionRef.current?.fromSide || null,
                  style: { connectorKind: draftConnector.kind },
                },
                elementsMap
              )}
              fill="none"
              stroke="#38BDF8"
              strokeWidth={2.5}
              strokeDasharray="5 5"
              markerEnd={draftConnector.kind === "line" ? undefined : "url(#wb-arrowhead-selected)"}
            />
          )}
          {snapGuides.x !== null && (
            <line
              x1={snapGuides.x}
              y1={-50000}
              x2={snapGuides.x}
              y2={50000}
              stroke="#F43F5E"
              strokeWidth={1 / zoom}
              strokeDasharray={`${4 / zoom} ${4 / zoom}`}
            />
          )}
          {snapGuides.y !== null && (
            <line
              x1={-50000}
              y1={snapGuides.y}
              x2={50000}
              y2={snapGuides.y}
              stroke="#F43F5E"
              strokeWidth={1 / zoom}
              strokeDasharray={`${4 / zoom} ${4 / zoom}`}
            />
          )}
        </g>
      </svg>

      {/* World-Transformed HTML Layer */}
      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
        }}
        className="absolute top-0 left-0 z-20 pointer-events-none"
      >
        <div className="pointer-events-auto">
          {visibleElements.map((el) => (
            <WhiteboardElement
              key={el.id}
              el={el}
              isSelected={selectedSet.has(el.id)}
              isEditing={editingId === el.id}
              editingBy={remoteEditing[el.id] || null}
              canEdit={canEdit}
              autoDownload={profile?.general?.autoDownloadFiles ?? true}
              onPointerDown={handleElementPointerDown}
              onDoubleClick={handleElementDoubleClick}
              onTextChange={handleElementTextChange}
              onTableCellChange={handleTableCellChange}
              onFinishEdit={handleFinishEdit}
              onResizeStart={handleResizeStart}
              onRadiusStart={handleRadiusStart}
              onRotateStart={handleRotateStart}
              onConnectStart={handleConnectStart}
            />
          ))}
          {draftShape && (
            <div
              style={{
                position: "absolute",
                left: draftShape.x,
                top: draftShape.y,
                width: Math.max(2, draftShape.w),
                height: Math.max(2, draftShape.h),
              }}
              className={cn(
                "pointer-events-none",
                draftShape.isSection
                  ? "border-2 border-dashed border-sky-400 bg-sky-400/15 rounded-2xl"
                  : draftShape.isText
                    ? "border-2 border-sky-400 bg-sky-400/15 rounded-lg"
                    : "opacity-75"
              )}
            >
              {!draftShape.isSection && !draftShape.isText && (
                <ShapeSvg
                  el={{
                    w: Math.max(4, draftShape.w),
                    h: Math.max(4, draftShape.h),
                    style: {
                      fill: activeColor.fill,
                      stroke: activeColor.stroke,
                      strokeWidth: 2,
                      shapeKind: activeShapeKind,
                      borderRadius: 0,
                    },
                  }}
                />
              )}
            </div>
          )}
          {marqueeBox && (
            <div
              style={{
                position: "absolute",
                left: marqueeBox.x,
                top: marqueeBox.y,
                width: marqueeBox.w,
                height: marqueeBox.h,
              }}
              className="border border-sky-400 bg-sky-400/15 pointer-events-none z-40"
            />
          )}
        </div>
      </div>

      {/* Contextual Floating Bar */}
      <WhiteboardContextBar
        contextBarPos={contextBarPos}
        canvasWidth={canvasSize.w}
        canEdit={canEdit}
        commonProps={commonProps}
        selectedElements={selectedElements}
        selectedElement={selectedElement}
        contextShapeOpen={contextShapeOpen}
        setContextShapeOpen={setContextShapeOpen}
        contextColorOpen={contextColorOpen}
        setContextColorOpen={setContextColorOpen}
        contextAlignOpen={contextAlignOpen}
        setContextAlignOpen={setContextAlignOpen}
        upsertBatch={upsertBatch}
        onModifyTable={handleModifyTable}
        onBringToFront={bringToFrontSelected}
        onSendToBack={sendToBackSelected}
        onToggleLock={toggleLockSelected}
        onGroup={groupSelectedElements}
        onUngroup={ungroupSelectedElements}
        onAlign={handleAlignSelected}
        onDistribute={handleDistributeSelected}
        onDeleteSelected={deleteSelectedElements}
        onExportSection={handleExportSection}
        onExportSelection={handleExportSelection}
        setSelectedIds={setSelectedIds}
      />

      {/* Bottom Floating Toolbar */}
      <WhiteboardToolbar
        canEdit={canEdit}
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        penColor={penColor}
        setPenColor={setPenColor}
        penWidth={penWidth}
        setPenWidth={setPenWidth}
        isHighlighter={isHighlighter}
        setIsHighlighter={setIsHighlighter}
        activeColor={activeColor}
        setActiveColor={setActiveColor}
        activeShapeKind={activeShapeKind}
        setActiveShapeKind={setActiveShapeKind}
        activeConnectorKind={activeConnectorKind}
        setActiveConnectorKind={setActiveConnectorKind}
        setActiveStamp={setActiveStamp}
        setActiveSticker={setActiveSticker}
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
        getShortcutLabel={getShortcutLabel}
        undoDisabled={undoStack.length === 0}
        redoDisabled={redoStack.length === 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        zoom={zoom}
        setZoom={setZoom}
        setPan={setPan}
        onExportBoard={handleExportBoard}
        onClearBoard={() => {
          if (!canEdit) return;
          clearBoard();
          setSelectedIds([]);
          setEditingId(null);
        }}
      />
    </div>
  );
}
