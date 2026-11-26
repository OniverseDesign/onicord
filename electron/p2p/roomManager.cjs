const crypto = require("crypto");
const b4a = require("b4a");
const { ChatStore } = require("./chatStore.cjs");
const { WhiteboardStore } = require("./whiteboardStore.cjs");
const {
  RoomMetaStore,
  checkAdminPermission,
  isAuthorizedSignerKey,
  buildSignableActiveInvite,
  buildSignableKeyEnvelope,
} = require("./roomMetaStore.cjs");
const { FileIndexStore } = require("./fileIndexStore.cjs");
const { P2PService, encodeMessage, topicFromRoomCode, safeWriteSocket } = require("../network/p2pService.cjs");
const { VoiceService } = require("../network/voiceService.cjs");
const { ChatService } = require("../network/chatService.cjs");
const { FileService } = require("../network/fileService.cjs");
const diagService = require("../services/diagService.cjs");
const peerTrustService = require("../services/peerTrustService.cjs");
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
    onDiagConsentRequest,
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
    this._pendingDiagRequests = new Map();
    this._diagCooldownByPeer = new Map();
    this._roomSecrets = new Map();
    this._roomKeyRings = new Map();
    this._inviteExpiryTimers = new Map();
    this._pendingInviteRedeems = new Map();

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
      onDiagConsentRequest,
      onError,
      onUserTyping,
    };

    this.p2pService = new P2PService({
      userDataPath: this.userDataPath,
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

  getRoomSecret(roomCode) {
    const code = String(roomCode || "").trim().toUpperCase();
    if (!code) return null;
    if (this._roomSecrets.has(code)) return this._roomSecrets.get(code);
    if (!this.userDataPath) return null;
    try {
      const { ServerStore } = require("./serverStore.cjs");
      const srv = new ServerStore(this.userDataPath).getServerByRoomCodeSync(code);
      if (srv?.roomSecret) {
        this._roomSecrets.set(code, srv.roomSecret);
        return srv.roomSecret;
      }
    } catch {}
    return null;
  }

  getRoomKeyState(roomCode) {
    const code = String(roomCode || "").trim().toUpperCase();
    if (!code) return { currentEpoch: 1, keyRing: {}, keyEnvelopes: [] };

    let state = this._roomKeyRings.get(code);
    if (!state && this.userDataPath) {
      try {
        const { ServerStore } = require("./serverStore.cjs");
        const srv = new ServerStore(this.userDataPath).getServerByRoomCodeSync(code);
        if (srv) {
          const ring = srv.keyRing && typeof srv.keyRing === "object" ? { ...srv.keyRing } : {};
          if (srv.roomSecret && !ring["1"]) {
            ring["1"] = srv.roomSecret;
          }
          state = {
            currentEpoch: Math.max(1, Number(srv.currentKeyEpoch) || 1),
            keyRing: ring,
            keyEnvelopes: Array.isArray(srv.keyEnvelopes) ? srv.keyEnvelopes : [],
          };
          this._roomKeyRings.set(code, state);
        }
      } catch {}
    }

    if (!state) {
      const routingSecret = this.getRoomSecret(code);
      state = {
        currentEpoch: 1,
        keyRing: routingSecret ? { "1": routingSecret } : {},
        keyEnvelopes: [],
      };
      if (routingSecret) {
        this._roomKeyRings.set(code, state);
      }
    } else if (!state.keyRing["1"]) {
      const routingSecret = this.getRoomSecret(code);
      if (routingSecret) {
        state.keyRing["1"] = routingSecret;
      }
    }
    return state;
  }

  _clearInviteExpiryTimer(roomCode) {
    const code = String(roomCode || "").trim().toUpperCase();
    if (!code) return;
    const prevTimer = this._inviteExpiryTimers.get(code);
    if (prevTimer) {
      clearTimeout(prevTimer);
      this._inviteExpiryTimers.delete(code);
    }
  }

  _syncRoomInviteListener(roomCode, meta) {
    if (this.isPreview || !this.p2pService) return;
    const code = String(roomCode || "").trim().toUpperCase();
    if (!code) return;
    this._clearInviteExpiryTimer(code);

    const cryptoService = require("../services/cryptoService.cjs");
    const inv = meta?.activeInvite;
    if (!inv || inv.revoked || !cryptoService.isValidRoomSecret(inv.inviteSecret)) {
      this.p2pService.leaveInviteTopic?.(code).catch(() => {});
      return;
    }

    if (inv.expiresAt !== undefined && inv.expiresAt !== null) {
      const remainingMs = Number(inv.expiresAt) - Date.now();
      if (remainingMs <= 0) {
        this.p2pService.leaveInviteTopic?.(code).catch(() => {});
        return;
      }
      const delay = Math.min(remainingMs + 250, 2147483647);
      const timer = setTimeout(() => {
        this._inviteExpiryTimers.delete(code);
        this._syncRoomInviteListener(code, meta);
      }, delay);
      if (typeof timer.unref === "function") timer.unref();
      this._inviteExpiryTimers.set(code, timer);
    }

    this.p2pService.syncInviteTopic?.(code, inv.inviteSecret).catch((err) => {
      console.warn(`[RoomManager InviteTopic] Failed joining invite topic for ${code}:`, err.message);
    });
  }

  _resolveGovernanceSigner(roomCode, meta, actorProfile = null) {
    const code = String(roomCode || "").trim().toUpperCase();
    const myId = actorProfile?.id || this.profile?.id || this.p2pService?.profile?.id || null;
    const kp = this.p2pService?.getKeyPair?.() || this.p2pService?.swarm?.keyPair || null;
    const localPub =
      this.p2pService?._resolveLocalPeerId?.() ||
      (kp?.publicKey ? b4a.toString(kp.publicKey, "hex").toLowerCase() : null);

    const roomEntry = this.rooms.get(code);
    const isOwner = Boolean(
      roomEntry?.isHost ||
      (this.roomCode === code && this.isHost) ||
      (myId && meta && (meta.ownerId === myId || meta.creatorID === myId || meta.creatorId === myId))
    );
    const isAdmin = Boolean(myId && meta && checkAdminPermission(meta, myId));
    if (!isOwner && !isAdmin) {
      throw new Error("UNAUTHORIZED_GOVERNANCE");
    }

    const ownerPub =
      typeof meta?.ownerPublicKey === "string" && /^[0-9a-f]{64}$/i.test(meta.ownerPublicKey.trim())
        ? meta.ownerPublicKey.trim().toLowerCase()
        : null;

    if (ownerPub && localPub && localPub !== ownerPub && !isOwner) {
      if (!isAuthorizedSignerKey(meta, localPub)) {
        throw new Error("ADMIN_KEY_NOT_REGISTERED");
      }
    }

    return { kp, localPub, myId, isOwner };
  }

  _resolveAuditActorInfo(roomCode, meta, actorProfile = null, actorId = null) {
    const profileService = require("../services/profileService.cjs");
    const baseProfile =
      actorProfile ||
      profileService.activeProfile ||
      this.profile ||
      this.p2pService?.profile ||
      null;
    const effective = baseProfile
      ? profileService.getEffectiveProfile(baseProfile, roomCode) || baseProfile
      : null;
    const resolvedId = actorId || effective?.id || baseProfile?.id || "system";
    const savedMember = meta?.savedMembers?.[resolvedId];
    return {
      userId: resolvedId,
      nickname:
        effective?.nickname ||
        savedMember?.nickname ||
        baseProfile?.nickname ||
        "Admin",
      avatar:
        effective?.avatar ??
        savedMember?.avatar ??
        baseProfile?.avatar ??
        null,
    };
  }

  async rotateRoomKey(roomCode, { reason = "manual", actorId = null } = {}) {
    const code = String(roomCode || this.roomCode || "").trim().toUpperCase();
    if (!code || !this.userDataPath || !this.roomMetaStore) {
      throw new Error("INVALID_ROOM");
    }

    const cryptoService = require("../services/cryptoService.cjs");
    const meta = await this.roomMetaStore.load(code);
    const { kp, localPub, myId } = this._resolveGovernanceSigner(
      code,
      meta,
      actorId ? { id: actorId } : null
    );
    if (!kp?.secretKey || !localPub) {
      throw new Error("SIGNING_KEY_UNAVAILABLE");
    }

    const keyState = this.getRoomKeyState(code);
    const nextEpoch = Math.max(Number(keyState.currentEpoch) || 1, Number(meta?.currentKeyEpoch) || 1) + 1;
    const newSecret = crypto.randomBytes(32).toString("base64url");
    const now = Date.now();
    const resolvedActorId = actorId || myId || null;

    const envelope = {
      roomCode: code,
      epoch: nextEpoch,
      secret: newSecret,
      rotatedAt: now,
      rotatedBy: resolvedActorId,
      reason: reason || "manual",
      signedByPublicKey: localPub,
    };
    envelope.signature = cryptoService.signPayload(
      buildSignableKeyEnvelope(code, envelope),
      kp.secretKey
    );

    const updatedRing = {
      ...(keyState.keyRing || {}),
      [String(nextEpoch)]: newSecret,
    };
    if (!updatedRing["1"] && this.getRoomSecret(code)) {
      updatedRing["1"] = this.getRoomSecret(code);
    }
    const updatedEnvelopes = [
      ...(Array.isArray(keyState.keyEnvelopes) ? keyState.keyEnvelopes : []).filter(
        (e) => Number(e?.epoch) !== nextEpoch
      ),
      envelope,
    ].sort((a, b) => Number(a.epoch) - Number(b.epoch));

    const { ServerStore } = require("./serverStore.cjs");
    const serverStore = new ServerStore(this.userDataPath);
    const updatedServer = await serverStore.updateRoomKeyRing(code, {
      currentKeyEpoch: nextEpoch,
      keyRing: updatedRing,
      keyEnvelopes: updatedEnvelopes,
    });

    this._roomKeyRings.set(code, {
      currentEpoch: nextEpoch,
      keyRing: updatedRing,
      keyEnvelopes: updatedEnvelopes,
    });

    const existingLogs = Array.isArray(meta?.auditLog) ? meta.auditLog : [];
    const actorInfo = this._resolveAuditActorInfo(code, meta, null, resolvedActorId);
    const auditEntry = {
      id: crypto.randomUUID(),
      timestamp: now,
      userId: actorInfo.userId,
      nickname: actorInfo.nickname,
      userName: actorInfo.nickname,
      avatar: actorInfo.avatar,
      action: "rotate_room_key",
      target: `Epoch #${nextEpoch}`,
      details: reason === "user_banned"
        ? `Auto-rotated room encryption key to Epoch #${nextEpoch} after user ban`
        : `Manually rotated room encryption key to Epoch #${nextEpoch}`,
    };

    const metaPatch = {
      currentKeyEpoch: nextEpoch,
      lastKeyRotationAt: now,
      lastKeyRotationBy: resolvedActorId,
      auditLog: [auditEntry, ...existingLogs].slice(0, 100),
      ...(!meta?.ownerPublicKey && localPub ? { ownerPublicKey: localPub } : {}),
    };

    const updatedMeta = await this.roomMetaStore.bump(code, metaPatch, resolvedActorId || "local", kp);
    this.p2pService?._broadcast("meta-update", updatedMeta, code);

    const bannedSet = new Set(Array.isArray(updatedMeta?.bannedUsers) ? updatedMeta.bannedUsers : []);
    const syncPayload = {
      roomCode: code,
      currentKeyEpoch: nextEpoch,
      keyRing: updatedRing,
      keyEnvelopes: updatedEnvelopes,
    };
    for (const [pId, peerObj] of (this.p2pService?.peers || new Map()).entries()) {
      if (!this.isPeerInRoom(pId, code)) continue;
      if (peerObj.userId && bannedSet.has(peerObj.userId)) continue;
      this.p2pService._sendToPeer(pId, "room-key-sync", syncPayload);
    }

    if (updatedServer) {
      global.mainWindow?.webContents.send("server:updated", {
        ...updatedServer,
        savedMembers: updatedMeta?.savedMembers || updatedServer.savedMembers || {},
      });
    }

    return {
      ok: true,
      currentKeyEpoch: nextEpoch,
      lastKeyRotationAt: now,
      keyEnvelope: envelope,
    };
  }

  async generateActiveInvite(roomCode, durationKey = "24h", actorProfile = null) {
    const code = String(roomCode || this.roomCode || "").trim().toUpperCase();
    if (!code || !this.userDataPath || !this.roomMetaStore) {
      throw new Error("INVALID_ROOM");
    }

    const DURATION_MS_MAP = {
      "30m": 30 * 60 * 1000,
      "1h": 60 * 60 * 1000,
      "6h": 6 * 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      never: null,
    };
    const durationMs = Object.prototype.hasOwnProperty.call(DURATION_MS_MAP, durationKey)
      ? DURATION_MS_MAP[durationKey]
      : DURATION_MS_MAP["24h"];

    const cryptoService = require("../services/cryptoService.cjs");
    const meta = await this.roomMetaStore.load(code);
    const { kp, localPub, myId } = this._resolveGovernanceSigner(code, meta, actorProfile);
    if (!kp?.secretKey || !localPub) {
      throw new Error("SIGNING_KEY_UNAVAILABLE");
    }

    const now = Date.now();
    const actorInfo = this._resolveAuditActorInfo(code, meta, actorProfile, myId);
    const inviteSecret = crypto.randomBytes(32).toString("base64url");
    const activeInvite = {
      inviteId: crypto.randomUUID(),
      inviteSecret,
      createdAt: now,
      expiresAt: durationMs ? now + durationMs : null,
      createdBy: myId || actorProfile?.id || null,
      createdByNickname: actorInfo.nickname,
      revoked: false,
      revokedAt: null,
      signedByPublicKey: localPub,
    };
    activeInvite.signature = cryptoService.signPayload(
      buildSignableActiveInvite(code, activeInvite),
      kp.secretKey
    );

    const existingLogs = Array.isArray(meta?.auditLog) ? meta.auditLog : [];
    const auditEntry = {
      id: crypto.randomUUID(),
      timestamp: now,
      userId: actorInfo.userId,
      nickname: actorInfo.nickname,
      userName: actorInfo.nickname,
      avatar: actorInfo.avatar,
      action: "generate_invite",
      target: activeInvite.inviteId,
      details: durationMs ? `Generated new invite (${durationKey})` : "Generated new permanent invite",
    };

    const updatedMeta = await this.roomMetaStore.bump(
      code,
      {
        activeInvite,
        auditLog: [auditEntry, ...existingLogs].slice(0, 100),
        ...(!meta?.ownerPublicKey && localPub ? { ownerPublicKey: localPub } : {}),
      },
      myId || "local",
      kp
    );

    this._syncRoomInviteListener(code, updatedMeta);
    this.p2pService?._broadcast("meta-update", updatedMeta, code);

    try {
      const { ServerStore } = require("./serverStore.cjs");
      const updatedServer = await new ServerStore(this.userDataPath).getByRoomCode(code);
      if (updatedServer) {
        global.mainWindow?.webContents.send("server:updated", {
          ...updatedServer,
          savedMembers: updatedMeta?.savedMembers || updatedServer.savedMembers || {},
        });
      }
    } catch {}

    return { ok: true, activeInvite };
  }

  async revokeActiveInvite(roomCode, actorProfile = null) {
    const code = String(roomCode || this.roomCode || "").trim().toUpperCase();
    if (!code || !this.userDataPath || !this.roomMetaStore) {
      throw new Error("INVALID_ROOM");
    }

    const cryptoService = require("../services/cryptoService.cjs");
    const meta = await this.roomMetaStore.load(code);
    const { kp, localPub, myId } = this._resolveGovernanceSigner(code, meta, actorProfile);
    if (!kp?.secretKey || !localPub) {
      throw new Error("SIGNING_KEY_UNAVAILABLE");
    }

    if (!meta?.activeInvite) {
      await this.p2pService?.leaveInviteTopic?.(code);
      this._clearInviteExpiryTimer(code);
      return { ok: true, activeInvite: null };
    }

    const now = Date.now();
    const revokedInvite = {
      ...meta.activeInvite,
      revoked: true,
      revokedAt: now,
      signedByPublicKey: localPub,
    };
    revokedInvite.signature = cryptoService.signPayload(
      buildSignableActiveInvite(code, revokedInvite),
      kp.secretKey
    );

    const existingLogs = Array.isArray(meta?.auditLog) ? meta.auditLog : [];
    const actorInfo = this._resolveAuditActorInfo(code, meta, actorProfile, myId);
    const auditEntry = {
      id: crypto.randomUUID(),
      timestamp: now,
      userId: actorInfo.userId,
      nickname: actorInfo.nickname,
      userName: actorInfo.nickname,
      avatar: actorInfo.avatar,
      action: "revoke_invite",
      target: revokedInvite.inviteId,
      details: "Revoked active room invite",
    };

    const updatedMeta = await this.roomMetaStore.bump(
      code,
      {
        activeInvite: revokedInvite,
        auditLog: [auditEntry, ...existingLogs].slice(0, 100),
      },
      myId || "local",
      kp
    );

    this._syncRoomInviteListener(code, updatedMeta);
    this.p2pService?._broadcast("meta-update", updatedMeta, code);

    try {
      const { ServerStore } = require("./serverStore.cjs");
      const updatedServer = await new ServerStore(this.userDataPath).getByRoomCode(code);
      if (updatedServer) {
        global.mainWindow?.webContents.send("server:updated", {
          ...updatedServer,
          savedMembers: updatedMeta?.savedMembers || updatedServer.savedMembers || {},
        });
      }
    } catch {}

    return { ok: true, activeInvite: revokedInvite };
  }

  registerInviteRedeemWaiter(requestId, handler) {
    if (!requestId || typeof handler !== "function") return;
    this._pendingInviteRedeems.set(requestId, handler);
  }

  unregisterInviteRedeemWaiter(requestId) {
    if (!requestId) return;
    this._pendingInviteRedeems.delete(requestId);
  }

  shouldUseV2RoomEncryption(roomCode) {
    const code = String(roomCode || "").trim().toUpperCase();
    if (!code) return false;
    const cryptoService = require("../services/cryptoService.cjs");
    const secret = this.getRoomSecret(code);
    if (!secret || !cryptoService.isValidRoomSecret(secret)) return false;

    const cachedMeta = this.roomMetaStore?._cache?.get(code);
    if (cachedMeta?.enforceV2Encryption) return true;

    const activePeers = this.getPeersForRoom(code);
    return !activePeers.some((p) => (p.protocolVersion || 1) < 2);
  }

  isRoomInLegacyCompatMode(roomCode) {
    const code = String(roomCode || "").trim().toUpperCase();
    if (!code) return false;
    const cryptoService = require("../services/cryptoService.cjs");
    const secret = this.getRoomSecret(code);
    if (!secret || !cryptoService.isValidRoomSecret(secret)) return false;
    const cachedMeta = this.roomMetaStore?._cache?.get(code);
    if (cachedMeta?.enforceV2Encryption) return false;
    return this.getPeersForRoom(code).some((p) => (p.protocolVersion || 1) < 2);
  }

  extractDmRecipientUserId(channelId) {
    if (!channelId || !String(channelId).startsWith("dm_")) return null;
    const raw = String(channelId).slice(3);
    const myUserId = this.profile?.id || this.p2pService?.profile?.id || null;
    if (myUserId && raw.includes(myUserId)) {
      if (raw.startsWith(`${myUserId}_`)) return raw.slice(myUserId.length + 1);
      if (raw.endsWith(`_${myUserId}`)) return raw.slice(0, raw.length - myUserId.length - 1);
    }
    const parts = String(channelId).split("_");
    if (parts.length >= 3) {
      return parts[1] === myUserId ? parts[2] : parts[1];
    }
    return null;
  }

  resolveDmRecipientPublicKey(channelId) {
    const recipientUserId = this.extractDmRecipientUserId(channelId);
    if (!recipientUserId) return "__NEED_KEY__";

    if (this.p2pService?.peers) {
      for (const [pId, peerObj] of this.p2pService.peers.entries()) {
        if (peerObj && (peerObj.userId === recipientUserId || pId === recipientUserId)) {
          return pId;
        }
      }
    }

    if (this.userDataPath) {
      try {
        const info = peerTrustService.getPeerVerification(this.userDataPath, {
          userId: recipientUserId,
        });
        if (info?.peerPublicKey) return info.peerPublicKey;
      } catch {}
    }

    return "__NEED_KEY__";
  }

  encryptChannelText(roomCode, channelId, plaintext) {
    const code = String(roomCode || "").trim().toUpperCase();
    const cryptoService = require("../services/cryptoService.cjs");
    if (String(channelId || "").startsWith("dm_")) {
      const dmTarget = this.resolveDmRecipientPublicKey(channelId);
      if (!dmTarget || dmTarget === "__NEED_KEY__") {
        throw new Error("DM_PEER_KEY_REQUIRED");
      }
      const kp = this.p2pService?.getKeyPair?.() || this.p2pService?.swarm?.keyPair;
      const localPub = this.p2pService?._resolveLocalPeerId();
      if (!kp?.secretKey || !localPub) {
        throw new Error("DM_PEER_KEY_REQUIRED");
      }
      return cryptoService.encryptDM(kp.secretKey, localPub, dmTarget, plaintext);
    }
    if (!this.shouldUseV2RoomEncryption(code)) {
      return cryptoService.encrypt(code, plaintext, {});
    }
    const routingSecret = this.getRoomSecret(code);
    const keyState = this.getRoomKeyState(code);
    const epoch = Math.max(1, Number(keyState.currentEpoch) || 1);
    const epochSecret =
      keyState.keyRing?.[epoch] ||
      keyState.keyRing?.[String(epoch)] ||
      routingSecret;
    return cryptoService.encrypt(code, plaintext, {
      roomSecret: routingSecret || epochSecret,
      keyEpoch: epoch,
      epochSecret: epochSecret || routingSecret,
    });
  }

  decryptChannelText(roomCode, channelId, ciphertext) {
    const code = String(roomCode || "").trim().toUpperCase();
    const cryptoService = require("../services/cryptoService.cjs");
    if (typeof ciphertext === "string" && ciphertext.startsWith("[E2EE-DM]:")) {
      const kp = this.p2pService?.getKeyPair?.() || this.p2pService?.swarm?.keyPair;
      const localPub = this.p2pService?._resolveLocalPeerId();
      if (kp?.secretKey && localPub) {
        return cryptoService.decryptDM(kp.secretKey, localPub, ciphertext);
      }
      return "[Cifrado - No disponible]";
    }
    const routingSecret = this.getRoomSecret(code);
    const keyState = this.getRoomKeyState(code);
    return cryptoService.decrypt(code, ciphertext, {
      roomSecret: routingSecret,
      keyRing: keyState.keyRing,
    });
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

  async moveVoiceMember(roomCode, targetUserId, targetPeerId, targetChannelId) {
    const code = String(roomCode || this.roomCode || "").trim().toUpperCase();
    if (!code || !targetChannelId) return { ok: false, error: "Missing parameters" };

    const myProfile = this.profile || this.p2pService.profile;
    const myId = myProfile?.id;
    let meta = null;
    if (this.roomMetaStore) {
      meta = await this.roomMetaStore.load(code);
    }
    const { checkAdminPermission } = require("./roomMetaStore.cjs");
    const isOwner = myId && (meta?.ownerId === myId || meta?.creatorID === myId || meta?.creatorId === myId);
    const hasAdmin = isOwner || (myId && checkAdminPermission(meta, myId));
    if (!hasAdmin) {
      console.warn(`[RoomManager] moveVoiceMember rejected: caller ${myId} is not admin/owner in ${code}`);
      return { ok: false, error: "Unauthorized" };
    }

    const payload = {
      roomCode: code,
      targetUserId,
      targetPeerId,
      targetChannelId,
      operatorId: myId,
      operatorNickname: myProfile?.nickname || "Admin",
    };

    if (targetPeerId && this.p2pService.peers.has(targetPeerId)) {
      this.p2pService._sendToPeer(targetPeerId, "voice-move-member", payload);
    } else {
      this.p2pService._broadcast("voice-move-member", payload, code);
    }

    return { ok: true };
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

  _getWhiteboardStore() {
    if (!this._whiteboardStore && this.userDataPath) {
      this._whiteboardStore = new WhiteboardStore(this.userDataPath);
    }
    return this._whiteboardStore;
  }

  persistWhiteboardPayload(payload, roomCode = null) {
    const targetRoom = roomCode || payload?.roomCode || this.roomCode;
    const channelId = payload?.channelId;
    const store = this._getWhiteboardStore();
    if (!store || !targetRoom || !channelId) return;

    if ((payload.type === "op:upsert" || payload.type === "op:delete") && payload.element) {
      store.applyElements(targetRoom, channelId, [payload.element]);
    } else if (
      (payload.type === "op:batch-upsert" || payload.type === "op:batch-delete") &&
      Array.isArray(payload.elements)
    ) {
      store.applyElements(targetRoom, channelId, payload.elements);
    } else if (payload.type === "op:clear") {
      store.clearChannel(targetRoom, channelId, payload.clearedAt || Date.now());
    } else if (payload.type === "sync:state" && Array.isArray(payload.elements)) {
      if (payload.clearedAt > 0) {
        store.clearChannel(targetRoom, channelId, payload.clearedAt);
      }
      store.applyElements(targetRoom, channelId, payload.elements);
    }
  }

  sendWhiteboardEvent(payload, roomCode = null) {
    const targetRoom = roomCode || payload?.roomCode || this.roomCode;
    this.persistWhiteboardPayload(payload, targetRoom);
    if (!this.p2pService || !targetRoom) return;
    this.p2pService._broadcast(
      "whiteboard-event",
      {
        ...payload,
        roomCode: targetRoom,
        senderPeerId: this.p2pService._resolveLocalPeerId(),
      },
      targetRoom
    );
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
    if (updatedFullProfile) {
      this.profile = updatedFullProfile;
    }
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

      const serverFlameObj =
        updatedFullProfile?.flame && typeof updatedFullProfile.flame === "object"
          ? updatedFullProfile.flame[code] ||
            updatedFullProfile.flame[targetRoomCode] ||
            ("currentStreak" in updatedFullProfile.flame ? updatedFullProfile.flame : null)
          : null;

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
            banner: effective.banner || null,
            customLink: effective.customLink || "",
            profileColor: effective.profileColor || "",
            customStatus: effective.customStatus || "",
            globalNickname: updatedFullProfile.nickname || null,
            ...(serverFlameObj ? { flame: serverFlameObj } : {}),
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
          banner: effective.banner || null,
          customLink: effective.customLink || "",
          profileColor: effective.profileColor || "",
          customStatus: effective.customStatus || "",
          globalNickname: updatedFullProfile.nickname || null,
          ...(serverFlameObj ? { flame: serverFlameObj } : {}),
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
    if (this._isHeadlessMode || (this.p2pService.profile && this.p2pService.profile.showRichPresence === false)) {
      this.p2pService._broadcast("activity-state", { name: null });
      return;
    }
    this.p2pService._broadcast("activity-state", activity || { name: null });
  }

  /**
   * Toggles headless node mode: broadcasts invisible status and hides rich presence
   * while keeping P2P swarms, Discover, webhooks, and message sync alive.
   */
  setHeadlessMode(enabled) {
    const next = Boolean(enabled);
    if (this._isHeadlessMode === next) return;
    this._isHeadlessMode = next;

    if (!this.p2pService?.profile) return;

    if (next) {
      this._preHeadlessStatus = this.p2pService.profile.status || "online";
      this._preHeadlessRichPresence = this.p2pService.profile.showRichPresence;
      this.p2pService.profile.status = "invisible";
      this.p2pService.profile.showRichPresence = false;
      this.p2pService._broadcast("activity-state", { name: null });
      for (const peerId of this.p2pService.peers.keys()) {
        this.p2pService._sendProfileToPeer(peerId);
      }
    } else {
      this.p2pService.profile.status = this._preHeadlessStatus || "online";
      if (this._preHeadlessRichPresence !== undefined) {
        this.p2pService.profile.showRichPresence = this._preHeadlessRichPresence;
      }
      for (const peerId of this.p2pService.peers.keys()) {
        this.p2pService._sendProfileToPeer(peerId);
      }
      if (this.localActivity?.name && this.p2pService.profile.showRichPresence !== false) {
        this.p2pService._broadcast("activity-state", this.localActivity);
      }
    }
    this._emitState();
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

    // Prewarm PBKDF2 room key asynchronously on libuv threadpool so first encrypt/decrypt never stalls main
    try {
      require("../services/cryptoService.cjs").prewarmKey(normalized).catch(() => {});
    } catch {}

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

    let roomSecret = null;
    let keepLegacyTopic = true;
    let serverRecord = null;
    let roomMeta = null;

    if (!this.isPreview && this.userDataPath) {
      await this.p2pService.ensureSwarm();
      try {
        const { ServerStore } = require("./serverStore.cjs");
        const serverStore = new ServerStore(this.userDataPath);
        serverRecord = await serverStore.getByRoomCode(normalized);
        if (serverRecord?.roomSecret) {
          roomSecret = serverRecord.roomSecret;
          this._roomSecrets.set(normalized, roomSecret);
        }
        if (serverRecord) {
          const ring = serverRecord.keyRing && typeof serverRecord.keyRing === "object" ? { ...serverRecord.keyRing } : {};
          if (roomSecret && !ring["1"]) ring["1"] = roomSecret;
          this._roomKeyRings.set(normalized, {
            currentEpoch: Math.max(1, Number(serverRecord.currentKeyEpoch) || 1),
            keyRing: ring,
            keyEnvelopes: Array.isArray(serverRecord.keyEnvelopes) ? serverRecord.keyEnvelopes : [],
          });
        }
      } catch {}

      if (this.roomMetaStore) {
        roomMeta = await this.roomMetaStore.load(normalized).catch(() => null);
      }

      // Auto-migrate legacy v1 -> v2 when the room owner connects
      if (isHost && (!roomMeta?.ownerPublicKey || !roomSecret || !roomMeta?.roomSecretMigration)) {
        try {
          const kp = this.p2pService.swarm?.keyPair;
          const localPub = this.p2pService._resolveLocalPeerId();
          if (kp?.secretKey && localPub) {
            const cryptoService = require("../services/cryptoService.cjs");
            const isLegacyRoom = Boolean(!roomSecret || !roomMeta?.ownerPublicKey);
            if (!roomSecret || !cryptoService.isValidRoomSecret(roomSecret)) {
              roomSecret = crypto.randomBytes(32).toString("base64url");
              this._roomSecrets.set(normalized, roomSecret);
              if (serverRecord) {
                const { ServerStore } = require("./serverStore.cjs");
                await new ServerStore(this.userDataPath).setRoomSecret(normalized, roomSecret);
              }
            }
            const migratedAt = Date.now();
            const sig = cryptoService.signPayload(
              { roomCode: normalized, roomSecret, migratedAt },
              kp.secretKey
            );
            const migrationEnvelope = {
              roomCode: normalized,
              roomSecret,
              migratedAt,
              signedByPublicKey: localPub,
              signature: sig,
              legacyMigrated: isLegacyRoom,
            };
            if (this.roomMetaStore) {
              const bumpPatch = {
                ownerId: roomMeta?.ownerId || profile?.id || null,
                ownerPublicKey: roomMeta?.ownerPublicKey || localPub,
                roomSecretMigration: migrationEnvelope,
              };
              roomMeta = await this.roomMetaStore.bump(normalized, bumpPatch, profile?.id || "local", kp);
              this.p2pService._broadcast("meta-update", roomMeta, normalized);
            }
            this.p2pService._broadcast("room-secret-migrate", migrationEnvelope, normalized);
          }
        } catch (migErr) {
          console.warn(`[RoomManager AutoMigrate] Warning for ${normalized}:`, migErr.message);
        }
      }

      // Brand-new private v2 rooms (not migrated from v1 and not Discover-public) use v2 DHT topic only
      const isPublicDiscover = Boolean(serverRecord?.discoverConfig?.enabled || roomMeta?.discoverConfig?.enabled);
      const isLegacyMigrated = Boolean(
        !roomSecret ||
        !roomMeta?.ownerPublicKey ||
        roomMeta?.roomSecretMigration?.legacyMigrated
      );
      keepLegacyTopic = isPublicDiscover || isLegacyMigrated;
    }

    await this.p2pService.joinRoom(normalized, {
      waitFlush: Boolean(options?.waitFlush),
      roomSecret,
      keepLegacyTopic,
    });
    if (!this.isPreview && roomMeta) {
      this._syncRoomInviteListener(normalized, roomMeta);
    }
    if (this.p2pService.profile) {
      this.p2pService._broadcastJoinedRooms();
      for (const [peerId] of this.p2pService.peers.entries()) {
        if (this.isPeerInRoom(peerId, normalized)) {
          this.p2pService._sendProfileToPeer(peerId);
        }
      }
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
          banner: effective.banner || null,
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
              banner: effective.banner || null,
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

    this._clearInviteExpiryTimer(normalized);
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
    for (const timer of this._inviteExpiryTimers.values()) {
      clearTimeout(timer);
    }
    this._inviteExpiryTimers.clear();
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

  async getState(targetRoomCode = null) {
    const effectiveRoomCode = targetRoomCode ? String(targetRoomCode).trim().toUpperCase() : this.roomCode;
    const localId = this.p2pService._resolveLocalPeerId();
    const activePeers = Array.from(this.p2pService.peers.values())
      .filter((p) => p.userId !== null && !p.isPreview && effectiveRoomCode && this.isPeerInRoom(p.id, effectiveRoomCode))
      .map((p) => {
        const transportAuth = p.transportAuth || "noise-hyperswarm";
        const verificationStatus =
          p.verificationStatus ||
          (p.userId
            ? peerTrustService.getVerificationStatusQuick(
                this.userDataPath,
                p.userId,
                p.id,
                transportAuth
              )
            : "unverified");
        const status = p.status || "online";
        return {
          id: p.userId,
          userId: p.userId,
          peerId: p.id,
          nickname: p.nickname,
          globalNickname: p.nickname,
          avatar: p.avatar,
          banner: p.banner || null,
          serverProfiles: p.serverProfiles || null,
          status,
          online: status !== "invisible",
          activity: p.activity || null,
          customLink: p.customLink || "",
          profileColor: p.profileColor || "",
          customStatus: p.customStatus || "",
          showRichPresence: p.showRichPresence ?? true,
          flame: p.flame || null,
          ping: p.averagePing !== undefined ? Math.round(p.averagePing) : (p.ping !== undefined ? Math.round(p.ping) : null),
          verificationStatus,
          transportAuth,
          protocolVersion: p.protocolVersion || 1,
        };
      });

    let historicalMembers = [];
    try {
      if (this.roomMetaStore && effectiveRoomCode) {
        const meta = await this.roomMetaStore.load(effectiveRoomCode);
        if (meta && meta.savedMembers) {
          historicalMembers = Object.values(meta.savedMembers).map((m) => ({
            id: m.id,
            peerId: null,
            nickname: m.nickname,
            avatar: m.avatar,
            banner: m.banner || null,
            status: "offline",
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
        finalMembersMap.set(p.id, { ...p, online: p.status !== "invisible" });
    }

    return {
      roomCode: effectiveRoomCode,
      isHost: this.isHost,
      mesh: true,
      localPeerId: localId,
      compatMode: this.isRoomInLegacyCompatMode(effectiveRoomCode),
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
    let effectiveBanner = peer.banner || null;
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
        if (savedMember.banner !== undefined) effectiveBanner = savedMember.banner;
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
        if (override.banner !== undefined && override.banner !== null && override.banner !== "") {
          effectiveBanner = override.banner;
        }
        if (override.customLink !== undefined) effectiveCustomLink = override.customLink;
        if (override.profileColor) effectiveProfileColor = override.profileColor;
        if (override.customStatus !== undefined) effectiveCustomStatus = override.customStatus;
      }
    }

    const transportAuth = peer.transportAuth || "noise-hyperswarm";
    const verificationStatus =
      peer.verificationStatus ||
      (peer.userId
        ? peerTrustService.getVerificationStatusQuick(
            this.userDataPath,
            peer.userId,
            peerId,
            transportAuth
          )
        : "unverified");

    this._callbacks.onPeerJoined?.({
      id: peer.userId || peerId,
      peerId: peerId,
      userId: peer.userId,
      nickname: effectiveNickname,
      avatar: effectiveAvatar,
      banner: effectiveBanner,
      globalNickname: effectiveGlobalNick,
      serverProfiles: peer.serverProfiles || null,
      flame: peer.flame,
      customLink: effectiveCustomLink,
      profileColor: effectiveProfileColor,
      customStatus: effectiveCustomStatus,
      showRichPresence: peer.showRichPresence,
      status: peer.status || "online",
      online: peer.status !== "invisible",
      activity: peer.activity || null,
      ping: peer.averagePing !== undefined ? Math.round(peer.averagePing) : (peer.ping !== undefined ? Math.round(peer.ping) : null),
      verificationStatus,
      transportAuth,
      protocolVersion: peer.protocolVersion || 1,
    });
  }

  async _handleMessage(peerId, type, payload) {
    const peer = this.p2pService.peers.get(peerId);
    if (!peer) return;

    if (type === "room-proofs-matched" && payload) {
      const removedRooms = Array.isArray(payload.removedRooms) ? payload.removedRooms : [];
      const activeRoomCode = this.roomCode ? String(this.roomCode).trim().toUpperCase() : null;
      if (activeRoomCode && removedRooms.includes(activeRoomCode)) {
        this._callbacks.onPeerLeft?.({
          id: peer.userId || peerId,
          peerId,
          roomCode: activeRoomCode,
        });
        this.voiceService.handlePeerLeft(peerId, () => this._emitVoiceState());
      }

      // If peer profile already arrived before a new room match was confirmed, trigger room sync & profile emission
      const addedRooms = Array.isArray(payload.addedRooms) ? payload.addedRooms : [];
      if (peer.userId && addedRooms.length > 0 && !peer.isPreview) {
        await this._onSharedRoomsActivated(peerId, peer.lastProfilePayload || peer, addedRooms);
      } else if (peer.isPreview && addedRooms.length > 0 && this.roomMetaStore) {
        for (const code of addedRooms) {
          this.roomMetaStore.load(code).then((meta) => {
            if (meta) {
              const { webhooks: _wh, activeInvite: _ai, ...safeMeta } = meta;
              this.p2pService._sendToPeer(peerId, "meta-update", {
                ...safeMeta,
                webhooks: [],
                activeInvite: null,
                roomCode: code,
              });
            }
          }).catch(() => {});
        }
      }
      return;
    }

    if (type === "profile" && payload) {
      peer.lastProfilePayload = payload;
      const activeRooms = this.rooms.size > 0 ? [...this.rooms.keys()] : (this.roomCode ? [this.roomCode] : []);
      const verifiedPeerRooms = this.p2pService.peerRooms.get(peerId) || new Set();

      let sharedRooms = [];
      if ((peer.protocolVersion || 1) >= 2) {
        // v2 peers derive shared rooms strictly from HMAC room-proofs verification
        sharedRooms = activeRooms.filter((code) => verifiedPeerRooms.has(code));
      } else {
        // Legacy v1 fallback (v0.3.6)
        const peerJoinedRooms = Array.isArray(payload.joinedRooms)
          ? payload.joinedRooms.map((r) => String(r || "").trim().toUpperCase()).filter(Boolean)
          : [];
        sharedRooms = activeRooms.filter(
          (code) => verifiedPeerRooms.has(code) || peerJoinedRooms.includes(code)
        );
      }

      if (payload.isPreview || !payload.id) {
        if (this.roomMetaStore) {
          for (const code of sharedRooms) {
            this.roomMetaStore.load(code).then((meta) => {
              if (meta) {
                const { webhooks: _wh, activeInvite: _ai, ...safeMeta } = meta;
                this.p2pService._sendToPeer(peerId, "meta-update", {
                  ...safeMeta,
                  webhooks: [],
                  activeInvite: null,
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

      await this._onSharedRoomsActivated(peerId, payload, sharedRooms);
      return;
    }

    if (await handleChatPacket(this, peerId, type, payload)) return;
    if (await handleVoicePacket(this, peerId, type, payload)) return;
    if (await handleFilePacket(this, peerId, type, payload)) return;
    if (await handleMetaPacket(this, peerId, type, payload)) return;
  }

  async _onSharedRoomsActivated(peerId, payload, sharedRooms) {
    const peer = this.p2pService.peers.get(peerId);
    if (!peer || !Array.isArray(sharedRooms) || sharedRooms.length === 0) return;

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

      if (!this.isPreview && this.userDataPath && payload.id) {
        const sighting = peerTrustService.recordPeerSighting(
          this.userDataPath,
          payload.id,
          peerId,
          peer.transportAuth || "noise-hyperswarm"
        );
        peer.verificationStatus = sighting.status;
        if (sighting.keyChanged) {
          global.mainWindow?.webContents.send("security:peer-key-changed", {
            userId: payload.id,
            peerId,
            nickname: peer.nickname || payload.nickname || "Usuario",
            hadVerifiedKey: Boolean(sighting.hadVerifiedKey),
          });
        }
      }

      // Re-sync room proofs/profile on shared rooms without leaking unrelated rooms in plaintext
      this.p2pService._broadcastJoinedRooms();

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
              let targetBanner = payload.banner || null;
              let targetCustomLink = payload.customLink || "";
              let targetProfileColor = payload.profileColor || "";
              let targetCustomStatus = payload.customStatus || "";
              let targetHasCustom = false;

              if (peerEffective && peerEffective.isServerProfile) {
                targetNickname = peerEffective.nickname;
                targetAvatar = peerEffective.avatar;
                targetBanner = peerEffective.banner || null;
                targetCustomLink = peerEffective.customLink || "";
                targetProfileColor = peerEffective.profileColor || "";
                targetCustomStatus = peerEffective.customStatus || "";
                targetHasCustom = true;
              } else if (hasExistingServerProfile) {
                targetNickname = antiguo.nickname;
                targetAvatar = antiguo.avatar;
                targetBanner = antiguo.banner || null;
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
                antiguo.banner !== targetBanner ||
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
                  banner: targetBanner,
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
                const roomEntryForJoin = this.rooms.get(targetCode);
                const isRoomHostForJoin = Boolean(roomEntryForJoin?.isHost || (this.roomCode === targetCode && this.isHost));
                const hasInitialMetaSynced = isRoomHostForJoin || (Number(meta.version) || 0) > 0;
                const isRoomOwnerPeer = Boolean(
                  payload.id &&
                  (payload.id === meta.ownerId || payload.id === meta.creatorID || payload.id === meta.creatorId)
                );
                if (this.roomCode === targetCode && hasInitialMetaSynced && !isRoomOwnerPeer) {
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

      // Proactively reply to newly connected peer with our effective server profile, sync, v2 secret envelope relay, and keyRing
      for (const code of allowedSharedRooms) {
        if ((peer.protocolVersion || 1) >= 2 && this.roomMetaStore) {
          this.roomMetaStore.load(code).then(async (m) => {
            if (m?.roomSecretMigration && m?.ownerPublicKey) {
              this.p2pService._sendToPeer(peerId, "room-secret-migrate", m.roomSecretMigration);
            }
            // Self-heal adminPublicKeys when Owner sees a verified Admin peer
            const myId = this.profile?.id || this.p2pService?.profile?.id;
            const localPub = this.p2pService?._resolveLocalPeerId?.();
            const isLocalOwner = Boolean(
              m?.ownerId === myId || (m?.ownerPublicKey && localPub && m.ownerPublicKey.toLowerCase() === localPub.toLowerCase())
            );
            if (isLocalOwner && payload?.id && checkAdminPermission(m, payload.id)) {
              const currentAdminKey = m?.adminPublicKeys?.[payload.id]?.toLowerCase?.();
              if (currentAdminKey !== String(peerId).toLowerCase()) {
                try {
                  const nextAdminKeys = { ...(m.adminPublicKeys || {}), [payload.id]: String(peerId).toLowerCase() };
                  const kp = this.p2pService?.getKeyPair?.() || this.p2pService?.swarm?.keyPair;
                  const updatedM = await this.roomMetaStore.bump(code, { adminPublicKeys: nextAdminKeys }, myId || "local", kp);
                  this.p2pService._broadcast("meta-update", updatedM, code);
                } catch {}
              }
            }
          }).catch(() => {});
        }
        if ((peer.protocolVersion || 1) >= 2) {
          const keyState = this.getRoomKeyState(code);
          if (keyState && (keyState.currentEpoch > 1 || (keyState.keyEnvelopes && keyState.keyEnvelopes.length > 0))) {
            this.p2pService._sendToPeer(peerId, "room-key-sync", {
              roomCode: code,
              currentKeyEpoch: keyState.currentEpoch,
              keyRing: keyState.keyRing,
              keyEnvelopes: keyState.keyEnvelopes,
            });
          }
        }
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
          let effectiveBanner = peer.banner || null;
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
              effectiveBanner = savedMember.banner !== undefined ? savedMember.banner : effectiveBanner;
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
              if (override.banner !== undefined && override.banner !== null && override.banner !== "") {
                effectiveBanner = override.banner;
              }
              if (override.customLink !== undefined) effectiveCustomLink = override.customLink;
              if (override.profileColor) effectiveProfileColor = override.profileColor;
              if (override.customStatus !== undefined) effectiveCustomStatus = override.customStatus;
            }
          }

          const transportAuth = peer.transportAuth || "noise-hyperswarm";
          const verificationStatus =
            peer.verificationStatus ||
            (peer.userId
              ? peerTrustService.getVerificationStatusQuick(
                  this.userDataPath,
                  peer.userId,
                  peerId,
                  transportAuth
                )
              : "unverified");
          this._callbacks.onPeerUpdated({
            id: peer.userId,
            userId: peer.userId,
            peerId: peer.id,
            nickname: effectiveNickname,
            avatar: effectiveAvatar,
            banner: effectiveBanner,
            status: peer.status || "online",
            online: peer.status !== "invisible",
            activity: peer.activity || null,
            customLink: effectiveCustomLink,
            profileColor: effectiveProfileColor,
            customStatus: effectiveCustomStatus,
            globalNickname: effectiveGlobalNick,
            serverProfiles: peer.serverProfiles || null,
            showRichPresence: peer.showRichPresence,
            flame: peer.flame,
            ping: peer.averagePing !== undefined ? Math.round(peer.averagePing) : (peer.ping !== undefined ? Math.round(peer.ping) : null),
            verificationStatus,
            transportAuth,
            protocolVersion: peer.protocolVersion || 1,
          });
        }
      }
  }

  requestPeerDiagnostics(peerId) {
    if (!this.roomCode) return;
    diagService.log("info", "Diagnostics", `Requesting diagnostics from peer: ${peerId}`);
    const requestId = crypto.randomUUID();
    this.p2pService._sendToPeer(peerId, "diag-request", { requestId });
  }

  respondDiagConsent(requestId, approved) {
    if (!requestId || !this._pendingDiagRequests) return { ok: false, error: "invalid_request" };
    const entry = this._pendingDiagRequests.get(requestId);
    if (!entry) return { ok: false, error: "expired_or_missing" };
    this._pendingDiagRequests.delete(requestId);
    if (entry.timer) clearTimeout(entry.timer);

    if (Date.now() > entry.expiresAt) {
      this.p2pService._sendToPeer(entry.peerId, "diag-response", {
        requestId,
        rejected: true,
        reason: "expired",
        nickname: this.profile?.nickname || "Peer",
        logs: [],
      });
      return { ok: false, error: "expired" };
    }

    if (approved) {
      const sanitizedLogs = diagService.sanitizeLogs(diagService.getLocalLogs());
      this.p2pService._sendToPeer(entry.peerId, "diag-response", {
        requestId,
        rejected: false,
        nickname: this.profile?.nickname || "Peer",
        logs: sanitizedLogs,
      });
      return { ok: true, approved: true };
    }

    this.p2pService._sendToPeer(entry.peerId, "diag-response", {
      requestId,
      rejected: true,
      nickname: this.profile?.nickname || "Peer",
      logs: [],
    });
    return { ok: true, approved: false };
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
