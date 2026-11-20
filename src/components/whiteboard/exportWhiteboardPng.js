import { buildSmartConnectorPath } from "./connectorRouting";
import { getMediaUrl } from "../../lib/media";

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, align = "left", baseline = "top") {
  if (!text) return;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  const paragraphs = String(text).split("\n");
  const lines = [];
  for (const para of paragraphs) {
    const words = para.split(" ");
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    lines.push(current);
  }
  const totalH = lines.length * lineHeight;
  let startY = baseline === "middle" ? y - totalH / 2 + lineHeight / 2 : y;
  for (const line of lines) {
    ctx.fillText(line, x, startY);
    startY += lineHeight;
  }
}

function drawRoundedPolygon(ctx, pts, radius) {
  if (pts.length < 3) return;
  ctx.beginPath();
  if (!radius || radius <= 0.5) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    return;
  }
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    const l1 = Math.hypot(v1.x, v1.y) || 1;
    const l2 = Math.hypot(v2.x, v2.y) || 1;
    const u1 = { x: v1.x / l1, y: v1.y / l1 };
    const u2 = { x: v2.x / l2, y: v2.y / l2 };
    const dot = Math.max(-0.9999, Math.min(0.9999, u1.x * u2.x + u1.y * u2.y));
    const angle = Math.acos(dot);
    const tanHalf = Math.tan(angle / 2) || 0.001;
    const tangentDist = Math.min(Math.min(l1, l2) * 0.45, radius / tanHalf);
    const arcR = Math.max(0.5, tangentDist * tanHalf);
    const p1 = { x: curr.x + u1.x * tangentDist, y: curr.y + u1.y * tangentDist };
    const p2 = { x: curr.x + u2.x * tangentDist, y: curr.y + u2.y * tangentDist };
    if (i === 0) ctx.moveTo(p1.x, p1.y);
    else ctx.lineTo(p1.x, p1.y);
    ctx.arcTo(curr.x, curr.y, p2.x, p2.y, arcR);
  }
  ctx.closePath();
}

async function resolveImageBitmap(el) {
  let url = el.thumbnail || null;
  try {
    if (el.type === "image" && el.fileId && el.roomCode && window.electronAPI) {
      let localPath = await window.electronAPI.fetchUploadedLocalPath?.(el.roomCode, el.fileId);
      if (!localPath) {
        localPath = await window.electronAPI.fetchMediaLocalPath?.(el.fileId, el.roomCode);
      }
      if (localPath) url = getMediaUrl(localPath);
    } else if (el.type === "sticker" && el.stickerId && window.electronAPI?.getStickerPath) {
      const cached = await window.electronAPI.getStickerPath(el.stickerId);
      if (cached) url = getMediaUrl(cached);
    }
  } catch {
    // fallback
  }
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function getBounds(elements, getAnchorPos, allElementsMap) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    if (!el || el.deleted) continue;
    if (el.type === "stroke" && el.w === undefined) {
      for (const p of el.points || []) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    } else if (el.type === "connector") {
      const fromEl = el.fromId ? allElementsMap.get(el.fromId) : null;
      const toEl = el.toId ? allElementsMap.get(el.toId) : null;
      const p1 = fromEl && !fromEl.deleted && el.fromSide ? getAnchorPos(fromEl, el.fromSide) : { x: el.x1 || 0, y: el.y1 || 0 };
      const p2 = toEl && !toEl.deleted && el.toSide ? getAnchorPos(toEl, el.toSide) : { x: el.x2 || 0, y: el.y2 || 0 };
      minX = Math.min(minX, p1.x, p2.x);
      minY = Math.min(minY, p1.y, p2.y);
      maxX = Math.max(maxX, p1.x, p2.x);
      maxY = Math.max(maxY, p1.y, p2.y);
    } else {
      minX = Math.min(minX, el.x || 0);
      minY = Math.min(minY, el.y || 0);
      maxX = Math.max(maxX, (el.x || 0) + (el.w || 0));
      maxY = Math.max(maxY, (el.y || 0) + (el.h || 0));
    }
  }
  if (!isFinite(minX)) return { x: 0, y: 0, w: 800, h: 600 };
  const pad = 40;
  return {
    x: minX - pad,
    y: minY - pad,
    w: Math.max(120, maxX - minX + pad * 2),
    h: Math.max(120, maxY - minY + pad * 2),
  };
}

