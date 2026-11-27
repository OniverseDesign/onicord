import { cn } from "../../../lib/cn";

export default function ProgressFillCard({
  label,
  sublabel = "",
  valueText = "",
  pct = 0,
  fillClassName = "bg-onicord-accent/25",
  className = "",
  children,
}) {
  const safePct = Math.max(0, Math.min(100, pct));

  return (
    <div
      className={cn(
        "relative w-full rounded-onicord-inner overflow-hidden border bento-v2-ink-divider bento-v2-ink-track",
        className
      )}
    >
      <div
        style={{ width: `${safePct}%` }}
        className={cn(
          "absolute inset-y-0 left-0 transition-all duration-slow ease-onicord-out pointer-events-none",
          fillClassName
        )}
      />
      <div className="relative z-10 px-3 py-2 flex items-center justify-between gap-2 min-w-0">
        {children || (
          <>
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{label}</p>
              {sublabel && (
                <p className="text-2xs bento-v2-ink-muted truncate">{sublabel}</p>
              )}
            </div>
            {valueText && (
              <span className="text-xs font-mono font-black shrink-0">{valueText}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
