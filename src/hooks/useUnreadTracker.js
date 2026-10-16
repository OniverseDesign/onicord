import { useState, useEffect, useCallback } from "react";
import { notificationManager } from "../lib/notificationManager";

export function useUnreadTracker(activeRoomCode, activeChannelId, profileId) {
  const [unreads, setUnreads] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("onicord_unreads") || "{}");
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem("onicord_unreads", JSON.stringify(unreads));
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
      const { roomCode, channelId, count } = e.detail || {};
      if (roomCode && channelId) {
        const key = `${roomCode}_${channelId}`;
        setUnreads((prev) => ({
          ...prev,
          [key]: count !== undefined ? count : (prev[key] || 0) + 1,
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

      const isCurrent =
        msg.roomCode === activeRoomCode &&
        (msg.channelId || "general") === activeChannelId;

      if (!isCurrent) {
        const key = `${msg.roomCode}_${msg.channelId || "general"}`;

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
          notificationManager.trigger("RECEIVE_MESSAGE", {
            isCurrentChannel: false,
          });
        }
      }
    });

    return () => unsub?.();
  }, [activeRoomCode, activeChannelId, profileId]);

  const getServerUnreadCount = useCallback(
    (roomCode) => {
      if (!roomCode) return 0;

      try {
        const muted = JSON.parse(localStorage.getItem("onicord_muted_servers") || "[]");
        if (Array.isArray(muted) && muted.includes(roomCode)) {
          return 0;
        }
      } catch (err) {}

      return Object.entries(unreads)
        .filter(([key]) => key.startsWith(`${roomCode}_`))
        .reduce((total, [_, count]) => total + count, 0);
    },
    [unreads],
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

  return { getServerUnreadCount, getChannelUnreadCount, markChannelAsRead };
}
