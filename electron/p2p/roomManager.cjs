const crypto = require("crypto");
const { ChatStore } = require("./chatStore.cjs");
const { RoomMetaStore } = require("./roomMetaStore.cjs");
const { FileIndexStore } = require("./fileIndexStore.cjs");
const { P2PService, encodeMessage, topicFromRoomCode, safeWriteSocket } = require("../network/p2pService.cjs");
const { VoiceService } = require("../network/voiceService.cjs");
const { ChatService } = require("../network/chatService.cjs");
const { FileService } = require("../network/fileService.cjs");
const diagService = require("../services/diagService.cjs");

// topicFromRoomCode is now imported from p2pService.cjs (single source of truth)

function generateRoomCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

class RoomManager {
  constructor({
    userDataPath,
    onPeerJoined,
    onPeerLeft,
    onRoomCreated,
    onRoomJoined,
    onChatMessage,
    onChatMessageDeleted,
    onSyncComplete,
    onServerMetaUpdated,
    onVoiceStateUpdated,
    onVoiceSignal,
    onPeerActivityUpdated,
    onPeerUpdated,
    onError,
    onUserTyping,
    isPreview = false,
  }) {
    this.roomCode = null;
    this.isHost = false;
    this.localActivity = null;
    this.userDataPath = userDataPath;
    this._roomPingInterval = null;
    this.isPreview = Boolean(isPreview);
    this.rooms = new Map(); // Map<roomCode, { roomCode, isHost, localJoinTimestamp, moderationCache }>
    this._moderationCache = null;

    this.chatStore = userDataPath ? new ChatStore(userDataPath) : null;
    this.roomMetaStore = userDataPath ? new RoomMetaStore(userDataPath) : null;
    this.fileIndexStore = userDataPath ? new FileIndexStore(userDataPath) : null;

    this._callbacks = {
      onPeerJoined,
      onPeerLeft,
      onRoomCreated,
      onRoomJoined,
      onChatMessage,
      onChatMessageDeleted,
      onSyncComplete,
      onServerMetaUpdated,
      onVoiceStateUpdated,
      onVoiceSignal,
      onPeerActivityUpdated,
      onPeerUpdated,
      onError,
      onUserTyping,
    };

    this.p2pService = new P2PService({
      onPeerJoined: (peerId, socket) => this._handlePeerJoined(peerId, socket),
      onPeerLeft: (peerId) => this._handlePeerLeft(peerId),
      onMessage: (peerId, type, payload) => this._handleMessage(peerId, type, payload),
    });

    this.voiceService = new VoiceService(this.p2pService);

    this.chatService = new ChatService(
      this.p2pService,
      this.chatStore,
      this.fileIndexStore,
      this.roomMetaStore,
      this._callbacks
    );

    this.fileService = new FileService(
      this.p2pService,
      this.fileIndexStore,
      userDataPath
    );
  }

  get localPeerId() {
    return this.p2pService?._resolveLocalPeerId() || null;
  }

  get peers() {
    return this.p2pService?.peers || new Map();
  }

  get profile() {
    return this.p2pService?.profile || null;
  }

  get localVoice() {
    return this.voiceService?.localVoice || null;
  }

  get networkTopology() {
    return this.voiceService?.networkTopology || "mesh";
  }

  get currentSfuHostId() {
    return this.voiceService?.currentSfuHostId || null;
  }

  get fileServerPort() {
    return this.fileService?.fileServerPort || 0;
  }

  get fileServer() {
    return this.fileService?.fileServer || null;
  }

  // _resolveLocalPeerId() removed — it was an orphan method that duplicated the `localPeerId` getter.
  // All internal usages call this.p2pService._resolveLocalPeerId() directly.

  getPeerIdByUserId(userId) {
    if (!userId) return null;
    if (userId === this.p2pService.profile?.id) return this.p2pService._resolveLocalPeerId();
    for (const peer of this.p2pService.peers.values()) {
      if (peer.userId === userId) return peer.id;
    }
    return null;
  }

