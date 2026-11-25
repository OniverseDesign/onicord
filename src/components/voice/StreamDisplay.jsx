import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import MaterialIcon from "../icons/MaterialIcon";
import FloatingMediaBar from "../ui/FloatingMediaBar";


function useVoiceDucking() {
  const [duckMultiplier, setDuckMultiplier] = useState(1.0);

  useEffect(() => {
    const handleDucking = (e) => {
      setDuckMultiplier(e.detail?.duckMultiplier ?? 1.0);
    };
    window.addEventListener("voice-ducking-change", handleDucking);
    return () => window.removeEventListener("voice-ducking-change", handleDucking);
  }, []);

  return duckMultiplier;
}

function useFullscreenAutoHide(isFullscreen) {
  const [showControls, setShowControls] = useState(true);
  const inactivityTimeoutRef = useRef(null);

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

  return showControls;
}

function useFloatingPipDrag(isMini, containerRef) {
  const [position, setPosition] = useState(() => ({
    x: Math.max(10, (typeof window !== "undefined" ? window.innerWidth : 1280) - 360),
    y: Math.max(10, (typeof window !== "undefined" ? window.innerHeight : 720) - 250),
  }));
  const currentPos = useRef(position);
  const isDragging = useRef(false);
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);
  const rafId = useRef(null);

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
      if (containerRef.current) {
        containerRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
      }
      setPosition({ x: nextX, y: nextY });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isMini, containerRef]);

  const handlePointerDown = (e) => {
    if (!isMini) return;
    if (e.target.closest("button") || e.target.closest("input")) return;
    isDragging.current = true;
    hasMoved.current = false;
    lastPointerPos.current = { x: e.clientX, y: e.clientY };

    if (containerRef.current) {
      try {
        containerRef.current.setPointerCapture(e.pointerId);
      } catch (_) {}
      containerRef.current.style.transition = "none";
      containerRef.current.style.willChange = "transform";
    }
  };

  const handlePointerMove = (e) => {
    if (!isMini || !isDragging.current) return;
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
        if (containerRef.current) {
          containerRef.current.style.transform = `translate3d(${currentPos.current.x}px, ${currentPos.current.y}px, 0)`;
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

    if (containerRef.current) {
      if (isMini) {
        containerRef.current.style.transform = `translate3d(${currentPos.current.x}px, ${currentPos.current.y}px, 0)`;
      }
      containerRef.current.style.transition = "";
      containerRef.current.style.willChange = "";
      try {
        if (e?.pointerId !== undefined && containerRef.current.hasPointerCapture(e.pointerId)) {
          containerRef.current.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
    }

    setPosition({ ...currentPos.current });
  };

  return {
    position,
    hasMoved,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}

function useVideoStreamAttachment(videoRef, stream, { isLocal, isMuted, volume, duckMultiplier }) {
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  const duckMultiplierRef = useRef(duckMultiplier);
  duckMultiplierRef.current = duckMultiplier;

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !stream) return;

    let cancelled = false;

    const attachStream = () => {
      if (cancelled) return;
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }
      const hasAudioTrack = stream.getAudioTracks().length > 0;
      const mutedNow = isLocal || !hasAudioTrack ? true : isMutedRef.current;
      videoEl.muted = mutedNow;
      videoEl.volume = mutedNow
        ? 0
        : Math.max(0, Math.min(1, (volumeRef.current / 100) * duckMultiplierRef.current));

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

    stream.addEventListener("addtrack", attachStream);
    stream.addEventListener("removetrack", attachStream);

    const videoTrack = stream.getVideoTracks()[0];
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
      stream.removeEventListener("addtrack", attachStream);
      stream.removeEventListener("removetrack", attachStream);
      if (videoTrack) {
        videoTrack.removeEventListener("unmute", handleUnmute);
      }
    };
  }, [stream, isLocal, videoRef]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const hasAudioTrack = videoEl.srcObject?.getAudioTracks().length > 0;
    videoEl.muted = isLocal || !hasAudioTrack ? true : isMuted;
  }, [isMuted, isLocal, stream, videoRef]);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const hasAudioTrack = videoEl.srcObject?.getAudioTracks().length > 0;
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
  }, [volume, isMuted, isLocal, duckMultiplier, stream, videoRef]);
}

