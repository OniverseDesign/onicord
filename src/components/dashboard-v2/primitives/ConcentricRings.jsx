import { cn } from "../../../lib/cn";

export default function ConcentricRings({
  rings = [],
  centerLabel = "",
  centerSublabel = "",
  className = "",
}) {
  const size = 160;
  const center = size / 2;
  const strokeWidth = 8;
  const gap = 12;

  return (
    <div className={cn("relative flex items-center justify-center w-full h-full min-h-0", className)}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full max-w-full max-h-full -rotate-90 pointer-events-none">
        {rings.map((ring, idx) => {
          const radius = 64 - idx * gap;
          if (radius <= 12) return null;
          const circumference = 2 * Math.PI * radius;
          const pct = Math.max(0.04, Math.min(1, (Number(ring.pct) || 0) / 100));
          const dashOffset = circumference * (1 - pct);

          return (
            <g key={ring.id ?? idx} className={ring.colorClass || "text-current"}>
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                opacity="0.14"
              />
              <circle
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="transition-all duration-slow ease-onicord-out"
              />
            </g>
          );
        })}
      </svg>

      {(centerLabel || centerSublabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          {centerLabel && (
            <span
              style={{ fontSize: "clamp(0.85rem, 11cqmin, 1.45rem)" }}
              className="bento-v2-display-hero leading-none"
            >
              {centerLabel}
            </span>
          )}
          {centerSublabel && (
            <span className="bento-v2-label-micro bento-v2-ink-muted mt-0.5">
              {centerSublabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
