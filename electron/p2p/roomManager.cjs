const crypto = require("crypto");
const { ChatStore } = require("./chatStore.cjs");
const { RoomMetaStore } = require("./roomMetaStore.cjs");
const { FileIndexStore } = require("./fileIndexStore.cjs");
const { P2PService, encodeMessage, topicFromRoomCode, safeWriteSocket } = require("../network/p2pService.cjs");
const { VoiceService } = require("../network/voiceService.cjs");
const { ChatService } = require("../network/chatService.cjs");
const { FileService } = require("../network/fileService.cjs");
const diagService = require("../services/diagService.cjs");
const { handleChatPacket } = require("./handlers/chatPacketHandlers.cjs");
const { handleVoicePacket } = require("./handlers/voicePacketHandlers.cjs");
const { handleFilePacket } = require("./handlers/filePacketHandlers.cjs");
const { handleMetaPacket } = require("./handlers/metaPacketHandlers.cjs");

// topicFromRoomCode is now imported from p2pService.cjs (single source of truth)

function generateRoomCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

class RoomManager {
  constructor({
    userDataPath,
    onPeerJoined,
    onMemberFirstJoined,
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
      onMemberFirstJoined,
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
      userDataPath,
      this.roomMetaStore
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
      if (peer.isPreview) continue;
      const rooms = this.p2pService.peerRooms.get(peerId);
      if (rooms && rooms.has(normalized)) {
        result.push(peer);
      }
    }
    return result;
  }

  isPeerInRoom(peerId, roomCode = this.roomCode) {
    const normalized = String(roomCode || "").trim().toUpperCase();
    if (!normalized || !this.p2pService) return false;
    const peer = this.p2pService.peers.get(peerId);
    if (!peer || peer.isPreview) return false;
    const rooms = this.p2pService.peerRooms.get(peerId);
    return Boolean(rooms && rooms.has(normalized));
  }

  getVoiceSnapshot() {
    return this.voiceService.getVoiceSnapshot(this.p2pService.profile);
  }

  _emitVoiceState() {
    this._callbacks.onVoiceStateUpdated?.(this.getVoiceSnapshot());
  }

  _getEffectiveVoiceProfile() {
    const profile = this.p2pService?.profile;
    if (!profile) return null;
    try {
      const profileService = require("../services/profileService.cjs");
      return profileService.getEffectiveProfile(profile, this.roomCode) || profile;
    } catch {
      return profile;
    }
  }

  setStreamingState(isStreaming) {
    this.voiceService.setStreamingState(isStreaming, this._getEffectiveVoiceProfile(), () => this._emitVoiceState());
  }

  joinVoice(channelId, options = {}) {
    const opts = { roomCode: this.roomCode, ...options };
    this.voiceService.joinVoice(channelId, this._getEffectiveVoiceProfile(), () => this._emitVoiceState(), opts);
  }

  leaveVoice() {
    this.voiceService.leaveVoice(this._getEffectiveVoiceProfile(), () => this._emitVoiceState());
  }

  setVoiceMuted(muted) {
    this.voiceService.setVoiceMuted(muted, this._getEffectiveVoiceProfile(), () => this._emitVoiceState());
  }

  setVoiceDeafened(deafened) {
    this.voiceService.setVoiceDeafened(deafened, this._getEffectiveVoiceProfile(), () => this._emitVoiceState());
  }

  relayVoiceSignal(toPeerId, channelId, signal) {
    this.voiceService.relayVoiceSignal(toPeerId, channelId, signal);
  }

  claimVoiceHost() {
    this.voiceService.claimVoiceHost(() => this._emitVoiceState());
  }

  updateVoiceStreamIds(audioStreamId, videoStreamId, bandwidth) {
    this.voiceService.updateVoiceStreamIds(audioStreamId, videoStreamId, bandwidth, this._getEffectiveVoiceProfile(), () => this._emitVoiceState());
  }

  async publishServerMeta(patch, roomCode) {
    const localUserId = this.p2pService.profile?.id || this.p2pService._resolveLocalPeerId();
    return this.chatService.publishServerMeta(patch, localUserId, roomCode || this.roomCode);
  }

  async sendChatMessage(channelId, text, roomCode) {
    return this.chatService.sendChatMessage(channelId, text, roomCode || this.roomCode);
  }

