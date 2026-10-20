import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import RichPresenceCard from "./RichPresenceCard";
import { IconLink } from "../icons/StreamIcons";
import FlameBadge from "./FlameBadge";
import SmartAnimatedImage from "./SmartAnimatedImage";
import { evaluateUserFlame } from "../../lib/flameService";
import MaterialIcon from "../icons/MaterialIcon";
import { APP_COLORS } from "../../lib/colors";
import { soundEngine } from "../../lib/soundEngine";
import { useInternalClose } from "../../hooks/useAnimatedMount";
import { cn } from "../../lib/cn";

function getBrightness(color) {
  if (!color) return 0;
  const clean = color.trim().toLowerCase();

  if (clean.startsWith("#")) {
    let hex = clean.substring(1);
    if (hex.length === 3) {
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    }
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b);
  }

  if (clean.startsWith("rgb")) {
    const match = clean.match(/\d+/g);
    if (match && match.length >= 3) {
      const r = parseInt(match[0], 10);
      const g = parseInt(match[1], 10);
      const b = parseInt(match[2], 10);
      return Math.sqrt(0.299 * r * r + 0.587 * g * g + 0.114 * b * b);
    }
  }
  return 0;
}

function isLightColor(color) {
  if (!color) return false;
  const clean = color.replace(/\s+/g, "").toLowerCase();

  if (
    clean.includes("bg-base") ||
    clean.includes("bg-mantle") ||
    clean.includes("bg-surface") ||
    clean.includes("bg-overlay") ||
    clean.includes("base") ||
    clean.includes("mantle") ||
    clean.includes("surface") ||
    clean.includes("overlay")
  ) {
    return false;
  }

  if (
    clean.includes("mauve") ||
    clean.includes("rosewater") ||
    clean.includes("flamingo") ||
    clean.includes("pink") ||
    clean.includes("red") ||
    clean.includes("maroon") ||
    clean.includes("peach") ||
    clean.includes("yellow") ||
    clean.includes("green") ||
    clean.includes("teal") ||
    clean.includes("sky") ||
    clean.includes("sapphire") ||
    clean.includes("blue") ||
    clean.includes("lavender")
  ) {
    return true;
  }

  return getBrightness(color) > 130;
}

