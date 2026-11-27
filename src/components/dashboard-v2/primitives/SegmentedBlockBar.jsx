import { cn } from "../../../lib/cn";
import Tooltip from "../../ui/Tooltip";

export default function SegmentedBlockBar({
  segments = [],
  mode = "blocks",
  className = "",
}) {
  if (!segments || segments.length === 0) return null;

  const total = Math.max(
    1,
    segments.reduce((acc, s) => acc + Math.max(0, Number(s.value) || 0), 0)
  );

  if (mode === "dots") {
    return (
      <div className={cn("w-full flex items-end gap-1.5 h-full min-h-0", className)}>
        {segments.map((seg, idx) => {
          const dots = Math.max(1, Math.min(6, Math.round((Number(seg.value) || 0) * 6)));
          return (
            <div key={seg.id ?? idx} className="flex-1 flex flex-col-reverse items-center gap-1">
              {Array.from({ length: 6 }).map((_, dIdx) => (
                <span
                  key={dIdx}
                  className={cn(
                    "w-2.5 h-2.5 rounded-full transition-opacity duration-normal",
                    dIdx < dots ? "bg-current opacity-90" : "bg-current opacity-15"
                  )}
                />
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("w-full flex items-center gap-1 h-full min-h-[16px]", className)}>
      {segments.map((seg, idx) => {
        const val = Math.max(0, Number(seg.value) || 0);
        const pct = (val / total) * 100;
        if (pct <= 0) return null;

        return (
          <Tooltip
            key={seg.id ?? idx}
            content={seg.label ? `${seg.label}: ${val}` : String(val)}
            side="top"
          >
            <div
              style={{ width: `${pct}%`, opacity: seg.opacity ?? (idx === 0 ? 0.95 : 0.35) }}
              className={cn(
                "h-full rounded-onicord-chip transition-all duration-slow ease-onicord-out bg-current min-w-[6px]",
                seg.className
              )}
            />
          </Tooltip>
        );
      })}
    </div>
  );
}
