import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  IconPlay,
  IconStop,
  IconPause,
  IconVolumeUp,
  IconSkip,
  IconDropdown,
  IconDropup,
  IconClose,
  IconRepeat,
  IconRepeatOne,
  IconAdd,
} from "../icons/StreamIcons";

export default function MusicIsland({ musicState }) {
  const { t } = useTranslation();
  if (!musicState) return null;

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
    hasJoinedMusic,
    setHasJoinedMusic,
    canManageMusic = true,
    removeFromQueue,
    reorderQueue,
  } = musicState;

  const [showQueue, setShowQueue] = useState(false);
  const [activeTab, setActiveTab] = useState("queue");
  const [currentTime, setCurrentTime] = useState("0:00");
  const [progressPercent, setProgressPercent] = useState(0);

  const [draggedIdx, setDraggedIdx] = useState(null);

  const handleTabClick = (tabName, showState, setShowState) => {
    if (activeTab === tabName) {
      setShowState(!showState);
    } else {
      setActiveTab(tabName);
      setShowState(true);
    }
  };

  useEffect(() => {
    if (playlist.length === 0 && playHistory.length === 0) setShowQueue(false);
  }, [playlist.length, playHistory.length]);

  useEffect(() => {
    setCurrentTime("0:00");
    setProgressPercent(0);

    const audioNode = audioRef?.current;
    if (!audioNode) return;
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

  if (!currentTrack || hasJoinedMusic === "ignored") return null;

  const togglePlayPause = () => {
    if (!canManageMusic) return;
    window.dispatchEvent(
      new CustomEvent("onicord:broadcast-music", {
        detail: isPlaying ? "PAUSE" : "RESUME",
      }),
    );
  };
  const handleSkipTrack = () => {
    if (!canManageMusic) return;
    window.dispatchEvent(
      new CustomEvent("onicord:broadcast-music", { detail: "SKIP" }),
    );
  };
  const forceStopMedia = () => {
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

  const handleRemoveTrack = (id, e) => {
    e.stopPropagation();
    if (!canManageMusic) return;
    if (removeFromQueue) {
      removeFromQueue(id);
    } else {
      setPlaylist((prev) => prev.filter((t) => t.trackId !== id));
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

  if (hasJoinedMusic !== true) {
    return (
      <div className="w-full shrink-0 bg-onicord-surface/30 rounded-onicord-outer-p4 border border-onicord-island flex flex-col overflow-hidden select-none relative backdrop-blur-md p-4 gap-3 z-10 text-left">
        <div
          className="absolute inset-0 z-0 pointer-events-none opacity-30 scale-110 blur-2xl transition-all duration-500"
          style={{
            backgroundImage: `url(${currentTrack?.thumbnail})`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        />
        <div className="relative z-10 flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">
              {t("music.playingInServer", "Música en la sala")}
            </h4>
          </div>
          <p className="text-[11px] text-onicord-subtext font-medium leading-relaxed">
            {t(
              "music.joinPromptText",
              "¿Deseas unirte a la reproducción de música en el servidor?",
            )}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => setHasJoinedMusic(true)}
              className="flex-1 py-1.5 rounded-lg bg-onicord-accent text-onicord-dark text-xs font-bold hover:brightness-110 transition-all cursor-pointer shadow-sm text-center"
            >
              {t("common.join", "Unirme")}
            </button>
            <button
              onClick={() => {
                setHasJoinedMusic("ignored");
              }}
              className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-bold transition-all cursor-pointer shadow-sm text-center"
            >
              {t("common.ignore", "Ignorar")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full shrink-0 bg-black/70 rounded-onicord-outer-p4 border border-onicord-island flex flex-col overflow-hidden select-none relative backdrop-blur-md">
      <div
        className="absolute inset-0 z-0 pointer-events-none opacity-70 scale-110 blur-lg transition-all duration-500"
        style={{
          backgroundImage: `url(${currentTrack?.thumbnail})`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }}
      />

      <div className="p-3 flex flex-col gap-3 z-10 w-full">
        {/* Seccion superior: Miniatura a la izquierda, Info de track a la derecha */}
        <div className="flex items-center gap-4 w-full">
          <div className="w-24 h-24 shrink-0 rounded-onicord-button overflow-hidden bg-black/40 border border-white/5 relative shadow-md">
            <img
              src={currentTrack.thumbnail}
              className="w-full h-full object-cover"
              alt=""
            />
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center gap-2 h-24 py-0.5">
            <div className="text-left">
              <h2 className="text-base font-semibold text-white tracking-wide truncate">
                {currentTrack.title}
              </h2>
              <p className="text-xs text-onicord-accent font-medium truncate mt-0.5 opacity-90">
                {currentTrack.author}
              </p>
            </div>

            <div className="w-full">
              <div className="flex items-center justify-between text-[10px] font-mono text-onicord-text mb-1 px-0.5">
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

        {/* Seccion inferior: Controles de reproduccion a la izquierda, Slider de volumen a la derecha */}
        <div className="flex items-center justify-between w-full gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={togglePlayPause}
              disabled={!canManageMusic}
              className={`w-10 h-10 rounded-full bg-white/[0.05] hover:bg-onicord-accent text-white hover:text-onicord-dark flex items-center justify-center font-bold shadow-md transition-all border border-white/5 text-xs active:scale-95 ${
                !canManageMusic
                  ? "opacity-40 cursor-not-allowed hover:bg-white/[0.05] hover:text-white"
                  : "cursor-pointer"
              }`}
              title={!canManageMusic ? t("music.noPermission", "No tienes permisos para controlar la música") : undefined}
            >
              {isPlaying ? <IconPause size="lg" /> : <IconPlay size="lg" />}
            </button>
            <button
              onClick={handleSkipTrack}
              disabled={!canManageMusic}
              className={`w-8 h-8 rounded-full bg-white/[0.05] hover:bg-onicord-overlay text-white hover:text-onicord-text flex items-center justify-center text-xs transition-all border border-white/5 active:scale-95 ${
                !canManageMusic
                  ? "opacity-40 cursor-not-allowed hover:bg-white/[0.05]"
                  : "cursor-pointer"
              }`}
              title={!canManageMusic ? t("music.noPermission", "No tienes permisos para controlar la música") : undefined}
            >
              <IconSkip size="lg" />
            </button>
            <button
              onClick={forceStopMedia}
              disabled={!canManageMusic}
              className={`w-8 h-8 rounded-full bg-white/[0.05] hover:bg-onicord-overlay text-white hover:text-onicord-text flex items-center justify-center text-xs transition-all border border-white/5 active:scale-95 ${
                !canManageMusic
                  ? "opacity-40 cursor-not-allowed hover:bg-white/[0.05]"
                  : "cursor-pointer"
              }`}
              title={!canManageMusic ? t("music.noPermission", "No tienes permisos para controlar la música") : undefined}
            >
              <IconStop size="lg" />
            </button>
          </div>

          <div className="flex-1 max-w-[150px] flex rounded-full bg-white/[0.05] items-center px-2.5 gap-1.5 min-w-0 h-8 border border-white/5 transition-all">
            <div className="flex items-center justify-center text-white shrink-0">
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
        <div className="flex items-center px-1 justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => handleTabClick("queue", showQueue, setShowQueue)}
              className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${activeTab === "queue" && showQueue ? "text-onicord-accent" : "text-white/40 hover:text-onicord-text"}`}
            >
              Playlist {playlist.length > 0 && `(${playlist.length})`}
            </button>
            <button
              onClick={() => handleTabClick("history", showQueue, setShowQueue)}
              className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${activeTab === "history" && showQueue ? "text-onicord-accent" : "text-white/40 hover:text-onicord-text"}`}
            >
              Historial {playHistory.length > 0 && `(${playHistory.length})`}
            </button>
          </div>
          <button
            onClick={toggleRepeat}
            disabled={!canManageMusic}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all active:scale-95 ${
              repeatMode !== 0
                ? "bg-onicord-accent/20 text-onicord-accent"
                : "bg-white/[0.05] text-white hover:bg-onicord-overlay hover:text-onicord-text border-white/5"
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

        {showQueue && (
          <div className="space-y-2.5 max-h-40 overflow-y-auto minimal-scrollbar animate-fade-in">
            {activeTab === "queue" && playlist.length === 0 && (
              <p className="text-[10px] text-white/30 text-center py-2">
                Queue is empty
              </p>
            )}
            {activeTab === "history" && playHistory.length === 0 && (
              <p className="text-[10px] text-white/30 text-center py-2">
                No songs listened to yet
              </p>
            )}

            {(activeTab === "queue" ? playlist : playHistory)
              .filter(Boolean)
              .map((track, i) => (
                <div
                  key={`${track.trackId}-${i}`}
                  draggable={activeTab === "queue" && canManageMusic}
                  onDragStart={() => {
                    if (activeTab === "queue" && canManageMusic) setDraggedIdx(i);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (
                      !canManageMusic ||
                      activeTab !== "queue" ||
                      draggedIdx === null ||
                      draggedIdx === i
                    )
                      return;
                    if (reorderQueue) {
                      reorderQueue(draggedIdx, i);
                    } else {
                      setPlaylist((prev) => {
                        const newList = [...prev];
                        const [moved] = newList.splice(draggedIdx, 1);
                        newList.splice(i, 0, moved);
                        return newList;
                      });
                    }
                    setDraggedIdx(null);
                  }}
                  onDragEnd={() => setDraggedIdx(null)}
                  onClick={() => handlePlayTrack(track)}
                  className={`flex items-center justify-between group px-1 rounded-lg hover:bg-white/[0.02] py-1 transition-colors relative cursor-pointer select-none ${draggedIdx === i ? "opacity-30 border border-dashed border-onicord-accent" : ""}`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-lg overflow-hidden bg-black/40 border border-white/5 shrink-0 relative">
                      <img
                        src={track.thumbnail}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                      {}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <IconPlay size="sm" className="text-white" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-white/90 truncate group-hover:text-[#c3a9ff] transition-colors pr-2">
                        {track.title}
                      </p>
                      <p className="text-[10px] text-white/40 truncate mt-0.5">
                        {track.author}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center shrink-0 ml-2 min-w-[40px] justify-end relative h-8">
                    <span
                      className={`text-[10px] font-mono text-white/40 transition-all duration-200 absolute ${activeTab === "queue" || activeTab === "history" ? "group-hover:opacity-0 group-hover:pointer-events-none" : ""}`}
                    >
                      {track.duration}
                    </span>
                    {activeTab === "queue" && canManageMusic && (
                      <button
                        onClick={(e) => handleRemoveTrack(track.trackId, e)}
                        className="opacity-0 scale-90 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-200 p-1.5 rounded-md text-white/40 hover:text-red-400 bg-white/[0.04] hover:bg-red-500/10 border border-white/5 flex items-center justify-center absolute"
                        title={t("widgets.music.removeFromQueue")}
                      >
                        <IconClose size="base" />
                      </button>
                    )}

                    {}
                    {activeTab === "history" && (
                      <button
                        onClick={(e) => handleAddToQueue(track, e)}
                        className="opacity-0 scale-90 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto transition-all duration-200 p-1.5 rounded-md text-white/40 hover:text-green-400 bg-white/[0.04] hover:bg-green-500/10 border border-white/5 flex items-center justify-center absolute"
                        title={t("widgets.music.addToQueue")}
                      >
                        <IconAdd size="base" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.04] bg-onicord-mantle"></div>
    </div>
  );
}
