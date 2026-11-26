const { app, ipcMain } = require("electron");
const net = require("net");
const crypto = require("crypto");
const b4a = require("b4a");
const Hyperswarm = require("hyperswarm");
const SecretStream = require("@hyperswarm/secret-stream");
const { RoomManager } = require("../../p2p/roomManager.cjs");
const { encodeMessage, decodeMessages, safeWriteSocket } = require("../../network/p2pService.cjs");
const profileService = require("../../services/profileService.cjs");
const serverService = require("../../services/serverService.cjs");
const discordImportService = require("../../services/discordImportService.cjs");
const cryptoService = require("../../services/cryptoService.cjs");
const peerTrustService = require("../../services/peerTrustService.cjs");
const ytdlpService = require("../../services/ytdlpService.cjs");
const { RoomMetaStore } = require("../../p2p/roomMetaStore.cjs");
const { ServerStore } = require("../../p2p/serverStore.cjs");
const { DbManager } = require("../../storage/dbManager.cjs");
const discoverService = require("../../services/discoverService.cjs");

const MAX_HEADLESS_UNREADS = 5000;
const headlessUnreadQueue = [];

function recordHeadlessUnread(msg) {
  if (!msg || !msg.roomCode) return;
  if (global.mainWindow && !global.mainWindow.isDestroyed()) return;
  if (headlessUnreadQueue.length >= MAX_HEADLESS_UNREADS) {
    headlessUnreadQueue.shift();
  }
  headlessUnreadQueue.push({
    id: msg.id,
    roomCode: msg.roomCode,
    serverId: msg.serverId || null,
    channelId: msg.channelId || "general",
    authorId: msg.authorId || null,
    text: typeof msg.text === "string" ? msg.text.slice(0, 200) : "",
    timestamp: msg.timestamp || Date.now(),
  });
}

global.recordHeadlessUnread = recordHeadlessUnread;