export async function exportElementsToPng({
  elements,
  allElementsMap,
  getAnchorPos,
  filename = "pizarra",
}) {
  if (!elements || elements.length === 0) return;

  const bounds = getBounds(elements, getAnchorPos, allElementsMap);
  const scale = 2; // HiDPI 2x
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(8192, Math.ceil(bounds.w * scale));
  canvas.height = Math.min(8192, Math.ceil(bounds.h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const effScale = Math.min(scale, canvas.width / bounds.w, canvas.height / bounds.h);
  ctx.scale(effScale, effScale);

  // Background + dot grid
  ctx.fillStyle = "#111214";
  ctx.fillRect(0, 0, bounds.w, bounds.h);

  ctx.save();
  ctx.translate(-bounds.x, -bounds.y);

  ctx.fillStyle = "rgba(255,255,255,0.14)";
  const startGx = Math.floor(bounds.x / 24) * 24;
  const startGy = Math.floor(bounds.y / 24) * 24;
  for (let gx = startGx; gx <= bounds.x + bounds.w; gx += 24) {
    for (let gy = startGy; gy <= bounds.y + bounds.h; gy += 24) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Preload bitmaps for images & stickers
  const bitmaps = new Map();
  await Promise.all(
    elements
      .filter((el) => el.type === "image" || el.type === "sticker")
      .map(async (el) => {
        const bmp = await resolveImageBitmap(el);
        if (bmp) bitmaps.set(el.id, bmp);
      })
  );

  // Sort by zIndex (strokes & sections first, connectors last)
  const nonConn = elements
    .filter((el) => el.type !== "connector" && el.type !== "stroke" && !el.deleted)
    .sort((a, b) => (a.zIndex ?? (a.type === "section" ? 1 : 10)) - (b.zIndex ?? (b.type === "section" ? 1 : 10)));

  // 1. Freehand strokes
  for (const st of elements.filter((el) => el.type === "stroke" && !el.deleted)) {
    const pts = st.points || [];
    if (pts.length === 0) continue;
    ctx.save();
    const w = st.w || 1;
    const h = st.h || 1;
    if (st.rotation && st.w !== undefined) {
      ctx.translate((st.x || 0) + w / 2, (st.y || 0) + h / 2);
      ctx.rotate((st.rotation * Math.PI) / 180);
      ctx.translate(-((st.x || 0) + w / 2), -((st.y || 0) + h / 2));
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = st.style?.stroke || "#FFFFFF";
    ctx.lineWidth = st.style?.strokeWidth || 4;
    if (st.style?.isHighlighter) ctx.globalAlpha = 0.35;
    ctx.beginPath();
    pts.forEach((p, idx) => {
      const px = p.rx !== undefined ? (st.x || 0) + p.rx * w : p.x;
      const py = p.ry !== undefined ? (st.y || 0) + p.ry * h : p.y;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.restore();
  }

  // 2. Objects
  for (const el of nonConn) {
    const x = el.x || 0;
    const y = el.y || 0;
    const w = el.w || 100;
    const h = el.h || 100;
    ctx.save();
    if (el.rotation) {
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-(x + w / 2), -(y + h / 2));
    }

    if (el.type === "section") {
      ctx.strokeStyle = "rgba(255,255,255,0.22)";
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 16);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#F4F4F5";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(el.text || "Sección", x + 8, y - 6);
    } else if (el.type === "sticky") {
      ctx.fillStyle = el.style?.fill || "#FEF08A";
      ctx.strokeStyle = "rgba(0,0,0,0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 12);
      ctx.fill();
      ctx.stroke();
      const isDark = el.style?.fill === "#27272A";
      ctx.fillStyle = isDark ? "#F4F4F5" : "#18181B";
      ctx.font = "500 14px sans-serif";
      drawWrappedText(ctx, el.text || "", x + 12, y + 12, w - 24, 18, "left", "top");
      if (el.authorName) {
        ctx.globalAlpha = 0.5;
        ctx.font = "600 10px sans-serif";
        ctx.fillText(el.authorName, x + 12, y + h - 12);
      }
    } else if (el.type === "shape") {
      const kind = el.style?.shapeKind || "rect";
      const fill = el.style?.fill || "#D8B4FE";
      const stroke = el.style?.stroke || "#6B21A8";
      const sw = el.style?.strokeWidth || 2;
      const rad = Math.min(Math.min(w, h) / 2, el.style?.borderRadius ?? 0);
      ctx.fillStyle = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = sw;
      if (el.style?.strokeStyle === "dashed") ctx.setLineDash([6, 4]);

      if (kind === "circle") {
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, Math.max(1, w / 2 - sw), Math.max(1, h / 2 - sw), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else if (kind === "pill") {
        ctx.beginPath();
        ctx.roundRect(x + sw, y + sw, Math.max(1, w - sw * 2), Math.max(1, h - sw * 2), Math.min(w, h) / 2);
        ctx.fill();
        ctx.stroke();
      } else if (kind === "diamond") {
        drawRoundedPolygon(ctx, [
          { x: x + w / 2, y: y + sw },
          { x: x + w - sw, y: y + h / 2 },
          { x: x + w / 2, y: y + h - sw },
          { x: x + sw, y: y + h / 2 },
        ], rad);
        ctx.fill();
        ctx.stroke();
      } else if (kind === "triangle") {
        drawRoundedPolygon(ctx, [
          { x: x + w / 2, y: y + sw },
          { x: x + w - sw, y: y + h - sw },
          { x: x + sw, y: y + h - sw },
        ], rad);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.roundRect(x + sw, y + sw, Math.max(1, w - sw * 2), Math.max(1, h - sw * 2), rad);
        ctx.fill();
        ctx.stroke();
      }
      ctx.setLineDash([]);
      if (el.text) {
        const isDark = fill === "#27272A";
        ctx.fillStyle = isDark ? "#F4F4F5" : "#18181B";
        ctx.font = "600 14px sans-serif";
        drawWrappedText(ctx, el.text, x + w / 2, y + h / 2, w - 24, 18, "center", "middle");
      }
    } else if (el.type === "text") {
      ctx.fillStyle = el.style?.color || "#F4F4F5";
      ctx.font = `600 ${el.style?.fontSize || 18}px sans-serif`;
      drawWrappedText(ctx, el.text || "", x + 4, y + 4, w - 8, 22, "left", "top");
    } else if (el.type === "stamp") {
      const fz = Math.max(20, Math.round(Math.min(w, h) * 0.72));
      ctx.font = `${fz}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(el.text || "👍", x + w / 2, y + h / 2);
    } else if (el.type === "image" || el.type === "sticker") {
      const bmp = bitmaps.get(el.id);
      if (bmp) {
        const ratio = Math.min(w / (bmp.width || 1), h / (bmp.height || 1));
        const dw = (bmp.width || w) * ratio;
        const dh = (bmp.height || h) * ratio;
        ctx.drawImage(bmp, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      }
    } else if (el.type === "table") {
      const cells = el.cells || [];
      const rows = cells.length || 1;
      const cols = cells[0]?.length || 1;
      const cw = w / cols;
      const ch = h / rows;
      ctx.fillStyle = "#1E1F22";
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 10);
      ctx.fill();
      ctx.stroke();

      for (let r = 0; r < rows; r++) {
        if (r === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.08)";
          ctx.fillRect(x, y, w, ch);
        }
        for (let c = 0; c < cols; c++) {
          ctx.strokeStyle = "rgba(255,255,255,0.1)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + c * cw, y + r * ch, cw, ch);
          ctx.fillStyle = "#FFFFFF";
          ctx.font = r === 0 ? "600 12px sans-serif" : "400 12px sans-serif";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(String(cells[r]?.[c] || ""), x + c * cw + 8, y + r * ch + ch / 2, cw - 16);
        }
      }
    }

    ctx.restore();
  }

  // 3. Connectors on top
  for (const c of elements.filter((el) => el.type === "connector" && !el.deleted)) {
    const fromEl = c.fromId ? allElementsMap.get(c.fromId) : null;
    const toEl = c.toId ? allElementsMap.get(c.toId) : null;
    const p1 = fromEl && !fromEl.deleted && c.fromSide ? getAnchorPos(fromEl, c.fromSide) : { x: c.x1 || 0, y: c.y1 || 0 };
    const p2 = toEl && !toEl.deleted && c.toSide ? getAnchorPos(toEl, c.toSide) : { x: c.x2 || 0, y: c.y2 || 0 };
    const resolved = { ...c, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
    const pathStr = buildSmartConnectorPath(resolved, allElementsMap);
    const p2d = new Path2D(pathStr);
    ctx.save();
    ctx.strokeStyle = c.style?.stroke || "#A1A1AA";
    ctx.lineWidth = c.style?.strokeWidth || 2.5;
    ctx.stroke(p2d);
    if ((c.style?.connectorKind || "arrow") !== "line") {
      // Draw arrowhead at p2
      const angle = c.toSide === "left" ? 0 : c.toSide === "right" ? Math.PI : c.toSide === "top" ? Math.PI / 2 : c.toSide === "bottom" ? -Math.PI / 2 : Math.atan2(p2.y - p1.y, p2.x - p1.x);
      ctx.translate(p2.x, p2.y);
      ctx.rotate(angle);
      ctx.fillStyle = c.style?.stroke || "#A1A1AA";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-10, -4.5);
      ctx.lineTo(-10, 4.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.restore();

  const link = document.createElement("a");
  link.download = `${filename}-${Date.now()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}
