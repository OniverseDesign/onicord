import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";

export default function HardwareWidget({
  ping = 0,
  activeConnectionsCount = 0,
}) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const [barCount, setBarCount] = useState(25);
  const historyRef = useRef(Array(40).fill(1)); 
  const [, forceUpdate] = useState({});

  const [cpuReal, setCpuReal] = useState("0.0");
  const [ramReal, setRamReal] = useState("0 MB");
  const [netSpeed, setNetSpeed] = useState("0.0 KB/s");

  const [cpuMax, setCpuMax] = useState(1.0); 

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const width = entry.contentRect.width;
        const calculatedBars = Math.max(15, Math.floor(width / 8));
        setBarCount(calculatedBars);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const querySystemHardware = async () => {
      try {
        const cpu = await api.getRealCPU();
        const ram = await api.getRealRAM();
        const net = await api.getNetworkSpeed();

        setCpuReal(cpu || "0.0");
        setRamReal(ram || "0 MB");
        setNetSpeed(net || "0.0 KB/s");

        const numericCpu = parseFloat(cpu) || 0.1;

        setCpuMax((currentMax) => {
          const nextMax = Math.max(currentMax, numericCpu);

          historyRef.current.push(numericCpu);
          if (historyRef.current.length > 50) {
            historyRef.current.shift();
          }

          return nextMax;
        });

        forceUpdate({});
      } catch (err) {
        console.error("Error consultando telemetría nativa:", err);
      }
    };

    querySystemHardware();
    const intervalTelemetry = setInterval(querySystemHardware, 2000);

    return () => clearInterval(intervalTelemetry);
  }, []);

  const visibleHistory = historyRef.current.slice(-barCount);

  return (
    <div
      style={{ containerType: "inline-size" }}
      className="onicord-widget-shell w-full h-full p-6 flex flex-col justify-between select-none"
    >
      {/* Header */}
      <div className="onicord-widget-header flex justify-between items-center w-full gap-2 mb-2 shrink-0">
        <h3
          style={{ fontSize: "clamp(0.6rem, 3.5cqi, 0.8rem)" }}
          className="onicord-widget-title font-bold text-onicord-text truncate"
        >
          {t("widgets.hardware.title", "Performance")}
        </h3>
        <span
          style={{ fontSize: "clamp(0.6rem, 3cqi, 0.5rem)" }}
          className="onicord-widget-badge-dynamic shrink-0 px-2 py-0.5 font-medium"
        >
          {t("widgets.hardware.live", "Live")}
        </span>
      </div>

      {/* Grid datos hardware en vivo */}
      <div className="grid grid-cols-4 gap-2 my-2 shrink-0 w-full">
        <div className="min-w-0">
          <p
            style={{ fontSize: "clamp(0.55rem, 2.2cqi, 0.7rem)" }}
            className="font-bold uppercase tracking-wide text-[var(--onicord-faded)] truncate"
          >
            {t("widgets.hardware.cpuApp", "CPU App")}
          </p>
          <p
            style={{ fontSize: "clamp(0.8rem, 5.5cqi, 1.75rem)" }}
            className="font-black text-[var(--onicord-text)] tracking-tighter font-mono leading-none truncate mt-0.5"
          >
            {cpuReal}%
          </p>
        </div>

        <div className="min-w-0">
          <p
            style={{ fontSize: "clamp(0.55rem, 2.2cqi, 0.7rem)" }}
            className="font-bold uppercase tracking-wide text-[var(--onicord-faded)] truncate"
          >
            {t("widgets.hardware.memoryOS", "Memory OS")}
          </p>
          <p
            style={{ fontSize: "clamp(0.8rem, 5.5cqi, 1.75rem)" }}
            className="font-black text-[var(--onicord-success)] tracking-tighter font-mono leading-none truncate mt-0.5"
          >
            {ramReal}
          </p>
        </div>

        <div className="min-w-0">
          <p
            style={{ fontSize: "clamp(0.55rem, 2.2cqi, 0.7rem)" }}
            className="font-bold uppercase tracking-wide text-[var(--onicord-faded)] truncate"
          >
            {t("widgets.hardware.network", "Network")}
          </p>
          <p
            style={{ fontSize: "clamp(0.8rem, 5.5cqi, 1.75rem)" }}
            className="font-black text-[var(--onicord-accent)] tracking-tighter font-mono leading-none truncate mt-0.5"
          >
            {netSpeed}
          </p>
        </div>

        <div className="min-w-0">
          <p
            style={{ fontSize: "clamp(0.55rem, 2.2cqi, 0.7rem)" }}
            className="font-bold uppercase tracking-wide text-[var(--onicord-faded)] truncate"
          >
            {t("widgets.hardware.signaling", "Signaling")}
          </p>
          <p
            style={{ fontSize: "clamp(0.8rem, 5.5cqi, 1.75rem)" }}
            className="font-black text-[var(--onicord-lavender)] tracking-tighter font-mono leading-none truncate mt-0.5"
          >
            {activeConnectionsCount > 0 ? `${ping}ms` : "0ms"}
          </p>
        </div>
      </div>

      {/* GRÁFICO INFERIOR HISTORIOGRÁFICO AUTOCALIBRADO */}
      <div
        ref={containerRef}
        className="h-[40%] w-full flex items-end justify-between gap-[2.5px] mt-1 pt-2 border-t border-white/5 relative overflow-hidden"
      >
        {visibleHistory.map((rawCpuValue, idx) => {
          const isLast = idx === visibleHistory.length - 1;

          const pctVisual = (rawCpuValue / cpuMax) * 100;

          const heightBar = Math.max(6, Math.min(100, pctVisual));

          return (
            <div
              key={idx}
              className="flex-1 h-full min-w-[3px] bg-white/[0.01] rounded-full relative"
            >
              <div
                style={{ height: `${heightBar}%` }}
                className={`absolute bottom-0 left-0 right-0 rounded-full transition-all duration-300 ease-out ${
                  isLast
                    ? "bg-[#c3a9ff] shadow-md shadow-[#c3a9ff]/40 opacity-100"
                    : "bg-onicord-sapphire opacity-35"
                }`}
                title={t("widgets.hardware.cpuTooltip", { cpu: rawCpuValue, max: cpuMax })}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

HardwareWidget.widgetId = "hardware";
HardwareWidget.badgeText = "Hardware & Channels";
HardwareWidget.bgVariant = "dark";
HardwareWidget.defaultGeo = { x: 1, y: 1, w: 4, h: 3 };
HardwareWidget.minW = 4;
HardwareWidget.minH = 2;
