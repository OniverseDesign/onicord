import { memo } from "react";
import { useMusicPlaybackStore } from "../../stores/useMusicPlaybackStore";

/**
 * Leaf progress bar + time display subscribed atomically to useMusicPlaybackStore.
 * Prevents full MusicIsland / MusicPlayerWidget re-renders on audio `timeupdate` events.
 */
const MusicProgressBar = memo(function MusicProgressBar({
  durationLabel = "0:00",
  timeTextClassName = "text-onicord-text",
  wrapperClassName = "w-full",
}) {
  const currentTimeFormatted = useMusicPlaybackStore((s) => s.currentTimeFormatted);
  const progressPercent = useMusicPlaybackStore((s) => s.progressPercent);

  return (
    <div className={wrapperClassName}>
      <div
        className={`flex items-center justify-between text-[10px] font-mono mb-1 px-0.5 transition-colors ${timeTextClassName}`}
      >
        <span>{currentTimeFormatted}</span>
        <span>{durationLabel}</span>
      </div>
      <div className="h-2 bg-onicord-tint/10 rounded-full overflow-hidden w-full relative transition-all">
        <div
          className="h-full bg-onicord-accent transition-all duration-150 rounded-full"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
});

export default MusicProgressBar;
