import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { IconJoystick } from "../icons/StreamIcons";
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

  return (
    <div className="shrink-0 bg-onicord-base rounded-onicord-outer-p4 border border-onicord-island py-3">
      <div className="flex items-center gap-4 px-4">
        {/* Cover image / Icon */}
        <div className="relative w-14 h-14 shrink-0">
          <div className="w-full h-full rounded-[10px] overflow-hidden flex items-center justify-center bg-onicord-surface/40">
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
                  className={isMovie ? "text-onicord-accent" : "text-onicord-muted"}
                />
              </div>
            )}
          </div>

          {/* Emulator / sub-client badge */}
          {smallCover && (
            <div
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full overflow-hidden border-2 border-onicord-base bg-onicord-surface shadow-sm flex items-center justify-center"
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
                className={`text-[14px] font-bold text-onicord-text leading-tight shrink-0 ${
                  isOverflowing ? "pr-6" : ""
                }`}
              >
                {gameName}
              </p>

              {isOverflowing && (
                <p
                  className="text-[14px] font-bold text-onicord-text leading-tight shrink-0 pr-6 group-hover:hidden"
                  aria-hidden="true"
                >
                  {gameName}
                </p>
              )}
            </div>
          </div>

          {/* Activity details */}
          {details && (
            <p className="text-[12px] text-onicord-subtext truncate leading-snug mt-0.5">
              {details}
            </p>
          )}

          {/* Dynamic session state (Discord RPC) */}
          {state && (
            <p className="text-[11px] text-onicord-muted truncate leading-snug">
              {state}
            </p>
          )}

          {/* Timer and badges */}
          <div className="flex items-center justify-between text-onicord-success gap-1.5 mt-1">
            <div className="flex items-center gap-1.5">
              {isApp ? (
                <MaterialIcon name="apps" size="lg" />
              ) : isMusic ? (
                <MaterialIcon name="headphones" size="lg" />
              ) : isMovie ? (
                <MaterialIcon name="movie" size="lg" className="text-onicord-accent" />
              ) : (
                <IconJoystick size="lg" />
              )}
              <span className="text-[12px] font-mono font-bold tracking-tight">
                {elapsedTime}
              </span>
            </div>

            {/* Badge de Grupo / Lobby si viene de RPC */}
            {party && party.size && (
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-white/5 text-onicord-subtext flex items-center gap-1">
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
