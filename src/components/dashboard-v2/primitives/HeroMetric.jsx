import { cn } from "../../../lib/cn";

export default function HeroMetric({
  value,
  unit = "",
  prefix = "",
  sublabel = "",
  delta = null,
  variant = "hero",
  sizeScale = "md",
  className = "",
}) {
  const fontSizeByScale = {
    sm: "clamp(1.6rem, min(18cqw, 26cqh), 3.4rem)",
    md: "clamp(2.2rem, min(24cqw, 32cqh), 5.8rem)",
    lg: "clamp(2.6rem, min(30cqw, 38cqh), 7rem)",
    xl: "clamp(3rem, min(36cqw, 44cqh), 8.2rem)",
  };

  return (
    <div className={cn("flex flex-col min-w-0", className)}>
      <div className="flex items-baseline gap-1 min-w-0">
        {prefix && (
          <span
            style={{ fontSize: "clamp(1rem, 12cqmin, 2.2rem)" }}
            className="bento-v2-display-hero bento-v2-ink-muted shrink-0"
          >
            {prefix}
          </span>
        )}
        <span
          style={{ fontSize: fontSizeByScale[sizeScale] || fontSizeByScale.md }}
          className={cn(
            variant === "tall" ? "bento-v2-display-tall" : "bento-v2-display-hero",
            "truncate"
          )}
        >
          {value}
        </span>
        {unit && (
          <span
            style={{ fontSize: "clamp(0.85rem, 10cqmin, 1.8rem)" }}
            className="font-bold bento-v2-ink-muted shrink-0"
          >
            {unit}
          </span>
        )}
        {delta && (
          <span className="ml-1.5 px-2 py-0.5 rounded-full text-2xs font-mono font-bold bento-v2-ink-pill shrink-0">
            {delta}
          </span>
        )}
      </div>
      {sublabel && (
        <span className="bento-v2-label-micro bento-v2-ink-muted truncate mt-1">
          {sublabel}
        </span>
      )}
    </div>
  );
}
