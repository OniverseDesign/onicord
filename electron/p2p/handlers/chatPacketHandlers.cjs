"use strict";

/**
 * Chat and real-time canvas packet handler.
 * Dispatches: 'chat', 'chat-delete', 'delete-msg', 'typing-state', 'sketch-draw'.
 */
async function handleChatPacket(roomManager, peerId, type, payload) {
  if (type === "typing-state" && payload) {
    roomManager._callbacks.onUserTyping?.({
      userId: payload.userId,
      channelId: payload.channelId,
      nickname: payload.nickname,
    });
    return true;
  }

  if (type === "chat" && payload) {
    roomManager.chatService.handleIncomingChat(payload, peerId).catch((err) =>
      console.error("[p2p] chat error", err.message)
    );
    return true;
  }

  if ((type === "chat-delete" || type === "delete-msg") && payload) {
    roomManager.chatService.handleIncomingChatDelete(payload, peerId).catch((err) =>
      console.error("[p2p] chat-delete error", err.message)
    );
    return true;
  }

  if (type === "sketch-draw" && payload) {
    global.mainWindow?.webContents.send("sketch:draw", payload);
    return true;
  }

  if (type === "whiteboard-event" && payload) {
    roomManager.persistWhiteboardPayload?.(payload, payload.roomCode);
    if (payload.type === "sync:request" && payload.channelId) {
      const store = roomManager._getWhiteboardStore?.();
      if (store) {
        const snap = store.loadChannel(
          payload.roomCode || roomManager.roomCode,
          payload.channelId
        );
        if (snap.elements.length > 0 || snap.clearedAt > 0) {
          roomManager.sendWhiteboardEvent(
            {
              type: "sync:state",
              roomCode: payload.roomCode || roomManager.roomCode,
              channelId: payload.channelId,
              userId: payload.userId ? `sqlite-${roomManager.p2pService?._resolveLocalPeerId() || "host"}` : "sqlite-host",
              targetUserId: payload.userId,
              elements: snap.elements,
              clearedAt: snap.clearedAt,
            },
            payload.roomCode || roomManager.roomCode
          );
        }
      }
    }
    global.mainWindow?.webContents.send("whiteboard:event", {
      ...payload,
      fromPeerId: peerId,
    });
    return true;
  }

  return false;
}

module.exports = { handleChatPacket };
