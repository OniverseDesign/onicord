import React from "react";
import {
  Square,
  Circle,
  Diamond,
  Triangle,
  RectangleHorizontal,
  Database,
  MoveUpRight,
  Minus,
  CornerDownRight,
} from "lucide-react";

export const renderShapeIcon = (kind, size = 16) => {
  switch (kind) {
    case "circle":
      return React.createElement(Circle, { size });
    case "diamond":
      return React.createElement(Diamond, { size });
    case "triangle":
      return React.createElement(Triangle, { size });
    case "pill":
      return React.createElement(RectangleHorizontal, { size });
    case "cylinder":
      return React.createElement(Database, { size });
    case "rect":
    default:
      return React.createElement(Square, { size });
  }
};

export const renderConnectorIcon = (kind, size = 16) => {
  switch (kind) {
    case "line":
      return React.createElement(Minus, { size });
    case "elbow":
      return React.createElement(CornerDownRight, { size });
    case "arrow":
    default:
      return React.createElement(MoveUpRight, { size });
  }
};

export const ANCHOR_SIDES = ["top", "right", "bottom", "left"];

export function getAnchorPos(el, side) {
  if (!el) return { x: 0, y: 0 };
  const x = el.x || 0;
  const y = el.y || 0;
  const w = el.w || 0;
  const h = el.h || 0;
  const cx = x + w / 2;
  const cy = y + h / 2;
  let ax = cx;
  let ay = cy;
  if (side === "top") {
    ax = cx;
    ay = y;
  } else if (side === "right") {
    ax = x + w;
    ay = cy;
  } else if (side === "bottom") {
    ax = cx;
    ay = y + h;
  } else if (side === "left") {
    ax = x;
    ay = cy;
  }

  const rot = el.rotation || 0;
  if (!rot) return { x: ax, y: ay };
  const rad = (rot * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = ax - cx;
  const dy = ay - cy;
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}
