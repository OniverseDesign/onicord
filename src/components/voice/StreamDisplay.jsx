import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import MaterialIcon from "../icons/MaterialIcon";
import FloatingMediaBar from "../ui/FloatingMediaBar";

import {
  IconClose,
  IconExpand,
  IconCollapse,
  IconVolumeUp,
  IconVolumeOff,
  IconStopStream,
  IconFullscreen,
  IconFullscreenExit,
} from "../icons/StreamIcons";

export default function StreamDisplay({
  localStream,
  streamAuthorName,
  onStopStream,
  isMini = false,
  onToggleSize = null,
  isLocal = true,
  isFullscreen = false,
  onToggleFullscreen = null,
}) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(() => isLocal);
  const [IsPipClosed, setIsPipClosed] = useState(false);

  const [showControls, setShowControls] = useState(true);
  const [duckMultiplier, setDuckMultiplier] = useState(1.0);
  const inactivityTimeoutRef = useRef(null);

  useEffect(() => {
    const handleDucking = (e) => {
      const mult = e.detail?.duckMultiplier ?? 1.0;
      setDuckMultiplier(mult);
    };
    window.addEventListener("voice-ducking-change", handleDucking);
    return () => window.removeEventListener("voice-ducking-change", handleDucking);
  }, []);

  const [position, setPosition] = useState(() => ({
    x: Math.max(10, (typeof window !== "undefined" ? window.innerWidth : 1280) - 360),
    y: Math.max(10, (typeof window !== "undefined" ? window.innerHeight : 720) - 250),
  }));
  const currentPos = useRef(position);
  const isDragging = useRef(false);
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const rafId = useRef(null);
  const pipContainerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isMini) return;
    const handleResize = () => {
      const maxX = Math.max(10, window.innerWidth - 355);
      const maxY = Math.max(10, window.innerHeight - 205);
      const currentX = Number.isFinite(currentPos.current?.x) ? currentPos.current.x : window.innerWidth - 360;
      const currentY = Number.isFinite(currentPos.current?.y) ? currentPos.current.y : window.innerHeight - 250;
      const nextX = Math.max(10, Math.min(currentX, maxX));
      const nextY = Math.max(10, Math.min(currentY, maxY));
      currentPos.current = { x: nextX, y: nextY };
      if (pipContainerRef.current) {
        pipContainerRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
      }
      setPosition({ x: nextX, y: nextY });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isMini]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !localStream) return;

    let cancelled = false;

    const attachStream = () => {
      if (cancelled) return;
      videoEl.srcObject = localStream;
      const hasAudioTrack = localStream.getAudioTracks().length > 0;
      videoEl.muted = isLocal || !hasAudioTrack ? true : isMuted;

      const playPromise = videoEl.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (!cancelled && err.name !== "AbortError") {
            console.log("[Stream Display] Error en playback:", err.message);
          }
        });
      }
    };

    attachStream();

    localStream.addEventListener("addtrack", attachStream);
    localStream.addEventListener("removetrack", attachStream);

    const videoTrack = localStream.getVideoTracks()[0];
    const handleUnmute = () => {
      if (videoEl && !cancelled) {
        videoEl.play().catch(() => {});
      }
    };

    if (videoTrack) {
      videoTrack.addEventListener("unmute", handleUnmute);
    }

    return () => {
      cancelled = true;
      if (videoEl) {
        videoEl.onloadedmetadata = null;
      }
      localStream.removeEventListener("addtrack", attachStream);
      localStream.removeEventListener("removetrack", attachStream);
      if (videoTrack) {
        videoTrack.removeEventListener("unmute", handleUnmute);
      }
    };
  }, [localStream, isLocal, isFullscreen]); // Re-attach when fullscreen state toggles

  // Handle muted state changes without touching srcObject/play lifecycle
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const hasAudioTrack = videoEl.srcObject?.getAudioTracks().length > 0;
    videoEl.muted = isLocal || !hasAudioTrack ? true : isMuted;
  }, [isMuted, isLocal]);

  // Handle volume changes with smooth transition and auto-ducking support
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const hasAudioTrack =
      videoEl.srcObject?.getAudioTracks().length > 0;
    if (isLocal || isMuted || !hasAudioTrack) {
      videoEl.volume = 0;
      return;
    }

    const baseVol = volume / 100;
    const targetVol = Math.max(0, Math.min(1, baseVol * duckMultiplier));

    let frameId;
    const step = () => {
      if (!videoRef.current) return;
      const curr = videoRef.current.volume;
      const delta = (targetVol - curr) * 0.25;
      if (Math.abs(delta) < 0.005) {
        videoRef.current.volume = targetVol;
      } else {
        videoRef.current.volume = Math.max(0, Math.min(1, curr + delta));
        frameId = requestAnimationFrame(step);
      }
    };
    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [volume, isMuted, isLocal, duckMultiplier]);

  useEffect(() => {
    if (!isFullscreen) {
      setShowControls(true);
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      return;
    }

    setShowControls(true);

    const resetTimer = () => {
      setShowControls(true);
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      inactivityTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    resetTimer();

    window.addEventListener("mousemove", resetTimer, { passive: true });
    window.addEventListener("pointermove", resetTimer, { passive: true });
    window.addEventListener("keydown", resetTimer, { passive: true });
    window.addEventListener("touchstart", resetTimer, { passive: true });

    return () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("pointermove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("touchstart", resetTimer);
    };
  }, [isFullscreen]);

  const toggleFullscreen = () => {
    if (onToggleFullscreen) {
      onToggleFullscreen();
    }
  };

  const handlePointerDown = (e) => {
    if (e.target.closest("button") || e.target.closest("input")) return;
    isDragging.current = true;
    hasMoved.current = false;
    lastPointerPos.current = { x: e.clientX, y: e.clientY };

    if (pipContainerRef.current) {
      try {
        pipContainerRef.current.setPointerCapture(e.pointerId);
      } catch (_) {}
      pipContainerRef.current.style.transition = "none";
      pipContainerRef.current.style.willChange = "transform";
    }
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    const deltaX = e.clientX - lastPointerPos.current.x;
    const deltaY = e.clientY - lastPointerPos.current.y;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      hasMoved.current = true;
    }

    lastPointerPos.current = { x: e.clientX, y: e.clientY };

    const maxX = Math.max(10, window.innerWidth - 350);
    const maxY = Math.max(10, window.innerHeight - 200);
    const nextX = Math.max(10, Math.min(currentPos.current.x + deltaX, maxX));
    const nextY = Math.max(10, Math.min(currentPos.current.y + deltaY, maxY));

    currentPos.current = { x: nextX, y: nextY };

    if (!rafId.current) {
      rafId.current = requestAnimationFrame(() => {
        if (pipContainerRef.current) {
          pipContainerRef.current.style.transform = `translate3d(${currentPos.current.x}px, ${currentPos.current.y}px, 0)`;
        }
        rafId.current = null;
      });
    }
  };

  const handlePointerUp = (e) => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    if (pipContainerRef.current) {
      pipContainerRef.current.style.transform = `translate3d(${currentPos.current.x}px, ${currentPos.current.y}px, 0)`;
      pipContainerRef.current.style.transition = "";
      pipContainerRef.current.style.willChange = "";
      try {
        if (e?.pointerId !== undefined && pipContainerRef.current.hasPointerCapture(e.pointerId)) {
          pipContainerRef.current.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
    }

    setPosition({ ...currentPos.current });
  };

  if (isMini) {
    if (IsPipClosed) return null;

    return (
      <div
        ref={pipContainerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        style={{
          top: 0,
          left: 0,
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        }}
        className="fixed bg-onicord-surface w-[340px] h-[190px] rounded-onicord-inner overflow-hidden border-2 border-[var(--accent-purple)] shadow-2xl z-50 cursor-move group hover:scale-[1.01] transition-transform duration-150 touch-none select-none"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          tabIndex="-1"
          disablePictureInPicture
          className="w-full h-full object-contain z-10"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/60 flex flex-col justify-between p-2 pointer-events-none z-20">
          <div className="flex items-center justify-between w-full">
            <span className="bg-black/75 px-2 py-0.5 rounded text-[10px] text-white font-semibold select-none pointer-events-none truncate">
              {streamAuthorName && streamAuthorName !== "Usuario" && streamAuthorName !== t("common.user")
                ? streamAuthorName
                : t("voice.liveStream")}
            </span>

            <div className="flex items-center gap-1.5">
              {onToggleSize && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (!hasMoved.current && onToggleSize) onToggleSize();
                  }}
                  className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-onicord-surface border border-white/5 text-onicord-text hover:bg-onicord-overlay hover:text-white transition duration-150 cursor-pointer"
                  title={t("voice.fullScreen")}
                >
                  <IconFullscreen size="lg" />
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-end pointer-events-auto">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                if (isLocal) {
                  setIsPipClosed(true);
                  if (onStopStream) onStopStream();
                } else {
                  // Reverting floating remote stream back to inline channel view
                  if (onToggleSize) onToggleSize();
                }
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-onicord-surface border border-onicord-danger/30 text-onicord-danger hover:bg-onicord-danger hover:text-white transition duration-150 cursor-pointer"
              title={isLocal ? t("voice.stopStream") : t("voice.closePiP", "Cerrar PiP")}
            >
              {isLocal ? (
                <IconStopStream size="lg" />
              ) : (
                <IconClose size={16} />
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const renderPlayer = () => (
    <div
      ref={containerRef}
      style={{ isolation: "isolate" }}
      className={`relative flex-1 w-full h-full min-h-0 min-w-0 flex flex-col select-none overflow-hidden bg-black ${
        isFullscreen
          ? "fixed inset-0 z-50 w-screen h-screen rounded-none border-none"
          : "rounded-onicord-inner border border-onicord-island group/stage"
      } ${isFullscreen && !showControls ? "cursor-none" : "cursor-default"}`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        tabIndex="-1"
        disablePictureInPicture
        className="w-full h-full object-contain z-0"
      />

      {/* Top left overlay badge - Se oculta tras 3s de inactividad en fullscreen */}
      <div
        style={{ zIndex: 999999, transform: "translate3d(0, 0, 50px)" }}
        className={`absolute top-4 left-4 flex items-center gap-2 bg-black/80 border border-white/10 px-3.5 py-1.5 rounded-full text-xs backdrop-blur-md select-none transition-all duration-300 pointer-events-auto ${
          isFullscreen && !showControls
            ? "opacity-0 -translate-y-4 pointer-events-none"
            : "opacity-100 translate-y-0 pointer-events-auto"
        }`}
      >
        <span className="font-semibold text-white">
          {t("voice.screenOf", { name: streamAuthorName || t("common.you") })}
        </span>
        <span className="onicord-live-badge">
          {t("common.live")}
        </span>
      </div>

      {/* Media control bar overlay - Se oculta tras 3s de inactividad en fullscreen */}
      <FloatingMediaBar visible={!isFullscreen || showControls}>
        {/* Audio Volume */}
        <FloatingMediaBar.Volume
          volume={volume}
          max={100}
          step={1}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted(!isMuted)}
          onVolumeChange={(val) => {
            setVolume(val);
            if (isMuted && val > 0) setIsMuted(false);
          }}
          titleMute={t("voice.muteAudio")}
          titleUnmute={t("voice.unmuteAudio")}
          customMuteIcon={<IconVolumeOff size="base" />}
          customUnmuteIcon={<IconVolumeUp size="base" />}
          showDividers={false}
          sliderClassName="w-18"
        />

        {/* Switch to Floating PiP view button */}
        {onToggleSize && (
          <FloatingMediaBar.PillButton
            icon={<IconFullscreenExit size="base" />}
            label={t("voice.viewChat")}
            title={t("voice.viewChat")}
            onClick={onToggleSize}
          />
        )}

        {/* Toggle Fullscreen button */}
        {onToggleFullscreen && (
          <FloatingMediaBar.IconButton
            icon={isFullscreen ? <IconFullscreenExit size="base" /> : <IconFullscreen size="base" />}
            title={isFullscreen ? t("voice.exitFullScreen") : t("voice.fullScreen")}
            active={isFullscreen}
            onClick={onToggleFullscreen}
          />
        )}

        {/* Stop Stream / Close View button */}
        <FloatingMediaBar.StopButton
          icon={<IconStopStream size="base" />}
          title={t("voice.stopStream")}
          onClick={onStopStream}
        />
      </FloatingMediaBar>
    </div>
  );

  return renderPlayer();
}