export default function StreamDisplay({
  localStream,
  streamAuthorName,
  onStopStream,
  isMini = false,
  onToggleSize = null,
  isLocal = true,
  isFullscreen = false,
  onToggleFullscreen = null,
  localStreamMode = "screen",
  isLocalWebcamActive = false,
  isWebcamBusy = false,
  webcamPosition = "bottom-right",
  webcamMirror = true,
  onToggleLocalWebcam = null,
  onChangeWebcamPosition = null,
  onToggleWebcamMirror = null,
}) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(() => isLocal);
  const [IsPipClosed, setIsPipClosed] = useState(false);
  const [isWebcamMenuOpen, setIsWebcamMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLocal || !isLocalWebcamActive || isMini) {
      setIsWebcamMenuOpen(false);
    }
  }, [isLocal, isLocalWebcamActive, isMini]);

  const duckMultiplier = useVoiceDucking();
  const showControls = useFullscreenAutoHide(isFullscreen);
  const {
    position,
    hasMoved,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useFloatingPipDrag(isMini, containerRef);

  const prevIsLocalRef = useRef(isLocal);
  useEffect(() => {
    if (prevIsLocalRef.current !== isLocal) {
      prevIsLocalRef.current = isLocal;
      setIsMuted(isLocal);
    }
  }, [isLocal]);

  useEffect(() => {
    setIsPipClosed(false);
  }, [localStream]);

  useVideoStreamAttachment(videoRef, localStream, {
    isLocal,
    isMuted,
    volume,
    duckMultiplier,
  });

  const toggleFullscreen = () => {
    if (onToggleFullscreen) {
      onToggleFullscreen();
    }
  };

  const containerStyle = isMini
    ? {
        top: 0,
        left: 0,
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
      }
    : { isolation: "isolate" };

  const containerClassName = isMini
    ? `${
        IsPipClosed ? "hidden" : ""
      } fixed bg-onicord-surface w-[340px] h-[190px] rounded-onicord-inner overflow-hidden border-2 border-[var(--accent-purple)] shadow-2xl z-50 cursor-move group hover:scale-[1.01] transition-transform duration-fast touch-none select-none`
    : `relative flex-1 w-full h-full min-h-0 min-w-0 flex flex-col select-none overflow-hidden bg-black ${
        isFullscreen
          ? "fixed inset-0 z-50 w-screen h-screen rounded-none border-none"
          : "rounded-onicord-inner border border-onicord-island group/stage"
      } ${isFullscreen && !showControls ? "cursor-none" : "cursor-default"}`;

  return (
    <div
      ref={containerRef}
      onPointerDown={isMini ? handlePointerDown : undefined}
      onPointerMove={isMini ? handlePointerMove : undefined}
      onPointerUp={isMini ? handlePointerUp : undefined}
      onPointerCancel={isMini ? handlePointerUp : undefined}
      style={containerStyle}
      className={containerClassName}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        tabIndex="-1"
        disablePictureInPicture
        className={`w-full h-full object-contain ${isMini ? "z-10" : "z-0"}`}
      />

      {isMini ? (
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/60 flex flex-col justify-between p-2 pointer-events-none z-20">
          <div className="flex items-center justify-between w-full">
            <span className="bg-onicord-scrim-heavy px-2 py-0.5 rounded text-2xs text-onicord-on-scrim font-semibold select-none pointer-events-none truncate">
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
                  className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-onicord-surface border border-onicord-border text-onicord-text hover:bg-onicord-overlay hover:text-onicord-text transition duration-fast cursor-pointer"
                  title={t("voice.fullScreen")}
                >
                  <MaterialIcon name="fullscreen" size="lg" />
                </button>
              )}
            </div>
          </div>

          <div className="flex justify-end items-center gap-1.5 pointer-events-auto">
            {isLocal && onToggleLocalWebcam && (
              <button
                type="button"
                disabled={isWebcamBusy}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (!hasMoved.current) {
                    onToggleLocalWebcam();
                  }
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition duration-fast cursor-pointer ${
                  isLocalWebcamActive
                    ? "bg-onicord-accent text-onicord-on-accent border-onicord-accent hover:brightness-110"
                    : "bg-onicord-surface border-onicord-on-scrim/10 text-onicord-text hover:bg-onicord-overlay hover:text-onicord-on-scrim"
                } ${isWebcamBusy ? "opacity-50 cursor-wait" : ""}`}
                title={
                  isLocalWebcamActive
                    ? t("voice.disableWebcam", "Desactivar webcam")
                    : t("voice.enableWebcam", "Activar webcam")
                }
              >
                <MaterialIcon
                  name={isLocalWebcamActive ? "videocam" : "videocam_off"}
                  size={16}
                />
              </button>
            )}

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
              className="flex h-7 w-7 items-center justify-center rounded-full bg-onicord-surface border border-onicord-danger/30 text-onicord-danger hover:bg-onicord-danger hover:text-onicord-on-danger transition duration-fast cursor-pointer"
              title={isLocal ? t("voice.stopStream") : t("voice.closePiP", "Cerrar PiP")}
            >
              {isLocal ? (
                <MaterialIcon name="cancel_presentation" size="lg" />
              ) : (
                <MaterialIcon name="close" size={16} />
              )}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Top left overlay badge - Hides after 3s of fullscreen inactivity */}
          <div
            style={{ zIndex: 45, transform: "translate3d(0, 0, 50px)" }}
            className={`absolute top-4 left-4 flex items-center gap-2 bg-onicord-scrim-heavy border border-onicord-on-scrim/10 px-3.5 py-1.5 rounded-full text-xs backdrop-blur-onicord-popover select-none transition-all duration-relaxed pointer-events-auto ${
              isFullscreen && !showControls
                ? "opacity-0 -translate-y-4 pointer-events-none"
                : "opacity-100 translate-y-0 pointer-events-auto"
            }`}
          >
            <span className="font-semibold text-onicord-on-scrim">
              {t("voice.screenOf", { name: streamAuthorName || t("common.you") })}
            </span>
            <span className="onicord-live-badge">
              {t("common.live")}
            </span>
          </div>

          {/* Media control bar overlay - Hides after 3s of fullscreen inactivity */}
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
              customMuteIcon={<MaterialIcon name="volume_off" size="base" />}
              customUnmuteIcon={<MaterialIcon name="volume_up" size="base" />}
              showDividers={false}
              sliderClassName="w-18"
            />

            {/* Live Webcam Toggle */}
            {isLocal && onToggleLocalWebcam && (
              <FloatingMediaBar.IconButton
                icon={isLocalWebcamActive ? "videocam" : "videocam_off"}
                title={
                  isLocalWebcamActive
                    ? t("voice.disableWebcam", "Desactivar webcam")
                    : t("voice.enableWebcam", "Activar webcam")
                }
                active={isLocalWebcamActive}
                disabled={isWebcamBusy}
                onClick={onToggleLocalWebcam}
              />
            )}

            {/* Live Webcam PiP Corner & Mirror Menu */}
            {isLocal &&
              isLocalWebcamActive &&
              (onChangeWebcamPosition || onToggleWebcamMirror) && (
                <FloatingMediaBar.Menu
                  icon="picture_in_picture_alt"
                  title={t("voice.webcamSettings", "Ajustes de Webcam")}
                  menuTitle={t("voice.webcamSettings", "Ajustes de Webcam")}
                  showTitle={true}
                  active={isWebcamMenuOpen}
                  isOpen={isWebcamMenuOpen}
                  onToggle={() => setIsWebcamMenuOpen((prev) => !prev)}
                  onClose={() => setIsWebcamMenuOpen(false)}
                  widthClass="w-52"
                >
                  {localStreamMode === "screen" && onChangeWebcamPosition && (
                    <>
                      {[
                        {
                          id: "top-left",
                          label: t("screenShare.posTopLeft", "Superior izquierda"),
                        },
                        {
                          id: "top-right",
                          label: t("screenShare.posTopRight", "Superior derecha"),
                        },
                        {
                          id: "bottom-left",
                          label: t("screenShare.posBottomLeft", "Inferior izquierda"),
                        },
                        {
                          id: "bottom-right",
                          label: t("screenShare.posBottomRight", "Inferior derecha"),
                        },
                      ].map((corner) => {
                        const selected = webcamPosition === corner.id;
                        return (
                          <button
                            key={corner.id}
                            type="button"
                            onClick={() => onChangeWebcamPosition(corner.id)}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer text-left ${
                              selected
                                ? "bg-onicord-accent/20 text-onicord-accent font-semibold"
                                : "text-onicord-subtext hover:bg-onicord-base/60 hover:text-onicord-text"
                            }`}
                          >
                            <span className="truncate pr-1">{corner.label}</span>
                            {selected && <MaterialIcon name="check" size={14} />}
                          </button>
                        );
                      })}
                      {onToggleWebcamMirror && (
                        <div className="my-1 border-t border-onicord-border" />
                      )}
                    </>
                  )}

                  {onToggleWebcamMirror && (
                    <button
                      type="button"
                      onClick={onToggleWebcamMirror}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer text-left ${
                        webcamMirror
                          ? "bg-onicord-accent/20 text-onicord-accent font-semibold"
                          : "text-onicord-subtext hover:bg-onicord-base/60 hover:text-onicord-text"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate pr-1">
                        <MaterialIcon name="flip" size={14} />
                        <span>{t("screenShare.webcamMirror", "Efecto espejo")}</span>
                      </span>
                      {webcamMirror && <MaterialIcon name="check" size={14} />}
                    </button>
                  )}
                </FloatingMediaBar.Menu>
              )}

            {/* Switch to Floating PiP view button */}
            {onToggleSize && (
              <FloatingMediaBar.PillButton
                icon={<MaterialIcon name="fullscreen_exit" size="base" />}
                label={t("voice.viewChat")}
                title={t("voice.viewChat")}
                onClick={onToggleSize}
              />
            )}

            {/* Toggle Fullscreen button */}
            {onToggleFullscreen && (
              <FloatingMediaBar.IconButton
                icon={isFullscreen ? <MaterialIcon name="fullscreen_exit" size="base" /> : <MaterialIcon name="fullscreen" size="base" />}
                title={isFullscreen ? t("voice.exitFullScreen") : t("voice.fullScreen")}
                active={isFullscreen}
                onClick={onToggleFullscreen}
              />
            )}

            {/* Stop Stream / Close View button */}
            <FloatingMediaBar.StopButton
              icon={<MaterialIcon name="cancel_presentation" size="base" />}
              title={t("voice.stopStream")}
              onClick={onStopStream}
            />
          </FloatingMediaBar>
        </>
      )}
    </div>
  );
}

