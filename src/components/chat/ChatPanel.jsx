import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import DeleteMessageModal from "../modals/DeleteMessageModal";
import PinnedMessagesModal from "../modals/PinnedMessagesModal";
import MaterialIcon from "../icons/MaterialIcon";
import ContextMenu from "../ui/ContextMenu";
import {
  IconCopyFile,
  IconPasteFile,
  Delete,
  IconReply,
  IconSave,
  IconPlay,
  IconPlaylist,
} from "../icons/StreamIcons";
import ConfirmDialogModal from "../modals/ConfirmDialogModal";
import { ONICORD_COMMANDS } from "../../lib/commands";
import { getSelectionCharacterOffsets, setSelectionOffsets, renderHTMLForInput, applyMarkdownFormat } from "../../lib/inputFormatter";
import { checkPermission, canSpeakInChannel } from "../../lib/permissionsHelper";
import { copyTextToClipboard, readTextFromClipboard } from "../../lib/clipboard";
import ForwardMessageModal from "../modals/ForwardMessageModal";

const MediaPreviewModal = lazy(() => import("../modals/MediaPreviewModal"));
import { notificationManager } from "../../lib/notificationManager";
import { soundEngine } from "../../lib/soundEngine";
import { recordUserInteraction } from "../../lib/flameService";

import { useChatMessages, normalizeChatMessage } from "../../hooks/useChatMessages";
import { useChatScroll } from "../../hooks/useChatScroll";
import ChatDropZone from "./subcomponents/ChatDropZone";
import ChatMessageList from "./subcomponents/ChatMessageList";
import ChatInputArea from "./subcomponents/ChatInputArea";
import { useVoiceChannelInfo } from "../../context/VoiceContext";
import { useChatComposer } from "./composer/useChatComposer";

