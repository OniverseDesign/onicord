import React from "react";
import { cn } from "../../lib/cn";

const DEFAULT_LEVEL_SIZES = {
  1: "xl",
  2: "lg",
  3: "base",
  4: "sm",
  5: "sm",
  6: "xs",
};

const SIZE_CLASSES = {
  "3xl": "text-3xl font-extrabold tracking-tight",
  "2xl": "text-2xl font-bold tracking-tight",
  xl: "text-xl font-bold tracking-wide",
  lg: "text-lg font-bold",
  base: "text-base font-semibold",
  sm: "text-sm font-semibold",
  xs: "text-xs font-bold uppercase tracking-wider",
};

const COLOR_CLASSES = {
  default: "text-onicord-text",
  subtext: "text-onicord-subtext",
  muted: "text-onicord-muted",
  accent: "text-onicord-accent",
  danger: "text-onicord-danger",
  success: "text-onicord-success",
  white: "text-white",
};

/**
 * Componente de encabezado semántico y accesible para Onicord.
 * Permite desacoplar el rol semántico (h1..h6) de su tamaño visual (size).
 */
export default function Heading({
  level = 2,
  size,
  color = "default",
  truncate = false,
  className = "",
  children,
  ...props
}) {
  const safeLevel = Math.min(Math.max(Number(level) || 2, 1), 6);
  const Tag = `h${safeLevel}`;

  const resolvedSize = size || DEFAULT_LEVEL_SIZES[safeLevel] || "base";
  const sizeClass = SIZE_CLASSES[resolvedSize] || SIZE_CLASSES.base;
  const colorClass = COLOR_CLASSES[color] || COLOR_CLASSES.default;

  return (
    <Tag
      className={cn(
        sizeClass,
        colorClass,
        truncate && "truncate",
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
