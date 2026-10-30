import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { IconJoystick } from "../../icons/StreamIcons";
import MaterialIcon from "../../icons/MaterialIcon";
import {
  getPlaytimeData,
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

  const isApp = game.type === "app";
  const isMovie =
    game.type === "movie" ||
    game.type === "cinema" ||
    game.name === "Cinema" ||
    game.source === "addon:onicord-cinema";
  const displayTime = isActive
    ? elapsedTime
    : formatPlaytime(game.totalSeconds);

  const detailsText = isActive
    ? `${isApp ? t("gamesTab.usingNow", "Usando ahora") : isMovie ? t("userPanel.watching", "Viendo ahora") : t("userPanel.playing", "Jugando ahora")} • ${t("widgets.gaming.totalTime", "Total")}: ${formatPlaytime(game.totalSeconds)}`
    : `${t("widgets.gaming.totalTime", "Tiempo acumulado")}: ${formatPlaytime(game.totalSeconds)} • ${formatRelativeDate(game.lastPlayed, t)}`;

  return (
    <div className="shrink-0 bg-onicord-base rounded-onicord-outer-p4 border border-onicord-island py-3 w-full transition-all duration-200">
      <div className="flex items-center gap-4 px-4">
        {/* Cover image */}
        <div className="w-14 h-14 shrink-0 rounded-[10px] overflow-hidden flex items-center justify-center bg-onicord-surface/30">
          {game.cover ? (
            <img
              src={game.cover}
              alt={game.name}
              className="w-full h-full object-cover"
            />
          ) : isMovie ? (
            <MaterialIcon name="movie" size={28} className="text-onicord-accent" />
          ) : (
            <span className="text-xl font-bold text-onicord-muted">
              {game.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>

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
            {isApp ? (
              <MaterialIcon name="apps" size="lg" />
            ) : isMovie ? (
              <MaterialIcon name="movie" size="lg" className="text-onicord-accent" />
            ) : (
              <IconJoystick size="lg" />
            )}
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

export default function ActivityWidget({ activeGame = null }) {
  const { t } = useTranslation();
  const [playtimeMap, setPlaytimeMap] = useState(() => getPlaytimeData());

  // Listen for global playtime updates broadcasted by initGlobalPlaytimeTracker
  useEffect(() => {
    const handleUpdate = (e) => {
      if (e.detail) {
        setPlaytimeMap(e.detail);
      }
    };
    window.addEventListener("onicord-playtime-updated", handleUpdate);
    return () => window.removeEventListener("onicord-playtime-updated", handleUpdate);
  }, []);

  // Merge stored historical games with the currently active game
  const gamesList = useMemo(() => {
    const map = { ...playtimeMap };
    const isValidActiveGame =
      activeGame?.name &&
      activeGame.type !== "music" &&
      activeGame.type !== "launcher" &&
      !activeGame.isCatalog;

    if (isValidActiveGame) {
      if (!map[activeGame.name]) {
        map[activeGame.name] = {
          name: activeGame.name,
          cover: activeGame.cover || null,
          type: activeGame.type || "game",
          totalSeconds: 0,
          lastPlayed: Date.now(),
        };
      }
    }

    // Filter out game launchers and generic catalogs from the games list
    const validGames = Object.values(map).filter(
      (g) =>
        g.type !== "launcher" &&
        !g.isCatalog
    );

    // Sort: live active game first, then by total playtime descending
    return validGames.sort((a, b) => {
      const aActive = isValidActiveGame && activeGame?.name === a.name;
      const bActive = isValidActiveGame && activeGame?.name === b.name;
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
      <div className="onicord-widget-header flex justify-between items-center w-full gap-2 mb-2 shrink-0">
        <h3
          style={{ fontSize: "clamp(0.6rem, 3.5cqi, 0.8rem)" }}
          className="onicord-widget-title font-bold text-onicord-text truncate"
        >
          {t("widgets.gaming.title", "Actividad")}
        </h3>
        <span
          style={{ fontSize: "clamp(0.6rem, 3cqi, 0.5rem)" }}
          className="onicord-widget-badge-dynamic shrink-0 px-2 py-0.5 font-medium"
        >
          RPC
        </span>
      </div>

      {/* Contenedor de Tarjetas de Juegos (Estilo RichPresenceCard) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto minimal-scrollbar space-y-2.5 pt-3 pr-0.5">
        {gamesList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4 text-onicord-muted">
            <IconJoystick size="lg" className="opacity-40 mb-2 w-8 h-8" />
            <p className="text-xs font-medium text-onicord-text">
              {t("widgets.gaming.empty", "No hay actividades registradas aún")}
            </p>
            <p className="text-[11px] text-onicord-subtext/70 mt-1">
              {t(
                "widgets.gaming.emptyHint",
                "Inicia cualquier videojuego o programa registrado para registrar tu tiempo automáticamente.",
              )}
            </p>
          </div>
        ) : (
          gamesList.map((game) => {
            const isActive =
              activeGame?.name === game.name &&
              activeGame?.type !== "launcher" &&
              !activeGame?.isCatalog &&
              (activeGame?.type === "game" || activeGame?.type === "client" || activeGame?.type === "app" || activeGame?.type === "movie");
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

ActivityWidget.widgetId = "gaming_stats";
ActivityWidget.badgeText = "RPC";
ActivityWidget.bgVariant = "dark";
ActivityWidget.defaultGeo = { x: 8, y: 4, w: 2, h: 3 };
ActivityWidget.minW = 2;
ActivityWidget.minH = 2;
