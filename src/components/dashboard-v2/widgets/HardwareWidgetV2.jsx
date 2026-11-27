import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../../lib/cn";
import { useWidgetLayout } from "../WidgetLayoutContext";
import WidgetShell from "../primitives/WidgetShell";
import HeroMetric from "../primitives/HeroMetric";
import TrackBarChart from "../primitives/TrackBarChart";
import SplineSparkline from "../primitives/SplineSparkline";
import RadialTickGauge from "../primitives/RadialTickGauge";
import ConcentricRings from "../primitives/ConcentricRings";

const HISTORY_LIMIT = 24;

const telemetryCache = {
  cpuHistory: Array(16).fill(4),
  ramHistory: Array(16).fill(180),
  netHistory: Array(16).fill(0),
  cpuNum: 4,
  ramNum: 180,
  netNum: 0,
  cpuText: "0.0",
  ramText: "0 MB",
  netText: "0.0 KB/s",
};

function parseRamMb(ramStr) {
  const num = parseFloat(String(ramStr || "0").replace(/[^\d.]/g, ""));
  return Number.isFinite(num) ? num : 0;
}

function parseNetKbs(netStr) {
  const str = String(netStr || "0");
  const num = parseFloat(str.replace(/[^\d.]/g, "")) || 0;
  if (str.toUpperCase().includes("MB/S")) return num * 1024;
  return num;
}

const MODES = [
  { id: "all", label: "ALL" },
  { id: "cpu", label: "CPU" },
  { id: "ram", label: "RAM" },
  { id: "net", label: "NET" },
];

