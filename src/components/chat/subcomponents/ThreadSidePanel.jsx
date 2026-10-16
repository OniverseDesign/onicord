import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import ChatMessageItem from "../ChatMessageItem";
import {
  IconSticker,
  IconAttach,
  IconSave,
  IconCopyFile,
  IconPasteFile,
  IconReply,
  Delete,
} from "../../icons/StreamIcons";
import StickerPopover from "../StickerPopover";
import EmojiPickerPopover from "../../ui/EmojiPickerPopover";
import QuickSuggestions from "../QuickSuggestions";
import MentionsPopover from "../MentionsPopover";
import CommandsPopover from "../CommandsPopover";
import FloatingFormattingBar from "../FloatingFormattingBar";
import ContextMenu from "../../ui/ContextMenu";
import DeleteMessageModal from "../../modals/DeleteMessageModal";
import ForwardMessageModal from "../../modals/ForwardMessageModal";
import ConfirmDialogModal from "../../modals/ConfirmDialogModal";
import { ONICORD_COMMANDS } from "../../../lib/commands";
import { copyTextToClipboard } from "../../../lib/clipboard";
import {
  getSelectionCharacterOffsets,
  setSelectionOffsets,
  renderHTMLForInput,
} from "../../../lib/inputFormatter";
import { soundEngine } from "../../../lib/soundEngine";

