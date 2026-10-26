const { ipcMain } = require("electron");
const webhookService = require("../../services/webhookService.cjs");
const feedPollerService = require("../../services/feedPollerService.cjs");
const serverService = require("../../services/serverService.cjs");

function registerWebhookHandlers() {
  ipcMain.handle("webhook:getInfo", async () => {
    return {
      baseUrl: webhookService.getBaseUrl(),
      activePort: webhookService.activePort,
    };
  });

  ipcMain.handle("webhook:list", async (_event, roomCode) => {
    const code = roomCode || global.roomManager?.roomCode;
    if (!code || !global.roomManager?.roomMetaStore) return [];
    try {
      const list = await global.roomManager.roomMetaStore.getWebhooks(code, false);
      const baseUrl = webhookService.getBaseUrl();
      return list.map((w) => ({
        ...w,
        urlTemplate: `${baseUrl}/api/webhooks/${code}/${w.id}`,
      }));
    } catch (err) {
      console.error("[IPC Webhook List Error]:", err);
      return [];
    }
  });

  ipcMain.handle("webhook:create", async (_event, roomCode, webhookData) => {
    const code = roomCode || global.roomManager?.roomCode;
    if (!code || !global.roomManager?.roomMetaStore) {
      throw new Error("No active room found");
    }

    const myUserId = global.roomManager.p2pService?.profile?.id || "local";
    const { webhook, rawToken, meta } = await global.roomManager.roomMetaStore.addWebhook(
      code,
      webhookData,
      myUserId
    );

    // Broadcast meta update to peer swarm & update local serverStore
    try {
      global.roomManager.p2pService?._broadcast("meta-update", meta);
      const serverStore = serverService.getServerStore();
      const updatedServer = await serverStore.applySyncedMeta(code, meta);
      if (updatedServer) {
        global.mainWindow?.webContents.send("server:updated", updatedServer);
      }
    } catch (e) {
      console.error("[IPC Webhook Create Broadcast Error]:", e);
    }

    const baseUrl = webhookService.getBaseUrl();
    const fullUrl = `${baseUrl}/api/webhooks/${code}/${webhook.id}?token=${rawToken}`;

    return {
      success: true,
      webhook,
      rawToken,
      fullUrl,
      baseUrl,
    };
  });

  ipcMain.handle("webhook:update", async (_event, roomCode, webhookId, patch) => {
    const code = roomCode || global.roomManager?.roomCode;
    if (!code || !global.roomManager?.roomMetaStore) {
      throw new Error("No active room found");
    }

    const myUserId = global.roomManager.p2pService?.profile?.id || "local";
    const { webhook, meta } = await global.roomManager.roomMetaStore.updateWebhook(
      code,
      webhookId,
      patch,
      myUserId
    );

    try {
      global.roomManager.p2pService?._broadcast("meta-update", meta);
      const serverStore = serverService.getServerStore();
      const updatedServer = await serverStore.applySyncedMeta(code, meta);
      if (updatedServer) {
        global.mainWindow?.webContents.send("server:updated", updatedServer);
      }
    } catch (e) {
      console.error("[IPC Webhook Update Broadcast Error]:", e);
    }

    return { success: true, webhook };
  });

  ipcMain.handle("webhook:delete", async (_event, roomCode, webhookId) => {
    const code = roomCode || global.roomManager?.roomCode;
    if (!code || !global.roomManager?.roomMetaStore) {
      throw new Error("No active room found");
    }

    const myUserId = global.roomManager.p2pService?.profile?.id || "local";
    const { meta } = await global.roomManager.roomMetaStore.deleteWebhook(
      code,
      webhookId,
      myUserId
    );

    try {
      global.roomManager.p2pService?._broadcast("meta-update", meta);
      const serverStore = serverService.getServerStore();
      const updatedServer = await serverStore.applySyncedMeta(code, meta);
      if (updatedServer) {
        global.mainWindow?.webContents.send("server:updated", updatedServer);
      }
    } catch (e) {
      console.error("[IPC Webhook Delete Broadcast Error]:", e);
    }

    return { success: true };
  });

  ipcMain.handle("webhook:regenerateToken", async (_event, roomCode, webhookId) => {
    const code = roomCode || global.roomManager?.roomCode;
    if (!code || !global.roomManager?.roomMetaStore) {
      throw new Error("No active room found");
    }

    const myUserId = global.roomManager.p2pService?.profile?.id || "local";
    const { webhook, rawToken, meta } = await global.roomManager.roomMetaStore.regenerateWebhookToken(
      code,
      webhookId,
      myUserId
    );

    try {
      global.roomManager.p2pService?._broadcast("meta-update", meta);
      const serverStore = serverService.getServerStore();
      const updatedServer = await serverStore.applySyncedMeta(code, meta);
      if (updatedServer) {
        global.mainWindow?.webContents.send("server:updated", updatedServer);
      }
    } catch (e) {
      console.error("[IPC Webhook Regenerate Broadcast Error]:", e);
    }

    const baseUrl = webhookService.getBaseUrl();
    const fullUrl = `${baseUrl}/api/webhooks/${code}/${webhook.id}?token=${rawToken}`;

    return {
      success: true,
      webhook,
      rawToken,
      fullUrl,
    };
  });

  ipcMain.handle("webhook:test", async (_event, roomCode, webhookId, samplePayload = {}) => {
    const code = roomCode || global.roomManager?.roomCode;
    if (!code || !global.roomManager?.roomMetaStore) {
      throw new Error("No active room found");
    }

    const webhooks = await global.roomManager.roomMetaStore.getWebhooks(code, false);
    const webhook = (webhooks || []).find((w) => w.id === webhookId);
    if (!webhook) throw new Error("Webhook not found");
    const content = samplePayload.content !== undefined ? samplePayload.content : "";
    const embeds = samplePayload.embeds || [
      {
        title: "Test de Integración P2P",
        description: `Este mensaje confirma que el webhook **${webhook.name}** está funcionando correctamente en Onicord sin servidores centrales.`,
        color: 5793266, // Onicord accent / Discord blurple
        fields: [
          { name: "Canal", value: `#${webhook.channelId || "general"}`, inline: true },
          { name: "Tipo", value: webhook.type || "incoming", inline: true },
        ],
      },
    ];

    const sentMessage = await global.roomManager.sendWebhookMessage({
      roomCode: code,
      channelId: webhook.channelId || "general",
      webhook,
      content,
      embeds,
      username: samplePayload.username || webhook.name,
      avatar_url: samplePayload.avatar_url || webhook.avatar,
    });

    try {
      const cryptoService = require("../../services/cryptoService.cjs");
      const decryptedMsg = {
        ...sentMessage,
        text: cryptoService.decrypt(code, sentMessage.text),
      };
      global.mainWindow?.webContents.send("chat:message", decryptedMsg);
    } catch (e) {}

    return { success: true, messageId: sentMessage.id };
  });

  ipcMain.handle("webhook:pollNow", async (_event, roomCode, webhookId) => {
    const code = roomCode || global.roomManager?.roomCode;
    if (!code || !global.roomManager?.roomMetaStore) {
      throw new Error("No active room found");
    }

    const webhooks = await global.roomManager.roomMetaStore.getWebhooks(code, true);
    const webhook = (webhooks || []).find((w) => w.id === webhookId);
    if (!webhook) throw new Error("Webhook not found");

    if (webhook.type !== "pull_poller" || !webhook.targetUrl) {
      throw new Error("Este webhook no es de tipo Sondeo P2P (Pull Feed)");
    }

    // Force poll and post the latest item to test/preview
    const result = await feedPollerService.pollWebhook(code, webhook, true);
    return result;
  });

  ipcMain.handle("webhook:getFeedStatus", async (_event, webhookId) => {
    return feedPollerService.getStatus(webhookId);
  });
}

module.exports = { registerWebhookHandlers };
