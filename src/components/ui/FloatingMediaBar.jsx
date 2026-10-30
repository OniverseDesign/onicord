import React, { useRef, useEffect } from "react";
import MaterialIcon from "../icons/MaterialIcon";
import { cn } from "../../lib/cn";

/**
 * Formats seconds into MM:SS or HH:MM:SS
 */
export function formatMediaTime(sec) {
  if (!sec || isNaN(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  const padSec = remSec < 10 ? "0" + remSec : remSec;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const remMin = m % 60;
    const padMin = remMin < 10 ? "0" + remMin : remMin;
    return `${h}:${padMin}:${padSec}`;
  }
  return `${m}:${padSec}`;
}

/**
 * 1. Base Floating Media Bar Wrapper
 */
export default function FloatingMediaBar({
  visible = true,
  children,
  className,
  wrapperClassName,
  style,
  ...props
}) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{ zIndex: 999999, transform: "translate3d(0, 0, 50px)", ...style }}
      className={cn(
        "onicord-media-control-bar-wrapper transition-all duration-300",
        !visible
          ? "opacity-0 translate-y-6 pointer-events-none"
          : "opacity-100 translate-y-0 pointer-events-auto",
        wrapperClassName
      )}
      {...props}
    >
      <div className={cn("onicord-media-control-bar !overflow-visible", className)}>
        {children}
      </div>
    </div>
  );
}

/**
 * Helper to render string material icon or custom JSX icon
 */
function renderIcon(icon, defaultSize = 18) {
  if (!icon) return null;
  if (typeof icon === "string") {
    return <MaterialIcon name={icon} size={defaultSize} />;
  }
  return icon;
}

/**
 * 2. Icon Button (Round)
 */
FloatingMediaBar.IconButton = function FloatingIconButton({
  icon,
  title,
  onClick,
  active = false,
  primary = false,
  danger = false,
  disabled = false,
  className,
  type = "button",
  ...props
}) {
  let stateClasses = "text-onicord-text hover:text-white";

  if (primary) {
    stateClasses =
      "bg-onicord-accent text-onicord-dark font-bold hover:brightness-110 border border-onicord-accent";
  } else if (danger) {
    stateClasses =
      "bg-onicord-danger/20 text-onicord-danger border border-onicord-danger/30 hover:bg-onicord-danger hover:text-white";
  } else if (active) {
    stateClasses =
      "bg-onicord-accent/20 text-onicord-accent border border-onicord-accent/40 font-semibold";
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn("onicord-icon-btn-round", stateClasses, className)}
      {...props}
    >
      {renderIcon(icon, 18)}
    </button>
  );
};

/**
 * 3. Pill Button (Capsule with icon + optional label)
 */
FloatingMediaBar.PillButton = function FloatingPillButton({
  icon,
  label,
  title,
  onClick,
  variant = "default",
  responsiveText = false,
  disabled = false,
  className,
  type = "button",
  ...props
}) {
  let variantClasses = "";
  if (variant === "success") {
    variantClasses =
      "bg-onicord-success/20 hover:bg-onicord-success/35 text-onicord-success border border-onicord-success/30";
  } else if (variant === "accent") {
    variantClasses =
      "bg-onicord-accent/20 hover:bg-onicord-accent/35 text-onicord-accent border border-onicord-accent/30";
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title || (typeof label === "string" ? label : undefined)}
      className={cn("onicord-media-bar-btn", variantClasses, className)}
      {...props}
    >
      {renderIcon(icon, 18)}
      {label && (
        <span className={responsiveText ? "hidden @[480px]:inline" : undefined}>
          {label}
        </span>
      )}
    </button>
  );
};

/**
 * 4. Stop / Terminate Button (Round danger button)
 */
FloatingMediaBar.StopButton = function FloatingStopButton({
  icon = "close",
  title = "Cerrar",
  onClick,
  className,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      title={title}
      className={cn("onicord-icon-btn-round-stop", className)}
      {...props}
    >
      {renderIcon(icon, 18)}
    </button>
  );
};

/**
 * 5. Divider
 */
FloatingMediaBar.Divider = function FloatingDivider({ className }) {
  return (
    <div
      className={cn("w-px h-4 bg-white/5 shrink-0 mx-1 select-none", className)}
    />
  );
};

/**
 * 6. Audio Volume Control (Mute Toggle + Range Slider)
 */