  getUserIdByPeerId(peerId) {
    if (!peerId) return null;
    if (peerId === this.p2pService._resolveLocalPeerId()) return this.p2pService.profile?.id;
    const peer = this.p2pService.peers.get(peerId);
    return peer ? peer.userId : null;
  }

  getPeersForRoom(roomCode) {
    const normalized = String(roomCode || this.roomCode || "").trim().toUpperCase();
    if (!normalized || !this.p2pService) return [];
    const result = [];
    for (const [peerId, peer] of this.p2pService.peers.entries()) {
      const rooms = this.p2pService.peerRooms.get(peerId);
      if (!rooms || rooms.size === 0 || rooms.has(normalized)) {
        result.push(peer);
      }
    }
    return result;
  }

  getVoiceSnapshot() {
    return this.voiceService.getVoiceSnapshot(this.p2pService.profile);
  }

  _emitVoiceState() {
    this._callbacks.onVoiceStateUpdated?.(this.getVoiceSnapshot());
  }

  setStreamingState(isStreaming) {
    this.voiceService.setStreamingState(isStreaming, this.p2pService.profile, () => this._emitVoiceState());
  }

  joinVoice(channelId, options = {}) {
    this.voiceService.joinVoice(channelId, this.p2pService.profile, () => this._emitVoiceState(), options);
  }

  leaveVoice() {
    this.voiceService.leaveVoice(this.p2pService.profile, () => this._emitVoiceState());
  }

  setVoiceMuted(muted) {
    this.voiceService.setVoiceMuted(muted, this.p2pService.profile, () => this._emitVoiceState());
  }

  setVoiceDeafened(deafened) {
    this.voiceService.setVoiceDeafened(deafened, this.p2pService.profile, () => this._emitVoiceState());
  }

  relayVoiceSignal(toPeerId, channelId, signal) {
    this.voiceService.relayVoiceSignal(toPeerId, channelId, signal);
  }

  claimVoiceHost() {
    this.voiceService.claimVoiceHost(() => this._emitVoiceState());
  }

  updateVoiceStreamIds(audioStreamId, videoStreamId, bandwidth) {
    this.voiceService.updateVoiceStreamIds(audioStreamId, videoStreamId, bandwidth, this.p2pService.profile, () => this._emitVoiceState());
  }

  async publishServerMeta(patch, roomCode) {
    return this.chatService.publishServerMeta(patch, this.p2pService._resolveLocalPeerId(), roomCode || this.roomCode);
  }

  async sendChatMessage(channelId, text, roomCode) {
    return this.chatService.sendChatMessage(channelId, text, roomCode || this.roomCode);
  }

  async deleteChatMessage(channelId, messageId, roomCode) {
    return this.chatService.deleteChatMessage(channelId, messageId, roomCode || this.roomCode);
  }

  sendTypingState(channelId, roomCode) {
    this.chatService.sendTypingState(channelId, roomCode || this.roomCode);
  }

  async getChatHistory(channelId, roomCode) {
    return this.chatService.getChatHistory(roomCode || this.roomCode, channelId);
  }

  sendSpeakingState(isSpeaking, volumeLevel = 0) {
    if (!this.roomCode) return;
    const localId = this.p2pService._resolveLocalPeerId();
    if (!localId) return;

    this.p2pService._broadcast("speaking-state", {
      peerId: localId,
      isSpeaking: Boolean(isSpeaking),
      volumeLevel: Number(volumeLevel),
    });
  }

  sendSketchDraw(payload) {
    if (this.p2pService) {
      this.p2pService._broadcast("sketch-draw", payload);
    }
  }

  broadcastMusicState(channelId, state, roomCode = null) {
    const targetRoom = roomCode || this.roomCode;
    if (!this.p2pService || !targetRoom || !channelId) return;
    this.p2pService._broadcast(
      "music-channel-state",
      {
        channelId,
        state,
        roomCode: targetRoom,
        senderPeerId: this.p2pService._resolveLocalPeerId(),
      },
      targetRoom
    );
  }

