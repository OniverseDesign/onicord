import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import ChatMessageItem from "../ChatMessageItem";
import ForumPostCard from "./ForumPostCard";
import { ThreadLoadingSkeleton } from "./ChatLoadingSkeleton";
import { useAnimatedMount } from "../../../hooks/useAnimatedMount";
import {
  IconSave,
  IconCopyFile,
  IconPasteFile,
  IconReply,
  Delete,
} from "../../icons/StreamIcons";
import ChatInputArea from "./ChatInputArea";
import ContextMenu from "../../ui/ContextMenu";
import DeleteMessageModal from "../../modals/DeleteMessageModal";
import ForwardMessageModal from "../../modals/ForwardMessageModal";
import ConfirmDialogModal from "../../modals/ConfirmDialogModal";
import { formatBytes } from "./MessageMediaAttachment";

const MediaPreviewModal = lazy(() => import("../../modals/MediaPreviewModal"));
import { ONICORD_COMMANDS } from "../../../lib/commands";
import { copyTextToClipboard, readTextFromClipboard } from "../../../lib/clipboard";
import {
  getSelectionCharacterOffsets,
  setSelectionOffsets,
  renderHTMLForInput,
  applyMarkdownFormat,
} from "../../../lib/inputFormatter";
import { soundEngine } from "../../../lib/soundEngine";
import { normalizeChatMessage } from "../../../hooks/useChatMessages";
import { useChatComposer } from "../composer/useChatComposer";

