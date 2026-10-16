import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { IconJoystick } from "../icons/StreamIcons";

export default function RichPresenceCard({
  gameName,
  details,
  startTime,
  cover,
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

  return (
    <div className="shrink-0 bg-onicord-base rounded-onicord-outer-p4 border border-onicord-island py-3">
      <div className="flex items-center gap-5 px-4">
        <div className="w-14 h-14 shrink-0 rounded-[10px] overflow-hidden flex items-center justify-center bg-onicord-surface/40">
          {cover ? (
            <img
              src={cover}
              alt={gameName}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xl font-bold text-onicord-muted">
              {gameName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          {}
          <div
            ref={containerRef}
            className="relative w-full overflow-hidden whitespace-nowrap group"
          >
            {}
            <div
              className={`flex min-w-full w-max ${
                isOverflowing ? "animate-marquee group-hover:animate-none" : ""
              }`}
            >
              {}
              <p
                ref={textRef}
                className={`text-[14px] font-bold text-onicord-text leading-tight shrink-0 ${
                  isOverflowing ? "pr-6" : ""
                }`}
              >
                {gameName}
              </p>

              {}
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

          {details && (
            <p className="text-[12px] text-onicord-subtext truncate leading-snug mt-0.5">
              {details}
            </p>
          )}

          <div className="flex items-center text-onicord-success gap-1.5 mt-1">
            <IconJoystick size="lg" />
            <span className="text-[12px] font-mono font-bold tracking-tight">
              {elapsedTime}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