  sendMusicCommand(channelId, command, roomCode = null) {
    const targetRoom = roomCode || this.roomCode;
    if (!this.p2pService || !targetRoom || !channelId) return;
    this.p2pService._broadcast(
      "music-channel-cmd",
      {
        channelId,
        command,
        roomCode: targetRoom,
        senderPeerId: this.p2pService._resolveLocalPeerId(),
      },
      targetRoom
    );
  }

  setProfile(profile) {
    this.p2pService.setProfile(profile, this.fileService.fileServerPort);
    if (this.voiceService.localVoice?.channelId) {
      this.voiceService._broadcastLocalVoiceState(profile);
      this._emitVoiceState();
    }
    if (this.localActivity !== undefined) {
      this.setLocalActivity(this.localActivity);
    }
  }

  setLocalActivity(activity) {
    this.localActivity = activity;
    if (this.p2pService.profile && this.p2pService.profile.showRichPresence === false) {
      this.p2pService._broadcast("activity-state", { name: null });
      return;
    }
    this.p2pService._broadcast("activity-state", activity || { name: null });
  }

  async requestFileDownload(fileId, targetPath, fileName, fileSize) {
    return this.fileService.requestFileDownload(fileId, targetPath, fileName, fileSize);
  }

  cancelFileDownload(fileId) {
    return this.fileService.cancelFileDownload(fileId);
  }

  async createRoom(profile) {
    const code = generateRoomCode();
    await this.connectToRoom(code, true, profile);
    return { code: this.roomCode };
  }

  async joinRoom(code, profile) {
    return this.connectToRoom(code, false, profile);
  }

  async connectToRoom(code, isHost, profile) {
    const normalized = String(code).trim().toUpperCase();
    if (!/^[A-F0-9]{8}$/.test(normalized)) {
      throw new Error("Código inválido.");
    }

    console.log(
      `\n============ [ROOM CORE CONNECT] STARTING ROOM: ${normalized} ============`
    );

    this.rooms.set(normalized, {
      roomCode: normalized,
      isHost: Boolean(isHost),
      localJoinTimestamp: Date.now(),
    });
    this.roomCode = normalized;
    this.isHost = Boolean(isHost);
    this.localJoinTimestamp = Date.now();
    diagService.log("info", "P2P", `Starting connection to room: ${normalized} (Host: ${isHost})`);

    this.chatService.addRoomCode(normalized);
    this.fileService.setRoomCode(normalized);

    this.fileService.initFileServer();
    this.p2pService.setProfile(profile, this.fileService.fileServerPort);

    let directEnabled = false;
    let directIP = "";
    let directPort = 7777;

    try {
      const { ServerStore } = require("./serverStore.cjs");
      const serverStore = new ServerStore(this.userDataPath);
      const server = await serverStore.getByRoomCode(normalized);
      if (server) {
        directEnabled = Boolean(server.directConnectionEnabled);
        directIP = server.directIP || "";
        directPort = parseInt(server.directPort, 10) || 7777;
      } else if (this.roomMetaStore) {
        const meta = await this.roomMetaStore.load(normalized);
        if (meta) {
          directEnabled = Boolean(meta.directConnectionEnabled);
          directIP = meta.directIP || "";
          directPort = parseInt(meta.directPort, 10) || 7777;
        }
      }
    } catch (e) {
      console.error("[RoomManager] Error reading direct connection settings:", e.message);
    }

    this.p2pService.setDirectConfig({
      enabled: directEnabled,
      ip: directIP,
      port: directPort,
      isHost: Boolean(isHost),
    });

    await this.p2pService.joinRoom(normalized);

    try {
      if (this.roomMetaStore && profile?.id && !this.isPreview) {
        let meta = await this.roomMetaStore.load(this.roomCode);
        const isAlreadyMember = Boolean(meta.savedMembers && meta.savedMembers[profile.id]?.joinedAt);

        // Si el usuario no es Host y se une por primera vez (o reingresa sin membresía previa),
        // resetear metadata local a versión 0 para permitir sincronización limpia desde el Host.
        if (!this.isHost && !isAlreadyMember) {
          console.log(`[RoomManager] Primera unión detectada para ${this.roomCode}. Inicializando metadata limpia para sync desde Host...`);
          const freshMeta = {
            roomCode: this.roomCode,
            version: 0,
            updatedAt: 0,
            updatedBy: null,
            ownerId: null,
            name: null,
            icon: null,
            banner: null,
            channels: [],
            roles: [],
            userRoles: {},
            savedMembers: {},
            bannedUsers: [],
            kickedUsers: {},
            auditLog: [],
          };
          meta = freshMeta;
          await this.roomMetaStore.save(this.roomCode, freshMeta);
        }

        // FIX 5: Populate moderation cache from the loaded meta on room join.
        this._moderationCache = {
          bannedUsers: Array.isArray(meta.bannedUsers) ? meta.bannedUsers : [],
          kickedUsers: meta.kickedUsers || {},
        };
        if (!meta.savedMembers) meta.savedMembers = {};
        const oldMember = meta.savedMembers[profile.id];
        meta.savedMembers[profile.id] = {
          id: profile.id,
          nickname: profile.nickname,
          avatar: profile.avatar,
          updatedAt: Date.now(),
          joinedAt: oldMember?.joinedAt || oldMember?.updatedAt || Date.now(),
        };
        if (this.isHost && !meta.ownerId) {
          const patch = { savedMembers: meta.savedMembers, ownerId: profile.id };
          await this.roomMetaStore.bump(this.roomCode, patch, "local");
        } else {
          await this.roomMetaStore.updateSavedMembers(this.roomCode, meta.savedMembers);
        }
      }
    } catch (e) {
      console.error("[RoomManager] Error guardando metadatos de miembro:", e.message);
    }

    if (this.isHost) {
      this._callbacks.onRoomCreated?.({ code: this.roomCode });
    } else {
      this._callbacks.onRoomJoined?.({ code: this.roomCode });
    }

    console.log(
      `[Room Core Success] Sala ${this.roomCode} inicializada al 100% con base de datos activa.\n`
    );
    this.startRoomPingInterval();
    this.startPeriodicMetaSync();

    return { code: this.roomCode, isHost: this.isHost, mesh: true };
  }

