import { GRID_COLS, DEFAULT_CONSTRAINTS, clampGeo } from "./bentoTypes";

export function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function cloneLayout(layout) {
  const copy = {};
  if (!layout) return copy;
  Object.keys(layout).forEach((key) => {
    const g = layout[key];
    if (g) {
      copy[key] = { x: g.x, y: g.y, w: g.w, h: g.h };
    }
  });
  return copy;
}

export function layoutsEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => {
    const ga = a[k];
    const gb = b[k];
    return gb && ga.x === gb.x && ga.y === gb.y && ga.w === gb.w && ga.h === gb.h;
  });
}

function sortKeysByPosition(layout, keys) {
  return [...keys].sort((a, b) => {
    const ga = layout[a];
    const gb = layout[b];
    if (ga.y !== gb.y) return ga.y - gb.y;
    return ga.x - gb.x;
  });
}

export function pushDownCascading(layout, anchorKeys = []) {
  const draft = cloneLayout(layout);
  const anchorSet = new Set(anchorKeys);
  const maxIterations = 80;

  for (let iter = 0; iter < maxIterations; iter++) {
    let moved = false;
    const ordered = sortKeysByPosition(draft, Object.keys(draft));

    for (let i = 0; i < ordered.length; i++) {
      const k1 = ordered[i];
      for (let j = i + 1; j < ordered.length; j++) {
        const k2 = ordered[j];
        const g1 = draft[k1];
        const g2 = draft[k2];
        if (!rectsOverlap(g1, g2)) continue;

        let targetKey = k2;
        let blocker = g1;

        if (anchorSet.has(k2) && !anchorSet.has(k1)) {
          targetKey = k1;
          blocker = g2;
        } else if (anchorSet.has(k1) && anchorSet.has(k2)) {
          // If both are anchors, prefer keeping the first anchorKey passed
          const idx1 = anchorKeys.indexOf(k1);
          const idx2 = anchorKeys.indexOf(k2);
          if (idx2 >= 0 && idx2 < idx1) {
            targetKey = k1;
            blocker = g2;
          }
        }

        const nextY = blocker.y + blocker.h;
        if (draft[targetKey].y < nextY) {
          draft[targetKey] = { ...draft[targetKey], y: nextY };
          moved = true;
        }
      }
    }

    if (!moved) break;
  }

  return draft;
}

export function compactVertical(layout, pinnedKey = null) {
  const draft = cloneLayout(layout);
  const placed = {};

  if (pinnedKey && draft[pinnedKey]) {
    placed[pinnedKey] = { ...draft[pinnedKey] };
  }

  const movableKeys = sortKeysByPosition(
    draft,
    Object.keys(draft).filter((k) => k !== pinnedKey)
  );

  movableKeys.forEach((key) => {
    const g = { ...draft[key] };
    while (g.y > 1) {
      const candidate = { ...g, y: g.y - 1 };
      const collides = Object.values(placed).some((other) => rectsOverlap(candidate, other));
      if (collides) break;
      g.y -= 1;
    }
    placed[key] = g;
  });

  return placed;
}

export function resolveDrag(initialLayout, activeKey, targetX, targetY, constraintsMap = {}) {
  if (!initialLayout || typeof initialLayout !== "object") return {};
  const draft = cloneLayout(initialLayout);
  const origA = initialLayout[activeKey];
  if (!origA) return draft;

  const nextA = clampGeo(
    { ...origA, x: targetX, y: targetY },
    constraintsMap[activeKey] || DEFAULT_CONSTRAINTS
  );

  const centerX = nextA.x + nextA.w / 2;
  const centerY = nextA.y + nextA.h / 2;

  // Smart Swap: find neighbor under active widget's center in initialLayout
  let swapKey = null;
  for (const key of Object.keys(initialLayout)) {
    if (key === activeKey) continue;
    const origB = initialLayout[key];
    if (
      centerX >= origB.x &&
      centerX <= origB.x + origB.w &&
      centerY >= origB.y &&
      centerY <= origB.y + origB.h
    ) {
      const candidateB = {
        x: origA.x,
        y: origA.y,
        w: origB.w,
        h: origB.h,
      };
      const fitsGrid =
        candidateB.x >= 1 &&
        candidateB.x + candidateB.w - 1 <= GRID_COLS &&
        candidateB.y >= 1;

      if (fitsGrid && !rectsOverlap(nextA, candidateB)) {
        swapKey = key;
      }
      break;
    }
  }

  draft[activeKey] = nextA;
  const anchors = [activeKey];

  if (swapKey) {
    const origB = initialLayout[swapKey];
    draft[swapKey] = {
      x: origA.x,
      y: origA.y,
      w: origB.w,
      h: origB.h,
    };
    anchors.push(swapKey);
  }

  const pushed = pushDownCascading(draft, anchors);
  return compactVertical(pushed, activeKey);
}

