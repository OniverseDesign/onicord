import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";

export default function RichPresenceCard({
  gameName,
  details,
  startTime,
  cover,
  smallCover = null,
  type = "game",
  state = null,
  party = null,
  surfaceMode = "default",
}) {
  const { t } = useTranslation();
  const [elapsedTime, setElapsedTime] = useState("00:00");
  const [isOverflowing, setIsOverflowing] = useState(false);

  const containerRef = useRef(null);
  const textRef = useRef(null);

  useEffect(() => {
    if (!startTime) return;

    const updateTimer = () => {
      const diffInSeconds = Math.floor((Date.now() - startTime) / 1000);

      const hours = Math.floor(diffInSeconds / 3600);
      const minutes = Math.floor((diffInSeconds % 3600) / 60);
      const seconds = diffInSeconds % 60;

      const formattedMinutes = minutes.toString().padStart(2, "0");
      const formattedSeconds = seconds.toString().padStart(2, "0");

      if (hours > 0) {
        setElapsedTime(`${hours}:${formattedMinutes}:${formattedSeconds}`);
      } else {
        setElapsedTime(`${formattedMinutes}:${formattedSeconds}`);
      }
    };

    updateTimer();
    const intervalId = setInterval(updateTimer, 1000);

    return () => clearInterval(intervalId);
  }, [startTime]);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        const hasOverflow =
          textRef.current.offsetWidth > containerRef.current.offsetWidth;
        setIsOverflowing(hasOverflow);
      }
    };

    const timerId = setTimeout(checkOverflow, 50);

    window.addEventListener("resize", checkOverflow);
    return () => {
      clearTimeout(timerId);
      window.removeEventListener("resize", checkOverflow);
    };
  }, [gameName]);

  if (!gameName) return null;

  const isApp = type === "app";
  const isMusic = type === "music";
  const isMovie =
    type === "movie" ||
    type === "cinema" ||
    gameName === "Cinema" ||
    (typeof details === "string" && details.toLowerCase().includes("cinema"));

  const surfaceStyles =
    surfaceMode === "light"
      ? {
          cardClass: "bg-onicord-on-light/[0.06] border border-onicord-on-light/15",
          coverBgClass: "bg-onicord-on-light/10",
          smallCoverBorderClass: "border-onicord-on-light/15 bg-onicord-on-light/10",
          titleClass: "text-onicord-dark",
          detailsClass: "text-onicord-dark-sub",
          stateClass: "text-onicord-dark-muted font-medium",
          fallbackIconClass: "text-onicord-dark-muted",
          timerClass: "text-onicord-dark-sub",
          movieIconClass: "text-onicord-dark",
          partyBadgeClass: "bg-onicord-on-light/10 text-onicord-dark-sub",
        }
      : surfaceMode === "dark"
        ? {
            cardClass: "bg-onicord-on-scrim/[0.06] border border-onicord-on-scrim/15",
            coverBgClass: "bg-onicord-on-scrim/10",
            smallCoverBorderClass: "border-onicord-on-scrim/20 bg-onicord-scrim",
            titleClass: "text-onicord-on-scrim",
            detailsClass: "text-onicord-on-scrim/80",
            stateClass: "text-onicord-on-scrim/65",
            fallbackIconClass: isMovie ? "text-onicord-accent-vivid" : "text-onicord-on-scrim/70",
            timerClass: "text-onicord-success-vivid",
            movieIconClass: "text-onicord-accent-vivid",
            partyBadgeClass: "bg-onicord-on-scrim/10 text-onicord-on-scrim/80",
          }
        : {
            cardClass: "bg-onicord-base border border-onicord-border-strong",
            coverBgClass: "bg-onicord-surface/40",
            smallCoverBorderClass: "border-onicord-base bg-onicord-surface",
            titleClass: "text-onicord-text",
            detailsClass: "text-onicord-subtext",
            stateClass: "text-onicord-muted",
            fallbackIconClass: isMovie ? "text-onicord-accent" : "text-onicord-muted",
            timerClass: "text-onicord-success",
            movieIconClass: "text-onicord-accent",
            partyBadgeClass: "bg-onicord-tint/5 text-onicord-subtext",
          };

  return (
    <div className={`shrink-0 rounded-onicord-outer-p4 py-3 ${surfaceStyles.cardClass}`}>
      <div className="flex items-center gap-4 px-4">
        {/* Cover image / Icon */}
        <div className="relative w-14 h-14 shrink-0">
          <div className={`w-full h-full rounded-[10px] overflow-hidden flex items-center justify-center ${surfaceStyles.coverBgClass}`}>
            {cover ? (
              <img
                src={cover}
                alt={gameName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full">
                <MaterialIcon
                  name={isApp ? "apps" : isMusic ? "music_note" : isMovie ? "movie" : "sports_esports"}
                  size={28}
                  className={surfaceStyles.fallbackIconClass}
                />
              </div>
            )}
          </div>

          {/* Emulator / sub-client badge */}
          {smallCover && (
            <div
              className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full overflow-hidden border-2 shadow-sm flex items-center justify-center ${surfaceStyles.smallCoverBorderClass}`}
              title={details || undefined}
            >
              <img
                src={smallCover}
                alt="Sub-icon"
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          {/* Animated marquee title */}
          <div
            ref={containerRef}
            className="relative w-full overflow-hidden whitespace-nowrap group"
          >
            <div
              className={`flex min-w-full w-max ${
                isOverflowing ? "animate-marquee group-hover:animate-none" : ""
              }`}
            >
              <p
                ref={textRef}
                className={`text-sm font-bold leading-tight shrink-0 ${surfaceStyles.titleClass} ${
                  isOverflowing ? "pr-6" : ""
                }`}
              >
                {gameName}
              </p>

              {isOverflowing && (
                <p
                  className={`text-sm font-bold leading-tight shrink-0 pr-6 group-hover:hidden ${surfaceStyles.titleClass}`}
                  aria-hidden="true"
                >
                  {gameName}
                </p>
              )}
            </div>
          </div>

          {/* Activity details */}
          {details && (
            <p className={`text-xs truncate leading-snug mt-0.5 ${surfaceStyles.detailsClass}`}>
              {details}
            </p>
          )}

          {/* Dynamic session state (Discord RPC) */}
          {state && (
            <p className={`text-micro truncate leading-snug ${surfaceStyles.stateClass}`}>
              {state}
            </p>
          )}

          {/* Timer and badges */}
          <div className={`flex items-center justify-between gap-1.5 mt-1 ${surfaceStyles.timerClass}`}>
            <div className="flex items-center gap-1.5">
              {isApp ? (
                <MaterialIcon name="apps" size="lg" />
              ) : isMusic ? (
                <MaterialIcon name="headphones" size="lg" />
              ) : isMovie ? (
                <MaterialIcon name="movie" size="lg" className={surfaceStyles.movieIconClass} />
              ) : (
                <MaterialIcon name="sports_esports" size="lg" />
              )}
              <span className="text-xs font-mono font-bold tracking-tight">
                {elapsedTime}
              </span>
            </div>

            {/* Party / Lobby badge from RPC */}
            {party && party.size && (
              <span className={`text-2xs font-mono font-medium px-1.5 py-0.5 rounded flex items-center gap-1 ${surfaceStyles.partyBadgeClass}`}>
                <MaterialIcon name="groups" size={12} />
                <span>
                  {party.size}/{party.max || party.size}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
