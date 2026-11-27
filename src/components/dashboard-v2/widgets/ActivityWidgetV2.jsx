import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import {
  formatPlaytime,
  formatRelativeDate,
  getPlaytimeData,
} from "../../../lib/playtimeTracker";
import { cn } from "../../../lib/cn";
import { useWidgetLayout } from "../WidgetLayoutContext";
import WidgetShell from "../primitives/WidgetShell";
import SegmentedBlockBar from "../primitives/SegmentedBlockBar";

function formatElapsed(startTime) {
  if (!startTime) return "00:00";
  const diff = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function ActivityCardV2({ game, isActive, elapsed, isDarkSurface, compact = false }) {
  const { t } = useTranslation();
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        setIsOverflowing(textRef.current.offsetWidth > containerRef.current.offsetWidth);
      }
    };
    const id = setTimeout(checkOverflow, 40);
    window.addEventListener("resize", checkOverflow);
    return () => {
      clearTimeout(id);
      window.removeEventListener("resize", checkOverflow);
    };
  }, [game.name]);

  const isApp = game.type === "app";
  const isMovie =
    game.type === "movie" ||
    game.type === "cinema" ||
    game.name === "Cinema" ||
    game.source === "addon:onicord-cinema";

  const displayTime = isActive ? elapsed : formatPlaytime(game.totalSeconds);

  const detailsText = isActive
    ? `${
        isApp
          ? t("gamesTab.usingNow", "Usando ahora")
          : isMovie
            ? t("userPanel.watching", "Viendo ahora")
            : t("userPanel.playing", "Jugando ahora")
      } • ${t("widgets.gaming.totalTime", "Total")}: ${formatPlaytime(game.totalSeconds)}`
    : `${t("widgets.gaming.totalTime", "Tiempo acumulado")}: ${formatPlaytime(game.totalSeconds)} • ${formatRelativeDate(game.lastPlayed, t)}`;

  return (
    <div
      className={cn(
        "shrink-0 rounded-onicord-outer-p4 border w-full transition-colors duration-normal",
        compact ? "py-2.5 px-3" : "py-3 px-3.5",
        isDarkSurface
          ? "bg-onicord-mantle/55 border-onicord-island"
          : "bento-v2-ink-track bento-v2-ink-divider"
      )}
    >
      <div className={cn("flex items-center", compact ? "gap-3" : "gap-3.5")}>
        {/* Cover */}
        <div
          className={cn(
            "shrink-0 rounded-onicord-button overflow-hidden flex items-center justify-center",
            compact ? "w-11 h-11" : "w-14 h-14",
            isDarkSurface ? "bg-onicord-surface/40" : "bento-v2-ink-pill"
          )}
        >
          {game.cover ? (
            <img src={game.cover} alt={game.name} className="w-full h-full object-cover" />
          ) : isMovie ? (
            <MaterialIcon name="movie" size={compact ? 22 : 28} className="text-onicord-accent" />
          ) : (
            <span className={cn("font-bold bento-v2-ink-muted", compact ? "text-base" : "text-xl")}>
              {game.name.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col min-w-0 flex-1">
          <div ref={containerRef} className="relative w-full overflow-hidden whitespace-nowrap group/title">
            <div
              className={cn(
                "flex min-w-full w-max",
                isOverflowing && "animate-marquee group-hover/title:animate-none"
              )}
            >
              <p
                ref={textRef}
                className={cn(
                  "text-sm font-bold leading-tight shrink-0",
                  isOverflowing && "pr-6"
                )}
              >
                {game.name}
              </p>
              {isOverflowing && (
                <p
                  className="text-sm font-bold leading-tight shrink-0 pr-6 group-hover/title:hidden"
                  aria-hidden="true"
                >
                  {game.name}
                </p>
              )}
            </div>
          </div>

          <p className="text-xs bento-v2-ink-muted truncate leading-snug mt-0.5">
            {detailsText}
          </p>

          <div
            className={cn(
              "flex items-center gap-1.5 mt-1",
              isActive
                ? isDarkSurface
                  ? "text-onicord-success"
                  : "font-black"
                : "bento-v2-ink-muted"
            )}
          >
            <MaterialIcon
              name={isApp ? "apps" : isMovie ? "movie" : "sports_esports"}
              size="lg"
              className="undefined"
            />
            <span className="text-xs font-mono font-bold tracking-tight">
              {displayTime}
            </span>
            {isActive && (
              <span
                className={cn(
                  "ml-auto text-2xs font-mono font-bold px-1.5 py-0.5 rounded-onicord-chip",
                  isDarkSurface
                    ? "bg-onicord-success/20 text-onicord-success"
                    : "bento-v2-ink-pill"
                )}
              >
                {t("common.live", "EN VIVO")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ActivityWidgetV2({ activeGame = null }) {
  const { t } = useTranslation();
  const { sizeMode, isDarkSurface } = useWidgetLayout();
  const [playtimeMap, setPlaytimeMap] = useState(() => getPlaytimeData());
  const [elapsed, setElapsed] = useState("00:00");

  useEffect(() => {
    const onUpdate = (e) => {
      if (e.detail) setPlaytimeMap(e.detail);
    };
    window.addEventListener("onicord-playtime-updated", onUpdate);
    return () => window.removeEventListener("onicord-playtime-updated", onUpdate);
  }, []);

  const isValidActiveGame = Boolean(
    activeGame?.name &&
      activeGame.type !== "music" &&
      activeGame.type !== "launcher" &&
      !activeGame.isCatalog
  );

  useEffect(() => {
    if (!isValidActiveGame) return;
    const start = activeGame.startTime || Date.now();
    setElapsed(formatElapsed(start));
    const id = setInterval(() => setElapsed(formatElapsed(start)), 1000);
    return () => clearInterval(id);
  }, [isValidActiveGame, activeGame?.name, activeGame?.startTime]);

  const gamesList = useMemo(() => {
    const map = { ...playtimeMap };
    if (isValidActiveGame && !map[activeGame.name]) {
      map[activeGame.name] = {
        name: activeGame.name,
        cover: activeGame.cover || null,
        type: activeGame.type || "game",
        totalSeconds: 0,
        lastPlayed: Date.now(),
      };
    }

    return Object.values(map)
      .filter((g) => g && g.type !== "launcher" && !g.isCatalog)
      .sort((a, b) => {
        const aActive = isValidActiveGame && activeGame?.name === a.name;
        const bActive = isValidActiveGame && activeGame?.name === b.name;
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        return (b.totalSeconds || 0) - (a.totalSeconds || 0);
      });
  }, [playtimeMap, activeGame, isValidActiveGame]);

  const totalSecondsAll = useMemo(
    () => Math.max(1, gamesList.reduce((acc, g) => acc + (g.totalSeconds || 0), 0)),
    [gamesList]
  );

  const topItem = gamesList[0] || null;
  const topIsLive = Boolean(isValidActiveGame && topItem && activeGame?.name === topItem.name);

  const badge = (
    <span className="bento-v2-pill font-mono">
      {topIsLive ? t("widgets.gaming.live", "LIVE") : formatPlaytime(totalSecondsAll)}
    </span>
  );

  if (gamesList.length === 0) {
    return (
      <WidgetShell title={t("widgets.gaming.title", "Activity")} headerRight={badge}>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 min-h-0">
          <div className="w-11 h-11 rounded-onicord-inner bento-v2-ink-pill flex items-center justify-center">
            <MaterialIcon name="sports_esports" size={22} />
          </div>
          <p className="text-xs font-bold">{t("widgets.gaming.empty", "No activity logged yet")}</p>
          <p className="text-2xs bento-v2-ink-muted max-w-[200px]">
            {t("widgets.gaming.emptyHint", "Launch any registered game or application to automatically log your time.")}
          </p>
        </div>
      </WidgetShell>
    );
  }

  // MICRO mode
  if (sizeMode === "micro") {
    return (
      <WidgetShell>
        <div className="flex-1 flex flex-col justify-between min-h-0">
          <span className="text-xs font-bold truncate">{topItem.name}</span>
          <span
            style={{ fontSize: "clamp(1.3rem, 22cqmin, 3.2rem)" }}
            className="bento-v2-display-hero truncate"
          >
            {topIsLive ? elapsed : formatPlaytime(topItem.totalSeconds)}
          </span>
        </div>
      </WidgetShell>
    );
  }

  const segmentColors = [0.95, 0.65, 0.42, 0.25];
  const segments = gamesList.slice(0, 4).map((g, idx) => ({
    id: g.name,
    label: g.name,
    value: Math.max(60, g.totalSeconds || 60),
    opacity: segmentColors[idx] ?? 0.2,
  }));

  // STRIP mode
  if (sizeMode === "strip") {
    return (
      <WidgetShell title={t("widgets.gaming.title", "Actividad")} headerRight={badge}>
        <div className="flex-1 flex items-center gap-4 min-h-0">
          <div className="flex items-center gap-2.5 min-w-0 shrink-0 max-w-[52%]">
            <div className="w-11 h-11 rounded-onicord-inner overflow-hidden shrink-0 bento-v2-ink-track flex items-center justify-center">
              {topItem.cover ? (
                <img src={topItem.cover} alt={topItem.name} className="w-full h-full object-cover" />
              ) : (
                <MaterialIcon name="sports_esports" size={20} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-black truncate">{topItem.name}</p>
              <p className="text-xs font-mono font-bold bento-v2-ink-muted">
                {topIsLive ? elapsed : formatPlaytime(topItem.totalSeconds)}
              </p>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            <SegmentedBlockBar segments={segments} className="h-4" />
            <div className="flex items-center justify-between text-2xs font-mono bento-v2-ink-muted truncate">
              <span>{t("widgets.gaming.appsCount", "{{count}} apps", { count: gamesList.length })}</span>
              <span>{t("widgets.gaming.totalShort", "Total")} {formatPlaytime(totalSecondsAll)}</span>
            </div>
          </div>
        </div>
      </WidgetShell>
    );
  }

  // COMPACT / PILLAR / STANDARD / EXPANDED -> Chat-island / v1 style ActivityCardV2 list
  const isCompactCard = sizeMode === "compact";

  return (
    <WidgetShell title={t("widgets.gaming.title", "Activity")} headerRight={badge}>
      <div className="flex-1 flex flex-col gap-2 min-h-0">
        {sizeMode === "expanded" && segments.length > 1 && (
          <div className="shrink-0 pb-0.5">
            <SegmentedBlockBar segments={segments} className="h-2.5" />
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto bento-v2-no-scrollbar space-y-2">
          {gamesList.map((game) => {
            const isActive =
              isValidActiveGame &&
              activeGame?.name === game.name &&
              (activeGame?.type === "game" ||
                activeGame?.type === "client" ||
                activeGame?.type === "app" ||
                activeGame?.type === "movie");
            return (
              <ActivityCardV2
                key={game.name}
                game={game}
                isActive={isActive}
                elapsed={elapsed}
                isDarkSurface={isDarkSurface}
                compact={isCompactCard}
              />
            );
          })}
        </div>
      </div>
    </WidgetShell>
  );
}
