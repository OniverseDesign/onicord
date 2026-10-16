import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export default function ConexionWidget({
  connectedServer,
  activeConnectionsCount = 0,
  peers = [],
  ping = 0,
  profile,
}) {
  const { t } = useTranslation();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [loadedImages, setLoadedImages] = useState({});
  const imageCache = useRef({});
  const onlinePeers = (peers || []).filter((p) => p.online !== false);

  const getLoadedImage = (url) => {
    if (!url) return null;
    if (imageCache.current[url]) {
      return imageCache.current[url];
    }
    const img = new Image();
    img.src = url;
    img.onload = () => {
      imageCache.current[url] = img;
      setLoadedImages((prev) => ({ ...prev, [url]: true }));
    };
    return null;
  };

  // Calculate mesh connection quality
  const calcularCalidadMalla = () => {
    if (!connectedServer) return 0;
    if (activeConnectionsCount === 0) return 100;
    const penalizacionPing = Math.max(0, Math.min(45, (ping / 150) * 100));
    return Math.round(100 - penalizacionPing);
  };

  const calidadMalla = calcularCalidadMalla();
  const timeRef = useRef(0);
  const particlesRef = useRef([]);
  const ripplesRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animationFrameId;

    // Handle canvas sizing dynamically
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Animation/Render loop
    const render = () => {
      timeRef.current += 0.015;
      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      ctx.clearRect(0, 0, width, height);
      if (!width || !height) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      const centerX = width / 2;
      const centerY = height / 2 - 10;
      const localNodeRadius = 22;
      const peerNodeRadius = 16;

      // Center node drift animation
      const localDriftX = connectedServer ? Math.sin(timeRef.current * 1.5) * 3 : 0;
      const localDriftY = connectedServer ? Math.cos(timeRef.current * 1.2) * 3 : 0;
      const localCenterX = centerX + localDriftX;
      const localCenterY = centerY + localDriftY;

      // Determine orbital radius based on container size
      const maxRadius = Math.min(width, height) * 0.35;
      const orbitRadius = Math.max(45, Math.min(110, maxRadius));

      // Draw background ambient grids or rings
      ctx.beginPath();
      ctx.arc(centerX, centerY, orbitRadius, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Setup connected peers positions and drift animation
      const connectedPeers = onlinePeers.map((p, index) => {
        const count = onlinePeers.length;
        const baseAngle = (index * 2 * Math.PI) / count;
        // Orbit speed slower for outer nodes
        const currentAngle = baseAngle + timeRef.current * 0.15;
        const drift = Math.sin(timeRef.current * 2 + index) * 6;
        const radiusWithDrift = orbitRadius + drift;

        return {
          id: p.id,
          nickname: p.nickname || "Peer",
          avatar: p.avatar,
          x: centerX + Math.cos(currentAngle) * radiusWithDrift,
          y: centerY + Math.sin(currentAngle) * radiusWithDrift,
          ping: p.ping !== undefined && p.ping !== null ? p.ping : null,
        };
      });

      // Spawn particles along the lines (with random direction for two-way flow)
      if (connectedServer && connectedPeers.length > 0 && Math.random() < 0.08) {
        const targetPeer = connectedPeers[Math.floor(Math.random() * connectedPeers.length)];
        const direction = Math.random() < 0.5 ? "to" : "from";
        particlesRef.current.push({
          x: targetPeer.x,
          y: targetPeer.y,
          peer: targetPeer,
          progress: 0,
          speed: 0.015 + Math.random() * 0.01,
          direction: direction,
        });
      }

      // Update and draw connection lines + animated particles
      if (connectedServer) {
        connectedPeers.forEach((p) => {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(localCenterX, localCenterY);

          // Line gradient based on quality
          const qualityColor = p.ping < 90 ? "rgba(16, 185, 129, 0.3)" : p.ping < 200 ? "rgba(245, 158, 11, 0.3)" : "rgba(239, 68, 68, 0.3)";

          ctx.strokeStyle = qualityColor;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });

        // Draw animated particles (bidirectional ida y vuelta)
        for (let i = particlesRef.current.length - 1; i >= 0; i--) {
          const pt = particlesRef.current[i];
          pt.progress += pt.speed;
          if (pt.progress >= 1) {
            particlesRef.current.splice(i, 1);
            continue;
          }

          let px, py;
          if (pt.direction === "from") {
            px = localCenterX + (pt.x - localCenterX) * pt.progress;
            py = localCenterY + (pt.y - localCenterY) * pt.progress;
          } else {
            px = pt.x + (localCenterX - pt.x) * pt.progress;
            py = pt.y + (localCenterY - pt.y) * pt.progress;
          }

          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, 2 * Math.PI);
          ctx.fillStyle = pt.peer.ping < 90 ? "#10B981" : pt.peer.ping < 200 ? "#F59E0B" : "#EF4444";
          ctx.shadowBlur = 6;
          ctx.shadowColor = ctx.fillStyle;
          ctx.fill();
          ctx.shadowBlur = 0; // reset
        }
      }

      // Spawn water ripples periodically
      if (connectedServer && Math.random() < 0.015) {
        ripplesRef.current.push({
          x: localCenterX,
          y: localCenterY,
          radius: localNodeRadius,
          minRadius: localNodeRadius,
          maxRadius: localNodeRadius + 45,
          speed: 0.6 + Math.random() * 0.4,
        });
      }

      // Update and draw water ripples (ondas)
      const ripples = ripplesRef.current;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.radius += rp.speed;
        if (rp.radius >= rp.maxRadius) {
          ripples.splice(i, 1);
          continue;
        }

        const progress = (rp.radius - rp.minRadius) / (rp.maxRadius - rp.minRadius);
        const opacity = 0.25 * (1 - progress);

        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.radius, 0, 2 * Math.PI);
        ctx.strokeStyle = `rgba(139, 92, 246, ${opacity})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Draw local node (pulse effect) at localCenterX/Y
      if (connectedServer) {
        const pulse = Math.abs(Math.sin(timeRef.current * 3)) * 4;

        // Outer glowing ring
        ctx.beginPath();
        ctx.arc(localCenterX, localCenterY, localNodeRadius + pulse, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(139, 92, 246, 0.15)";
        ctx.fill();
        ctx.strokeStyle = "rgba(139, 92, 246, 0.25)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Main node circle
        ctx.beginPath();
        ctx.arc(localCenterX, localCenterY, localNodeRadius, 0, 2 * Math.PI);
        ctx.fillStyle = "rgb(139, 92, 246)";
        ctx.shadowBlur = 8;
        ctx.shadowColor = "rgba(139, 92, 246, 0.6)";
        ctx.fill();
        ctx.shadowBlur = 0; // reset

        const localImg = getLoadedImage(profile?.avatar);
        if (localImg) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(localCenterX, localCenterY, localNodeRadius, 0, 2 * Math.PI);
          ctx.clip();
          ctx.drawImage(localImg, localCenterX - localNodeRadius, localCenterY - localNodeRadius, localNodeRadius * 2, localNodeRadius * 2);
          ctx.restore();
        } else {
          // Draw owner/me text icon in local node
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 9px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("ME", localCenterX, localCenterY);
        }
      } else {
        // Idle central node (grey/sleeping)
        ctx.beginPath();
        ctx.arc(localCenterX, localCenterY, localNodeRadius, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Zz", localCenterX, localCenterY);
      }

      // Draw peer nodes
      if (connectedServer) {
        connectedPeers.forEach((p) => {
          // Node glow based on ping
          ctx.beginPath();
          ctx.arc(p.x, p.y, peerNodeRadius + 2, 0, 2 * Math.PI);
          ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
          ctx.fill();
          ctx.strokeStyle = p.ping < 90 ? "rgba(16, 185, 129, 0.4)" : p.ping < 200 ? "rgba(245, 158, 11, 0.4)" : "rgba(239, 68, 68, 0.4)";
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Draw avatar image or initial
          let drawnImage = false;
          const img = getLoadedImage(p.avatar);
          if (img) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(p.x, p.y, peerNodeRadius, 0, 2 * Math.PI);
            ctx.clip();
            ctx.drawImage(img, p.x - peerNodeRadius, p.y - peerNodeRadius, peerNodeRadius * 2, peerNodeRadius * 2);
            ctx.restore();
            drawnImage = true;
          }

          if (!drawnImage) {
            // Gradient initial bubble
            const gradient = ctx.createLinearGradient(p.x - 10, p.y - 10, p.x + 10, p.y + 10);
            gradient.addColorStop(0, "rgba(255, 255, 255, 0.08)");
            gradient.addColorStop(1, "rgba(255, 255, 255, 0.02)");

            ctx.beginPath();
            ctx.arc(p.x, p.y, peerNodeRadius, 0, 2 * Math.PI);
            ctx.fillStyle = gradient;
            ctx.fill();

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 10px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(p.nickname.charAt(0).toUpperCase(), p.x, p.y);
          }

          // Draw small ping badge floating on top of the node if it has ping data
          const hasPing = p.ping !== undefined && p.ping !== null;
          if (hasPing) {
            const pingText = `${p.ping}ms`;
            ctx.font = "bold 10px system-ui, sans-serif";
            const tw = ctx.measureText(pingText).width;
            const padX = 3;
            const padY = 1.5;
            const bw = tw + padX * 3;
            const bh = 16;
            const bx = p.x - bw / 2;
            const by = p.y - peerNodeRadius - bh / 2 - 3;

            ctx.beginPath();
            ctx.roundRect(bx, by, bw, bh, 3);
            ctx.fillStyle = "rgba(10, 10, 10, 0.85)";
            ctx.fill();
            ctx.strokeStyle = p.ping < 90 ? "rgba(16, 185, 129, 0.6)" : p.ping < 200 ? "rgba(245, 158, 11, 0.6)" : "rgba(239, 68, 68, 0.6)";
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 10px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(pingText, p.x, by + bh / 2);
          }
        });
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, [onlinePeers, connectedServer, ping]);

  return (
    <div
      ref={containerRef}
      style={{ containerType: "inline-size" }}
      className="onicord-widget-shell w-full h-full p-5 flex flex-col justify-between select-none relative overflow-hidden"
    >
      {/* Title Header */}
      <div className="onicord-widget-header flex justify-between items-center w-full gap-2 shrink-0 z-10">
        <h3
          style={{ fontSize: "clamp(0.6rem, 3.5cqi, 0.8rem)" }}
          className="onicord-widget-title font-bold text-onicord-dark/90 truncate"
        >
          {t("widgets.connection.meshConnection", "Mesh Connection")}
        </h3>
        <span
          style={{ fontSize: "clamp(0.6rem, 3cqi, 0.5rem)" }}
          className="onicord-widget-badge-fixed shrink-0 px-2 py-0.5 font-medium"
        >
          MAP
        </span>
      </div>

      {/* Interactive Swarm Canvas */}
      <div
        className="flex-1 w-full relative min-h-[90px]"
        onPointerDown={(e) => e.stopPropagation()} // Stop dragging card when clicking canvas
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-default"
        />
      </div>

      {/* Connection Info Footer */}
      <div className="onicord-widget-footer-sep !pt-1 gap-2 flex flex-col z-10 shrink-0">
        {connectedServer ? (
          <div className="flex w-full justify-between items-center font-mono font-bold uppercase text-[9px] text-onicord-dark-muted">
            <span className="truncate max-w-[70%]">
              {t("widgets.connection.swarm", "Swarm:")}{" "}
              {activeConnectionsCount > 0
                ? onlinePeers.map((p) => p.nickname).join(", ")
                : t("widgets.connection.searchingPeers", "Searching...")}
            </span>
            <span className="shrink-0 text-onicord-dark-sub">{ping}ms</span>
          </div>
        ) : (
          <div className="flex w-full justify-between items-center font-mono font-bold uppercase text-[9px] text-onicord-dark-muted">
            <span>{t("widgets.connection.idleNode", "IDLE NODE")}</span>
            <span className="text-red-400/80">{t("widgets.connection.offline", "OFFLINE")}</span>
          </div>
        )}

        {/* Progress Bar showing mesh health */}
        <div className="h-1 w-full rounded-full overflow-hidden bg-black/10">
          <div
            style={{ width: `${connectedServer ? calidadMalla : 0}%` }}
            className="h-full transition-all duration-700 ease-out bg-onicord-dark rounded-full"
          />
        </div>
      </div>
    </div>
  );
}

ConexionWidget.widgetId = "conexion";
ConexionWidget.badgeText = "Persistent Connection";
ConexionWidget.bgVariant = "sapphire";
ConexionWidget.defaultGeo = { x: 5, y: 1, w: 2, h: 3 };
ConexionWidget.minW = 1;
ConexionWidget.minH = 2;
