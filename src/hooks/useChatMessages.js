import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { notificationManager } from "../lib/notificationManager";
import { soundEngine } from "../lib/soundEngine";
import { getStoredGeneralSettings, normalizeGeneralSettings } from "../lib/generalSettings";
import { getNotificationAuthor } from "../lib/profileUtils";

export function extractAttachmentsFromText(rawText) {
  if (typeof rawText !== "string" || !rawText.includes("[FILE_ATTACHMENT]:")) {
    return [];
  }
  let targetText = rawText;
  if (rawText.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(rawText);
      if (typeof parsed?.body === "string") {
        targetText = parsed.body;
      }
    } catch {}
  }
  const attachments = [];
  const parts = targetText.split("[FILE_ATTACHMENT]:");
  for (let i = 1; i < parts.length; i++) {
    try {
      const parsed = JSON.parse(parts[i]);
      if (parsed && parsed.id) attachments.push(parsed);
    } catch {}
  }
  return attachments;
}
export function normalizeChatMessage(msg) {
  if (!msg || typeof msg !== "object") return msg;
  if (msg._normalized) return msg;

  let text = msg.text || "";
  let threadParentId = msg.threadParentId || null;
  let replyTo = msg.replyTo || null;
  let title = msg.title || null;
  let tags = Array.isArray(msg.tags) ? msg.tags : null;
  let isNudge = false;
  const rawText = msg.rawText || (typeof msg.text === "string" ? msg.text : "");

  if (typeof text === "string" && text.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(text);
      if (parsed.threadParentId) threadParentId = parsed.threadParentId;
      if (parsed.replyTo) replyTo = parsed.replyTo;
      if (parsed.title) title = parsed.title;
      if (Array.isArray(parsed.tags)) tags = parsed.tags;
      if (typeof parsed.body === "string") {
        if (parsed.body.trim().startsWith("{")) {
          try {
            const inner = JSON.parse(parsed.body);
            if (inner.threadParentId) threadParentId = inner.threadParentId;
            if (inner.replyTo) replyTo = inner.replyTo;
            if (inner.title) title = inner.title;
            if (Array.isArray(inner.tags)) tags = inner.tags;
            text = inner.body || inner.text || parsed.body;
          } catch {
            text = parsed.body;
          }
        } else {
          text = parsed.body;
        }
      } else if (parsed.text) {
        text = parsed.text;
      }
    } catch {}
  }

  if (typeof text === "string" && text.includes("[NUDGE_MESSAGE]")) {
    isNudge = true;
  }

  return {
    ...msg,
    text,
    rawText,
    replyTo: replyTo || msg.replyTo || null,
    threadParentId: threadParentId || msg.threadParentId || null,
    title,
    tags,
    isNudge,
    _normalized: true,
  };
}

function extractClientMessageMeta(msg) {
  const norm = normalizeChatMessage(msg);
  let text = norm.text || "";

  let isFile = Boolean(norm.filePath || norm.fileName);
  let fileName = norm.fileName || "";
  let cleanText = text;

  if (typeof text === "string" && text.includes("[FILE_ATTACHMENT]:")) {
    isFile = true;
    try {
      const parts = text.split("[FILE_ATTACHMENT]:");
      cleanText = parts[0] ? parts[0].trim() : "";
      const fileData = JSON.parse(parts[1]);
      if (fileData?.name) fileName = fileData.name;
    } catch {}
  }

  let linkUrl = norm.linkUrl || null;
  if (typeof cleanText === "string" && cleanText.includes("[LINK]:")) {
    const parts = cleanText.split("[LINK]:");
    cleanText = parts[0] ? parts[0].trim() : "";
    linkUrl = parts[1] ? parts[1].trim() : linkUrl;
  }

  const hasLink = Boolean(linkUrl || (typeof cleanText === "string" && /https?:\/\/[^\s\)]+/i.test(cleanText)));
  const isImage = Boolean(
    (fileName && /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(fileName)) ||
    (norm.fileType && norm.fileType.startsWith("image/"))
  );

  return { cleanText, fileName, isFile, isImage, hasLink };
}

