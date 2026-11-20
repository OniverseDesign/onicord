import { useEffect } from "react";
import { mergeWhiteboardElements } from "./whiteboardConstants";

function readBoardStorage(storageKey) {
  let clearedAt = 0;
  const map = new Map();
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.elements)
          ? parsed.elements
          : [];
      if (!Array.isArray(parsed) && typeof parsed?.clearedAt === "number") {
        clearedAt = parsed.clearedAt;
      }
      list.forEach((item) => {
        if (item?.id) map.set(item.id, item);
      });
    }
  } catch {
    // Ignore malformed storage
  }
  return { clearedAt, map };
}

function writeBoardStorage(storageKey, clearedAt, map) {
  try {
    const arr = Array.from(map.values()).slice(-800);
    localStorage.setItem(storageKey, JSON.stringify({ clearedAt, elements: arr }));
  } catch {
    // Ignore quota errors
  }
}

/**
 * Keeps all whiteboard channels of the active server synced in the background
 * even when the user is viewing another channel (e.g. text/voice).
 */
export function useWhiteboardBackgroundSync(
  roomCode,
  myId,
  activeWhiteboardChannelId,
  channels = []
) {
  // Proactively request sync for non-active whiteboard channels on server join / peer reconnect
  useEffect(() => {
    if (!roomCode || !myId || !window.electronAPI?.sendWhiteboardEvent) return;
    const wbChannels = (channels || []).filter(
      (c) => c.type === "whiteboard" && c.id !== activeWhiteboardChannelId
    );
    if (wbChannels.length === 0) return;

    const requestAll = () => {
      wbChannels.forEach((ch) => {
        window.electronAPI.sendWhiteboardEvent(
          {
            type: "sync:request",
            roomCode,
            channelId: ch.id,
            userId: myId,
          },
          roomCode
        );
      });
    };

    requestAll();
    const unsubPeer = window.electronAPI?.onPeerJoined?.(() => {
      requestAll();
    });
    return () => unsubPeer?.();
  }, [roomCode, myId, activeWhiteboardChannelId, channels]);

  // Listen for background whiteboard events for any inactive whiteboard channel
  useEffect(() => {
    if (!roomCode || !myId || !window.electronAPI?.onWhiteboardEvent) return;

    const unsub = window.electronAPI.onWhiteboardEvent((data) => {
      if (!data || data.roomCode !== roomCode || !data.channelId) return;
      if (data.userId === myId) return;
      // Active channel is handled directly by WhiteboardStage
      if (data.channelId === activeWhiteboardChannelId) return;

      const storageKey = `onicord_wb_${roomCode}_${data.channelId}`;

      if ((data.type === "op:upsert" || data.type === "op:delete") && data.element) {
        const { clearedAt, map } = readBoardStorage(storageKey);
        const next = mergeWhiteboardElements(map, [data.element]);
        if (next !== map) writeBoardStorage(storageKey, clearedAt, next);
      } else if (
        (data.type === "op:batch-upsert" || data.type === "op:batch-delete") &&
        Array.isArray(data.elements)
      ) {
        const { clearedAt, map } = readBoardStorage(storageKey);
        const next = mergeWhiteboardElements(map, data.elements);
        if (next !== map) writeBoardStorage(storageKey, clearedAt, next);
      } else if (data.type === "op:clear") {
        const clearTs = data.clearedAt || Date.now();
        writeBoardStorage(storageKey, clearTs, new Map());
      } else if (data.type === "sync:request") {
        const { clearedAt, map } = readBoardStorage(storageKey);
        const snapshot = Array.from(map.values());
        if (snapshot.length > 0 || clearedAt > 0) {
          window.electronAPI?.sendWhiteboardEvent?.(
            {
              type: "sync:state",
              roomCode,
              channelId: data.channelId,
              userId: myId,
              targetUserId: data.userId,
              elements: snapshot,
              clearedAt,
            },
            roomCode
          );
        }
      } else if (data.type === "sync:state" && Array.isArray(data.elements)) {
        if (data.targetUserId && data.targetUserId !== myId) return;
        const { clearedAt, map } = readBoardStorage(storageKey);
        const remoteClearedAt = typeof data.clearedAt === "number" ? data.clearedAt : 0;
        const nextClearedAt = Math.max(clearedAt, remoteClearedAt);
        let base = map;
        if (remoteClearedAt > 0) {
          base = new Map();
          map.forEach((el, k) => {
            if ((el.updatedAt || 0) >= remoteClearedAt) base.set(k, el);
          });
        }
        const next = mergeWhiteboardElements(base, data.elements);
        writeBoardStorage(storageKey, nextClearedAt, next);
      }
    });

    return () => unsub?.();
  }, [roomCode, myId, activeWhiteboardChannelId]);
}
