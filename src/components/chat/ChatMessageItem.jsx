import { memo, useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { resolveAuthorDisplay, buildPeerLookup } from "../../lib/profileUtils";
import EmojiPickerPopover from "../ui/EmojiPickerPopover";
import MaterialIcon from "../icons/MaterialIcon";
import IconEstrella from "../icons/Estrella.svg?react";

import MessageAvatar from "./subcomponents/MessageAvatar";
import MessageHeader, { formatTime } from "./subcomponents/MessageHeader";
import MessageThreadBadge from "./subcomponents/MessageThreadBadge";
import MessageReactionsBar from "./subcomponents/MessageReactionsBar";
import MessageActionsHoverBar from "./subcomponents/MessageActionsHoverBar";
import MessageEmbedCard from "./subcomponents/MessageEmbedCard";
import MessageMediaAttachment from "./subcomponents/MessageMediaAttachment";
import MessageStickerContent from "./subcomponents/MessageStickerContent";
import MessagePluginEmbed from "./subcomponents/MessagePluginEmbed";
import MessageTextContent, { parseMessageText } from "./subcomponents/MessageTextContent";

const ChatMessageItem = memo(
  ({
    msg,
    index = 0,
    messages = [],
    allMessages = null,
    showDivider = false,
    isReplyPreview = false,
    disableThreadAction = false,
    profile,
    peers = [],
    server,
    nameColor,
    fileProgress = {},
    onDownloadFile = () => {},
    onCancelDownload = () => {},
    onOpenDeleteModal = () => {},
    onContextMenu = () => {},
    onReplyClick = () => {},
    onShowAlert = () => {},
    onOpenPreview = () => {},
    onToggleReaction = () => {},
    onForwardClick = () => {},
    onOpenThread = () => {},
    onJumpToMessage = () => {},
    onPluginAction = () => {},
    searchQuery = "",
  }) => {
    const { t } = useTranslation();
    const [pickerTargetRect, setPickerTargetRect] = useState(null);

    if (!msg || (msg.text && typeof msg.text === "string" && msg.text.includes("[MUSIC_ACTION]:"))) {
      return null;
    }

    const prevMsg = Array.isArray(messages) && index > 0 ? messages[index - 1] : null;

    const peersLookup = useMemo(() => buildPeerLookup(peers), [peers]);

    let { nickname, avatar } = resolveAuthorDisplay(
      msg.authorId,
      profile,
      peersLookup,
      msg,
    );

    if (msg.authorId === "onicord-bot") {
      nickname = "Onicord";
      avatar = "bot-star";
    }

    if (msg.isComplement) {
      nickname = msg.complementName || msg.user?.nickname || "Complemento";
      avatar = msg.authorAvatar || msg.avatar || msg.user?.avatar || null;
    }
    const isMyMessage = Boolean(profile?.id && (msg.authorId === profile.id || msg.authorId === "self")) || msg.authorId === "self";

    let isSameAuthor = false;
    if (prevMsg && msg) {
      const prevIsMe = Boolean(profile?.id && (prevMsg.authorId === profile.id || prevMsg.authorId === "self")) || prevMsg.authorId === "self";
      const currentIsMe = isMyMessage;

      // 1. Nunca agrupar mensajes propios con mensajes de otros usuarios
      if (prevIsMe === currentIsMe) {
        const prevIsComp = Boolean(prevMsg.isComplement || prevMsg.authorId === "onicord-bot");
        const currentIsComp = Boolean(msg.isComplement || msg.authorId === "onicord-bot");

        // 2. Nunca agrupar complementos/bots con mensajes de usuario regular
        if (prevIsComp === currentIsComp) {
          if (prevIsComp) {
            const prevCompName = prevMsg.complementName || prevMsg.authorNickname || "Complemento";
            const currentCompName = msg.complementName || msg.authorNickname || "Complemento";
            isSameAuthor = prevCompName === currentCompName;
          } else {
            const prevId = prevMsg.authorId || prevMsg.userId || prevMsg.user?.id;
            const currentId = msg.authorId || msg.userId || msg.user?.id;

            const bothHaveIds = Boolean(prevId && currentId && prevId !== "self" && currentId !== "self");
            const sameId = bothHaveIds && prevId === currentId;

            const prevDisplay = resolveAuthorDisplay(prevMsg.authorId, profile, peersLookup, prevMsg);
            const prevNick = prevDisplay.nickname;
            const currentNick = nickname;
            const sameNick = Boolean(prevNick && currentNick && prevNick === currentNick);

            if (sameId || sameNick || (prevIsMe && currentIsMe)) {
              isSameAuthor = true;
            }
          }
        }
      }
    }

    const isRecent =
      prevMsg && msg.timestamp - prevMsg.timestamp < 5 * 60 * 1000;

    let textContent = msg.text;
    let fileData = null;
    let replyToData = msg.replyTo || null;
    let isForwarded = false;
    let originChannelName = null;
    let originChannelId = null;
    let originalMessageId = null;

    if (
      msg.text &&
      typeof msg.text === "string" &&
      msg.text.trim().startsWith("{")
    ) {
      try {
        const parsedReplyObj = JSON.parse(msg.text);
        if (
          parsedReplyObj &&
          typeof parsedReplyObj === "object" &&
          parsedReplyObj.body !== undefined
        ) {
          textContent = parsedReplyObj.body;
          replyToData = parsedReplyObj.replyTo || replyToData;
          if (parsedReplyObj.threadParentId) {
            msg.threadParentId = parsedReplyObj.threadParentId;
          }
        }
      } catch (e) {}
    }

    if (textContent && typeof textContent === "string" && textContent.startsWith("[FORWARD_MESSAGE]:")) {
      try {
        const forwardPayload = JSON.parse(textContent.replace("[FORWARD_MESSAGE]:", ""));
        if (forwardPayload && forwardPayload.text !== undefined) {
          isForwarded = true;
          originChannelName = forwardPayload.originChannelName || "canal";
          originChannelId = forwardPayload.originChannelId || null;
          originalMessageId = forwardPayload.originalMessageId || null;
          textContent = forwardPayload.text;
        }
      } catch (err) {
        console.error("Error parsing FORWARD_MESSAGE payload:", err);
      }
    }

    const isGrouped = Boolean(isSameAuthor && isRecent && !showDivider && !replyToData && !isForwarded && !isReplyPreview);

    if (typeof textContent === "string" && (textContent.includes("[NUDGE_MESSAGE]") || textContent.startsWith("[NUDGE_MESSAGE]"))) {
      return null;
    }

    const isStickerPayload = (() => {
      if (typeof textContent !== "string") return false;
      const trimmed = textContent.trim();
      if (trimmed.startsWith('{"type":"sticker"')) return true;
      try {
        const obj = JSON.parse(trimmed);
        if (obj?.type === "sticker") return true;
        if (typeof obj?.body === "string" && obj.body.trim().startsWith('{"type":"sticker"')) return true;
      } catch (_) {}
      return false;
    })();

    const isFilePayload = typeof textContent === "string" && textContent.includes("[FILE_ATTACHMENT]:");
    const isTTSPayload = typeof textContent === "string" && textContent.startsWith("[TTS_MESSAGE]:");
    const isPluginEmbedPayload = typeof textContent === "string" && textContent.startsWith("[PLUGIN_EMBED]:");

    let ttsCleanText = textContent;
    if (isTTSPayload) {
      textContent = textContent.replace("[TTS_MESSAGE]:", "");
      ttsCleanText = textContent;
    }

    useEffect(() => {
      if (isTTSPayload && ttsCleanText) {
        try {
          const ahora = Date.now();
          const edadDelMensaje = ahora - msg.timestamp;

          if (edadDelMensaje > 4000) {
            console.log(
              `[Onicord TTS] Ignoring historical audio message: ID ${msg.id}`,
            );
            return;
          }

          window.speechSynthesis.cancel();

          const fraseUnificada = `${nickname} dice: ${ttsCleanText}`;
          const utterance = new SpeechSynthesisUtterance(fraseUnificada);

          utterance.rate = 1.2;
          utterance.pitch = 1.2;
          utterance.lang = "es-AR";

          window.speechSynthesis.speak(utterance);
        } catch (audioErr) {
          console.error("Webkit SpeechSynthesis engine error:", audioErr);
        }
      }
    }, [msg.id, isTTSPayload, ttsCleanText, nickname, msg.timestamp]);

    const fullChannelMessages = allMessages || messages;

    const checkIsThreadReply = useCallback((m) => {
      if (!m || !msg?.id || m.id === msg.id) return false;
      if (m.threadParentId === msg.id) return true;
      if (typeof m.text === "string" && m.text.includes(msg.id)) {
        if (m.text.includes(`"threadParentId":"${msg.id}"`) || m.text.includes(`"threadParentId": "${msg.id}"`)) {
          return true;
        }
        try {
          const parsed = JSON.parse(m.text);
          if (parsed?.threadParentId === msg.id) return true;
          if (typeof parsed?.body === "string" && parsed.body.includes(msg.id)) {
            const inner = JSON.parse(parsed.body);
            if (inner?.threadParentId === msg.id) return true;
          }
        } catch (_) {}
      }
      return false;
    }, [msg?.id]);

    const threadRepliesCount = useMemo(() => {
      if (!fullChannelMessages || !Array.isArray(fullChannelMessages) || isReplyPreview || disableThreadAction || !msg?.id) return 0;
      return fullChannelMessages.filter(checkIsThreadReply).length;
    }, [fullChannelMessages, checkIsThreadReply, isReplyPreview, disableThreadAction, msg?.id]);

    const threadParticipants = useMemo(() => {
      if (!fullChannelMessages || !Array.isArray(fullChannelMessages) || isReplyPreview || disableThreadAction || !msg?.id) return [];
      const replies = fullChannelMessages.filter(checkIsThreadReply);

      const userMap = new Map();
      replies.forEach((r) => {
        if (!userMap.has(r.authorId)) {
          userMap.set(r.authorId, resolveAuthorDisplay(r.authorId, profile, peersLookup, r));
        }
      });

      return Array.from(userMap.values());
    }, [fullChannelMessages, checkIsThreadReply, isReplyPreview, disableThreadAction, profile, peersLookup, msg?.id]);

    if (isFilePayload && textContent) {
      try {
        const parts = textContent.split("[FILE_ATTACHMENT]:");
        textContent = parts[0] ? parts[0].trim() : "";
        fileData = JSON.parse(parts[1]);
      } catch (e) {
        console.error("Error al desempaquetar mensaje unificado:", e);
      }
    }

    let linkUrlOverride = msg.linkUrl || null;
    if (textContent && textContent.includes("[LINK]:")) {
      const parts = textContent.split("[LINK]:");
      textContent = parts[0] ? parts[0].trim() : "";
      linkUrlOverride = parts[1] ? parts[1].trim() : linkUrlOverride;
    }

    const isOgEnabled = profile?.general?.enableOpenGraph ?? true;
    const urlRegex = /(https?:\/\/[^\s\)]+)/;
    const hasLink =
      Boolean(linkUrlOverride || (textContent && urlRegex.test(textContent))) &&
      isOgEnabled &&
      !isStickerPayload &&
      !isPluginEmbedPayload &&
      !msg.hidePreview &&
      !msg.suppressEmbeds;
    const detectedUrl = linkUrlOverride || (hasLink ? textContent.match(urlRegex)?.[0] : null);

    const handleJumpToMessage = (targetId) => {
      if (!targetId) return;
      const el = document.getElementById(`msg-${targetId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add(
          "bg-onicord-accent/10",
          "rounded-xl",
          "transition-all",
          "duration-300",
        );
        setTimeout(() => {
          el.classList.remove("bg-onicord-accent/10", "rounded-xl");
        }, 2000);
      } else {
        onShowAlert?.(
          t("chat.messageNotFoundTitle"),
          t("chat.originalMessageNotFound"),
        );
      }
    };

    const targetOriginalMsg = replyToData
      ? fullChannelMessages?.find((m) => m.id === replyToData.id)
      : null;

    const fallbackForReply = {
      ...replyToData,
      ...(targetOriginalMsg
        ? {
            authorNickname:
              targetOriginalMsg.authorNickname ||
              targetOriginalMsg.complementName ||
              targetOriginalMsg.user?.nickname,
            authorAvatar:
              targetOriginalMsg.authorAvatar ||
              targetOriginalMsg.avatar ||
              targetOriginalMsg.user?.avatar,
            isComplement: targetOriginalMsg.isComplement,
            complementName: targetOriginalMsg.complementName,
          }
        : {}),
    };

    const usuarioCitado = replyToData
      ? resolveAuthorDisplay(
          replyToData.authorId,
          profile,
          peersLookup,
          fallbackForReply,
        )
      : { nickname: "Usuario", avatar: null };

    const isMentioned = (() => {
      if (!textContent) return false;
      const textLower = textContent.toLowerCase();

      const myNick = (profile?.nickname || "").toLowerCase();
      if (myNick && textLower.includes(`@${myNick}`)) return true;

      const myUserIds = [profile?.id, profile?.userId, profile?._id].filter(Boolean);
      let myRoleIds = [];
      const userRolesObj = server?.userRoles || {};

      for (const uid of myUserIds) {
        const r = userRolesObj[uid];
        if (r) {
          if (Array.isArray(r)) {
            myRoleIds.push(...r);
          } else {
            myRoleIds.push(r);
          }
        }
      }

      const serverRoles = server?.roles || [];
      const myRoleNames = serverRoles
        .filter((role) => myRoleIds.some((id) => String(id) === String(role.id)))
        .map((role) => role.name?.toLowerCase())
        .filter(Boolean);

      return myRoleNames.some((rName) => rName && textLower.includes(`@${rName}`));
    })();

    return (
      <div
        id={`msg-${msg.id}`}
        className="flex flex-col w-full relative group/row transition-all duration-300"
      >
        {replyToData && (
          <div
            onClick={() => handleJumpToMessage(replyToData.id)}
            className="flex items-center gap-2 ml-[110px] -mb-1 mt-1 pt-1 text-xs select-none opacity-85 hover:opacity-100 cursor-pointer transition-all animate-fade-in group/reply"
            title={t("chat.jumpToOriginal")}
          >
            <div className="w-8 h-3.5 border-l-2 border-t-2 border-onicord-accent rounded-tl-[6px] mt-3 shrink-0 ml-[-28px] mr-0.5 opacity-25 group-hover/reply:opacity-80 transition-opacity" />
            <div className="h-4 w-4 rounded-full bg-onicord-accent overflow-hidden shrink-0 flex items-center justify-center text-[9px] font-bold text-white">
              {usuarioCitado.avatar === "bot-star" ||
              (usuarioCitado.isComplement && !usuarioCitado.avatar) ? (
                <IconEstrella className="w-2.5 h-2.5 text-white" />
              ) : usuarioCitado.avatar ? (
                <img
                  src={usuarioCitado.avatar}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>
                  {(usuarioCitado.nickname || "?").charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <span className="onicord-mention">
              @{usuarioCitado.nickname}
            </span>
            <div className="text-onicord-muted/60 group-hover/reply:text-onicord-text truncate max-w-[550px] text-[13px] flex items-center gap-1 transition-colors">
              {replyToData.text?.includes("[FILE_ATTACHMENT]:") ? (
                <span className="italic flex items-center gap-1 text-[13px] opacity-80">
                  Archivo adjunto
                </span>
              ) : (
                <span className="truncate block">
                  {parseMessageText(
                    replyToData.text,
                    peers,
                    profile,
                    searchQuery,
                    true,
                    server?.roles || [],
                  )}
                </span>
              )}
            </div>
          </div>
        )}

        {isForwarded && !replyToData && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (originChannelId && originalMessageId) {
                onJumpToMessage?.(originChannelId, originalMessageId);
              }
            }}
            className={`flex items-center gap-2 ml-[110px] -mb-1 mt-1 pt-1 text-xs select-none opacity-85 hover:opacity-100 transition-all animate-fade-in group/forward ${
              originChannelId && originalMessageId ? "cursor-pointer" : ""
            }`}
            title={
              originChannelId && originalMessageId
                ? t("chat.jumpToOriginal", "Ir al mensaje original")
                : undefined
            }
          >
            <div className="w-8 h-3.5 border-l-2 border-t-2 border-onicord-accent rounded-tl-[6px] mt-3 shrink-0 ml-[-28px] mr-0.5 opacity-25 group-hover/forward:opacity-80 transition-opacity" />
            <span className="text-onicord-muted/70 group-hover/forward:text-onicord-muted text-[13px] font-medium">
              {t("chat.forwardedFromChannel", "Reenviado desde")}
            </span>
            <span className="onicord-mention flex items-center gap-0.5 text-[13px] font-semibold">
              <MaterialIcon name="tag" size={12} className="opacity-80" />
              {originChannelName}
            </span>
          </div>
        )}

        <div
          className={`onicord-message-row group relative transition-all duration-300 ${
            isGrouped ? "py-0.5" : "py-1 mt-2"
          } ${
            isMentioned
              ? "bg-onicord-accent/10 pl-3 pr-2 py-2 my-1"
              : ""
          }`}
          onContextMenu={(e) =>
            onContextMenu(e, msg, nickname, avatar, isMyMessage)
          }
        >
          {isGrouped ? (
            <div className="w-11 shrink-0 flex items-center justify-end select-none text-[10px] text-onicord-muted opacity-0 group-hover:opacity-60 font-medium pr-1">
              {formatTime(msg.timestamp)}
            </div>
          ) : (
            <MessageAvatar
              src={avatar}
              name={nickname}
              nameColor={nameColor}
              timestamp={msg.timestamp}
              isComplement={msg.isComplement}
            />
          )}

          <div className="min-w-0 flex-1 mt-0.5">
            {!isGrouped && (
              <MessageHeader
                nickname={nickname}
                nameColor={nameColor}
                isComplement={msg.isComplement}
                timestamp={msg.timestamp}
                edited={msg.edited}
                isForwarded={msg.isForwarded}
              />
            )}

            {isPluginEmbedPayload ? (
              <MessagePluginEmbed
                rawText={textContent}
                msgId={msg.id}
                profile={profile}
                peers={peers}
                onPluginAction={onPluginAction}
              />
            ) : isStickerPayload ? (
              <MessageStickerContent
                rawText={textContent}
                timestamp={msg.timestamp}
              />
            ) : (
              <MessageTextContent
                textContent={textContent}
                peers={peers}
                profile={profile}
                searchQuery={searchQuery}
                roles={server?.roles || []}
              />
            )}

            {hasLink && detectedUrl && <MessageEmbedCard url={detectedUrl} />}

            {isFilePayload && fileData && (
              <MessageMediaAttachment
                fileData={fileData}
                msg={msg}
                isMyMessage={isMyMessage}
                server={server}
                fileProgress={fileProgress}
                onDownloadFile={onDownloadFile}
                onCancelDownload={onCancelDownload}
                onOpenPreview={onOpenPreview}
                onShowAlert={onShowAlert}
              />
            )}

            <MessageThreadBadge
              threadRepliesCount={threadRepliesCount}
              threadParticipants={threadParticipants}
              isReplyPreview={isReplyPreview}
              disableThreadAction={disableThreadAction}
              onOpenThread={() => onOpenThread?.(msg)}
            />

            <MessageReactionsBar
              reactions={msg.reactions}
              msgId={msg.id}
              profile={profile}
              peers={peers}
              onToggleReaction={onToggleReaction}
              pickerTargetRect={pickerTargetRect}
              setPickerTargetRect={setPickerTargetRect}
            />
          </div>

          <MessageActionsHoverBar
            isReplyPreview={isReplyPreview}
            isMyMessage={isMyMessage}
            disableThreadAction={disableThreadAction}
            pickerTargetRect={pickerTargetRect}
            setPickerTargetRect={setPickerTargetRect}
            msg={msg}
            nickname={nickname}
            avatar={avatar}
            textContent={textContent}
            fileData={fileData}
            isStickerPayload={isStickerPayload}
            onReplyClick={onReplyClick}
            onForwardClick={onForwardClick}
            onOpenThread={onOpenThread}
            onOpenDeleteModal={onOpenDeleteModal}
          />
        </div>

        {pickerTargetRect && (
          <EmojiPickerPopover
            targetRect={pickerTargetRect}
            align="right-side"
            onSelectEmoji={(emoji) => onToggleReaction?.(msg.id, emoji)}
            onClose={() => setPickerTargetRect(null)}
          />
        )}
      </div>
    );
  },
);

ChatMessageItem.displayName = "ChatMessageItem";
export default ChatMessageItem;
