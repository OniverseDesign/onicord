import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWidgetLayout } from "../WidgetLayoutContext";
import Tooltip from "../../ui/Tooltip";
import WidgetShell from "../primitives/WidgetShell";
import DotMatrixText from "../primitives/DotMatrixText";

const HORA_STYLE_KEY = "onicord_v2_hora_style";
const STYLES = ["swiss", "matrix", "analog"];
const STYLE_LABELS = { swiss: "DIG", matrix: "LED", analog: "ANA" };

function AnalogClockFace({ hours, minutes, seconds, compact = false }) {
  const secRad = ((seconds * 6) * Math.PI) / 180;
  const minRad = ((minutes * 6 + seconds * 0.1) * Math.PI) / 180;
  const hourRad = (((hours % 12) * 30 + minutes * 0.5) * Math.PI) / 180;

  return (
    <svg viewBox="0 0 120 120" className="w-full h-full max-w-full max-h-full select-none">
      <circle
        cx="60"
        cy="60"
        r="54"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.18"
      />
      {Array.from({ length: 12 }).map((_, i) => {
        const ang = (i * 30 * Math.PI) / 180;
        const r1 = i % 3 === 0 ? 43 : 47;
        const r2 = 51;
        return (
          <line
            key={i}
            x1={60 + Math.sin(ang) * r1}
            y1={60 - Math.cos(ang) * r1}
            x2={60 + Math.sin(ang) * r2}
            y2={60 - Math.cos(ang) * r2}
            stroke="currentColor"
            strokeWidth={i % 3 === 0 ? "2.4" : "1.2"}
            strokeLinecap="round"
            opacity={i % 3 === 0 ? 0.85 : 0.35}
          />
        );
      })}
      {!compact && (
        <text
          x="60"
          y="40"
          textAnchor="middle"
          fill="currentColor"
          opacity="0.26"
          fontSize="10"
          fontWeight="800"
          letterSpacing="1"
        >
          {String(hours).padStart(2, "0")}
        </text>
      )}
      <line
        x1="60"
        y1="60"
        x2={60 + Math.sin(hourRad) * 28}
        y2={60 - Math.cos(hourRad) * 28}
        stroke="currentColor"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <line
        x1="60"
        y1="60"
        x2={60 + Math.sin(minRad) * 40}
        y2={60 - Math.cos(minRad) * 40}
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <line
        x1={60 - Math.sin(secRad) * 10}
        y1={60 + Math.cos(secRad) * 10}
        x2={60 + Math.sin(secRad) * 44}
        y2={60 - Math.cos(secRad) * 44}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle cx="60" cy="60" r="3.6" fill="currentColor" />
    </svg>
  );
}

