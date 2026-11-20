export const WB_COLORS = [
  { id: "lavender", fill: "#D8B4FE", stroke: "#6B21A8", label: "Lavanda" },
  { id: "yellow", fill: "#FEF08A", stroke: "#854D0E", label: "Amarillo" },
  { id: "coral", fill: "#FCA5A5", stroke: "#991B1B", label: "Coral" },
  { id: "mint", fill: "#86EFAC", stroke: "#166534", label: "Menta" },
  { id: "sky", fill: "#7DD3FC", stroke: "#075985", label: "Cielo" },
  { id: "peach", fill: "#FDBA74", stroke: "#9A3412", label: "Durazno" },
  { id: "white", fill: "#F4F4F5", stroke: "#3F3F46", label: "Blanco" },
  { id: "slate", fill: "#27272A", stroke: "#71717A", label: "Oscuro" },
];

export const WB_PEN_COLORS = [
  "#FFFFFF",
  "#38BDF8",
  "#A78BFA",
  "#F472B6",
  "#FACC15",
  "#4ADE80",
  "#FB923C",
  "#EF4444",
];

export const WB_SHAPES = [
  { kind: "rect", label: "Rectángulo", icon: "crop_square" },
  { kind: "circle", label: "Círculo", icon: "circle" },
  { kind: "diamond", label: "Rombo", icon: "diamond" },
  { kind: "triangle", label: "Triángulo", icon: "change_history" },
  { kind: "pill", label: "Cápsula", icon: "rounded_corner" },
  { kind: "cylinder", label: "Base de datos", icon: "database" },
];

export const WB_CONNECTORS = [
  { kind: "arrow", label: "Flecha recta", icon: "north_east" },
  { kind: "line", label: "Línea recta", icon: "horizontal_rule" },
  { kind: "elbow", label: "Conector curvo", icon: "turn_right" },
];

export const WB_STAMPS = ["👍", "❤️", "🔥", "🎉", "⭐", "👀"];

/**
 * Deterministic per-user color theme from WB_COLORS (excluding white/slate)
 */
export function getUserColorTheme(userId) {
  const palette = WB_COLORS.filter((c) => c.id !== "white" && c.id !== "slate");
  if (!userId) return palette[0];
  let hash = 0;
  const str = String(userId);
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return palette[hash % palette.length];
}

export const WB_BRUSH_WIDTHS = [
  { value: 2, label: "Fino" },
  { value: 4, label: "Normal" },
  { value: 8, label: "Grueso" },
  { value: 18, label: "Resaltador", isHighlighter: true },
];

export function createWbId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `wb_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function screenToWorld(clientX, clientY, rect, pan, zoom) {
  return {
    x: (clientX - rect.left - pan.x) / zoom,
    y: (clientY - rect.top - pan.y) / zoom,
  };
}

export function worldToScreen(wx, wy, pan, zoom) {
  return {
    x: wx * zoom + pan.x,
    y: wy * zoom + pan.y,
  };
}

/**
 * Computes distance from point (px, py) to segment (x1, y1)-(x2, y2)
 */
export function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Merges remote whiteboard element map with local elements using LWW (updatedAt).
 */
export function mergeWhiteboardElements(localMap, remoteList) {
  if (!Array.isArray(remoteList) || remoteList.length === 0) return localMap;
  const next = new Map(localMap);
  let changed = false;
  for (const item of remoteList) {
    if (!item || !item.id) continue;
    const existing = next.get(item.id);
    if (!existing || (item.updatedAt || 0) >= (existing.updatedAt || 0)) {
      next.set(item.id, item);
      changed = true;
    }
  }
  return changed ? next : localMap;
}
