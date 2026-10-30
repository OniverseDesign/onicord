import React, { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import { useWatchParty } from "../../context/WatchPartyContext";
import FloatingMediaBar from "../ui/FloatingMediaBar";

const QUALITY_MAP = {
  highres: "4K / Original",
  hd2160: "2160p (4K)",
  hd1440: "1440p (2K)",
  hd1080: "1080p (HD)",
  hd720: "720p (HD)",
  large: "480p",
  medium: "360p",
  small: "240p",
  tiny: "144p",
  auto: "Automática",
};

export default function WatchPartyStage() {
  const { t } = useTranslation();
  const {
    session,
    hasJoined,
    isHost,
    isFloating,
    isFullscreen,
    joinPrompt,
    volume,
    isMuted,
    stopWatchParty,
    joinWatchParty,
    dismissPrompt,
    togglePlayPause,
    sendSeek,
    setIsFloating,
    setIsFullscreen,
    setVolume,
    setIsMuted,
    updateHostPlaybackTime,
  } = useWatchParty();

  const containerRef = useRef(null);
  const pipContainerRef = useRef(null);
  const playerRef = useRef(null);
  const ytPlayerInstance = useRef(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [duckMultiplier, setDuckMultiplier] = useState(1.0);
  const inactivityTimeoutRef = useRef(null);

  // Playback tracking
  const [currentPlaybackTime, setCurrentPlaybackTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);

  // Quality & Subtitles controls (individual per user)
  const [availableQualities, setAvailableQualities] = useState([
    "auto",
    "hd1080",
    "hd720",
    "large",
    "medium",
    "small",
  ]);
  const [currentQuality, setCurrentQuality] = useState("auto");
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const userSelectedQualityRef = useRef("auto");
  const qualitySwitchingUntilRef = useRef(0);
  const savedPlaybackTimeRef = useRef(0);

  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [availableTracks, setAvailableTracks] = useState([]);
  const [currentTrack, setCurrentTrack] = useState(null);
  const [showCaptionsMenu, setShowCaptionsMenu] = useState(false);

  // Position and drag states for PiP
  const [position, setPosition] = useState(() => ({
    x: Math.max(10, (typeof window !== "undefined" ? window.innerWidth : 1280) - 460),
    y: Math.max(10, (typeof window !== "undefined" ? window.innerHeight : 720) - 300),
  }));
  const currentPos = useRef(position);
  const isDragging = useRef(false);
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const rafId = useRef(null);

  // Audio ducking listener
  useEffect(() => {
    const handleDucking = (e) => {
      const mult = e.detail?.duckMultiplier ?? 1.0;
      setDuckMultiplier(mult);
    };
    window.addEventListener("voice-ducking-change", handleDucking);
    return () => window.removeEventListener("voice-ducking-change", handleDucking);
  }, []);

  // Clean up OS fullscreen on unmount
  useEffect(() => {
    return () => {
      window.electronAPI?.setFullscreen?.(false);
    };
  }, []);

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsFullscreen(false);
        window.electronAPI?.setFullscreen?.(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, setIsFullscreen]);

  // Close menus on outside click
  useEffect(() => {
    if (!showQualityMenu && !showCaptionsMenu) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest(".onicord-party-popup") && !e.target.closest(".onicord-party-popup-btn")) {
        setShowQualityMenu(false);
        setShowCaptionsMenu(false);
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, [showQualityMenu, showCaptionsMenu]);

  // Controls auto-hide (keeps controls visible while interacting with menus)
  const resetInactivityTimer = useCallback(() => {
    setShowControls(true);
    if (inactivityTimeoutRef.current) clearTimeout(inactivityTimeoutRef.current);
    if (showQualityMenu || showCaptionsMenu) return;
    inactivityTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  }, [showQualityMenu, showCaptionsMenu]);

  // Resize clamp for PiP mode
  useEffect(() => {
    if (!isFloating) return;
    const handleResize = () => {
      const maxX = Math.max(10, window.innerWidth - 450);
      const maxY = Math.max(10, window.innerHeight - 280);
      const currentX = Number.isFinite(currentPos.current?.x) ? currentPos.current.x : window.innerWidth - 460;
      const currentY = Number.isFinite(currentPos.current?.y) ? currentPos.current.y : window.innerHeight - 300;
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
  }, [isFloating]);

  // Load YouTube IFrame API script
  useEffect(() => {
    if (!session?.videoId || !hasJoined) return;

    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    }
  }, [session?.videoId, hasJoined]);

  // Initialize YouTube Player
  useEffect(() => {
    savedPlaybackTimeRef.current = 0;
    qualitySwitchingUntilRef.current = 0;

    if (!session?.videoId || !hasJoined) {
      if (ytPlayerInstance.current) {
        try {
          ytPlayerInstance.current.destroy();
        } catch {}
        ytPlayerInstance.current = null;
      }
      setPlayerReady(false);
      return;
    }

    let intervalId = null;

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player || !playerRef.current) return false;

      try {
        if (ytPlayerInstance.current) {
          try {
            ytPlayerInstance.current.destroy();
          } catch {}
        }

        ytPlayerInstance.current = new window.YT.Player(playerRef.current, {
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          videoId: session.videoId,
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            autohide: 1,
            enablejsapi: 1,
            playsinline: 1,
            origin: window.location.origin,
            widget_referrer: window.location.origin,
          },
          events: {
            onReady: (event) => {
              setPlayerReady(true);
              try {
                const dur = event.target.getDuration();
                if (dur > 0) setVideoDuration(dur);
                const qList = event.target.getAvailableQualityLevels?.() || [];
                if (qList.length > 0) {
                  setAvailableQualities(qList.includes("auto") ? qList : ["auto", ...qList]);
                }
                const curQ = event.target.getPlaybackQuality?.() || "auto";
                setCurrentQuality(curQ);
              } catch {}
              const initialVolume = isMuted ? 0 : Math.round(volume * 100 * duckMultiplier);
              event.target.setVolume(initialVolume);
              if (session.isPlaying) {
                const elapsed = (Date.now() - session.updatedAt) / 1000;
                event.target.seekTo(session.currentTime + elapsed, true);
                event.target.playVideo();
              } else {
                event.target.seekTo(session.currentTime, true);
                event.target.pauseVideo();
              }
              try {
                if (typeof event.target.loadModule === "function") {
                  event.target.loadModule("captions");
                }
              } catch {}
              setTimeout(() => {
                refreshCaptions();
                refreshQualities();
              }, 800);
            },
            onApiChange: () => {
              refreshCaptions();
              refreshQualities();
            },
            onPlaybackQualityChange: (event) => {
              if (event.data && userSelectedQualityRef.current === "auto") {
                setCurrentQuality(event.data);
              }
            },
            onStateChange: (event) => {
              try {
                const dur = event.target.getDuration();
                if (dur > 0) setVideoDuration(dur);
              } catch {}
              if (event.data === window.YT?.PlayerState?.PLAYING) {
                refreshQualities();
              }
              if (isHost && event.data === window.YT?.PlayerState?.PAUSED && session?.isPlaying) {
                togglePlayPause();
              } else if (isHost && event.data === window.YT?.PlayerState?.PLAYING && !session?.isPlaying) {
                togglePlayPause();
              }
            },
          },
        });
        return true;
      } catch (err) {
        console.warn("[WatchParty] Error instantiating YT Player:", err);
        return false;
      }
    };

    if (!initPlayer()) {
      intervalId = setInterval(() => {
        if (initPlayer()) {
          clearInterval(intervalId);
        }
      }, 300);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (ytPlayerInstance.current) {
        try {
          ytPlayerInstance.current.destroy();
        } catch {}
        ytPlayerInstance.current = null;
      }
      setPlayerReady(false);
    };
  }, [session?.videoId, hasJoined]);

  // Volume & Auto-Ducking updates
  useEffect(() => {
    if (!ytPlayerInstance.current || !playerReady) return;
    try {
      const effectiveVol = isMuted ? 0 : Math.round(volume * 100 * duckMultiplier);
      ytPlayerInstance.current.setVolume(effectiveVol);
    } catch {}
  }, [volume, isMuted, duckMultiplier, playerReady]);

  // Periodic polling for playback time and duration
  useEffect(() => {
    if (!ytPlayerInstance.current || !playerReady) return;
    const interval = setInterval(() => {
      try {
        const player = ytPlayerInstance.current;
        if (player && typeof player.getCurrentTime === "function") {
          const t = player.getCurrentTime() || 0;
          const d = player.getDuration() || 0;

          // Guard against transient 0 timestamp while YouTube swaps quality stream buffer
          const isQualitySwitching = Date.now() < qualitySwitchingUntilRef.current;
          if (isQualitySwitching && t < 1 && savedPlaybackTimeRef.current > 2) {
            return;
          }

          if (t > 0) {
            savedPlaybackTimeRef.current = t;
          }

          if (isHost && updateHostPlaybackTime) {
            updateHostPlaybackTime(t);
          }
          if (!isSeeking) {
            setCurrentPlaybackTime((prev) => {
              if (Math.abs(prev - t) >= 0.5) return t;
              return prev;
            });
          }
          if (d > 0 && Math.abs(d - videoDuration) > 0.5) {
            setVideoDuration(d);
          }
        }
      } catch {}
    }, 250);
    return () => clearInterval(interval);
  }, [playerReady, isSeeking, videoDuration, isHost, updateHostPlaybackTime]);

  // Sync loop: drift compensation & playback state alignment
  useEffect(() => {
    if (!ytPlayerInstance.current || !playerReady || !session || isHost) return;

    const checkSync = () => {
      try {
        if (Date.now() < qualitySwitchingUntilRef.current) return;
        const player = ytPlayerInstance.current;
        if (!player || typeof player.getCurrentTime !== "function") return;

        const playerState = typeof player.getPlayerState === "function" ? player.getPlayerState() : -1;
        // Do not interrupt while buffering, unstarted, or seeking
        if (playerState === window.YT?.PlayerState?.BUFFERING || playerState === -1 || isSeeking) return;

        const currentLocal = player.getCurrentTime() || 0;
        const expected = session.currentTime + (session.isPlaying ? (Date.now() - session.updatedAt) / 1000 : 0);
        const drift = Math.abs(currentLocal - expected);

        // Drift compensation tolerance: 2.5 seconds to prevent micro-stutters
        if (drift > 2.5) {
          player.seekTo(expected, true);
        }

        if (session.isPlaying && playerState === window.YT?.PlayerState?.PAUSED) {
          player.playVideo();
        } else if (!session.isPlaying && playerState === window.YT?.PlayerState?.PLAYING) {
          player.pauseVideo();
        }
      } catch {}
    };

    const interval = setInterval(checkSync, 1000);
    return () => clearInterval(interval);
  }, [session, playerReady, isHost, isSeeking]);

  const refreshCaptions = useCallback(() => {
    const player = ytPlayerInstance.current;
    if (!player) return;
    try {
      if (typeof player.loadModule === "function") {
        player.loadModule("captions");
      }
      if (typeof player.getOption === "function") {
        const tracks = player.getOption("captions", "tracklist") || [];
        if (Array.isArray(tracks) && tracks.length > 0) {
          setAvailableTracks(tracks);
        }
        const cur = player.getOption("captions", "track");
        if (cur && cur.languageCode) {
          setCaptionsEnabled(true);
          setCurrentTrack(cur.languageCode);
        } else {
          setCaptionsEnabled(false);
          setCurrentTrack(null);
        }
      }
    } catch {}
  }, []);

  const syncYoutubeSubframeQuality = useCallback((targetQuality = null, targetTime = null) => {
    try {
      const targetJson = JSON.stringify(targetQuality);
      const timeVal = typeof targetTime === "number" && targetTime > 0 ? targetTime : null;
      const script = `
        (function() {
          try {
            var mp = document.getElementById("movie_player") || document.querySelector(".html5-video-player");
            if (!mp) return;
            var target = ${targetJson};
            var savedTime = ${timeVal};
            if (target) {
              var curTime = savedTime || 0;
              if (!curTime || curTime <= 0) {
                try {
                  curTime = typeof mp.getCurrentTime === "function" ? (mp.getCurrentTime() || 0) : 0;
                } catch (_) {}
              }

              // Clear existing debounce timer to avoid conflicting seeks
              if (window._onicordQualityTimer) {
                clearTimeout(window._onicordQualityTimer);
                window._onicordQualityTimer = null;
              }

              if (target === "auto") {
                if (typeof mp.setPlaybackQualityRange === "function") {
                  try { mp.setPlaybackQualityRange("default", "default"); } catch (_) {}
                }
              } else {
                if (typeof mp.setPlaybackQualityRange === "function") {
                  try { mp.setPlaybackQualityRange(target, target); } catch (_) {}
                }
              }

              // Restore position gently only if YouTube reset the stream buffer to 0
              if (curTime > 1.5) {
                window._onicordQualityTimer = setTimeout(function() {
                  try {
                    var nowT = typeof mp.getCurrentTime === "function" ? mp.getCurrentTime() : 0;
                    if (nowT < 1 || Math.abs(nowT - curTime) > 3) {
                      if (typeof mp.seekTo === "function") {
                        mp.seekTo(curTime, true);
                      }
                    }
                  } catch (_) {}
                }, 140);
              }
            }
            var levels = typeof mp.getAvailableQualityLevels === "function" ? (mp.getAvailableQualityLevels() || []) : [];
            var current = typeof mp.getPlaybackQuality === "function" ? (mp.getPlaybackQuality() || "auto") : "auto";
            window.parent.postMessage({
              type: "ONICORD_YT_QUALITIES_SYNC",
              qualities: levels,
              current: target || current
            }, "*");
          } catch (_) {}
        })();
      `;
      window.electronAPI?.openStageView?.({
        subframeEvalOnly: true,
        url: "https://www.youtube-nocookie.com",
        frameScripts: [script],
      });
    } catch {}
  }, []);

  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data && e.data.type === "ONICORD_YT_QUALITIES_SYNC") {
        if (Array.isArray(e.data.qualities) && e.data.qualities.length > 0) {
          const list = e.data.qualities;
          setAvailableQualities(list.includes("auto") ? list : ["auto", ...list]);
        }
        if (userSelectedQualityRef.current !== "auto") {
          setCurrentQuality(userSelectedQualityRef.current);
        } else if (e.data.current) {
          setCurrentQuality(e.data.current);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const refreshQualities = useCallback(() => {
    const player = ytPlayerInstance.current;
    if (player) {
      try {
        if (typeof player.getAvailableQualityLevels === "function") {
          const qList = player.getAvailableQualityLevels() || [];
          if (qList.length > 0) {
            setAvailableQualities(qList.includes("auto") ? qList : ["auto", ...qList]);
          }
        }
        if (userSelectedQualityRef.current === "auto" && typeof player.getPlaybackQuality === "function") {
          const curQ = player.getPlaybackQuality() || "auto";
          setCurrentQuality(curQ);
        }
      } catch {}
    }
    // Only query available levels and active quality without forcing a re-set
    syncYoutubeSubframeQuality(null);
  }, [syncYoutubeSubframeQuality]);

  const handleSelectCaptionTrack = (trackLang) => {
    const player = ytPlayerInstance.current;
    if (!player) return;
    try {
      if (typeof player.loadModule === "function") {
        player.loadModule("captions");
      }
      if (!trackLang || trackLang === "off") {
        if (typeof player.setOption === "function") {
          player.setOption("captions", "track", {});
        }
        if (typeof player.unloadModule === "function") {
          player.unloadModule("captions");
        }
        setCaptionsEnabled(false);
        setCurrentTrack(null);
      } else {
        if (typeof player.setOption === "function") {
          player.setOption("captions", "track", { languageCode: trackLang });
          player.setOption("captions", "reload", true);
        }
        setCaptionsEnabled(true);
        setCurrentTrack(trackLang);
      }
    } catch {}
    setShowCaptionsMenu(false);
  };

  const handleSetQuality = (q) => {
    if (q === currentQuality && userSelectedQualityRef.current === q) {
      setShowQualityMenu(false);
      return;
    }

    userSelectedQualityRef.current = q;
    setCurrentQuality(q);

    // Capture playback position before changing quality
    const player = ytPlayerInstance.current;
    let savedTime = currentPlaybackTime || 0;
    try {
      const curT = player?.getCurrentTime?.();
      if (typeof curT === "number" && curT > 0) {
        savedTime = curT;
      }
    } catch (_) {}
    if (savedTime <= 0 && savedPlaybackTimeRef.current > 0) {
      savedTime = savedPlaybackTimeRef.current;
    }

    // Lock position updates for 2s to prevent broadcasting transient 0
    qualitySwitchingUntilRef.current = Date.now() + 2000;
    if (savedTime > 0) {
      savedPlaybackTimeRef.current = savedTime;
    }

    // Apply cleanly via internal player in the subframe without conflicting postMessage commands
    syncYoutubeSubframeQuality(q, savedTime);
    setShowQualityMenu(false);
  };

  const handleTogglePlayPause = () => {
    if (!ytPlayerInstance.current || !playerReady) return;
    try {
      if (session?.isPlaying) {
        ytPlayerInstance.current.pauseVideo();
      } else {
        ytPlayerInstance.current.playVideo();
      }
    } catch {}
    togglePlayPause();
  };

  const handleSeek = (newTime) => {
    if (!ytPlayerInstance.current || !playerReady) return;
    try {
      ytPlayerInstance.current.seekTo(newTime, true);
      setCurrentPlaybackTime(newTime);
    } catch {}
    sendSeek(newTime);
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs) || secs < 0) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Drag handlers for PiP mode
  const handlePointerDown = (e) => {
    if (e.target.closest("button") || e.target.closest("input")) return;
    isDragging.current = true;
    lastPointerPos.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastPointerPos.current.x;
    const dy = e.clientY - lastPointerPos.current.y;
    lastPointerPos.current = { x: e.clientX, y: e.clientY };

    const maxX = Math.max(10, window.innerWidth - 450);
    const maxY = Math.max(10, window.innerHeight - 280);
    const nextX = Math.max(10, Math.min(currentPos.current.x + dx, maxX));
    const nextY = Math.max(10, Math.min(currentPos.current.y + dy, maxY));

    currentPos.current = { x: nextX, y: nextY };
    if (pipContainerRef.current) {
      pipContainerRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
    }
  };

  const handlePointerUp = (e) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    setPosition({ ...currentPos.current });
  };

  // 1. Join prompt banner (when another peer starts a Watch Party)
  const renderJoinPrompt = () => {
    if (!joinPrompt || hasJoined || joinPrompt.type === "cinema") return null;
    return (
      <div className="fixed top-14 right-6 z-50 animate-bounce-in max-w-sm bg-onicord-surface/95 backdrop-blur-xl border border-onicord-accent/40 shadow-2xl rounded-2xl p-4 text-white">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600/20 text-red-400 flex items-center justify-center shrink-0">
            <MaterialIcon name="smart_display" size={24} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-onicord-accent">
                {t("watchParty.subtitle", "Watch Party P2P")}
              </span>
              <button
                type="button"
                onClick={dismissPrompt}
                className="text-onicord-muted hover:text-white transition-colors"
              >
                <MaterialIcon name="close" size={16} />
              </button>
            </div>
            <p className="text-sm font-semibold truncate text-white mt-0.5">
              {joinPrompt.title || t("watchParty.liveVideo", "Video en vivo")}
            </p>
            <p className="text-xs text-onicord-muted truncate">
              {t("watchParty.startedByPrefix", "Iniciado por")} <strong className="text-onicord-text">{joinPrompt.hostNickname}</strong>
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={joinWatchParty}
                className="flex-1 py-1.5 px-3 rounded-xl bg-onicord-accent hover:bg-onicord-accent/90 text-white text-xs font-semibold shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <MaterialIcon name="play_arrow" size={16} />
                <span>{t("watchParty.joinNow", "Unirse ahora")}</span>
              </button>
              <button
                type="button"
                onClick={dismissPrompt}
                className="py-1.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-onicord-muted hover:text-white text-xs font-medium transition-colors"
              >
                {t("watchParty.ignore", "Ignorar")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Cinema watch party is handled by AddonStageDisplay
  if (session?.type === "cinema") {
    return null;
  }

  // If no active session or not joined, only show join prompt if present
  if (!session?.videoId || !hasJoined) {
    return renderJoinPrompt();
  }

  // Top-left overlay badge (matching StreamDisplay & AddonStageDisplay)
  const renderTopBadge = () => (
    <div
      style={{ zIndex: 999999, transform: "translate3d(0, 0, 50px)" }}
      className={`absolute top-4 left-4 z-30 flex items-center gap-2 bg-black/80 border border-white/10 px-3.5 py-1.5 rounded-full text-xs shadow-2xl backdrop-blur-md select-none transition-all duration-300 pointer-events-auto ${
        !showControls
          ? "opacity-0 -translate-y-4 pointer-events-none"
          : "opacity-100 translate-y-0 pointer-events-auto"
      }`}
    >
      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-red-600 text-white shrink-0">
        <MaterialIcon name="smart_display" size={14} />
      </span>
      <span className="font-semibold text-white truncate max-w-[260px]">
        {session.title || t("watchParty.title", "Watch Party")}
      </span>
      <span className="onicord-live-badge text-[10px]">
        {isHost ? t("watchParty.host", "Anfitrión") : session.hostNickname}
      </span>
    </div>
  );

  // Standardized Floating Media Control Bar
  const renderMediaControlBar = () => {
    const displayQualities =
      availableQualities.length > 1
        ? availableQualities
        : ["auto", "hd1080", "hd720", "large", "medium", "small"];

    const captionItems = [
      {
        id: "off",
        label: t("watchParty.captionsOff", "Desactivados"),
        isSelected: !captionsEnabled,
        onClick: () => handleSelectCaptionTrack("off"),
      },
      ...(availableTracks.length > 0
        ? availableTracks.map((track) => ({
            id: track.languageCode,
            label: track.displayName || track.languageCode,
            isSelected: captionsEnabled && currentTrack === track.languageCode,
            onClick: () => handleSelectCaptionTrack(track.languageCode),
          }))
        : [
            {
              id: "es",
              label: t("watchParty.autoSpanish", "Español (Auto)"),
              isSelected: captionsEnabled && currentTrack === "es",
              onClick: () => handleSelectCaptionTrack("es"),
            },
            {
              id: "en",
              label: t("watchParty.autoEnglish", "Inglés (Auto)"),
              isSelected: captionsEnabled && currentTrack === "en",
              onClick: () => handleSelectCaptionTrack("en"),
            },
          ]),
    ];

    const qualityItems = displayQualities.map((q) => ({
      id: q,
      label: QUALITY_MAP[q] || (q === "auto" ? t("watchParty.autoQuality", "Automática") : q),
      isSelected: currentQuality === q,
      onClick: () => handleSetQuality(q),
    }));

    return (
      <FloatingMediaBar visible={showControls}>
        {/* 1. Play / Pause */}
        <FloatingMediaBar.IconButton
          icon={session?.isPlaying ? "pause" : "play_arrow"}
          title={session?.isPlaying ? t("watchParty.pause", "Pausar") : t("watchParty.play", "Reproducir")}
          primary={!session?.isPlaying}
          onClick={handleTogglePlayPause}
        />

        {/* 2. Timeline scrubber & duration */}
        <FloatingMediaBar.Timeline
          currentTime={isSeeking ? seekValue : currentPlaybackTime}
          duration={videoDuration}
          isSeeking={isSeeking}
          onSeekStart={() => setIsSeeking(true)}
          onSeekChange={(v) => setSeekValue(v)}
          onSeekEnd={(v) => {
            setIsSeeking(false);
            handleSeek(v);
          }}
          format={formatTime}
        />

        {/* 3. Audio Volume */}
        <FloatingMediaBar.Volume
          volume={volume}
          max={1}
          step={0.01}
          isMuted={isMuted}
          titleMute={t("watchParty.mute", "Silenciar")}
          titleUnmute={t("watchParty.unmute", "Activar sonido")}
          onToggleMute={() => setIsMuted(!isMuted)}
          onVolumeChange={(val) => {
            setVolume(val);
            if (isMuted && val > 0) setIsMuted(false);
          }}
          showDividers={true}
        />

        {/* 4. Subtitles (CC) Button & Menu */}
        <FloatingMediaBar.Menu
          icon="subtitles"
          title={captionsEnabled ? t("watchParty.captionsActive", "Subtítulos activados") : t("watchParty.captions", "Subtítulos")}
          menuTitle={t("watchParty.captions", "Subtítulos")}
          active={captionsEnabled}
          isOpen={showCaptionsMenu}
          onToggle={(e) => {
            e?.stopPropagation();
            refreshCaptions();
            setShowCaptionsMenu((prev) => !prev);
            setShowQualityMenu(false);
          }}
          onClose={() => setShowCaptionsMenu(false)}
          items={captionItems}
        />

        {/* 5. Quality Settings Button & Menu */}
        <FloatingMediaBar.Menu
          icon="tune"
          title={t("watchParty.quality", "Calidad ({{quality}})", {
            quality: QUALITY_MAP[currentQuality] || (currentQuality === "auto" ? t("watchParty.autoQuality", "Automática") : currentQuality),
          })}
          menuTitle={t("watchParty.videoQuality", "Calidad de video")}
          active={currentQuality !== "auto"}
          isOpen={showQualityMenu}
          widthClass="w-44"
          onToggle={(e) => {
            e?.stopPropagation();
            refreshQualities();
            setShowQualityMenu((prev) => !prev);
            setShowCaptionsMenu(false);
          }}
          onClose={() => setShowQualityMenu(false)}
          items={qualityItems}
        />

        {/* 6. Switch to Floating PiP view button */}
        <FloatingMediaBar.PillButton
          icon="picture_in_picture_alt"
          label={t("watchParty.viewChat", "Ver chat")}
          title={t("watchParty.viewChatPip", "Ver chat (PiP)")}
          responsiveText
          onClick={() => {
            if (isFullscreen) {
              setIsFullscreen(false);
              window.electronAPI?.setFullscreen?.(false);
            }
            setIsFloating(true);
          }}
        />

        {/* 7. Fullscreen toggle button */}
        <FloatingMediaBar.IconButton
          icon={isFullscreen ? "fullscreen_exit" : "fullscreen"}
          title={isFullscreen ? t("watchParty.exitFullScreen", "Salir de pantalla completa") : t("watchParty.fullScreen", "Pantalla completa")}
          active={isFullscreen}
          onClick={() => {
            const next = !isFullscreen;
            setIsFullscreen(next);
            if (next) setIsFloating(false);
            window.electronAPI?.setFullscreen?.(next);
          }}
        />

        {/* 8. Stop / Close button */}
        <FloatingMediaBar.StopButton
          title={t("watchParty.closeWatchParty", "Cerrar Watch Party")}
          onClick={stopWatchParty}
        />
      </FloatingMediaBar>
    );
  };

  // Integrated PiP overlay (when in floating mini mode)
  const renderPipOverlay = () => (
    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-black/70 flex flex-col justify-between p-2 pointer-events-none z-20 select-none">
      {/* Top row in PiP */}
      <div className="flex items-center justify-between w-full">
        <span className="bg-black/75 px-2 py-0.5 rounded text-[10px] text-white font-semibold select-none pointer-events-none truncate max-w-[220px]">
          {session.title || t("watchParty.title", "Watch Party")}
        </span>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsFloating(false);
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-onicord-surface border border-white/5 text-onicord-text hover:bg-onicord-overlay hover:text-white transition duration-150 cursor-pointer"
            title={t("watchParty.expandToStage", "Expandir a escenario")}
          >
            <MaterialIcon name="fullscreen" size={16} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              stopWatchParty();
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-onicord-surface border border-onicord-danger/30 text-onicord-danger hover:bg-onicord-danger hover:text-white transition duration-150 cursor-pointer"
            title={t("watchParty.closeWatchParty", "Cerrar Watch Party")}
          >
            <MaterialIcon name="close" size={14} />
          </button>
        </div>
      </div>

      {/* Bottom row in PiP */}
      <div className="flex items-center justify-between w-full pointer-events-auto">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePlayPause();
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-black/75 hover:bg-black text-white transition cursor-pointer"
            title={session?.isPlaying ? t("watchParty.pause", "Pausar") : t("watchParty.play", "Reproducir")}
          >
            <MaterialIcon
              name={session?.isPlaying ? "pause" : "play_arrow"}
              size={14}
            />
          </button>
          <span className="text-[10px] font-mono text-white/90 tabular-nums">
            {formatTime(currentPlaybackTime)} / {formatTime(videoDuration)}
          </span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsMuted(!isMuted);
          }}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-black/75 hover:bg-black text-white transition cursor-pointer"
          title={isMuted || volume === 0 ? t("watchParty.unmute", "Activar sonido") : t("watchParty.mute", "Silenciar")}
        >
          <MaterialIcon
            name={isMuted || volume === 0 ? "volume_off" : "volume_up"}
            size={14}
          />
        </button>
      </div>
    </div>
  );

  // Single persistent DOM render: YouTube iframe is NEVER destroyed across normal, fullscreen, and PiP modes!
  return (
    <>
      {renderJoinPrompt()}
      <div
        ref={isFloating ? pipContainerRef : containerRef}
        style={
          isFloating
            ? {
                transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
                width: "360px",
                height: "205px",
              }
            : undefined
        }
        onPointerDown={isFloating ? handlePointerDown : undefined}
        onPointerMove={isFloating ? handlePointerMove : undefined}
        onPointerUp={isFloating ? handlePointerUp : undefined}
        onDoubleClick={isFloating ? () => setIsFloating(false) : undefined}
        onMouseMove={resetInactivityTimer}
        className={
          isFullscreen
            ? "fixed inset-0 z-50 bg-black flex flex-col justify-center items-center overflow-hidden select-none"
            : isFloating
            ? "fixed top-0 left-0 bg-onicord-surface rounded-onicord-inner overflow-hidden border-2 border-onicord-accent shadow-2xl z-50 cursor-move group hover:scale-[1.01] transition-transform duration-150 touch-none select-none flex flex-col"
            : "relative flex-1 w-full h-full min-h-0 min-w-0 flex flex-col bg-black select-none overflow-hidden rounded-onicord-inner border border-onicord-island group/stage"
        }
      >
        {/* Top-left overlay badge (in Fullscreen & Inline modes) */}
        {!isFloating && renderTopBadge()}

        {/* Video Area containing the persistent iframe */}
        <div
          onClick={(e) => {
            if (
              e.target.closest("button") ||
              e.target.closest("input") ||
              e.target.closest(".onicord-media-control-bar-wrapper") ||
              e.target.closest(".onicord-party-popup")
            )
              return;
            handleTogglePlayPause();
          }}
          className={`relative flex items-center justify-center bg-black overflow-hidden select-none cursor-pointer ${
            isFloating
              ? "w-full h-full [&>iframe]:absolute [&>iframe]:inset-x-0 [&>iframe]:-top-[32px] [&>iframe]:h-[calc(100%+64px)] [&>iframe]:w-full [&>iframe]:border-0 [&>iframe]:pointer-events-none [&>iframe]:scale-[1.06]"
              : isFullscreen
              ? "w-full h-full [&>iframe]:absolute [&>iframe]:inset-x-0 [&>iframe]:-top-[52px] [&>iframe]:h-[calc(100%+104px)] [&>iframe]:w-full [&>iframe]:border-0 [&>iframe]:pointer-events-none [&>iframe]:scale-[1.06]"
              : "flex-1 w-full h-full min-h-0 [&>iframe]:absolute [&>iframe]:inset-x-0 [&>iframe]:-top-[52px] [&>iframe]:h-[calc(100%+104px)] [&>iframe]:w-full [&>iframe]:border-0 [&>iframe]:pointer-events-none [&>iframe]:scale-[1.06]"
          }`}
        >
          <div ref={playerRef} className="w-full h-full" />
        </div>

        {/* Floating PiP Controls Overlay */}
        {isFloating && renderPipOverlay()}

        {/* Main Floating Media Bar (in Fullscreen & Inline modes) */}
        {!isFloating && renderMediaControlBar()}
      </div>
    </>
  );
}
