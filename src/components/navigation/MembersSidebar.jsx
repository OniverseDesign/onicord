import { useMemo } from "react";
import UserListItem from "../ui/UserListItem";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";

export default function MembersSidebar({
  members,
  voiceMembers,
  onVoiceUserContextMenu,
  onUserClick, 
  profile,
  roomCode,
  serverId = "",
  getChannelUnreadCount,
  onMessageUser,
  disableFlameSystem = false,
  ownerId = null,
  server = null,
}) {
  const { t } = useTranslation();
  const inVoice = voiceMembers.filter((m) => m.channelId);
  const online = members.filter(
    (m) => m.isSelf || m.online === true || m.online === undefined,
  );
  const offline = members.filter(
    (m) =>
      !(m.isSelf || m.online === true || m.online === undefined) && !m.isSelf,
  );

  const activityCounts = {};
  const seenUserIds = new Set();

  const isGameActivity = (act) =>
    Boolean(act?.name && (!act.type || act.type === "game"));

  const registerUserActivity = (m) => {
    const userId = m.id || m.userId || m.peerId;
    if (!userId || seenUserIds.has(userId)) return;
    seenUserIds.add(userId);

    if (isGameActivity(m?.activity)) {
      const name = m.activity.name.trim().toLowerCase();
      activityCounts[name] = (activityCounts[name] || 0) + 1;
    }
  };

  voiceMembers.forEach(registerUserActivity);
  members.forEach((m) => {
    if (m.isSelf || m.online === true || m.online === undefined) {
      registerUserActivity(m);
    }
  });

  const playingTogetherList = [];
  const justOnline = [];

  online.forEach((m) => {
    if (isGameActivity(m?.activity)) {
      const name = m.activity.name.trim().toLowerCase();
      if (activityCounts[name] > 1) {
        playingTogetherList.push(m);
        return;
      }
    }
    justOnline.push(m);
  });

  const groupedByRoles = useMemo(() => {
    if (!server?.groupByRoles || !server?.roles || server.roles.length === 0) {
      return null;
    }

    const groups = [];
    const remaining = [...justOnline];

    // Loop through server.roles
    server.roles.forEach((role) => {
      const usersInRole = remaining.filter((u) => u.role && String(u.role.id) === String(role.id));
      if (usersInRole.length > 0) {
        groups.push({
          role,
          members: usersInRole,
        });
        // Remove these users from remaining
        usersInRole.forEach((u) => {
          const idx = remaining.findIndex((r) => (r.id || r.peerId) === (u.id || u.peerId));
          if (idx !== -1) remaining.splice(idx, 1);
        });
      }
    });

    return {
      groups,
      remainingOnline: remaining,
    };
  }, [justOnline, server?.groupByRoles, server?.roles]);

  const renderUserList = (list, keyPrefix) => {
    return list.map((m) => (
      <UserListItem
        key={`${keyPrefix}-${m.id || m.peerId}`}
        nickname={m.nickname}
        avatar={m.avatar}
        status="online"
        isSelf={m.isSelf}
        activity={m.activity}
        customStatus={m.customStatus}
        avatarSize="md"
        showStatusDot={true}
        onContextMenu={(e) => handleContextMenu(e, m)}
        onClick={(e) => handleClick(e, m)}
        nameColor={m.role?.color}
        flame={m.flame}
        showFlame={!disableFlameSystem}
        rightSlot={renderMessageButton(m)}
        isOwner={(m.id || m.userId || m.peerId) === ownerId}
        serverId={serverId || roomCode}
      />
    ));
  };

  const handleContextMenu = (e, member) => {
    if (!onVoiceUserContextMenu || !member.peerId) return;
    e.preventDefault();
    onVoiceUserContextMenu(e, {
      peerId: member.peerId,
      nickname: member.nickname || "Usuario",
    });
  };

  const handleClick = (e, member) => {
    e.preventDefault();
    if (onUserClick) {
      onUserClick(e, member);
    }
  };

  const renderMessageButton = (member) => {
    const memberId = member.id || member.userId;
    if (member.isSelf || memberId === profile?.id) return null;
    const dmChannelId = "dm_" + [profile?.id, memberId].sort().join("_");
    const unreadCount = getChannelUnreadCount?.(roomCode, dmChannelId) || 0;

    const isAlwaysVisible = unreadCount > 0;

    return (
      <div
        className={`shrink-0 flex items-center justify-center transition-all duration-200 ease-out ${
          isAlwaysVisible
            ? "w-7 opacity-100 ml-1 scale-100 pointer-events-auto"
            : "w-0 opacity-0 ml-0 scale-75 overflow-hidden pointer-events-none group-hover:w-7 group-hover:opacity-100 group-hover:ml-1 group-hover:scale-100 group-hover:pointer-events-auto focus-within:w-7 focus-within:opacity-100 focus-within:ml-1 focus-within:scale-100 focus-within:pointer-events-auto"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMessageUser?.(member);
          }}
          title={t("sidebar.privateMessage")}
          className="h-7 w-7 min-w-[28px] flex items-center justify-center relative rounded-onicord-button hover:bg-white/10 text-onicord-text transition-colors duration-150 cursor-pointer shrink-0"
        >
          <MaterialIcon name="chat" size={16} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-onicord-danger text-white text-[9px] font-bold px-1 rounded-full min-w-[12px] h-3.5 flex items-center justify-center animate-scale-up shadow-sm">
              {unreadCount}
            </span>
          )}
        </button>
      </div>
    );
  };

  return (
    <aside className="flex-1 overflow-hidden bg-onicord-base rounded-onicord-outer-p4 border border-onicord-island flex flex-col">
      <div className="flex-1 overflow-y-auto py-3 select-none">
        {}
        {inVoice.length > 0 && (
          <section className="mb-4 px-2">
            <h3 className="onicord-sidebar-header text-onicord-accent">
              {t("sidebar.voiceChannel")} — {inVoice.length}
            </h3>
            <ul className="space-y-0.5">
              {inVoice.map((m) => (
                <UserListItem
                  key={`voice-${m.peerId}`}
                  nickname={m.nickname}
                  avatar={m.avatar}
                  status="voice"
                  isSelf={m.isSelf}
                  isSpeaking={m.isSpeaking}
                  activity={m.activity}
                  customStatus={m.customStatus} 
                  voiceChannelName={m.channelName}
                  avatarSize="md"
                  showStatusDot={true}
                  onContextMenu={(e) => handleContextMenu(e, m)}
                  onClick={(e) => handleClick(e, m)}
                  nameColor={m.role?.color}
                  flame={m.flame}
                  showFlame={false}
                  rightSlot={renderMessageButton(m)}
                  isOwner={(m.id || m.userId || m.peerId) === ownerId}
                  serverId={serverId || roomCode}
                />
              ))}
            </ul>
          </section>
        )}

        {playingTogetherList.length > 0 && (
          <section className="mb-4 px-2">
            <h3 className="onicord-sidebar-header text-onicord-accent">
              {t("sidebar.playingTogether")} — {playingTogetherList.length}
            </h3>
            <ul className="space-y-0.5">
              {playingTogetherList.map((m) => (
                <UserListItem
                  key={`together-${m.id || m.peerId}`}
                  nickname={m.nickname}
                  avatar={m.avatar}
                  status="online"
                  isSelf={m.isSelf}
                  activity={m.activity}
                  customStatus={m.customStatus} 
                  avatarSize="md"
                  showStatusDot={true}
                  onContextMenu={(e) => handleContextMenu(e, m)}
                  onClick={(e) => handleClick(e, m)}
                  nameColor={m.role?.color}
                  flame={m.flame}
                  showFlame={!disableFlameSystem}
                  rightSlot={renderMessageButton(m)}
                  isOwner={(m.id || m.userId || m.peerId) === ownerId}
                  serverId={serverId || roomCode}
                />
              ))}
            </ul>
          </section>
        )}

        {groupedByRoles ? (
          <>
            {groupedByRoles.groups.map((g) => (
              <section key={`role-group-${g.role.id}`} className="mb-4 px-2">
                <h3 className="onicord-sidebar-header font-bold" style={{ color: g.role.color }}>
                  {g.role.name} — {g.members.length}
                </h3>
                <ul className="space-y-0.5">
                  {renderUserList(g.members, `online-role-${g.role.id}`)}
                </ul>
              </section>
            ))}

            {groupedByRoles.remainingOnline.length > 0 && (
              <section className="mb-4 px-2">
                <h3 className="onicord-sidebar-header text-onicord-muted">
                  {t("sidebar.available")} — {groupedByRoles.remainingOnline.length}
                </h3>
                <ul className="space-y-0.5">
                  {renderUserList(groupedByRoles.remainingOnline, "online-norole")}
                </ul>
              </section>
            )}
          </>
        ) : (
          <section className="mb-4 px-2">
            <h3 className="onicord-sidebar-header text-onicord-muted">
              {t("sidebar.available")} — {justOnline.length}
            </h3>
            <ul className="space-y-0.5">
              {renderUserList(justOnline, "online")}
            </ul>
          </section>
        )}

        {}
        {offline.length > 0 && (
          <section className="mb-4 px-2">
            <h3 className="onicord-sidebar-header text-onicord-faded">
              {t("sidebar.offline")} — {offline.length}
            </h3>
            <ul className="space-y-0.5">
              {offline.map((m) => (
                <UserListItem
                  key={`offline-${m.id}`}
                  nickname={m.nickname}
                  avatar={m.avatar}
                  status="offline"
                  isSelf={m.isSelf}
                  customStatus={m.customStatus} 
                  avatarSize="md"
                  showStatusDot={true}
                  onContextMenu={(e) => handleContextMenu(e, m)}
                  onClick={(e) => handleClick(e, m)}
                  nameColor={m.role?.color}
                  flame={m.flame}
                  showFlame={!disableFlameSystem}
                  rightSlot={renderMessageButton(m)}
                  isOwner={(m.id || m.userId || m.peerId) === ownerId}
                  serverId={serverId || roomCode}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
