const { app, ipcMain } = require("electron");
const cryptoService = require("../../services/cryptoService.cjs");
const serverService = require("../../services/serverService.cjs");
const profileService = require("../../services/profileService.cjs");
const { ChatStore } = require("../../p2p/chatStore.cjs");

const ensureActiveRoom = async (roomCode) => {
  if (global.roomManager && global.roomManager.roomCode) {
    return global.roomManager;
  }

  const lastActive = await serverService.getLastActive();
  const targetId = lastActive?.id || (roomCode ? String(roomCode).trim().toUpperCase() : null);

  if (targetId && global.roomManager) {
    try {
      console.log(`[IPC Auto-Recovery] Re-entering room for active server: ${targetId}`);
      const profile = profileService.getProfile();
      await serverService.enterServer(targetId, profile, global.roomManager);
      return global.roomManager;
    } catch (err) {
      console.error("[IPC Auto-Recovery] Error re-entering room:", err);
    }
  }
  return global.roomManager;
};

function registerChatHandlers() {
  ipcMain.handle("chat:history", async (_event, roomCode, channelId) => {
    const code = roomCode || global.roomManager?.roomCode;
    if (!code) return [];

    let history = [];
    if (global.roomManager && global.roomManager.chatService) {
      history = await global.roomManager.chatService.getChatHistory(code, channelId);
    } else {
      const chatStore = new ChatStore(app.getPath("userData"));
      const rows = await chatStore.load(code, channelId || "general");
      history = rows.map((r) => ({
        id: r.id,
        channelId: r.channelId || channelId || "general",
        authorId: r.authorId,
        authorNickname: r.authorNickname,
        authorAvatar: r.authorAvatar,
        text: r.text,
        timestamp: r.timestamp,
        filePath: r.filePath,
        fileName: r.fileName,
        fileSize: r.fileSize,
        fileType: r.fileType,
        isSystemMessage: r.isSystemMessage,
        isComplement: r.isComplement,
        complementName: r.complementName,
        isWebhook: r.isWebhook,
        webhookId: r.webhookId,
        embeds: r.embeds,
      }));
    }

    return history.map((msg) => ({
      ...msg,
      text: cryptoService.decrypt(code, msg.text),
    }));
  });

  ipcMain.handle("chat:send", async (_event, roomCode, channelId, text) => {
    await ensureActiveRoom(roomCode);
    if (!global.roomManager || !global.roomManager.roomCode) throw new Error("No active room found");
    const code = roomCode || global.roomManager.roomCode;
    const encryptedText = cryptoService.encrypt(code, text);
    return await global.roomManager.sendChatMessage(channelId, encryptedText, code);
  });

  ipcMain.handle("chat:send-plugin-command", async (_event, roomCode, channelId, text) => {
    await ensureActiveRoom(roomCode);
    if (!global.roomManager || !global.roomManager.roomCode) throw new Error("No active room found");
    const code = roomCode || global.roomManager.roomCode;
    const encryptedText = cryptoService.encrypt(code, text);
    return await global.roomManager.chatService.sendPluginCommand(channelId, encryptedText, code);
  });

  ipcMain.handle("chat:setTyping", async (_event, channelId, roomCode) => {
    if (!global.roomManager) return { ok: false };
    global.roomManager.sendTypingState(channelId, roomCode);
    return { ok: true };
  });

  ipcMain.handle("chat:delete", async (_event, roomCode, channelId, messageId) => {
    if (!global.roomManager) throw new Error("No active room found");
    return await global.roomManager.deleteChatMessage(channelId, messageId, roomCode);
  });

  ipcMain.handle("sketch:sendDraw", async (_event, payload) => {
    if (!global.roomManager) return { success: false };
    global.roomManager.sendSketchDraw(payload);
    return { success: true };
  });

  ipcMain.handle("chat:search", async (_event, roomCode, query, options = {}) => {
    const code = roomCode || global.roomManager?.roomCode;
    if (!code || !query || typeof query !== "string") return [];

    let chatStore = null;
    if (global.roomManager && global.roomManager.chatService) {
      chatStore = global.roomManager.chatService.chatStore;
    }
    if (!chatStore) {
      chatStore = new ChatStore(app.getPath("userData"));
    }

    try {
      const { getSearchStore } = require("../../p2p/searchStore.cjs");
      const searchStore = getSearchStore(chatStore);
      return await searchStore.search(code, query, options);
    } catch (err) {
      console.error("[IPC Chat Search Error]:", err);
      return [];
    }
  });
}

module.exports = { registerChatHandlers };
