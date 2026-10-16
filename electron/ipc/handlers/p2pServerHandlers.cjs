const { app, ipcMain } = require("electron");
const net = require("net");
const { RoomManager } = require("../../p2p/roomManager.cjs");
const serverService = require("../../services/serverService.cjs");
const cryptoService = require("../../services/cryptoService.cjs");
const ytdlpService = require("../../services/ytdlpService.cjs");
const { RoomMetaStore } = require("../../p2p/roomMetaStore.cjs");
const { ServerStore } = require("../../p2p/serverStore.cjs");

function createRoomManager() {
  if (global.roomManager) return global.roomManager;
  global.roomManager = new RoomManager({
    userDataPath: app.getPath("userData"),
    onPeerJoined: (peer) => {
      global.mainWindow?.webContents.send("peer:joined", peer);
    },
    onPeerLeft: (peer) => {
      global.mainWindow?.webContents.send("peer:left", peer);
    },
    onRoomCreated: (data) => {
      global.mainWindow?.webContents.send("room:created", data);
    },
    onRoomJoined: (data) => {
      global.mainWindow?.webContents.send("room:joined", data);
    },
    onChatMessage: (message) => {
      const msgRoomCode = message?.roomCode || global.roomManager?.roomCode;
      if (message && msgRoomCode) {
        const decryptedMsg = {
          ...message,
          roomCode: msgRoomCode,
          text: cryptoService.decrypt(msgRoomCode, message.text),
        };
        global.mainWindow?.webContents.send("chat:message", decryptedMsg);
      } else {
        global.mainWindow?.webContents.send("chat:message", message);
      }
    },
    onChatMessageDeleted: (id) => {
      global.mainWindow?.webContents.send("chat:deleted", id);
    },
    onUserTyping: (data) => {
      global.mainWindow?.webContents.send("chat:typing", data);
    },
    onSyncComplete: (data) => {
      global.mainWindow?.webContents.send("sync:complete", data);
    },
    onServerMetaUpdated: async (roomCode, meta) => {
      const serverStore = serverService.getServerStore();
      const server = await serverStore.applySyncedMeta(roomCode, meta);
      if (server) {
        global.mainWindow?.webContents.send("server:updated", server);

        // Invalidate moderation cache
        if (global.roomManager && global.roomManager.roomCode === roomCode) {
          global.roomManager._moderationCache = {
            bannedUsers: Array.isArray(meta.bannedUsers) ? meta.bannedUsers : [],
            kickedUsers: meta.kickedUsers || {},
          };

          if (global.roomManager.p2pService) {
            global.roomManager.p2pService.setDirectConfig({
              enabled: Boolean(server.directConnectionEnabled),
              ip: server.directIP || "",
              port: parseInt(server.directPort, 10) || 7777,
              isHost: global.roomManager.isHost,
            });
          }

          // Anti-Moderation Check: Evict penalized local user in real-time
          const localProfileId = global.roomManager.p2pService?.profile?.id;
          if (localProfileId && typeof localProfileId === "string" && localProfileId.trim().length > 0) {
            const isOwner = Boolean(server.isOwner || (server.ownerId && server.ownerId === localProfileId));
            if (!isOwner) {
              const isBanned = Array.isArray(meta.bannedUsers) && meta.bannedUsers.includes(localProfileId);
              const kickTime = meta.kickedUsers?.[localProfileId];
              const joinTime = global.roomManager.localJoinTimestamp || 0;
              const isKicked = kickTime && kickTime > joinTime;

              if (isBanned) {
                console.log(`[P2P Eviction] Local user is BANNED from room ${roomCode}. Booting...`);
                global.mainWindow?.webContents.send("server:banned", { roomCode, name: server.name || meta.name });
                await serverService.removeServer(server.id, global.roomManager);
              } else if (isKicked) {
                console.log(`[P2P Eviction] Local user is KICKED from room ${roomCode}. Booting...`);
                global.mainWindow?.webContents.send("server:kicked", { roomCode, name: server.name || meta.name });
                await global.roomManager.leaveRoom();
              }
            }
          }
        }
      }
    },
    onVoiceStateUpdated: (state) => {
      global.mainWindow?.webContents.send("voice:state", state);
    },
    onPeerActivityUpdated: (data) => {
      global.mainWindow?.webContents.send("peer:activity", data);
    },
    onPeerUpdated: (peer) => {
      global.mainWindow?.webContents.send("peer:updated", peer);
    },
    onVoiceSignal: (data) => {
      global.mainWindow?.webContents.send("voice:signal", data);
    },
    onError: (message) => {
      global.mainWindow?.webContents.send("p2p:error", message);
    },
  });
  return global.roomManager;
}

