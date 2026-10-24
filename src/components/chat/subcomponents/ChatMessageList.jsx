import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import ChatMessageItem from "../ChatMessageItem";

export function isSameDay(ts1, ts2) {
  if (!ts1 || !ts2) return false;
  const d1 = new Date(ts1);
  const d2 = new Date(ts2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

export function formatDateDivider(ts) {
  return new Date(ts).toLocaleDateString("es", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function RenderChatSkeleton() {
  return (
    <div className="w-full h-auto min-h-full p-4 flex flex-col gap-6 select-none animate-pulse">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => (
        <div key={i} className="flex items-start gap-4 w-full">
          <div className="h-10 w-10 rounded-full bg-white/10 shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="flex items-center gap-3">
              <div className="h-3.5 w-24 bg-white/10 rounded-md" />
              <div className="h-2.5 w-14 bg-white/5 rounded-md" />
            </div>
            <div className="h-3 w-[85%] bg-white/10 rounded-md" />
            {i % 2 === 0 && (
              <div className="h-3 w-[50%] bg-white/5 rounded-md" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ChatMessageList({
  mainStreamMessages = [],
  messages = [],
  loading = false,
  channelId,
  channelName,
  roomCode,
  profile,
  peers,
  server,
  fileProgress,
  chatContainerRef,
  bottomRef,
  handleChatScroll,
  isScrollingUpLoading,
  onDownloadFile,
  onCancelDownload,
  onOpenDeleteModal,
  onContextMenu,
  onShowAlert,
  onOpenPreview,
  onToggleReaction,
  onForwardClick,
  onOpenThread,
  onJumpToMessage,
  onPluginAction,
  onReplyClick,
  searchQuery,
}) {
  const { t } = useTranslation();

  const userRoleColorMap = useMemo(() => {
    if (!server?.roles || !server?.userRoles) return new Map();
    const roleOrderMap = new Map(server.roles.map((r, i) => [r.id, { role: r, order: i }]));
    const colorMap = new Map();
    for (const [userId, uRoles] of Object.entries(server.userRoles)) {
      const roleIds = Array.isArray(uRoles) ? uRoles : [uRoles];
      const matched = roleIds
        .map((id) => roleOrderMap.get(id))
        .filter(Boolean)
        .sort((a, b) => a.order - b.order);
      if (matched.length > 0 && matched[0].role?.color) {
        colorMap.set(userId, matched[0].role.color);
      }
    }
    return colorMap;
  }, [server?.roles, server?.userRoles]);

  return (
    <div className="flex-1 min-h-0 relative flex w-full overflow-hidden">
      <div className="flex-1 min-h-0 relative flex flex-col w-full">
        {/* Gradient shadow overlays */}
        <div className="absolute top-0 left-0 right-0 h-[30px] bg-gradient-to-b from-onicord-base via-onicord-base/70 to-transparent pointer-events-none z-20" />

        <div
          key={channelId || "default-channel"}
          ref={chatContainerRef}
          onScroll={handleChatScroll}
          className="w-full h-full overflow-y-auto minimal-scrollbar onicord-animate-view-in"
        >
          {loading ? (
            <RenderChatSkeleton />
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-8 py-16 text-center select-none">
              {channelId?.startsWith("dm_") ? (
                <>
                  <div className="onicord-channel-welcome-icon">
                    <MaterialIcon name="person" size="3xl" className="text-onicord-text" />
                  </div>
                  <h3 className="text-2xl font-bold text-onicord-text">
                    {t("chat.dmWelcomeTitle", { name: channelName })}
                  </h3>
                  <p className="mt-2 max-w-md text-sm text-onicord-muted">
                    {t("chat.dmWelcomeDesc", { name: channelName })}
                  </p>
                </>
              ) : (
                <>
                  <div className="onicord-channel-welcome-icon">
                    <span className="text-3xl font-semibold text-onicord-text">
                      #
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-onicord-text">
                    {t("chat.channelWelcomeTitle", { name: channelName || "general" })}
                  </h3>
                  <p className="mt-2 max-w-md text-sm text-onicord-muted">
                    {t("chat.channelWelcomeDesc")}{" "}
                    <span className="font-mono text-onicord-text">{roomCode}</span>
                  </p>
                </>
              )}
            </div>
          ) : (
            <ul className="py-4">
              {/* SKELETON SUPERIOR AL HACER SCROLL UP */}
              {isScrollingUpLoading && (
                <div className="w-full px-4 py-2 flex flex-col gap-4 opacity-50 animate-pulse select-none">
                  <div className="flex items-start gap-4 w-full">
                    <div className="h-10 w-10 rounded-full bg-white/10 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-24 bg-white/10 rounded-md" />
                      <div className="h-3 w-[70%] bg-white/5 rounded-md" />
                    </div>
                  </div>
                </div>
              )}

              {mainStreamMessages.map((msg, idx) => {
                const prevMsg = idx > 0 ? mainStreamMessages[idx - 1] : null;
                const showDivider =
                  !prevMsg || !isSameDay(msg.timestamp, prevMsg.timestamp);

                return (
                  <li key={msg.id || idx}>
                    {showDivider && (
                      <div className="relative flex items-center justify-center my-4 select-none">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-onicord-accent/20" />
                        </div>
                        <span className="relative bg-onicord-base px-3 text-[11px] font-semibold text-onicord-accent/50 uppercase tracking-wider">
                          {formatDateDivider(msg.timestamp)}
                        </span>
                      </div>
                    )}
                    <ChatMessageItem
                      msg={msg}
                      index={idx}
                      messages={mainStreamMessages}
                      allMessages={messages}
                      showDivider={showDivider}
                      profile={profile}
                      peers={peers}
                      server={server}
                      fileProgress={fileProgress}
                      nameColor={userRoleColorMap.get(msg.authorId) || null}
                      onDownloadFile={onDownloadFile}
                      onCancelDownload={onCancelDownload}
                      onOpenDeleteModal={onOpenDeleteModal}
                      onContextMenu={onContextMenu}
                      onShowAlert={onShowAlert}
                      onOpenPreview={onOpenPreview}
                      onToggleReaction={onToggleReaction}
                      onForwardClick={onForwardClick}
                      onOpenThread={onOpenThread}
                      onJumpToMessage={onJumpToMessage}
                      onPluginAction={onPluginAction}
                      onReplyClick={onReplyClick}
                      searchQuery={searchQuery}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          <div ref={bottomRef} className="h-4" />
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-[30px] bg-gradient-to-t from-onicord-base via-onicord-base/70 to-transparent pointer-events-none z-20" />
      </div>
    </div>
  );
}
