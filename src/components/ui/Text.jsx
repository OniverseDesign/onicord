import React from "react";
import { cn } from "../../lib/cn";

const VARIANT_CLASSES = {
  "2xs": "text-2xs",
  badge: "text-2xs font-bold uppercase tracking-wider",
  xs: "text-xs",
  caption: "text-xs text-onicord-muted",
  sm: "text-sm",
  ui: "text-sm font-medium",
  base: "text-base",
  body: "text-base text-onicord-subtext",
  lg: "text-lg",
};

const COLOR_CLASSES = {
  default: "text-onicord-text",
  subtext: "text-onicord-subtext",
  muted: "text-onicord-muted",
  accent: "text-onicord-accent",
  danger: "text-onicord-danger",
  success: "text-onicord-success",
  white: "text-white",
  dark: "text-onicord-dark",
};

const WEIGHT_CLASSES = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
  black: "font-black",
};

/**
 * Componente polimórfico de texto centralizado para Onicord.
 */
export default function Text({
  as = "p",
  variant = "base",
  color,
  weight,
  mono = false,
  uppercase = false,
  truncate = false,
  className = "",
  children,
  ...props
}) {
  const Tag = as;

  const variantClass = VARIANT_CLASSES[variant] || VARIANT_CLASSES.base;
  const colorClass = color ? COLOR_CLASSES[color] || "" : "";
  const weightClass = weight ? WEIGHT_CLASSES[weight] || "" : "";

  return (
    <Tag
      className={cn(
        variantClass,
        colorClass,
        weightClass,
        mono && "font-mono font-tabular",
        uppercase && "uppercase tracking-wider",
        truncate && "truncate",
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}
