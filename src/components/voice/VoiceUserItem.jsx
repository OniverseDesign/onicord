import { useTranslation } from "react-i18next";
import UserListItem from "../ui/UserListItem";
import { IconMicOff, IconDeafenOn, IconVideoCam } from "../icons/StreamIcons";

export default function VoiceUserItem({
  userId,
  peerId,
  nickname,
  avatar,
  muted,
  deafened,
  isSelf,
  isStreaming,
  isSpeaking,
  activity, 
  nameColor,
  connectionType,
  onContextMenu,
  onJoinStream,
}) {
  const { t } = useTranslation();
  const showRedBorder = muted || deafened;
  const status = showRedBorder ? "muted" : "voice";

  const rightIcons = (
    <div className="flex shrink-0 items-center gap-1.5 pl-2 z-20">
      {isStreaming && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!isSelf && onJoinStream) onJoinStream(peerId);
          }}
          className={
            isSelf
              ? "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-onicord-text cursor-default select-none"
              : "onicord-live-badge-interactive"
          }
          title={
            isSelf ? t("voice.liveStream") : t("common.understood")
          }
        >
          <IconVideoCam size="base" />
        </button>
      )}
      {muted && (
        <div className="flex items-center text-onicord-danger shrink-0">
          <IconMicOff size="base" />
        </div>
      )}
      {deafened && (
        <div className="flex items-center text-onicord-danger shrink-0">
          <IconDeafenOn size="base" />
        </div>
      )}
    </div>
  );

  return (
    <UserListItem
      nickname={nickname}
      avatar={avatar}
      status={status}
      isSpeaking={isSpeaking}
      isSelf={isSelf}
      activity={false}
      avatarSize="sm"
      showStatusDot={false} 
      rightSlot={rightIcons}
      onContextMenu={onContextMenu}
      title={isSelf ? undefined : t("settings.voiceVideo.volume")}
      nameColor={nameColor}
      showFlame={false}
    />
  );
}