function createRoomManager() {
  if (global.roomManager) return global.roomManager;
  global.roomManager = new RoomManager({
    userDataPath: app.getPath("userData"),
    onPeerJoined: (peer) => {
      global.mainWindow?.webContents.send("peer:joined", peer);
    },
    onMemberFirstJoined: (member) => {
      global.mainWindow?.webContents.send("server:member-first-joined", member);
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
        const decryptedText = global.roomManager?.decryptChannelText
          ? global.roomManager.decryptChannelText(msgRoomCode, message.channelId, message.text)
          : cryptoService.decrypt(msgRoomCode, message.text);
        const decryptedMsg = {
          ...message,
          roomCode: msgRoomCode,
          text: decryptedText,
        };
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
          global.mainWindow.webContents.send("chat:message", decryptedMsg);
        } else {
          recordHeadlessUnread(decryptedMsg);
        }
      } else if (message) {
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
          global.mainWindow.webContents.send("chat:message", message);
        }
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
        const enrichedServer = {
          ...server,
          savedMembers: meta.savedMembers || {},
        };
        global.mainWindow?.webContents.send("server:updated", enrichedServer);

        // Invalidate moderation cache & sync invite DHT listener
        const normalizedCode = String(roomCode || "").trim().toUpperCase();
        if (global.roomManager) {
          global.roomManager._syncRoomInviteListener?.(normalizedCode, meta);
          const roomEntry = global.roomManager.rooms?.get(normalizedCode);
          if (roomEntry) {
            roomEntry.moderationCache = {
              bannedUsers: Array.isArray(meta.bannedUsers) ? meta.bannedUsers : [],
              kickedUsers: meta.kickedUsers || {},
            };
          }
          if (global.roomManager.roomCode === normalizedCode) {
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
          }

          // Anti-Moderation Check: Evict penalized local user in real-time
          const localProfileId = global.roomManager.p2pService?.profile?.id;
          if (localProfileId && typeof localProfileId === "string" && localProfileId.trim().length > 0) {
            const isOwner = Boolean(server.isOwner || (server.ownerId && server.ownerId === localProfileId));
            if (!isOwner) {
              const isBanned = Array.isArray(meta.bannedUsers) && meta.bannedUsers.includes(localProfileId);
              const kickTime = meta.kickedUsers?.[localProfileId];
              const joinTime = server.joinedAt || server.createdAt || roomEntry?.localJoinTimestamp || 0;
              const isKicked = Boolean(kickTime && kickTime > joinTime);

              if (isBanned) {
                console.log(`[P2P Eviction] Local user is BANNED from room ${normalizedCode}. Booting...`);
                await serverService.removeServer(server.id, global.roomManager);
                global.mainWindow?.webContents.send("server:banned", { roomCode: normalizedCode, name: server.name || meta.name });
              } else if (isKicked) {
                console.log(`[P2P Eviction] Local user is KICKED from room ${normalizedCode}. Booting...`);
                await serverService.removeServer(server.id, global.roomManager);
                global.mainWindow?.webContents.send("server:kicked", { roomCode: normalizedCode, name: server.name || meta.name });
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
    onDiagConsentRequest: (reqData) => {
      global.mainWindow?.webContents.send("diagnostics:consent-request", reqData);
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

  ipcMain.handle("chat:consume-headless-unreads", () => {
    return headlessUnreadQueue.splice(0, headlessUnreadQueue.length);
  });

  ipcMain.handle("deeplink:check-pending", async () => {
    const code = global.pendingDeepLink || null;
    global.pendingDeepLink = null;
    return code;
  });

  async function redeemOrPreviewTemporaryInvite(
    roomCode,
    inviteSecret,
    profile,
    mode = "redeem",
    timeoutMs = 15000
  ) {
    const code = String(roomCode || "").trim().toUpperCase();
    if (!/^[A-F0-9]{8}$/.test(code) || !cryptoService.isValidRoomSecret(inviteSecret)) {
      return { ok: false, reason: "INVALID" };
    }

    const cleanInviteSecret = inviteSecret.trim();
    const requestId = crypto.randomUUID();
    const inviteSecretHash = cryptoService.hashInviteSecret(cleanInviteSecret);
    const reqPayload = {
      requestId,
      roomCode: code,
      inviteSecretHash,
      mode: mode === "preview" ? "preview" : "redeem",
      applicant: {
        id: profile?.id || null,
        nickname: profile?.nickname || "Usuario",
      },
    };

    return await new Promise((resolve) => {
      let settled = false;
      let tempSwarm = null;
      let fallbackTimer = null;
      let invalidGraceTimer = null;
      const buffers = new WeakMap();

      const finish = async (result) => {
        if (settled) return;
        settled = true;
        if (fallbackTimer) clearTimeout(fallbackTimer);
        if (invalidGraceTimer) clearTimeout(invalidGraceTimer);
        global.roomManager?.unregisterInviteRedeemWaiter?.(requestId);
        if (tempSwarm) {
          try {
            await tempSwarm.destroy();
          } catch {}
          tempSwarm = null;
        }
        resolve(result);
      };

      const handleRes = (res) => {
        if (settled || !res || res.requestId !== requestId) return;
        if (res.ok) {
          if (reqPayload.mode === "redeem" && !cryptoService.isValidRoomSecret(res.roomRoutingSecret)) {
            return;
          }
          finish(res);
          return;
        }
        if (res.reason === "EXPIRED" || res.reason === "REVOKED" || res.reason === "BANNED") {
          finish(res);
          return;
        }
        // Grace period for "INVALID" in case another peer already has the freshly synced activeInvite
        if (!invalidGraceTimer) {
          invalidGraceTimer = setTimeout(() => {
            finish(res);
          }, 2500);
          if (typeof invalidGraceTimer.unref === "function") invalidGraceTimer.unref();
        }
      };

      fallbackTimer = setTimeout(() => {
        finish({ ok: false, reason: "NO_PEERS_ONLINE" });
      }, timeoutMs);
      if (typeof fallbackTimer.unref === "function") fallbackTimer.unref();

      // 1. Check already-connected peers on active RoomManager (handles same-DHT peers fast)
      if (global.roomManager?.p2pService?.peers?.size > 0) {
        global.roomManager.registerInviteRedeemWaiter?.(requestId, handleRes);
        const line = encodeMessage("invite-redeem-req", reqPayload);
        for (const peerObj of global.roomManager.p2pService.peers.values()) {
          if (peerObj?.socket && !peerObj.socket.destroyed) {
            safeWriteSocket(peerObj.socket, line);
          }
        }
      }

      // 2. Spin up an ephemeral Hyperswarm on the invite's DHT topic
      try {
        tempSwarm = new Hyperswarm({ maxPeers: 16 });
        const topic = cryptoService.topicFromInviteSecret(code, cleanInviteSecret);
        tempSwarm.on("connection", (socket) => {
          buffers.set(socket, "");
          safeWriteSocket(socket, encodeMessage("invite-redeem-req", reqPayload));
          socket.on("data", (chunk) => {
            if (settled) return;
            const combined = (buffers.get(socket) || "") + chunk.toString("utf8");
            const { messages, remaining } = decodeMessages(combined);
            buffers.set(socket, remaining);
            for (const msg of messages) {
              if (msg?.type === "invite-redeem-res" && msg.payload) {
                handleRes(msg.payload);
              }
            }
          });
          socket.on("error", () => {});
        });
        tempSwarm.join(topic, { server: false, client: true });
      } catch (err) {
        if (!settled) {
          finish({ ok: false, reason: "NO_PEERS_ONLINE", error: err.message });
        }
      }
    });
  }

  ipcMain.handle("deeplink:resolve-invite", async (event, roomCode, profile, inviteSecret = null) => {
    const normalized = String(roomCode).trim().toUpperCase();

    const roomMetaStore = global.roomManager?.roomMetaStore || new RoomMetaStore(app.getPath("userData"));
    const localMeta = await roomMetaStore.load(normalized);

    const serverStore = new ServerStore(app.getPath("userData"));
    const localServer = await serverStore.getByRoomCode(normalized);
    const discovered = discoverService.discoveredServers?.get(normalized);

    const savedMembersList = localMeta?.savedMembers ? Object.values(localMeta.savedMembers) : [];
    const activePeersInRoom = global.roomManager?.getPeersForRoom ? global.roomManager.getPeersForRoom(normalized) : [];
    const isLocalMember = Boolean(localServer);
    const initialDetails = {
      roomCode: normalized,
      name: localServer?.name || localMeta?.name || discovered?.name || `Servidor ${normalized}`,
      icon: localServer?.icon || localMeta?.icon || discovered?.icon || null,
      memberCount: Math.max(savedMembersList.length, discovered?.memberCount || 0, isLocalMember ? 1 : 0),
      onlineCount: activePeersInRoom.length + (isLocalMember ? 1 : 0),
      expiresAt: localMeta?.activeInvite?.expiresAt || null,
    };

    if (inviteSecret && cryptoService.isValidRoomSecret(inviteSecret)) {
      if (!isLocalMember) {
        (async () => {
          const previewRes = await redeemOrPreviewTemporaryInvite(normalized, inviteSecret, profile, "preview", 15000);
          if (previewRes?.ok) {
            event.sender.send("invite:details-updated", {
              roomCode: normalized,
              name: previewRes.name || initialDetails.name,
              icon: previewRes.icon !== undefined ? previewRes.icon : initialDetails.icon,
              memberCount: previewRes.memberCount || initialDetails.memberCount,
              onlineCount: previewRes.onlineCount || 1,
              expiresAt: previewRes.expiresAt || null,
              errorReason: null,
            });
          } else {
            event.sender.send("invite:details-updated", {
              roomCode: normalized,
              errorReason: previewRes?.reason || "NO_PEERS_ONLINE",
            });
          }
        })();
      }
      return initialDetails;
    }

    // If main RoomManager is active, ask connected peers over the existing P2P/Discovery mesh instead of spawning a second Hyperswarm instance
    if (global.roomManager?.p2pService) {
      global.roomManager.p2pService._broadcast("invite-preview-req", { roomCode: normalized });
      if (isLocalMember || global.roomManager.p2pService.peers.size > 0 || discovered) {
        return initialDetails;
      }
    }

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

  ipcMain.handle("servers:create", async (_event, name, profile, icon) => {
    return serverService.createServer(name, profile, icon);
  });

  ipcMain.handle("servers:preview-discord-template", async (_event, input) => {
    return discordImportService.fetchDiscordTemplate(input);
  });

  ipcMain.handle("servers:import-discord-template", async (_event, importData, profile) => {
    return serverService.createServerFromDiscordTemplate(importData, profile);
  });

  ipcMain.handle("room:leave", async () => {
    if (global.roomManager) {
      await serverService.leaveRoom(global.roomManager);
    }
    return { success: true };
  });

  ipcMain.handle("servers:remove", async (_event, serverId) => {
    const manager = global.roomManager;
    const res = await serverService.removeServer(serverId, manager);
    if (global.roomManager && (!global.roomManager.rooms || global.roomManager.rooms.size === 0) && !global.roomManager.roomCode) {
      await global.roomManager.destroy().catch(() => {});
      global.roomManager = null;
    }
    return res;
  });

  ipcMain.handle("servers:join", async (_event, code, name, profile, roomSecret, keyData = null) => {
    return serverService.joinServer(code, name, profile, roomSecret, keyData);
  });

  ipcMain.handle("servers:generate-invite", async (_event, roomCode, durationKey = "24h") => {
    if (!global.roomManager) {
      throw new Error("NO_ACTIVE_ROOM_MANAGER");
    }
    return global.roomManager.generateActiveInvite(roomCode, durationKey, profileService.activeProfile);
  });

  ipcMain.handle("servers:revoke-invite", async (_event, roomCode) => {
    if (!global.roomManager) {
      throw new Error("NO_ACTIVE_ROOM_MANAGER");
    }
    return global.roomManager.revokeActiveInvite(roomCode, profileService.activeProfile);
  });

  ipcMain.handle("servers:rotate-key", async (_event, roomCode) => {
    if (!global.roomManager) {
      throw new Error("NO_ACTIVE_ROOM_MANAGER");
    }
    return global.roomManager.rotateRoomKey(roomCode, {
      reason: "manual",
      actorId: profileService.activeProfile?.id || global.roomManager?.profile?.id || null,
    });
  });

  ipcMain.handle("servers:redeem-invite", async (_event, roomCode, inviteSecret, profile) => {
    const res = await redeemOrPreviewTemporaryInvite(roomCode, inviteSecret, profile, "redeem", 20000);
    if (!res?.ok) {
      return { ok: false, reason: res?.reason || "INVALID" };
    }
    const server = await serverService.joinServer(
      res.roomCode || roomCode,
      res.name || "",
      profile,
      res.roomRoutingSecret,
      {
        currentKeyEpoch: res.currentKeyEpoch || 1,
        keyRing: res.keyRing || null,
        keyEnvelopes: res.keyEnvelopes || null,
      }
    );
    return { ok: true, server };
  });

  ipcMain.handle("servers:list", async () => {
    return serverService.listServers();
  });

  ipcMain.handle("servers:updateSettings", async (_event, serverId, settings) => {
    return serverService.updateServer(serverId, settings, global.roomManager);
  });

  ipcMain.handle("servers:getAuditLog", async (_event, serverIdOrRoomCode) => {
    try {
      const serverStore = serverService.getServerStore();
      let roomCode = serverIdOrRoomCode;
      const server = (await serverStore.get(serverIdOrRoomCode)) || (await serverStore.getByRoomCode(serverIdOrRoomCode));
      if (server?.roomCode) {
        roomCode = server.roomCode;
      }
      const roomMetaStore = global.roomManager?.roomMetaStore || new RoomMetaStore(app.getPath("userData"));
      const meta = await roomMetaStore.load(roomCode, true);
      return Array.isArray(meta?.auditLog) ? meta.auditLog : [];
    } catch (e) {
      console.error("[IPC servers:getAuditLog Error]:", e);
      return [];
    }
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

  ipcMain.handle("room:state", async (_event, roomCode = null) => {
    if (!global.roomManager) return null;
    return await global.roomManager.getState(roomCode);
  });

  // Voice WebRTC IPC
  ipcMain.handle("voice:state", async () => {
    if (!global.roomManager) return { localPeerId: null, members: [] };
    return global.roomManager.getVoiceSnapshot();
  });

  ipcMain.handle("voice:join", async (_event, channelId, options = {}) => {
    const targetRoom = options?.roomCode ? String(options.roomCode).trim().toUpperCase() : global.roomManager?.roomCode;
    if (!global.roomManager || !targetRoom) {
      console.warn("[Voice IPC] Cannot join voice: No active room found");
      return { error: "No active room found" };
    }
    global.roomManager.joinVoice(channelId, { ...options, roomCode: targetRoom });
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

  ipcMain.handle("voice:moveMember", async (_event, roomCode, targetUserId, targetPeerId, targetChannelId) => {
    if (!global.roomManager) return { ok: false, error: "No room manager" };
    return global.roomManager.moveVoiceMember(roomCode, targetUserId, targetPeerId, targetChannelId);
  });

  // === Discover P2P Service Handlers ===
  discoverService.init();

  ipcMain.handle("discover:get-servers", async () => {
    try {
      const manager = createRoomManager();
      await manager.p2pService?.ensureSwarm();
      await discoverService.syncAndAnnounceLocalServers();
      discoverService.requestPeerDiscoveries();
    } catch (_) {}
    return discoverService.getDiscoveredServers();
  });

  ipcMain.handle("discover:send-knock", async (_event, payload) => {
    return discoverService.sendKnockRequest(payload);
  });

  ipcMain.handle("discover:approve-knock", async (_event, roomCode, applicant) => {
    return discoverService.approveKnock(roomCode, applicant);
  });

  ipcMain.handle("discover:reject-knock", async (_event, roomCode, applicant) => {
    return discoverService.rejectKnock(roomCode, applicant);
  });

  // === Security & Identity Verification Handlers ===
  const getOrDeriveLocalPublicKeyHex = () => {
    const activeId = global.roomManager?.p2pService?._resolveLocalPeerId();
    if (activeId) return activeId;
    try {
      const db = DbManager.getInstance(app.getPath("userData")).getGlobalDb("app_config");
      const row = db.prepare("SELECT value_json FROM app_settings WHERE key = ?").get("p2p_node_seed");
      let seedBuf = null;
      if (row && row.value_json) {
        const parsed = JSON.parse(row.value_json);
        if (parsed?.seedHex) {
          seedBuf = Buffer.from(parsed.seedHex, "hex");
        }
      }
      if (!seedBuf) {
        seedBuf = crypto.randomBytes(32);
        db.prepare("INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)").run(
          "p2p_node_seed",
          JSON.stringify({ seedHex: seedBuf.toString("hex") }),
          Date.now()
        );
      }
      const kp = SecretStream.keyPair(seedBuf);
      return b4a.toString(kp.publicKey, "hex");
    } catch (err) {
      console.warn("[Security IPC] Could not derive local public key:", err.message);
      return null;
    }
  };

  ipcMain.handle("security:get-local-identity", async () => {
    const publicKeyHex = getOrDeriveLocalPublicKeyHex();
    return {
      publicKeyHex,
      fingerprint: publicKeyHex ? cryptoService.computeIdentityFingerprint(publicKeyHex) : null,
    };
  });

  ipcMain.handle("security:get-peer-verification", async (_event, { userId, peerId } = {}) => {
    const localPublicKey = getOrDeriveLocalPublicKeyHex();
    const userDataPath = app.getPath("userData");
    const peersMap = global.roomManager?.p2pService?.peers;

    let resolvedPeerId = peerId || null;
    if (!resolvedPeerId && userId && global.roomManager?.getPeerIdByUserId) {
      resolvedPeerId = global.roomManager.getPeerIdByUserId(userId);
    }

    const livePeer = resolvedPeerId && peersMap ? peersMap.get(resolvedPeerId) : null;
    const transportAuth = livePeer ? (livePeer.transportAuth || "noise-hyperswarm") : "offline";
    const protocolVersion = livePeer ? (livePeer.protocolVersion || 1) : null;
    const supportsDmE2ee = livePeer ? (protocolVersion >= 2) : null;

    const info = peerTrustService.getPeerVerification(userDataPath, {
      userId,
      peerPublicKey: resolvedPeerId,
      localPublicKey,
      transportAuth,
    });
    return {
      ...info,
      protocolVersion,
      supportsDmE2ee,
    };
  });

  ipcMain.handle("security:set-peer-verified", async (_event, { userId, peerPublicKey, verified } = {}) => {
    const userDataPath = app.getPath("userData");
    const res = peerTrustService.setPeerVerified(userDataPath, userId, peerPublicKey, Boolean(verified));
    if (!res.ok) return res;

    const localPublicKey = getOrDeriveLocalPublicKeyHex();
    const peersMap = global.roomManager?.p2pService?.peers;
    let resolvedPeerId = peerPublicKey || null;
    if (!resolvedPeerId && userId && global.roomManager?.getPeerIdByUserId) {
      resolvedPeerId = global.roomManager.getPeerIdByUserId(userId);
    }

    const livePeer = resolvedPeerId && peersMap ? peersMap.get(resolvedPeerId) : null;
    const transportAuth = livePeer ? (livePeer.transportAuth || "noise-hyperswarm") : "offline";

    if (livePeer && global.roomManager) {
      livePeer.verificationStatus = peerTrustService.getVerificationStatusQuick(
        userDataPath,
        userId,
        resolvedPeerId,
        transportAuth
      );
      global.roomManager._emitPeerProfile(resolvedPeerId);
    }

    return {
      ...res,
      verification: peerTrustService.getPeerVerification(userDataPath, {
        userId,
        peerPublicKey: resolvedPeerId,
        localPublicKey,
        transportAuth,
      }),
    };
  });
}

module.exports = { registerP2PServerHandlers, createRoomManager };