  startRoomPingInterval() {
    if (this._roomPingInterval) {
      clearInterval(this._roomPingInterval);
    }
    this._roomPingInterval = setInterval(() => {
      if (!this.roomCode) return;
      const now = Date.now();
      for (const [peerId, peer] of this.p2pService.peers.entries()) {
        if (!peer.lastPingAck) {
          peer.lastPingAck = now; // Give a grace period for new connections
        }
        
        // Ghost Socket Purger: 15 seconds without a pong response
        if (now - peer.lastPingAck > 15000) {
          console.warn(`[Ghost Purger] Peer ${peerId} timed out (no pong in 15s). Disconnecting.`);
          if (peer.socket && !peer.socket.destroyed) {
            peer.socket.destroy();
          }
          this.p2pService._removePeer(peerId);
          continue;
        }

        this.p2pService._sendToPeer(peerId, "ping", { timestamp: now });
      }
    }, 4000);
  }

  stopRoomPingInterval() {
    if (this._roomPingInterval) {
      clearInterval(this._roomPingInterval);
      this._roomPingInterval = null;
    }
  }

  startPeriodicMetaSync() {
    if (this._periodicMetaSyncInterval) {
      clearInterval(this._periodicMetaSyncInterval);
    }
    this._periodicMetaSyncInterval = setInterval(async () => {
      if (!this.p2pService || this.p2pService.peers.size === 0) return;
      try {
        // Sync for ALL active rooms, not just the last one
        const activeRoomCodes = this.rooms.size > 0 ? [...this.rooms.keys()] : (this.roomCode ? [this.roomCode] : []);
        for (const code of activeRoomCodes) {
          const meta = await this.roomMetaStore?.load(code);
          const chatWatermarks = (await this.chatStore?.getWatermarks(code)) || {};
          const watermarks = {
            ...chatWatermarks,
            _metaVersion: meta?.version || 0,
            _metaUpdatedAt: meta?.updatedAt || 0,
          };
          const files = (await this.fileIndexStore?.load(code)) || [];
          const filesSince = this.fileIndexStore?.getWatermark(files) || 0;

          for (const [peerId, peer] of this.p2pService.peers.entries()) {
            if (peer?.socket && !peer.socket.destroyed && !peer.syncBusy) {
              this.p2pService._sendToPeer(peerId, "sync-req", {
                watermarks,
                filesSince,
                from: this.p2pService._resolveLocalPeerId(),
                roomCode: code,
              });
            }
          }
        }
      } catch (err) {
        console.error("[RoomManager] Error en verificación periódica de metadatos:", err.message);
      }
    }, 30000);
  }

