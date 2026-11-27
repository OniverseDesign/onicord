import { useState } from "react";
import { cn } from "../../../lib/cn";

export default function TrackBarChart({
  data = [],
  highlightPeak = true,
  highlightLast = false,
  formatValue = (v) => String(v),
  showLabels = true,
  minBarPct = 10,
  className = "",
}) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  if (!data || data.length === 0) {
    return null;
  }

  const values = data.map((d) => Number(d.value) || 0);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const span = Math.max(1, maxVal - Math.min(0, minVal));

  let peakIdx = -1;
  if (highlightPeak) {
    let best = -Infinity;
    values.forEach((v, i) => {
      if (v >= best) {
        best = v;
        peakIdx = i;
      }
    });
  }

  return (
    <div
      className={cn("w-full h-full flex flex-col min-h-0 select-none", className)}
      data-no-drag="true"
      onMouseLeave={() => setHoveredIdx(null)}
    >
      <div className="flex-1 min-h-0 flex items-end gap-1.5 w-full">
        {data.map((item, idx) => {
          const val = Number(item.value) || 0;
          const pct = Math.max(
            minBarPct,
            Math.min(100, ((val - Math.min(0, minVal)) / span) * 100)
          );
          const isHovered = hoveredIdx === idx;
          const isHighlighted =
            isHovered ||
            (hoveredIdx === null && ((highlightLast && idx === data.length - 1) || (highlightPeak && idx === peakIdx)));

          return (
            <div
              key={item.id ?? idx}
              onMouseEnter={() => setHoveredIdx(idx)}
              className="flex-1 h-full min-w-[4px] flex flex-col items-center justify-end relative group/bar"
            >
              {isHovered && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-onicord-chip bg-onicord-mantle text-onicord-text border border-onicord-border-strong text-2xs font-mono font-bold whitespace-nowrap z-20 pointer-events-none shadow-md">
                  {item.label ? `${item.label}: ` : ""}
                  {formatValue(val, item)}
                </div>
              )}

              <div className="w-full h-full rounded-full bento-v2-ink-track relative overflow-hidden flex items-end">
                <div
                  style={{ height: `${pct}%` }}
                  className={cn(
                    "w-full rounded-full transition-all duration-relaxed ease-onicord-out",
                    isHighlighted
                      ? "bg-current opacity-100"
                      : "bg-current opacity-45 hover:opacity-75"
                  )}
                />
              </div>
            </div>
          );
        })}
      </div>

      {showLabels && (
        <div className="flex items-center gap-1.5 mt-1.5 shrink-0">
          {data.map((item, idx) => (
            <span
              key={item.id ?? idx}
              className={cn(
                "flex-1 text-center text-2xs font-mono truncate transition-opacity duration-fast",
                hoveredIdx === idx ? "opacity-100 font-bold" : "bento-v2-ink-subtle"
              )}
            >
              {item.label || ""}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