export default function HardwareWidgetV2({
  ping = 0,
  activeConnectionsCount = 0,
  isActive = true,
}) {
  const { t } = useTranslation();
  const { sizeMode } = useWidgetLayout();
  const [selectedMetric, setSelectedMetric] = useState("cpu");
  const [, setTick] = useState(0);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const sample = async () => {
      try {
        const [cpu, ram, net] = await Promise.all([
          api.getRealCPU?.(),
          api.getRealRAM?.(),
          api.getNetworkSpeed?.(),
        ]);

        const cpuVal = Math.max(0.2, parseFloat(cpu) || 0.2);
        const ramVal = parseRamMb(ram);
        const netVal = parseNetKbs(net);

        telemetryCache.cpuText = cpu || "0.0";
        telemetryCache.ramText = ram || "0 MB";
        telemetryCache.netText = net || "0.0 KB/s";
        telemetryCache.cpuNum = cpuVal;
        telemetryCache.ramNum = ramVal;
        telemetryCache.netNum = netVal;

        telemetryCache.cpuHistory = [...telemetryCache.cpuHistory.slice(-(HISTORY_LIMIT - 1)), cpuVal];
        telemetryCache.ramHistory = [...telemetryCache.ramHistory.slice(-(HISTORY_LIMIT - 1)), ramVal];
        telemetryCache.netHistory = [...telemetryCache.netHistory.slice(-(HISTORY_LIMIT - 1)), netVal];

        if (isActive) {
          setTick((v) => v + 1);
        }
      } catch {}
    };

    sample();
    const id = setInterval(sample, 2000);
    return () => clearInterval(id);
  }, [isActive]);

  const effectivePing = activeConnectionsCount > 0 ? ping : 0;

  const activeData =
    selectedMetric === "ram"
      ? telemetryCache.ramHistory.map((v, i) => ({ id: i, label: `${i + 1}`, value: v }))
      : selectedMetric === "net"
        ? telemetryCache.netHistory.map((v, i) => ({ id: i, label: `${i + 1}`, value: v }))
        : telemetryCache.cpuHistory.map((v, i) => ({ id: i, label: `${i + 1}`, value: v }));

  const formatActiveVal = (v) => {
    if (selectedMetric === "ram") return `${Math.round(v)} MB`;
    if (selectedMetric === "net") return `${v.toFixed(1)} KB/s`;
    return `${v.toFixed(1)}%`;
  };

  const heroValue =
    selectedMetric === "ram"
      ? telemetryCache.ramText.replace(/\s*MB/i, "")
      : selectedMetric === "net"
        ? telemetryCache.netText.split(" ")[0]
        : `${telemetryCache.cpuText}`;

  const heroUnit =
    selectedMetric === "ram"
      ? "MB"
      : selectedMetric === "net"
        ? telemetryCache.netText.split(" ")[1] || "KB/s"
        : "%";

  const modes = [
    { id: "all", label: t("widgets.hardware.all", "ALL") },
    { id: "cpu", label: "CPU" },
    { id: "ram", label: "RAM" },
    { id: "net", label: t("widgets.hardware.netShort", "NET") },
  ];

  const ringMetrics = [
    { id: "cpu", label: "CPU", pct: Math.min(100, telemetryCache.cpuNum), colorClass: "text-onicord-accent", val: `${telemetryCache.cpuText}%` },
    { id: "ram", label: "RAM", pct: Math.min(100, (telemetryCache.ramNum / 1024) * 100), colorClass: "text-onicord-success", val: telemetryCache.ramText },
    { id: "net", label: t("widgets.hardware.netShort", "NET"), pct: Math.min(100, Math.max(8, telemetryCache.netNum / 2)), colorClass: "text-onicord-sapphire", val: telemetryCache.netText },
    { id: "ping", label: "PING", pct: effectivePing > 0 ? Math.max(10, Math.min(100, 100 - effectivePing / 3)) : 8, colorClass: "text-onicord-peach", val: `${effectivePing}ms` },
  ];

  const modeTabs = (
    <div className="bento-v2-pill-group">
      {modes.map((m) => {
        const isSelected = selectedMetric === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => setSelectedMetric(m.id)}
            style={
              isSelected
                ? {
                    backgroundColor: "var(--widget-pill-fg)",
                    color: "var(--widget-pill-bg)",
                  }
                : undefined
            }
            className={cn(
              "h-full px-2.5 rounded-full text-2xs font-mono font-bold transition-colors duration-fast cursor-pointer flex items-center justify-center",
              !isSelected && "opacity-70 hover:opacity-100"
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );

  // MICRO mode
  if (sizeMode === "micro") {
    return (
      <WidgetShell>
        <div className="flex-1 flex flex-col justify-between min-h-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-onicord-success-vivid bento-v2-live-halo" />
            <span className="bento-v2-label-micro bento-v2-ink-muted">CPU</span>
          </div>
          <HeroMetric value={telemetryCache.cpuText} unit="%" sizeScale="lg" />
        </div>
      </WidgetShell>
    );
  }

  // COMPACT / PILLAR: ConcentricRings (ALL) or RadialTickGauge
  if (sizeMode === "compact" || sizeMode === "pillar") {
    return (
      <WidgetShell
        title={t("widgets.hardware.title", "Performance")}
        headerRight={modeTabs}
      >
        {selectedMetric === "all" ? (
          <div className="flex-1 flex flex-col items-center justify-between gap-2 min-h-0">
            <div className="flex-1 w-full min-h-0">
              <ConcentricRings
                rings={ringMetrics}
                centerLabel={`${telemetryCache.cpuText}%`}
                centerSublabel="CPU"
              />
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 w-full shrink-0 text-2xs font-mono">
              {ringMetrics.map((rm) => (
                <div key={rm.id} className="flex items-center justify-between gap-1 min-w-0">
                  <span className="bento-v2-ink-muted truncate">{rm.label}</span>
                  <span className="font-bold truncate">{rm.val}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-between min-h-0">
            <div className="flex-1 min-h-0">
              <RadialTickGauge
                value={
                  selectedMetric === "ram"
                    ? Math.min(100, (telemetryCache.ramNum / 1024) * 100)
                    : selectedMetric === "net"
                      ? Math.min(100, telemetryCache.netNum / 2)
                      : telemetryCache.cpuNum
                }
                centerContent={
                  <div className="flex flex-col items-center">
                    <span
                      style={{ fontSize: "clamp(1.3rem, 18cqmin, 2.5rem)" }}
                      className="bento-v2-display-hero"
                    >
                      {heroValue}
                      <span className="text-xs font-bold bento-v2-ink-muted ml-0.5">{heroUnit}</span>
                    </span>
                    <span className="bento-v2-label-micro bento-v2-ink-muted mt-0.5">
                      {selectedMetric.toUpperCase()}
                    </span>
                  </div>
                }
              />
            </div>
          </div>
        )}
      </WidgetShell>
    );
  }

  // STRIP: 4 crisp KPIs + horizontal sparkline
  if (sizeMode === "strip") {
    return (
      <WidgetShell title={t("widgets.hardware.title", "Performance")} headerRight={modeTabs}>
        <div className="flex-1 flex items-center gap-4 min-h-0">
          <div className="grid grid-cols-4 gap-3 shrink-0">
            {ringMetrics.map((rm) => (
              <div key={rm.id} className="min-w-0">
                <p className="bento-v2-label-micro bento-v2-ink-muted truncate">{rm.label}</p>
                <p className="text-base font-black font-mono tracking-tight truncate mt-0.5">
                  {rm.val}
                </p>
              </div>
            ))}
          </div>
          <div className="flex-1 h-full min-w-0 py-1 text-onicord-accent">
            <SplineSparkline data={activeData} formatValue={formatActiveVal} />
          </div>
        </div>
      </WidgetShell>
    );
  }

  // STANDARD / EXPANDED: Hero KPI + TrackBarChart or ConcentricRings dashboard
  return (
    <WidgetShell
      title={t("widgets.hardware.title", "Performance")}
      headerRight={modeTabs}
      footer={
        <div className="grid grid-cols-4 gap-2 text-2xs font-mono">
          {ringMetrics.map((rm) => (
            <div key={rm.id} className="min-w-0">
              <span className="bento-v2-ink-subtle block truncate">{rm.label}</span>
              <span className="font-bold truncate block">{rm.val}</span>
            </div>
          ))}
        </div>
      }
    >
      {selectedMetric === "all" ? (
        <div className="flex-1 grid grid-cols-2 gap-3 items-center min-h-0">
          <div className="h-full min-h-0">
            <ConcentricRings
              rings={ringMetrics}
              centerLabel={`${telemetryCache.cpuText}%`}
              centerSublabel="CPU"
            />
          </div>
          <div className="flex flex-col gap-2 min-w-0">
            {ringMetrics.map((rm) => (
              <div key={rm.id} className="flex flex-col gap-0.5">
                <div className="flex justify-between text-2xs font-mono">
                  <span className="bento-v2-ink-muted font-bold">{rm.label}</span>
                  <span className="font-black">{rm.val}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bento-v2-ink-track overflow-hidden">
                  <div
                    style={{ width: `${Math.max(5, Math.min(100, rm.pct))}%` }}
                    className={cn("h-full rounded-full bg-current transition-all duration-slow", rm.colorClass)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between gap-2 min-h-0">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <HeroMetric
              value={heroValue}
              unit={heroUnit}
              sublabel={`${selectedMetric === "net" ? t("widgets.hardware.netShort", "NET") : selectedMetric.toUpperCase()} · ${t("widgets.hardware.live", "Live")}`}
              sizeScale="lg"
            />
            <span className="bento-v2-pill font-mono self-start">
              <span className="w-2 h-2 rounded-full bg-onicord-success-vivid bento-v2-live-halo" />
              {t("widgets.hardware.live", "Live")}
            </span>
          </div>

          <div className="flex-1 min-h-[56px] text-onicord-accent">
            <TrackBarChart
              data={activeData.slice(-14)}
              showLabels={false}
              highlightPeak={true}
              highlightLast={true}
              formatValue={formatActiveVal}
              minBarPct={10}
            />
          </div>
        </div>
      )}
    </WidgetShell>
  );
}
