import { clampGeo, DEFAULT_CONSTRAINTS, GRID_COLS } from "./bentoTypes";
import { cloneLayout, compactVertical, findOpenSlot, pushDownCascading } from "./collisionSolver";
import { DEFAULT_V2_LAYOUT } from "./layoutPresets";

export const V2_LAYOUT_STORAGE_KEY = "onicord_dashboard_v2_layout";
export const V2_STYLES_STORAGE_KEY = "onicord_dashboard_v2_styles";
export const V2_HIDDEN_STORAGE_KEY = "onicord_dashboard_v2_hidden";
export const V2_GRID_META_KEY = "onicord_dashboard_v2_grid_cols";

function safeParseJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function buildConstraintsMap(configs = []) {
  const map = {};
  configs.forEach((cfg) => {
    map[cfg.id] = {
      minW: cfg.minW ?? DEFAULT_CONSTRAINTS.minW,
      minH: cfg.minH ?? DEFAULT_CONSTRAINTS.minH,
      maxW: cfg.maxW ?? DEFAULT_CONSTRAINTS.maxW,
      maxH: cfg.maxH ?? DEFAULT_CONSTRAINTS.maxH,
    };
  });
  return map;
}

export function loadV2State(configs = []) {
  const savedLayout = safeParseJson(V2_LAYOUT_STORAGE_KEY, null);
  const savedStyles = safeParseJson(V2_STYLES_STORAGE_KEY, {});
  const savedHidden = safeParseJson(V2_HIDDEN_STORAGE_KEY, []);

  const hiddenSet = new Set(Array.isArray(savedHidden) ? savedHidden : []);
  const constraintsMap = buildConstraintsMap(configs);

  let layout = {};
  const hasSavedLayout = Boolean(savedLayout && typeof savedLayout === "object");
  let savedCols = null;
  try {
    savedCols = localStorage.getItem(V2_GRID_META_KEY);
  } catch {}
  const needsScaleMigration = hasSavedLayout && savedCols === "24";

  let sourceLayout = hasSavedLayout ? savedLayout : DEFAULT_V2_LAYOUT;
  if (needsScaleMigration) {
    const migrated = {};
    Object.keys(savedLayout).forEach((key) => {
      const g = savedLayout[key];
      if (!g || typeof g !== "object") return;
      migrated[key] = {
        x: Math.floor((Math.max(1, Number(g.x) || 1) - 1) / 2) + 1,
        y: Math.floor((Math.max(1, Number(g.y) || 1) - 1) / 2) + 1,
        w: Math.max(1, Math.round((Number(g.w) || 2) / 2)),
        h: Math.max(1, Math.round((Number(g.h) || 2) / 2)),
      };
    });
    sourceLayout = migrated;
  }

  configs.forEach((cfg) => {
    if (hiddenSet.has(cfg.id)) return;
    const candidate = sourceLayout[cfg.id] || cfg.defaultGeo || DEFAULT_V2_LAYOUT[cfg.id];
    if (candidate) {
      layout[cfg.id] = clampGeo(candidate, constraintsMap[cfg.id]);
    }
  });

  // Resolve any overlaps cleanly first
  layout = pushDownCascading(layout);

  // Place any newly discovered widgets (e.g. plugins) that were not in sourceLayout
  configs.forEach((cfg) => {
    if (hiddenSet.has(cfg.id) || layout[cfg.id]) return;
    const baseGeo = clampGeo(cfg.defaultGeo || { x: 1, y: 1, w: 3, h: 3 }, constraintsMap[cfg.id]);
    layout[cfg.id] = findOpenSlot(layout, baseGeo.w, baseGeo.h);
  });

  layout = compactVertical(layout);

  if (needsScaleMigration) {
    saveV2Layout(layout);
  }

  const styles = {};
  if (savedStyles && typeof savedStyles === "object") {
    Object.keys(savedStyles).forEach((k) => {
      if (typeof savedStyles[k] === "string") {
        styles[k] = savedStyles[k];
      }
    });
  }

  return {
    layout,
    styles,
    hiddenIds: Array.from(hiddenSet),
  };
}

export function saveV2Layout(layout) {
  try {
    localStorage.setItem(V2_LAYOUT_STORAGE_KEY, JSON.stringify(cloneLayout(layout)));
    localStorage.setItem(V2_GRID_META_KEY, String(GRID_COLS));
  } catch {}
}

export function saveV2Styles(styles) {
  try {
    localStorage.setItem(V2_STYLES_STORAGE_KEY, JSON.stringify(styles || {}));
  } catch {}
}

export function saveV2Hidden(hiddenIds) {
  try {
    localStorage.setItem(V2_HIDDEN_STORAGE_KEY, JSON.stringify(Array.isArray(hiddenIds) ? hiddenIds : []));
  } catch {}
}

export function resetV2All() {
  try {
    localStorage.removeItem(V2_LAYOUT_STORAGE_KEY);
    localStorage.removeItem(V2_STYLES_STORAGE_KEY);
    localStorage.removeItem(V2_HIDDEN_STORAGE_KEY);
    localStorage.removeItem(V2_GRID_META_KEY);
  } catch {}
}
