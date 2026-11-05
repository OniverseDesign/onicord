import React, { memo, useMemo, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import { Delete } from "../../icons/StreamIcons";
import MessageAvatar from "./MessageAvatar";
import MessageTextContent from "./MessageTextContent";
import MessageMediaAttachment from "./MessageMediaAttachment";
import MessageMediaGallery, { isImageFile } from "./MessageMediaGallery";
import EmojiPickerPopover from "../../ui/EmojiPickerPopover";
import { resolveAuthorDisplay, buildPeerLookup } from "../../../lib/profileUtils";
import { formatTime, formatFriendlyDate } from "./MessageHeader";

const ForumPostCard = memo(
  ({
    msg,
    allMessages = [],
    threadRepliesCount: passedThreadRepliesCount,
    peersLookup: passedPeersLookup,
    profile,
    peers = [],
    server,
    nameColor,
    fileProgress = {},
    onDownloadFile = () => {},
    onCancelDownload = () => {},
    onOpenDeleteModal = () => {},
    onContextMenu = () => {},
    onOpenPreview = () => {},
    onToggleReaction = () => {},
    onForwardClick = () => {},
    onOpenThread = () => {},
    onSelectTag = () => {},
    searchQuery = "",
    isInThread = false,
  }) => {
    const { t, i18n } = useTranslation();
    const [pickerTargetRect, setPickerTargetRect] = useState(null);

    if (!msg) return null;

    const peersLookup = useMemo(
      () => passedPeersLookup || buildPeerLookup(peers),
      [passedPeersLookup, peers]
    );
    const { nickname, avatar } = resolveAuthorDisplay(
      msg.authorId,
      profile,
      peersLookup,
      msg,
      server,
    );

    // Calculate thread replies count (fast lookup if precomputed)
    const checkIsThreadReply = useCallback(
      (m) => {
        if (!m) return false;
        if (m.threadParentId === msg.id) return true;
        if (typeof m.text === "string" && m.text.includes('"threadParentId"')) {
          if (
            m.text.includes(`"threadParentId":"${msg.id}"`) ||
            m.text.includes(`"threadParentId": "${msg.id}"`)
          ) {
            return true;
          }
          try {
            const parsed = JSON.parse(m.text);
            if (parsed?.threadParentId === msg.id) return true;
            if (typeof parsed?.body === "string" && parsed.body.includes('"threadParentId"')) {
              const inner = JSON.parse(parsed.body);
              if (inner?.threadParentId === msg.id) return true;
            }
          } catch {}
        }
        return false;
      },
      [msg.id],
    );

    const threadRepliesCount = useMemo(() => {
      if (passedThreadRepliesCount !== undefined) return passedThreadRepliesCount;
      if (!Array.isArray(allMessages)) return 0;
      return allMessages.filter(checkIsThreadReply).length;
    }, [passedThreadRepliesCount, allMessages, checkIsThreadReply]);

    // Parse title, body snippet, and attachments from msg
    const { displayTitle, bodySnippet, fileData, allAttachments } = useMemo(() => {
      let rawText = msg.text || "";
      let explicitTitle = msg.title || null;
      let rawBody = rawText;

      // Extract from JSON payload if message is structured
      if (typeof rawText === "string" && rawText.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(rawText);
          if (parsed.title) explicitTitle = parsed.title;
          if (parsed.body !== undefined) rawBody = parsed.body;
        } catch {}
      }

      // Extract file attachments
      let cleanTextSnippet = rawBody;
      const attachments = [];
      if (typeof rawBody === "string" && rawBody.includes("[FILE_ATTACHMENT]:")) {
        const parts = rawBody.split("[FILE_ATTACHMENT]:");
        cleanTextSnippet = parts[0] ? parts[0].trim() : "";
        for (let i = 1; i < parts.length; i++) {
          try {
            const parsedF = JSON.parse(parts[i]);
            if (parsedF) attachments.push(parsedF);
          } catch {}
        }
      }

      let title = explicitTitle ? String(explicitTitle).trim() : null;
      let snippet = cleanTextSnippet;

      if (!title) {
        const raw = String(cleanTextSnippet || "").trim();
        if (raw) {
          const lines = raw.split("\n");
          const firstLine = lines[0].replace(/^[#\s]+/, "").trim();
          if (firstLine.length > 0 && firstLine.length <= 120) {
            title = firstLine;
            snippet = lines.slice(1).join("\n").trim();
          } else {
            title = firstLine.slice(0, 120);
            snippet = raw;
          }
        }
      }

      return {
        displayTitle: title,
        bodySnippet: snippet,
        fileData: attachments[0] || null,
        allAttachments: attachments,
      };
    }, [msg.title, msg.text]);

    const imageAttachments = useMemo(() => {
      return allAttachments.filter((att) => isImageFile(att.name));
    }, [allAttachments]);

    const otherAttachments = useMemo(() => {
      return allAttachments.filter((att) => !isImageFile(att.name));
    }, [allAttachments]);

    // Extract hashtags from post
    const postTags = useMemo(() => {
      const set = new Set();
      if (Array.isArray(msg.tags)) {
        msg.tags.forEach((t) => {
          const clean = String(t).replace(/^#/, "").trim();
          if (clean) set.add(clean);
        });
      }
      const textToScan = `${msg.title || ""} ${msg.text || ""} ${msg.rawText || ""}`;
      const matches = textToScan.matchAll(/#([a-zA-Z0-9_\u00C0-\u017F]+)/g);
      for (const m of matches) {
        const clean = m[1].trim();
        if (clean) set.add(clean);
      }
      return Array.from(set);
    }, [msg.tags, msg.title, msg.text, msg.rawText]);

    const isMyMessage =
      Boolean(profile?.id && (msg.authorId === profile.id || msg.authorId === "self")) ||
      msg.authorId === "self";

    const hasReactions = Boolean(
      msg.reactions &&
      Object.keys(msg.reactions).some(
        (emoji) => Array.isArray(msg.reactions[emoji]) && msg.reactions[emoji].length > 0
      )
    );

    return (
      <article
        onClick={isInThread ? undefined : () => onOpenThread(msg)}
        onContextMenu={(e) => onContextMenu(e, msg, nickname, avatar, isMyMessage)}
        className={`group relative bg-onicord-surface border border-white/5 rounded-2xl p-4 sm:p-5 transition-all duration-150 mb-3.5 text-left w-full shadow-xs ${
          isInThread ? "cursor-default" : "hover:bg-onicord-surface/75 hover:border-white/10 cursor-pointer"
        }`}
      >
        {/* Top Header: Author + Timestamp + Actions */}
        <div className="flex items-center gap-3 mb-2.5">
          <MessageAvatar
            src={avatar}
            avatar={avatar}
            name={nickname}
            nickname={nickname}
            nameColor={nameColor}
            timestamp={msg.timestamp}
            isComplement={msg.isComplement}
          />

          <div className="flex flex-col min-w-0 flex-1 leading-tight">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span
                className="cursor-default text-[15px] font-semibold text-onicord-text hover:underline"
                style={{ color: nameColor || undefined }}
              >
                {nickname}
              </span>

              {msg.isComplement && (
                <span className="text-[10px] bg-onicord-accent/20 text-onicord-accent px-1.5 py-0.5 rounded font-bold uppercase">
                  APP
                </span>
              )}

              <span className="text-[12px] text-onicord-muted opacity-60 font-medium ml-1">
                {formatFriendlyDate(msg.timestamp, t, i18n?.language || "es")}
              </span>
            </div>
          </div>

          {/* Top-Right Hover Toolbar (Exact style of normal message toolbar buttons) */}
          {isMyMessage && (
            <div
              className="onicord-message-toolbar top-3.5 right-3.5 border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDeleteModal(e, msg, nickname, avatar);
                }}
                className="onicord-message-toolbar-btn onicord-message-toolbar-btn-danger"
                title={t("chat.deleteMessage", "Eliminar mensaje")}
              >
                <Delete size="base" />
              </button>
            </div>
          )}
        </div>

        {/* Post Title */}
        {displayTitle && (
          <h2 className="text-base sm:text-lg font-bold text-onicord-text group-hover:text-onicord-accent transition-colors line-clamp-2 mb-2 tracking-tight">
            {displayTitle}
          </h2>
        )}

        {/* Post Body Snippet (line-clamp-3 in feed, full in thread) */}
        {bodySnippet && (
          <div
            className={`text-[14px] text-onicord-text/80 leading-relaxed mb-3 break-words select-text ${
              isInThread ? "" : "line-clamp-3"
            }`}
          >
            <MessageTextContent
              textContent={bodySnippet}
              text={bodySnippet}
              profile={profile}
              peers={peers}
              searchQuery={searchQuery}
              roles={server?.roles}
            />
          </div>
        )}

        {/* Media Gallery Preview (Mosaic 1, 2, 3, 4, 5+ images) */}
        {imageAttachments.length > 0 && (
          <div className="mb-3 max-w-2xl">
            <MessageMediaGallery
              images={imageAttachments}
              msg={msg}
              isMyMessage={isMyMessage}
              fileProgress={fileProgress}
              onDownloadFile={onDownloadFile}
              onOpenPreview={onOpenPreview}
            />
          </div>
        )}

        {/* Other Attachments (zip, pdf, exe, etc.) */}
        {otherAttachments.length > 0 && (
          <div className="flex flex-col gap-2.5 mb-3 max-w-xl">
            {otherAttachments.map((att, idx) => (
              <MessageMediaAttachment
                key={att.id || idx}
                fileData={att}
                msg={msg}
                isMyMessage={isMyMessage}
                server={server}
                fileProgress={fileProgress}
                onDownloadFile={onDownloadFile}
                onCancelDownload={onCancelDownload}
                onOpenPreview={onOpenPreview}
              />
            ))}
          </div>
        )}

        {/* Tags Row */}
        {postTags.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-1.5 my-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            {postTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onSelectTag(tag)}
                className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-onicord-base/70 border border-white/5 text-onicord-muted hover:text-onicord-accent hover:border-onicord-accent/40 transition-all cursor-pointer flex items-center gap-0.5"
              >
                <span className="text-onicord-accent/70">#</span>
                <span>{tag}</span>
              </button>
            ))}
          </div>
        )}

        {/* Reactions Badges Row (Placed below content & tags, ABOVE action buttons) */}
        {hasReactions && (
          <div
            className="flex flex-wrap items-center gap-1.5 my-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            {Object.entries(msg.reactions).map(([emoji, users]) => {
              if (!users || !Array.isArray(users) || users.length === 0) return null;
              const myId = profile?.id || "self";
              const hasMyReaction =
                users.includes(myId) ||
                users.includes("self") ||
                (profile?.id && users.includes(profile.id));
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleReaction?.(msg.id, emoji);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all duration-150 cursor-pointer active:scale-95 ${
                    hasMyReaction
                      ? "bg-onicord-accent/20 text-onicord-accent border-onicord-accent/40 shadow-2xs"
                      : "bg-onicord-base/60 text-onicord-muted border-white/5 hover:bg-white/10 hover:text-white"
                  }`}
                  title={`${emoji} (${users.length})`}
                >
                  <span className="text-sm leading-none">{emoji}</span>
                  <span className="text-[11px] font-mono leading-none">{users.length}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Action Buttons Row: Reaccionar, Responder, Reenviar */}
        <div
          className="flex flex-wrap items-center gap-2 mt-2 pt-2.5 border-t border-white/5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 1. React button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (pickerTargetRect) {
                setPickerTargetRect(null);
              } else {
                setPickerTargetRect(e.currentTarget.getBoundingClientRect());
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-onicord-base/60 hover:bg-white/10 border border-white/5 hover:border-white/10 text-xs font-semibold text-onicord-muted hover:text-white transition-all cursor-pointer active:scale-95"
            title={t("chat.addReaction", "Reaccionar")}
          >
            <MaterialIcon name="add_reaction" size={16} />
            <span>{t("chat.addReaction", "Reaccionar")}</span>
          </button>

          {/* 2. Reply button (omitted when rendered inside thread side panel) */}
          {!isInThread && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenThread(msg);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer active:scale-95 ${
                threadRepliesCount > 0
                  ? "bg-onicord-accent/15 text-onicord-accent border-onicord-accent/30 hover:bg-onicord-accent/25"
                  : "bg-onicord-base/60 hover:bg-white/10 border-white/5 hover:border-white/10 text-onicord-muted hover:text-white"
              }`}
              title={t("chat.replyInThread", "Responder en hilo")}
            >
              <MaterialIcon name="chat_bubble_outline" size={15} />
              <span>
                {threadRepliesCount > 0
                  ? `${threadRepliesCount} ${
                      threadRepliesCount === 1
                        ? t("chat.replySingular", "comentario")
                        : t("chat.replyPlural", "comentarios")
                    }`
                  : t("chat.reply", "Responder")}
              </span>
            </button>
          )}

          {/* 3. Forward button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onForwardClick?.(msg);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-onicord-base/60 hover:bg-white/10 border border-white/5 hover:border-white/10 text-xs font-semibold text-onicord-muted hover:text-white transition-all cursor-pointer active:scale-95"
            title={t("chat.forwardMessage", "Reenviar")}
          >
            <MaterialIcon name="shortcut" size={15} />
            <span>{t("chat.forwardMessage", "Reenviar")}</span>
          </button>
        </div>

        {/* Emoji reaction popover */}
        {pickerTargetRect && (
          <EmojiPickerPopover
            targetRect={pickerTargetRect}
            onSelectEmoji={(emoji) => {
              onToggleReaction(msg.id, emoji);
              setPickerTargetRect(null);
            }}
            onClose={() => setPickerTargetRect(null)}
          />
        )}
      </article>
    );
  },
);

ForumPostCard.displayName = "ForumPostCard";
export default ForumPostCard;