export default function ThreadSidePanel({
  parentMessage,
  messages = [],
  currentUserId,
  profile,
  peers = [],
  server,
  searchQuery = "",
  onClose,
  onSendThreadReply,
  onToggleReaction,
  isForum: isForumProp,
  loading = false,
}) {
  const { t } = useTranslation();
  const {
    input,
    setInput,
    selection,
    setSelection,
    isInputFocused,
    setIsInputFocused,
    showCommandsPopup,
    setShowCommandsPopup,
    showMentionsPopup,
    setShowMentionsPopup,
    stickersTargetRect,
    setStickersTargetRect,
    emojisTargetRect,
    setEmojisTargetRect,
    tyrannyInputRef,
    isLocalTypingRef,
    handleInputSelection,
    handleSelectEmoji,
    applyFormatting,
  } = useChatComposer({ profile, peers });

  const [replyTarget, setReplyTarget] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Context menu and message action states
  const [contextMenu, setContextMenu] = useState(null);
  const [messageToDelete, setMessageToDelete] = useState(null);
  const [forwardModalMsg, setForwardModalMsg] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [editInputText, setEditInputText] = useState("");
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: "", msg: "" });
  const [previewMedia, setPreviewMedia] = useState({
    isOpen: false,
    localPath: null,
    fileName: null,
    fileSize: null,
    isImage: false,
    isVideo: false,
    initialTime: 0,
    filesList: [],
    currentIndex: 0,
  });

  const handleOpenPreview = useCallback((data) => {
    setPreviewMedia({ isOpen: true, ...data });
  }, []);

  const endRef = useRef(null);
  const fileInputRef = useRef(null);
  const stickersBtnRef = useRef(null);
  const emojisBtnRef = useRef(null);

  // Filter thread replies linked to this parentMessage
  const threadReplies = useMemo(() => {
    if (!parentMessage?.id || !Array.isArray(messages)) return [];
    const list = messages.filter((m) => {
      if (!m) return false;
      const norm = normalizeChatMessage(m);
      if (norm.isNudge) return false;
      return norm.threadParentId === parentMessage.id;
    });

    if (!searchQuery) return list;
    const query = searchQuery.toLowerCase().trim();
    return list.filter((msg) => {
      if (!msg) return false;
      const norm = normalizeChatMessage(msg);
      const textMatches = String(norm.text || "").toLowerCase().includes(query);
      const authorMatches = msg.authorName?.toLowerCase().includes(query);
      const fileMatches =
        msg.fileName?.toLowerCase().includes(query) ||
        msg.filePath?.toLowerCase().includes(query);
      return textMatches || authorMatches || fileMatches;
    });
  }, [messages, parentMessage?.id, searchQuery]);

  // Compute reactive root message from messages history so reactions update live
  const activeRootMessage = useMemo(() => {
    return messages.find((m) => m.id === parentMessage?.id) || parentMessage;
  }, [messages, parentMessage]);

  const { shouldRender: showThreadSkeleton, isAnimatingOut: isThreadSkeletonFadingOut } = useAnimatedMount(
    Boolean(loading || !activeRootMessage),
    200
  );

  const parentChannel = useMemo(() => {
    return server?.channels?.find((c) => c.id === parentMessage?.channelId);
  }, [server?.channels, parentMessage?.channelId]);

  const isForumThread = useMemo(() => {
    if (isForumProp !== undefined) return Boolean(isForumProp);
    if (parentChannel?.type === "forum") return true;
    if (activeRootMessage?.title) return true;
    if (Array.isArray(activeRootMessage?.tags) && activeRootMessage.tags.length > 0) return true;
    return false;
  }, [isForumProp, parentChannel, activeRootMessage]);

  // Compute pinned message IDs dynamically from full messages history
  const pinnedMsgIds = useMemo(() => {
    const ids = new Set();
    messages.forEach((m) => {
      if (m.text && m.text.startsWith("[PIN_ACTION]:")) {
        try {
          const payloadStr = m.text.replace("[PIN_ACTION]:", "");
          const { messageId, isPinned } = JSON.parse(payloadStr);
          if (isPinned) ids.add(messageId);
          else ids.delete(messageId);
        } catch {}
      }
    });
    return Array.from(ids);
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadReplies.length, replyTarget]);

  useEffect(() => {
    setReplyTarget(null);
  }, [parentMessage?.id]);

  const handleSend = (e) => {
    if (e) e.preventDefault();
    const text = input.trim();
    if (!text || !parentMessage) return;

    if (text.startsWith("/")) {
      const partes = text.split(" ");
      const comandoIdentificado = partes[0].toLowerCase();
      const argumentos = partes.slice(1);
      const comandoObjeto = ONICORD_COMMANDS[comandoIdentificado];
      const targetChannelId = parentMessage.channelId || "general";

      if (comandoObjeto) {
        try {
          comandoObjeto.execute(argumentos, {
            setMessages: () => {},
            injectSystemMessage: (txt) => {
              setAlertModal({
                isOpen: true,
                title: "Onicord",
                msg: txt,
              });
            },
            resetInputState: () => {
              setReplyTarget(null);
            },
            sendP2PMessage: async (payloadRendicion) => {
              if (onSendThreadReply) {
                await onSendThreadReply(parentMessage.id, payloadRendicion, null);
              } else if (window.electronAPI?.sendChatMessage) {
                await window.electronAPI.sendChatMessage(
                  server?.roomCode,
                  targetChannelId,
                  JSON.stringify({
                    body: payloadRendicion,
                    threadParentId: parentMessage.id,
                  }),
                );
              }
            },
            fullInput: text,
          });
        } catch (err) {
          console.error("Error al ejecutar comando interno en hilo:", err);
        } finally {
          setInput("");
          setReplyTarget(null);
          setShowCommandsPopup(false);
          setShowMentionsPopup(false);
          if (tyrannyInputRef.current) {
            tyrannyInputRef.current.innerText = "";
          }
        }
        return;
      } else if (window.electronAPI?.sendPluginCommand || window.electronAPI?.execPluginCommand) {
        if (window.electronAPI?.sendPluginCommand) {
          window.electronAPI.sendPluginCommand(server?.roomCode, targetChannelId, text);
        } else {
          window.electronAPI.execPluginCommand(server?.roomCode, targetChannelId, text);
        }
        setInput("");
        setReplyTarget(null);
        setShowCommandsPopup(false);
        setShowMentionsPopup(false);
        if (tyrannyInputRef.current) {
          tyrannyInputRef.current.innerText = "";
        }
        return;
      }
    }

    let replyData = null;
    if (replyTarget) {
      let cleanReplyText = replyTarget.text || "";
      if (typeof cleanReplyText === "string" && cleanReplyText.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(cleanReplyText);
          if (parsed && parsed.body !== undefined) {
            cleanReplyText = parsed.body;
          }
        } catch (e) {}
      }
      if (cleanReplyText.length > 200) {
        cleanReplyText = cleanReplyText.substring(0, 200) + "...";
      }
      const avatar = replyTarget.authorAvatar || replyTarget.avatar;
      const safeAvatar = (avatar && typeof avatar === "string" && avatar.startsWith("data:")) ? null : avatar;

      replyData = {
        id: replyTarget.id,
        authorId: replyTarget.authorId,
        text: cleanReplyText,
        authorNickname: replyTarget.authorNickname,
        authorAvatar: safeAvatar,
        isComplement: replyTarget.isComplement,
        complementName: replyTarget.complementName,
      };
    }

    onSendThreadReply(parentMessage.id, text, replyData);
    soundEngine.playCue("send");
    setInput("");
    setReplyTarget(null);
    setShowCommandsPopup(false);
    setShowMentionsPopup(false);
    if (tyrannyInputRef.current) {
      tyrannyInputRef.current.innerText = "";
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === "b") {
        e.preventDefault();
        applyFormatting("**", "**");
      } else if (key === "i") {
        e.preventDefault();
        applyFormatting("*", "*");
      } else if (key === "s" && e.shiftKey) {
        e.preventDefault();
        applyFormatting("~~", "~~");
      } else if (key === "e") {
        e.preventDefault();
        applyFormatting("`", "`");
      }
    }
  };

  const handleInputChange = (e) => {
    isLocalTypingRef.current = true;
    const text = e.currentTarget.innerText || "";
    setInput(text);
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData?.getData("text") || "";
    if (text) {
      document.execCommand("insertText", false, text);
    }
  };

  const handleSendSticker = (stickerObj) => {
    const stickerPayload = JSON.stringify({
      type: "sticker",
      stickerId: stickerObj.id,
      stickerName: stickerObj.name,
      ext: stickerObj.ext,
      fallbackBase64: stickerObj.fallbackBase64,
      threadParentId: parentMessage.id,
    });
    onSendThreadReply(parentMessage.id, stickerPayload);
    setStickersTargetRect(null);
  };

  const uploadAndSendThreadFiles = async (fileList) => {
    if (!fileList || fileList.length === 0 || !parentMessage || !server?.roomCode) return;
    const processedAttachments = [];

    for (const file of Array.from(fileList)) {
      try {
        const realPath =
          file.path ||
          (window.electronAPI?.getNativePath
            ? await window.electronAPI.getNativePath(file)
            : null);

        let meta = null;
        if (realPath && window.electronAPI?.processDroppedMeta) {
          meta = await window.electronAPI.processDroppedMeta(server.roomCode, realPath);
        } else if (file.arrayBuffer && window.electronAPI?.uploadClipboardImage) {
          const arrayBuffer = await file.arrayBuffer();
          meta = await window.electronAPI.uploadClipboardImage(server.roomCode, arrayBuffer);
        }

        if (meta && meta.id) {
          processedAttachments.push({
            id: meta.id,
            name: meta.name || file.name,
            size: meta.size ?? file.size,
          });
        }
      } catch (err) {
        console.error("Error uploading file in thread:", err);
      }
    }

    if (processedAttachments.length > 0) {
      const attachmentsPayload = processedAttachments
        .map((att) => `[FILE_ATTACHMENT]:${JSON.stringify(att)}`)
        .join("");

      if (onSendThreadReply) {
        await onSendThreadReply(parentMessage.id, attachmentsPayload);
      } else if (window.electronAPI?.sendChatMessage) {
        await window.electronAPI.sendChatMessage(
          server.roomCode,
          parentMessage.channelId || "general",
          JSON.stringify({
            body: attachmentsPayload,
            threadParentId: parentMessage.id,
          }),
        );
      }
      soundEngine.playCue("send");
    }
  };

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await uploadAndSendThreadFiles(files);
    }
    e.target.value = null;
  };

  const handleDragOver = (e) => {
    const hasFiles = Array.from(e.dataTransfer.types || []).includes("Files");
    if (!hasFiles) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      soundEngine.playCue("drop");
      await uploadAndSendThreadFiles(files);
    }
  };

  const handleMessageContextMenu = useCallback(
    (e, msg, nickname, avatar, isMyMessage) => {
      let esUnSticker = msg.text?.startsWith('{"type":"sticker"');
      if (msg.text?.startsWith('{') && msg.text?.includes('"threadParentId"')) {
        try {
          const parsed = JSON.parse(msg.text);
          if (parsed.body && parsed.body.startsWith('{"type":"sticker"')) {
            esUnSticker = true;
          }
        } catch(e) {}
      }
      const linkNode = e.target.closest("a");
      let clickedUrl = linkNode ? linkNode.href : null;

      if (!clickedUrl && msg.text && !esUnSticker) {
        const urlRegex = /(https?:\/\/[^\s]+)/;
        const match = msg.text.match(urlRegex);
        if (match) {
          clickedUrl = match[0];
        }
      }

      setContextMenu({
        type: "message",
        x: e.clientX,
        y: e.clientY,
        title: esUnSticker ? "Sticker Options" : `Message from ${nickname}`,
        data: { msg, isMyMessage, nickname, avatar, esUnSticker, clickedUrl },
      });
    },
    []
  );

  const handleTogglePinMessage = useCallback(
    (msgId) => {
      if (window.electronAPI?.sendChatMessage) {
        const isPinned = pinnedMsgIds.includes(msgId);
        window.electronAPI.sendChatMessage(
          server.roomCode,
          parentMessage.channelId || "general",
          `[PIN_ACTION]:${JSON.stringify({ messageId: msgId, isPinned: !isPinned })}`
        );
      }
    },
    [pinnedMsgIds, server, parentMessage.channelId]
  );

  const handleSaveEditMessage = useCallback(
    async (msgId, newText) => {
      if (!newText.trim() || !window.electronAPI?.sendChatMessage) return;
      try {
        let finalEditPayloadText;
        if (msgId === parentMessage.id) {
          finalEditPayloadText = newText.trim();
        } else {
          finalEditPayloadText = JSON.stringify({
            body: newText.trim(),
            threadParentId: parentMessage.id,
          });
        }

        const payload = `[EDIT_MESSAGE]:${JSON.stringify({
          messageId: msgId,
          newText: finalEditPayloadText,
        })}`;

        await window.electronAPI.sendChatMessage(
          server.roomCode,
          parentMessage.channelId || "general",
          payload
        );
        setEditingMsg(null);
        setEditInputText("");
      } catch (err) {
        console.error("Error saving message edit in thread:", err);
      }
    },
    [server, parentMessage]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!messageToDelete?.msg?.id || !server?.roomCode) return;
    try {
      await window.electronAPI?.deleteChatMessage?.(
        server.roomCode,
        parentMessage.channelId || "general",
        messageToDelete.msg.id
      );
      setMessageToDelete(null);
    } catch (err) {
      console.error("Error deleting message in thread:", err);
    }
  }, [messageToDelete, server?.roomCode, parentMessage?.channelId]);

  const handleForwardMessageConfirm = useCallback(
    async (originalMsg, targetChannelId) => {
      if (!originalMsg || !targetChannelId || !window.electronAPI?.sendChatMessage) return;
      try {
        let cleanText = originalMsg.text || "";
        let authorNickname = originalMsg.authorNickname || originalMsg.user?.nickname || "Usuario";
        let originChannelName = parentMessage?.channelName || "general";
        let originChannelId = parentMessage?.channelId || "general";
        let originalMessageId = originalMsg.id;

        if (typeof cleanText === "string" && cleanText.startsWith("[FORWARD_MESSAGE]:")) {
          try {
            const parsed = JSON.parse(cleanText.replace("[FORWARD_MESSAGE]:", ""));
            if (parsed && parsed.text !== undefined) {
              cleanText = parsed.text;
              if (parsed.authorNickname) authorNickname = parsed.authorNickname;
              if (parsed.originChannelName) originChannelName = parsed.originChannelName;
              if (parsed.originChannelId) originChannelId = parsed.originChannelId;
              if (parsed.originalMessageId) originalMessageId = parsed.originalMessageId;
            }
          } catch {}
        }

        const forwardedText = `[FORWARD_MESSAGE]:${JSON.stringify({
          authorNickname,
          originChannelName,
          originChannelId,
          originalMessageId,
          text: cleanText,
        })}`;
        await window.electronAPI.sendChatMessage(server.roomCode, targetChannelId, forwardedText);
      } catch (err) {
        console.error("Error forwarding message in thread:", err);
      }
    },
    [server, parentMessage]
  );

  const handleJumpToMessage = useCallback(
    (targetChannelId, targetMsgId) => {
      if (!targetMsgId) return;

      const performScroll = () => {
        const el = document.getElementById(`msg-${targetMsgId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          el.classList.add("onicord-highlight-flash");
          setTimeout(() => {
            el.classList.remove("onicord-highlight-flash");
          }, 2000);
        }
      };

      performScroll();
    },
    []
  );

  const handleToggleReaction = useCallback(
    (messageId, emoji) => {
      if (onToggleReaction) {
        onToggleReaction(messageId, emoji);
        return;
      }
      const myId = profile?.id || "self";
      if (window.electronAPI?.sendChatMessage) {
        soundEngine.playCue("reaction");
        window.electronAPI.sendChatMessage(
          server.roomCode,
          parentMessage.channelId || "general",
          `[REACTION_ACTION]:${JSON.stringify({ messageId, emoji, userId: myId })}`
        );
      }
    },
    [onToggleReaction, profile?.id, server, parentMessage.channelId]
  );

  const suggestions = useMemo(() => {
    const enableSuggestions = profile?.general?.enableQuickSuggestions ?? true;
    if (!enableSuggestions || !Array.isArray(messages) || messages.length === 0) return [];
    const last100 = messages.slice(-100);
    const myMessages = last100.filter((m) => {
      if (!m) return false;
      const isMe = m.authorId === profile?.id || m.authorId === "self";
      if (!isMe) return false;
      if (!m.text) return false;
      const text = m.text.trim();
      if (text.length === 0 || text.length > 100) return false;
      
      // Filter out control patterns
      if (text.startsWith("{") || text.includes('"type":"sticker"')) return false;
      if (text.includes("[MUSIC_ACTION]") || text.startsWith("[MUSIC_ACTION]")) return false;
      if (text.includes("[NUDGE_MESSAGE]") || text.startsWith("[NUDGE_MESSAGE]")) return false;
      if (text.includes("[REACTION_ACTION]") || text.startsWith("[REACTION_ACTION]")) return false;
      if (text.includes("[TTS_MESSAGE]") || text.startsWith("[TTS_MESSAGE]")) return false;
      if (text.includes("[PIN_ACTION]") || text.startsWith("[PIN_ACTION]")) return false;
      if (text.includes("[EDIT_MESSAGE]") || text.startsWith("[EDIT_MESSAGE]")) return false;
      if (text.includes("[FORWARD_MESSAGE]") || text.startsWith("[FORWARD_MESSAGE]")) return false;
      if (text.includes("[PLUGIN_ACTION]") || text.startsWith("[PLUGIN_ACTION]")) return false;
      if (text.includes("[PLUGIN_EMBED]") || text.startsWith("[PLUGIN_EMBED]")) return false;
      if (text.includes("[FILE_ATTACHMENT]") || text.startsWith("[FILE_ATTACHMENT]")) return false;
      
      return true;
    }).map((m) => m.text.trim());

    const freqMap = {};
    const lastIndexMap = {};
    myMessages.forEach((text, index) => {
      freqMap[text] = (freqMap[text] || 0) + 1;
      lastIndexMap[text] = index;
    });

    const uniqueTexts = Object.keys(freqMap);
    uniqueTexts.sort((a, b) => {
      if (freqMap[b] !== freqMap[a]) return freqMap[b] - freqMap[a];
      return lastIndexMap[b] - lastIndexMap[a];
    });

    return uniqueTexts.slice(0, 6);
  }, [messages, profile?.general?.enableQuickSuggestions, profile?.id]);

  const visibleSuggestions = useMemo(() => {
    if (!isInputFocused) return [];
    if (!input) return suggestions;
    const trimmedInput = input.trim().toLowerCase();
    return suggestions.filter((text) => {
      const trimmedText = text.trim().toLowerCase();
      if (trimmedText === trimmedInput) return false;
      return text.toLowerCase().includes(input.toLowerCase());
    });
  }, [suggestions, isInputFocused, input]);

  const getNameColor = useCallback(
    (authorId) => {
      if (!server || !server.roles || !server.userRoles) return null;
      const uRoles = server.userRoles[authorId];
      if (!uRoles) return null;
      const roleIds = Array.isArray(uRoles) ? uRoles : [uRoles];
      const activeRoles = roleIds
        .map((id) => server.roles.find((r) => r.id === id))
        .filter(Boolean)
        .sort(
          (a, b) =>
            server.roles.findIndex((r) => r.id === a.id) -
            server.roles.findIndex((r) => r.id === b.id)
        );
      return activeRoles.length > 0 ? activeRoles[0].color : null;
    },
    [server]
  );

  if (!parentMessage) return null;

  return (
    <aside
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="w-full h-full flex flex-col overflow-hidden bg-onicord-base select-none relative"
    >
      {/* Drag overlay matching main ChatPanel */}
      {isDragging && (
        <div className="absolute inset-0 bg-onicord-accent/10 border-2 border-dashed border-onicord-accent m-2 rounded-onicord-outer-p4 flex flex-col items-center justify-center text-onicord-text pointer-events-none z-40 backdrop-blur-sm animate-fade-in">
          <div className="bg-onicord-surface p-3 rounded-full shadow-xl border border-white/5 mb-2">
            <svg
              className="w-6 h-6 text-onicord-accent animate-bounce"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <p className="text-sm font-bold">{t("chat.dropFileHere", "Suelta el archivo aquí")}</p>
          <p className="text-[11px] text-onicord-muted mt-0.5">
            {t("chat.sendInThread", "Para enviar en el hilo")}
          </p>
        </div>
      )}

      {/* Thread Header Bar */}
      <div className="h-14 px-4 shrink-0 flex items-center justify-between border-b border-onicord-accent/20 bg-onicord-base select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <MaterialIcon name="forum" size={20} className="text-onicord-accent shrink-0" />
          <div className="flex flex-col min-w-0">
            <h3 className="text-sm font-bold text-onicord-text truncate leading-snug">
              {activeRootMessage?.title || t("chat.thread", "Hilo de conversación")}
            </h3>
            <span className="text-[11px] text-onicord-muted truncate">
              {threadReplies.length === 1
                ? t("chat.singleReplyCount", "1 respuesta")
                : t("chat.pluralReplyCount", {
                    count: threadReplies.length,
                    defaultValue: `${threadReplies.length} respuestas`,
                  })}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 text-onicord-muted hover:text-onicord-text transition-colors cursor-pointer"
          title={t("common.close", "Cerrar")}
        >
          <MaterialIcon name="close" size={18} />
        </button>
      </div>

      {/* Message List Area */}
      <div className="flex-1 min-h-0 relative flex flex-col w-full">
        {/* Top gradient shadow overlay */}
        <div className="absolute top-0 left-0 right-0 h-[24px] bg-gradient-to-b from-onicord-base via-onicord-base/70 to-transparent pointer-events-none z-20" />

        <div className="w-full h-full overflow-y-auto minimal-scrollbar py-4 space-y-2 select-text relative">
          {showThreadSkeleton && (
            <div
              className={`w-full ${
                isThreadSkeletonFadingOut
                  ? "absolute inset-0 z-10 pointer-events-none transition-opacity duration-200 opacity-0 bg-onicord-base"
                  : "min-h-full"
              }`}
            >
              <ThreadLoadingSkeleton isForum={isForumThread} isFadingOut={isThreadSkeletonFadingOut} />
            </div>
          )}

          {(!loading && activeRootMessage) && (
            <div className="animate-fade-in space-y-2">
              {/* Root Message Section Header */}
              <div>
                {!isForumThread && (
                  <div className="text-[10px] uppercase tracking-wider font-bold text-onicord-accent mb-2 px-4 flex items-center gap-1">
                    <MaterialIcon name="push_pin" size={12} />
                    {t("chat.threadRootMessage", "Mensaje Principal")}
                  </div>
                )}
                {isForumThread ? (
                  <div className="px-3">
                    <ForumPostCard
                      msg={activeRootMessage}
                      allMessages={messages}
                      profile={profile}
                      peers={peers}
                      server={server}
                      nameColor={getNameColor(activeRootMessage.authorId)}
                      onOpenDeleteModal={(e, m, nick, av) => {
                        setMessageToDelete({ msg: m, nickname: nick, avatar: av });
                      }}
                      onContextMenu={handleMessageContextMenu}
                      onToggleReaction={handleToggleReaction}
                      onForwardClick={(m) => setForwardModalMsg(m)}
                      onOpenPreview={handleOpenPreview}
                      onOpenThread={() => {
                        tyrannyInputRef.current?.focus();
                      }}
                      isInThread={true}
                    />
                  </div>
                ) : (
                  <>
                    {activeRootMessage?.title && (
                      <h2 className="text-base font-bold text-onicord-text px-4 mb-2 tracking-tight">
                        {activeRootMessage.title}
                      </h2>
                    )}
                    <ChatMessageItem
                      msg={activeRootMessage}
                      profile={profile}
                      peers={peers}
                      server={server}
                      nameColor={getNameColor(activeRootMessage.authorId)}
                      disableThreadAction={true}
                      onContextMenu={handleMessageContextMenu}
                      onToggleReaction={handleToggleReaction}
                      onJumpToMessage={handleJumpToMessage}
                      onOpenPreview={handleOpenPreview}
                      onReplyClick={(target) => {
                        setReplyTarget(target);
                        tyrannyInputRef.current?.focus();
                      }}
                    />
                  </>
                )}
              </div>

              {/* Thread Replies Divider */}
              <div className="relative flex items-center justify-center my-4 select-none">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-onicord-accent/20" />
                </div>
                <span className="relative bg-onicord-base px-3 text-[11px] font-semibold text-onicord-accent/50 uppercase tracking-wider">
                  {threadReplies.length === 0
                    ? t("chat.noRepliesYet", "Aún no hay respuestas en este hilo.")
                    : t("chat.repliesSeparator", { count: threadReplies.length, defaultValue: `${threadReplies.length} respuestas` })}
                </span>
              </div>

              {/* Thread Replies List */}
              {threadReplies.map((replyMsg, idx) => (
                <ChatMessageItem
                  key={replyMsg.id || idx}
                  msg={replyMsg}
                  index={idx}
                  messages={threadReplies}
                  profile={profile}
                  peers={peers}
                  server={server}
                  nameColor={getNameColor(replyMsg.authorId)}
                  disableThreadAction={true}
                  onContextMenu={handleMessageContextMenu}
                  onToggleReaction={handleToggleReaction}
                  onJumpToMessage={handleJumpToMessage}
                  onOpenPreview={handleOpenPreview}
                  onReplyClick={(target) => {
                    setReplyTarget(target);
                    tyrannyInputRef.current?.focus();
                  }}
                />
              ))}

              <div ref={endRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Bottom gradient shadow overlay */}
        <div className="absolute bottom-0 left-0 right-0 h-[24px] bg-gradient-to-t from-onicord-base via-onicord-base/70 to-transparent pointer-events-none z-20" />
      </div>

      <ChatInputArea
        channelName={parentMessage.authorName || "thread"}
        placeholderOverride={t("chat.replyInThreadPlaceholder", "Responder en el hilo...")}
        hasSendMessages={true}
        input={input}
        setInput={setInput}
        pendingFile={null}
        setPendingFile={() => {}}
        previewUrl={null}
        setPreviewUrl={() => {}}
        replyTarget={replyTarget}
        setReplyTarget={setReplyTarget}
        typingUsers={{}}
        visibleSuggestions={visibleSuggestions}
        selection={selection}
        isInputFocused={isInputFocused}
        setIsInputFocused={setIsInputFocused}
        applyFormatting={applyFormatting}
        showCommandsPopup={showCommandsPopup}
        setShowCommandsPopup={setShowCommandsPopup}
        showMentionsPopup={showMentionsPopup}
        setShowMentionsPopup={setShowMentionsPopup}
        emojisTargetRect={emojisTargetRect}
        setEmojisTargetRect={setEmojisTargetRect}
        stickersTargetRect={stickersTargetRect}
        setStickersTargetRect={setStickersTargetRect}
        profile={profile}
        peers={peers}
        server={server}
        tyrannyInputRef={tyrannyInputRef}
        fileInputRef={fileInputRef}
        emojiButtonRef={emojisBtnRef}
        stickerButtonRef={stickersBtnRef}
        handleSend={handleSend}
        handleInputChange={handleInputChange}
        handleKeyDown={handleKeyDown}
        handlePaste={handlePaste}
        handleInputSelection={handleInputSelection}
        handleFileInputChange={handleFileChange}
        handleAttachFileClick={() => fileInputRef.current?.click()}
        handleSelectEmoji={handleSelectEmoji}
        onSelectSticker={handleSendSticker}
      />

      {/* ContextMenu popover in Thread panel */}
      {contextMenu &&
        (() => {
          let menuItems = [];
          if (contextMenu.type === "message") {
            const { msg, isMyMessage, nickname, avatar, esUnSticker, clickedUrl } = contextMenu.data;

            if (esUnSticker) {
              try {
                let parsedStk = JSON.parse(msg.text);
                if (parsedStk && typeof parsedStk === "object" && parsedStk.body) {
                  if (typeof parsedStk.body === "string") {
                    try { parsedStk = JSON.parse(parsedStk.body); } catch (_) {}
                  } else if (typeof parsedStk.body === "object") {
                    parsedStk = parsedStk.body;
                  }
                }
                menuItems.push({
                  label: "Save Sticker",
                  icon: <IconSave size="base" />,
                  onClick: async () => {
                    const yaExiste = await window.electronAPI.getStickerPath(parsedStk.stickerId);
                    if (yaExiste) {
                      setAlertModal({
                        isOpen: true,
                        title: "Sticker ya guardado",
                        msg: `El sticker "${parsedStk.stickerName || parsedStk.stickerId}" ya se encuentra en tu colección.`,
                      });
                      return;
                    }

                    if (parsedStk.fallbackBase64) {
                      await window.electronAPI.saveStickerLocal({
                        id: parsedStk.stickerId,
                        ext: parsedStk.ext,
                        base64Data: parsedStk.fallbackBase64,
                      });
                      setAlertModal({
                        isOpen: true,
                        title: "Sticker Guardado",
                        msg: `Sticker "${parsedStk.stickerName || parsedStk.stickerId}" guardado en tu colección.`,
                      });
                    } else {
                      setAlertModal({
                        isOpen: true,
                        title: "Sticker P2P",
                        msg: `El sticker "${parsedStk.stickerName || parsedStk.stickerId}" se sincroniza automáticamente vía P2P.`,
                      });
                    }
                  },
                });
                menuItems.push("SEPARATOR");
              } catch (e) {
                console.error("Error parsing sticker data in context menu:", e);
              }
            }

            if (clickedUrl && !esUnSticker) {
              menuItems.push({
                label: "Copiar enlace",
                icon: <IconCopyFile size="base" />,
                onClick: async () => {
                  await copyTextToClipboard(clickedUrl);
                },
              });
              menuItems.push("SEPARATOR");
            }

            menuItems.push({
              label: t("chat.reply", "Responder"),
              icon: <IconReply size="lg" />,
              onClick: () => {
                setReplyTarget({
                  id: msg.id,
                  authorId: msg.authorId,
                  authorNickname:
                    msg.authorNickname ||
                    msg.user?.nickname ||
                    msg.author ||
                    nickname,
                  authorAvatar:
                    msg.authorAvatar ||
                    msg.user?.avatar,
                  text: msg.text,
                  isComplement: msg.isComplement,
                  complementName: msg.complementName,
                });
                tyrannyInputRef.current?.focus();
              },
            });

            menuItems.push({
              label: t("chat.forwardMessage", "Reenviar mensaje"),
              icon: <MaterialIcon name="shortcut" size={16} />,
              onClick: () => {
                setForwardModalMsg(msg);
              },
            });

            const isPinned = pinnedMsgIds.includes(msg.id);
            menuItems.push({
              label: isPinned ? t("chat.unpinMessage", "Desfijar mensaje") : t("chat.pinMessage", "Fijar mensaje"),
              icon: <MaterialIcon name="push_pin" size={16} />,
              onClick: () => {
                handleTogglePinMessage(msg.id);
              },
            });

            menuItems.push("SEPARATOR");

            if (!esUnSticker) {
              menuItems.push({
                label: "Copiar texto",
                icon: <IconCopyFile size="base" />,
                onClick: async () => {
                  const selectionText = window.getSelection()?.toString();
                  if (selectionText && selectionText.trim().length > 0) {
                    await copyTextToClipboard(selectionText);
                  } else if (msg.text) {
                    await copyTextToClipboard(msg.text);
                  }
                },
              });
            }

            if (isMyMessage) {
              if (!esUnSticker) {
                menuItems.push({
                  label: t("chat.editMessage", "Editar mensaje"),
                  icon: <MaterialIcon name="edit" size={16} />,
                  onClick: () => {
                    setEditingMsg(msg);
                    let textParaEditar = msg.text || "";
                    if (typeof textParaEditar === "string" && textParaEditar.trim().startsWith("{")) {
                      try {
                        const parsed = JSON.parse(textParaEditar);
                        if (parsed.body !== undefined) {
                          textParaEditar = parsed.body;
                        }
                      } catch {}
                    }
                    setEditInputText(textParaEditar);
                  },
                });
              }

              menuItems.push({
                label: t("chat.deleteMessage"),
                icon: <Delete size="lg" />,
                variant: "danger",
                onClick: () => {
                  setMessageToDelete({ msg, nickname, avatar });
                },
              });
            }
          }

          if (contextMenu.type === "input") {
            menuItems.push({
              label: t("contextMenu.pasteText", "Pegar texto"),
              icon: <IconPasteFile size="base" />,
              onClick: async () => {
                const text = await readTextFromClipboard();
                if (text) setInput((prev) => prev + text);
                tyrannyInputRef.current?.focus();
              },
            });
          }

          return (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              title={contextMenu.title}
              items={menuItems}
              onClose={() => setContextMenu(null)}
            />
          );
        })()}

      {/* Modals for Message Actions */}
      {messageToDelete && (
        <DeleteMessageModal
          message={messageToDelete.msg}
          authorName={messageToDelete.nickname}
          authorAvatar={messageToDelete.avatar}
          onClose={() => setMessageToDelete(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {forwardModalMsg && (
        <ForwardMessageModal
          message={forwardModalMsg}
          server={server}
          currentChannelId={parentMessage.channelId || "general"}
          onForward={handleForwardMessageConfirm}
          onClose={() => setForwardModalMsg(null)}
        />
      )}

      {editingMsg && (
        <div
          className="onicord-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setEditingMsg(null)}
        >
          <div
            className="onicord-modal-card w-full max-w-md space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="onicord-modal-title flex items-center gap-2">
              <MaterialIcon name="edit" size={18} className="text-onicord-accent" />
              <span>{t("chat.editMessageTitle", "Editar Mensaje")}</span>
            </h3>
            <textarea
              value={editInputText}
              onChange={(e) => setEditInputText(e.target.value)}
              placeholder={t("chat.editMessagePlaceholder", "Escribe tu mensaje...")}
              className="w-full bg-onicord-base border border-onicord-island rounded-lg p-3 text-sm text-onicord-text focus:outline-none focus:border-onicord-accent min-h-[100px] resize-none"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingMsg(null)}
                className="onicord-btn-secondary px-4 py-2 text-sm"
              >
                {t("common.cancel", "Cancelar")}
              </button>
              <button
                type="button"
                onClick={() => handleSaveEditMessage(editingMsg.id, editInputText)}
                className="onicord-btn-primary px-5 py-2 text-sm"
              >
                {t("common.save", "Guardar")}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialogModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.msg}
        confirmLabel="Entendido"
        type="alert"
        onConfirm={() => setAlertModal({ isOpen: false, title: "", msg: "" })}
      />

      {previewMedia.isOpen && (
        <Suspense fallback={null}>
          <MediaPreviewModal
            isOpen={previewMedia.isOpen}
            onClose={() => setPreviewMedia({ ...previewMedia, isOpen: false })}
            localPath={previewMedia.localPath}
            fileName={previewMedia.fileName}
            fileSize={previewMedia.fileSize}
            isImage={previewMedia.isImage}
            isVideo={previewMedia.isVideo}
            initialTime={previewMedia.initialTime}
            formatBytes={formatBytes}
            filesList={previewMedia.filesList || []}
            currentIndex={previewMedia.currentIndex || 0}
            onNavigate={(newIdx) => {
              setPreviewMedia((prev) => {
                const nextItem = prev.filesList?.[newIdx];
                return {
                  ...prev,
                  currentIndex: newIdx,
                  localPath: nextItem?.localPath || prev.localPath,
                  fileName: nextItem?.name || prev.fileName,
                  fileSize: nextItem?.size || prev.fileSize,
                };
              });
            }}
          />
        </Suspense>
      )}
    </aside>
  );
}