export default function HoraWidgetV2({ isActive = true }) {
  const { t, i18n } = useTranslation();
  const { sizeMode } = useWidgetLayout();
  const [now, setNow] = useState(() => new Date());
  const [clockStyle, setClockStyle] = useState(() => {
    try {
      const saved = localStorage.getItem(HORA_STYLE_KEY);
      return STYLES.includes(saved) ? saved : "swiss";
    } catch {
      return "swiss";
    }
  });

  useEffect(() => {
    if (!isActive) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  const cycleStyle = () => {
    const next = STYLES[(STYLES.indexOf(clockStyle) + 1) % STYLES.length];
    setClockStyle(next);
    try {
      localStorage.setItem(HORA_STYLE_KEY, next);
    } catch {}
  };

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  const dayPct = Math.round(((hours * 3600 + minutes * 60 + seconds) / 86400) * 100);
  const lang = i18n.language || "es";
  const weekdayShort = now.toLocaleDateString(lang, { weekday: "short" }).replace(".", "");
  const dayNum = now.getDate();
  const fullDate = now.toLocaleDateString(lang, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });

  const styleChip = (
    <Tooltip content={t("widgets.clock.switchStyle", "Cambiar estilo de reloj")} side="bottom">
      <button
        type="button"
        onClick={cycleStyle}
        className="bento-v2-pill font-mono cursor-pointer active:scale-95"
      >
        {STYLE_LABELS[clockStyle]}
      </button>
    </Tooltip>
  );

  // MICRO mode: ultra pure hero
  if (sizeMode === "micro") {
    return (
      <WidgetShell>
        <div className="flex-1 flex items-center justify-center min-h-0">
          {clockStyle === "analog" ? (
            <AnalogClockFace hours={hours} minutes={minutes} seconds={seconds} compact />
          ) : clockStyle === "matrix" ? (
            <DotMatrixText text={`${hh}:${mm}`} className="w-full" />
          ) : (
            <span
              style={{ fontSize: "clamp(1.8rem, min(36cqw, 48cqh), 5.2rem)" }}
              className="bento-v2-display-hero tracking-tighter"
            >
              {hh}:{mm}
            </span>
          )}
        </div>
      </WidgetShell>
    );
  }

  // STRIP mode: horizontal capsule
  if (sizeMode === "strip") {
    return (
      <WidgetShell title={t("widgets.clock.title", "Hora")} headerRight={styleChip}>
        <div className="flex-1 flex items-center justify-between gap-4 min-h-0">
          <div className="flex items-baseline gap-2 min-w-0">
            {clockStyle === "matrix" ? (
              <div className="w-40 max-w-full">
                <DotMatrixText text={`${hh}:${mm}`} />
              </div>
            ) : clockStyle === "analog" ? (
              <div className="h-12 w-12 shrink-0">
                <AnalogClockFace hours={hours} minutes={minutes} seconds={seconds} compact />
              </div>
            ) : (
              <span
                style={{ fontSize: "clamp(2rem, min(28cqw, 58cqh), 5rem)" }}
                className="bento-v2-display-hero"
              >
                {hh}:{mm}
              </span>
            )}
            <span className="bento-v2-pill font-mono">
              :{ss}
            </span>
          </div>

          <span className="text-xs font-bold capitalize truncate bento-v2-ink-muted">
            {fullDate}
          </span>
        </div>
      </WidgetShell>
    );
  }

  // COMPACT / PILLAR / STANDARD / EXPANDED
  const isCompactOrPillar = sizeMode === "compact" || sizeMode === "pillar";

  return (
    <WidgetShell
      title={t("widgets.clock.title", "Local Time")}
      headerRight={styleChip}
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-2xs font-bold capitalize truncate bento-v2-ink-muted">
            {fullDate}
          </span>
          {sizeMode === "expanded" ? (
            <span className="text-2xs font-mono font-bold bento-v2-ink-muted shrink-0">
              {t("widgets.clock.dayProgress", "Day progress · {{pct}}%", { pct: dayPct })}
            </span>
          ) : (
            <span className="text-2xs font-mono font-bold bento-v2-ink-subtle shrink-0">
              24H
            </span>
          )}
        </div>
      }
    >
      <div className="flex-1 flex flex-col justify-center min-h-0">
        {clockStyle === "analog" ? (
          <div className="flex-1 flex items-center justify-center p-1 min-h-0">
            <AnalogClockFace hours={hours} minutes={minutes} seconds={seconds} />
          </div>
        ) : clockStyle === "matrix" ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 min-h-0">
            <DotMatrixText text={`${hh}:${mm}`} />
            <div className="flex items-center gap-2">
              <span className="bento-v2-pill font-mono">
                :{ss}
              </span>
              <span className="bento-v2-label-micro bento-v2-ink-muted uppercase">
                {weekdayShort} {dayNum}
              </span>
            </div>
          </div>
        ) : isCompactOrPillar ? (
          // Stacked Swiss poster numerals + balanced circular date badge
          <div className="flex-1 flex items-center justify-between gap-2 min-h-0">
            <div className="flex flex-col justify-center leading-none min-w-0 flex-1">
              <span
                style={{ fontSize: "clamp(2.8rem, min(38cqw, 33cqh), 7.5rem)" }}
                className="bento-v2-display-tall"
              >
                {hh}
              </span>
              <span
                style={{ fontSize: "clamp(2.8rem, min(38cqw, 33cqh), 7.5rem)" }}
                className="bento-v2-display-tall opacity-75"
              >
                {mm}
              </span>
            </div>

            <div className="flex flex-col items-end justify-between h-full py-1 shrink-0">
              <span className="bento-v2-pill font-mono">
                :{ss}
              </span>
              <div className="flex flex-col items-center gap-1 my-auto">
                <span className="bento-v2-label-micro bento-v2-ink-muted uppercase">
                  {weekdayShort}
                </span>
                <div
                  style={{
                    width: "clamp(2.5rem, 18cqmin, 3.75rem)",
                    height: "clamp(2.5rem, 18cqmin, 3.75rem)",
                    backgroundColor: "var(--widget-pill-bg)",
                    color: "var(--widget-pill-fg)",
                  }}
                  className="rounded-full flex items-center justify-center"
                >
                  <span
                    style={{ fontSize: "clamp(0.85rem, 6.5cqmin, 1.35rem)" }}
                    className="font-mono font-black"
                  >
                    {dayNum}
                  </span>
                </div>
              </div>
              <span className="h-1" />
            </div>
          </div>
        ) : (
          // Standard / Expanded Swiss Hero filling the container
          <div className="flex-1 flex items-center justify-between gap-3 min-h-0">
            <div className="flex items-baseline gap-2 min-w-0">
              <span
                style={{ fontSize: "clamp(3.2rem, min(26cqw, 44cqh), 8.5rem)" }}
                className="bento-v2-display-hero truncate"
              >
                {hh}:{mm}
              </span>
              <span className="bento-v2-pill font-mono shrink-0">
                :{ss}
              </span>
            </div>

            <div className="hidden sm:flex flex-col items-center gap-1 shrink-0">
              <span className="bento-v2-label-micro bento-v2-ink-muted uppercase">
                {weekdayShort}
              </span>
              <div
                style={{
                  width: "clamp(2.6rem, 18cqmin, 3.8rem)",
                  height: "clamp(2.6rem, 18cqmin, 3.8rem)",
                  backgroundColor: "var(--widget-pill-bg)",
                  color: "var(--widget-pill-fg)",
                }}
                className="rounded-full flex items-center justify-center"
              >
                <span
                  style={{ fontSize: "clamp(0.9rem, 6.5cqmin, 1.4rem)" }}
                  className="font-mono font-black"
                >
                  {dayNum}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </WidgetShell>
  );
}