  async sendWebhookMessage(params) {
    return this.chatService.sendWebhookMessage(params);
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

  broadcastWatchPartyState(channelId, state, roomCode = null) {
    const targetRoom = roomCode || this.roomCode;
    if (!this.p2pService || !targetRoom || !channelId) return;
    this.p2pService._broadcast(
      "watch-party-state",
      {
        channelId,
        state,
        roomCode: targetRoom,
        senderPeerId: this.p2pService._resolveLocalPeerId(),
      },
      targetRoom
    );
  }

  sendWatchPartyCommand(channelId, command, roomCode = null) {
    const targetRoom = roomCode || this.roomCode;
    if (!this.p2pService || !targetRoom || !channelId) return;
    this.p2pService._broadcast(
      "watch-party-cmd",
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
    if (this.roomCode) {
      this.onServerProfileUpdated(this.roomCode, profile).catch(console.error);
    }
    if (this.voiceService.localVoice?.channelId) {
      this.voiceService._broadcastLocalVoiceState(this._getEffectiveVoiceProfile());
      this._emitVoiceState();
    }
    if (this.localActivity !== undefined) {
      this.setLocalActivity(this.localActivity);
    }
  }

  async onServerProfileUpdated(targetRoomCode, updatedFullProfile) {
    const code = String(targetRoomCode).trim().toUpperCase();
    if (!this.p2pService) return;
    const currentCode = this.roomCode ? String(this.roomCode).trim().toUpperCase() : null;

    if (currentCode === code || (this.rooms && this.rooms.has(code))) {
      let effective = updatedFullProfile;
      try {
        const profileService = require("../services/profileService.cjs");
        effective = profileService.getEffectiveProfile(updatedFullProfile, code) || updatedFullProfile;
      } catch (e) {
        console.error("[RoomManager] Error resolving effective profile:", e);
      }

      if (this.roomMetaStore && effective?.id) {
        try {
          const meta = await this.roomMetaStore.load(code);
          if (!meta.savedMembers) meta.savedMembers = {};
          const oldMember = meta.savedMembers[effective.id];
          meta.savedMembers[effective.id] = {
            ...(oldMember || {}),
            id: effective.id,
            nickname: effective.nickname,
            avatar: effective.avatar,
            customLink: effective.customLink || "",
            profileColor: effective.profileColor || "",
            customStatus: effective.customStatus || "",
            globalNickname: updatedFullProfile.nickname || null,
            updatedAt: Date.now(),
            joinedAt: oldMember?.joinedAt || Date.now(),
          };
          await this.roomMetaStore.updateSavedMembers(code, meta.savedMembers);
          this._callbacks.onServerMetaUpdated?.(code, meta);
        } catch (err) {
          console.error("[RoomManager] Error saving server profile in savedMembers:", err.message);
        }
      }

      this.p2pService._broadcast("member-profile-update", {
        roomCode: code,
        memberData: {
          id: effective.id,
          nickname: effective.nickname,
          avatar: effective.avatar,
          customLink: effective.customLink || "",
          profileColor: effective.profileColor || "",
          customStatus: effective.customStatus || "",
          globalNickname: updatedFullProfile.nickname || null,
          updatedAt: Date.now(),
        },
      }, code);

      if (this.voiceService.localVoice?.channelId) {
        this.voiceService._broadcastLocalVoiceState(effective);
        this._emitVoiceState();
      }
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

  async requestFileDownload(fileId, targetPath, fileName, fileSize, options = {}) {
    return this.fileService.requestFileDownload(fileId, targetPath, fileName, fileSize, options);
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

  async connectToRoom(code, isHost, profile, options = {}) {
    const normalized = String(code).trim().toUpperCase();
    if (!/^[A-F0-9]{8}$/.test(normalized)) {
      throw new Error("Código inválido.");
    }

    const isBackground = Boolean(options?.isBackground);

    console.log(
      `\n============ [ROOM CORE CONNECT] STARTING ROOM: ${normalized} (bg=${isBackground}, preview=${this.isPreview}) ============`
    );

    const joinNow = Date.now();
    this.rooms.set(normalized, {
      roomCode: normalized,
      isHost: Boolean(isHost),
      localJoinTimestamp: joinNow,
    });

    if (!isBackground) {
      this.roomCode = normalized;
      this.p2pService.roomCode = normalized;
      this.isHost = Boolean(isHost);
      this.localJoinTimestamp = joinNow;
      this.fileService.setRoomCode(normalized);
    }

    diagService.log("info", "P2P", `Starting connection to room: ${normalized} (Host: ${isHost}, bg: ${isBackground})`);

    this.chatService.addRoomCode(normalized);

    if (!this.isPreview) {
      this.fileService.initFileServer();
    }

    // Add normalized roomCode to joinedRooms BEFORE setting profile so any socket connecting during joinRoom receives the complete room list
    this.p2pService.joinedRooms.add(normalized);

    const effectiveProfileForP2P = this.isPreview
      ? { ...(profile || {}), isPreview: true }
      : profile;
    this.p2pService.setProfile(effectiveProfileForP2P, this.fileService.fileServerPort);

    if (!isBackground && !this.isPreview) {
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
    }

    await this.p2pService.joinRoom(normalized, { waitFlush: Boolean(options?.waitFlush) });
    if (this.p2pService.profile) {
      this.p2pService.profile.joinedRooms = Array.from(this.p2pService.joinedRooms);
      this.p2pService._broadcast("profile", this.p2pService.profile);
    }

    try {
      if (this.roomMetaStore && profile?.id && !this.isPreview) {
        let meta = await this.roomMetaStore.load(normalized);
        const isAlreadyMember = Boolean(meta.savedMembers && meta.savedMembers[profile.id]?.joinedAt);

        // If user is not the host and joins for the first time (or rejoins without previous membership),
        // reset local metadata to version 0 to allow clean initial synchronization from the host.
        if (!isHost && !isAlreadyMember) {
          console.log(`[RoomManager] Primera unión detectada para ${normalized}. Inicializando metadata limpia para sync desde Host...`);
          const freshMeta = {
            roomCode: normalized,
            version: 0,
            updatedAt: 0,
            updatedBy: null,
            ownerId: null,
            creatorId: null,
            creatorID: null,
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
          await this.roomMetaStore.save(normalized, freshMeta);
        }

        if (!isBackground) {
          this._moderationCache = {
            bannedUsers: Array.isArray(meta.bannedUsers) ? meta.bannedUsers : [],
            kickedUsers: meta.kickedUsers || {},
          };
        }
        const roomEntry = this.rooms.get(normalized);
        if (roomEntry) {
          roomEntry.moderationCache = {
            bannedUsers: Array.isArray(meta.bannedUsers) ? meta.bannedUsers : [],
            kickedUsers: meta.kickedUsers || {},
          };
        }

        let effective = profile;
        try {
          const profileService = require("../services/profileService.cjs");
          effective = profileService.getEffectiveProfile(profile, normalized) || profile;
        } catch {}

        if (!meta.savedMembers) meta.savedMembers = {};
        let clearedSelfKick = false;
        if (meta.kickedUsers && meta.kickedUsers[profile.id]) {
          delete meta.kickedUsers[profile.id];
          clearedSelfKick = true;
        }
        const oldMember = meta.savedMembers[profile.id];
        meta.savedMembers[profile.id] = {
          id: profile.id,
          nickname: effective.nickname,
          avatar: effective.avatar,
          customLink: effective.customLink || "",
          profileColor: effective.profileColor || "",
          customStatus: effective.customStatus || "",
          globalNickname: profile.nickname || null,
          updatedAt: Date.now(),
          joinedAt: clearedSelfKick ? Date.now() : (oldMember?.joinedAt || oldMember?.updatedAt || Date.now()),
        };
        if (isHost && (!meta.ownerId || !meta.creatorID)) {
          const patch = {
            savedMembers: meta.savedMembers,
            ownerId: meta.ownerId || profile.id,
            creatorId: meta.creatorID || meta.creatorId || profile.id,
            creatorID: meta.creatorID || meta.creatorId || profile.id,
          };
          await this.roomMetaStore.bump(normalized, patch, "local");
        } else if (clearedSelfKick) {
          await this.roomMetaStore.save(normalized, meta);
        } else {
          await this.roomMetaStore.updateSavedMembers(normalized, meta.savedMembers);
        }

        if (effective.isServerProfile) {
          this.p2pService._broadcast("member-profile-update", {
            roomCode: normalized,
            memberData: {
              id: effective.id,
              nickname: effective.nickname,
              avatar: effective.avatar,
              customLink: effective.customLink || "",
              profileColor: effective.profileColor || "",
              customStatus: effective.customStatus || "",
              globalNickname: profile.nickname || null,
              updatedAt: Date.now(),
            },
          }, normalized);
        }
      }
    } catch (e) {
      console.error("[RoomManager] Error guardando metadatos de miembro:", e.message);
    }

    // Proactively sync and emit profiles for peers ALREADY connected over shared sockets (e.g. another shared server or global discovery)
    if (!this.isPreview && this.p2pService?.peers) {
      for (const [peerId, peer] of this.p2pService.peers.entries()) {
        if (!peer || !peer.userId || peer.isPreview) continue;
        if (this.isPeerInRoom(peerId, normalized)) {
          peer.syncRequestedRooms?.delete(normalized);
          this.chatService.scheduleSync(peerId, normalized);
          if (!isBackground && this.roomCode === normalized) {
            this._emitPeerProfile(peerId);
          }
        }
      }
    }

    if (!isBackground && !this.isPreview) {
      if (this.isHost) {
        this._callbacks.onRoomCreated?.({ code: normalized });
      } else {
        this._callbacks.onRoomJoined?.({ code: normalized });
      }
    }

    console.log(
      `[Room Core Success] Sala ${normalized} inicializada al 100% con base de datos activa.\n`
    );
    if (!this.isPreview) {
      this.startRoomPingInterval();
      this.startPeriodicMetaSync();
    }

    return { code: normalized, isHost: Boolean(isHost), mesh: true };
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
        for (const activeCode of activeRoomCodes) {
          const meta = await this.roomMetaStore?.load(activeCode);
          const chatWatermarks = (await this.chatStore?.getWatermarks(activeCode)) || {};
          const watermarks = {
            ...chatWatermarks,
            _metaVersion: meta?.version || 0,
            _metaUpdatedAt: meta?.updatedAt || 0,
          };
          const files = (await this.fileIndexStore?.load(activeCode)) || [];
          const filesSince = this.fileIndexStore?.getWatermark(files) || 0;

          for (const [peerId, peer] of this.p2pService.peers.entries()) {
            if (!this.isPeerInRoom(peerId, activeCode)) continue;
            if (peer?.socket && !peer.socket.destroyed && !(peer.syncBusyRooms && peer.syncBusyRooms.has(activeCode))) {
              this.p2pService._sendToPeer(peerId, "sync-req", {
                watermarks,
                filesSince,
                from: this.p2pService._resolveLocalPeerId(),
                roomCode: activeCode,
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

  async leaveSingleRoom(roomCode) {
    const normalized = String(roomCode || this.roomCode || "").trim().toUpperCase();
    if (!normalized) return;

    console.log(`[Room Core] Abandonando sala individual: ${normalized}...`);

    if (this.roomCode && String(this.roomCode).trim().toUpperCase() === normalized) {
      this.leaveVoice();
      this.voiceService.stopPingInterval();
      this.fileService.setRoomCode(null);
      this.roomCode = null;
      this.isHost = false;
      this._moderationCache = null;
    }

    this.rooms.delete(normalized);
    this.chatService.clearRoomCode(normalized);
    await this.p2pService.leaveRoom(normalized);

    if (this.rooms.size === 0 && !this.roomCode) {
      this.stopRoomPingInterval();
      this.stopPeriodicMetaSync();
    }
  }

  async leaveRoom() {
    console.log(
      "[Room Core] Desconectando sala y purgando descriptores físicos de red..."
    );

    this.stopRoomPingInterval();
    this.stopPeriodicMetaSync();
    this.voiceService.stopPingInterval();
    if (this.roomCode) {
      this.chatService.clearRoomCode(this.roomCode);
    }
    this.fileService.setRoomCode(null);

    if (this.roomCode) {
      await this.p2pService.leaveRoom(this.roomCode);
    }
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
      .filter((p) => p.userId !== null && !p.isPreview && this.isPeerInRoom(p.id, this.roomCode))
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
        // Do not broadcast if user disabled Rich Presence
      } else {
        safeWriteSocket(socket, encodeMessage("activity-state", this.localActivity));
      }
    }

    // Do NOT emit peer profile or sync rooms here: the raw socket is not yet authenticated with a profile
    // and we do not know which rooms the peer belongs to yet. Sync and server profiles are triggered in
    // _handleMessage("profile") for sharedRooms once verified.
  }

  _handlePeerLeft(peerId) {
    diagService.log("info", "P2P", `Peer left: ${peerId}`);
    this._callbacks.onPeerLeft?.({ id: peerId, peerId });
    this.voiceService.handlePeerLeft(peerId, () => this._emitVoiceState());
    this.fileService.handlePeerLeft(peerId);
    // Note: _emitVoiceState is already called inside voiceService.handlePeerLeft via callback
  }

  _emitPeerProfile(peerId) {
    const peer = this.p2pService.peers.get(peerId);
    if (!peer) return;

    let effectiveNickname = peer.nickname;
    let effectiveAvatar = peer.avatar;
    let effectiveCustomLink = peer.customLink;
    let effectiveProfileColor = peer.profileColor;
    let effectiveCustomStatus = peer.customStatus;
    let effectiveGlobalNick = peer.nickname;

    const roomCodeKey = this.roomCode ? String(this.roomCode).trim().toUpperCase() : null;
    if (this.roomMetaStore && roomCodeKey) {
      const cached = this.roomMetaStore._cache?.get(roomCodeKey);
      const savedMember = cached?.savedMembers?.[peer.userId];
      if (savedMember) {
        effectiveNickname = savedMember.nickname || effectiveNickname;
        if (savedMember.avatar !== undefined) effectiveAvatar = savedMember.avatar;
        if (savedMember.customLink !== undefined) effectiveCustomLink = savedMember.customLink;
        if (savedMember.profileColor) effectiveProfileColor = savedMember.profileColor;
        if (savedMember.customStatus !== undefined) effectiveCustomStatus = savedMember.customStatus;
        if (savedMember.globalNickname) effectiveGlobalNick = savedMember.globalNickname;
      }
    }

    if (roomCodeKey && peer.serverProfiles) {
      const override = peer.serverProfiles[roomCodeKey] || peer.serverProfiles[this.roomCode];
      if (override) {
        effectiveNickname = override.nickname || effectiveNickname;
        if (override.avatar !== undefined && override.avatar !== null && override.avatar !== "") {
          effectiveAvatar = override.avatar;
        }
        if (override.customLink !== undefined) effectiveCustomLink = override.customLink;
        if (override.profileColor) effectiveProfileColor = override.profileColor;
        if (override.customStatus !== undefined) effectiveCustomStatus = override.customStatus;
      }
    }

    this._callbacks.onPeerJoined?.({
      id: peer.userId || peerId,
      peerId: peerId,
      userId: peer.userId,
      nickname: effectiveNickname,
      avatar: effectiveAvatar,
      globalNickname: effectiveGlobalNick,
      serverProfiles: peer.serverProfiles || null,
      flame: peer.flame,
      customLink: effectiveCustomLink,
      profileColor: effectiveProfileColor,
      customStatus: effectiveCustomStatus,
      showRichPresence: peer.showRichPresence,
      activity: peer.activity || null,
      ping: peer.averagePing !== undefined ? Math.round(peer.averagePing) : (peer.ping !== undefined ? Math.round(peer.ping) : null),
    });
  }

  async _handleMessage(peerId, type, payload) {
    const peer = this.p2pService.peers.get(peerId);
    if (!peer) return;

    if (type === "profile" && payload) {
      const peerJoinedRooms = Array.isArray(payload.joinedRooms)
        ? payload.joinedRooms.map((r) => String(r || "").trim().toUpperCase()).filter(Boolean)
        : [];
      const activeRooms = this.rooms.size > 0 ? [...this.rooms.keys()] : (this.roomCode ? [this.roomCode] : []);
      const sharedRooms = activeRooms.filter((code) => peerJoinedRooms.includes(code));

      if (!payload.isPreview) {
        try {
          const discoverService = require("../services/discoverService.cjs");
          discoverService.syncAndAnnounceLocalServers(peerId).catch(() => {});
        } catch (_) {}
      }

      if (payload.isPreview || !payload.id) {
        if (this.roomMetaStore) {
          for (const code of sharedRooms) {
            this.roomMetaStore.load(code).then((meta) => {
              if (meta) {
                const { webhooks: _wh, ...safeMeta } = meta;
                this.p2pService._sendToPeer(peerId, "meta-update", {
                  ...safeMeta,
                  webhooks: [],
                  roomCode: code,
                });
              }
            }).catch(() => {});
          }
        }
        return;
      }

      if (sharedRooms.length === 0) {
        return;
      }

      // 🛑 Anti-Moderation Security Firewall: Check if the peer is banned in any shared room
      const allowedSharedRooms = [];
      for (const code of sharedRooms) {
        let isBanned = false;
        try {
          const roomEntry = this.rooms.get(code);
          const cache = roomEntry?.moderationCache || (this.roomCode === code ? this._moderationCache : null);
          if (cache && Array.isArray(cache.bannedUsers)) {
            isBanned = cache.bannedUsers.includes(payload.id);
          } else if (this.roomMetaStore) {
            const meta = await this.roomMetaStore.load(code);
            isBanned = Array.isArray(meta.bannedUsers) && meta.bannedUsers.includes(payload.id);
          }
        } catch (err) {
          console.error("[RoomManager Firewall Error] Checking peer bans:", err.message);
        }

        if (isBanned) {
          console.warn(`[RoomManager Firewall] Rejecting banned user ID: ${payload.id} in room ${code}`);
          try {
            safeWriteSocket(peer.socket, encodeMessage("evict", {
              type: "banned",
              roomCode: code,
            }));
          } catch (_) {}
          const peerRoomSet = this.p2pService.peerRooms.get(peerId);
          if (peerRoomSet) peerRoomSet.delete(code);
        } else {
          allowedSharedRooms.push(code);
        }
      }

      if (allowedSharedRooms.length === 0) {
        return;
      }

      // Ensure the connecting/rejoining peer has our full up-to-date room list
      this.p2pService._sendToPeer(peerId, "room-announce", {
        rooms: Array.from(this.p2pService.joinedRooms),
      });

      // If we are currently connected to voice, announce our voice state to this newly authenticated peer
      if (this.voiceService?.localVoice?.channelId) {
        const localId = this.p2pService._resolveLocalPeerId();
        if (localId) {
          const effectiveProfile = this._getEffectiveVoiceProfile();
          const targetRoom = this.voiceService.localVoice.roomCode || this.roomCode || null;
          this.p2pService._sendToPeer(peerId, "voice-state", {
            peerId: localId,
            channelId: this.voiceService.localVoice.channelId,
            roomCode: targetRoom,
            muted: Boolean(this.voiceService.localVoice.muted),
            deafened: Boolean(this.voiceService.localVoice.deafened),
            nickname: effectiveProfile?.nickname || this.p2pService.profile?.nickname,
            avatar: effectiveProfile?.avatar || this.p2pService.profile?.avatar,
            isStreaming: Boolean(this.voiceService.localVoice.isStreaming),
            audioStreamId: this.voiceService.localVoice.audioStreamId || null,
            videoStreamId: this.voiceService.localVoice.videoStreamId || null,
            sfuScore: this.voiceService.localVoice.sfuScore || 0,
            bandwidth: this.voiceService.localVoice.bandwidth || 0,
            joinedAt: this.voiceService.localVoice.joinedAt || Date.now(),
          });
        }
      }

      if (this.roomMetaStore && payload.id) {
        for (const targetCode of allowedSharedRooms) {
          this.roomMetaStore
            .load(targetCode)
            .then(async (meta) => {
              if (!meta.savedMembers) meta.savedMembers = {};
              let clearedKick = false;
              if (meta.kickedUsers && meta.kickedUsers[payload.id]) {
                delete meta.kickedUsers[payload.id];
                clearedKick = true;
              }
              const antiguo = meta.savedMembers[payload.id];
              const isFirstJoin = !antiguo || !antiguo.joinedAt;

              let peerEffective = payload;
              try {
                const profileService = require("../services/profileService.cjs");
                peerEffective = profileService.getEffectiveProfile(payload, targetCode) || payload;
              } catch {}

              const hasExistingServerProfile = Boolean(
                antiguo?.hasCustomProfile ||
                (antiguo?.globalNickname && antiguo?.nickname !== antiguo?.globalNickname)
              );

              let targetNickname = payload.nickname;
              let targetAvatar = payload.avatar;
              let targetCustomLink = payload.customLink || "";
              let targetProfileColor = payload.profileColor || "";
              let targetCustomStatus = payload.customStatus || "";
              let targetHasCustom = false;

              if (peerEffective && peerEffective.isServerProfile) {
                targetNickname = peerEffective.nickname;
                targetAvatar = peerEffective.avatar;
                targetCustomLink = peerEffective.customLink || "";
                targetProfileColor = peerEffective.profileColor || "";
                targetCustomStatus = peerEffective.customStatus || "";
                targetHasCustom = true;
              } else if (hasExistingServerProfile) {
                targetNickname = antiguo.nickname;
                targetAvatar = antiguo.avatar;
                targetCustomLink = antiguo.customLink || "";
                targetProfileColor = antiguo.profileColor || "";
                targetCustomStatus = antiguo.customStatus || "";
                targetHasCustom = true;
              }

              const needsUpdate =
                clearedKick ||
                !antiguo ||
                !antiguo.joinedAt ||
                antiguo.nickname !== targetNickname ||
                antiguo.avatar !== targetAvatar ||
                antiguo.customLink !== targetCustomLink ||
                antiguo.profileColor !== targetProfileColor ||
                antiguo.customStatus !== targetCustomStatus ||
                antiguo.globalNickname !== payload.nickname;

              if (needsUpdate) {
                meta.savedMembers[payload.id] = {
                  ...(antiguo || {}),
                  id: payload.id,
                  nickname: targetNickname,
                  avatar: targetAvatar,
                  customLink: targetCustomLink,
                  profileColor: targetProfileColor,
                  customStatus: targetCustomStatus,
                  globalNickname: payload.nickname || antiguo?.globalNickname || null,
                  hasCustomProfile: targetHasCustom,
                  updatedAt: Date.now(),
                  joinedAt: clearedKick
                    ? Date.now()
                    : (antiguo?.joinedAt || antiguo?.updatedAt || Date.now()),
                };
                if (clearedKick) {
                  await this.roomMetaStore.save(targetCode, meta);
                  try {
                    const { ServerStore } = require("./serverStore.cjs");
                    const serverStore = new ServerStore(this.userDataPath);
                    const srv = await serverStore.getByRoomCode(targetCode);
                    if (srv && srv.kickedUsers && srv.kickedUsers[payload.id]) {
                      const nextKicked = { ...srv.kickedUsers };
                      delete nextKicked[payload.id];
                      await serverStore.updateSettings(srv.id, { kickedUsers: nextKicked });
                    }
                  } catch (_) {}

                  // If local user is owner/creator/admin, bump metadata version so all peers clear kickedUsers[payload.id]
                  const { checkAdminPermission } = require("./roomMetaStore.cjs");
                  const myId = this.profile?.id || this.p2pService.profile?.id;
                  const roomEntry = this.rooms.get(targetCode);
                  const isRoomHost = Boolean(roomEntry?.isHost || (this.roomCode === targetCode && this.isHost));
                  const hasAuthority =
                    isRoomHost ||
                    (myId && (meta.ownerId === myId || meta.creatorID === myId || checkAdminPermission(meta, myId)));
                  if (hasAuthority) {
                    const roomModCache = roomEntry?.moderationCache;
                    if (roomModCache) roomModCache.kickedUsers = meta.kickedUsers || {};
                    if (this.roomCode === targetCode && this._moderationCache) {
                      this._moderationCache.kickedUsers = meta.kickedUsers || {};
                    }
                    await this.publishServerMeta(
                      { kickedUsers: meta.kickedUsers || {}, savedMembers: meta.savedMembers },
                      targetCode
                    ).catch(() => {});
                  }
                } else {
                  await this.roomMetaStore.updateSavedMembers(
                    targetCode,
                    meta.savedMembers
                  );
                }
                this._callbacks.onServerMetaUpdated?.(targetCode, meta);
              }

              if (isFirstJoin) {
                if (this.roomCode === targetCode) {
                  this._callbacks.onMemberFirstJoined?.({
                    id: payload.id,
                    nickname: payload.nickname || "Usuario",
                    avatar: payload.avatar || null,
                    roomCode: targetCode,
                  });
                }

                const { checkAdminPermission } = require("./roomMetaStore.cjs");
                const myId = this.profile?.id;
                const roomEntry = this.rooms.get(targetCode);
                const isRoomHost = Boolean(roomEntry?.isHost || (this.roomCode === targetCode && this.isHost));
                const hasAuthority = isRoomHost || (myId && (meta.ownerId === myId || checkAdminPermission(meta, myId)));

                // 1. Auto-assign default role if enabled
                if (meta.defaultRoleSettings?.enabled && meta.defaultRoleSettings?.roleId && hasAuthority) {
                  const defRoleId = meta.defaultRoleSettings.roleId;
                  if (!meta.userRoles) meta.userRoles = {};
                  if (!meta.userRoles[payload.id] || meta.userRoles[payload.id].length === 0) {
                    meta.userRoles[payload.id] = [defRoleId];
                    await this.roomMetaStore.save(targetCode, meta);
                    const { ServerStore } = require("./serverStore.cjs");
                    const serverStore = new ServerStore(this.userDataPath);
                    await serverStore.applySyncedMeta(targetCode, meta);
                    this.publishServerMeta({ userRoles: meta.userRoles }, targetCode).catch(() => {});
                  }
                }

                // 2. Send welcome message if configured
                if (meta.welcomeSettings?.enabled && meta.welcomeSettings?.channelId) {
                  if (!this._welcomedUsers) this._welcomedUsers = new Set();
                  const welcomeKey = `${targetCode}:${payload.id}`;
                  if (!this._welcomedUsers.has(welcomeKey)) {
                    this._welcomedUsers.add(welcomeKey);
                    if (hasAuthority) {
                      const rawTemplate = (meta.welcomeSettings.template || "").trim();
                      const KNOWN_DEFAULT_TEMPLATES = [
                        "",
                        "¡Bienvenido {user} a {server}! 🎉",
                        "Welcome {user} to {server}! 🎉",
                        "Boas-vindas {user} ao {server}! 🎉",
                        "¡Bienvenido {user} a {server}!",
                        "Welcome {user} to {server}!",
                        "Boas-vindas {user} ao {server}!",
                      ];
                      const isDefault = KNOWN_DEFAULT_TEMPLATES.some(
                        (dt) => dt.toLowerCase() === rawTemplate.toLowerCase()
                      );
                      const template = isDefault
                        ? "¡Bienvenido {user} a {server}! 🎉"
                        : (rawTemplate || "¡Bienvenido {user} a {server}! 🎉");
                      const serverName = meta.name || "Servidor";
                      const userNick = payload.nickname || "Usuario";
                      const formattedText = template
                        .replace(/\{user\}/g, userNick)
                        .replace(/\{server\}/g, serverName);
                      const welcomeMsgId = `sys_welcome_${targetCode}_${payload.id}`;
                      this.chatService.sendSystemMessage(
                        meta.welcomeSettings.channelId,
                        formattedText,
                        targetCode,
                        {
                          id: welcomeMsgId,
                          systemType: "welcome",
                          systemData: {
                            userId: payload.id,
                            nickname: userNick,
                            avatar: payload.avatar || null,
                            serverName: serverName,
                            isDefaultTemplate: isDefault,
                          },
                        }
                      ).catch((err) => console.error("[RoomManager] Error sending welcome message:", err.message));
                    }
                  }
                }
              }
            })
            .catch((err) => console.error("[RoomManager] Error:", err.message));
        }
      }

      // Proactively reply to newly connected peer with our effective server profile and sync for shared rooms
      for (const code of allowedSharedRooms) {
        this.chatService.scheduleSync(peerId, code);
        try {
          const profileService = require("../services/profileService.cjs");
          const myEffective = profileService.getEffectiveProfile(this.p2pService.profile, code);
          if (myEffective) {
            this.p2pService._sendToPeer(peerId, "member-profile-update", {
              roomCode: code,
              memberData: {
                id: myEffective.id,
                nickname: myEffective.nickname,
                avatar: myEffective.avatar,
                customLink: myEffective.customLink || "",
                profileColor: myEffective.profileColor || "",
                customStatus: myEffective.customStatus || "",
                globalNickname: this.p2pService.profile?.nickname || null,
                hasCustomProfile: Boolean(myEffective.isServerProfile),
                updatedAt: Date.now(),
              },
            });
          }
        } catch (e) {
          console.error("[RoomManager] Error sending server profile to peer:", e.message);
        }
      }

      const activeRoomKey = this.roomCode ? String(this.roomCode).trim().toUpperCase() : null;
      if (activeRoomKey && allowedSharedRooms.includes(activeRoomKey)) {
        this._emitPeerProfile(peerId);
        if (peer.voiceState?.channelId) this._emitVoiceState();

        if (this._callbacks.onPeerUpdated) {
          let effectiveNickname = peer.nickname;
          let effectiveAvatar = peer.avatar;
          let effectiveCustomLink = peer.customLink;
          let effectiveProfileColor = peer.profileColor;
          let effectiveCustomStatus = peer.customStatus;
          let effectiveGlobalNick = peer.nickname;

          if (this.roomMetaStore && activeRoomKey) {
            const cached = this.roomMetaStore._cache?.get(activeRoomKey);
            const savedMember = cached?.savedMembers?.[peer.userId];
            if (savedMember) {
              effectiveNickname = savedMember.nickname || effectiveNickname;
              effectiveAvatar = savedMember.avatar !== undefined ? savedMember.avatar : effectiveAvatar;
              effectiveCustomLink = savedMember.customLink !== undefined ? savedMember.customLink : effectiveCustomLink;
              effectiveProfileColor = savedMember.profileColor || effectiveProfileColor;
              effectiveCustomStatus = savedMember.customStatus !== undefined ? savedMember.customStatus : effectiveCustomStatus;
              effectiveGlobalNick = savedMember.globalNickname || effectiveGlobalNick;
            }
          }

          if (activeRoomKey && peer.serverProfiles) {
            const override = peer.serverProfiles[activeRoomKey] || peer.serverProfiles[this.roomCode];
            if (override) {
              effectiveNickname = override.nickname || effectiveNickname;
              if (override.avatar !== undefined && override.avatar !== null && override.avatar !== "") {
                effectiveAvatar = override.avatar;
              }
              if (override.customLink !== undefined) effectiveCustomLink = override.customLink;
              if (override.profileColor) effectiveProfileColor = override.profileColor;
              if (override.customStatus !== undefined) effectiveCustomStatus = override.customStatus;
            }
          }

          this._callbacks.onPeerUpdated({
            id: peer.userId,
            peerId: peer.id,
            nickname: effectiveNickname,
            avatar: effectiveAvatar,
            online: true,
            activity: peer.activity || null,
            customLink: effectiveCustomLink,
            profileColor: effectiveProfileColor,
            customStatus: effectiveCustomStatus,
            globalNickname: effectiveGlobalNick,
            serverProfiles: peer.serverProfiles || null,
            showRichPresence: peer.showRichPresence,
            flame: peer.flame,
            ping: peer.averagePing !== undefined ? Math.round(peer.averagePing) : (peer.ping !== undefined ? Math.round(peer.ping) : null),
          });
        }
      }
    } else {
      if (await handleChatPacket(this, peerId, type, payload)) return;
      if (await handleVoicePacket(this, peerId, type, payload)) return;
      if (await handleFilePacket(this, peerId, type, payload)) return;
      if (await handleMetaPacket(this, peerId, type, payload)) return;
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