function getMultiStreamGridClass(count, isMini) {
  if (count <= 1) return "grid-cols-1 grid-rows-1";
  if (count === 2) return isMini ? "grid-cols-2 grid-rows-1" : "grid-cols-1 sm:grid-cols-2 grid-rows-1";
  if (count <= 4) return "grid-cols-2 grid-rows-2";
  if (count <= 6) return "grid-cols-2 lg:grid-cols-3 grid-rows-2";
  return "grid-cols-3 auto-rows-fr";
}

function MultiStreamTile({
  entry,
  isSelectedAudio,
  isAudioMuted,
  volume,
  duckMultiplier,
  onSelect,
  isMini,
}) {
  const { t } = useTranslation();
  const tileVideoRef = useRef(null);
  const tileMuted = Boolean(entry.isLocal || !isSelectedAudio || isAudioMuted);

  useVideoStreamAttachment(tileVideoRef, entry.stream, {
    isLocal: entry.isLocal,
    isMuted: tileMuted,
    volume,
    duckMultiplier,
  });

  const authorLabel = entry.authorName || t("common.user");

  return (
    <div
      onClick={(e) => {
        if (isMini) return;
        e.stopPropagation();
        onSelect(entry.id);
      }}
      title={
        entry.isLocal
          ? t("voice.localStreamAudioMuted", "Tu transmisión (silenciada localmente)")
          : isSelectedAudio && !isAudioMuted
            ? t("voice.listeningStream", "Escuchando")
            : t("voice.clickToListenStream", "Haz clic para escuchar esta transmisión")
      }
      className={`relative w-full h-full min-h-0 min-w-0 overflow-hidden bg-onicord-scrim-heavy flex items-center justify-center transition-all duration-fast group/tile ${
        isMini ? "rounded-md border" : "rounded-onicord-inner border-2 cursor-pointer"
      } ${
        isSelectedAudio && !entry.isLocal
          ? "border-onicord-accent ring-2 ring-onicord-accent/40 shadow-lg"
          : isSelectedAudio
            ? "border-onicord-accent/70"
            : "border-onicord-on-scrim/10 hover:border-onicord-on-scrim/25"
      }`}
    >
      {entry.stream ? (
        <video
          ref={tileVideoRef}
          autoPlay
          playsInline
          muted={tileMuted}
          tabIndex="-1"
          disablePictureInPicture
          className="w-full h-full object-contain"
        />
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 text-onicord-muted p-3">
          <MaterialIcon name="videocam" size={isMini ? 16 : 28} className="animate-pulse text-onicord-accent/80" />
          {!isMini && (
            <span className="text-xs font-medium text-onicord-on-scrim/80 truncate max-w-[180px]">
              {authorLabel}
            </span>
          )}
        </div>
      )}

      {!isMini && (
        <>
          <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 bg-onicord-scrim-heavy border border-onicord-on-scrim/10 px-2.5 py-1 rounded-full text-xs backdrop-blur-onicord-popover pointer-events-none select-none max-w-[60%]">
            <span className="font-semibold text-onicord-on-scrim truncate">{authorLabel}</span>
            <span className="onicord-live-badge">{t("common.live")}</span>
          </div>

          <div className="absolute top-3 right-3 z-20 pointer-events-none select-none">
            {entry.isLocal ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-onicord-scrim-heavy border border-onicord-on-scrim/10 text-onicord-muted backdrop-blur-onicord-popover">
                <MaterialIcon name="volume_off" size="sm" />
              </span>
            ) : isSelectedAudio && !isAudioMuted ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-onicord-accent/30 border border-onicord-accent/60 text-onicord-on-scrim backdrop-blur-onicord-popover shadow">
                <MaterialIcon name="volume_up" size="sm" />
                <span>{t("voice.listeningStream", "Escuchando")}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-onicord-scrim-heavy border border-onicord-on-scrim/10 text-onicord-muted backdrop-blur-onicord-popover opacity-85 group-hover/tile:opacity-100">
                <MaterialIcon name="volume_off" size="sm" />
                <span className="hidden sm:inline">{t("voice.mutedStream", "Silenciada")}</span>
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function MultiStreamDisplay({
  streams = [],
  activeAudioId = null,
  onSelectAudio = () => {},
  onStopWatching,
  isMini = false,
  onToggleSize = null,
  isFullscreen = false,
  onToggleFullscreen = null,
}) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);

  const duckMultiplier = useVoiceDucking();
  const showControls = useFullscreenAutoHide(isFullscreen);
  const {
    position,
    hasMoved,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useFloatingPipDrag(isMini, containerRef);

  const activeEntry = streams.find((s) => s.id === activeAudioId) || null;
  const activeIsLocal = Boolean(activeEntry?.isLocal);

  const containerStyle = isMini
    ? {
        top: 0,
        left: 0,
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
      }
    : { isolation: "isolate" };

  const containerClassName = isMini
    ? "fixed bg-onicord-surface w-[340px] h-[190px] rounded-onicord-inner overflow-hidden border-2 border-[var(--accent-purple)] shadow-2xl z-50 cursor-move group hover:scale-[1.01] transition-transform duration-fast touch-none select-none"
    : `relative flex-1 w-full h-full min-h-0 min-w-0 flex flex-col select-none overflow-hidden bg-black ${
        isFullscreen
          ? "fixed inset-0 z-50 w-screen h-screen rounded-none border-none"
          : "rounded-onicord-inner border border-onicord-island group/stage"
      } ${isFullscreen && !showControls ? "cursor-none" : "cursor-default"}`;

  return (
    <div
      ref={containerRef}
      onPointerDown={isMini ? handlePointerDown : undefined}
      onPointerMove={isMini ? handlePointerMove : undefined}
      onPointerUp={isMini ? handlePointerUp : undefined}
      onPointerCancel={isMini ? handlePointerUp : undefined}
      style={containerStyle}
      className={containerClassName}
    >
      <div
        className={`w-full h-full min-h-0 grid ${getMultiStreamGridClass(streams.length, isMini)} ${
          isMini ? "p-1 gap-1" : "p-2.5 gap-2.5 pt-14 pb-16"
        }`}
      >
        {streams.map((entry) => (
          <MultiStreamTile
            key={entry.id}
            entry={entry}
            isSelectedAudio={activeAudioId === entry.id}
            isAudioMuted={isMuted}
            volume={volume}
            duckMultiplier={duckMultiplier}
            isMini={isMini}
            onSelect={(id) => {
              onSelectAudio(id);
              if (isMuted) setIsMuted(false);
            }}
          />
        ))}
      </div>

      {isMini ? (
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/60 flex flex-col justify-between p-2 pointer-events-none z-20">
          <div className="flex items-center justify-between w-full">
            <span className="bg-onicord-scrim-heavy px-2 py-0.5 rounded text-2xs text-onicord-on-scrim font-semibold select-none pointer-events-none truncate">
              {t("voice.multiStreamTitle", {
                count: streams.length,
                defaultValue: `Transmisiones del canal (${streams.length})`,
              })}
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
                  className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full bg-onicord-surface border border-onicord-border text-onicord-text hover:bg-onicord-overlay hover:text-onicord-text transition duration-fast cursor-pointer"
                  title={t("voice.fullScreen")}
                >
                  <MaterialIcon name="fullscreen" size="lg" />
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
                if (onToggleSize) onToggleSize();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-onicord-surface border border-onicord-danger/30 text-onicord-danger hover:bg-onicord-danger hover:text-onicord-on-danger transition duration-fast cursor-pointer"
              title={t("voice.closePiP", "Cerrar PiP")}
            >
              <MaterialIcon name="close" size={16} />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            style={{ zIndex: 45, transform: "translate3d(0, 0, 50px)" }}
            className={`absolute top-3.5 left-4 flex items-center gap-2 bg-onicord-scrim-heavy border border-onicord-on-scrim/10 px-3.5 py-1.5 rounded-full text-xs backdrop-blur-onicord-popover select-none transition-all duration-relaxed pointer-events-auto ${
              isFullscreen && !showControls
                ? "opacity-0 -translate-y-4 pointer-events-none"
                : "opacity-100 translate-y-0 pointer-events-auto"
            }`}
          >
            <span className="font-semibold text-onicord-on-scrim">
              {t("voice.multiStreamTitle", {
                count: streams.length,
                defaultValue: `Transmisiones del canal (${streams.length})`,
              })}
            </span>
            <span className="onicord-live-badge">{t("common.live")}</span>
          </div>

          <FloatingMediaBar visible={!isFullscreen || showControls}>
            <FloatingMediaBar.Volume
              volume={activeIsLocal ? 0 : volume}
              max={100}
              step={1}
              isMuted={activeIsLocal || isMuted}
              onToggleMute={() => {
                if (!activeIsLocal) setIsMuted((m) => !m);
              }}
              onVolumeChange={(val) => {
                if (activeIsLocal) return;
                setVolume(val);
                if (isMuted && val > 0) setIsMuted(false);
              }}
              titleMute={t("voice.muteAudio")}
              titleUnmute={t("voice.unmuteAudio")}
              customMuteIcon={<MaterialIcon name="volume_off" size="base" />}
              customUnmuteIcon={<MaterialIcon name="volume_up" size="base" />}
              showDividers={false}
              sliderClassName="w-18"
            />

            {onToggleSize && (
              <FloatingMediaBar.PillButton
                icon={<MaterialIcon name="fullscreen_exit" size="base" />}
                label={t("voice.viewChat")}
                title={t("voice.viewChat")}
                onClick={onToggleSize}
              />
            )}

            {onToggleFullscreen && (
              <FloatingMediaBar.IconButton
                icon={isFullscreen ? <MaterialIcon name="fullscreen_exit" size="base" /> : <MaterialIcon name="fullscreen" size="base" />}
                title={isFullscreen ? t("voice.exitFullScreen") : t("voice.fullScreen")}
                active={isFullscreen}
                onClick={onToggleFullscreen}
              />
            )}

            <FloatingMediaBar.StopButton
              icon={<MaterialIcon name="cancel_presentation" size="base" />}
              title={t("common.close", "Cerrar")}
              onClick={onStopWatching}
            />
          </FloatingMediaBar>
        </>
      )}
    </div>
  );
}
