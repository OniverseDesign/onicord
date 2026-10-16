import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { IconJoystick } from "../../icons/StreamIcons";
import {
  getPlaytimeData,
  addPlaytime,
  formatPlaytime,
  formatRelativeDate,
} from "../../../lib/playtimeTracker";

function GameCardItem({ game, isActive, activeStartTime }) {
  const { t } = useTranslation();
  const [elapsedTime, setElapsedTime] = useState("00:00");
  const [isOverflowing, setIsOverflowing] = useState(false);

  const containerRef = useRef(null);
  const textRef = useRef(null);

  // Live timer for active game session
  useEffect(() => {
    if (!isActive || !activeStartTime) return;

    const updateTimer = () => {
      const diffInSeconds = Math.floor((Date.now() - activeStartTime) / 1000);

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
  }, [isActive, activeStartTime]);

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
  }, [game.name]);

  const displayTime = isActive
    ? elapsedTime
    : formatPlaytime(game.totalSeconds);

  const detailsText = isActive
    ? t("userPanel.playing", "Jugando ahora")
    : `${t("widgets.gaming.totalTime", "Tiempo acumulado")}: ${formatPlaytime(game.totalSeconds)} • ${formatRelativeDate(game.lastPlayed)}`;

  return (
    <div className="shrink-0 bg-onicord-base rounded-onicord-outer-p4 border border-onicord-island py-3 w-full transition-all duration-200">
      <div className="flex items-center gap-4 px-4">
        {/* Carátula / Portada */}
        <div className="w-14 h-14 shrink-0 rounded-[10px] overflow-hidden flex items-center justify-center">
          {game.cover ? (
            <img
              src={game.cover}
              alt={game.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="text-xl font-bold text-onicord-muted">
              {game.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>

        {/* Detalles del Juego */}
        <div className="flex flex-col min-w-0 flex-1">
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
                {game.name}
              </p>
              {isOverflowing && (
                <p
                  className="text-[14px] font-bold text-onicord-text leading-tight shrink-0 pr-6 group-hover:hidden"
                  aria-hidden="true"
                >
                  {game.name}
                </p>
              )}
            </div>
          </div>

          <p className="text-[12px] text-onicord-subtext truncate leading-snug mt-0.5">
            {detailsText}
          </p>

          <div
            className={`flex items-center gap-1.5 mt-1 ${
              isActive ? "text-onicord-success" : "text-onicord-muted"
            }`}
          >
            <IconJoystick size="lg" />
            <span className="text-[12px] font-mono font-bold tracking-tight">
              {displayTime}
            </span>
            {isActive && (
              <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded bg-onicord-success/20 text-onicord-success animate-pulse">
                {t("common.live", "EN VIVO")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GamingStatsWidget({ activeGame = null }) {
  const { t } = useTranslation();
  const [playtimeMap, setPlaytimeMap] = useState(() => getPlaytimeData());

  const activeGameRef = useRef(activeGame);
  activeGameRef.current = activeGame;

  // Track playtime every 10 seconds while a game is active
  useEffect(() => {
    if (!activeGame || activeGame.type === "music" || !activeGame.name) {
      return;
    }

    const isGame = activeGame.type === "game" || activeGame.type === "client";
    if (!isGame) return;

    const gameName = activeGame.name;
    const cover = activeGame.cover || null;

    addPlaytime(gameName, 1, cover);
    setPlaytimeMap(getPlaytimeData());

    const interval = setInterval(() => {
      if (activeGameRef.current?.name === gameName) {
        addPlaytime(gameName, 10, activeGameRef.current?.cover || cover);
        setPlaytimeMap(getPlaytimeData());
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [activeGame?.name, activeGame?.type]);

  // Combine stored games with active game state
  const gamesList = useMemo(() => {
    const map = { ...playtimeMap };
    if (
      activeGame?.name &&
      (activeGame.type === "game" || activeGame.type === "client")
    ) {
      if (!map[activeGame.name]) {
        map[activeGame.name] = {
          name: activeGame.name,
          cover: activeGame.cover || null,
          totalSeconds: 0,
          lastPlayed: Date.now(),
        };
      }
    }

    // Sort by active first, then most played
    return Object.values(map).sort((a, b) => {
      const aActive = activeGame?.name === a.name;
      const bActive = activeGame?.name === b.name;
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return (b.totalSeconds || 0) - (a.totalSeconds || 0);
    });
  }, [playtimeMap, activeGame]);

  return (
    <div
      style={{ containerType: "inline-size" }}
      className="onicord-widget-shell w-full h-full p-6 flex flex-col justify-between select-none"
    >
      {/* Header */}
      <div className="onicord-widget-header flex justify-between items-center w-full gap-2 mb-2 shrink-0">
        <h3
          style={{ fontSize: "clamp(0.6rem, 3.5cqi, 0.8rem)" }}
          className="onicord-widget-title font-bold text-onicord-text truncate"
        >
          {t("widgets.gaming.title", "Actividad de Juegos")}
        </h3>
        <span
          style={{ fontSize: "clamp(0.6rem, 3cqi, 0.5rem)" }}
          className="onicord-widget-badge-dynamic shrink-0 px-2 py-0.5 font-medium"
        >
          Gaming
        </span>
      </div>

      {/* Contenedor de Tarjetas de Juegos (Estilo RichPresenceCard) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto minimal-scrollbar space-y-2.5 pt-3 pr-0.5">
        {gamesList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4 text-onicord-muted">
            <IconJoystick size="lg" className="opacity-40 mb-2 w-8 h-8" />
            <p className="text-xs font-medium text-onicord-text">
              {t("widgets.gaming.empty", "No hay juegos registrados aún")}
            </p>
            <p className="text-[11px] text-onicord-subtext/70 mt-1">
              {t(
                "widgets.gaming.emptyHint",
                "Inicia cualquier videojuego para registrar tu tiempo automáticamente.",
              )}
            </p>
          </div>
        ) : (
          gamesList.map((game) => {
            const isActive =
              activeGame?.name === game.name &&
              (activeGame?.type === "game" || activeGame?.type === "client");
            return (
              <GameCardItem
                key={game.name}
                game={game}
                isActive={isActive}
                activeStartTime={
                  isActive ? activeGame.startTime || Date.now() : null
                }
              />
            );
          })
        )}
      </div>
    </div>
  );
}

GamingStatsWidget.widgetId = "gaming_stats";
GamingStatsWidget.badgeText = "Gaming";
GamingStatsWidget.bgVariant = "dark";
GamingStatsWidget.defaultGeo = { x: 8, y: 4, w: 2, h: 3 };
GamingStatsWidget.minW = 2;
GamingStatsWidget.minH = 2;
