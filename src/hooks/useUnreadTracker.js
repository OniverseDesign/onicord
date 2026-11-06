import { useState, useEffect, useCallback } from "react";
import { notificationManager } from "../lib/notificationManager";
import { updateAppBadge } from "../lib/badgeIconGenerator";
import { hasChannelAccess } from "../lib/permissionsHelper";
import { getNotificationAuthor } from "../lib/profileUtils";

/**
 * Hook to track, persist, and manage unread message counters across P2P servers and direct channels.
 * Enforces strict isolation boundaries:
 * - Direct messages (DMs) are filtered to only count if the local profile is a recipient.
 * - Server channels are checked against role-based visibility permissions via hasChannelAccess.
 * - Respects muted servers and updates OS app dock/taskbar badges accordingly.
 *
 * @param {string|null} activeRoomCode - Currently viewed room/server code
 * @param {string|null} activeChannelId - Currently viewed channel ID
 * @param {Object|string} profileOrId - Local user profile object or profile ID
 * @param {Array<Object>} [servers=[]] - Cached server list for permission checks
 * @returns {{
 *   getServerUnreadCount: (roomCode: string) => number,
 *   getChannelUnreadCount: (roomCode: string, channelId: string) => number,
 *   markChannelAsRead: (roomCode: string, channelId: string) => void,
 *   markServerAsRead: (roomCode: string) => void
 * }}
 */
