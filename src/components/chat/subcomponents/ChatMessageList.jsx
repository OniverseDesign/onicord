import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import ChatMessageItem from "../ChatMessageItem";
import ForumPostCard from "./ForumPostCard";
import ChatLoadingSkeleton, { TopHistoryLoadingSkeleton } from "./ChatLoadingSkeleton";
import { buildPeerLookup } from "../../../lib/profileUtils";
import { useAnimatedMount } from "../../../hooks/useAnimatedMount";

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

export default function ChatMessageList({
  mainStreamMessages = [],
  messages = [],
  loading = false,
  isForum = false,
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
  showScrollBottom = false,
  onScrollToBottom,
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
  onSelectTag,
  searchQuery,
}) {
  const { t } = useTranslation();
  const { shouldRender: showSkeleton, isAnimatingOut: isSkeletonFadingOut } = useAnimatedMount(loading, 200);

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

  const peersLookup = useMemo(() => buildPeerLookup(peers), [peers]);

  // Precompute thread replies count map in a single pass O(M) across messages
  // to avoid O(N * M) JSON parse loops inside each card
  const threadRepliesCountMap = useMemo(() => {
    const map = new Map();
    if (!Array.isArray(messages) || messages.length === 0) return map;

    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (!m) continue;

      let parentId = m.threadParentId || null;
      if (!parentId && typeof m.text === "string" && m.text.includes('"threadParentId"')) {
        try {
          const parsed = JSON.parse(m.text);
          parentId = parsed?.threadParentId || null;
          if (!parentId && typeof parsed?.body === "string" && parsed.body.includes('"threadParentId"')) {
            const inner = JSON.parse(parsed.body);
            parentId = inner?.threadParentId || null;
          }
        } catch {}
      }

      if (parentId) {
        map.set(parentId, (map.get(parentId) || 0) + 1);
      }
    }
    return map;
  }, [messages]);

  return (
    <div className="flex-1 min-h-0 relative flex w-full overflow-hidden">
      <div className="flex-1 min-h-0 relative flex flex-col w-full">
        {/* Gradient shadow overlays */}
        <div className="absolute top-0 left-0 right-0 h-[30px] bg-gradient-to-b from-onicord-base via-onicord-base/70 to-transparent pointer-events-none z-20" />

        <div
          key={channelId || "default-channel"}
          ref={chatContainerRef}
          onScroll={handleChatScroll}
          className="w-full h-full overflow-y-auto minimal-scrollbar onicord-animate-view-in relative"
        >
          {showSkeleton && (
            <div
              className={`w-full ${
                isSkeletonFadingOut
                  ? "absolute inset-0 z-10 pointer-events-none transition-opacity duration-200 opacity-0 bg-onicord-base"
                  : "min-h-full"
              }`}
            >
              <ChatLoadingSkeleton isForum={isForum} isFadingOut={isSkeletonFadingOut} />
            </div>
          )}

          {(!loading || isSkeletonFadingOut) && (
            messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-8 py-16 text-center select-none animate-fade-in">
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
                ) : isForum ? (
                  <>
                    <div className="onicord-channel-welcome-icon">
                      <MaterialIcon name="forum" size="3xl" className="text-onicord-accent" />
                    </div>
                    <h3 className="text-2xl font-bold text-onicord-text">
                      {t("chat.forumWelcomeTitle", {
                        defaultValue: `¡Te damos la bienvenida al foro #${channelName || "foro"}!`,
                        name: channelName || "foro",
                      })}
                    </h3>
                    <p className="mt-2 max-w-md text-sm text-onicord-muted">
                      {t("chat.forumWelcomeDesc", "Crea la primera publicación o debate usando el compositor inferior.")}
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
              <ul className={`${isForum ? "py-6 px-2 sm:px-4 md:px-6 max-w-6xl mx-auto w-full" : "py-4"} animate-fade-in`}>
                {/* Top skeleton when scrolling up */}
                {isScrollingUpLoading && <TopHistoryLoadingSkeleton />}

              {mainStreamMessages.map((msg, idx) => {
                const prevMsg = idx > 0 ? mainStreamMessages[idx - 1] : null;
                const showDivider =
                  !isForum && (!prevMsg || !isSameDay(msg.timestamp, prevMsg.timestamp));

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

                    {isForum ? (
                      <ForumPostCard
                        msg={msg}
                        allMessages={messages}
                        threadRepliesCount={threadRepliesCountMap.get(msg.id) || 0}
                        peersLookup={peersLookup}
                        profile={profile}
                        peers={peers}
                        server={server}
                        nameColor={userRoleColorMap.get(msg.authorId) || null}
                        fileProgress={fileProgress}
                        onDownloadFile={onDownloadFile}
                        onCancelDownload={onCancelDownload}
                        onOpenDeleteModal={onOpenDeleteModal}
                        onContextMenu={onContextMenu}
                        onOpenPreview={onOpenPreview}
                        onToggleReaction={onToggleReaction}
                        onForwardClick={onForwardClick}
                        onOpenThread={onOpenThread}
                        onSelectTag={onSelectTag}
                        searchQuery={searchQuery}
                      />
                    ) : (
                      <ChatMessageItem
                        msg={msg}
                        index={idx}
                        messages={mainStreamMessages}
                        allMessages={messages}
                        threadRepliesCount={threadRepliesCountMap.get(msg.id) || 0}
                        peersLookup={peersLookup}
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
                    )}
                  </li>
                );
              })}
            </ul>
          ))}
          <div ref={bottomRef} className="h-4" />
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-[30px] bg-gradient-to-t from-onicord-base via-onicord-base/70 to-transparent pointer-events-none z-20" />

        <button
          type="button"
          onClick={() => onScrollToBottom?.("smooth")}
          tabIndex={showScrollBottom ? 0 : -1}
          className={`absolute bottom-4 right-6 z-30 inline-flex items-center gap-2 pl-3 pr-2.5 py-1 rounded-full bg-onicord-accent/10 hover:bg-onicord-accent/20 border border-onicord-accent/30 text-onicord-accent text-xs font-bold transition-all duration-300 ease-out cursor-pointer select-none shadow-xs ${
            showScrollBottom
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 translate-y-2 pointer-events-none"
          }`}
          title={isForum ? t("chat.jumpToTop", "Volver arriba") : t("chat.jumpToPresent", "Volver abajo")}
          aria-label={isForum ? t("chat.jumpToTop", "Volver arriba") : t("chat.jumpToPresent", "Volver abajo")}
        >
          <MaterialIcon
            name={isForum ? "arrow_upward" : "arrow_downward"}
            size={16}
            className="text-onicord-accent shrink-0"
          />
          <span>{isForum ? t("chat.jumpToTop", "Volver arriba") : t("chat.jumpToPresent", "Volver abajo")}</span>
        </button>
      </div>
    </div>
  );
}