const measureTextWidth = (text, font) => {
  const canvas = measureTextWidth.canvas || (measureTextWidth.canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  context.font = font || '15px "Roboto", system-ui, -apple-system, sans-serif';
  return context.measureText(text).width;
};

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
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [stickersTargetRect, setStickersTargetRect] = useState(null);
  const [emojisTargetRect, setEmojisTargetRect] = useState(null);
  const [showCommandsPopup, setShowCommandsPopup] = useState(false);
  const [showMentionsPopup, setShowMentionsPopup] = useState(false);
  const [selection, setSelection] = useState(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Context menu and message action states
  const [contextMenu, setContextMenu] = useState(null);
  const [messageToDelete, setMessageToDelete] = useState(null);
  const [forwardModalMsg, setForwardModalMsg] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [editInputText, setEditInputText] = useState("");
  const [alertModal, setAlertModal] = useState({ isOpen: false, title: "", msg: "" });

  const endRef = useRef(null);
  const tyrannyInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const stickersBtnRef = useRef(null);
  const emojisBtnRef = useRef(null);

  // Filter thread replies linked to this parentMessage
  const threadReplies = useMemo(() => {
    const list = messages.filter((m) => {
      if (!parentMessage?.id || !m) return false;
      let checkText = m.text || "";
      if (typeof checkText === "string" && checkText.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(checkText);
          if (parsed.body) checkText = parsed.body;
        } catch {}
      }
      if (typeof checkText === "string" && (checkText.includes("[NUDGE_MESSAGE]") || checkText.startsWith("[NUDGE_MESSAGE]"))) {
        return false;
      }
      if (m.threadParentId === parentMessage.id) return true;
      if (typeof m.text === "string" && m.text.includes(parentMessage.id)) {
        if (m.text.includes(`"threadParentId":"${parentMessage.id}"`) || m.text.includes(`"threadParentId": "${parentMessage.id}"`)) {
          return true;
        }
        try {
          const parsed = JSON.parse(m.text);
          if (parsed?.threadParentId === parentMessage.id) return true;
          if (typeof parsed?.body === "string" && parsed.body.includes(parentMessage.id)) {
            const inner = JSON.parse(parsed.body);
            if (inner?.threadParentId === parentMessage.id) return true;
          }
        } catch {}
      }
      return false;
    });

    if (!searchQuery) return list;
    const query = searchQuery.toLowerCase().trim();
    return list.filter((msg) => {
      if (!msg) return false;
      let textContent = msg.text || "";
      if (typeof textContent === "string" && textContent.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(textContent);
          if (parsed.text) textContent = parsed.text;
        } catch {}
      }
      const textMatches = String(textContent).toLowerCase().includes(query);
      const authorMatches = msg.authorName?.toLowerCase().includes(query);
      const fileMatches =
        msg.fileName?.toLowerCase().includes(query) ||
        msg.filePath?.toLowerCase().includes(query);
      return textMatches || authorMatches || fileMatches;
    });
  }, [messages, parentMessage?.id, searchQuery]);

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
  }, [threadReplies.length]);

  useEffect(() => {
    if (!input) {
      setShowCommandsPopup(false);
      setShowMentionsPopup(false);
      return;
    }
    const partes = input.split(" ");
    const ultimaPalabra = partes[partes.length - 1];
    setShowCommandsPopup(partes.length === 1 && input.startsWith("/"));
    setShowMentionsPopup(ultimaPalabra.startsWith("@"));
  }, [input]);

  const handleInputSelection = () => {
    const inputEl = tyrannyInputRef.current;
    if (!inputEl) return;

    const { start, end } = getSelectionCharacterOffsets(inputEl);

    if (start !== end) {
      const styles = window.getComputedStyle(inputEl);
      const font = `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;

      const textVal = inputEl.textContent || "";
      const textBefore = textVal.substring(0, start);
      const textSelection = textVal.substring(start, end);

      const widthBefore = measureTextWidth(textBefore, font);
      const widthSelection = measureTextWidth(textSelection, font);

      const paddingLeft = parseFloat(styles.paddingLeft) || 0;
      const xPos = paddingLeft + widthBefore + (widthSelection / 2) - inputEl.scrollLeft;

      const relativeLeft = inputEl.offsetLeft + xPos;

      const chatPanelEl = document.querySelector(".onicord-chat-input-bar") || inputEl.parentElement;
      const containerWidth = chatPanelEl?.getBoundingClientRect().width || 400;
      const constrainedLeft = Math.max(130, Math.min(relativeLeft, containerWidth - 130));

      setSelection({
        start,
        end,
        left: constrainedLeft,
      });
    } else {
      setSelection(null);
    }
  };

  useEffect(() => {
    const el = tyrannyInputRef.current;
    if (!el) return;

    const allUsers = [
      { id: profile?.id, nickname: profile?.nickname || "Usuario" },
      ...Object.values(peers || {}).map((p) => ({
        id: p.id,
        nickname: p.nickname,
      })),
    ];
    const targetHTML = renderHTMLForInput(input, allUsers);

    if (el.innerHTML !== targetHTML) {
      const offsets = getSelectionCharacterOffsets(el);
      el.innerHTML = targetHTML;
      setSelectionOffsets(el, offsets.start, offsets.end);
    }
  }, [input, profile, peers]);

  const applyFormatting = (prefix, suffix) => {
    const inputEl = tyrannyInputRef.current;
    if (!inputEl) return;

    let start = 0;
    let end = 0;

    if (selection) {
      start = selection.start;
      end = selection.end;
    } else {
      const offsets = getSelectionCharacterOffsets(inputEl);
      start = offsets.start;
      end = offsets.end;
    }

    const text = input;
    const selected = text.substring(start, end);
    let replacement = "";

    if (!selected) {
      replacement = prefix + suffix;
    } else {
      if (selected.startsWith(prefix) && selected.endsWith(suffix)) {
        replacement = selected.substring(prefix.length, selected.length - suffix.length);
      } else {
        replacement = prefix + selected + suffix;
      }
    }

    const newValue = text.substring(0, start) + replacement + text.substring(end);
    setInput(newValue);
    setSelection(null);

    requestAnimationFrame(() => {
      inputEl.focus();
      const newEnd = start + replacement.length;
      setSelectionOffsets(inputEl, start, newEnd);
    });
  };

  const handleSend = (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || !parentMessage) return;
    onSendThreadReply(parentMessage.id, input.trim());
    soundEngine.playCue("send");
    setInput("");
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
    }
  };

  const handleInputChange = (e) => {
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

  const handleSelectEmoji = (emoji) => {
    const inputEl = tyrannyInputRef.current;
    if (!inputEl) return;
    inputEl.focus();
    document.execCommand("insertText", false, emoji);
    setInput(inputEl.textContent || "");
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

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (files && files.length > 0 && window.electronAPI?.sendChatFile) {
      try {
        const file = files[0];
        const fileData = {
          name: file.name,
          size: file.size,
          path: file.path,
        };
        await window.electronAPI.sendChatFile(
          server.roomCode,
          parentMessage.channelId || "general",
          fileData,
          parentMessage.id
        );
      } catch (err) {
        console.error("Error sending file in thread:", err);
      }
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
    if (files && files.length > 0 && window.electronAPI?.sendChatFile) {
      soundEngine.playCue("drop");
      try {
        const file = files[0];
        const fileData = {
          name: file.name,
          size: file.size,
          path: file.path,
        };
        await window.electronAPI.sendChatFile(
          server.roomCode,
          parentMessage.channelId || "general",
          fileData,
          parentMessage.id
        );
      } catch (err) {
        console.error("Error sending dropped file in thread:", err);
      }
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
    [profile?.id, server, parentMessage.channelId]
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
              {t("chat.thread", "Hilo de conversación")}
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

        <div className="w-full h-full overflow-y-auto minimal-scrollbar py-4 space-y-2 select-text">
          {/* Root Message Section Header */}
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-onicord-accent mb-2 px-4 flex items-center gap-1">
              <MaterialIcon name="push_pin" size={12} />
              {t("chat.threadRootMessage", "Mensaje Principal")}
            </div>
            <ChatMessageItem
              msg={parentMessage}
              profile={profile}
              peers={peers}
              server={server}
              nameColor={getNameColor(parentMessage.authorId)}
              disableThreadAction={true}
              onContextMenu={handleMessageContextMenu}
              onToggleReaction={handleToggleReaction}
              onJumpToMessage={handleJumpToMessage}
              onReplyClick={(target) => {
                setInput((prev) => prev + ` @${peers[target.authorId]?.nickname || "Usuario"} `);
                tyrannyInputRef.current?.focus();
              }}
            />
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
              onReplyClick={(target) => {
                setInput((prev) => prev + ` @${peers[target.authorId]?.nickname || "Usuario"} `);
                tyrannyInputRef.current?.focus();
              }}
            />
          ))}

          <div ref={endRef} className="h-4" />
        </div>

        {/* Bottom gradient shadow overlay */}
        <div className="absolute bottom-0 left-0 right-0 h-[24px] bg-gradient-to-t from-onicord-base via-onicord-base/70 to-transparent pointer-events-none z-20" />
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Rich Input Popovers and Formatting bar */}
      <div className="w-full relative shrink-0 px-2 pb-2 pt-0 z-30">
        <QuickSuggestions
          visibleSuggestions={visibleSuggestions}
          selection={selection}
          setInput={setInput}
          tyrannyInputRef={tyrannyInputRef}
        />

        <FloatingFormattingBar
          selection={selection}
          applyFormatting={applyFormatting}
          t={t}
        />

        <CommandsPopover
          showCommandsPopup={showCommandsPopup}
          input={input}
          setInput={setInput}
          setShowCommandsPopup={setShowCommandsPopup}
          tyrannyInputRef={tyrannyInputRef}
          serverPlugins={server?.plugins}
          t={t}
        />

        <MentionsPopover
          showMentionsPopup={showMentionsPopup}
          input={input}
          setInput={setInput}
          peers={peers}
          profile={profile}
          roles={server?.roles || []}
          setShowMentionsPopup={setShowMentionsPopup}
          tyrannyInputRef={tyrannyInputRef}
          t={t}
        />

        {emojisTargetRect && (
          <EmojiPickerPopover
            targetRect={emojisTargetRect}
            triggerRef={emojisBtnRef}
            onClose={() => setEmojisTargetRect(null)}
            onSelectEmoji={(emoji) => {
              handleSelectEmoji(emoji);
              setEmojisTargetRect(null);
            }}
          />
        )}

        {stickersTargetRect && (
          <StickerPopover
            targetRect={stickersTargetRect}
            onClose={() => setStickersTargetRect(null)}
            onSelectSticker={handleSendSticker}
          />
        )}

        {/* Input Form Wrapper */}
        <form
          onSubmit={handleSend}
          className="onicord-chat-input-bar relative"
        >
          <div className="flex items-center gap-2 px-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="onicord-chat-toolbar-btn group"
              title={t("chat.attachUnlimited")}
            >
              <IconAttach size="xl" />
            </button>

            <div className="relative flex-1 min-w-0 flex items-center h-full">
              <div
                contentEditable={true}
                ref={tyrannyInputRef}
                onInput={handleInputChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                onSelect={handleInputSelection}
                onKeyUp={handleInputSelection}
                onMouseUp={handleInputSelection}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => setIsInputFocused(false)}
                placeholder={t("chat.replyInThreadPlaceholder", "Responder en el hilo...")}
                className="onicord-chat-input select-text outline-none overflow-x-hidden whitespace-pre-wrap pr-10 focus:outline-none"
                style={{
                  fontFamily: 'var(--font)',
                  fontSize: '15px',
                  lineHeight: '20px',
                  minHeight: '20px',
                  maxHeight: '120px',
                  overflowY: 'auto',
                  wordBreak: 'break-all',
                }}
              />
            </div>

            <button
              ref={emojisBtnRef}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (emojisTargetRect) {
                  setEmojisTargetRect(null);
                } else {
                  setStickersTargetRect(null);
                  setEmojisTargetRect(e.currentTarget.getBoundingClientRect());
                }
              }}
              className="onicord-chat-toolbar-btn group"
              title={t("chat.emoji", "Emoji")}
            >
              <MaterialIcon name="sentiment_satisfied" size="xl" />
            </button>

            <button
              ref={stickersBtnRef}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (stickersTargetRect) {
                  setStickersTargetRect(null);
                } else {
                  setEmojisTargetRect(null);
                  setStickersTargetRect(e.currentTarget.getBoundingClientRect());
                }
              }}
              className="onicord-chat-toolbar-btn group"
              title={t("chat.sendSticker")}
            >
              <IconSticker size="xl" />
            </button>
          </div>
        </form>
      </div>

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
                setInput((prev) => prev + ` @${nickname} `);
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-onicord-mantle p-5 rounded-xl border border-white/10 w-full max-w-md space-y-4 shadow-xl">
            <h3 className="text-base font-bold text-onicord-text flex items-center gap-2">
              <MaterialIcon name="edit" size={18} className="text-onicord-accent" />
              <span>{t("chat.editMessageTitle", "Editar Mensaje")}</span>
            </h3>
            <textarea
              value={editInputText}
              onChange={(e) => setEditInputText(e.target.value)}
              className="w-full bg-onicord-base border border-white/10 rounded-lg p-3 text-sm text-onicord-text focus:outline-none focus:border-onicord-accent min-h-[100px] resize-none"
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
    </aside>
  );
}