function formatBytes(bytes) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function ChatPanel({
  roomCode,
  channelId,
  channelName,
  profile,
  peers,
  server,
  onProfileChange,
  searchQuery = "",
  tagFilter = null,
  onSelectTag = () => {},
  onOpenThread,
  onMessagesUpdate,
  onSelectChannel,
  onToggleReactionReady,
  isForum: isForumProp,
}) {
  const { t } = useTranslation();
  const { inVoice } = useVoiceChannelInfo();
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

  const [postTitle, setPostTitle] = useState("");

  const currentChannel = useMemo(
    () => server?.channels?.find((c) => c.id === channelId),
    [server?.channels, channelId],
  );
  const isForum = isForumProp !== undefined ? isForumProp : currentChannel?.type === "forum";

  const [visibleCount, setVisibleCount] = useState(40);
  const chatContainerRef = useRef(null);
  const bottomRef = useRef(null);
  const messagesCountRef = useRef(0);
  const virtualizerRef = useRef(null);

  useEffect(() => {
    setPostTitle("");
    if (messagesCountRef.current !== undefined) {
      messagesCountRef.current = 0;
    }
    if (chatContainerRef.current) {
      if (isForum) {
        chatContainerRef.current.scrollTop = 0;
      } else {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }
  }, [channelId, isForum]);

  // Hook for P2P messages and real-time synchronization
  const {
    messages,
    setMessages,
    loading,
    fileProgress,
    setFileProgress,
    pinnedMsgIds,
    setPinnedMsgIds,
    typingUsers,
    isNudging,
    mainStreamMessages,
  } = useChatMessages({
    roomCode,
    channelId,
    profile,
    server,
    searchQuery,
    onMessagesUpdate,
    messagesCountRef,
    setVisibleCount,
    bottomRef,
    chatContainerRef,
  });

  // Filter messages by tag in forum channels
  const filteredForumMessages = useMemo(() => {
    if (!tagFilter || !isForum) return mainStreamMessages;
    const cleanFilter = tagFilter.toLowerCase().trim();
    return mainStreamMessages.filter((msg) => {
      if (!msg) return false;
      if (
        Array.isArray(msg.tags) &&
        msg.tags.some((t) => String(t).toLowerCase() === cleanFilter)
      ) {
        return true;
      }
      const textToScan = `${msg.title || ""} ${msg.text || ""} ${msg.rawText || ""}`.toLowerCase();
      return textToScan.includes(`#${cleanFilter}`);
    });
  }, [mainStreamMessages, tagFilter, isForum]);

  // Hook for scrolling logic with incremental reverse pagination
  const {
    isScrollingUpLoading,
    showScrollBottom,
    scrollToBottom,
    scrollToTop,
    handleChatScroll,
    isAtBottomRef,
  } = useChatScroll({
    messages: isForum && tagFilter ? filteredForumMessages : mainStreamMessages,
    loading,
    visibleCount,
    setVisibleCount,
    chatContainerRef,
    bottomRef,
    messagesCountRef,
    virtualizerRef,
    isForum,
  });

  // Virtualized window: only render visible messages to prevent DOM saturation with large histories
  const visibleMainStreamMessages = useMemo(() => {
    const source = isForum && tagFilter ? filteredForumMessages : mainStreamMessages;
    if (isForum) {
      // In forum channels, newest posts appear at the top (sorted newest first)
      const sortedNewestFirst = [...source].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      if (searchQuery?.trim() || tagFilter || !visibleCount || sortedNewestFirst.length <= visibleCount) {
        return sortedNewestFirst;
      }
      return sortedNewestFirst.slice(0, visibleCount);
    }

    if (searchQuery?.trim() || tagFilter || !visibleCount || source.length <= visibleCount) {
      return source;
    }
    return source.slice(-visibleCount);
  }, [mainStreamMessages, filteredForumMessages, visibleCount, searchQuery, tagFilter, isForum]);

  const [previewMedia, setPreviewMedia] = useState({
    isOpen: false,
    localPath: null,
    fileName: "",
    fileSize: 0,
    isImage: false,
    isVideo: false,
  });

  const handleOpenPreview = useCallback((data) => {
    setPreviewMedia({ isOpen: true, ...data });
  }, []);

  const handleShowAlert = useCallback((title, msg) => {
    setAlertModal({ isOpen: true, title, msg });
  }, []);

  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: "",
    msg: "",
  });

  const [execSecurityModal, setExecSecurityModal] = useState({
    isOpen: false,
    mode: "blocked",
    file: null,
    onConfirm: null,
  });

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
      if (m.fileName || m.filePath) return false;
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
      if (freqMap[b] !== freqMap[a]) {
        return freqMap[b] - freqMap[a];
      }
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

  const [sending, setSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const pendingFile = pendingFiles[0] || null;
  const previewUrl = pendingFiles[0]?.previewUrl || null;
  const setPendingFile = useCallback((file) => {
    if (!file) {
      setPendingFiles((prev) => {
        prev.forEach((pf) => {
          if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
        });
        return [];
      });
    } else {
      setPendingFiles([file]);
    }
  }, []);
  const setPreviewUrl = useCallback(() => {}, []);

  const removePendingFile = useCallback((indexToRemove) => {
    setPendingFiles((prev) => {
      const target = prev[indexToRemove];
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((_, idx) => idx !== indexToRemove);
    });
  }, []);

  const clearPendingFiles = useCallback(() => {
    setPendingFiles((prev) => {
      prev.forEach((pf) => {
        if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl);
      });
      return [];
    });
  }, []); 
  const fileInputRef = useRef(null); 
  const [messageToDelete, setMessageToDelete] = useState(null);
  const [replyTarget, setReplyTarget] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [editInputText, setEditInputText] = useState("");
  const [forwardModalMsg, setForwardModalMsg] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [showPinnedModal, setShowPinnedModal] = useState(false);

  const emojiButtonRef = useRef(null);
  const stickerButtonRef = useRef(null);
  const focusTimeoutRef = useRef(null);
  const lastSentTypingRef = useRef(0);

  useEffect(() => {
    const handleOpenPinned = () => setShowPinnedModal(true);
    window.addEventListener("onicord:open-pinned-modal", handleOpenPinned);
    window.addEventListener("onicord:open-pinned", handleOpenPinned);
    return () => {
      window.removeEventListener("onicord:open-pinned-modal", handleOpenPinned);
      window.removeEventListener("onicord:open-pinned", handleOpenPinned);
    };
  }, []);



  useEffect(() => {
    if ((visibleSuggestions.length > 0 || replyTarget) && isAtBottomRef.current) {
      const timer = setTimeout(() => {
        scrollToBottom("smooth");
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [visibleSuggestions.length, replyTarget, scrollToBottom, isAtBottomRef]);

  const handleInputChange = (e) => {
    isLocalTypingRef.current = true;
    const val = e.target.textContent || "";
    setInput(val);

    const partes = val.split(" ");
    const ultimaPalabra = partes[partes.length - 1] || "";

    if (ultimaPalabra.startsWith("@")) {
      setShowMentionsPopup(true);
      setShowCommandsPopup(false);
    } else if (val.startsWith("/")) {
      setShowCommandsPopup(true);
      setShowMentionsPopup(false);
    } else {
      setShowMentionsPopup(false);
      setShowCommandsPopup(false);
    }

    if (!val.trim()) return;

    const now = Date.now();
    if (now - lastSentTypingRef.current > 3000) {
      lastSentTypingRef.current = now;
      window.electronAPI?.sendTyping?.(channelId);
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

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();

    if (text.startsWith("/")) {
      const partes = text.split(" ");
      const comandoIdentificado = partes[0].toLowerCase();
      const argumentos = partes.slice(1);

      const comandoObjeto = ONICORD_COMMANDS[comandoIdentificado];

      if (comandoObjeto) {
        try {
          comandoObjeto.execute(argumentos, {
            setMessages,
            injectSystemMessage: (txt) => {
              setMessages((prev) => [
                ...prev,
                {
                  id: `sys-${crypto.randomUUID().slice(0, 8)}`,
                  system: true,
                  text: txt,
                  timestamp: Date.now(),
                  authorId: "onicord-bot",
                  user: {
                    nickname: "Onicord",
                    avatar: "bot-star",
                  },
                },
              ]);
            },
            resetInputState: () => {
              setPendingFile(null);
              setReplyTarget(null);
            },
            sendP2PMessage: async (payloadRendicion) => {
              if (window.electronAPI?.sendChatMessage) {
                await window.electronAPI.sendChatMessage(
                  roomCode,
                  channelId,
                  payloadRendicion,
                );
              }
            },
            fullInput: text,
          });
        } catch (err) {
          console.error("Error al ejecutar comando interno:", err);
        } finally {
          setInput("");
          setReplyTarget(null);
          focusTimeoutRef.current = setTimeout(() => {
            tyrannyInputRef.current?.focus();
          }, 50);
        }
        return;
      } else {
        if (window.electronAPI?.sendPluginCommand) {
          window.electronAPI.sendPluginCommand(roomCode, channelId, text);
          setInput("");
          setReplyTarget(null);
          return;
        }
      }
    }

    const trimmedTitle = postTitle.trim();
    if ((!text && pendingFiles.length === 0 && !trimmedTitle) || sending) return;

    setSending(true);
    setInput("");
    if (isForum) setPostTitle("");

    try {
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

      // Extract hashtags from title and body
      const allText = `${trimmedTitle} ${text}`;
      const matches = allText.matchAll(/#([a-zA-Z0-9_\u00C0-\u017F]+)/g);
      const extractedTags = Array.from(new Set(Array.from(matches, (m) => m[1].toLowerCase())));

      if (pendingFiles.length > 0) {
        const userText = text ? `${text} ` : "";
        const processedAttachments = [];

        for (const pf of pendingFiles) {
          let finalFileId = pf.id;
          let pfName = pf.name;
          let pfSize = pf.size;
          let pfThumb = pf.thumbnail || null;

          if (!finalFileId) {
            let meta;
            if (pf.path && window.electronAPI?.processDroppedMeta) {
              meta = await window.electronAPI.processDroppedMeta(
                roomCode,
                pf.path,
              );
            } else if (
              pf.fileObj &&
              window.electronAPI?.uploadClipboardImage
            ) {
              const arrayBuffer = await pf.fileObj.arrayBuffer();
              meta = await window.electronAPI.uploadClipboardImage(
                roomCode,
                arrayBuffer,
              );
            }

            if (meta) {
              finalFileId = meta.id;
              pfName = meta.name;
              pfSize = meta.size;
              if (meta.thumbnail) pfThumb = meta.thumbnail;
            }
          }

          if (finalFileId) {
            processedAttachments.push({
              id: finalFileId,
              name: pfName,
              size: pfSize,
              ...(pfThumb ? { thumbnail: pfThumb } : {}),
            });
          }
        }

        if (processedAttachments.length > 0) {
          const attachmentsPayload = processedAttachments
            .map((att) => `[FILE_ATTACHMENT]:${JSON.stringify(att)}`)
            .join("");
          const fileContent = `${userText}${attachmentsPayload}`;

          let payloadMensaje;
          if (isForum || trimmedTitle || extractedTags.length > 0) {
            payloadMensaje = JSON.stringify({
              title: trimmedTitle || undefined,
              body: fileContent,
              tags: extractedTags.length > 0 ? extractedTags : undefined,
              replyTo: replyData || undefined,
            });
          } else {
            payloadMensaje = replyData
              ? JSON.stringify({ body: fileContent, replyTo: replyData })
              : fileContent;
          }

          await window.electronAPI.sendChatMessage(
            roomCode,
            channelId,
            payloadMensaje,
          );
        }

        clearPendingFiles();
      } else {
        let payloadMensaje;
        if (isForum || trimmedTitle || extractedTags.length > 0) {
          payloadMensaje = JSON.stringify({
            title: trimmedTitle || undefined,
            body: text,
            tags: extractedTags.length > 0 ? extractedTags : undefined,
            replyTo: replyData || undefined,
          });
        } else {
          payloadMensaje = replyData
            ? JSON.stringify({ body: text, replyTo: replyData })
            : text;
        }

        const optimisticMsg = normalizeChatMessage({
          id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          roomCode,
          channelId,
          authorId: profile?.id || "self",
          authorNickname: profile?.nickname || "Yo",
          authorAvatar: profile?.avatar || null,
          title: trimmedTitle || undefined,
          tags: extractedTags.length > 0 ? extractedTags : undefined,
          text: payloadMensaje,
          rawText: payloadMensaje,
          replyTo: replyData,
          timestamp: Date.now(),
          isOptimistic: true,
        });

        setMessages((prev) => [...prev, optimisticMsg]);
        setVisibleCount?.((v) => v + 1);
        requestAnimationFrame(() => {
          if (isForum) {
            scrollToTop("smooth");
          } else {
            scrollToBottom("smooth");
          }
        });

        await window.electronAPI.sendChatMessage(
          roomCode,
          channelId,
          payloadMensaje,
        );
      }

      soundEngine.playCue("send");

      if (profile && server) {
        const updatedFlame = recordUserInteraction(profile, server.roomCode || server.id);
        if (updatedFlame && window.electronAPI?.saveProfile) {
          const nextProf = { ...profile, flame: updatedFlame };
          window.electronAPI.saveProfile(nextProf).then((saved) => {
            if (saved) onProfileChange?.(saved);
          });
        }
      }
    } catch (err) {
      console.error("Error al enviar mensaje:", err);
    } finally {
      setSending(false);
      setReplyTarget(null);
      focusTimeoutRef.current = setTimeout(() => {
        tyrannyInputRef.current?.focus();
      }, 50);
    }
  };

  const processSingleFile = async (file) => {
    let preview = null;
    if (file.type?.startsWith("image/") || file.type?.startsWith("video/")) {
      preview = URL.createObjectURL(file);
    }

    const realPath =
      file.path ||
      (window.electronAPI?.getNativePath
        ? await window.electronAPI.getNativePath(file)
        : null);

    return {
      path: realPath,
      name: file.name,
      size: file.size,
      type: file.type,
      fileObj: file,
      previewUrl: preview,
    };
  };

  const handleFilesSelection = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    const filesArray = Array.from(fileList);

    const executableBlacklist = [
      ".exe", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".cjs", ".mjs", ".sh", ".lnk", ".html"
    ];

    const safeFiles = [];
    for (const file of filesArray) {
      const fileExt = "." + (file.name?.split(".").pop()?.toLowerCase() || "");
      const isExecutable = executableBlacklist.includes(fileExt);

      if (isExecutable) {
        const allowExec = server?.allowExecutableFiles ?? false;
        if (!allowExec) {
          setExecSecurityModal({
            isOpen: true,
            mode: "blocked",
            file,
            onConfirm: null,
          });
          continue;
        }
      }
      const processed = await processSingleFile(file);
      if (processed) safeFiles.push(processed);
    }

    if (safeFiles.length > 0) {
      setPendingFiles((prev) => [...prev, ...safeFiles]);
    }
  };

  const handleFileSelection = async (file) => {
    if (file) await handleFilesSelection([file]);
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
    const hasFiles = Array.from(e.dataTransfer.types || []).includes("Files");
    if (!hasFiles) return;

    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    soundEngine.playCue("drop");

    await handleFilesSelection(files);

    setTimeout(() => {
      tyrannyInputRef.current?.focus();
    }, 50);
  };

  const handlePaste = async (e) => {
    const clipboardItems = e.clipboardData?.items;
    if (!clipboardItems) return;

    const filesToUpload = [];
    for (const item of clipboardItems) {
      if (item.type.indexOf("image") !== -1) {
        const fileBlob = item.getAsFile();
        if (fileBlob) filesToUpload.push(fileBlob);
      }
    }

    if (filesToUpload.length > 0) {
      e.preventDefault();
      await handleFilesSelection(filesToUpload);
    } else {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, text);
    }
  };

  const handleAttachFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleFilesSelection(files);
      setTimeout(() => {
        tyrannyInputRef.current?.focus();
      }, 50);
    }
    e.target.value = null; 
  };

  const handleDownloadFile = async (fileId, name, size) => {
    if (!window.electronAPI?.downloadFile) return;
    try {
      setFileProgress((prev) => ({
        ...prev,
        [fileId]: { progress: 0, done: false, error: undefined },
      }));
      await window.electronAPI.downloadFile(roomCode, fileId, name, size);
    } catch (err) {
      setFileProgress((prev) => ({
        ...prev,
        [fileId]: { error: err.message, done: false },
      }));
    }
  };

  const handleCancelDownload = useCallback((fileId) => {
    if (window.electronAPI?.cancelDownload) {
      window.electronAPI.cancelDownload(fileId);
    }
    setFileProgress((prev) => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
  }, [setFileProgress]);

  const handleMessageContextMenu = useCallback(
    (e, msg, nickname, avatar, isMyMessage) => {
      const esUnSticker = msg.text?.startsWith('{"type":"sticker"');

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
    [],
  );

  const handleOpenDeleteModal = useCallback(
    (e, msg, nickname, avatar) => {
      if (e.shiftKey) {
        window.electronAPI?.deleteChatMessage?.(roomCode, channelId, msg.id);
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      } else {
        setMessageToDelete({ msg, nickname, avatar });
      }
    },
    [roomCode, channelId, setMessages],
  );

  const handleToggleReaction = useCallback(
    (messageId, emoji, targetChannelId = channelId) => {
      const myId = profile?.id || "self";
      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId) return msg;
          const currentReactions = msg.reactions ? { ...msg.reactions } : {};
          const userList = currentReactions[emoji] ? [...currentReactions[emoji]] : [];
          const idx = userList.indexOf(myId);
          if (idx >= 0) {
            userList.splice(idx, 1);
          } else {
            userList.push(myId);
          }
          if (userList.length === 0) {
            delete currentReactions[emoji];
          } else {
            currentReactions[emoji] = userList;
          }
          return { ...msg, reactions: currentReactions };
        })
      );

      soundEngine.playCue("reaction");

      if (window.electronAPI?.sendChatMessage) {
        window.electronAPI.sendChatMessage(
          roomCode,
          targetChannelId || channelId,
          `[REACTION_ACTION]:${JSON.stringify({ messageId, emoji, userId: myId })}`
        );
      }
    },
    [profile?.id, roomCode, channelId, setMessages],
  );

  useEffect(() => {
    onToggleReactionReady?.(handleToggleReaction);
  }, [onToggleReactionReady, handleToggleReaction]);

  const handlePluginAction = useCallback(
    (msgId, pluginId, action, data) => {
      if (!msgId || !pluginId || !action || !data) return;

      const currentUserId = profile?.id || "self";
      const currentUserName = profile?.nickname || profile?.name || "Usuario";
      const currentUserAvatar = profile?.avatar || null;
      const safeAvatar =
        currentUserAvatar &&
        typeof currentUserAvatar === "string" &&
        currentUserAvatar.startsWith("data:")
          ? null
          : currentUserAvatar;

      const voterObj = {
        id: currentUserId,
        name: currentUserName,
        avatar: safeAvatar,
      };

      setMessages((prevMsgs) => {
        return prevMsgs.map((m) => {
          if (m.id !== msgId) return m;
          if (!m.text || !m.text.startsWith("[PLUGIN_EMBED]:")) return m;

          try {
            const jsonStr = m.text.substring("[PLUGIN_EMBED]:".length);
            const embedPayload = JSON.parse(jsonStr);

            if (embedPayload.type === "poll" && embedPayload.data) {
              const { pollId, optionId } = data;
              if (embedPayload.data.pollId !== pollId) return m;

              embedPayload.data.options = embedPayload.data.options.map((opt) => {
                const filteredVoters = (opt.voters || []).filter(
                  (v) =>
                    v.id !== currentUserId &&
                    v.id !== profile?.id &&
                    v.id !== "self"
                );

                if (opt.id === optionId) {
                  filteredVoters.push(voterObj);
                }

                return { ...opt, voters: filteredVoters };
              });

              const updatedText = `[PLUGIN_EMBED]:${JSON.stringify(embedPayload)}`;

              if (window.electronAPI?.sendChatMessage) {
                const actionPayload = JSON.stringify({
                  pluginId,
                  action,
                  targetId: pollId,
                  data: { pollId, optionId, voter: voterObj },
                });
                window.electronAPI.sendChatMessage(
                  roomCode,
                  channelId,
                  `[PLUGIN_ACTION]:${actionPayload}`
                );
              }

              return { ...m, text: updatedText };
            }

            return m;
          } catch (err) {
            console.error("Error al ejecutar acción de plugin:", err);
            return m;
          }
        });
      });
    },
    [profile, roomCode, channelId, setMessages]
  );

  const handleSaveEditMessage = useCallback(
    async (msgId, newText) => {
      if (!newText.trim() || !window.electronAPI?.sendChatMessage) return;
      try {
        const payload = `[EDIT_MESSAGE]:${JSON.stringify({ messageId: msgId, newText: newText.trim() })}`;
        await window.electronAPI.sendChatMessage(roomCode, channelId, payload);
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, text: newText.trim(), edited: true } : m))
        );
        setEditingMsg(null);
        setEditInputText("");
      } catch (err) {
        console.error("Error saving message edit:", err);
      }
    },
    [roomCode, channelId, setMessages]
  );

  const handleForwardMessageConfirm = useCallback(
    async (originalMsg, targetChannelId) => {
      if (!originalMsg || !targetChannelId || !window.electronAPI?.sendChatMessage) return;
      try {
        let cleanText = originalMsg.text || "";
        let authorNickname = originalMsg.authorNickname || originalMsg.user?.nickname || "Usuario";
        let originChannelName = channelName || "general";
        let originChannelId = channelId || "general";
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
        await window.electronAPI.sendChatMessage(roomCode, targetChannelId, forwardedText);
        notificationManager.showToast("Mensaje Reenviado", "El mensaje ha sido reenviado con éxito", "info");
      } catch (err) {
        console.error("Error forwarding message:", err);
      }
    },
    [roomCode, channelId, channelName]
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

      if (targetChannelId && targetChannelId !== channelId) {
        onSelectChannel?.(targetChannelId);
        setTimeout(performScroll, 250);
      } else {
        performScroll();
      }
    },
    [channelId, onSelectChannel]
  );

  const handleTogglePinMessage = useCallback(
    (msgId) => {
      setPinnedMsgIds((prev) => {
        const isPinned = prev.includes(msgId);
        const next = isPinned ? prev.filter((id) => id !== msgId) : [...prev, msgId];
        if (window.electronAPI?.sendChatMessage) {
          window.electronAPI.sendChatMessage(
            roomCode,
            channelId,
            `[PIN_ACTION]:${JSON.stringify({ messageId: msgId, isPinned: !isPinned })}`
          );
        }
        return next;
      });
    },
    [roomCode, channelId, setPinnedMsgIds]
  );

  const hasSendMessages =
    checkPermission(server, profile?.id, "send_messages") &&
    canSpeakInChannel(server, currentChannel, profile?.id);

  return (
    <div
      className={`flex h-full max-h-full min-h-0 flex-1 flex-col bg-onicord-base text-onicord-text relative ${
        isNudging ? "onicord-nudge-active" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ChatDropZone isDragging={isDragging} />

      <ChatMessageList
        mainStreamMessages={visibleMainStreamMessages}
        messages={messages}
        loading={loading}
        isForum={isForum}
        channelId={channelId}
        channelName={channelName}
        roomCode={roomCode}
        profile={profile}
        peers={peers}
        server={server}
        fileProgress={fileProgress}
        chatContainerRef={chatContainerRef}
        bottomRef={bottomRef}
        virtualizerRef={virtualizerRef}
        handleChatScroll={handleChatScroll}
        isScrollingUpLoading={isScrollingUpLoading}
        showScrollBottom={showScrollBottom}
        onScrollToBottom={isForum ? scrollToTop : scrollToBottom}
        onDownloadFile={handleDownloadFile}
        onCancelDownload={handleCancelDownload}
        onOpenDeleteModal={handleOpenDeleteModal}
        onContextMenu={handleMessageContextMenu}
        onShowAlert={handleShowAlert}
        onOpenPreview={handleOpenPreview}
        onToggleReaction={handleToggleReaction}
        onForwardClick={(msgToForward) => setForwardModalMsg(msgToForward)}
        onOpenThread={(msgForThread) => onOpenThread?.(msgForThread)}
        onJumpToMessage={handleJumpToMessage}
        onPluginAction={handlePluginAction}
        onReplyClick={(target) => {
          soundEngine.playCue("press");
          setReplyTarget(target);
          tyrannyInputRef.current?.focus();
        }}
        onSelectTag={onSelectTag}
        searchQuery={searchQuery}
      />

      <ChatInputArea
        channelName={channelName}
        hasSendMessages={hasSendMessages}
        isForum={isForum}
        postTitle={postTitle}
        setPostTitle={setPostTitle}
        input={input}
        setInput={setInput}
        pendingFile={pendingFile}
        setPendingFile={setPendingFile}
        pendingFiles={pendingFiles}
        onRemovePendingFile={removePendingFile}
        onClearPendingFiles={clearPendingFiles}
        previewUrl={previewUrl}
        setPreviewUrl={setPreviewUrl}
        replyTarget={replyTarget}
        setReplyTarget={setReplyTarget}
        typingUsers={typingUsers}
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
        emojiButtonRef={emojiButtonRef}
        stickerButtonRef={stickerButtonRef}
        handleSend={handleSend}
        handleInputChange={handleInputChange}
        handleKeyDown={handleKeyDown}
        handlePaste={handlePaste}
        handleInputSelection={handleInputSelection}
        handleFileInputChange={handleFileInputChange}
        handleAttachFileClick={handleAttachFileClick}
        handleSelectEmoji={handleSelectEmoji}
        onSelectSticker={(stk) => {
          if (window.electronAPI?.sendChatMessage) {
            const payloadSticker = JSON.stringify({
              type: "sticker",
              stickerId: stk.id,
              stickerName: stk.name,
              ext: stk.ext,
            });

            window.electronAPI.sendChatMessage(
              roomCode,
              channelId,
              payloadSticker,
            );

            if (profile && server) {
              const updatedFlame = recordUserInteraction(profile, server.roomCode || server.id);
              if (updatedFlame && window.electronAPI?.saveProfile) {
                const nextProf = { ...profile, flame: updatedFlame };
                window.electronAPI.saveProfile(nextProf).then((saved) => {
                  if (saved) onProfileChange?.(saved);
                });
              }
            }
          }
          setStickersTargetRect(null);
        }}
        onSharePackDirect={async (packInfo) => {
          const payloadFilePack = `[FILE_ATTACHMENT]:${JSON.stringify({
            id: packInfo.fileId,
            name: packInfo.name,
            size: packInfo.size,
          })}`;

          if (window.electronAPI?.sendChatMessage) {
            await window.electronAPI.sendChatMessage(
              roomCode,
              channelId,
              payloadFilePack,
            );

            if (profile && server) {
              const updatedFlame = recordUserInteraction(profile, server.roomCode || server.id);
              if (updatedFlame && window.electronAPI?.saveProfile) {
                const nextProf = { ...profile, flame: updatedFlame };
                window.electronAPI.saveProfile(nextProf).then((saved) => {
                  if (saved) onProfileChange?.(saved);
                });
              }
            }
          }
          setStickersTargetRect(null);
        }}
        setContextMenu={setContextMenu}
      />

      {showPinnedModal && (
        <PinnedMessagesModal
          isOpen={showPinnedModal}
          onClose={() => setShowPinnedModal(false)}
          pinnedMessages={messages.filter((m) => pinnedMsgIds.includes(m.id))}
          onUnpinMessage={handleTogglePinMessage}
          profile={profile}
          peers={peers}
          server={server}
        />
      )}

      {messageToDelete && (
        <DeleteMessageModal
          message={messageToDelete.msg}
          authorName={messageToDelete.nickname}
          authorAvatar={messageToDelete.avatar}
          onClose={() => setMessageToDelete(null)}
          onConfirm={async () => {
            try {
              await window.electronAPI?.deleteChatMessage?.(
                roomCode,
                channelId,
                messageToDelete.msg.id,
              );
              setMessages((prev) =>
                prev.filter((m) => m.id !== messageToDelete.msg.id),
              );
              setMessageToDelete(null);
            } catch (err) {
              console.error(err);
            }
          }}
        />
      )}

      {forwardModalMsg && (
        <ForwardMessageModal
          message={forwardModalMsg}
          server={server}
          currentChannelId={channelId}
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

      {contextMenu &&
        (() => {
          let menuItems = [];

          if (contextMenu.type === "message") {
            const {
              msg,
              isMyMessage,
              nickname,
              avatar,
              esUnSticker,
              clickedUrl,
            } = contextMenu.data;

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
                    const yaExiste = await window.electronAPI.getStickerPath(
                      parsedStk.stickerId,
                    );
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
                console.error(
                  "Error parsing sticker data in context menu:",
                  e,
                );
              }
            }

            if (clickedUrl && !esUnSticker) {
              const isPlayable =
                Boolean(inVoice) &&
                /youtube\.com|youtu\.be|soundcloud\.com/i.test(clickedUrl);

              if (isPlayable) {
                menuItems.push({
                  label: t("contextMenu.playInRoom"),
                  icon: <IconPlay size="lg" />,
                  onClick: () => {
                    window.dispatchEvent(
                      new CustomEvent("onicord:broadcast-music", {
                        detail: `PLAY_NOW:${clickedUrl}`,
                      }),
                    );
                  },
                });

                if (/youtube\.com|youtu\.be/i.test(clickedUrl)) {
                  menuItems.push({
                    label: t("contextMenu.startWatchParty"),
                    icon: <MaterialIcon name="smart_display" size={18} />,
                    onClick: () => {
                      window.dispatchEvent(
                        new CustomEvent("onicord:start-watch-party", {
                          detail: { url: clickedUrl },
                        }),
                      );
                    },
                  });
                }

                menuItems.push({
                  label: t("contextMenu.addToQueue"),
                  icon: <IconPlaylist size="lg" />,
                  onClick: () => {
                    window.dispatchEvent(
                      new CustomEvent("onicord:broadcast-music", {
                        detail: `QUEUE_ADD:${clickedUrl}`,
                      }),
                    );
                  },
                });
                menuItems.push("SEPARATOR");
              }

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
                soundEngine.playCue("press");
                const textParaCita = esUnSticker
                  ? "[Sticker]"
                  : msg.text?.includes("[FILE_ATTACHMENT]:")
                    ? msg.text.split("[FILE_ATTACHMENT]:")[0].trim()
                    : msg.text;

                setReplyTarget({
                  id: msg.id,
                  authorId: msg.authorId,
                  text: textParaCita || "Archivo adjunto",
                });
                tyrannyInputRef.current?.focus();
              },
            });

            if (!msg.threadParentId) {
              menuItems.push({
                label: t("chat.replyInThread", "Responder en hilo"),
                icon: <MaterialIcon name="forum" size={16} />,
                onClick: () => {
                  onOpenThread?.(msg);
                },
              });
            }

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
                  const selText = window.getSelection()?.toString();
                  if (selText && selText.trim().length > 0) {
                    await copyTextToClipboard(selText);
                  } else {
                    const cleanText = msg.text?.includes("[FILE_ATTACHMENT]:")
                      ? msg.text.split("[FILE_ATTACHMENT]:")[0].trim()
                      : msg.text;
                    if (cleanText)
                      await copyTextToClipboard(cleanText);
                  }
                },
              });

              if (isMyMessage) {
                menuItems.push("SEPARATOR");
                menuItems.push({
                  label: t("chat.editMessage", "Editar mensaje"),
                  icon: <MaterialIcon name="edit" size={16} />,
                  onClick: () => {
                    setEditingMsg(msg);
                    setEditInputText(
                      msg.text?.includes("[FILE_ATTACHMENT]:")
                        ? msg.text.split("[FILE_ATTACHMENT]:")[0].trim()
                        : msg.text || ""
                    );
                  },
                });

                menuItems.push({
                  label: t("contextMenu.deleteMessage"),
                  icon: <Delete size="lg" />,
                  variant: "danger",
                  onClick: () => {
                    setMessageToDelete({ msg, nickname, avatar });
                  },
                });
              }
            }
          }

          if (contextMenu.type === "input") {
            menuItems.push({
              label: "Pegar texto",
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

      <ConfirmDialogModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.msg}
        confirmLabel="Entendido"
        type="alert"
        onConfirm={() => setAlertModal({ isOpen: false, title: "", msg: "" })}
      />

      {execSecurityModal.isOpen && (
        <ConfirmDialogModal
          isOpen={execSecurityModal.isOpen}
          title={
            execSecurityModal.mode === "blocked"
              ? t("chat.fileRestrictedTitle", "Tipo de archivo restringido")
              : t("chat.execSendTitle", "Advertencia de Seguridad")
          }
          message={
            execSecurityModal.mode === "blocked"
              ? t("chat.fileRestrictedMsg", "Este servidor tiene deshabilitado el envío de archivos ejecutables y scripts (.exe, .bat, .js) por políticas de seguridad.")
              : t("chat.execSendMsg", "Estás a punto de adjuntar un archivo ejecutable ({{name}}). Los archivos de este tipo pueden contener código ejecutable.", { name: execSecurityModal.file?.name })
          }
          warningMessage={
            execSecurityModal.mode === "confirm"
              ? t("chat.execSendWarning", "Asegúrate de confiar en los miembros de este servidor antes de enviar un archivo ejecutable.")
              : undefined
          }
          confirmLabel={
            execSecurityModal.mode === "blocked"
              ? t("common.ok", "Entendido")
              : t("chat.sendAnyway", "Enviar de todos modos")
          }
          cancelLabel={t("common.cancel", "Cancelar")}
          type={execSecurityModal.mode === "blocked" ? "alert" : "confirm"}
          onConfirm={() => {
            const action = execSecurityModal.onConfirm;
            setExecSecurityModal({ isOpen: false, mode: "blocked", file: null, onConfirm: null });
            action?.();
          }}
          onCancel={() =>
            setExecSecurityModal({ isOpen: false, mode: "blocked", file: null, onConfirm: null })
          }
        />
      )}

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
    </div>
  );
}
