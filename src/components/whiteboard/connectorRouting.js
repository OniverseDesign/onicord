/**
 * FigJam-style smart connector routing (orthogonal 90-degree bends & smooth curves)
 * with obstacle avoidance around shapes/stickies.
 */

function getSideNormal(side) {
  if (side === "top") return { x: 0, y: -1 };
  if (side === "right") return { x: 1, y: 0 };
  if (side === "bottom") return { x: 0, y: 1 };
  if (side === "left") return { x: -1, y: 0 };
  return { x: 0, y: 0 };
}

function segmentIntersectsRect(x1, y1, x2, y2, r) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  if (maxX < r.x || minX > r.x + r.w || maxY < r.y || minY > r.y + r.h) {
    return false;
  }
  // Axis-aligned segments
  if (Math.abs(x1 - x2) < 0.5 || Math.abs(y1 - y2) < 0.5) {
    return true;
  }
  // Diagonal sample check
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = x1 + (x2 - x1) * t;
    const py = y1 + (y2 - y1) * t;
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) {
      return true;
    }
  }
  return false;
}

function buildOrthogonalPoints(x1, y1, x2, y2, fromSide, toSide, obstacles) {
  const stub = 26;
  const n1 = getSideNormal(fromSide);
  const n2 = getSideNormal(toSide);

  const sx = x1 + n1.x * stub;
  const sy = y1 + n1.y * stub;
  const ex = x2 + n2.x * stub;
  const ey = y2 + n2.y * stub;

  // Candidate 1: horizontal-first midX
  const midX = (sx + ex) / 2;
  const cand1 = [
    { x: x1, y: y1 },
    { x: sx, y: sy },
    { x: midX, y: sy },
    { x: midX, y: ey },
    { x: ex, y: ey },
    { x: x2, y: y2 },
  ];

  // Candidate 2: vertical-first midY
  const midY = (sy + ey) / 2;
  const cand2 = [
    { x: x1, y: y1 },
    { x: sx, y: sy },
    { x: sx, y: midY },
    { x: ex, y: midY },
    { x: ex, y: ey },
    { x: x2, y: y2 },
  ];

  const countHits = (pts) => {
    let hits = 0;
    for (let i = 1; i < pts.length - 2; i++) {
      for (const ob of obstacles) {
        if (segmentIntersectsRect(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, ob)) {
          hits++;
        }
      }
    }
    return hits;
  };

  const preferHFirst =
    fromSide === "left" || fromSide === "right" || (!fromSide && Math.abs(ex - sx) >= Math.abs(ey - sy));
  const primary = preferHFirst ? cand1 : cand2;
  const secondary = preferHFirst ? cand2 : cand1;

  if (countHits(primary) === 0) return primary;
  if (countHits(secondary) === 0) return secondary;

  // Detour around the first blocking obstacle
  const blocker = obstacles.find((ob) => {
    for (let i = 1; i < primary.length - 2; i++) {
      if (segmentIntersectsRect(primary[i].x, primary[i].y, primary[i + 1].x, primary[i + 1].y, ob)) {
        return true;
      }
    }
    return false;
  });

  if (!blocker) return primary;

  const pad = 20;
  const topY = blocker.y - pad;
  const botY = blocker.y + blocker.h + pad;
  const leftX = blocker.x - pad;
  const rightX = blocker.x + blocker.w + pad;

  const detours = [
    [
      { x: x1, y: y1 },
      { x: sx, y: sy },
      { x: sx, y: topY },
      { x: ex, y: topY },
      { x: ex, y: ey },
      { x: x2, y: y2 },
    ],
    [
      { x: x1, y: y1 },
      { x: sx, y: sy },
      { x: sx, y: botY },
      { x: ex, y: botY },
      { x: ex, y: ey },
      { x: x2, y: y2 },
    ],
    [
      { x: x1, y: y1 },
      { x: sx, y: sy },
      { x: leftX, y: sy },
      { x: leftX, y: ey },
      { x: ex, y: ey },
      { x: x2, y: y2 },
    ],
    [
      { x: x1, y: y1 },
      { x: sx, y: sy },
      { x: rightX, y: sy },
      { x: rightX, y: ey },
      { x: ex, y: ey },
      { x: x2, y: y2 },
    ],
  ];

  let best = primary;
  let bestScore = Infinity;
  for (const d of detours) {
    const hits = countHits(d);
    let len = 0;
    for (let i = 0; i < d.length - 1; i++) {
      len += Math.hypot(d[i + 1].x - d[i].x, d[i + 1].y - d[i].y);
    }
    const score = hits * 100000 + len;
    if (score < bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

function pointsToRoundedOrthoSvg(pts, cornerRadius = 8) {
  if (pts.length < 2) return "";
  // Deduplicate consecutive identical points
  const clean = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = clean[clean.length - 1];
    if (Math.hypot(pts[i].x - prev.x, pts[i].y - prev.y) > 0.5) {
      clean.push(pts[i]);
    }
  }
  if (clean.length < 2) return "";
  if (clean.length === 2) {
    return `M ${clean[0].x} ${clean[0].y} L ${clean[1].x} ${clean[1].y}`;
  }

  let d = `M ${clean[0].x} ${clean[0].y} `;
  for (let i = 1; i < clean.length - 1; i++) {
    const prev = clean[i - 1];
    const curr = clean[i];
    const next = clean[i + 1];
    const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    const l1 = Math.hypot(v1.x, v1.y);
    const l2 = Math.hypot(v2.x, v2.y);
    const r = Math.min(cornerRadius, l1 * 0.4, l2 * 0.4);
    const p1 = { x: curr.x + (v1.x / l1) * r, y: curr.y + (v1.y / l1) * r };
    const p2 = { x: curr.x + (v2.x / l2) * r, y: curr.y + (v2.y / l2) * r };
    d += `L ${p1.x} ${p1.y} Q ${curr.x} ${curr.y} ${p2.x} ${p2.y} `;
  }
  const last = clean[clean.length - 1];
  d += `L ${last.x} ${last.y}`;
  return d;
}

export function buildSmartConnectorPath(c, elementsMap) {
  const { x1, y1, x2, y2, fromId, toId, fromSide, toSide } = c;
  const kind = c.style?.connectorKind || "arrow";

  // Collect obstacles (shapes, stickies & images).
  // For endpoints (fromId/toId), shrink box slightly inward (-2px) so outward stubs on facing edges
  // are not flagged, while any path cutting THROUGH either connected shape IS flagged and routed around.
  const obstacles = [];
  if (elementsMap) {
    elementsMap.forEach((el) => {
      if (
        !el ||
        el.deleted ||
        (el.type !== "shape" &&
          el.type !== "sticky" &&
          el.type !== "image" &&
          el.type !== "table")
      ) {
        return;
      }
      const isEndpoint = el.id === fromId || el.id === toId;
      const pad = isEndpoint ? -2 : 8;
      obstacles.push({
        x: (el.x || 0) - pad,
        y: (el.y || 0) - pad,
        w: Math.max(2, (el.w || 0) + pad * 2),
        h: Math.max(2, (el.h || 0) + pad * 2),
      });
    });
  }

  const directBlocked = obstacles.some((ob) =>
    segmentIntersectsRect(x1, y1, x2, y2, ob)
  );

  if (kind === "elbow") {
    if (!directBlocked) {
      const n1 = getSideNormal(fromSide);
      const n2 = getSideNormal(toSide);
      const dist = Math.max(40, Math.hypot(x2 - x1, y2 - y1) * 0.4);
      const c1x = fromSide ? x1 + n1.x * dist : (x1 + x2) / 2;
      const c1y = fromSide ? y1 + n1.y * dist : y1;
      const c2x = toSide ? x2 + n2.x * dist : (x1 + x2) / 2;
      const c2y = toSide ? y2 + n2.y * dist : y2;
      return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
    }
    // Curved detour around obstacle using smooth quadratic spline
    const pts = buildOrthogonalPoints(x1, y1, x2, y2, fromSide, toSide, obstacles);
    return pointsToRoundedOrthoSvg(pts, 40);
  }

  // Straight / Arrow: if direct path is clear and no anchor normals force a bend, keep straight;
  // if blocked by an obstacle (or connected to sides), bend in 90-degree FigJam angles!
  if (!directBlocked && !fromSide && !toSide) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }
  if (!directBlocked && fromSide && toSide) {
    // Straight if roughly aligned and no obstacle
    const pts = buildOrthogonalPoints(x1, y1, x2, y2, fromSide, toSide, obstacles);
    return pointsToRoundedOrthoSvg(pts, 8);
  }
  const pts = buildOrthogonalPoints(x1, y1, x2, y2, fromSide, toSide, obstacles);
  return pointsToRoundedOrthoSvg(pts, 8);
}