export function resolveResize(initialLayout, activeKey, nextGeo, direction = "", constraintsMap = {}) {
  if (!initialLayout || typeof initialLayout !== "object") return {};
  const draft = cloneLayout(initialLayout);
  const origA = initialLayout[activeKey];
  if (!origA) return draft;

  const clampedA = clampGeo(nextGeo, constraintsMap[activeKey] || DEFAULT_CONSTRAINTS);
  draft[activeKey] = clampedA;

  const anchors = [activeKey];

  // Edge Split / Neighbor Compress along shared resize borders
  Object.keys(initialLayout).forEach((key) => {
    if (key === activeKey) return;
    const origB = initialLayout[key];
    if (!rectsOverlap(clampedA, origB)) return;

    const cB = constraintsMap[key] || DEFAULT_CONSTRAINTS;
    const minW = cB.minW ?? DEFAULT_CONSTRAINTS.minW;
    const minH = cB.minH ?? DEFAULT_CONSTRAINTS.minH;

    if (direction.includes("e") && origB.x >= origA.x + origA.w) {
      const newX = clampedA.x + clampedA.w;
      const newW = origB.x + origB.w - newX;
      if (newW >= minW && newX + newW - 1 <= GRID_COLS) {
        draft[key] = { ...origB, x: newX, w: newW };
        anchors.push(key);
        return;
      }
    }

    if (direction.includes("w") && origB.x + origB.w <= origA.x) {
      const newW = clampedA.x - origB.x;
      if (newW >= minW) {
        draft[key] = { ...origB, w: newW };
        anchors.push(key);
        return;
      }
    }

    if (direction.includes("s") && origB.y >= origA.y + origA.h) {
      const newY = clampedA.y + clampedA.h;
      const newH = origB.y + origB.h - newY;
      if (newH >= minH) {
        draft[key] = { ...origB, y: newY, h: newH };
        anchors.push(key);
        return;
      }
    }

    if (direction.includes("n") && origB.y + origB.h <= origA.y) {
      const newH = clampedA.y - origB.y;
      if (newH >= minH) {
        draft[key] = { ...origB, h: newH };
        anchors.push(key);
      }
    }
  });

  const pushed = pushDownCascading(draft, anchors);
  return compactVertical(pushed, activeKey);
}

export function findOpenSlot(layout, w = 2, h = 2) {
  const safeW = Math.max(1, Math.min(GRID_COLS, Math.round(w)));
  const safeH = Math.max(1, Math.round(h));

  for (let y = 1; y <= 120; y++) {
    for (let x = 1; x <= GRID_COLS - safeW + 1; x++) {
      const candidate = { x, y, w: safeW, h: safeH };
      const collides = Object.values(layout).some((other) => rectsOverlap(candidate, other));
      if (!collides) return candidate;
    }
  }
  return { x: 1, y: 1, w: safeW, h: safeH };
}

export function getGridMaxRow(layout, minRows = 6) {
  let maxRow = minRows;
  Object.values(layout || {}).forEach((g) => {
    if (g) {
      maxRow = Math.max(maxRow, g.y + g.h - 1);
    }
  });
  return maxRow;
}
