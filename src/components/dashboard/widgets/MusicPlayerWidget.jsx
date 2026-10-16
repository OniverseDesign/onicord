import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  IconPlay,
  IconStop,
  IconPause,
  IconVolumeUp,
  IconSkip,
  IconClose,
  IconRepeat,
  IconRepeatOne,
  IconAdd,
} from "../../icons/StreamIcons";

export default function MusicPlayerWidget({ musicState, setCustomBackground }) {
  const { t } = useTranslation();
  if (!musicState)
    return (
      <div className="w-full h-full flex items-center justify-center p-4 opacity-40">
        <p className="text-xs font-mono text-onicord-muted animate-pulse">
          {t("common.loading", "Cargando...")}
        </p>
      </div>
    );

  const {
    currentTrack,
    playlist,
    isPlaying,
    volume,
    setVolume,
    playHistory,
    repeatMode,
    audioRef,
    setPlaylist,
    canManageMusic = true,
    removeFromQueue,
    reorderQueue,
  } = musicState;

  // Clase dinámica para alternar el texto entre reproducción y pausa/detenido
  const textColor = isPlaying ? "text-white" : "text-onicord-text";

  const [currentTime, setCurrentTime] = useState("0:00");
  const [progressPercent, setProgressPercent] = useState(0);
  const [activeTab, setActiveTab] = useState("queue");

  const [draggedIdx, setDraggedIdx] = useState(null);

  useEffect(() => {
    if (currentTrack?.thumbnail)
      setCustomBackground({ type: "image", value: currentTrack.thumbnail });
    else setCustomBackground(null);
  }, [currentTrack?.thumbnail]);

  useEffect(() => {
    setCurrentTime("0:00");
    setProgressPercent(0);

    const audioNode = audioRef?.current;
    if (!audioNode || !currentTrack) return;
    const syncProgress = () => {
      if (!audioNode.duration) return;
      const current = audioNode.currentTime;
      const duration = audioNode.duration;
      setCurrentTime(
        `${Math.floor(current / 60)}:${Math.floor(current % 60)
          .toString()
          .padStart(2, "0")}`,
      );
      setProgressPercent((current / duration) * 100);
    };
    audioNode.addEventListener("timeupdate", syncProgress);
    return () => audioNode.removeEventListener("timeupdate", syncProgress);
  }, [currentTrack, audioRef]);

  const togglePlayPause = () => {
    if (!canManageMusic) return;
    window.dispatchEvent(
      new CustomEvent("onicord:broadcast-music", {
        detail: isPlaying ? "PAUSE" : "RESUME",
      }),
    );
  };
  const handleSkip = () => {
    if (!canManageMusic) return;
    window.dispatchEvent(
      new CustomEvent("onicord:broadcast-music", { detail: "SKIP" }),
    );
  };
  const forceStop = () => {
    if (!canManageMusic) return;
    window.dispatchEvent(
      new CustomEvent("onicord:broadcast-music", { detail: "STOP_ALL" }),
    );
  };
  const toggleRepeat = () => {
    if (!canManageMusic) return;
    window.dispatchEvent(
      new CustomEvent("onicord:broadcast-music", {
        detail: `REPEAT:${(repeatMode + 1) % 3}`,
      }),
    );
  };

  const handlePlayTrack = (track) => {
    const url =
      track.originalUrl ||
      (track.source?.toLowerCase().includes("soundcloud")
        ? `https://soundcloud.com/tracks/${track.trackId}`
        : `https://youtube.com/watch?v=${track.trackId}`);

    if (canManageMusic) {
      window.dispatchEvent(
        new CustomEvent("onicord:broadcast-music", {
          detail: `PLAY_SHORTCUT:${url}`,
        }),
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("onicord:broadcast-music", {
          detail: `QUEUE_ADD:${url}`,
        }),
      );
    }
  };

  const handleRemove = (trackId, e) => {
    e.stopPropagation();
    if (!canManageMusic) return;
    if (removeFromQueue) {
      removeFromQueue(trackId);
    } else {
      setPlaylist((prev) => prev.filter((t) => t.trackId !== trackId));
    }
  };

  const handleAddToQueue = (track, e) => {
    e.stopPropagation();
    const url =
      track.originalUrl ||
      (track.source?.toLowerCase().includes("soundcloud")
        ? `https://soundcloud.com/tracks/${track.trackId}`
        : `https://youtube.com/watch?v=${track.trackId}`);

    window.dispatchEvent(
      new CustomEvent("onicord:broadcast-music", {
        detail: `QUEUE_ADD:${url}`,
      }),
    );
  };

  return (
    <div
      style={{ containerType: "inline-size" }}
      className="onicord-widget-shell w-full h-full p-6 flex flex-col justify-between select-none"
    >
      <div className="onicord-widget-header flex justify-between items-center w-full gap-2 mb-2 shrink-0">
        <h3
          style={{ fontSize: "clamp(0.6rem, 3.5cqi, 0.8rem)" }}
          className={`onicord-widget-title font-bold truncate transition-colors ${textColor}`}
        >
          {t("widgets.music.title", "Music Player")}
        </h3>
        <span
          style={{ fontSize: "clamp(0.6rem, 3cqi, 0.5rem)" }}
          className={`shrink-0 px-2 py-0.5 font-medium transition-colors ${textColor} ${
            isPlaying
              ? "onicord-widget-badge !border !border-onicord-island"
              : "onicord-widget-badge-dynamic"
          }`}
        >
          {t("widgets.music.badge", "Music")}
        </span>
      </div>

      <div className="w-full z-10 mt-4">
        {!currentTrack ? (
          <div className="flex flex-col items-center text-center gap-2 py-4 opacity-40">
            <div
              className={`w-12 h-12 rounded-xl bg-white/[0.05] border border-white/5 flex items-center justify-center transition-colors ${textColor}`}
            >
              <IconPlay size="lg" />
            </div>
            <p
              className={`text-[11px] font-medium max-w-[200px] leading-relaxed transition-colors ${textColor}`}
            >
              {t("widgets.music.pasteUrlHint", "Paste a URL in chat")}
            </p>
          </div>
        ) : (
          <div className="w-full flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="w-24 h-24 rounded-onicord-button overflow-hidden bg-black/40 border border-white/5 shrink-0 shadow-md">
                <img
                  src={currentTrack.thumbnail}
                  className="w-full h-full object-cover"
                  alt=""
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-left">
                  <h2
                    className={`text-base font-semibold tracking-wide truncate transition-colors ${textColor}`}
                  >
                    {currentTrack.title}
                  </h2>
                  <p className="text-xs text-onicord-accent font-medium truncate mt-0.5 opacity-90">
                    {currentTrack.author}
                  </p>
                </div>
                <div className="mt-2.5">
                  <div
                    className={`flex items-center justify-between text-[10px] font-mono mb-1 px-0.5 transition-colors ${textColor}`}
                  >
                    <span>{currentTime}</span>
                    <span>{currentTrack.duration}</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden w-full relative transition-all">
                    <div
                      className="h-full bg-onicord-accent transition-all duration-150 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={togglePlayPause}
                  disabled={!canManageMusic}
                  className={`w-10 h-10 rounded-full bg-white/[0.05] hover:bg-onicord-accent hover:text-onicord-text flex items-center justify-center font-bold shadow-md transition-all border border-white/5 text-xs active:scale-95 ${
                    !canManageMusic
                      ? "opacity-40 cursor-not-allowed hover:bg-white/[0.05]"
                      : "cursor-pointer"
                  } ${textColor}`}
                  title={!canManageMusic ? t("music.noPermission", "No tienes permisos para controlar la música") : undefined}
                >
                  {isPlaying ? <IconPause size="lg" /> : <IconPlay size="lg" />}
                </button>
                <button
                  onClick={handleSkip}
                  disabled={!canManageMusic}
                  className={`w-8 h-8 rounded-full bg-white/[0.05] hover:bg-onicord-overlay hover:text-onicord-text flex items-center justify-center text-xs transition-all border border-white/5 active:scale-95 ${
                    !canManageMusic
                      ? "opacity-40 cursor-not-allowed hover:bg-white/[0.05]"
                      : "cursor-pointer"
                  } ${textColor}`}
                  title={!canManageMusic ? t("music.noPermission", "No tienes permisos para controlar la música") : undefined}
                >
                  <IconSkip size="lg" />
                </button>
                <button
                  onClick={forceStop}
                  disabled={!canManageMusic}
                  className={`w-8 h-8 rounded-full bg-white/[0.05] hover:bg-onicord-overlay hover:text-onicord-text flex items-center justify-center text-xs transition-all border border-white/5 active:scale-95 ${
                    !canManageMusic
                      ? "opacity-40 cursor-not-allowed hover:bg-white/[0.05]"
                      : "cursor-pointer"
                  } ${textColor}`}
                  title={!canManageMusic ? t("music.noPermission", "No tienes permisos para controlar la música") : undefined}
                >
                  <IconStop size="lg" />
                </button>
                <button
                  onClick={toggleRepeat}
                  disabled={!canManageMusic}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all border active:scale-95 ${
                    repeatMode !== 0
                      ? "bg-onicord-accent/20 text-onicord-accent border-onicord-accent/30"
                      : `bg-white/[0.05] hover:bg-onicord-overlay hover:text-onicord-text border-white/5 ${textColor}`
                  } ${
                    !canManageMusic
                      ? "opacity-40 cursor-not-allowed hover:bg-white/[0.05]"
                      : "cursor-pointer"
                  }`}
                  title={!canManageMusic ? t("music.noPermission", "No tienes permisos para controlar la música") : t("widgets.music.repeatMode")}
                >
                  {repeatMode === 2 ? (
                    <IconRepeatOne size="lg" />
                  ) : (
                    <IconRepeat size="lg" />
                  )}
                </button>
              </div>
              <div className="flex-1 max-w-[150px] flex rounded-full bg-white/[0.05] items-center px-2.5 gap-1.5 min-w-0 h-8 border border-white/5 transition-all">
                <div
                  className={`flex items-center justify-center shrink-0 transition-colors ${textColor}`}
                >
                  <IconVolumeUp size="lg" />
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setVolume(val);
                    if (audioRef.current) audioRef.current.volume = val;
                  }}
                  className="w-full h-1 bg-white/10 rounded-full appearance-none accent-onicord-accent cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #ffffff ${volume * 100}%, rgba(255, 255, 255, 0.1) ${volume * 100}%)`,
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col min-h-0 z-10 bg-white/[0.03] rounded-xl border border-white/5 mt-4 overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-4 shrink-0 border-b border-white/[0.04]">
          <button
            onClick={() => setActiveTab("queue")}
            className={`text-[10px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${activeTab === "queue" ? "text-onicord-accent" : `${textColor} opacity-50 hover:opacity-100`}`}
          >
            {t("widgets.music.playlist", "Playlist")}{" "}
            {playlist.length > 0 && `(${playlist.length})`}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`text-[10px] font-bold uppercase tracking-widest transition-colors cursor-pointer ${activeTab === "history" ? "text-onicord-accent" : `${textColor} opacity-50 hover:opacity-100`}`}
          >
            {t("widgets.music.history", "History")}{" "}
            {playHistory.length > 0 && `(${playHistory.length})`}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto minimal-scrollbar p-1.5 space-y-1">
          {activeTab === "queue" && playlist.length === 0 && (
            <p
              className={`text-[9px] text-center py-4 transition-colors ${textColor}`}
            >
              {t("widgets.music.queueEmpty", "Queue empty")}
            </p>
          )}
          {activeTab === "history" && playHistory.length === 0 && (
            <p
              className={`text-[9px] text-center py-4 transition-colors ${textColor}`}
            >
              {t("widgets.music.noHistory", "No history")}
            </p>
          )}

          {(activeTab === "queue" ? playlist : playHistory)
            .filter(Boolean)
            .map((track, idx) => (
              <div
                key={`${track.trackId}-${idx}`}
                draggable={activeTab === "queue" && canManageMusic}
                onDragStart={() => {
                  if (activeTab === "queue" && canManageMusic) setDraggedIdx(idx);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (
                    !canManageMusic ||
                    activeTab !== "queue" ||
                    draggedIdx === null ||
                    draggedIdx === idx
                  )
                    return;
                  if (reorderQueue) {
                    reorderQueue(draggedIdx, idx);
                  } else {
                    setPlaylist((prev) => {
                      const newList = [...prev];
                      const [moved] = newList.splice(draggedIdx, 1);
                      newList.splice(idx, 0, moved);
                      return newList;
                    });
                  }
                  setDraggedIdx(null);
                }}
                onDragEnd={() => setDraggedIdx(null)}
                onClick={() => handlePlayTrack(track)}
                className={`flex items-center gap-2.5 p-1.5 rounded-lg group/item hover:bg-white/[0.04] transition-colors cursor-pointer select-none ${draggedIdx === idx ? "opacity-30 border border-dashed border-onicord-accent" : ""}`}
              >
                <div className="relative w-7 h-7 rounded-lg overflow-hidden bg-black/40 border border-white/5 shrink-0">
                  <img
                    src={track.thumbnail}
                    className="w-full h-full object-cover"
                    alt=""
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/item:opacity-100 flex items-center justify-center transition-opacity">
                    <IconPlay size="sm" className="text-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-[11px] truncate font-medium group-hover/item:text-[#c3a9ff] transition-colors ${textColor}`}
                  >
                    {track.title}
                  </p>
                </div>
                {activeTab === "queue" && canManageMusic && (
                  <button
                    onClick={(e) => handleRemove(track.trackId, e)}
                    className="flex items-center opacity-0 group-hover/item:opacity-100 p-1 rounded text-onicord-muted hover:text-onicord-danger transition-all"
                    title={t("widgets.music.removeFromQueue")}
                  >
                    <IconClose size="lg" />
                  </button>
                )}
                {activeTab === "history" && (
                  <button
                    onClick={(e) => handleAddToQueue(track, e)}
                    className="flex items-center opacity-0 group-hover/item:opacity-100 p-1 rounded text-onicord-muted hover:text-onicord-success transition-all"
                    title={t("widgets.music.addToQueue")}
                  >
                    <IconAdd size="lg" />
                  </button>
                )}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

MusicPlayerWidget.widgetId = "music-player";
MusicPlayerWidget.badgeText = "Music";
MusicPlayerWidget.bgVariant = "dark";
MusicPlayerWidget.defaultGeo = { x: 5, y: 4, w: 3, h: 3 };
MusicPlayerWidget.minW = 2;
MusicPlayerWidget.minH = 2;
