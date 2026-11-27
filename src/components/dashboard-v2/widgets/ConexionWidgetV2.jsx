import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useWidgetLayout } from "../WidgetLayoutContext";
import WidgetShell from "../primitives/WidgetShell";
import HeroMetric from "../primitives/HeroMetric";
import RadialTickGauge from "../primitives/RadialTickGauge";

export default function ConexionWidgetV2({
  connectedServer,
  activeConnectionsCount = 0,
  peers = [],
  ping = 0,
  profile,
  isActive = true,
}) {
  const { t } = useTranslation();
  const { sizeMode } = useWidgetLayout();
  const canvasRef = useRef(null);
  const hostRef = useRef(null);
  const imageCache = useRef({});
  const timeRef = useRef(0);
  const particlesRef = useRef([]);
  const [, setImgTick] = useState(0);

  const onlinePeers = useMemo(
    () => (peers || []).filter((p) => p.online !== false),
    [peers]
  );

  const meshQuality = useMemo(() => {
    if (!connectedServer) return 0;
    if (activeConnectionsCount === 0) return 100;
    const penalty = Math.max(0, Math.min(45, (ping / 150) * 100));
    return Math.round(100 - penalty);
  }, [connectedServer, activeConnectionsCount, ping]);

  const getLoadedImage = (url) => {
    if (!url) return null;
    if (imageCache.current[url]) return imageCache.current[url];
    const img = new Image();
    img.src = url;
    img.onload = () => {
      imageCache.current[url] = img;
      setImgTick((v) => v + 1);
    };
    return null;
  };

  useEffect(() => {
    if (!isActive || sizeMode === "micro") {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let rafId;

    const syncCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      const targetW = Math.round(w * dpr);
      const targetH = Math.round(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }
      ctx.setTransform(targetW / w, 0, 0, targetH / h, 0, 0);
      return { width: w, height: h };
    };

    syncCanvasSize();
    const obs = new ResizeObserver(syncCanvasSize);
    obs.observe(canvas);
    if (canvas.parentElement) obs.observe(canvas.parentElement);

    const render = () => {
      timeRef.current += 0.016;
      const dims = syncCanvasSize();
      if (!dims) {
        rafId = requestAnimationFrame(render);
        return;
      }
      const { width, height } = dims;

      ctx.clearRect(0, 0, width, height);

      const hostStyle = hostRef.current ? getComputedStyle(hostRef.current) : null;
      const inkColor = hostStyle?.color || "#cdd6f4";
      const rootStyle = getComputedStyle(document.documentElement);
      const accentColor = rootStyle.getPropertyValue("--onicord-accent").trim() || inkColor;

      const cx = width / 2;
      const cy = height / 2;
      const minDim = Math.min(width, height);
      const localR = Math.max(8, Math.min(24, minDim * 0.16));
      const peerR = Math.max(6, Math.min(17, localR * 0.72));
      const bobAmp = Math.min(3, minDim * 0.02);
      const maxOrbitR = Math.max(localR + 4, minDim / 2 - peerR - bobAmp - 3);
      const orbitR = Math.min(maxOrbitR, Math.max(localR + peerR + 4, minDim * 0.34));

      // Ambient orbital rings (strictly circular 1:1)
      ctx.save();
      ctx.strokeStyle = inkColor;
      ctx.globalAlpha = 0.12;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.07;
      ctx.beginPath();
      ctx.arc(cx, cy, orbitR * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const peerNodes = onlinePeers.map((p, idx) => {
        const angle = (idx * Math.PI * 2) / Math.max(1, onlinePeers.length) + timeRef.current * 0.16;
        const r = orbitR + Math.sin(timeRef.current * 2 + idx) * bobAmp;
        return {
          ...p,
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
        };
      });

      if (connectedServer && peerNodes.length > 0 && Math.random() < 0.09) {
        const target = peerNodes[Math.floor(Math.random() * peerNodes.length)];
        particlesRef.current.push({
          tx: target.x,
          ty: target.y,
          p: 0,
          speed: 0.018 + Math.random() * 0.012,
          dir: Math.random() < 0.5 ? 1 : -1,
        });
      }

      // Lines & particles
      if (connectedServer) {
        peerNodes.forEach((p) => {
          ctx.save();
          ctx.strokeStyle = inkColor;
          ctx.globalAlpha = 0.28;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.restore();
        });

        for (let i = particlesRef.current.length - 1; i >= 0; i--) {
          const pt = particlesRef.current[i];
          pt.p += pt.speed;
          if (pt.p >= 1) {
            particlesRef.current.splice(i, 1);
            continue;
          }
          const tVal = pt.dir > 0 ? pt.p : 1 - pt.p;
          const px = cx + (pt.tx - cx) * tVal;
          const py = cy + (pt.ty - cy) * tVal;
          ctx.save();
          ctx.fillStyle = inkColor;
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      // Local Center Node
      ctx.save();
      ctx.fillStyle = connectedServer ? accentColor : inkColor;
      ctx.globalAlpha = connectedServer ? 0.2 : 0.12;
      const pulse = connectedServer ? Math.abs(Math.sin(timeRef.current * 2.5)) * 5 : 0;
      ctx.beginPath();
      ctx.arc(cx, cy, localR + pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = connectedServer ? 0.95 : 0.25;
      ctx.beginPath();
      ctx.arc(cx, cy, localR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const localImg = getLoadedImage(profile?.avatar);
      if (localImg) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, localR - 1, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(localImg, cx - localR, cy - localR, localR * 2, localR * 2);
        ctx.restore();
      } else {
        ctx.save();
        ctx.fillStyle = inkColor;
        ctx.font = `900 ${Math.max(8, Math.round(localR * 0.55))}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(connectedServer ? "ME" : "Zz", cx, cy);
        ctx.restore();
      }

      // Peer nodes
      if (connectedServer) {
        peerNodes.forEach((p) => {
          ctx.save();
          ctx.strokeStyle = inkColor;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, peerR + 1.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          const img = getLoadedImage(p.avatar);
          if (img) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(p.x, p.y, peerR, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, p.x - peerR, p.y - peerR, peerR * 2, peerR * 2);
            ctx.restore();
          } else {
            ctx.save();
            ctx.fillStyle = inkColor;
            ctx.globalAlpha = 0.16;
            ctx.beginPath();
            ctx.arc(p.x, p.y, peerR, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.95;
            ctx.font = `800 ${Math.max(8, Math.round(peerR * 0.75))}px system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText((p.nickname || "P").charAt(0).toUpperCase(), p.x, p.y);
            ctx.restore();
          }
        });
      }

      rafId = requestAnimationFrame(render);
    };

    render();
    return () => {
      cancelAnimationFrame(rafId);
      obs.disconnect();
    };
  }, [onlinePeers, connectedServer, isActive, sizeMode, profile?.avatar]);

  const statusBadge = (
    <span className="bento-v2-pill font-mono">
      {connectedServer ? `${ping}ms` : t("widgets.connection.idleShort", "IDLE")}
    </span>
  );

  // MICRO mode
  if (sizeMode === "micro") {
    return (
      <WidgetShell>
        <div className="flex-1 flex flex-col justify-between min-h-0">
          <span className="bento-v2-label-micro bento-v2-ink-muted">MESH</span>
          <HeroMetric
            value={connectedServer ? ping : t("widgets.connection.idleShort", "IDLE")}
            unit={connectedServer ? "ms" : ""}
            sublabel={t("widgets.connection.peersCount", "{{count}} peers", { count: onlinePeers.length })}
            sizeScale="md"
          />
        </div>
      </WidgetShell>
    );
  }

  // COMPACT mode: Live floating-avatars radar + sleek single-line caption
  if (sizeMode === "compact") {
    return (
      <WidgetShell title={t("widgets.connection.meshConnection", "Mesh Connection")} headerRight={statusBadge}>
        <div ref={hostRef} className="flex-1 flex flex-col min-h-0">
          <div className="relative flex-1 min-h-0" data-no-drag="true">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          </div>
          <div className="flex items-center justify-between gap-2 text-2xs font-mono font-bold bento-v2-ink-muted shrink-0 pt-1">
            <span className="truncate">
              {t("widgets.connection.peersCount", "{{count}} peers", { count: onlinePeers.length })}
            </span>
            <span className="shrink-0">{meshQuality}%</span>
          </div>
        </div>
      </WidgetShell>
    );
  }

  // STRIP mode: Latency hero + live floating-avatars orbit
  if (sizeMode === "strip") {
    return (
      <WidgetShell title={t("widgets.connection.meshConnection", "Mesh Connection")} headerRight={statusBadge}>
        <div className="flex-1 flex items-center gap-3 min-h-0">
          <HeroMetric
            value={connectedServer ? ping : t("widgets.connection.idleShort", "IDLE")}
            unit={connectedServer ? "ms" : ""}
            sublabel={`${t("widgets.connection.peersCount", "{{count}} peers", { count: onlinePeers.length })} · ${meshQuality}%`}
            sizeScale="sm"
          />
          <div ref={hostRef} className="relative flex-1 h-full min-w-0 min-h-0" data-no-drag="true">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          </div>
        </div>
      </WidgetShell>
    );
  }

  // PILLAR / STANDARD / EXPANDED
  return (
    <WidgetShell
      title={t("widgets.connection.meshConnection", "Mesh Connection")}
      headerRight={statusBadge}
      footer={
        <div className="flex items-center justify-between gap-2 text-2xs font-mono font-bold bento-v2-ink-muted">
          <span className="truncate">
            {connectedServer
              ? activeConnectionsCount > 0
                ? onlinePeers.map((p) => p.nickname).join(", ")
                : t("widgets.connection.searchingPeers", "Searching peers in DHT...")
              : t("widgets.connection.offline", "OFFLINE")}
          </span>
          <span className="shrink-0">{meshQuality}%</span>
        </div>
      }
    >
      <div
        ref={hostRef}
        className={
          sizeMode === "expanded"
            ? "flex-1 grid grid-cols-2 gap-3 min-h-0"
            : "flex-1 flex flex-col min-h-0"
        }
      >
        <div className="relative flex-1 min-h-0" data-no-drag="true">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        </div>

        {sizeMode === "expanded" && (
          <div className="flex flex-col gap-2 min-h-0 overflow-y-auto bento-v2-no-scrollbar">
            <div className="h-24 shrink-0">
              <RadialTickGauge
                value={meshQuality}
                centerContent={
                  <span className="text-lg font-black font-mono">{meshQuality}%</span>
                }
              />
            </div>
            <div className="space-y-1.5">
              {onlinePeers.map((p) => (
                <div
                  key={p.id}
                  className="px-2.5 py-1.5 rounded-onicord-button bento-v2-ink-track flex items-center justify-between gap-2"
                >
                  <span className="text-xs font-bold truncate">{p.nickname || "Peer"}</span>
                  <span className="text-2xs font-mono font-bold bento-v2-ink-muted shrink-0">
                    {p.ping != null ? `${p.ping}ms` : "--"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </WidgetShell>
  );
}