FloatingMediaBar.Volume = function FloatingVolume({
  volume = 1,
  max = 1,
  step = 0.01,
  isMuted = false,
  onVolumeChange,
  onToggleMute,
  titleMute = "Silenciar",
  titleUnmute = "Activar sonido",
  showDividers = true,
  customMuteIcon,
  customUnmuteIcon,
  className,
  sliderClassName,
  sliderStyle,
}) {
  const isZero = isMuted || Number(volume) === 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 shrink-0",
        showDividers === true && "border-l border-r border-white/5",
        showDividers === "left" && "border-l border-white/5",
        showDividers === "right" && "border-r border-white/5",
        className
      )}
    >
      <button
        type="button"
        onClick={onToggleMute}
        className={cn(
          "onicord-icon-btn-round",
          isZero
            ? "bg-onicord-danger/20 text-onicord-danger border border-onicord-danger/30 hover:bg-onicord-danger hover:text-white"
            : "text-onicord-text hover:text-white"
        )}
        title={isZero ? titleUnmute : titleMute}
      >
        {isZero
          ? renderIcon(customMuteIcon || "volume_off", 18)
          : renderIcon(customUnmuteIcon || "volume_up", 18)}
      </button>

      <input
        type="range"
        min="0"
        max={max}
        step={step}
        value={isMuted ? 0 : volume}
        onChange={(e) => onVolumeChange && onVolumeChange(Number(e.target.value))}
        className={cn(
          "w-16 h-1.5 bg-black/40 rounded-full appearance-none cursor-pointer accent-onicord-accent",
          sliderClassName
        )}
        style={sliderStyle}
      />
    </div>
  );
};

/**
 * 7. Timeline Scrubber (Range slider + formatted timestamp)
 */
FloatingMediaBar.Timeline = function FloatingTimeline({
  currentTime = 0,
  duration = 0,
  isSeeking = false,
  onSeekStart,
  onSeekChange,
  onSeekEnd,
  format = formatMediaTime,
  className,
}) {
  return (
    <div className={cn("flex items-center gap-2 px-1 min-w-[140px] max-w-[260px]", className)}>
      <input
        type="range"
        min={0}
        max={duration || 100}
        step={0.1}
        value={currentTime}
        onMouseDown={onSeekStart}
        onTouchStart={onSeekStart}
        onChange={(e) => onSeekChange && onSeekChange(Number(e.target.value))}
        onMouseUp={(e) => onSeekEnd && onSeekEnd(Number(e.target.value))}
        onTouchEnd={(e) => onSeekEnd && onSeekEnd(Number(e.target.value))}
        className="w-20 @[480px]:w-36 h-1.5 bg-black/40 rounded-full appearance-none cursor-pointer accent-onicord-accent hover:h-2 transition-all"
      />
      <span className="text-[11px] font-mono text-onicord-subtext tabular-nums shrink-0 select-none">
        {format(currentTime)} / {format(duration)}
      </span>
    </div>
  );
};

/**
 * 8. Popup Menu Button (Dropdown popout for Quality, Subtitles, Audio, etc.)
 */
FloatingMediaBar.Menu = function FloatingMenu({
  icon,
  title,
  menuTitle,
  showTitle = false,
  active = false,
  isOpen = false,
  onToggle,
  onClose,
  items = [],
  children,
  widthClass = "w-48",
  className,
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose && onClose();
      }
    };
    window.addEventListener("click", handleOutsideClick);
    return () => window.removeEventListener("click", handleOutsideClick);
  }, [isOpen, onClose]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "onicord-party-popup-btn onicord-icon-btn-round",
          active
            ? "bg-onicord-accent/20 text-onicord-accent border border-onicord-accent/40 font-semibold"
            : "text-onicord-text hover:text-white",
          className
        )}
        title={title}
      >
        {renderIcon(icon, 18)}
      </button>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            zIndex: 9999999,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
          className={cn(
            "onicord-party-popup absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-onicord-surface/95 backdrop-blur-2xl border border-onicord-island rounded-2xl p-1.5 z-50 flex flex-col gap-0.5 text-xs select-none max-h-60 overflow-y-auto overscroll-contain no-scrollbar shadow-2xl [&::-webkit-scrollbar]:hidden",
            widthClass
          )}
        >
          {showTitle && menuTitle && (
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-onicord-muted border-b border-white/5 flex items-center justify-between mb-1">
              <span>{menuTitle}</span>
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-onicord-muted hover:text-onicord-text transition-colors"
                >
                  <MaterialIcon name="close" size={14} />
                </button>
              )}
            </div>
          )}

          {items && items.length > 0 ? (
            items.map((item, index) => {
              const isSelected = Boolean(item.isSelected || item.active);
              return (
                <button
                  key={item.id || item.key || item.value || index}
                  type="button"
                  onClick={() => {
                    item.onClick && item.onClick();
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-colors cursor-pointer text-left",
                    isSelected
                      ? "bg-onicord-accent/20 text-onicord-accent font-semibold"
                      : "text-onicord-subtext hover:bg-onicord-base/60 hover:text-onicord-text"
                  )}
                >
                  <span className="truncate pr-1">{item.label || item.title}</span>
                  {isSelected && <MaterialIcon name="check" size={14} />}
                </button>
              );
            })
          ) : (
            children
          )}
        </div>
      )}
    </div>
  );
};
