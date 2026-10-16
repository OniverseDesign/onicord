import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { notificationManager } from "../lib/notificationManager";
import { soundEngine } from "../lib/soundEngine";

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
  const focusTimeoutRef = useRef(null);

  const onMessagesUpdateRef = useRef(onMessagesUpdate);
  useEffect(() => {
    onMessagesUpdateRef.current = onMessagesUpdate;
  });

  useEffect(() => {
    onMessagesUpdateRef.current?.(messages);
  }, [messages]);

  useEffect(() => {
    if (messagesCountRef) messagesCountRef.current = 0;
  }, [channelId, roomCode, messagesCountRef]);

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
  }, [messages]);

  // Plugin outbound messages
  useEffect(() => {
    if (window.electronAPI?.onPluginChatMessageOutbound) {
      const cleanup = window.electronAPI.onPluginChatMessageOutbound(({ pluginId, message }) => {
        const msgData = message || {};
        const msgObj = {
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
        };
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

  // Historical file downloads check
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    const checkHistoricalDownloads = async () => {
      const updatedProgressUpdates = {};

      for (const msg of messages) {
        if (msg.text?.includes("[FILE_ATTACHMENT]:")) {
          try {
            const parts = msg.text.split("[FILE_ATTACHMENT]:");
            const fileData = JSON.parse(parts[1]);

            if (fileData && fileData.id) {
              const savedPath = await window.electronAPI.fetchMediaLocalPath(
                fileData.id,
              );
              if (savedPath) {
                updatedProgressUpdates[fileData.id] = {
                  progress: 100,
                  done: true,
                  localPath: savedPath,
                };
              }
            }
          } catch (e) {
            console.error("Error procesando meta histórico:", e);
          }
        }
      }

      if (Object.keys(updatedProgressUpdates).length > 0) {
        setFileProgress((prev) => ({
          ...prev,
          ...updatedProgressUpdates,
        }));
      }
    };

    checkHistoricalDownloads();
  }, [messages]);

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
              setPinnedMsgIds((prev) => (prev.includes(messageId) ? prev : [...prev, messageId]));
            } else {
              setPinnedMsgIds((prev) => prev.filter((id) => id !== messageId));
            }
          } catch (e) {
            console.error("Error procesando PIN_ACTION en historial:", e);
          }
        } else if (msg.text && msg.text.startsWith("[EDIT_MESSAGE]:")) {
          try {
            const payloadStr = msg.text.replace("[EDIT_MESSAGE]:", "");
            const { messageId, newText } = JSON.parse(payloadStr);
            const targetMsg = cleanMessages.find((m) => m.id === messageId);
            if (targetMsg) {
              targetMsg.text = newText;
              targetMsg.edited = true;
            }
          } catch (e) {
            console.error("Error procesando EDIT_MESSAGE en historial:", e);
          }
        } else {
          cleanMessages.push(msg);
        }
      }

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

    const fetchFreshHistory = () => {
      if (messagesCountRef && messagesCountRef.current === 0) {
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

          requestAnimationFrame(() => {
            setTimeout(() => {
              if (chatContainerRef?.current) {
                chatContainerRef.current.scrollTop =
                  chatContainerRef.current.scrollHeight;
              }
              setLoading(false);
              if (messagesCountRef) messagesCountRef.current = historialMensajes.length;
            }, 250);
          });
        })
        .catch((err) => {
          console.error("Error cargando historial", err);
          setLoading(false);
        });
    };

    fetchFreshHistory();

    const unsubRoomJoined = api.onRoomJoined?.((data) => {
      if (data?.code === roomCode) fetchFreshHistory();
    });

    const unsubRoomCreated = api.onRoomCreated?.((data) => {
      if (data?.code === roomCode) fetchFreshHistory();
    });

    const unsubSyncComplete = api.onSyncComplete?.((data) => {
      if (data?.type === "sticker_pack_imported") return;
      fetchFreshHistory();
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

        const myRoleIds = Array.isArray(server?.userRoles?.[profile?.id])
          ? server.userRoles[profile.id]
          : (server?.userRoles?.[profile?.id] ? [server.userRoles[profile.id]] : []);

        const myRoleNames = (server?.roles || [])
          .filter((r) => myRoleIds.includes(r.id))
          .map((r) => r.name?.toLowerCase());

        const isRoleMention = myRoleNames.some((rName) => rName && textLower.includes(`@${rName}`));

        const notifMode = localStorage.getItem(`channel_notif_mode_${channelId}`) || "all";

        if (notifMode === "nothing") {
          // Muted, do not trigger anything
        } else if (notifMode === "mentions") {
          if (isDirectMention || isRoleMention) {
            notificationManager.trigger("MENTION", {
              nickname: msg.authorName || msg.user?.nickname || "Alguien",
              text: msg.text,
            });
          }
        } else {
          if (isDirectMention || isRoleMention) {
            notificationManager.trigger("MENTION", {
              nickname: msg.authorName || msg.user?.nickname || "Alguien",
              text: msg.text,
            });
          } else {
            notificationManager.trigger("RECEIVE_MESSAGE", {
              nickname: msg.authorName || msg.user?.nickname || "Alguien",
              text: msg.text,
              isCurrentChannel: document.hasFocus(),
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

      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        const nuevoFeed = [...prev, msg].sort(
          (a, b) => a.timestamp - b.timestamp,
        );

        setVisibleCount?.((v) => v + 1);

        requestAnimationFrame(() => {
          bottomRef?.current?.scrollIntoView({ behavior: "smooth" });
        });

        if (messagesCountRef) messagesCountRef.current = nuevoFeed.length;
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
  }, [roomCode, channelId, profile?.id, profile?.nickname, server, messagesCountRef, setVisibleCount, bottomRef, chatContainerRef]);

  const filteredMessages = useMemo(() => {
    let result = messages;

    const enabledPluginIds = new Set(
      (server?.plugins || [])
        .filter((p) => p.enabled !== false)
        .map((p) => p.id)
    );

    result = result.filter((msg) => {
      if (!msg) return false;
      let checkText = msg.text || "";
      if (typeof checkText === "string" && checkText.trim().startsWith("{")) {
        try {
          const parsed = JSON.parse(checkText);
          if (parsed.body) checkText = parsed.body;
        } catch {}
      }
      if (typeof checkText === "string" && (checkText.includes("[NUDGE_MESSAGE]") || checkText.startsWith("[NUDGE_MESSAGE]"))) {
        return false;
      }
      if (msg.isComplement) {
        const pluginId = msg.complementId || (msg.authorId && msg.authorId.startsWith("bot_") ? msg.authorId.slice(4) : null);
        if (pluginId && !enabledPluginIds.has(pluginId)) {
          return false;
        }
      }
      return true;
    });

    if (!searchQuery) return result;
    const query = searchQuery.toLowerCase().trim();
    return result.filter((msg) => {
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
  }, [messages, searchQuery, server?.plugins]);

  const mainStreamMessages = useMemo(() => {
    return filteredMessages.filter((m) => {
      if (!m) return false;
      if (m.threadParentId) return false;
      if (typeof m.text === "string" && m.text.includes('"threadParentId"')) {
        try {
          const parsed = JSON.parse(m.text);
          if (parsed?.threadParentId) return false;
          if (typeof parsed?.body === "string" && parsed.body.includes('"threadParentId"')) {
            const inner = JSON.parse(parsed.body);
            if (inner?.threadParentId) return false;
          }
        } catch {}
      }
      return true;
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
