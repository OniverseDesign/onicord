import { useState } from "react";
import { useTranslation } from "react-i18next";
import FlameBadge from "./FlameBadge";
import { evaluateUserFlame } from "../../lib/flameService";
import MaterialIcon from "../icons/MaterialIcon";
import SmartAnimatedImage from "./SmartAnimatedImage";

const SIZES = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
};

export function UserAvatar({
  src,
  name,
  size = "md",
  className = "",
  isSpeaking = false,
  isMuted = false,
}) {
  const initial = (name || "?").charAt(0).toUpperCase();
  const dim = SIZES[size] || SIZES.md;

  let borderColor = "transparent";

  if (isMuted) {
    borderColor = "rgb(var(--onicord-danger))";
  } else if (isSpeaking) {
    borderColor = "rgb(var(--onicord-success))";
  }

  return (
    <div
      style={{
        boxShadow:
          borderColor !== "transparent" ? `0 0 0 2px ${borderColor}` : "none",
        transition: "box-shadow 0.12s ease",
      }}
      className={`shrink-0 overflow-hidden rounded-full ${src ? "" : "bg-onicord-accent"} ${dim} ${className}`}
    >
      {src ? (
        <SmartAnimatedImage
          src={src}
          alt=""
          className="h-full w-full object-cover rounded-full"
          isAvatar={true}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center font-semibold text-white">
          {initial}
        </span>
      )}
    </div>
  );
}

export function UserAvatarWithStatus({
  src,
  name,
  size = "md",
  isSpeaking = false,
  status = "online",
  className = "",
}) {
  const dot = (() => {
    switch (status) {
      case "offline":
      case "invisible":
        return "bg-onicord-overlay";
      case "idle":
        return "bg-amber-500";
      case "dnd":
      case "muted":
      case "deafened":
        return "bg-onicord-danger";
      case "online":
      case "voice":
      default:
        return "bg-onicord-success";
    }
  })();

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <UserAvatar
        src={src}
        name={name}
        size={size}
        isSpeaking={isSpeaking}
        isMuted={status === "muted" || status === "deafened"}
      />
      <span
        className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-onicord-surface ${dot}`}
      />
    </div>
  );
}

export default function UserListItem({
  nickname,
  avatar,
  status = "online", // 'online' | 'offline' | 'voice' | 'muted' | 'deafened'
  isSpeaking = false,
  isSelf = false,
  activity = null,
  customStatus = null,
  voiceChannelName = null,
  avatarSize = "md",
  showStatusDot = true,
  rightSlot = null,
  onContextMenu,
  title,
  className = "",
  as: Component = "li",
  fallbackSubtitle = null,
  onClick = undefined,
  nameColor = null,
  flame = null,
  showFlame = true,
  isOwner = false,
  serverId = "",
}) {
  const { t } = useTranslation();
  const name = nickname || t("common.user");
  const isOffline = status === "offline";
  const evaluatedFlame = evaluateUserFlame(flame || {}, serverId);

  let subtitle = null;

  if (customStatus) {
    subtitle = (
      <span className="text-onicord-text opacity-90 truncate block">
        {customStatus}
      </span>
    );
  } else if (voiceChannelName) {
    subtitle = (
      <span className="text-onicord-accent">🎙️ {voiceChannelName}</span>
    );
  } else if (status === "voice" && showStatusDot) {
    subtitle = (
      <span className="text-onicord-accent">{t("voice.connectedToVoice")}</span>
    );
  } else if (activity?.name) {
    const prefixKey =
      activity.type === "music" ? "userPanel.listeningTo" : "userPanel.playing";
    subtitle = (
      <span className="text-onicord-subtext group-hover:text-onicord-text transition-colors duration-150 truncate block">
        {t(prefixKey)}{" "}
        <strong className="font-semibold text-onicord-text">
          {activity.name}
        </strong>
      </span>
    );
  } else if (fallbackSubtitle) {
    subtitle = <span className="text-onicord-muted">{fallbackSubtitle}</span>;
  }

  const textColor =
    isSpeaking && !isOffline
      ? "text-onicord-text"
      : isSelf
        ? "text-onicord-text"
        : isOffline
          ? "text-onicord-muted"
          : "text-onicord-muted group-hover:text-onicord-text";

  const textSize = avatarSize === "sm" ? "text-[14px]" : "text-[15px]";
  const subTextSize = avatarSize === "sm" ? "text-[10px]" : "text-[11px]";

  return (
    <Component
      className={`onicord-list-row-interactive group flex items-center py-1 ${
        isOffline ? "opacity-40 hover:opacity-100" : ""
      } ${className}`}
      onContextMenu={onContextMenu}
      onClick={onClick}
      title={title}
    >
      <div className="flex min-w-0 flex-1 items-center gap-[10px]">
        {}
        <div
          className={`relative flex shrink-0 items-center justify-center ${avatarSize === "sm" ? "h-6 w-6" : "h-8 w-8"}`}
        >
          {showStatusDot ? (
            <UserAvatarWithStatus
              src={avatar}
              name={name}
              size={avatarSize}
              status={status}
              isSpeaking={isSpeaking}
            />
          ) : (
            <UserAvatar
              src={avatar}
              name={name}
              size={avatarSize}
              className={avatarSize === "sm" ? "!h-6 !w-6" : ""}
              isSpeaking={isSpeaking}
              isMuted={status === "muted" || status === "deafened"}
            />
          )}
        </div>

        {}
        <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
          <div className="flex flex-col min-w-0 justify-center">
            <span
              className={`truncate font-medium leading-tight transition-colors duration-100 ${textColor} ${textSize} flex items-center gap-1`}
              style={nameColor && !isOffline ? { color: nameColor } : undefined}
            >
              <span className="truncate">{name}</span>
              {isOwner && (
                <MaterialIcon
                  name="crown"
                  size={15}
                  fill={true}
                  weight={400}
                  className="text-[#FFD700] cursor-help shrink-0"
                  title={t("common.owner", "Propietario del Servidor")}
                />
              )}
            </span>

            {subtitle && (
              <span
                className={`truncate font-medium leading-tight mt-[1px] ${subTextSize}`}
              >
                {subtitle}
              </span>
            )}
          </div>
          {showFlame && status !== "voice" && (
            <div className="shrink-0 flex items-center">
              <FlameBadge days={evaluatedFlame.currentStreak || 0} size="sm" />
            </div>
          )}
        </div>
      </div>
      {rightSlot}
    </Component>
  );
}
