import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import RichPresenceCard from "./RichPresenceCard";
import FlameBadge from "./FlameBadge";
import AvatarPicker from "./AvatarPicker";
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
  isClosing: externalIsClosing = false,
  userRolesList = [],
  disableFlameSystem = false,
  serverId = "",
  isInlinePreview = false,
  onAvatarClick = null,
  onRemoveAvatar = null,
  onBannerClick = null,
  onRemoveBanner = null,
  onEditProfile = null,
  onOpenSecurity = null,
}) {
  const { t } = useTranslation();
  const popoutRef = useRef(null);
  const { isClosing: internalIsClosing, triggerClose } = useInternalClose(onClose, 110);
  const isClosing = Boolean(externalIsClosing || internalIsClosing);

  useEffect(() => {
    if (!isInlinePreview) {
      soundEngine.playNav("open");
    }
  }, [isInlinePreview]);

  useEffect(() => {
    if (isClosing && !isInlinePreview) {
      soundEngine.playNav("close");
    }
  }, [isClosing, isInlinePreview]);

  useEffect(() => {
    if (isInlinePreview || !onClose) return;
    const handleClickOutside = (e) => {
      if (popoutRef.current && popoutRef.current.contains(e.target)) {
        return;
      }
      if (e.target.closest?.("[data-user-popout-trigger]")) {
        return;
      }
      triggerClose();
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        triggerClose();
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [triggerClose, isInlinePreview, onClose]);

  const hasBanner = Boolean(member.banner);
  const showBannerUploadSlot = !hasBanner && isInlinePreview && Boolean(onBannerClick);

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

  // Keep structural profile choices (surface/mantle/overlay) fixed instead of flipping with Light/Dark theme
  const resolvedBgColor =
    currentColorConfig?.isStructure && currentColorConfig.key !== "default"
      ? `rgb(${currentColorConfig.rawRgb})`
      : member.profileColor || undefined;

  const isRightSide = x > window.innerWidth / 2;
  const style = isInlinePreview
    ? {
        backgroundColor: resolvedBgColor,
        position: "relative",
        width: "100%",
        maxWidth: "280px",
      }
    : {
        top: Math.max(10, Math.min(y, window.innerHeight - (hasBanner ? 520 : 440))),
        left: isRightSide ? Math.max(10, x - 300) : Math.min(window.innerWidth - 300, x + 20),
        transformOrigin: isRightSide ? "top right" : "top left",
        backgroundColor: resolvedBgColor,
        position: "fixed",
        zIndex: "var(--z-popover, 50)",
      };

  const isOffline = member.online === false || member.status === "offline" || member.status === "invisible";
  const dotColor = isOffline
    ? "bg-onicord-status-offline"
    : (member.status === "streamer" || member.status === "streaming")
      ? "bg-onicord-status-streaming"
      : member.status === "idle"
        ? "bg-onicord-status-idle"
        : (member.status === "dnd" || member.status === "muted" || member.status === "deafened")
          ? "bg-onicord-status-dnd"
          : "bg-onicord-status-online";
  const initial = (member.nickname || "Usuario").charAt(0).toUpperCase();
  const flameData = evaluateUserFlame(member.flame || {}, serverId);
  const displayHighest = Math.max(
    flameData.highestStreak || 0,
    flameData.currentStreak || 0,
  );

  const cutoutBorderColor =
    resolvedBgColor || "rgb(var(--onicord-bg-mantle))";

  const cutoutColorDot = "rgb(var(--onicord-bg-mantle) / 0.3)";

  const hasCustomBg = Boolean(resolvedBgColor);
  const isLightBg = currentColorConfig
    ? currentColorConfig.isLight
    : hasCustomBg
      ? isLightColor(resolvedBgColor)
      : false;
  const isAppLightMode =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("light-mode");
  const isEffectiveLightSurface = hasCustomBg ? isLightBg : isAppLightMode;

  const textMainClass = !hasCustomBg
    ? "text-onicord-text"
    : isLightBg
      ? "text-onicord-dark"
      : "text-onicord-on-scrim";
  const textMutedClass = !hasCustomBg
    ? "text-onicord-muted"
    : isLightBg
      ? "text-onicord-dark-muted font-bold"
      : "text-onicord-on-scrim/70";
  const dividerClass = !hasCustomBg
    ? "border-onicord-border"
    : isLightBg
      ? "border-onicord-on-light/10"
      : "border-onicord-on-scrim/10";
  const boxBgClass = isLightBg ? "bg-onicord-on-light/5" : "bg-onicord-on-scrim/10";
  const linkBgClass = isLightBg
    ? "bg-onicord-on-light/10 hover:bg-onicord-on-light/20 text-onicord-dark"
    : "bg-onicord-on-scrim/10 hover:bg-onicord-on-scrim/20 text-onicord-accent";
  const sectionCardClass = !hasCustomBg
    ? "bg-onicord-base border border-onicord-border-strong"
    : isLightBg
      ? "bg-onicord-on-light/[0.06] border border-onicord-on-light/15"
      : "bg-onicord-on-scrim/[0.06] border border-onicord-on-scrim/15";
  const activitySurfaceMode = !hasCustomBg
    ? "default"
    : isLightBg
      ? "light"
      : "dark";

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
        "onicord-popover-card w-[280px] flex flex-col overflow-hidden relative",
        !hasBanner && !showBannerUploadSlot && "p-3.5",
        !isInlinePreview && (isClosing ? "onicord-animate-popup-out" : "onicord-animate-popup-in"),
        !member.profileColor ? "bg-onicord-mantle" : ""
      )}
    >
      {!isInlinePreview && member.isSelf && onEditProfile && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
            onEditProfile();
          }}
          className={cn(
            "absolute w-7 h-7 rounded-full flex items-center justify-center shrink-0 p-0 transition-all z-20 cursor-pointer group",
            hasBanner
              ? "top-4 right-4 bg-onicord-scrim hover:bg-onicord-scrim-heavy backdrop-blur-sm text-onicord-on-scrim"
              : "top-2.5 right-2.5 bg-onicord-scrim hover:bg-onicord-scrim-heavy text-onicord-on-scrim"
          )}
          title={t("profileTab.editServerProfile", "Editar perfil del servidor")}
        >
          <MaterialIcon name="edit" size={14} className="transition-transform flex items-center justify-center" />
        </button>
      )}
      {hasBanner ? (
        <div className="px-2.5 pt-2.5 pb-0 w-full">
          <div className="w-full h-[96px] rounded-xl overflow-hidden relative group">
            <SmartAnimatedImage
              src={member.banner}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
            {onBannerClick && (
              <div className="absolute inset-0 bg-onicord-scrim opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onBannerClick();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-onicord-accent hover:bg-onicord-accent/80 text-onicord-on-accent text-xs font-bold flex items-center gap-1.5 shadow-md transition-transform hover:scale-105 cursor-pointer"
                  title={t("profileTab.changeBanner", "Cambiar Portada")}
                >
                  <MaterialIcon name="photo_camera" size={15} />
                  <span>{t("profileTab.changeBanner", "Cambiar Portada")}</span>
                </button>
                {onRemoveBanner && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveBanner();
                    }}
                    className="px-1.5 py-1.5 rounded-xl bg-onicord-danger hover:bg-onicord-danger/80 text-onicord-on-danger text-xs font-bold flex items-center gap-1.5 shadow-md transition-transform hover:scale-105 cursor-pointer"
                    title={t("profileTab.removeBanner", "Eliminar portada")}
                  >
                    <MaterialIcon name="delete" size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      ) : showBannerUploadSlot ? (
        <div className="px-2.5 pt-2.5 pb-0 w-full">
          <button
            type="button"
            onClick={onBannerClick}
            className={cn(
              "w-full h-[54px] rounded-xl border border-dashed transition-all flex items-center justify-center gap-2 text-xs font-semibold cursor-pointer group",
              isLightBg
                ? "border-black/15 hover:border-black/40 bg-black/[0.04] hover:bg-black/[0.08] text-onicord-dark-muted hover:text-onicord-dark"
                : "border-onicord-tint/15 hover:border-onicord-accent/50 bg-onicord-tint/[0.02] hover:bg-onicord-tint/[0.06] text-onicord-muted hover:text-onicord-text"
            )}
            title={t("profileTab.uploadBanner", "Subir Portada")}
          >
            <MaterialIcon
              name="wallpaper"
              size={16}
              className={cn(
                "group-hover:scale-110 transition-transform",
                isLightBg ? "text-onicord-dark" : "text-onicord-accent"
              )}
            />
            <span>{t("profileTab.uploadBanner", "Subir Portada")}</span>
          </button>
        </div>
      ) : null}
      <div
        className={cn(
          "flex flex-col items-center w-full",
          hasBanner ? "px-3.5 pb-3.5" : showBannerUploadSlot ? "px-3.5 pt-3 pb-3.5" : ""
        )}
      >
        <AvatarPicker
          src={member.avatar}
          onClick={onAvatarClick || undefined}
          onRemove={onRemoveAvatar || undefined}
          initial={initial}
          size="lg"
          readOnly={!onAvatarClick}
          removeOnHoverOnly={true}
          className={hasBanner ? "-mt-10 mb-2 relative z-10" : "mb-2"}
          emptyClassName="bg-onicord-accent text-onicord-text-dark"
          circleClassName="shadow-sm"
          circleStyle={{
            border: `4px solid ${cutoutBorderColor}`,
            boxShadow: `inset 0 0 0 2px ${cutoutColorDot}`,
          }}
          title={onAvatarClick ? t("profileTab.changeAvatar", "Cambiar foto de perfil") : undefined}
          removeTitle={t("common.delete", "Eliminar foto de perfil")}
        >
          <div
            className={`absolute bottom-0.5 right-1.5 h-5 w-5 rounded-full ${dotColor} z-10 pointer-events-none`}
            style={{
              border: `3px solid ${cutoutBorderColor}`,
              boxShadow: `inset 0 0 0 2px ${cutoutColorDot}`,
            }}
          />
        </AvatarPicker>

        <h3
          className={`text-lg font-bold leading-tight text-center ${textMainClass}`}
        >
          {member.nickname || t("common.user")}
        </h3>

        {member.globalNickname && member.globalNickname !== member.nickname && (
          <span className={`text-xs font-medium ${textMutedClass} truncate max-w-[200px] text-center -mt-0.5 mb-1`}>
            @{member.globalNickname}
          </span>
        )}

        <p className={`text-micro mb-2 text-center ${textMutedClass}`}>
          {member.customStatus ||
            (isOffline ? t("common.offline") : t("common.online"))}
        </p>

        {}
        {member.customLink && (
          <button
            onClick={handleLinkClick}
            className={`flex items-center justify-center gap-1.5 px-3 py-1.5 mb-2 rounded-onicord-button text-xs font-semibold transition-colors w-full cursor-pointer ${linkBgClass}`}
          >
            <MaterialIcon name="link" size="base" />
            <div className="mt-0.5">
              <span className="truncate">
                {member.customLink.replace(/^https?:\/\//, "")}
              </span>
            </div>
          </button>
        )}

        {/* User Flame Badge (Streak) */}
        {!disableFlameSystem && (
          <div className={`w-full mb-2 p-3 rounded-xl flex items-center justify-between ${sectionCardClass}`}>
            <div className="flex items-center gap-3 min-w-0">
              <FlameBadge days={flameData.currentStreak || 0} size="md" />
              <div className="flex flex-col min-w-0">
                <span className={`text-xs font-bold truncate ${textMainClass}`}>
                  {t("flame.title")} —{" "}
                  {t("flame.days", { count: flameData.currentStreak || 0 })}
                </span>
                <span className={`text-2xs truncate ${textMutedClass}`}>
                  {flameData.interactedToday
                    ? t("userPopout.activeToday")
                    : t("userPopout.inactiveToday")}
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className={`text-2xs block font-mono uppercase ${textMutedClass}`}>
                {t("flame.highestStreak")}
              </span>
              <span className={`text-xs font-mono font-bold ${textMainClass}`}>
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

                  if (isEffectiveLightSurface) {
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
                      borderColor: isEffectiveLightSurface
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
                          className="w-2.5 h-2.5 rounded-full shrink-0 border border-onicord-on-light/10"
                          style={{
                            backgroundColor: r.color,
                            borderColor: isEffectiveLightSurface
                              ? adaptedColor.solid
                              : adaptedColor.border,
                          }}
                        />

                        <span
                          className={`text-xs font-semibold tracking-wide leading-none select-none ${textMainClass}`}
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
                surfaceMode={activitySurfaceMode}
                details={
                  member.activity.details ||
                  (member.activity.type === "music"
                    ? t("userPanel.listeningTo", "Escuchando a")
                    : member.activity.type === "movie" || member.activity.type === "cinema" || member.activity.name === "Cinema" || member.activity.source === "addon:onicord-cinema"
                      ? (member.activity.isCatalog ? t("userPanel.exploring", "Explorando") : t("userPanel.watching", "Viendo"))
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

        {!isInlinePreview && !member.isSelf && onOpenSecurity && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose?.();
              onOpenSecurity(member);
            }}
            className={cn(
              "w-full mt-2.5 px-3 py-2 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold transition-colors cursor-pointer",
              sectionCardClass,
              isLightBg ? "hover:bg-onicord-on-light/10" : "hover:bg-onicord-tint/10"
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <MaterialIcon
                name={
                  member.verificationStatus === "verified"
                    ? "verified_user"
                    : member.verificationStatus === "key_changed"
                      ? "gpp_maybe"
                      : "shield"
                }
                size={15}
                className={cn(
                  "shrink-0",
                  member.verificationStatus === "verified"
                    ? "text-onicord-success"
                    : member.verificationStatus === "key_changed"
                      ? "text-onicord-danger"
                      : "text-onicord-accent"
                )}
              />
              <span className={cn("truncate", textMainClass)}>
                {member.verificationStatus === "verified"
                  ? t("security.verifiedPeer", "Identidad verificada")
                  : member.verificationStatus === "key_changed"
                    ? t("security.keyChangedShort", "Clave cambiada")
                    : t("security.verifyIdentity", "Verificar seguridad")}
              </span>
            </div>
            <MaterialIcon name="chevron_right" size={16} className={cn("shrink-0", textMutedClass)} />
          </button>
        )}

        {!member.isSelf && onVolumeChange && (
          <div className={`w-full mt-3 pt-3 border-t ${dividerClass}`}>
            <div className="flex items-center justify-between mb-1.5">
              <h4
                className={`text-2xs font-bold uppercase tracking-wider ${textMutedClass}`}
              >
                {t("settings.voiceVideo.volume")}
              </h4>
              <span
                className={`text-xs font-mono font-semibold ${textMutedClass}`}
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
              className="w-full h-1.5 bg-onicord-tint/15 rounded-lg appearance-none cursor-pointer accent-onicord-accent hover:accent-onicord-lavender transition-all"
            />
          </div>
        )}
      </div>
    </div>
  );

  return isInlinePreview ? content : createPortal(content, document.body);
}
