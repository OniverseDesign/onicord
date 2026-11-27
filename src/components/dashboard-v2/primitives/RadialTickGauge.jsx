import { useId } from "react";
import { cn } from "../../../lib/cn";

export default function RadialTickGauge({
  value = 0,
  max = 100,
  ticks = 40,
  arcDeg = 200,
  className = "",
  centerContent = null,
}) {
  const uid = useId();
  const clampedPct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  const activeCount = Math.round(clampedPct * ticks);

  const cx = 100;
  const cy = arcDeg <= 190 ? 96 : 86;
  const outerR = 78;
  const innerR = 58;
  const startAngle = -90 - arcDeg / 2;

  return (
    <div className={cn("relative w-full h-full flex items-center justify-center min-h-0", className)}>
      <svg viewBox="0 0 200 130" className="w-full h-full max-h-full overflow-visible pointer-events-none">
        {Array.from({ length: ticks }).map((_, idx) => {
          const ratio = ticks > 1 ? idx / (ticks - 1) : 0;
          const angleDeg = startAngle + ratio * arcDeg;
          const rad = (angleDeg * Math.PI) / 180;
          const x1 = cx + Math.cos(rad) * innerR;
          const y1 = cy + Math.sin(rad) * innerR;
          const x2 = cx + Math.cos(rad) * outerR;
          const y2 = cy + Math.sin(rad) * outerR;
          const isActive = idx < activeCount;

          return (
            <line
              key={`${uid}-${idx}`}
              x1={x1.toFixed(2)}
              y1={y1.toFixed(2)}
              x2={x2.toFixed(2)}
              y2={y2.toFixed(2)}
              stroke="currentColor"
              strokeWidth={isActive ? "3.1" : "2.4"}
              strokeLinecap="round"
              opacity={isActive ? 0.95 : 0.16}
            />
          );
        })}
      </svg>

      {centerContent && (
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2 pointer-events-none">
          {centerContent}
        </div>
      )}
    </div>
  );
}
