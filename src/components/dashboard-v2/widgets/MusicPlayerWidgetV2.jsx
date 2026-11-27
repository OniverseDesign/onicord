import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import MusicProgressBar from "../../ui/MusicProgressBar";
import Tooltip from "../../ui/Tooltip";
import { cn } from "../../../lib/cn";
import { useWidgetLayout } from "../WidgetLayoutContext";
import WidgetShell from "../primitives/WidgetShell";

export default function MusicPlayerWidgetV2({ musicState, setCustomBackground }) {
  const { t } = useTranslation();
  const { sizeMode, cols, rows, widthPx, heightPx } = useWidgetLayout();
  const [activeTab, setActiveTab] = useState("queue");
  const [draggedIdx, setDraggedIdx] = useState(null);

  const isOneByOne = cols === 1 && rows === 1;
  const showQueueHistory = rows >= 3 && cols >= 2;
  const showVolumeInline = cols >= 3 || widthPx >= 310;

  const {
    currentTrack,
    playlist = [],
    isPlaying = false,
    volume = 1,
    setVolume,
    playHistory = [],
    repeatMode = 0,
    audioRef,
    setPlaylist,
    canManageMusic = true,
    removeFromQueue,
    reorderQueue,
    pauseTrack,
    resumeTrack,
    skipTrack,
    stopTrack,
    playTrackNow,
    enqueueTrack,
    toggleRepeat: contextToggleRepeat,
    setRepeatMode,
  } = musicState || {};

  const bgThumbnail =
    currentTrack?.thumbnail ||
    (isOneByOne ? (playHistory[0] || playlist[0])?.thumbnail : null);

  const setCustomBgRef = useRef(setCustomBackground);
  setCustomBgRef.current = setCustomBackground;

  useEffect(() => {
    if (!musicState) return;
    if (bgThumbnail) {
      setCustomBgRef.current?.({
        type: "image",
        value: bgThumbnail,
        unblurred: isOneByOne,
      });
    } else {
      setCustomBgRef.current?.(null);
    }
  }, [musicState, bgThumbnail, isOneByOne]);

  useEffect(() => {
    if (!currentTrack && playlist.length === 0 && playHistory.length > 0) {
      setActiveTab("history");
    } else if (currentTrack && playlist.length > 0 && activeTab === "history") {
      setActiveTab("queue");
    }
  }, [currentTrack, playlist.length, playHistory.length]);

  const hasMediaBg = Boolean(bgThumbnail);
  const inkClass = hasMediaBg ? "text-onicord-on-scrim" : "";

  const togglePlayPause = () => {
    if (!canManageMusic) return;
    if (isPlaying) pauseTrack?.();
    else resumeTrack?.();
  };

  const handleSkip = () => {
    if (!canManageMusic) return;
    skipTrack?.();
  };

  const forceStop = () => {
    if (!canManageMusic) return;
    stopTrack?.();
  };

  const toggleRepeat = () => {
    if (!canManageMusic) return;
    if (contextToggleRepeat) contextToggleRepeat();
    else if (setRepeatMode) setRepeatMode((repeatMode + 1) % 3);
  };

  const resolveTrackUrl = (track) =>
    track.originalUrl ||
    (track.source?.toLowerCase().includes("soundcloud")
      ? `https://soundcloud.com/tracks/${track.trackId}`
      : `https://youtube.com/watch?v=${track.trackId}`);

  const handlePlayTrack = (track) => {
    const url = resolveTrackUrl(track);
    if (canManageMusic) playTrackNow?.(url);
    else enqueueTrack?.(url);
  };

  const handleRemove = (trackId, e) => {
    e.stopPropagation();
    if (!canManageMusic) return;
    if (removeFromQueue) removeFromQueue(trackId);
    else setPlaylist?.((prev) => prev.filter((item) => item.trackId !== trackId));
  };

  const handleAddToQueue = (track, e) => {
    e.stopPropagation();
    enqueueTrack?.(resolveTrackUrl(track));
  };

  const statusBadge = (
    <span className="bento-v2-pill font-mono">
      {isPlaying ? (
        <>
          <span className="inline-flex items-end gap-[2px] h-3">
            <span className="w-[2.5px] h-full rounded-full bg-current bento-v2-eq-bar" />
            <span
              style={{ animationDelay: "180ms" }}
              className="w-[2.5px] h-full rounded-full bg-current bento-v2-eq-bar"
            />
            <span
              style={{ animationDelay: "360ms" }}
              className="w-[2.5px] h-full rounded-full bg-current bento-v2-eq-bar"
            />
          </span>
          <span>{t("widgets.music.statusPlaying", "PLAY")}</span>
        </>
      ) : (
        <span>
          {currentTrack
            ? t("widgets.music.statusPaused", "PAUSED")
            : playHistory.length > 0
              ? t("widgets.music.history", "History")
              : t("widgets.music.statusIdle", "IDLE")}
        </span>
      )}
    </span>
  );

  const renderTransportControls = (compactControls = false) => (
    <div className="flex items-center gap-1.5 shrink-0">
      <Tooltip
        content={!canManageMusic ? t("music.noPermission", "No permission to control music") : ""}
        disabled={canManageMusic}
        side="top"
      >
        <span className="inline-flex">
          <button
            type="button"
            onClick={togglePlayPause}
            disabled={!canManageMusic}
            className={cn(
              "w-10 h-10 rounded-full bg-onicord-tint/[0.05] hover:bg-onicord-accent hover:text-onicord-on-accent flex items-center justify-center font-bold shadow-md transition-all border border-onicord-border text-xs active:scale-95",
              !canManageMusic ? "opacity-40 cursor-not-allowed hover:bg-onicord-tint/[0.05]" : "cursor-pointer",
              inkClass
            )}
          >
            <MaterialIcon name={isPlaying ? "pause" : "play_arrow"} size="lg" />
          </button>
        </span>
      </Tooltip>

      <Tooltip
        content={!canManageMusic ? t("music.noPermission", "No permission to control music") : ""}
        disabled={canManageMusic}
        side="top"
      >
        <span className="inline-flex">
          <button
            type="button"
            onClick={handleSkip}
            disabled={!canManageMusic}
            className={cn(
              "w-8 h-8 rounded-full bg-onicord-tint/[0.05] hover:bg-onicord-overlay hover:text-onicord-text flex items-center justify-center text-xs transition-all border border-onicord-border active:scale-95",
              !canManageMusic ? "opacity-40 cursor-not-allowed hover:bg-onicord-tint/[0.05]" : "cursor-pointer",
              inkClass
            )}
          >
            <MaterialIcon name="skip_next" size="lg" />
          </button>
        </span>
      </Tooltip>

      {!compactControls && (
        <>
          <Tooltip
            content={!canManageMusic ? t("music.noPermission", "No permission to control music") : ""}
            disabled={canManageMusic}
            side="top"
          >
            <span className="inline-flex">
              <button
                type="button"
                onClick={forceStop}
                disabled={!canManageMusic}
                className={cn(
                  "w-8 h-8 rounded-full bg-onicord-tint/[0.05] hover:bg-onicord-overlay hover:text-onicord-text flex items-center justify-center text-xs transition-all border border-onicord-border active:scale-95",
                  !canManageMusic ? "opacity-40 cursor-not-allowed hover:bg-onicord-tint/[0.05]" : "cursor-pointer",
                  inkClass
                )}
              >
                <MaterialIcon name="stop" size="lg" />
              </button>
            </span>
          </Tooltip>

          <Tooltip
            content={
              !canManageMusic
                ? t("music.noPermission", "No permission to control music")
                : t("widgets.music.repeatMode")
            }
            side="top"
          >
            <span className="inline-flex">
              <button
                type="button"
                onClick={toggleRepeat}
                disabled={!canManageMusic}
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs transition-all border active:scale-95",
                  repeatMode !== 0
                    ? "bg-onicord-accent/20 text-onicord-accent border-onicord-accent/30"
                    : cn("bg-onicord-tint/[0.05] hover:bg-onicord-overlay hover:text-onicord-text border-onicord-border", inkClass),
                  !canManageMusic ? "opacity-40 cursor-not-allowed hover:bg-onicord-tint/[0.05]" : "cursor-pointer"
                )}
              >
                <MaterialIcon name={repeatMode === 2 ? "repeat_one" : "repeat"} size="lg" />
              </button>
            </span>
          </Tooltip>
        </>
      )}
    </div>
  );

  const renderVolumeBar = () => (
    <div className="flex-1 max-w-[150px] flex rounded-full bg-onicord-tint/[0.05] items-center px-2.5 gap-1.5 min-w-0 h-8 border border-onicord-border transition-all">
      <div className={cn("flex items-center justify-center shrink-0 transition-colors", inkClass)}>
        <MaterialIcon name="volume_up" size="lg" />
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={volume}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          setVolume?.(val);
          if (audioRef?.current) audioRef.current.volume = val;
        }}
        className="w-full h-1 bg-onicord-tint/10 rounded-full appearance-none accent-onicord-accent cursor-pointer"
        style={{
          background: `linear-gradient(to right, currentColor ${volume * 100}%, color-mix(in srgb, currentColor 14%, transparent) ${volume * 100}%)`,
        }}
      />
    </div>
  );

  if (!musicState) {
    return (
      <WidgetShell title={t("widgets.music.title", "Music Player")} headerRight={statusBadge}>
        <div className="flex-1 flex items-center justify-center">
          <span className="text-xs font-mono bento-v2-ink-muted animate-pulse">
            {t("common.loading", "Loading...")}
          </span>
        </div>
      </WidgetShell>
    );
  }

  const activeList = (activeTab === "queue" ? playlist : playHistory).filter(Boolean);
  const hasAnyListItems = playlist.length > 0 || playHistory.length > 0;

  const renderQueueHistoryPanel = (compactPanel = false) => (
    <div className="flex-1 min-h-0 flex flex-col rounded-onicord-inner bento-v2-ink-track border bento-v2-ink-divider overflow-hidden">
      <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 border-b bento-v2-ink-divider shrink-0">
        <div className="bento-v2-pill-group">
          <button
            type="button"
            onClick={() => setActiveTab("queue")}
            style={
              activeTab === "queue"
                ? { backgroundColor: "var(--widget-pill-fg)", color: "var(--widget-pill-bg)" }
                : undefined
            }
            className="h-full px-2.5 rounded-full cursor-pointer"
          >
            {t("widgets.music.playlist", "Playlist")} ({playlist.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            style={
              activeTab === "history"
                ? { backgroundColor: "var(--widget-pill-fg)", color: "var(--widget-pill-bg)" }
                : undefined
            }
            className="h-full px-2.5 rounded-full cursor-pointer"
          >
            {t("widgets.music.history", "History")} ({playHistory.length})
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto bento-v2-no-scrollbar p-1.5 space-y-1">
        {activeList.length === 0 ? (
          <p className="text-2xs bento-v2-ink-muted text-center py-4">
            {activeTab === "queue"
              ? t("widgets.music.queueEmpty", "Queue empty")
              : t("widgets.music.noHistory", "No history yet")}
          </p>
        ) : (
          activeList.map((track, idx) => (
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
                ) {
                  return;
                }
                if (reorderQueue) {
                  reorderQueue(draggedIdx, idx);
                } else {
                  setPlaylist?.((prev) => {
                    const copy = [...prev];
                    const [moved] = copy.splice(draggedIdx, 1);
                    copy.splice(idx, 0, moved);
                    return copy;
                  });
                }
                setDraggedIdx(null);
              }}
              onDragEnd={() => setDraggedIdx(null)}
              onClick={() => handlePlayTrack(track)}
              className={cn(
                "flex items-center gap-2 p-1.5 rounded-onicord-button hover:bg-onicord-tint/10 transition-colors cursor-pointer group/item",
                draggedIdx === idx && "opacity-40"
              )}
            >
              <div
                className={cn(
                  "relative rounded-onicord-chip overflow-hidden shrink-0 bg-onicord-scrim",
                  compactPanel ? "w-6 h-6" : "w-7 h-7"
                )}
              >
                <img src={track.thumbnail} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-onicord-scrim opacity-0 group-hover/item:opacity-100 flex items-center justify-center transition-opacity">
                  <MaterialIcon name="play_arrow" size={14} className="text-onicord-on-scrim" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{track.title}</p>
                {!compactPanel && track.author && (
                  <p className="text-2xs bento-v2-ink-muted truncate">{track.author}</p>
                )}
              </div>
              {activeTab === "queue" && canManageMusic && (
                <Tooltip content={t("widgets.music.removeFromQueue")} side="left">
                  <button
                    type="button"
                    onClick={(e) => handleRemove(track.trackId, e)}
                    className="opacity-0 group-hover/item:opacity-100 p-1 rounded hover:text-onicord-danger transition-opacity cursor-pointer"
                  >
                    <MaterialIcon name="close" size={14} />
                  </button>
                </Tooltip>
              )}
              {activeTab === "history" && (
                <Tooltip content={t("widgets.music.addToQueue")} side="left">
                  <button
                    type="button"
                    onClick={(e) => handleAddToQueue(track, e)}
                    className="opacity-0 group-hover/item:opacity-100 p-1 rounded hover:text-onicord-success transition-opacity cursor-pointer"
                  >
                    <MaterialIcon name="add" size={14} />
                  </button>
                </Tooltip>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  // 1x1 mode: crisp unblurred album art + single centered Play/Pause button
  if (isOneByOne) {
    const latest = playHistory[0] || playlist[0];
    if (!currentTrack && !latest) {
      return (
        <WidgetShell>
          <div className="flex-1 flex items-center justify-center min-h-0">
            <MaterialIcon name="music_note" size={24} className="bento-v2-ink-muted" />
          </div>
        </WidgetShell>
      );
    }

    const targetIsPlayOnly = !currentTrack;
    const iconName = targetIsPlayOnly ? "play_arrow" : isPlaying ? "pause" : "play_arrow";
    const tooltipDisabled = targetIsPlayOnly || canManageMusic;

    return (
      <WidgetShell className={inkClass}>
        <div className="flex-1 flex items-center justify-center min-h-0" data-no-drag="true">
          <Tooltip
            content={
              !canManageMusic && currentTrack
                ? t("music.noPermission", "No permission to control music")
                : ""
            }
            disabled={tooltipDisabled}
            side="top"
          >
            <span className="inline-flex">
              <button
                type="button"
                onClick={() => (targetIsPlayOnly ? handlePlayTrack(latest) : togglePlayPause())}
                disabled={Boolean(currentTrack && !canManageMusic)}
                className={cn(
                  "w-11 h-11 rounded-full bg-onicord-scrim/65 hover:bg-onicord-accent hover:text-onicord-on-accent text-onicord-on-scrim backdrop-blur-onicord-popover border border-onicord-border flex items-center justify-center shadow-lg transition-all active:scale-95",
                  currentTrack && !canManageMusic
                    ? "opacity-40 cursor-not-allowed"
                    : "cursor-pointer"
                )}
              >
                <MaterialIcon name={iconName} size="lg" />
              </button>
            </span>
          </Tooltip>
        </div>
      </WidgetShell>
    );
  }

  // IDLE STATE (No currentTrack)
  if (!currentTrack) {
    if (!hasAnyListItems) {
      return (
        <WidgetShell title={t("widgets.music.title", "Music Player")} headerRight={statusBadge}>
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2.5 min-h-0">
            <div className="w-12 h-12 rounded-onicord-inner bento-v2-ink-pill flex items-center justify-center">
              <MaterialIcon name="music_note" size={24} />
            </div>
            <p className="text-xs font-semibold bento-v2-ink-muted max-w-[180px] leading-snug">
              {t("widgets.music.pasteUrlHint", "Paste a URL in chat")}
            </p>
          </div>
        </WidgetShell>
      );
    }

    if (rows === 1 || sizeMode === "strip") {
      const recentList = (playHistory.length > 0 ? playHistory : playlist).filter(Boolean).slice(0, 3);
      return (
        <WidgetShell
          title={t("widgets.music.title", "Music Player")}
          headerRight={statusBadge}
          hideHeaderInMicro={false}
        >
          <div className="flex-1 flex items-center gap-3 min-h-0" data-no-drag="true">
            <div className="flex items-center gap-2 shrink-0 max-w-[38%]">
              <div className="w-9 h-9 rounded-onicord-button bento-v2-ink-pill flex items-center justify-center shrink-0">
                <MaterialIcon name="history" size={18} />
              </div>
              <p className="text-xs font-semibold bento-v2-ink-muted leading-tight">
                {t("widgets.music.pasteOrHistoryHint", "Paste a URL or pick from history")}
              </p>
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto bento-v2-no-scrollbar">
              {recentList.map((track, idx) => (
                <button
                  key={`${track.trackId}-${idx}`}
                  type="button"
                  onClick={() => handlePlayTrack(track)}
                  className="px-2.5 py-1.5 rounded-onicord-button bento-v2-ink-track border bento-v2-ink-divider flex items-center gap-2 shrink-0 max-w-[170px] cursor-pointer hover:opacity-90"
                >
                  <img src={track.thumbnail} alt="" className="w-5 h-5 rounded-onicord-chip object-cover shrink-0" />
                  <span className="text-xs font-bold truncate">{track.title}</span>
                </button>
              ))}
            </div>
          </div>
        </WidgetShell>
      );
    }

    return (
      <WidgetShell title={t("widgets.music.title", "Music Player")} headerRight={statusBadge}>
        <div className="flex-1 flex flex-col gap-2 min-h-0" data-no-drag="true">
          {rows >= 3 && cols >= 2 && (
            <div className="px-3 py-2 rounded-onicord-inner bento-v2-ink-track border bento-v2-ink-divider flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 rounded-onicord-button bento-v2-ink-pill flex items-center justify-center shrink-0">
                <MaterialIcon name="music_note" size={16} />
              </div>
              <p className="text-xs font-semibold bento-v2-ink-muted truncate">
                {t("widgets.music.pasteOrHistoryHint", "Paste a URL or pick from history")}
              </p>
            </div>
          )}
          {renderQueueHistoryPanel(!showQueueHistory)}
        </div>
      </WidgetShell>
    );
  }

  // Single-row (rows === 1, cols >= 2, e.g. 2x1, 3x1): identical top layout & sizes as large version without bottom queue
  if (rows === 1) {
    return (
      <WidgetShell
        title={t("widgets.music.title", "Music Player")}
        headerRight={statusBadge}
        hideHeaderInMicro={false}
        className={inkClass}
      >
        <div className="flex-1 flex flex-col justify-between gap-2 min-h-0" data-no-drag="true">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-16 h-16 rounded-onicord-inner overflow-hidden shrink-0 border bento-v2-ink-divider bg-onicord-scrim shadow-md">
              <img src={currentTrack.thumbnail} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-black tracking-tight truncate leading-tight">
                {currentTrack.title}
              </h3>
              <p className="text-xs font-semibold text-onicord-accent truncate mt-0.5">
                {currentTrack.author}
              </p>
              <MusicProgressBar
                durationLabel={currentTrack.duration || "0:00"}
                timeTextClassName={hasMediaBg ? "text-onicord-on-scrim/85" : "bento-v2-ink-muted"}
                wrapperClassName="mt-1.5"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 shrink-0">
            {renderTransportControls(cols < 2)}
            {showVolumeInline && renderVolumeBar()}
          </div>
        </div>
      </WidgetShell>
    );
  }

  // Single-column pillar (cols === 1, rows >= 2): full-size cover + info + compact transport, no queue
  if (cols === 1) {
    return (
      <WidgetShell
        title={t("widgets.music.title", "Music Player")}
        headerRight={statusBadge}
        className={inkClass}
      >
        <div className="flex-1 flex flex-col justify-between gap-2 min-h-0" data-no-drag="true">
          <div className="flex flex-col items-center text-center gap-2 min-w-0">
            <div className="w-16 h-16 rounded-onicord-inner overflow-hidden shrink-0 border bento-v2-ink-divider bg-onicord-scrim shadow-md">
              <img src={currentTrack.thumbnail} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="w-full min-w-0">
              <h3 className="text-base font-black tracking-tight truncate leading-tight">
                {currentTrack.title}
              </h3>
              <p className="text-xs font-semibold text-onicord-accent truncate mt-0.5">
                {currentTrack.author}
              </p>
            </div>
          </div>

          <MusicProgressBar
            durationLabel={currentTrack.duration || "0:00"}
            timeTextClassName={hasMediaBg ? "text-onicord-on-scrim/85" : "bento-v2-ink-muted"}
          />

          <div className="flex items-center justify-center gap-2 shrink-0">
            {renderTransportControls(true)}
          </div>
        </div>
      </WidgetShell>
    );
  }

  // Two-row multi-column (rows === 2, cols >= 2, e.g. 2x2, 3x2): large horizontally centered cover + metadata/bar anchored near controls
  if (rows === 2) {
    return (
      <WidgetShell
        title={t("widgets.music.title", "Music Player")}
        headerRight={statusBadge}
        className={inkClass}
      >
        <div className="flex-1 flex flex-col justify-between gap-3 min-h-0" data-no-drag="true">
          <div className="flex-1 min-h-0 flex items-center justify-center py-0.5">
            <div className="h-full aspect-square max-w-full rounded-onicord-inner overflow-hidden border bento-v2-ink-divider bg-onicord-scrim shadow-lg">
              <img src={currentTrack.thumbnail} alt="" className="w-full h-full object-cover" />
            </div>
          </div>

          <div className="shrink-0 flex flex-col gap-2.5">
            <div className="min-w-0">
              <h3 className="text-base font-black tracking-tight truncate leading-tight">
                {currentTrack.title}
              </h3>
              <p className="text-xs font-semibold text-onicord-accent truncate mt-0.5">
                {currentTrack.author}
              </p>
            </div>

            <MusicProgressBar
              durationLabel={currentTrack.duration || "0:00"}
              timeTextClassName={hasMediaBg ? "text-onicord-on-scrim/85" : "bento-v2-ink-muted"}
            />

            <div className="flex items-center justify-between gap-2">
              {renderTransportControls(false)}
              {showVolumeInline && renderVolumeBar()}
            </div>
          </div>
        </div>
      </WidgetShell>
    );
  }

  // Multi-cell layout (cols >= 2 && rows >= 2): unified full-size track & controls; Queue/History only when rows >= 3
  return (
    <WidgetShell
      title={t("widgets.music.title", "Music Player")}
      headerRight={statusBadge}
      className={inkClass}
    >
      <div
        className={cn(
          "flex-1 flex flex-col min-h-0",
          showQueueHistory ? "gap-4" : "justify-between gap-2"
        )}
        data-no-drag="true"
      >
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-16 h-16 rounded-onicord-inner overflow-hidden shrink-0 border bento-v2-ink-divider bg-onicord-scrim shadow-md">
            <img src={currentTrack.thumbnail} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black tracking-tight truncate leading-tight">
              {currentTrack.title}
            </h3>
            <p className="text-xs font-semibold text-onicord-accent truncate mt-0.5">
              {currentTrack.author}
            </p>
            <MusicProgressBar
              durationLabel={currentTrack.duration || "0:00"}
              timeTextClassName={hasMediaBg ? "text-onicord-on-scrim/85" : "bento-v2-ink-muted"}
              wrapperClassName="mt-1.5"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 shrink-0">
          {renderTransportControls(false)}
          {showVolumeInline && renderVolumeBar()}
        </div>

        {showQueueHistory && renderQueueHistoryPanel(false)}
      </div>
    </WidgetShell>
  );
}