  stopPeriodicMetaSync() {
    if (this._periodicMetaSyncInterval) {
      clearInterval(this._periodicMetaSyncInterval);
      this._periodicMetaSyncInterval = null;
    }
  }

  async leaveRoom() {
    console.log(
      "[Room Core] Desconectando sala y purgando descriptores físicos de red..."
    );

    this.stopRoomPingInterval();
    this.stopPeriodicMetaSync();
    this.voiceService.stopPingInterval();
    this.chatService.clearRoomCode(this.roomCode);
    this.fileService.setRoomCode(null);

    await this.p2pService.leaveRoom(this.roomCode);
    this.fileService.closeFileServer();

    this.roomCode = null;
    this.isHost = false;
  }

  async destroy() {
    await this.leaveRoom();
    await this.p2pService.destroy();
    this.fileService.destroy();
  }

  async getState() {
    const localId = this.p2pService._resolveLocalPeerId();
    const activePeers = Array.from(this.p2pService.peers.values())
      .filter((p) => p.userId !== null)
      .map((p) => ({
        id: p.userId,
        userId: p.userId,
        peerId: p.id,
        nickname: p.nickname,
        avatar: p.avatar,
        online: true,
        activity: p.activity || null,
        customLink: p.customLink || "",
        profileColor: p.profileColor || "",
        customStatus: p.customStatus || "",
        showRichPresence: p.showRichPresence ?? true,
        flame: p.flame || null,
        ping: p.averagePing !== undefined ? Math.round(p.averagePing) : (p.ping !== undefined ? Math.round(p.ping) : null),
      }));

    let historicalMembers = [];
    try {
      if (this.roomMetaStore && this.roomCode) {
        const meta = await this.roomMetaStore.load(this.roomCode);
        if (meta && meta.savedMembers) {
          historicalMembers = Object.values(meta.savedMembers).map((m) => ({
            id: m.id,
            peerId: null,
            nickname: m.nickname,
            avatar: m.avatar,
            online: false,
          }));
        }
      }
    } catch (e) {
      console.error("[RoomManager] Error:", e.message);
    }

    const finalMembersMap = new Map();
    for (const h of historicalMembers) {
      if (h.id !== this.p2pService.profile?.id && h.id !== localId)
        finalMembersMap.set(h.id, h);
    }
    for (const p of activePeers) {
      if (p.id !== this.p2pService.profile?.id && p.id !== localId)
        finalMembersMap.set(p.id, { ...p, online: true });
    }

    return {
      roomCode: this.roomCode,
      isHost: this.isHost,
      mesh: true,
      localPeerId: localId,
      peers: Array.from(finalMembersMap.values()),
    };
  }

  _handlePeerJoined(peerId, socket) {
    diagService.log("info", "P2P", `Peer joined: ${peerId}`);
    this.voiceService.handlePeerJoined(peerId, socket);

    if (this.localActivity && this.localActivity.name) {
      if (this.p2pService.profile && this.p2pService.profile.showRichPresence === false) {
        // No enviar si el usuario desactivó la presencia
      } else {
        safeWriteSocket(socket, encodeMessage("activity-state", this.localActivity));
      }
    }

    this._emitPeerProfile(peerId);
    const activeRooms = this.rooms.size > 0 ? [...this.rooms.keys()] : (this.roomCode ? [this.roomCode] : []);
    for (const code of activeRooms) {
      this.chatService.scheduleSync(peerId, code);
    }
  }

