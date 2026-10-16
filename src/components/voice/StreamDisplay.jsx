import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import MaterialIcon from "../icons/MaterialIcon";

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
  const inactivityTimeoutRef = useRef(null);

  const [position, setPosition] = useState({
    x: window.innerWidth - 360,
    y: window.innerHeight - 250,
  });
  const isDragging = useRef(false);
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  useEffect(() => {
    if (!isMini) return;
    const handleResize = () => {
      setPosition((prev) => {
        const maxX = window.innerWidth - 355;
        const maxY = window.innerHeight - 205;
        return {
          x: Math.max(10, Math.min(prev.x, maxX)),
          y: Math.max(10, Math.min(prev.y, maxY)),
        };
      });
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

  useEffect(() => {
    if (videoRef.current) {
      const hasAudioTrack =
        videoRef.current.srcObject?.getAudioTracks().length > 0;
      videoRef.current.volume = isLocal || isMuted || !hasAudioTrack ? 0 : volume / 100;
    }
  }, [volume, isMuted, isLocal]);

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
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    const deltaX = e.clientX - lastPointerPos.current.x;
    const deltaY = e.clientY - lastPointerPos.current.y;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      hasMoved.current = true;
    }

    setPosition((prev) => {
      const nextX = Math.max(
        10,
        Math.min(prev.x + deltaX, window.innerWidth - 350),
      );
      const shadowY = Math.max(
        10,
        Math.min(prev.y + deltaY, window.innerHeight - 200),
      );
      return { x: nextX, y: shadowY };
    });
    lastPointerPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e) => {
    isDragging.current = false;
  };

  if (isMini) {
    if (IsPipClosed) return null;

    return (
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        className="fixed bg-onicord-surface w-[340px] h-[190px] rounded-onicord-inner overflow-hidden border-2 border-[var(--accent-purple)] shadow-2xl z-50 cursor-move group hover:scale-[1.01] transition-all duration-75 touch-none select-none"
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
                  className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-onicord-surface text-onicord-text hover:bg-onicord-overlay hover:text-white transition duration-150 shadow-md"
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
              className="flex h-7 w-7 items-center justify-center rounded-full bg-onicord-surface text-onicord-text hover:bg-onicord-overlay hover:text-white transition duration-150 shadow-md cursor-pointer"
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
      className={`w-full h-full overflow-hidden relative flex items-center justify-center transition-all duration-200 select-none bg-black ${
        isFullscreen
          ? "w-screen h-screen max-w-none max-h-none rounded-none border-none"
          : "aspect-video max-w-[90vw] max-h-[80vh] rounded-onicord-inner border border-white/5 shadow-2xl"
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
        className={`absolute top-4 left-4 flex items-center gap-2 bg-black/80 border border-white/10 px-3.5 py-1.5 rounded-full text-xs shadow-2xl backdrop-blur-md select-none transition-all duration-300 pointer-events-auto ${
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
      <div
        style={{ zIndex: 999999, transform: "translate3d(0, 0, 50px)" }}
        className={`absolute bottom-6 left-0 right-0 flex justify-center select-none px-4 transition-all duration-300 ${
          isFullscreen && !showControls
            ? "opacity-0 translate-y-6 pointer-events-none"
            : "opacity-100 translate-y-0 pointer-events-auto"
        }`}
      >
        <div className="onicord-media-control-bar max-w-[90%] mx-auto shadow-2xl border border-white/20 bg-onicord-surface/90">
          {/* Audio Volume */}
          <div className="flex items-center gap-2 border-r border-white/10 pr-2">
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className={`onicord-icon-btn-round ${
                isMuted ? "bg-onicord-danger/20 text-onicord-danger border-onicord-danger/40" : "text-white"
              }`}
              title={isMuted ? t("voice.unmuteAudio") : t("voice.muteAudio")}
            >
              {isMuted ? (
                <IconVolumeOff size="base" />
              ) : (
                <IconVolumeUp size="base" />
              )}
            </button>

            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => {
                setVolume(Number(e.target.value));
                if (isMuted) setIsMuted(false);
              }}
              className="w-18 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-onicord-accent"
              style={{
                backgroundImage: `linear-gradient(to right, rgb(var(--onicord-lavender)) ${volume}%, rgba(255,255,255,0.2) ${volume}%)`,
              }}
            />
          </div>

          {/* Switch to Floating PiP view button */}
          {onToggleSize && (
            <button
              type="button"
              onClick={onToggleSize}
              className="onicord-media-bar-btn"
              title={t("voice.viewChat")}
            >
              <IconFullscreenExit size="base" />
              <span>{t("voice.viewChat")}</span>
            </button>
          )}

          {/* Toggle Fullscreen button */}
          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className={`onicord-icon-btn-round ${isFullscreen ? "bg-sky-500/20 text-sky-400 border-sky-500/40" : "text-white"}`}
              title={
                isFullscreen
                  ? t("voice.exitFullScreen")
                  : t("voice.fullScreen")
              }
            >
              {isFullscreen ? (
                <IconFullscreenExit size="base" />
              ) : (
                <IconFullscreen size="base" />
              )}
            </button>
          )}

          {/* Stop Stream / Close View button */}
          <button
            type="button"
            onClick={onStopStream}
            className="onicord-icon-btn-round-stop"
            title={t("voice.stopStream")}
          >
            <IconStopStream size="base" />
          </button>
        </div>
      </div>
    </div>
  );

  if (isFullscreen) {
    return renderPlayer();
  }

  return (
    <div className="flex-1 flex flex-col p-4 min-h-0 min-w-0 relative select-none items-center justify-center bg-onicord-surface">
      {renderPlayer()}
    </div>
  );
}