export default function UserProfilePopout({
  x,
  y,
  member,
  volume = 100,
  onVolumeChange,
  onClose,
  userRolesList = [],
  disableFlameSystem = false,
  serverId = "",
  isInlinePreview = false,
  onAvatarClick = null,
  onRemoveAvatar = null,
}) {
  const { t } = useTranslation();
  const popoutRef = useRef(null);
  const { isClosing, triggerClose } = useInternalClose(onClose, 110);

  useEffect(() => {
    if (!isInlinePreview) {
      soundEngine.playNav("open");
    }
  }, [isInlinePreview]);

  useEffect(() => {
    if (isInlinePreview || !onClose) return;
    const handleClickOutside = (e) => {
      if (popoutRef.current && !popoutRef.current.contains(e.target)) {
        triggerClose();
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        triggerClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [triggerClose, isInlinePreview, onClose]);

  const isRightSide = x > window.innerWidth / 2;
  const style = isInlinePreview
    ? {
        backgroundColor: member.profileColor || undefined,
        position: "relative",
        width: "100%",
        maxWidth: "280px",
      }
    : {
        top: Math.max(10, Math.min(y, window.innerHeight - 440)),
        left: isRightSide ? Math.max(10, x - 300) : Math.min(window.innerWidth - 300, x + 20),
        backgroundColor: member.profileColor || undefined,
        position: "fixed",
        zIndex: 999999,
      };

  const isOffline = member.online === false;
  const dotColor = isOffline ? "bg-onicord-overlay" : "bg-onicord-success";
  const initial = (member.nickname || "Usuario").charAt(0).toUpperCase();
  const flameData = evaluateUserFlame(member.flame || {}, serverId);
  const displayHighest = Math.max(
    flameData.highestStreak || 0,
    flameData.currentStreak || 0,
  );

  const cutoutBorderColor =
    member.profileColor || "rgb(var(--onicord-bg-mantle))";

  const cutoutColorDot = "rgb(var(--onicord-bg-mantle) / 0.3)";

  const currentColorConfig = Object.values(APP_COLORS).find(
    (c) =>
      member.profileColor === c.key ||
      member.profileColor === c.colorVar ||
      member.profileColor === c.rgbVar ||
      (member.profileColor &&
        member.profileColor.replace(/\s+/g, "") ===
          c.colorVar.replace(/\s+/g, "")) ||
      (member.profileColor &&
        member.profileColor.replace(/\s+/g, "") ===
          `rgb(${c.rawRgb})`.replace(/\s+/g, "")),
  );

  const isLightBg = currentColorConfig
    ? currentColorConfig.isLight
    : member.profileColor
      ? isLightColor(member.profileColor)
      : false;

  const textMainClass = isLightBg ? "text-onicord-dark" : "text-onicord-text";
  const textMutedClass = isLightBg
    ? "text-onicord-dark-muted font-bold"
    : "text-onicord-muted";
  const dividerClass = isLightBg ? "border-black/10" : "border-white/5";
  const boxBgClass = isLightBg ? "bg-black/5" : "bg-black/10";
  const linkBgClass = isLightBg
    ? "bg-black/10 hover:bg-black/20 text-onicord-dark"
    : "bg-black/20 hover:bg-black/40 text-onicord-accent";

  const handleLinkClick = (e) => {
    e.preventDefault();
    let url = member.customLink;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }

    if (window.electronAPI && window.electronAPI.openExternalLink) {
      window.electronAPI.openExternalLink(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const content = (
    <div
      ref={popoutRef}
      style={style}
      className={cn(
        "onicord-popover-card w-[280px] p-3.5 flex flex-col overflow-hidden",
        !isInlinePreview && "onicord-animate-popup-in",
        isClosing && "onicord-animate-popup-out",
        !member.profileColor ? "bg-onicord-mantle" : ""
      )}
    >
      <div className="flex flex-col items-center w-full">
        <div className="relative mb-2 group">
          <div
            onClick={onAvatarClick || undefined}
            className={`h-20 w-20 rounded-full overflow-hidden flex items-center justify-center text-3xl font-semibold text-onicord-text-dark shadow-sm ${member.avatar ? "" : "bg-onicord-accent"} ${onAvatarClick ? "cursor-pointer relative group" : ""}`}
            style={{
              border: `4px solid ${cutoutBorderColor}`,
              boxShadow: `inset 0 0 0 2px ${cutoutColorDot}`,
            }}
            title={onAvatarClick ? t("profileTab.changeAvatar", "Cambiar foto de perfil") : undefined}
          >
            {member.avatar ? (
              <SmartAnimatedImage
                src={member.avatar}
                alt="Profile"
                className={`h-full w-full object-cover rounded-full ${onAvatarClick ? "transition-opacity group-hover:opacity-50" : ""}`}
                isAvatar={true}
              />
            ) : (
              initial
            )}
            {onAvatarClick && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30 rounded-full">
                <MaterialIcon name="photo_camera" size={24} className="text-white" />
              </div>
            )}
          </div>

          <div
            className={`absolute bottom-0.5 right-1.5 h-5 w-5 rounded-full ${dotColor} z-10`}
            style={{
              border: `3px solid ${cutoutBorderColor}`,
              boxShadow: `inset 0 0 0 2px ${cutoutColorDot}`,
            }}
          />

          {onRemoveAvatar && member.avatar && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveAvatar();
              }}
              title={t("common.delete", "Eliminar foto de perfil")}
              className="absolute top-0 right-0 z-20 w-6 h-6 rounded-full bg-onicord-danger hover:bg-onicord-danger/80 text-white flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              <MaterialIcon name="close" size={14} />
            </button>
          )}
        </div>

        <h3
          className={`text-lg font-bold leading-tight text-center ${textMainClass}`}
        >
          {member.nickname || t("common.user")}
        </h3>

        <p className={`text-[11px] mb-2 text-center ${textMutedClass}`}>
          {member.customStatus ||
            (isOffline ? t("common.offline") : t("common.online"))}
        </p>

        {}
        {member.customLink && (
          <button
            onClick={handleLinkClick}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 mb-2 rounded-onicord-button text-[11px] font-semibold transition-colors w-full cursor-pointer ${linkBgClass}`}
          >
            <IconLink size="base" />
            <div className="mt-0.5">
              <span className="truncate">
                {member.customLink.replace(/^https?:\/\//, "")}
              </span>
            </div>
          </button>
        )}

        {/* Flama del usuario (Racha) */}
        {!disableFlameSystem && (
          <div className="w-full mb-2 p-3 rounded-xl bg-onicord-base border border-onicord-island flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <FlameBadge days={flameData.currentStreak || 0} size="md" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold truncate text-onicord-text">
                  {t("flame.title")} —{" "}
                  {t("flame.days", { count: flameData.currentStreak || 0 })}
                </span>
                <span className="text-[10px] truncate text-onicord-muted">
                  {flameData.interactedToday
                    ? t("userPopout.activeToday")
                    : t("userPopout.inactiveToday")}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[9px] block font-mono uppercase text-onicord-muted">
                {t("flame.highestStreak")}
              </span>
              <span className="text-xs font-mono font-bold text-onicord-text">
                {t("flame.days", { count: displayHighest })}
              </span>
            </div>
          </div>
        )}

        {}
        {userRolesList.length > 0 && (
          <div className="w-full flex flex-col items-center mt-1">
            <hr className={`w-full border-t mb-2.5 ${dividerClass}`} />
            <div className="flex flex-wrap gap-1.5 w-full justify-start minimal-scrollbar pr-1">
              {userRolesList.map((r) => {
                const getAdaptedRgb = (
                  hex,
                  alpha = 0.3,
                  darkenFactor = 0.7,
                ) => {
                  if (!hex) return "transparent";
                  const cleanHex = hex.replace("#", "");
                  let red = parseInt(cleanHex.substring(0, 2), 16);
                  let green = parseInt(cleanHex.substring(2, 4), 16);
                  let blue = parseInt(cleanHex.substring(4, 6), 16);

                  if (isLightBg) {
                    red = Math.round(red * darkenFactor);
                    green = Math.round(green * darkenFactor);
                    blue = Math.round(blue * darkenFactor);
                  }

                  return {
                    border: `rgba(${red}, ${green}, ${blue}, ${alpha + 0.1})`,
                    solid: `rgb(${red}, ${green}, ${blue})`,
                    translucent: `rgba(${red}, ${green}, ${blue}, ${alpha})`,
                  };
                };

                const isVirtualOwner = r.id === "owner";
                const adaptedColor = getAdaptedRgb(r.color, 0.25);

                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-center gap-1.5 px-2 py-0.5 h-[22px] rounded-full border select-none transition-all"
                    style={{
                      backgroundColor: adaptedColor.translucent,
                      borderColor: isLightBg
                        ? adaptedColor.solid
                        : adaptedColor.border,
                    }}
                    title={
                      isVirtualOwner
                        ? t("common.owner", "Propietario del Servidor")
                        : undefined
                    }
                  >
                    {isVirtualOwner ? (
                      <MaterialIcon
                        name="crown"
                        size={13}
                        fill={true}
                        weight={400}
                        className="text-[#FFD700]"
                      />
                    ) : (
                      <>
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/5"
                          style={{
                            backgroundColor: r.color,
                            borderColor: isLightBg
                              ? adaptedColor.solid
                              : adaptedColor.border,
                          }}
                        />

                        <span
                          className="text-[11px] font-semibold tracking-wide leading-none select-none"
                          style={{
                            color: isLightBg
                              ? "var(--onicord-text-dark)"
                              : "var(--onicord-text)",
                          }}
                        >
                          {r.name}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {member.activity?.name && (
          <div className="w-full flex flex-col items-center">
            <hr className={`w-full border-t my-3 ${dividerClass}`} />
            <div className="w-full">
              <RichPresenceCard
                gameName={member.activity.name}
                cover={member.activity.cover}
                smallCover={member.activity.smallCover}
                startTime={member.activity.startTime}
                type={member.activity.type || "game"}
                state={member.activity.state}
                party={member.activity.party}
                details={
                  member.activity.details ||
                  (member.activity.type === "music"
                    ? t("userPanel.listeningTo", "Escuchando a")
                    : member.activity.type === "app"
                      ? t("gamesTab.usingNow", "Usando ahora")
                      : member.activity.type === "client"
                        ? t("userPopout.inMenus", "En los menús")
                        : t("userPanel.playing", "Jugando a"))
                }
              />
            </div>
          </div>
        )}

        {!member.isSelf && onVolumeChange && (
          <div className={`w-full mt-3 pt-3 border-t ${dividerClass}`}>
            <div className="flex items-center justify-between mb-1.5">
              <h4
                className={`text-[9px] font-bold uppercase tracking-wider ${textMutedClass}`}
              >
                {t("settings.voiceVideo.volume")}
              </h4>
              <span
                className={`text-[11px] font-mono font-semibold ${textMutedClass}`}
              >
                {volume}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              value={volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              className="w-full h-1.5 bg-black/20 rounded-lg appearance-none cursor-pointer accent-onicord-accent hover:accent-onicord-lavender transition-all"
            />
          </div>
        )}
      </div>
    </div>
  );

  return isInlinePreview ? content : createPortal(content, document.body);
}
