export const GRID_COLS = 12;
export const MIN_VISIBLE_ROWS = 6;
export const GRID_GAP_PX = 10;

export const DEFAULT_CONSTRAINTS = {
  minW: 1,
  minH: 1,
  maxW: 12,
  maxH: 8,
};

export const SURFACE_OPTIONS = [
  { id: "dark", label: "Obsidian", swatchClass: "bg-onicord-base border-onicord-border-strong", isDarkSurface: true },
  { id: "accent", label: "Accent", swatchClass: "bg-onicord-accent", isDarkSurface: false },
  { id: "pink", label: "Pink", swatchClass: "bg-onicord-pink", isDarkSurface: false },
  { id: "sky", label: "Sky", swatchClass: "bg-onicord-sky", isDarkSurface: false },
  { id: "sapphire", label: "Sapphire", swatchClass: "bg-onicord-sapphire", isDarkSurface: false },
  { id: "success", label: "Green", swatchClass: "bg-onicord-success", isDarkSurface: false },
  { id: "peach", label: "Peach", swatchClass: "bg-onicord-peach", isDarkSurface: false },
  { id: "yellow", label: "Yellow", swatchClass: "bg-onicord-yellow", isDarkSurface: false },
  { id: "mauve", label: "Mauve", swatchClass: "bg-onicord-mauve", isDarkSurface: false },
  { id: "teal", label: "Teal", swatchClass: "bg-onicord-teal", isDarkSurface: false },
  { id: "rosewater", label: "Rosewater", swatchClass: "bg-onicord-rosewater", isDarkSurface: false },
];

export function isDarkSurfaceId(surfaceId) {
  return !surfaceId || surfaceId === "dark";
}

export function clampGeo(geo, constraints = DEFAULT_CONSTRAINTS) {
  const minW = Math.max(1, Math.min(GRID_COLS, constraints?.minW ?? DEFAULT_CONSTRAINTS.minW));
  const minH = Math.max(1, constraints?.minH ?? DEFAULT_CONSTRAINTS.minH);
  const maxW = Math.max(minW, Math.min(GRID_COLS, constraints?.maxW ?? DEFAULT_CONSTRAINTS.maxW));
  const maxH = Math.max(minH, constraints?.maxH ?? DEFAULT_CONSTRAINTS.maxH);

  const w = Math.round(Math.max(minW, Math.min(maxW, geo?.w ?? minW)));
  const h = Math.round(Math.max(minH, Math.min(maxH, geo?.h ?? minH)));
  const x = Math.round(Math.max(1, Math.min(GRID_COLS - w + 1, geo?.x ?? 1)));
  const y = Math.round(Math.max(1, geo?.y ?? 1));

  return { x, y, w, h };
}

export function computeSizeMode(cols, rows, widthPx = 0, heightPx = 0) {
  const safeCols = Math.max(1, cols || 1);
  const safeRows = Math.max(1, rows || 1);
  const area = safeCols * safeRows;
  const aspectRatio = heightPx > 0 ? widthPx / heightPx : safeCols / safeRows;

  if (area <= 2) return "micro";
  if ((safeRows === 1 && safeCols >= 3) || (aspectRatio >= 1.85 && safeRows <= 2)) {
    return "strip";
  }
  if ((safeCols === 1 && safeRows >= 3) || (aspectRatio <= 0.62 && safeCols <= 2)) {
    return "pillar";
  }
  if (area <= 6) return "compact";
  if (area >= 15) return "expanded";
  return "standard";
}
