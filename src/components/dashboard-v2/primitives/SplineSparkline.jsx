import { useEffect, useId, useRef, useState } from "react";
import { cn } from "../../../lib/cn";

export default function SplineSparkline({
  data = [],
  formatValue = (v) => String(v),
  showArea = true,
  className = "",
}) {
  const uid = useId();
  const gradId = `${uid}-grad`;
  const fadeId = `${uid}-fade`;
  const maskId = `${uid}-mask`;
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 260, height: 100 });
  const [hoverIdx, setHoverIdx] = useState(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = (rect) => {
      const nextW = Math.round(rect.width);
      const nextH = Math.round(rect.height);
      if (nextW > 16 && nextH > 16) {
        setSize((prev) =>
          Math.abs(prev.width - nextW) < 3 && Math.abs(prev.height - nextH) < 3
            ? prev
            : { width: nextW, height: nextH }
        );
      }
    };

    update(el.getBoundingClientRect());
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        update(entry.contentRect);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!data || data.length < 2) {
    return null;
  }

  const w = size.width;
  const h = size.height;
  const padX = 6;
  const padTop = Math.max(12, h * 0.14);
  const padBottom = Math.max(8, h * 0.14);

  const vals = data.map((d) => Number(d.value) || 0);
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const rawSpan = maxVal - minVal;
  const span = Math.max(4, rawSpan);
  const midVal = (maxVal + minVal) / 2;
  const effectiveMin = rawSpan < 4 ? midVal - span / 2 : minVal;

  const pts = data.map((d, idx) => {
    const x = padX + (idx / (data.length - 1)) * (w - padX * 2);
    const norm = (Number(d.value) - effectiveMin) / span;
    const y = h - padBottom - norm * (h - padTop - padBottom);
    return { x, y, item: d };
  });

  let pathD = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const midX = ((p0.x + p1.x) / 2).toFixed(1);
    pathD += ` C ${midX} ${p0.y.toFixed(1)}, ${midX} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }

  const areaD = `${pathD} L ${pts[pts.length - 1].x.toFixed(1)} ${h} L ${pts[0].x.toFixed(1)} ${h} Z`;
  const activePt = hoverIdx !== null ? pts[hoverIdx] : pts[pts.length - 1];

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full h-full min-h-0 flex items-center select-none", className)}
      data-no-drag="true"
      onMouseLeave={() => setHoverIdx(null)}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.26" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>

          <linearGradient id={fadeId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="10%" stopColor="white" stopOpacity="1" />
            <stop offset="90%" stopColor="white" stopOpacity="1" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>

          <mask id={maskId}>
            <rect x="0" y="0" width={w} height={h} fill={`url(#${fadeId})`} />
          </mask>
        </defs>

        {showArea && (
          <path d={areaD} fill={`url(#${gradId})`} mask={`url(#${maskId})`} />
        )}

        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {activePt && (
          <g>
            <circle cx={activePt.x} cy={activePt.y} r="10" fill="currentColor" opacity="0.16" />
            <circle cx={activePt.x} cy={activePt.y} r="4.5" fill="currentColor" />
          </g>
        )}

        {pts.map((pt, idx) => {
          const colW = (w - padX * 2) / pts.length;
          return (
            <rect
              key={idx}
              x={pt.x - colW / 2}
              y={0}
              width={colW}
              height={h}
              fill="transparent"
              onMouseEnter={() => setHoverIdx(idx)}
            />
          );
        })}
      </svg>

      {hoverIdx !== null && activePt && (
        <div
          style={{ left: `${(activePt.x / w) * 100}%` }}
          className="absolute top-0 -translate-x-1/2 -translate-y-1 px-2 py-0.5 rounded-onicord-chip bg-onicord-mantle text-onicord-text border border-onicord-border-strong text-2xs font-mono font-bold whitespace-nowrap pointer-events-none shadow-md z-20"
        >
          {activePt.item.label ? `${activePt.item.label} · ` : ""}
          {formatValue(activePt.item.value, activePt.item)}
        </div>
      )}
    </div>
  );
}
