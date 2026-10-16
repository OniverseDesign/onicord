import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import SmartAnimatedImage from "../ui/SmartAnimatedImage";
import FlameBadge from "../ui/FlameBadge";
import VoiceUserItem from "../voice/VoiceUserItem";
import MusicIsland from "../ui/MusicIsland";
import UserPanel from "./UserPanel";
import MaterialIcon from "../icons/MaterialIcon";
import {
  IconVolumeUp,
  IconDropdown,
  IconDropup,
  IconTag,
} from "../icons/StreamIcons";
import { hasChannelAccess, checkPermission } from "../../lib/permissionsHelper";

export function VoiceChannelTimer({ startTime }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!startTime) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime]);

  if (!startTime) return null;

  const elapsed = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;

  const formatted =
    h > 0
      ? `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
      : `${m}:${s.toString().padStart(2, "0")}`;

  return (
    <span className="text-[12px] font-mono font-semibold text-onicord-success ml-auto shrink-0 select-none tracking-tight">
      {formatted}
    </span>
  );
}

export function ChannelButton({
  active,
  onClick,
  icon,
  label,
  unreadCount = 0,
  rightContent = null,
  onContextMenu,
  isMuted = false,
  disabled = false,
  title = null,
  className = "",
}) {
  const hasUnread = unreadCount > 0 && !isMuted;

  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={disabled ? undefined : onClick}
      onContextMenu={onContextMenu}
      className={`group onicord-channel-wrapper ${active ? "onicord-channel-active" : ""} ${isMuted ? "opacity-50 hover:opacity-100" : ""} ${className}`}
    >
      <span
        className={`onicord-channel-indicator ${
          active
            ? "h-5 opacity-100"
            : hasUnread
              ? "h-2 opacity-100 bg-white group-hover:h-3.5"
              : "h-0 opacity-0 group-hover:h-3.5 group-hover:opacity-100"
        }`}
      />

      <div
        className={`onicord-channel ${
          hasUnread && !active ? "text-onicord-text font-bold" : ""
        }`}
      >
        {icon}
        <span className="truncate flex-1 text-left">{label}</span>

        {/* Muted notifications icon */}
        {isMuted && (
          <MaterialIcon
            name="notifications_off"
            size={14}
            className="text-onicord-muted mr-1.5 shrink-0"
          />
        )}

        {/* Contenido opcional a la derecha (ej: timer de llamadas de voz) */}
        {rightContent}

        {/* Badge de No Leídos */}
        {hasUnread && !active && (
          <div className="bg-onicord-danger text-white text-[10px] font-bold px-1.5 h-4 rounded-full flex items-center justify-center animate-scale-up">
            {unreadCount > 99 ? "99+" : unreadCount}
          </div>
        )}
      </div>
    </button>
  );
}

export default function ChannelsSidebar({
  server,
  profile,
  leftWidth,
  textChannelId,
  selectTextChannel,
  selectedVoiceChannelId,
  selectVoiceChannel,
  collapsedCategories,
  toggleCategory,
  voiceMembersDisplay = [],
  voiceStartTimesRef,
  serverFlame,
  getChannelUnreadCount,
  handleChannelContextMenu,
  handleVoiceUserContextMenu,
  setShowSettings,
  activeStreamUserIdRef,
  setActiveStreamUserId,
  setRemoteStream,
  setIsStreamFloating,
  voice,
  musicState,
  activeGame,
  globalVoice,
  resolvedVoiceChannelName,
  handleDisconnectVoice,
  onOpenAppSettings,
  localStream,
  setLocalStream,
  onProfileChange,
  handleStopScreenShare,
}) {
  const { t } = useTranslation();
  const [, setMuteToggleTick] = useState(0);

  useEffect(() => {
    const handleMuteChange = () => setMuteToggleTick((t) => t + 1);
    window.addEventListener("onicord:channel-mute-changed", handleMuteChange);
    return () => window.removeEventListener("onicord:channel-mute-changed", handleMuteChange);
  }, []);

  const isCategoryNode = (c) =>
    c.type === "category" || String(c.id).startsWith("cat-");

  const textChannels =
    server.channels?.filter(
      (c) =>
        (c.type === "text" || !c.type) &&
        !isCategoryNode(c) &&
        hasChannelAccess(server, c, profile?.id),
    ) ?? [];

  const voiceChannels =
    server.channels?.filter(
      (c) =>
        c.type === "voice" &&
        !isCategoryNode(c) &&
        hasChannelAccess(server, c, profile?.id),
    ) ?? [];

  const categories = server.channels?.filter(isCategoryNode) || [];
  const orphanChannels =
    server.channels?.filter(
      (c) =>
        !isCategoryNode(c) &&
        !c.parentId &&
        hasChannelAccess(server, c, profile?.id),
    ) ?? [];
  const hasAnyCategory = categories.length > 0;

  const getLocalizedChannelName = (chNode) => {
    if (chNode.name === "general") {
      return t("serverSettings.channels.defaultTextChannelName", "general");
    }
    if (chNode.name === "Voice Lounge") {
      return t("serverSettings.channels.defaultVoiceChannelName", "Voice Lounge");
    }
    return chNode.name;
  };

  const renderChannelNode = (ch) => {
    const isChMuted = localStorage.getItem(`channel_notif_mode_${ch.id}`) === "nothing";

    if (ch.type === "text") {
      return (
        <ChannelButton
          key={ch.id}
          active={textChannelId === ch.id}
          onClick={() => selectTextChannel(ch.id)}
          onContextMenu={(e) => handleChannelContextMenu(e, ch)}
          isMuted={isChMuted}
          icon={<IconTag size="lg" />}
          label={getLocalizedChannelName(ch)}
          unreadCount={getChannelUnreadCount?.(server.roomCode, ch.id)}
        />
      );
    }
    if (ch.type === "voice") {
      const usersInChannel = voiceMembersDisplay.filter((m) => m.channelId === ch.id);
      const voiceStartTime = voiceStartTimesRef?.current?.[ch.id];
      const canConnectVoice = checkPermission(server, profile?.id, "connect_voice");

      return (
        <div key={ch.id}>
          <ChannelButton
            active={selectedVoiceChannelId === ch.id}
            disabled={!canConnectVoice}
            title={!canConnectVoice ? t("voice.noConnectPermission", "Sin permisos para conectar a voz en este servidor") : undefined}
            className={!canConnectVoice ? "opacity-50 !cursor-not-allowed" : ""}
            onClick={() => {
              if (!canConnectVoice) return;
              if (selectedVoiceChannelId !== ch.id) {
                selectVoiceChannel(ch.id);
              }
            }}
            onContextMenu={(e) => handleChannelContextMenu(e, ch)}
            isMuted={isChMuted}
            icon={
              !canConnectVoice ? (
                <MaterialIcon name="lock" size={16} className="text-onicord-muted opacity-70 shrink-0" />
              ) : (
                <IconVolumeUp size="lg" />
              )
            }
            label={getLocalizedChannelName(ch)}
            rightContent={<VoiceChannelTimer startTime={voiceStartTime} />}
          />
          {usersInChannel.length > 0 && (
            <ul className="my-1 pl-6 pr-2 space-y-0.5">
              {usersInChannel.map((m) => (
                <VoiceUserItem
                  key={`${m.id || "self"}-${m.peerId || "local"}`}
                  userId={m.id}
                  peerId={m.peerId}
                  nickname={m.nickname}
                  avatar={m.avatar}
                  muted={m.muted}
                  deafened={m.deafened}
                  isSelf={m.isSelf}
                  isSpeaking={m.isSpeaking}
                  isStreaming={m.isStreaming}
                  activity={m.activity}
                  connectionType={m.connectionType}
                  onContextMenu={
                    !m.isSelf && (m.peerId || m.id)
                      ? (e) =>
                          handleVoiceUserContextMenu(e, {
                            peerId: m.peerId || m.id,
                            nickname: m.nickname,
                          })
                      : undefined
                  }
                  onJoinStream={async (targetPeerId) => {
                    activeStreamUserIdRef.current = targetPeerId;
                    setActiveStreamUserId(targetPeerId);
                    setRemoteStream(null);
                    setIsStreamFloating(false);
                    const stream = voice.getRemoteStream?.(targetPeerId);
                    if (stream) setRemoteStream(stream);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      );
    }
    return null;
  };

  const hasBanner = Boolean(server?.banner);

  return (
    <div
      style={{
        width: `${leftWidth}px`,
        minWidth: `${leftWidth}px`,
        maxWidth: `${leftWidth}px`,
        gap: "calc(var(--gap) + 3px)",
      }}
      className="h-full flex-shrink-0 flex flex-col"
    >
      <aside className="w-full flex-1 flex flex-col bg-onicord-base rounded-onicord-outer-p4 border border-onicord-island overflow-hidden">
        {(() => {
          const isAdmin = checkPermission(server, profile?.id, "admin");
          const hasBanner = Boolean(server?.banner);

          /* Contenido interno común (con o sin banner) */
          const inner = hasBanner ? (
            <>
              {/* Banner redondeado con padding */}
              <div className="px-2.5 pt-2.5 pb-0">
                <div className="w-full h-[100px] rounded-xl overflow-hidden relative">
                  <SmartAnimatedImage
                    src={server.banner}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
                </div>
              </div>
              {/* Avatar grande solapando el borde inferior del banner */}
              <div className="px-5 -mt-7 relative z-10">
                <div className="w-16 h-16 rounded-full border-[4px] border-onicord-base flex items-center justify-center bg-onicord-surface relative">
                  <div
                    className="absolute inset-0 rounded-full overflow-hidden"
                    style={{ isolation: "isolate" }}
                  >
                    {server?.icon ? (
                      <SmartAnimatedImage
                        src={server.icon}
                        alt=""
                        className="w-full h-full object-cover"
                        isAvatar
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-onicord-surface text-white font-bold text-base">
                        {(server?.name || "??").slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {/* Nombre + Flama en su propia fila */}
              <div className="flex items-center justify-between px-5 pt-2 pb-3">
                <h2 className="truncate text-left text-[15px] font-semibold text-onicord-text">
                  {server?.name || t("roomView.loadingServer")}
                </h2>
                {!server?.disableFlameSystem && (
                  <FlameBadge
                    days={serverFlame?.serverStreak || 0}
                    size="sm"
                    isServer={true}
                    title={
                      serverFlame?.isAtRisk
                        ? t("roomView.flameRiskToday")
                        : `${t("flame.serverFlame")} (${t("flame.days", { count: serverFlame?.serverStreak || 0 })})`
                    }
                    className={
                      serverFlame?.isAtRisk
                        ? "animate-pulse ring-1 ring-red-500/50"
                        : ""
                    }
                  />
                )}
              </div>
            </>
          ) : (
            /* Sin banner: cabecera horizontal compacta */
            <>
              {server?.icon ? (
                <div className="h-6 w-6 rounded-full overflow-hidden shrink-0">
                  <SmartAnimatedImage
                    src={server.icon}
                    alt=""
                    className="h-full w-full object-cover"
                    isAvatar
                  />
                </div>
              ) : (
                <div className="onicord-server-icon-fallback">
                  {(server?.name || "??").slice(0, 2).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1 flex items-center justify-between gap-1.5">
                <h2 className="truncate text-left text-[15px] font-semibold text-onicord-text">
                  {server?.name || t("roomView.loadingServer")}
                </h2>
                {!server?.disableFlameSystem && (
                  <FlameBadge
                    days={serverFlame?.serverStreak || 0}
                    size="sm"
                    isServer={true}
                    title={
                      serverFlame?.isAtRisk
                        ? t("roomView.flameRiskToday")
                        : `${t("flame.serverFlame")} (${t("flame.days", { count: serverFlame?.serverStreak || 0 })})`
                    }
                    className={
                      serverFlame?.isAtRisk
                        ? "animate-pulse ring-1 ring-red-500/50"
                        : ""
                    }
                  />
                )}
              </div>
            </>
          );

          /* Wrapper: clickeable para todos */
          return (
            <button
              type="button"
              title={t("roomView.serverSettings")}
              onClick={() => setShowSettings(true)}
              className={
                hasBanner
                  ? "cursor-pointer w-full text-left"
                  : "onicord-server-header-btn cursor-pointer transition-colors"
              }
            >
              {inner}
            </button>
          );
        })()}

        <div className="flex-1 overflow-y-auto">
          {!hasAnyCategory ? (
            <>
              {textChannels.length > 0 && (
                <>
                  <p className="onicord-category">
                    {t("serverSettings.channels.textChannels")}
                  </p>
                  {textChannels.map(renderChannelNode)}
                </>
              )}
              {voiceChannels.length > 0 && (
                <>
                  <p className="onicord-category mt-4">
                    {t("serverSettings.channels.voiceChannels")}
                  </p>
                  {voiceChannels.map(renderChannelNode)}
                </>
              )}
            </>
          ) : (
            <>
              {orphanChannels.map(renderChannelNode)}
              {categories.map((cat) => {
                const isCollapsed = collapsedCategories[cat.id];
                const catChannels = server.channels.filter(
                  (c) =>
                    String(c.parentId) === String(cat.id) &&
                    hasChannelAccess(server, c, profile?.id),
                );

                return (
                  <div key={cat.id} className="mt-2">
                    <div
                      onClick={() => toggleCategory(cat.id)}
                      className="flex items-center px-2 cursor-pointer group text-onicord-muted hover:text-onicord-text transition-colors select-none"
                    >
                      <p className="onicord-category !mt-0 !mb-0 flex-1 group-hover:text-onicord-text truncate">
                        {cat.name}
                      </p>
                      {isCollapsed ? (
                        <IconDropup size="lg" />
                      ) : (
                        <IconDropdown size="lg" />
                      )}
                    </div>

                    {!isCollapsed && (
                      <div className="mt-1 space-y-[2px]">
                        {catChannels.length === 0 ? (
                          <p className="text-[10px] text-onicord-faded italic px-6 py-1">
                            {t("common.offline")}
                          </p>
                        ) : (
                          catChannels.map(renderChannelNode)
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </aside>

      <MusicIsland musicState={musicState} />

      <UserPanel
        profile={profile}
        activeGame={activeGame}
        canShareVideo={checkPermission(server, profile?.id, "share_video")}
        inVoice={Boolean(voice.inVoice && globalVoice.currentVoiceServerId)}
        muted={voice.muted}
        deafened={voice.deafened}
        voiceServerName={globalVoice.currentVoiceServer?.name || server.name}
        voiceChannelName={resolvedVoiceChannelName}
        onToggleMute={voice.toggleMute}
        onToggleDeafen={voice.toggleDeafen}
        onDisconnect={handleDisconnectVoice}
        onOpenAppSettings={onOpenAppSettings}
        onOpenServerSettings={() => setShowSettings(true)}
        localStream={localStream}
        customStatus={profile?.customStatus}
        networkTopology={voice.networkTopology}
        sfuHostId={voice.sfuHostId}
        localPeerId={voice.localPeerId}
        voiceMembers={voice.members}
        managerRef={voice.managerRef}
        micHardwareError={voice.micHardwareError}
        micErrorMessage={voice.micErrorMessage}
        onRetryMicrophone={voice.reclaimMicrophoneAccess}
        onProfileChange={onProfileChange}
        onStreamStarted={async (stream) => {
          await window.electronAPI?.setStreaming?.(true);
          setLocalStream(stream);
          const allowExpand =
            localStorage.getItem(
              "onicord_dev_allow_local_stream_expand",
            ) === "true";
          setIsStreamFloating(!allowExpand);
          voice.setIsStreaming?.(true);
          voice.setLocalVideoStream?.(stream);
        }}
        onStopStream={async () => {
          voice.setLocalVideoStream?.(null);
          await window.electronAPI?.setStreaming?.(false);
          handleStopScreenShare();
          voice.setIsStreaming?.(false);
        }}
      />
    </div>
  );
}