function registerP2PServerHandlers() {
  const activeInvitePreviews = new Map();

  ipcMain.handle("deeplink:check-pending", async () => {
    const code = global.pendingDeepLink || null;
    global.pendingDeepLink = null;
    return code;
  });

  ipcMain.handle("deeplink:resolve-invite", async (event, roomCode, profile) => {
    const normalized = String(roomCode).trim().toUpperCase();

    const roomMetaStore = new RoomMetaStore(app.getPath("userData"));
    const localMeta = await roomMetaStore.load(normalized);

    const serverStore = new ServerStore(app.getPath("userData"));
    const localServer = await serverStore.getByRoomCode(normalized);

    const savedMembersList = localMeta?.savedMembers ? Object.values(localMeta.savedMembers) : [];
    const initialDetails = {
      roomCode: normalized,
      name: localServer?.name || localMeta?.name || `Servidor ${normalized}`,
      icon: localServer?.icon || localMeta?.icon || null,
      memberCount: savedMembersList.length,
      onlineCount: 0,
    };

    if (activeInvitePreviews.has(normalized)) {
      const prev = activeInvitePreviews.get(normalized);
      prev.cleanup();
    }

    let finished = false;
    let tempManager = null;

    const cleanup = async () => {
      if (finished) return;
      finished = true;
      activeInvitePreviews.delete(normalized);
      if (tempManager) {
        try {
          await tempManager.destroy();
          console.log(`[Invite Preview] Destroyed temporary room manager for ${normalized}`);
        } catch (err) {
          console.error(`[Invite Preview] Error destroying temp manager for ${normalized}:`, err.message);
        }
      }
    };

    const timeoutId = setTimeout(() => {
      cleanup();
    }, 15000);

    const notifyUpdate = (updatedFields) => {
      if (finished) return;
      event.sender.send("invite:details-updated", {
        roomCode: normalized,
        ...updatedFields,
      });
    };

    tempManager = new RoomManager({
      userDataPath: app.getPath("userData"),
      isPreview: true,
      onPeerJoined: () => {
        if (finished) return;
        const onlineCount = Array.from(tempManager.p2pService.peers.values()).filter(p => p.userId !== null).length;
        notifyUpdate({ onlineCount });
      },
      onPeerLeft: () => {
        if (finished) return;
        const onlineCount = Array.from(tempManager.p2pService.peers.values()).filter(p => p.userId !== null).length;
        notifyUpdate({ onlineCount });
      },
      onServerMetaUpdated: (code, newMeta) => {
        if (finished || code !== normalized) return;
        const membersList = newMeta?.savedMembers ? Object.values(newMeta.savedMembers) : [];
        const onlineCount = Array.from(tempManager.p2pService.peers.values()).filter(p => p.userId !== null).length;
        notifyUpdate({
          name: newMeta.name || initialDetails.name,
          icon: newMeta.icon !== undefined ? newMeta.icon : initialDetails.icon,
          memberCount: membersList.length,
          onlineCount,
        });
      },
    });

    activeInvitePreviews.set(normalized, {
      cleanup: () => {
        clearTimeout(timeoutId);
        cleanup();
      }
    });

    (async () => {
      try {
        await tempManager.connectToRoom(normalized, false, profile);
        console.log(`[Invite Preview] Started background lookup for room ${normalized}`);
      } catch (err) {
        console.error(`[Invite Preview] Failed to connect to room ${normalized}:`, err.message);
        cleanup();
      }
    })();

    return initialDetails;
  });

  ipcMain.on("deeplink:cancel-resolve-invite", (_event, roomCode) => {
    const normalized = String(roomCode || "").trim().toUpperCase();
    if (activeInvitePreviews.has(normalized)) {
      console.log(`[Invite Preview] Cancelled preview lookup for room ${normalized}`);
      const preview = activeInvitePreviews.get(normalized);
      preview.cleanup();
    }
  });

  ipcMain.handle("servers:enter", async (_event, serverId, profile) => {
    const manager = createRoomManager();
    return serverService.enterServer(serverId, profile, manager, () => {
      ytdlpService.startLocalStreamServer();
    });
  });

  ipcMain.handle("servers:boot-background", async (_event, profile, excludeServerId) => {
    const manager = createRoomManager();
    return serverService.bootBackgroundServers(profile, excludeServerId, manager);
  });

  ipcMain.handle("servers:get-room-peers", async (_event, roomCode) => {
    if (!global.roomManager) return [];
    return global.roomManager.getPeersForRoom(roomCode);
  });

  ipcMain.handle("servers:create", async (_event, name, profile) => {
    return serverService.createServer(name, profile);
  });

  ipcMain.handle("room:leave", async () => {
    if (global.roomManager) {
      await serverService.leaveRoom(global.roomManager);
      global.roomManager = null;
    }
    return { success: true };
  });

  ipcMain.handle("servers:remove", async (_event, serverId) => {
    if (global.roomManager) {
      await serverService.leaveRoom(global.roomManager);
      global.roomManager = null;
    }
    return serverService.removeServer(serverId);
  });

  ipcMain.handle("servers:join", async (_event, code, name, profile) => {
    return serverService.joinServer(code, name, profile);
  });

  ipcMain.handle("servers:list", async () => {
    return serverService.listServers();
  });

  ipcMain.handle("servers:updateSettings", async (_event, serverId, settings) => {
    return serverService.updateServer(serverId, settings, global.roomManager);
  });

  ipcMain.handle("servers:checkDirectPort", async (_event, port) => {
    const targetPort = parseInt(port, 10);
    if (isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
      return { open: false, error: "Invalid port" };
    }

    let tempServer = null;

    const startTempServer = () => {
      return new Promise((resolve) => {
        const server = net.createServer();
        server.on("error", () => {
          resolve(null);
        });
        server.listen(targetPort, "0.0.0.0", () => {
          resolve(server);
        });
      });
    };

    try {
      tempServer = await startTempServer();
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(`http://portcheck.transmissionbt.com/${targetPort}`, {
        signal: controller.signal,
        headers: { "User-Agent": "Onicord" }
      });
      clearTimeout(timeoutId);

      const resultText = await response.text();
      const isOpen = resultText.trim() === "1";

      return { open: isOpen };
    } catch (err) {
      console.error("[Port Check Error]", err.message);
      return { open: false, error: err.message };
    } finally {
      if (tempServer) {
        await new Promise((resolve) => tempServer.close(resolve));
      }
    }
  });

  ipcMain.handle("servers:setChannel", async (_event, serverId, channelId) => {
    return serverService.setChannel(serverId, channelId);
  });

  ipcMain.handle("servers:getLastActive", async () => {
    return serverService.getLastActive();
  });

  ipcMain.handle("servers:setLastActive", async (_event, serverId) => {
    return serverService.setLastActive(serverId);
  });

  ipcMain.handle("room:state", async () => {
    if (!global.roomManager) return null;
    return await global.roomManager.getState();
  });

  // Voice WebRTC IPC
  ipcMain.handle("voice:state", async () => {
    if (!global.roomManager) return { localPeerId: null, members: [] };
    return global.roomManager.getVoiceSnapshot();
  });

  ipcMain.handle("voice:join", async (_event, channelId) => {
    if (!global.roomManager || !global.roomManager.roomCode) {
      console.warn("[Voice IPC] Cannot join voice: No active room found");
      return { error: "No active room found" };
    }
    global.roomManager.joinVoice(channelId);
    return global.roomManager.getVoiceSnapshot();
  });

  ipcMain.handle("voice:setMuted", async (_event, muted) => {
    if (!global.roomManager) return null;
    global.roomManager.setVoiceMuted(muted);
    return global.roomManager.getVoiceSnapshot();
  });

  ipcMain.handle("voice:setDeafened", async (_event, deafened) => {
    if (!global.roomManager) return null;
    global.roomManager.setVoiceDeafened(deafened);
    return global.roomManager.getVoiceSnapshot();
  });

  ipcMain.handle("voice:signal", async (_event, toPeerId, channelId, signal) => {
    if (!global.roomManager) return;
    global.roomManager.relayVoiceSignal(toPeerId, channelId, signal);
  });

  ipcMain.handle("voice:leave", async () => {
    if (!global.roomManager) return null;
    global.roomManager.leaveVoice();
    return global.roomManager.getVoiceSnapshot();
  });

  ipcMain.handle("voice:setStreaming", async (_event, isStreaming) => {
    if (!global.roomManager) return null;
    global.roomManager.setStreamingState(isStreaming);
    return global.roomManager.getVoiceSnapshot();
  });

  ipcMain.handle("voice:speaking", async (_event, isSpeaking, volumeLevel) => {
    if (!global.roomManager) return { ok: false };
    global.roomManager.sendSpeakingState(isSpeaking, volumeLevel);
    return { ok: true };
  });

  ipcMain.handle("voice:claim-host", async () => {
    if (!global.roomManager) return { success: false };
    global.roomManager.claimVoiceHost();
    return { success: true };
  });

  ipcMain.handle("voice:update-stream-ids", async (_event, audioStreamId, videoStreamId, bandwidth) => {
    if (!global.roomManager) return { success: false };
    global.roomManager.updateVoiceStreamIds(audioStreamId, videoStreamId, bandwidth);
    return { success: true };
  });
}

module.exports = { registerP2PServerHandlers, createRoomManager };