  _handlePeerLeft(peerId) {
    diagService.log("info", "P2P", `Peer left: ${peerId}`);
    this._callbacks.onPeerLeft?.({ id: peerId });
    this.voiceService.handlePeerLeft(peerId, () => this._emitVoiceState());
    this.fileService.handlePeerLeft(peerId);
    // Note: _emitVoiceState is already called inside voiceService.handlePeerLeft via callback
  }

  _emitPeerProfile(peerId) {
    const peer = this.p2pService.peers.get(peerId);
    if (!peer) return;
    this._callbacks.onPeerJoined?.({
      id: peer.userId || peerId,
      peerId: peerId,
      userId: peer.userId,
      nickname: peer.nickname,
      avatar: peer.avatar,
      flame: peer.flame,
      customLink: peer.customLink,
      profileColor: peer.profileColor,
      customStatus: peer.customStatus,
      showRichPresence: peer.showRichPresence,
      activity: peer.activity || null,
      ping: peer.averagePing !== undefined ? Math.round(peer.averagePing) : (peer.ping !== undefined ? Math.round(peer.ping) : null),
    });
  }

  async _handleMessage(peerId, type, payload) {
    const peer = this.p2pService.peers.get(peerId);
    if (!peer) return;

    if (type === "profile" && payload) {
      // 🛑 Anti-Moderation Security Firewall: Check if the peer is banned or kicked
      let isBanned = false;
      let isKicked = false;
      try {
        // FIX 5: Use in-memory cache instead of reading disk on every profile message.
        // Cache is populated at room join and invalidated on every meta-update.
        const cache = this._moderationCache;
        if (cache) {
          isBanned = cache.bannedUsers.includes(payload.id);
          const kickTime = cache.kickedUsers[payload.id];
          const memberJoinTime = cache.kickedUsers?._joinTimes?.[payload.id] || 0;
          isKicked = kickTime && kickTime > memberJoinTime;
        } else if (this.roomMetaStore && this.roomCode) {
          // Fallback to disk if cache not yet populated
          const meta = await this.roomMetaStore.load(this.roomCode);
          isBanned = Array.isArray(meta.bannedUsers) && meta.bannedUsers.includes(payload.id);
          const kickTime = meta.kickedUsers?.[payload.id];
          const memberJoinTime = meta.savedMembers?.[payload.id]?.joinedAt || 0;
          isKicked = kickTime && kickTime > memberJoinTime;
        }
      } catch (err) {
        console.error("[RoomManager Firewall Error] Checking peer bans:", err.message);
      }

      if (isBanned || isKicked) {
        console.warn(`[RoomManager Firewall] Rejecting penalized user ID: ${payload.id} (Banned: ${isBanned}, Kicked: ${isKicked})`);
        this.p2pService._removePeer(peerId);
        return;
      }

      if (this.roomMetaStore && this.roomCode && payload.id) {
        this.roomMetaStore
          .load(this.roomCode)
          .then(async (meta) => {
            if (!meta.savedMembers) meta.savedMembers = {};
            const antiguo = meta.savedMembers[payload.id];
            if (
              !antiguo ||
              antiguo.nickname !== payload.nickname ||
              antiguo.avatar !== payload.avatar ||
              !antiguo.joinedAt
            ) {
              meta.savedMembers[payload.id] = {
                id: payload.id,
                nickname: payload.nickname,
                avatar: payload.avatar,
                updatedAt: Date.now(),
                joinedAt: antiguo?.joinedAt || antiguo?.updatedAt || Date.now(),
              };
              await this.roomMetaStore.updateSavedMembers(
                this.roomCode,
                meta.savedMembers
              );
            }
          })
          .catch((err) => console.error("[RoomManager] Error:", err.message));
      }

      this._emitPeerProfile(peerId);
      if (peer.voiceState?.channelId) this._emitVoiceState();

      if (this._callbacks.onPeerUpdated) {
        this._callbacks.onPeerUpdated({
          id: peer.userId,
          peerId: peer.id,
          nickname: peer.nickname,
          avatar: peer.avatar,
          online: true,
          activity: peer.activity || null,
          customLink: peer.customLink,
          profileColor: peer.profileColor,
          customStatus: peer.customStatus,
          showRichPresence: peer.showRichPresence,
          flame: peer.flame,
          ping: peer.averagePing !== undefined ? Math.round(peer.averagePing) : (peer.ping !== undefined ? Math.round(peer.ping) : null),
        });
      }
    } else if (type === "voice-state" && payload) {
      this.voiceService.handleVoiceState(peerId, payload, () => this._emitVoiceState());
    } else if (type === "activity-state" && payload) {
      if (payload.name) {
        peer.activity = payload;
      } else {
        delete peer.activity;
      }
      this._callbacks.onPeerActivityUpdated?.({
        peerId,
        userId: peer.userId,
        activity: peer.activity || null,
      });
    } else if (type === "typing-state" && payload) {
      this._callbacks.onUserTyping?.({
        userId: payload.userId,
        channelId: payload.channelId,
        nickname: payload.nickname,
      });
    } else if (type === "chat" && payload) {
      this.chatService.handleIncomingChat(payload, peerId).catch((err) =>
        console.error("[p2p] chat error", err.message)
      );
    } else if (type === "chat-delete" && payload) {
      this.chatService.handleIncomingChatDelete(payload, peerId).catch((err) =>
        console.error("[p2p] chat-delete error", err.message)
      );
    } else if (type === "sync-req" && payload) {
      const syncRoomCode = payload?.roomCode || this.roomCode;
      this.chatService.handleSyncRequest(peerId, payload, syncRoomCode).catch((err) =>
        console.error("[p2p] sync-req error", err.message)
      );
    } else if (type === "sync-res" && payload) {
      const syncRoomCode = payload?.roomCode || this.roomCode;
      this.chatService.handleSyncResponse(peerId, payload, syncRoomCode).catch((err) =>
        console.error("[p2p] sync-res error", err.message)
      );
    } else if (type === "meta-update" && payload) {
      const metaRoomCode = payload?.roomCode || this.roomCode;
      this.chatService.applyRemoteMeta(payload, peerId, metaRoomCode).catch((err) =>
        console.error("[p2p] meta error", err.message)
      );
    } else if (type === "webrtc-signal" && payload) {
      if (!payload?.signal) return;
      this._callbacks.onVoiceSignal?.({
        peerId: peerId,
        fromPeerId: peerId,
        channelId: payload.channelId,
        signal: payload.signal,
      });
    } else if (type === "speaking-state" && payload) {
      global.mainWindow?.webContents.send("voice:speaking-updated", {
        peerId: payload.peerId,
        isSpeaking: Boolean(payload.isSpeaking),
        volumeLevel: Number(payload.volumeLevel),
      });
    } else if (type === "sketch-draw" && payload) {
      global.mainWindow?.webContents.send("sketch:draw", payload);
    } else if (type === "file-request-port" && payload) {
      this.fileService.handleFileRequestPort(peerId, payload);
    } else if (type === "file-response-chunk" && payload) {
      this.fileService.handleFileResponseChunk(peerId, payload);
    } else if (type === "file-response-error" && payload) {
      this.fileService.handleFileResponseError(payload);
    } else if (type === "file-cancel-transfer" && payload) {
      this.fileService.handleFileCancelTransfer(peerId, payload);
    } else if (type === "sticker-request" && payload) {
      this.chatService.handleStickerRequest(peerId, payload);
    } else if (type === "sticker-response" && payload) {
      this.chatService.handleStickerResponse(payload);
    } else if (type === "sfu-host-claim" && payload) {
      this.voiceService.handleSfuHostClaim(peerId, payload);
    } else if (type === "music-channel-state" && payload) {
      global.mainWindow?.webContents.send("music:channel-state", {
        ...payload,
        peerId,
      });
    } else if (type === "music-channel-cmd" && payload) {
      global.mainWindow?.webContents.send("music:channel-cmd", {
        ...payload,
        peerId,
      });
    } else if (type === "ping" && payload) {
      this.voiceService.handlePing(peerId, payload);
    } else if (type === "pong" && payload) {
      this.voiceService.handlePong(peerId, payload, this.p2pService.profile, () => this._emitVoiceState());
      const pObj = this.p2pService.peers.get(peerId);
      if (pObj && this._callbacks.onPeerUpdated) {
        this._callbacks.onPeerUpdated({
          id: pObj.userId,
          peerId: pObj.id,
          nickname: pObj.nickname,
          avatar: pObj.avatar,
          online: true,
          activity: pObj.activity || null,
          customLink: pObj.customLink,
          profileColor: pObj.profileColor,
          customStatus: pObj.customStatus,
          showRichPresence: pObj.showRichPresence,
          flame: pObj.flame,
          ping: pObj.averagePing !== undefined ? Math.round(pObj.averagePing) : (pObj.ping !== undefined ? Math.round(pObj.ping) : null),
        });
      }
    } else if (type === "diag-request" && payload) {
      diagService.log("info", "Diagnostics", `Received log request from peer ${peerId}`);
      const sanitizedLogs = diagService.sanitizeLogs(diagService.getLocalLogs());
      this.p2pService._sendToPeer(peerId, "diag-response", {
        requestId: payload.requestId,
        nickname: this.profile?.nickname || "Peer",
        logs: sanitizedLogs,
      });
    } else if (type === "diag-response" && payload) {
      diagService.log("info", "Diagnostics", `Received logs response from peer ${peerId}`);
      if (this._peerLogListener) {
        this._peerLogListener({
          peerId,
          nickname: payload.nickname,
          logs: payload.logs,
        });
      }
      global.mainWindow?.webContents.send("diagnostics:peer-logs", {
        peerId,
        nickname: payload.nickname,
        logs: payload.logs,
      });
    } else if (type === "onicord:widget-p2p" && payload) {
      try {
        const pluginSandboxService = require("../services/pluginSandboxService.cjs");
        pluginSandboxService.handleIncomingWidgetP2PData(peerId, payload);
      } catch (err) {
        console.error("[p2p] onicord:widget-p2p error:", err.message);
      }
    }
  }

