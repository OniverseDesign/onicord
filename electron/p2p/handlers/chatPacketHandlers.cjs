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

  return false;
}

module.exports = { handleChatPacket };