export function parseClientSearchQuery(rawQuery) {
  if (!rawQuery || !rawQuery.trim()) return null;

  const normalize = (s) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}_\s]+/gu, " ")
      .trim();

  let query = rawQuery.trim();
  const filters = { from: null, in: null, hasFile: false, hasImage: false, hasLink: false };
  const phrases = [];

  query = query.replace(/"([^"]+)"/g, (_, p) => {
    const t = p.trim();
    if (t) phrases.push(normalize(t));
    return " ";
  });

  query = query.replace(/(?:^|\s)from:(\S+)/gi, (_, val) => {
    filters.from = normalize(val);
    return " ";
  });

  query = query.replace(/(?:^|\s)in:(\S+)/gi, (_, val) => {
    filters.in = String(val).toLowerCase().replace(/^#/, "").trim();
    return " ";
  });

  query = query.replace(/(?:^|\s)has:(\S+)/gi, (match, val) => {
    const lower = val.toLowerCase();
    if (lower === "file" || lower === "attachment" || lower === "archivo" || lower === "adjunto" || lower.startsWith("fil")) {
      filters.hasFile = true;
      return " ";
    } else if (lower === "image" || lower === "img" || lower === "foto" || lower === "imagen" || lower.startsWith("imag") || lower.startsWith("fot")) {
      filters.hasImage = true;
      return " ";
    } else if (lower === "link" || lower === "url" || lower === "enlace" || lower.startsWith("lin") || lower.startsWith("url")) {
      filters.hasLink = true;
      return " ";
    }
    return match;
  });

  const terms = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^\p{L}\p{N}_]+/u)
    .filter(Boolean);

  return { filters, phrases, terms };
}

export function matchParsedSearchQuery(msg, parsedQuery) {
  if (!parsedQuery) return true;
  if (!msg) return false;

  const meta = extractClientMessageMeta(msg);

  const normalize = (s) =>
    (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}_\s]+/gu, " ")
      .trim();

  const normText = normalize(meta.cleanText);
  const author = msg.authorNickname || msg.authorName || "";
  const normAuthor = normalize(author);
  const normFile = normalize(meta.fileName);

  const { filters, phrases, terms } = parsedQuery;

  if (filters.from && !normAuthor.includes(filters.from)) return false;
  if (filters.in && msg.channelId && msg.channelId.toLowerCase() !== filters.in) return false;
  if (filters.hasFile && !meta.isFile) return false;
  if (filters.hasImage && !meta.isImage) return false;
  if (filters.hasLink && !meta.hasLink) return false;

  const combined = `${normText} ${normFile} ${normAuthor}`;
  for (const phrase of phrases) {
    if (!combined.includes(phrase)) return false;
  }

  for (const term of terms) {
    if (!normText.includes(term) && !normAuthor.includes(term) && !normFile.includes(term)) {
      return false;
    }
  }

  return true;
}

