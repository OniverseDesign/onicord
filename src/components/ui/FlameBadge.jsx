import React, { useState } from "react";
import { getFlameTier } from "../../lib/flameService";
import FlamePopover from "./FlamePopover";
import { IconFlame } from "../icons/StreamIcons";

export default function FlameBadge({
  days = 0,
  size = "sm", // 'sm' | 'md' | 'lg'
  showText = true,
  className = "",
  title = null,
  isServer = false,
}) {
  const [targetRect, setTargetRect] = useState(null);
  const currentDays = Math.max(0, days || 0);
  const tier = getFlameTier(currentDays);

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-[11px] gap-0.2 pr-2",
    md: "px-2 py-1 text-xs gap-0.3 pr-2.5",
    lg: "px-2.5 py-1 text-sm gap-0.5 pr-2",
  };

  const iconPresetSizes = {
    sm: "sm", 
    md: "base", 
    lg: "lg", 
  };

  const handleMouseEnter = (e) => {
    setTargetRect(e.currentTarget.getBoundingClientRect());
  };

  const handleMouseLeave = () => {
    setTargetRect(null);
  };

  return (
    <>
      <div
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`inline-flex items-center justify-center align-middle font-bold rounded-full border transition-all duration-300 select-none cursor-help text-slate-950 [.light-mode_&]:text-white ${tier.badgeBg} ${tier.glow} ${sizeClasses[size] || sizeClasses.sm} ${className}`}
      >
        <IconFlame
          size={iconPresetSizes[size] || "xs"}
          fill={true}
          className="shrink-0 self-center pb-[2px]"
        />
        {showText && (
          <span className="font-mono font-black leading-none flex items-center justify-center pt-[1px]">
            {currentDays}
          </span>
        )}
      </div>

      {}
      {targetRect && (
        <FlamePopover
          rect={targetRect}
          tier={tier}
          currentDays={currentDays}
          isServer={isServer}
        />
      )}
    </>
  );
}