  requestPeerDiagnostics(peerId) {
    if (!this.roomCode) return;
    diagService.log("info", "Diagnostics", `Requesting diagnostics from peer: ${peerId}`);
    const requestId = crypto.randomUUID();
    this.p2pService._sendToPeer(peerId, "diag-request", { requestId });
  }

  async collectAllPeerLogs(timeoutMs = 2000) {
    if (!this.p2pService || !this.p2pService.peers) return [];

    const activePeers = [];
    for (const [pId, peerObj] of this.p2pService.peers.entries()) {
      if (peerObj && peerObj.online !== false) {
        activePeers.push({
          socketId: pId,
          peerId: peerObj.userId || peerObj.peerId || pId,
          nickname: peerObj.nickname || "Peer",
        });
      }
    }

    if (activePeers.length === 0) return [];

    const results = [];
    const pendingSocketIds = new Set(activePeers.map((p) => p.socketId));

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve(results);
      }, timeoutMs);

      const peerLogListener = (data) => {
        if (data && data.peerId && pendingSocketIds.has(data.peerId)) {
          pendingSocketIds.delete(data.peerId);
          const pInfo = activePeers.find((p) => p.socketId === data.peerId);
          results.push({
            peerId: data.peerId,
            nickname: data.nickname || pInfo?.nickname || "Peer",
            logs: data.logs || [],
          });
          if (pendingSocketIds.size === 0) {
            cleanup();
            resolve(results);
          }
        }
      };
      this._peerLogListener = peerLogListener;

      const cleanup = () => {
        clearTimeout(timer);
        this._peerLogListener = null;
      };

      for (const p of activePeers) {
        const requestId = crypto.randomUUID();
        this.p2pService._sendToPeer(p.socketId, "diag-request", { requestId });
      }
    });
  }
}

module.exports = { RoomManager, generateRoomCode, topicFromRoomCode };
