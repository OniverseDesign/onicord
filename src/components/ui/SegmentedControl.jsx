import React from "react";
import { cn } from "../../lib/cn";
import MaterialIcon from "../icons/MaterialIcon";
import { soundEngine } from "../../lib/soundEngine";

const GRID_COLS_CLASS = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

/**
 * Reusable segmented control primitive styled with `.onicord-segmented*` tokens.
 */
export default function SegmentedControl({
  options = [],
  value,
  onChange,
  fullWidth = true,
  size = "md",
  role = "radiogroup",
  disabled = false,
  playSound = false,
  ariaLabel,
  className = "",
  itemClassName = "",
}) {
  const isTablist = role === "tablist";
  const itemRole = isTablist ? "tab" : "radio";

  const containerStyle =
    fullWidth && options.length > 6
      ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }
      : undefined;

  const getSizeClass = (hasLabel) => {
    if (!hasLabel) {
      if (size === "xs") return "h-6 w-6 p-0";
      if (size === "sm") return "h-[30px] w-8 p-0";
      return "h-8 w-8 p-0";
    }
    if (size === "xs") return "py-1 px-2";
    if (size === "sm") return fullWidth ? "py-1.5 px-2" : "py-1.5 px-3";
    return fullWidth ? "py-2 px-2" : "py-2 px-3";
  };

  const getIconSize = (opt, hasLabel) => {
    if (opt.iconSize !== undefined) return opt.iconSize;
    if (hasLabel || size === "xs") return 14;
    return 16;
  };

  return (
    <div
      role={role}
      aria-label={ariaLabel}
      style={containerStyle}
      className={cn(
        "onicord-segmented",
        fullWidth
          ? cn("grid w-full", GRID_COLS_CLASS[options.length])
          : "inline-flex items-center",
        className
      )}
    >
      {options.map((opt) => {
        const optValue = opt.value !== undefined ? opt.value : opt.id;
        const isActive = optValue === value;
        const isDisabled = Boolean(disabled || opt.disabled);
        const hasLabel =
          opt.label !== undefined && opt.label !== null && opt.label !== "";
        const resolvedIconSize = getIconSize(opt, hasLabel);

        return (
          <button
            key={String(optValue)}
            type="button"
            role={itemRole}
            aria-checked={!isTablist ? isActive : undefined}
            aria-selected={isTablist ? isActive : undefined}
            aria-label={opt.ariaLabel}
            title={opt.title}
            disabled={isDisabled}
            onClick={() => {
              if (isDisabled) return;
              if (playSound && !isActive) {
                soundEngine.playNav?.("select");
              }
              onChange?.(optValue, opt);
            }}
            className={cn(
              "onicord-segmented-item",
              getSizeClass(hasLabel),
              isActive
                ? "onicord-segmented-item-active"
                : "onicord-segmented-item-inactive",
              itemClassName
            )}
          >
            {opt.icon &&
              (typeof opt.icon === "string" ? (
                <MaterialIcon
                  name={opt.icon}
                  size={resolvedIconSize}
                  className="shrink-0"
                />
              ) : (
                opt.icon
              ))}
            {hasLabel && <span className="truncate">{opt.label}</span>}
            {opt.badge !== undefined && opt.badge !== null && (
              <span
                className={cn(
                  "onicord-segmented-badge",
                  isActive
                    ? "onicord-segmented-badge-active"
                    : "onicord-segmented-badge-inactive"
                )}
              >
                {opt.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