export function useChatMessages({
  roomCode,
  channelId,
  profile,
  server,
  searchQuery = "",
  onMessagesUpdate,
  messagesCountRef,
  setVisibleCount,
  bottomRef,
  chatContainerRef,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fileProgress, setFileProgress] = useState({});
  const [pinnedMsgIds, setPinnedMsgIds] = useState([]);
  const [typingUsers, setTypingUsers] = useState({});
  const [isNudging, setIsNudging] = useState(false);
  const [historicalSearchResults, setHistoricalSearchResults] = useState([]);
  const focusTimeoutRef = useRef(null);
  const checkedAttachmentIdsRef = useRef(new Set());
  const autoDownloadingIdsRef = useRef(new Set());
  const serverRef = useRef(server);
  useEffect(() => {
    serverRef.current = server;
  }, [server]);
  const generalSettingsRef = useRef(
    profile?.general ? normalizeGeneralSettings(profile.general) : getStoredGeneralSettings()
  );

  useEffect(() => {
    if (profile?.general) {
      generalSettingsRef.current = normalizeGeneralSettings(profile.general);
    }
  }, [profile?.general]);

  useEffect(() => {
    const handleSettingsUpdate = (e) => {
      if (e.detail) {
        generalSettingsRef.current = normalizeGeneralSettings({
          ...generalSettingsRef.current,
          ...e.detail,
        });
      }
    };
    window.addEventListener("onicord:general-settings-updated", handleSettingsUpdate);
    return () => {
      window.removeEventListener("onicord:general-settings-updated", handleSettingsUpdate);
    };
  }, []);

  useEffect(() => {
    checkedAttachmentIdsRef.current.clear();
    autoDownloadingIdsRef.current.clear();
  }, [channelId, roomCode]);

  const onMessagesUpdateRef = useRef(onMessagesUpdate);
  useEffect(() => {
    onMessagesUpdateRef.current = onMessagesUpdate;
  });

  useEffect(() => {
    onMessagesUpdateRef.current?.(messages);
  }, [messages]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setPinnedMsgIds([]);
    if (messagesCountRef) messagesCountRef.current = 0;
  }, [channelId, roomCode]);

  // Track file progress from Electron
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onFileProgress) return;

    const unsubProgress = api.onFileProgress((data) => {
      if (!data || !data.fileId) return;

      setFileProgress((prev) => {
        const current = prev[data.fileId];

        if (
          current &&
          current.progress === data.progress &&
          current.done === data.done &&
          current.error === data.error &&
          current.localPath === data.localPath
        ) {
          return prev;
        }

        return {
          ...prev,
          [data.fileId]: {
            progress:
              data.progress !== undefined
                ? data.progress
                : current?.progress || 0,
            done: Boolean(data.done),
            error: data.error,
            localPath: data.localPath || current?.localPath || null,
          },
        };
      });
    });

    return () => {
      unsubProgress?.();
    };
  }, []);

  // Plugin outbound messages
  useEffect(() => {
    if (window.electronAPI?.onPluginChatMessageOutbound) {
      const cleanup = window.electronAPI.onPluginChatMessageOutbound(({ pluginId, message }) => {
        const msgData = message || {};
        const msgObj = normalizeChatMessage({
          id: `plugin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          isComplement: true,
          complementName: msgData.complementName || "Complemento",
          text: msgData.text || msgData.content || "",
          timestamp: Date.now(),
          authorId: `bot_${pluginId}`,
          user: {
            nickname: msgData.complementName || "Complemento",
            avatar: msgData.avatar || null,
          },
        });
        setMessages((prev) => [...prev, msgObj]);
      });
      return cleanup;
    }
  }, []);

  // Plugin clear outbound
  useEffect(() => {
    if (window.electronAPI?.onPluginChatClearOutbound) {
      const cleanup = window.electronAPI.onPluginChatClearOutbound(({ pluginId }) => {
        setMessages((prev) => prev.filter((m) => !m.isComplement || (m.authorId !== `bot_${pluginId}` && m.complementId !== pluginId)));
      });
      return cleanup;
    }
  }, []);

  // Historical file downloads and background auto-download check
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    const checkDownloadsAndAutoDownload = async () => {
      const updatedProgressUpdates = {};
      const newAttachmentsToCheck = [];

      for (const msg of messages) {
        const atts = extractAttachmentsFromText(msg.text);
        const isMyMessage = Boolean(
          (profile?.id && (msg.authorId === profile.id || msg.authorId === "self")) ||
          msg.authorId === "self" ||
          (profile?.nickname && (msg.authorName === profile.nickname || msg.user?.nickname === profile.nickname))
        );

        for (const att of atts) {
          if (att && att.id && !checkedAttachmentIdsRef.current.has(att.id)) {
            checkedAttachmentIdsRef.current.add(att.id);
            newAttachmentsToCheck.push({ ...att, isMyMessage });
          }
        }
      }

      if (newAttachmentsToCheck.length === 0) return;

      const currentGen = generalSettingsRef.current;
      const isAutoEnabled = currentGen?.autoDownloadFiles !== false;
      const maxMB = currentGen?.autoDownloadMaxSizeMB ?? 500;
      const maxBytes = maxMB === -1 ? Infinity : maxMB * 1024 * 1024;
      const downloadDir = currentGen?.downloadDirectory || undefined;

      const pendingAutoDownloads = [];
      for (const att of newAttachmentsToCheck) {
        try {
          let savedPath = null;
          // If file was sent by the local user, look up in their local uploads index
          if (att.isMyMessage && window.electronAPI?.fetchUploadedLocalPath && roomCode) {
            savedPath = await window.electronAPI.fetchUploadedLocalPath(roomCode, att.id);
          }
          // Otherwise, query download history registry and shared media index
          if (!savedPath && window.electronAPI?.fetchMediaLocalPath) {
            savedPath = await window.electronAPI.fetchMediaLocalPath(att.id, roomCode);
          }

          if (savedPath) {
            updatedProgressUpdates[att.id] = {
              progress: 100,
              done: true,
              localPath: savedPath,
            };
          } else if (
            !att.isMyMessage && // Never auto-download own files that already exist on disk
            isAutoEnabled &&
            window.electronAPI?.downloadFile &&
            roomCode &&
            !autoDownloadingIdsRef.current.has(att.id)
          ) {
            const fileSize = typeof att.size === "number" ? att.size : 0;
            if (fileSize <= maxBytes) {
              pendingAutoDownloads.push(att);
            }
          }
        } catch (e) {
          console.error("Error consultando ruta local de adjunto:", e);
        }
      }

      if (Object.keys(updatedProgressUpdates).length > 0) {
        setFileProgress((prev) => ({
          ...prev,
          ...updatedProgressUpdates,
        }));
      }

      if (pendingAutoDownloads.length > 0) {
        for (const att of pendingAutoDownloads) {
          if (autoDownloadingIdsRef.current.has(att.id)) continue;
          autoDownloadingIdsRef.current.add(att.id);
          try {
            const res = await window.electronAPI.downloadFile(roomCode, att.id, att.name, att.size, {
              autoDownload: true,
              customDir: downloadDir,
            });
            if (res?.done && res?.filePath) {
              setFileProgress((prev) => ({
                ...prev,
                [att.id]: {
                  progress: 100,
                  done: true,
                  localPath: res.filePath,
                },
              }));
            }
          } catch (e) {
            console.warn("[AutoDownload] Error auto-descargando archivo:", att.name, e);
            autoDownloadingIdsRef.current.delete(att.id);
          }
        }
      }
    };

    checkDownloadsAndAutoDownload();
  }, [messages, roomCode, profile?.id, profile?.nickname]);

  // Main chat synchronization and history loading
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    if (!roomCode || !channelId) {
      setLoading(false);
      return;
    }

    const processHistoryWithReactions = (rawHistory) => {
      if (!Array.isArray(rawHistory)) return [];
      const reactionsMap = {};
      const pluginActionsMap = {};
      const cleanMessages = [];
      const byId = new Map();
      const pinnedSet = new Set();

      for (const msg of rawHistory) {
        if (msg.text && msg.text.startsWith("[REACTION_ACTION]:")) {
          try {
            const payloadStr = msg.text.replace("[REACTION_ACTION]:", "");
            const { messageId, emoji, userId } = JSON.parse(payloadStr);
            if (!reactionsMap[messageId]) reactionsMap[messageId] = {};
            if (!reactionsMap[messageId][emoji]) reactionsMap[messageId][emoji] = [];
            const userList = reactionsMap[messageId][emoji];
            const idx = userList.indexOf(userId);
            if (idx >= 0) {
              userList.splice(idx, 1);
            } else {
              userList.push(userId);
            }
            if (userList.length === 0) delete reactionsMap[messageId][emoji];
          } catch (e) {
            console.error("Error procesando reacción en historial:", e);
          }
        } else if (msg.text && msg.text.startsWith("[PLUGIN_ACTION]:")) {
          try {
            const payloadStr = msg.text.replace("[PLUGIN_ACTION]:", "");
            const { pluginId, action, targetId, data } = JSON.parse(payloadStr);
            if (targetId && action && data) {
              if (!pluginActionsMap[targetId]) pluginActionsMap[targetId] = [];
              pluginActionsMap[targetId].push({ pluginId, action, data });
            }
          } catch (e) {
            console.error("Error procesando PLUGIN_ACTION en historial:", e);
          }
        } else if (msg.text && msg.text.startsWith("[PIN_ACTION]:")) {
          try {
            const payloadStr = msg.text.replace("[PIN_ACTION]:", "");
            const { messageId, isPinned } = JSON.parse(payloadStr);
            if (isPinned) {
              pinnedSet.add(messageId);
            } else {
              pinnedSet.delete(messageId);
            }
          } catch (e) {
            console.error("Error procesando PIN_ACTION en historial:", e);
          }
        } else if (msg.text && msg.text.startsWith("[EDIT_MESSAGE]:")) {
          try {
            const payloadStr = msg.text.replace("[EDIT_MESSAGE]:", "");
            const { messageId, newText } = JSON.parse(payloadStr);
            const targetMsg = byId.get(messageId);
            if (targetMsg) {
              targetMsg.text = newText;
              targetMsg.edited = true;
            }
          } catch (e) {
            console.error("Error procesando EDIT_MESSAGE en historial:", e);
          }
        } else {
          const normalized = normalizeChatMessage(msg);
          cleanMessages.push(normalized);
          if (normalized.id) {
            byId.set(normalized.id, normalized);
          }
        }
      }

      setPinnedMsgIds(Array.from(pinnedSet));

      return cleanMessages.map((msg) => {
        let updatedMsg = msg;
        if (reactionsMap[msg.id] && Object.keys(reactionsMap[msg.id]).length > 0) {
          updatedMsg = { ...updatedMsg, reactions: reactionsMap[msg.id] };
        }
        if (updatedMsg.text && updatedMsg.text.startsWith("[PLUGIN_EMBED]:")) {
          try {
            const jsonStr = updatedMsg.text.substring("[PLUGIN_EMBED]:".length);
            const embedPayload = JSON.parse(jsonStr);

            const targetKey = embedPayload.data?.pollId || msg.id;
            const actions = pluginActionsMap[targetKey];

            if (actions && actions.length > 0) {
              if (embedPayload.type === "poll" && embedPayload.data) {
                const votesMap = {};
                actions.forEach((act) => {
                  if (act.action === "VOTE" && act.data?.voter?.id) {
                    votesMap[act.data.voter.id] = act.data;
                  }
                });

                embedPayload.data.options = (embedPayload.data.options || []).map((opt) => {
                  const votersMap = {};
                  (opt.voters || []).forEach((v) => {
                    if (v?.id) votersMap[v.id] = v;
                  });

                  Object.values(votesMap).forEach(({ optionId, voter }) => {
                    if (optionId === opt.id) {
                      votersMap[voter.id] = voter;
                    } else {
                      delete votersMap[voter.id];
                    }
                  });

                  return { ...opt, voters: Object.values(votersMap) };
                });
              }

              updatedMsg = {
                ...updatedMsg,
                text: `[PLUGIN_EMBED]:${JSON.stringify(embedPayload)}`,
              };
            }
          } catch (e) {
            console.error("Error reconsolidando PLUGIN_EMBED:", e);
          }
        }
        return updatedMsg;
      });
    };

    const fetchFreshHistory = (showLoading = true) => {
      if (showLoading) {
        setLoading(true);
      }

      api
        .getChatHistory(roomCode, channelId)
        .then((history) => {
          const raw = history || [];
          const historialMensajes = processHistoryWithReactions(raw);
          const sortedHistory = [...historialMensajes].sort(
            (a, b) => (a.timestamp || 0) - (b.timestamp || 0)
          );
          setMessages(sortedHistory);
          setVisibleCount?.(Math.min(40, historialMensajes.length));
          if (showLoading) {
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error("Error cargando historial", err);
          if (showLoading) {
            setLoading(false);
          }
        });
    };

    fetchFreshHistory(true);

    const unsubRoomJoined = api.onRoomJoined?.((data) => {
      if (data?.code === roomCode) fetchFreshHistory(false);
    });

    const unsubRoomCreated = api.onRoomCreated?.((data) => {
      if (data?.code === roomCode) fetchFreshHistory(false);
    });

    const unsubSyncComplete = api.onSyncComplete?.((data) => {
      if (data?.type === "sticker_pack_imported" || data?.type === "sticker_imported") return;
      fetchFreshHistory(false);
    });

    const unsub = api.onChatMessage(async (msg) => {
      if (
        msg.roomCode !== roomCode ||
        (msg.channelId || "general") !== channelId
      )
        return;

      if (msg.text?.startsWith("[REACTION_ACTION]:")) {
        if (msg.authorId === profile?.id || msg.authorId === "self") return;

        try {
          const payloadStr = msg.text.replace("[REACTION_ACTION]:", "");
          const { messageId, emoji, userId } = JSON.parse(payloadStr);
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== messageId) return m;
              const currentReactions = m.reactions ? { ...m.reactions } : {};
              const userList = currentReactions[emoji] ? [...currentReactions[emoji]] : [];
              const idx = userList.indexOf(userId);
              if (idx >= 0) {
                userList.splice(idx, 1);
              } else {
                userList.push(userId);
              }
              if (userList.length === 0) delete currentReactions[emoji];
              else currentReactions[emoji] = userList;
              return { ...m, reactions: currentReactions };
            })
          );
        } catch (err) {
          console.error("Error procesando reacción remota:", err);
        }
        return;
      }

      if (msg.text?.startsWith("[EDIT_MESSAGE]:")) {
        try {
          const payloadStr = msg.text.replace("[EDIT_MESSAGE]:", "");
          const { messageId, newText } = JSON.parse(payloadStr);
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === messageId) {
                return { ...m, text: newText, edited: true };
              }
              return m;
            })
          );
        } catch (err) {
          console.error("Error procesando EDIT_MESSAGE remota:", err);
        }
        return;
      }

      if (msg.text?.startsWith("[PIN_ACTION]:")) {
        try {
          const payloadStr = msg.text.replace("[PIN_ACTION]:", "");
          const { messageId, isPinned } = JSON.parse(payloadStr);
          setPinnedMsgIds((prev) => {
            if (isPinned) {
              return prev.includes(messageId) ? prev : [...prev, messageId];
            } else {
              return prev.filter((id) => id !== messageId);
            }
          });
        } catch (err) {
          console.error("Error procesando PIN_ACTION remota:", err);
        }
        return;
      }

      if (msg.text?.startsWith("[PLUGIN_ACTION]:")) {
        try {
          const payloadStr = msg.text.replace("[PLUGIN_ACTION]:", "");
          const { pluginId, action, targetId, data } = JSON.parse(payloadStr);

          if (targetId && action && data) {
            setMessages((prevMsgs) =>
              prevMsgs.map((m) => {
                if (!m.text || !m.text.startsWith("[PLUGIN_EMBED]:")) return m;

                try {
                  const jsonStr = m.text.substring("[PLUGIN_EMBED]:".length);
                  const embedPayload = JSON.parse(jsonStr);
                  const pollId = embedPayload.data?.pollId || m.id;

                  if (pollId !== targetId && m.id !== targetId) return m;

                  if (embedPayload.type === "poll" && embedPayload.data) {
                    const { optionId, voter } = data;
                    if (!voter || !voter.id) return m;

                    embedPayload.data.options = (embedPayload.data.options || []).map((opt) => {
                      const filteredVoters = (opt.voters || []).filter(
                        (v) => v.id !== voter.id
                      );
                      if (opt.id === optionId) {
                        filteredVoters.push(voter);
                      }
                      return { ...opt, voters: filteredVoters };
                    });

                    return {
                      ...m,
                      text: `[PLUGIN_EMBED]:${JSON.stringify(embedPayload)}`,
                    };
                  }
                } catch (e) {
                  console.error("Error actualizando PLUGIN_EMBED con acción remota:", e);
                }
                return m;
              })
            );
          }
        } catch (err) {
          console.error("Error procesando PLUGIN_ACTION en tiempo real:", err);
        }
        return;
      }

      let rawNudgeText = msg.text || "";
      if (typeof rawNudgeText === "string" && rawNudgeText.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(rawNudgeText);
          if (parsed.body) rawNudgeText = parsed.body;
        } catch {}
      }

      if (typeof rawNudgeText === "string" && (rawNudgeText.includes("[NUDGE_MESSAGE]") || rawNudgeText.startsWith("[NUDGE_MESSAGE]"))) {
        const payloadNudge = rawNudgeText.replace(/.*\[NUDGE_MESSAGE\]:/, "");
        let debeVibrar = false;

        if (payloadNudge === "ALL") {
          debeVibrar = true;
        } else if (payloadNudge.startsWith("USER:")) {
          const targetNick = payloadNudge.replace("USER:", "").toLowerCase();
          if (profile?.nickname?.toLowerCase() === targetNick) {
            debeVibrar = true;
          }
        }

        if (debeVibrar) {
          setIsNudging(true);
          setTimeout(() => setIsNudging(false), 500);
        }

        return;
      }

      if (msg.authorId !== profile?.id && msg.authorId !== "self") {
        const textLower = (msg.text || "").toLowerCase();
        const myNickLower = (profile?.nickname || "").toLowerCase();
        const isDirectMention = myNickLower && textLower.includes(`@${myNickLower}`);

        const currentServer = serverRef.current || server;
        const myRoleIds = Array.isArray(currentServer?.userRoles?.[profile?.id])
          ? currentServer.userRoles[profile.id]
          : (currentServer?.userRoles?.[profile?.id] ? [currentServer.userRoles[profile.id]] : []);

        const myRoleNames = (currentServer?.roles || [])
          .filter((r) => myRoleIds.includes(r.id))
          .map((r) => r.name?.toLowerCase());

        const isRoleMention = myRoleNames.some((rName) => rName && textLower.includes(`@${rName}`));

        const notifMode = localStorage.getItem(`channel_notif_mode_${channelId}`) || "all";

        const currentChannel = currentServer?.channels?.find((c) => c.id === channelId);
        let channelName = currentChannel?.name || null;
        if (!channelName) {
          if (channelId && channelId.startsWith("dm_")) {
            channelName = "Mensaje directo";
          } else if (channelId && channelId.startsWith("thread_")) {
            channelName = msg.title || "Hilo";
          }
        }
        const serverName = currentServer?.name;

        const senderInfo = getNotificationAuthor(msg, currentServer, profile);
        const senderNickname = senderInfo.nickname;
        const senderAvatar = senderInfo.avatar;

        let displayNotifText = msg.text;
        if (typeof msg.text === "string" && msg.text.startsWith("[PLUGIN_EMBED]:")) {
          try {
            const parsed = JSON.parse(msg.text.slice(15));
            if (parsed.type === "activity_invite" && parsed.data) {
              displayNotifText = parsed.data.subtitle || `Te invita a ${parsed.data.title}`;
            } else if (parsed.type === "poll" && parsed.data) {
              displayNotifText = `Encuesta: ${parsed.data.question}`;
            }
          } catch (_) {}
        }

        if (notifMode === "nothing") {
          // Muted, do not trigger anything
        } else if (notifMode === "mentions") {
          if (isDirectMention || isRoleMention) {
            notificationManager.trigger("MENTION", {
              nickname: senderNickname,
              avatar: senderAvatar,
              text: displayNotifText,
              roomCode: currentServer?.roomCode || msg.roomCode,
              channelId: channelId || msg.channelId || "general",
              serverId: currentServer?.id || msg.serverId,
              serverName,
              channelName,
            });
          }
        } else {
          if (isDirectMention || isRoleMention) {
            notificationManager.trigger("MENTION", {
              nickname: senderNickname,
              avatar: senderAvatar,
              text: displayNotifText,
              roomCode: currentServer?.roomCode || msg.roomCode,
              channelId: channelId || msg.channelId || "general",
              serverId: currentServer?.id || msg.serverId,
              serverName,
              channelName,
            });
          } else {
            notificationManager.trigger("RECEIVE_MESSAGE", {
              nickname: senderNickname,
              avatar: senderAvatar,
              text: displayNotifText,
              isCurrentChannel: document.hasFocus(),
              roomCode: currentServer?.roomCode || msg.roomCode,
              channelId: channelId || msg.channelId || "general",
              serverId: currentServer?.id || msg.serverId,
              serverName,
              channelName,
            });
          }
        }
      }

      setTypingUsers((prev) => {
        const next = { ...prev };
        if (next[msg.authorId]) {
          clearTimeout(next[msg.authorId].timeoutId);
          delete next[msg.authorId];
        }
        return next;
      });

      const normalizedMsg = normalizeChatMessage(msg);

      setMessages((prev) => {
        if (prev.some((m) => m.id === normalizedMsg.id)) return prev;

        const optimisticIdx = prev.findIndex(
          (m) =>
            m.isOptimistic &&
            (m.authorId === normalizedMsg.authorId || m.authorId === "self" || m.authorId === profile?.id) &&
            (
              m.text === normalizedMsg.text ||
              m.text === msg.text ||
              (m.rawText && (m.rawText === normalizedMsg.rawText || m.rawText === msg.text)) ||
              (normalizedMsg.rawText && m.text === normalizedMsg.rawText) ||
              normalizeChatMessage(m).text === normalizedMsg.text
            )
        );

        let nuevoFeed;
        if (optimisticIdx !== -1) {
          nuevoFeed = [...prev];
          const oldOpt = prev[optimisticIdx];
          nuevoFeed[optimisticIdx] = {
            ...normalizedMsg,
            clientTempId: oldOpt.id,
          };
        } else {
          nuevoFeed = [...prev, normalizedMsg].sort(
            (a, b) => a.timestamp - b.timestamp,
          );
          setVisibleCount?.((v) => v + 1);
        }

        return nuevoFeed;
      });
    });

    const unsubDeleted = api.onChatMessageDeleted?.((deletedId) => {
      setMessages((prev) => prev.filter((m) => m.id !== deletedId));
      soundEngine.playCue("delete");
    });

    const unsubTyping = api.onUserTyping?.((data) => {
      const targetUserId = data.userId;
      if (
        data.channelId !== channelId ||
        !targetUserId ||
        targetUserId === profile?.id
      )
        return;

      soundEngine.playTyping();

      setTypingUsers((prev) => {
        const next = { ...prev };
        if (next[targetUserId]) clearTimeout(next[targetUserId].timeoutId);

        const timeoutId = setTimeout(() => {
          setTypingUsers((current) => {
            const updated = { ...current };
            delete updated[targetUserId];
            return updated;
          });
        }, 5000);

        next[targetUserId] = {
          nickname: data.nickname || "Alguien",
          timeoutId,
        };
        return next;
      });
    });

    return () => {
      unsubRoomJoined?.();
      unsubRoomCreated?.();
      unsubSyncComplete?.();
      unsub?.();
      unsubDeleted?.();
      unsubTyping?.();
      if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
      setTypingUsers((current) => {
        Object.values(current).forEach((u) => clearTimeout(u.timeoutId));
        return {};
      });
    };
  }, [roomCode, channelId, profile?.id, profile?.nickname, server?.id, messagesCountRef, setVisibleCount, bottomRef, chatContainerRef]);

  // Historical full-text search across all messages and channels
  useEffect(() => {
    if (!searchQuery || !searchQuery.trim() || !roomCode) {
      setHistoricalSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        if (window.electronAPI?.searchChatMessages) {
          const results = await window.electronAPI.searchChatMessages(
            roomCode,
            searchQuery,
            { channelId, limit: 100 }
          );
          if (Array.isArray(results)) {
            setHistoricalSearchResults(results);
          }
        }
      } catch (err) {
        console.error("[useChatMessages] Search error:", err);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [searchQuery, roomCode, channelId]);

  const candidateMessages = useMemo(() => {
    if (!searchQuery || !searchQuery.trim() || historicalSearchResults.length === 0) {
      return messages;
    }
    const existingIds = new Set(messages.map((m) => m.id));
    const newItems = historicalSearchResults.filter((m) => !existingIds.has(m.id));
    if (newItems.length === 0) return messages;
    const combined = [...messages, ...newItems];
    combined.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return combined;
  }, [messages, historicalSearchResults, searchQuery]);

  const parsedSearchQuery = useMemo(
    () => parseClientSearchQuery(searchQuery),
    [searchQuery]
  );

  const filteredMessages = useMemo(() => {
    let result = candidateMessages;

    const enabledPluginIds = new Set(
      (server?.plugins || [])
        .filter((p) => p.enabled !== false)
        .map((p) => p.id)
    );

    result = result.filter((msg) => {
      if (!msg) return false;
      const normalized = normalizeChatMessage(msg);
      if (normalized.isNudge) return false;
      if (normalized.isComplement) {
        const pluginId = normalized.complementId || (normalized.authorId && normalized.authorId.startsWith("bot_") ? normalized.authorId.slice(4) : null);
        if (pluginId && !enabledPluginIds.has(pluginId)) {
          return false;
        }
      }
      return true;
    });

    if (!parsedSearchQuery) return result;
    return result.filter((msg) => matchParsedSearchQuery(msg, parsedSearchQuery));
  }, [candidateMessages, parsedSearchQuery, server?.plugins]);

  const mainStreamMessages = useMemo(() => {
    return filteredMessages.filter((m) => {
      if (!m) return false;
      const normalized = normalizeChatMessage(m);
      return !normalized.threadParentId;
    });
  }, [filteredMessages]);

  return {
    messages,
    setMessages,
    loading,
    fileProgress,
    setFileProgress,
    pinnedMsgIds,
    setPinnedMsgIds,
    typingUsers,
    isNudging,
    filteredMessages,
    mainStreamMessages,
  };
}