export function useUnreadTracker(activeRoomCode, activeChannelId, profileOrId, servers = []) {
  const profileId = typeof profileOrId === "object" ? profileOrId?.id : profileOrId;
  const profileNickname = typeof profileOrId === "object" ? profileOrId?.nickname : null;

  const [unreads, setUnreads] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("onicord_unreads") || "{}");
      delete stored.test_channel;
      return stored;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const toPersist = { ...unreads };
    delete toPersist.test_channel;
    localStorage.setItem("onicord_unreads", JSON.stringify(toPersist));

    // Calculate total unread count while respecting muted servers
    let muted = [];
    try {
      muted = JSON.parse(localStorage.getItem("onicord_muted_servers") || "[]");
    } catch {}

    const total = Object.entries(unreads).reduce((acc, [key, count]) => {
      const roomCode = key.split("_")[0];
      if (Array.isArray(muted) && muted.includes(roomCode)) return acc;
      return acc + (Number(count) || 0);
    }, 0);

    updateAppBadge(total);
  }, [unreads]);

  useEffect(() => {
    if (activeRoomCode && activeChannelId) {
      const key = `${activeRoomCode}_${activeChannelId}`;
      if (unreads[key]) {
        setUnreads((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    }
  }, [activeRoomCode, activeChannelId, unreads]);

  useEffect(() => {
    const handleTestUnread = (e) => {
      const { roomCode, channelId, count, reset } = e.detail || {};
      if (reset) {
        try {
          localStorage.removeItem("onicord_unreads");
          localStorage.setItem("onicord_unreads", "{}");
        } catch (_) {}
        setUnreads({});
        updateAppBadge(0);
        return;
      }
      if (roomCode && channelId) {
        const key = `${roomCode}_${channelId}`;
        setUnreads((prev) => ({
          ...prev,
          [key]: count !== undefined ? count : (prev[key] || 0) + 1,
        }));
      } else if (count !== undefined) {
        setUnreads((prev) => ({
          ...prev,
          test_channel: count,
        }));
      }
    };
    window.addEventListener("onicord:test-unread", handleTestUnread);
    return () => window.removeEventListener("onicord:test-unread", handleTestUnread);
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const unsub = api.onChatMessage((msg) => {
      if (
        msg.authorId === profileId ||
        msg.authorId === "self" ||
        msg.text?.includes("[MUSIC_ACTION]") ||
        msg.text?.includes("[NUDGE_MESSAGE]")
      )
        return;

      const rawChannelId = msg.channelId || "general";

      const isCurrent =
        msg.roomCode === activeRoomCode &&
        rawChannelId === activeChannelId;

      if (!isCurrent) {
        // 1. If direct message (DM) channel, verify it belongs to current user
        if (rawChannelId.startsWith("dm_")) {
          const parts = rawChannelId.slice(3).split("_");
          if (profileId && parts.length >= 2 && !parts.includes(profileId)) {
            return;
          }
        }

        // 2. If channel belongs to a known server, verify access permissions
        const targetServer = servers?.find(
          (s) =>
            (msg.roomCode && s.roomCode?.toUpperCase() === msg.roomCode.toUpperCase()) ||
            (msg.serverId && String(s.id).toUpperCase() === String(msg.serverId).toUpperCase())
        );

        if (targetServer && !rawChannelId.startsWith("dm_")) {
          const targetChannel = targetServer?.channels?.find(
            (c) => c.id === rawChannelId
          );
          // If channel exists but user lacks view permissions, ignore
          if (targetChannel && !hasChannelAccess(targetServer, targetChannel, profileId)) {
            return;
          }
        }

        const key = `${msg.roomCode}_${rawChannelId}`;

        setUnreads((prev) => ({
          ...prev,
          [key]: (prev[key] || 0) + 1,
        }));

        let isMuted = false;
        try {
          const muted = JSON.parse(localStorage.getItem("onicord_muted_servers") || "[]");
          isMuted = Array.isArray(muted) && muted.includes(msg.roomCode);
        } catch (err) {}

        if (!isMuted) {
          const targetChannel = targetServer?.channels?.find(
            (c) => c.id === rawChannelId
          );

          let channelName = targetChannel?.name || null;
          if (!channelName) {
            if (rawChannelId && rawChannelId.startsWith("dm_")) {
              channelName = "Mensaje directo";
            } else if (rawChannelId && rawChannelId.startsWith("thread_")) {
              channelName = msg.title || "Hilo";
            }
          }
          const serverName = targetServer?.name;

          const profileObj = typeof profileOrId === "object" ? profileOrId : null;
          const senderInfo = getNotificationAuthor(msg, targetServer, profileObj);
          const senderNickname = senderInfo.nickname;
          const senderAvatar = senderInfo.avatar;

          const textLower = (msg.text || "").toLowerCase();
          const myName = (profileNickname || "").toLowerCase();
          const isDirectMention =
            (myName && textLower.includes(`@${myName}`)) ||
            (profileId && (textLower.includes(`<@${profileId}>`) || textLower.includes(`@${profileId}`))) ||
            textLower.includes("@everyone") ||
            textLower.includes("@here");

          if (isDirectMention) {
            notificationManager.trigger("MENTION", {
              nickname: senderNickname,
              avatar: senderAvatar,
              text: msg.text,
              roomCode: msg.roomCode,
              channelId: msg.channelId || "general",
              serverId: targetServer?.id || msg.serverId,
              serverName,
              channelName,
            });
          } else {
            notificationManager.trigger("RECEIVE_MESSAGE", {
              nickname: senderNickname,
              avatar: senderAvatar,
              text: msg.text,
              isCurrentChannel: false,
              roomCode: msg.roomCode,
              channelId: msg.channelId || "general",
              serverId: targetServer?.id || msg.serverId,
              serverName,
              channelName,
            });
          }
        }
      }
    });

    return () => unsub?.();
  }, [activeRoomCode, activeChannelId, profileId, profileNickname, servers]);

  const getServerUnreadCount = useCallback(
    (roomCode) => {
      if (!roomCode) return 0;

      try {
        const muted = JSON.parse(localStorage.getItem("onicord_muted_servers") || "[]");
        if (Array.isArray(muted) && muted.includes(roomCode)) {
          return 0;
        }
      } catch (err) {}

      const targetServer = servers?.find(
        (s) => s.roomCode?.toUpperCase() === roomCode.toUpperCase()
      );

      return Object.entries(unreads)
        .filter(([key, count]) => {
          if (!key.startsWith(`${roomCode}_`) || !count) return false;
          const channelId = key.slice(roomCode.length + 1);

          // If DM, check whether it matches the local user
          if (channelId.startsWith("dm_")) {
            const parts = channelId.slice(3).split("_");
            if (profileId && parts.length >= 2 && !parts.includes(profileId)) {
              return false;
            }
            return true;
          }

          // If server has channels, exclude channels without access permissions
          if (targetServer?.channels && targetServer.channels.length > 0) {
            const ch = targetServer.channels.find((c) => c.id === channelId);
            if (ch && !hasChannelAccess(targetServer, ch, profileId)) {
              return false;
            }
          }
          return true;
        })
        .reduce((total, [_, count]) => total + count, 0);
    },
    [unreads, servers, profileId],
  );

  const getChannelUnreadCount = useCallback(
    (roomCode, channelId) => {
      if (!roomCode || !channelId) return 0;
      return unreads[`${roomCode}_${channelId}`] || 0;
    },
    [unreads],
  );

  const markChannelAsRead = useCallback((roomCode, channelId) => {
    if (!roomCode || !channelId) return;
    const key = `${roomCode}_${channelId}`;
    setUnreads((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const markServerAsRead = useCallback((roomCode) => {
    if (!roomCode) return;
    setUnreads((prev) => {
      const next = {};
      let changed = false;
      const prefix = `${roomCode}_`;
      for (const [k, v] of Object.entries(prev)) {
        if (k.startsWith(prefix)) {
          changed = true;
        } else {
          next[k] = v;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  // Listen for global mark-as-read event emitted from any component
  useEffect(() => {
    const handleGlobalMarkRead = (e) => {
      const { roomCode, channelId, all } = e.detail || {};
      if (all) {
        setUnreads({});
        return;
      }
      if (roomCode && channelId) {
        markChannelAsRead(roomCode, channelId);
      } else if (roomCode) {
        markServerAsRead(roomCode);
      }
    };
    window.addEventListener("onicord:mark-as-read", handleGlobalMarkRead);
    return () => window.removeEventListener("onicord:mark-as-read", handleGlobalMarkRead);
  }, [markChannelAsRead, markServerAsRead]);

  return { getServerUnreadCount, getChannelUnreadCount, markChannelAsRead, markServerAsRead };
}
