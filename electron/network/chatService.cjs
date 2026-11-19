const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const { checkAdminPermission } = require("../p2p/roomMetaStore.cjs");

class ChatService {
  constructor(p2pService, chatStore, fileIndexStore, roomMetaStore, callbacks) {
    this.p2p = p2pService;
    this.chatStore = chatStore;
    this.fileIndexStore = fileIndexStore;
    this.roomMetaStore = roomMetaStore;
    this.callbacks = callbacks;
    this.roomCode = null;
    this.roomCodes = new Set();
    this._ephemeralTimers = new Map();
  }

  setRoomCode(roomCode) {
    this.roomCode = roomCode;
    if (roomCode) this.roomCodes.add(roomCode);
  }

  addRoomCode(roomCode) {
    if (roomCode) {
      this.roomCodes.add(roomCode);
      if (!this.roomCode) this.roomCode = roomCode;
    }
  }

  clearRoomCode(roomCode) {
    if (roomCode) {
      this.roomCodes.delete(roomCode);
      if (this.roomCode === roomCode) {
        this.roomCode = this.roomCodes.size > 0 ? [...this.roomCodes][0] : null;
      }
    } else {
      this.roomCodes.clear();
      this.roomCode = null;
      for (const timer of this._ephemeralTimers.values()) {
        clearTimeout(timer);
      }
      this._ephemeralTimers.clear();
    }
  }

  _resolveRoomCode(explicit) {
    return explicit || this.roomCode;
  }

  _isActiveRoom(code) {
    if (!code) return false;
    return this.roomCodes.has(code) || this.roomCode === code;
  }

  async getLocalMeta(roomCode) {
    const code = this._resolveRoomCode(roomCode);
    if (!code || !this.roomMetaStore) return null;
    return this.roomMetaStore.load(code);
  }

  async applyRemoteMeta(meta, fromPeerId, roomCode) {
    const code = this._resolveRoomCode(roomCode);
    if (!code || !this.roomMetaStore || !this._isActiveRoom(code)) return false;
    let senderUserId = null;
    if (fromPeerId) {
      const peer = this.p2p.peers.get(fromPeerId);
      senderUserId = peer?.userId || fromPeerId;
    }
    const { applied, meta: merged } = await this.roomMetaStore.merge(
      code,
      meta,
      senderUserId
    );
    if (applied && merged) {
      // FIX: Do NOT re-broadcast here. The origin peer already broadcast to all.
      // Re-broadcasting caused an N² message storm with 3+ connected peers.
      this.callbacks.onServerMetaUpdated?.(code, merged);
    }
    return applied;
  }

  async publishServerMeta(patch, localPeerId, roomCode) {
    const code = this._resolveRoomCode(roomCode);
    if (!code) throw new Error("You are not in a room");
    const meta = await this.roomMetaStore.bump(
      code,
      patch,
      localPeerId
    );
    meta.roomCode = code;
    this.p2p._broadcast("meta-update", meta, code);
    this.callbacks.onServerMetaUpdated?.(code, meta);
    return meta;
  }

  async buildSyncPayload(watermarks = {}, filesSince = 0, requestingPeerId = null, roomCode) {
    const code = this._resolveRoomCode(roomCode);
    if (!code) return { messages: [], meta: null, files: [] };
    const messages = await this.chatStore.getMessagesSince(
      code,
      watermarks
    );

    let requestingUserId = null;
    if (requestingPeerId) {
      const peer = this.p2p.peers.get(requestingPeerId);
      requestingUserId = peer?.userId;
    }

    // Filter DM messages to prevent unauthorized leakage
    const allowedMessages = messages.filter((msg) => {
      if (!msg) return false;
      const channelId = msg.channelId || "general";
      if (channelId.startsWith("dm_")) {
        const parts = channelId.split("_");
        const user1 = parts[1];
        const user2 = parts[2];
        if (requestingUserId) {
          if (requestingUserId !== user1 && requestingUserId !== user2) {
            return false;
          }
        } else {
          return false;
        }
      }
      return true;
    });

    const meta = await this.getLocalMeta(code);
    const files = (await this.fileIndexStore.load(code))
      .filter((f) => (f.updatedAt || f.uploadedAt || 0) > filesSince)
      .map((f) => {
        const { realPath, local_path, ...safe } = f || {};
        return safe;
      });
    const theirV = watermarks._metaVersion || 0;
    const theirT = watermarks._metaUpdatedAt || 0;
    const myUserId = this.p2p.profile?.id || this.p2p._resolveLocalPeerId();
    const hasMetaAuthority = Boolean(
      meta &&
        myUserId &&
        (meta.ownerId === myUserId ||
          meta.creatorID === myUserId ||
          meta.creatorId === myUserId ||
          checkAdminPermission(meta, myUserId))
    );

    let shouldSendMeta = false;
    if (meta && (meta.version > 0 || theirV === 0)) {
      if (theirV === 0) {
        shouldSendMeta = Boolean(meta.version > 0);
      } else if (meta.version > theirV) {
        shouldSendMeta = true;
      } else if (meta.version === theirV && meta.updatedAt > theirT && hasMetaAuthority) {
        shouldSendMeta = true;
      }
    }

    const peer = requestingPeerId ? this.p2p.peers.get(requestingPeerId) : null;
    if (shouldSendMeta && peer) {
      if (!peer.lastSentMetaStamp) peer.lastSentMetaStamp = new Map();
      const metaStamp = `${meta.version || 0}:${meta.updatedAt || 0}`;
      const prevSent = peer.lastSentMetaStamp.get(code);
      if (
        prevSent &&
        prevSent.stamp === metaStamp &&
        (theirV >= (meta.version || 0) || Date.now() - prevSent.sentAt < 60000)
      ) {
        shouldSendMeta = false;
      } else {
        peer.lastSentMetaStamp.set(code, { stamp: metaStamp, sentAt: Date.now() });
      }
    }

    const sendMeta = shouldSendMeta ? meta : null;
    return { messages: allowedMessages, meta: sendMeta, files };
  }

  async mergeSyncPayload(payload, fromPeerId, roomCode) {
    const code = this._resolveRoomCode(roomCode);
    let messagesAdded = 0;
    let filesAdded = 0;
    if (!code) return { messagesAdded, filesAdded };

    if (payload.messages?.length) {
      const myUserId = this.p2p.profile?.id;
      const now = Date.now();
      const filteredIncoming = payload.messages
        .filter((msg) => {
          if (!msg) return false;
          const channelId = msg.channelId || "general";
          if (channelId.startsWith("dm_")) {
            const parts = channelId.split("_");
            const user1 = parts[1];
            const user2 = parts[2];
            if (myUserId !== user1 && myUserId !== user2) {
              return false; // Discard DMs that don't involve us
            }
          }
          return true;
        })
        .map((msg) => {
          const cloned = { ...msg };
          if (cloned.timestamp) {
            cloned.timestamp = Math.min(cloned.timestamp, now);
          }
          if (!cloned.isEphemeral) {
            const eph = this._extractEphemeralMeta(cloned.text, code, cloned.timestamp || now);
            if (eph.isEphemeral) {
              cloned.isEphemeral = true;
              cloned.expiresAt = eph.expiresAt;
            }
          } else if (!cloned.expiresAt) {
            cloned.expiresAt = (cloned.timestamp || now) + 60000;
          }
          return cloned;
        })
        .filter((msg) => !(msg.isEphemeral && msg.expiresAt && msg.expiresAt <= now));

      const peer = this.p2p.peers.get(fromPeerId);
      const { added } = await this.chatStore.mergeBatch(
        code,
        filteredIncoming,
        {
          onMessage: async (msg) => {
            const authorId = this.normalizeIncomingAuthor(msg, fromPeerId);
            const normalized = {
              ...this.normalizeStoredMessage(msg),
              roomCode: msg.roomCode || code,
              authorId,
              authorNickname: msg.authorNickname || peer?.nickname || "Usuario",
              authorAvatar: msg.authorAvatar ?? peer?.avatar ?? null,
            };
            if (normalized.isEphemeral) {
              this._scheduleEphemeralExpiry(normalized, code);
            }
            this.callbacks.onChatMessage?.(normalized);
          },
        }
      );
      messagesAdded = added;

      // Auto-download any missing stickers contained in the synced messages
      for (const msg of filteredIncoming) {
        if (!msg?.text) continue;
        const stickerInfo = this._extractStickerInfo(msg.text, code);
        if (stickerInfo) {
          this.requestSticker(stickerInfo.stickerId, stickerInfo.ext, fromPeerId);
        }
      }
    }
    if (payload.meta) {
      await this.applyRemoteMeta(payload.meta, fromPeerId, code);
    }
    if (payload.files?.length && this.fileIndexStore) {
      const sanitizedFiles = payload.files
        .filter((f) => f && typeof f === "object")
        .map(({ realPath: _rp, local_path: _lp, ...safe }) => safe);
      const { added } = await this.fileIndexStore.merge(
        code,
        sanitizedFiles
      );
      filesAdded = added;
    }
    return { messagesAdded, filesAdded };
  }

  async handleSyncRequest(fromPeerId, payload, roomCode) {
    const code = this._resolveRoomCode(roomCode);
    const peer = this.p2p.peers.get(fromPeerId);
    if (!peer || !code || !this._isActiveRoom(code)) return;
    if (!peer.syncBusyRooms) peer.syncBusyRooms = new Set();
    if (peer.syncBusyRooms.has(code)) return;
    peer.syncBusyRooms.add(code);
    try {
      const watermarks = payload?.watermarks || {};
      const filesSince = payload?.filesSince || 0;
      const { messages, meta, files } = await this.buildSyncPayload(watermarks, filesSince, fromPeerId, code);

      // Phase 1: Send server metadata and files index first (lightweight & prioritized)
      this.p2p._sendToPeer(fromPeerId, "sync-res", {
        meta,
        files,
        roomCode: code,
        hasMore: (messages && messages.length > 0),
      });

      // Phase 2: Send messages in safe batches (max 40 msgs and < 512 KB per batch) to prevent socket/ping starvation
      if (messages && messages.length > 0) {
        const MAX_BATCH_MSGS = 40;
        const MAX_BATCH_BYTES = 512 * 1024;
        const batches = [];
        let currentBatch = [];
        let currentBytes = 0;

        for (const msg of messages) {
          let msgBytes = 512;
          try {
            msgBytes = Buffer.byteLength(JSON.stringify(msg), "utf8");
          } catch {}
          if (
            currentBatch.length > 0 &&
            (currentBatch.length >= MAX_BATCH_MSGS || currentBytes + msgBytes > MAX_BATCH_BYTES)
          ) {
            batches.push(currentBatch);
            currentBatch = [];
            currentBytes = 0;
          }
          currentBatch.push(msg);
          currentBytes += msgBytes;
        }
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
        }

        for (let i = 0; i < batches.length; i++) {
          const isLastBatch = i === batches.length - 1;
          // Yield to event loop so ping/pong keepalives are never blocked by bulk sync
          await new Promise((resolve) => setTimeout(resolve, 50));
          this.p2p._sendToPeer(fromPeerId, "sync-res", {
            messages: batches[i],
            roomCode: code,
            hasMore: !isLastBatch,
          });
        }
      }

      if (!peer.syncRequestedRooms) peer.syncRequestedRooms = new Set();
      if (!peer.syncRequestedRooms.has(code)) {
        peer.syncRequestedRooms.add(code);
        const localWatermarks = await this.chatStore.getWatermarks(code);
        const localMeta = await this.getLocalMeta(code);
        const localFiles = await this.fileIndexStore.load(code);
        if (localMeta) {
          localWatermarks._metaVersion = localMeta.version;
          localWatermarks._metaUpdatedAt = localMeta.updatedAt;
        }
        this.p2p._sendToPeer(fromPeerId, "sync-req", {
          watermarks: localWatermarks,
          filesSince: this.fileIndexStore.getWatermark(localFiles),
          from: this.p2p._resolveLocalPeerId(),
          roomCode: code,
        });
      }
    } finally {
      peer.syncBusyRooms.delete(code);
    }
  }

  async handleSyncResponse(fromPeerId, payload, roomCode) {
    const code = this._resolveRoomCode(roomCode || payload?.roomCode);
    if (!code || !this._isActiveRoom(code)) return;
    const peer = this.p2p.peers.get(fromPeerId);
    const now = Date.now();

    // ALWAYS apply server metadata immediately when payload.meta is present.
    // RoomMetaStore.merge() safely checks version numbers (remote.version > local.version).
    if (payload?.meta) {
      await this.applyRemoteMeta(payload.meta, fromPeerId, code);
    }

    if (!peer) return;

    const { messagesAdded, filesAdded } = await this.mergeSyncPayload(
      { messages: payload?.messages, files: payload?.files },
      fromPeerId,
      code
    );
    
    if (!payload?.hasMore) {
      peer.lastSyncAt = now;
      if (!peer.initialSyncComplete || messagesAdded > 0 || filesAdded > 0) {
        peer.initialSyncComplete = true;
        this.callbacks.onSyncComplete?.({
          peerId: fromPeerId,
          nickname: peer?.nickname,
          messagesAdded,
          filesAdded,
        });
      }
    }
  }

  scheduleSync(peerId, roomCode) {
    const code = this._resolveRoomCode(roomCode);
    setTimeout(async () => {
      const peer = this.p2p.peers.get(peerId);
      if (!peer?.socket || peer.socket.destroyed) return;
      if (!code || !this._isActiveRoom(code)) return;
      const watermarks = await this.chatStore.getWatermarks(code);
      const meta = await this.getLocalMeta(code);
      const files = await this.fileIndexStore.load(code);
      if (meta) {
        watermarks._metaVersion = meta.version;
        watermarks._metaUpdatedAt = meta.updatedAt;
      }
      this.p2p._sendToPeer(peerId, "sync-req", {
        watermarks,
        filesSince: this.fileIndexStore.getWatermark(files),
        from: this.p2p._resolveLocalPeerId(),
        roomCode: code,
      });
    }, 400);
  }

  authorId() {
    return this.p2p.profile?.id || this.p2p._resolveLocalPeerId() || "anonymous";
  }

  _extractEphemeralMeta(text, roomCode, fallbackTimestamp = Date.now()) {
    if (!text || typeof text !== "string") {
      return { isEphemeral: false, expiresAt: null };
    }
    let plain = text.trim();
    if (plain.startsWith("[E2EE]:") && roomCode) {
      try {
        const cryptoService = require("../services/cryptoService.cjs");
        plain = cryptoService.decrypt(roomCode, plain);
      } catch {}
    }
    if (typeof plain !== "string" || !plain.trim().startsWith("{")) {
      return { isEphemeral: false, expiresAt: null };
    }
    try {
      const parsed = JSON.parse(plain);
      if (parsed && typeof parsed === "object") {
        if (parsed.isEphemeral) {
          return {
            isEphemeral: true,
            expiresAt: Number(parsed.expiresAt) || fallbackTimestamp + 60000,
          };
        }
        if (typeof parsed.body === "string" && parsed.body.trim().startsWith("{")) {
          const inner = JSON.parse(parsed.body);
          if (inner && inner.isEphemeral) {
            return {
              isEphemeral: true,
              expiresAt: Number(inner.expiresAt) || fallbackTimestamp + 60000,
            };
          }
        }
      }
    } catch {}
    return { isEphemeral: false, expiresAt: null };
  }

  _clearEphemeralTimer(messageId) {
    if (!messageId) return;
    const existing = this._ephemeralTimers.get(messageId);
    if (existing) {
      clearTimeout(existing);
      this._ephemeralTimers.delete(messageId);
    }
  }

  _scheduleEphemeralExpiry(message, roomCode) {
    if (!message?.id || !message?.isEphemeral || !message?.expiresAt) return;
    const code = this._resolveRoomCode(roomCode || message.roomCode);
    if (!code) return;
    const ch = message.channelId || "general";
    const id = String(message.id);
    this._clearEphemeralTimer(id);

    const delay = Math.min(
      Math.max(0, Number(message.expiresAt) - Date.now()),
      2147483647
    );
    const timer = setTimeout(async () => {
      this._ephemeralTimers.delete(id);
      try {
        await this.chatStore?.delete(code, ch, id);
        if (this.fileIndexStore && code) {
          await this.fileIndexStore.removeByMessageId(code, id).catch(() => {});
        }
        this.callbacks.onChatMessageDeleted?.(id);
        const localAuthor = this.authorId();
        if (
          this.p2p &&
          (message.authorId === localAuthor || message.authorId === "self")
        ) {
          this.p2p._broadcast(
            "chat-delete",
            { channelId: ch, id, roomCode: code, ephemeralExpired: true },
            code
          );
        }
      } catch (err) {
        console.error("[ChatService] Error expiring ephemeral message:", err.message);
      }
    }, delay);
    this._ephemeralTimers.set(id, timer);
  }

  createChatMessage(channelId, text, roomCode) {
    const code = this._resolveRoomCode(roomCode);
    const now = Date.now();
    const trimmed = String(text).trim();
    const eph = this._extractEphemeralMeta(trimmed, code, now);
    return {
      id: crypto.randomUUID(),
      roomCode: code,
      channelId: channelId || "general",
      authorId: this.authorId(),
      authorNickname: (require("../services/profileService.cjs").getEffectiveProfile(this.p2p.profile, code)?.nickname) ?? this.p2p.profile?.nickname ?? "Anonymous",
      authorAvatar: (require("../services/profileService.cjs").getEffectiveProfile(this.p2p.profile, code)?.avatar) ?? this.p2p.profile?.avatar ?? null,
      text: trimmed,
      timestamp: now,
      ...(eph.isEphemeral ? { isEphemeral: true, expiresAt: eph.expiresAt } : {}),
    };
  }

  normalizeStoredMessage(msg) {
    if (!msg) return msg;
    // Only rewrite "self" if nickname strictly matches the current local profile
    if (msg.authorId === "self") {
      const myId = this.p2p.profile?.id;
      const myNick = this.p2p.profile?.nickname;
      if (myId) {
        return { ...msg, authorId: myId };
      }
    }
    return msg;
  }

  normalizeIncomingAuthor(payload, fromPeerId) {
    if (!payload || !payload.authorId || payload.authorId === "self") {
      const peer = this.p2p.peers.get(fromPeerId);
      return peer?.userId || fromPeerId;
    }
    return payload.authorId;
  }

  async persistAndEmit(message, roomCode) {
    const code = this._resolveRoomCode(roomCode || message?.roomCode);
    if (this.chatStore && code) {
      await this.chatStore.append(
        code,
        message.channelId || "general",
        message
      );
    }
    this.callbacks.onChatMessage?.(message);
    return message;
  }

  async sendPluginCommand(channelId, text, roomCode) {
    const code = this._resolveRoomCode(roomCode);
    console.log(`[ChatService] sendPluginCommand invocado con texto: "${text}", canal: "${channelId}", sala: "${code}"`);
    if (!code) throw new Error("You are not in a room");
    
    let plainText = String(text).trim();
    if (!plainText) throw new Error("Empty message");

    try {
      const cryptoService = require("../services/cryptoService.cjs");
      const decrypted = cryptoService.decrypt(code, plainText);
      if (decrypted && decrypted.trim()) {
        plainText = decrypted.trim();
      }
    } catch (e) {
      // Direct text fallback
    }

    const message = this.createChatMessage(channelId, plainText, code);
    message.isHidden = true;

    console.log(`[ChatService] Procesando comando de complemento: "${message.text}" para sala ${code}`);

    try {
      const pluginSandboxService = require("../services/pluginSandboxService.cjs");
      await pluginSandboxService.processLiveChatMessage(message);
    } catch (err) {
      console.error("[ChatService] Error al procesar mensaje en la sandbox de complementos:", err);
    }

    return message;
  }

  async sendChatMessage(channelId, text, roomCode) {
    const code = this._resolveRoomCode(roomCode);
    if (!code) throw new Error("You are not in a room");
    const trimmed = String(text).trim();
    if (!trimmed) throw new Error("Empty message");
    if (trimmed.length > 128000) throw new Error("Message payload size limit exceeded");
    const message = this.createChatMessage(channelId, trimmed, code);
    await this.persistAndEmit(message, code);
    if (message.isEphemeral) {
      this._scheduleEphemeralExpiry(message, code);
    }

    if (channelId.startsWith("dm_")) {
      const raw = channelId.slice(3);
      const myUserId = this.p2p.profile?.id;
      let recipientUserId = null;

      if (myUserId && raw.includes(myUserId)) {
        if (raw.startsWith(myUserId + "_")) {
          recipientUserId = raw.slice(myUserId.length + 1);
        } else if (raw.endsWith("_" + myUserId)) {
          recipientUserId = raw.slice(0, raw.length - myUserId.length - 1);
        }
      }

      if (!recipientUserId) {
        const parts = channelId.split("_");
        const user1 = parts[1];
        const user2 = parts[2];
        recipientUserId = user1 === myUserId ? user2 : user1;
      }

      let foundPeerId = null;
      for (const [pId, peerObj] of this.p2p.peers.entries()) {
        if (
          peerObj.userId === recipientUserId ||
          pId === recipientUserId ||
          peerObj.id === recipientUserId
        ) {
          foundPeerId = pId;
          break;
        }
      }

      if (foundPeerId) {
        this.p2p._sendToPeer(foundPeerId, "chat", message);
      } else {
        console.log(`[DM] Recipient ${recipientUserId} is offline, message stored locally.`);
      }
    } else {
      this.p2p._broadcast("chat", message, code);
    }
    return message;
  }

  async sendWebhookMessage({ roomCode, channelId, webhook, content = "", embeds = [], username = null, avatar_url = null }) {
    const code = this._resolveRoomCode(roomCode);
    if (!code) throw new Error("You are not in a room");

    const plainText = String(content || "").trim();
    const cryptoService = require("../services/cryptoService.cjs");
    const encryptedText = plainText ? cryptoService.encrypt(code, plainText) : "";

    const message = {
      id: "wh_" + crypto.randomUUID(),
      roomCode: code,
      channelId: channelId || webhook.channelId || "general",
      authorId: `webhook:${webhook.id}`,
      authorNickname: username || webhook.name || "Webhook",
      authorAvatar: avatar_url || webhook.avatar || null,
      text: encryptedText,
      embeds: Array.isArray(embeds) ? embeds.slice(0, 10) : [],
      isWebhook: true,
      webhookId: webhook.id,
      timestamp: Date.now(),
    };

    await this.persistAndEmit(message, code);
    this.p2p._broadcast("chat", message, code);
    return message;
  }

  async sendSystemMessage(channelId, text, roomCode, options = {}) {
    const code = this._resolveRoomCode(roomCode);
    if (!code) return null;
    const plainText = String(text || "").trim();
    const cryptoService = require("../services/cryptoService.cjs");
    const encryptedText = plainText ? cryptoService.encrypt(code, plainText) : "";

    const message = {
      id: options.id || "sys_" + crypto.randomUUID(),
      roomCode: code,
      channelId: channelId || "general",
      authorId: options.authorId || "onicord-bot",
      authorNickname: options.authorNickname || "Onicord",
      authorAvatar: options.authorAvatar || "bot-star",
      text: encryptedText,
      timestamp: options.timestamp || Date.now(),
      isSystemMessage: true,
      systemType: options.systemType || "info",
      systemData: options.systemData || null,
    };

    await this.persistAndEmit(message, code);
    this.p2p._broadcast("chat", message, code);
    return message;
  }

  async deleteChatMessage(channelId, messageId, roomCode) {
    const code = this._resolveRoomCode(roomCode);
    if (!code) throw new Error("You are not in a room");
    const ch = channelId || "general";
    const id = String(messageId || "").trim();
    if (!id) return { ok: false, deleted: 0 };
    this._clearEphemeralTimer(id);
    const res = await this.chatStore?.delete(code, ch, id);
    if (this.fileIndexStore && code) {
      await this.fileIndexStore.removeByMessageId(code, id).catch(() => {});
    }
    this.callbacks.onChatMessageDeleted?.(id);
    this.p2p._broadcast("chat-delete", { channelId: ch, id, roomCode: code }, code);
    return res || { ok: true, deleted: 1 };
  }

  async handleIncomingChatDelete(payload, fromPeerId) {
    if (!payload?.id || !fromPeerId) return;
    const ch = payload.channelId || "general";
    const id = String(payload.id).trim();
    if (!id) return;
    const code = this._resolveRoomCode(payload.roomCode);
    if (!code) return;

    const peer = this.p2p?.peers?.get(fromPeerId);
    const senderUserId = peer?.userId || null;

    let storedMsg = null;
    let msgAuthorId = null;
    if (this.chatStore) {
      if (typeof this.chatStore.getMessageById === "function") {
        storedMsg = await this.chatStore.getMessageById(code, ch, id);
        msgAuthorId = storedMsg?.authorId || null;
      } else if (typeof this.chatStore.getMessageAuthor === "function") {
        msgAuthorId = await this.chatStore.getMessageAuthor(code, ch, id);
      } else {
        const msgs = await this.chatStore.load(code, ch);
        storedMsg = msgs.find((m) => m?.id === id) || null;
        msgAuthorId = storedMsg?.authorId || null;
      }
    }

    const isAuthor = Boolean(
      msgAuthorId && (msgAuthorId === senderUserId || msgAuthorId === fromPeerId)
    );

    let isAdmin = false;
    if (!isAuthor && senderUserId && this.roomMetaStore) {
      try {
        const { checkAdminPermission } = require("../p2p/roomMetaStore.cjs");
        const meta = await this.roomMetaStore.load(code);
        if (meta) {
          isAdmin = Boolean(
            meta.ownerId === senderUserId ||
            meta.creatorID === senderUserId ||
            meta.creatorId === senderUserId ||
            checkAdminPermission(meta, senderUserId)
          );
        }
      } catch {}
    }

    const isEphemeralExpiryAuthorized = Boolean(
      payload.ephemeralExpired &&
      storedMsg?.isEphemeral &&
      (!storedMsg.expiresAt || storedMsg.expiresAt <= Date.now() + 5000)
    );

    if (!isAuthor && !isAdmin && !isEphemeralExpiryAuthorized) {
      console.warn(
        `[ChatService Security] Blocked unauthorized chat-delete for message ${id} from peer ${fromPeerId} (userId: ${senderUserId})`
      );
      return;
    }

    this._clearEphemeralTimer(id);
    await this.chatStore?.delete(code, ch, id);
    if (this.fileIndexStore && code) {
      await this.fileIndexStore.removeByMessageId(code, id).catch(() => {});
    }
    this.callbacks.onChatMessageDeleted?.(id);
  }

  sendTypingState(channelId, roomCode) {
    const code = this._resolveRoomCode(roomCode);
    if (!code) return;
    // OPT: Throttle to 1 broadcast per 1.5s to reduce network noise.
    if (this._typingTimer) return;
    this._typingTimer = setTimeout(() => { this._typingTimer = null; }, 1500);
    this.p2p._broadcast("typing-state", {
      userId: this.p2p.profile?.id,
      channelId: channelId || "general",
      nickname: (require("../services/profileService.cjs").getEffectiveProfile(this.p2p.profile, code)?.nickname) ?? this.p2p.profile?.nickname ?? "Alguien",
      roomCode: code,
    }, code);
  }

  async getChatHistory(roomCodeOrChannel, channelIdArg) {
    let roomCode = this.roomCode;
    let channelId = channelIdArg || "general";

    if (roomCodeOrChannel && typeof roomCodeOrChannel === "string" && !channelIdArg) {
      channelId = roomCodeOrChannel;
    } else if (roomCodeOrChannel && typeof roomCodeOrChannel === "string" && channelIdArg) {
      roomCode = roomCodeOrChannel;
    }

    if (!roomCode || !this.chatStore) return [];
    const rows = await this.chatStore.load(roomCode, channelId);
    const now = Date.now();
    return rows
      .map((msg) => this.normalizeStoredMessage(msg))
      .filter((m) => {
        if (m.isEphemeral && m.expiresAt && m.expiresAt <= now) {
          return false;
        }
        if (m.isEphemeral && m.expiresAt) {
          this._scheduleEphemeralExpiry(m, roomCode);
        }
        return true;
      });
  }

  async handleIncomingChat(payload, fromPeerId) {
    if (!payload?.id || !payload?.text || !this._isActiveRoom(payload.roomCode))
      return;

    const channelId = payload.channelId || "general";
    if (channelId.startsWith("dm_")) {
      const raw = channelId.slice(3);
      const myUserId = this.p2p.profile?.id;
      const involvesMe =
        myUserId &&
        (raw.startsWith(myUserId + "_") ||
          raw.endsWith("_" + myUserId) ||
          channelId.includes(myUserId));
      if (!involvesMe) {
        return; // Discard DMs that don't involve us
      }
    }

    const peer = this.p2p.peers.get(fromPeerId);
    const authorId = this.normalizeIncomingAuthor(payload, fromPeerId);
    const now = Date.now();
    const rawTs = payload.timestamp || now;
    const eph = payload.isEphemeral
      ? { isEphemeral: true, expiresAt: Number(payload.expiresAt) || rawTs + 60000 }
      : this._extractEphemeralMeta(payload.text, payload.roomCode, rawTs);

    if (eph.isEphemeral) {
      if (Math.abs(rawTs - now) > 5000) {
        const ttl = Math.min(120000, Math.max(1000, (eph.expiresAt - rawTs) || 60000));
        eph.expiresAt = now + ttl;
      }
      if (eph.expiresAt <= now) {
        return;
      }
    }

    const message = {
      id: payload.id,
      roomCode: payload.roomCode,
      channelId,
      authorId,
      authorNickname: payload.authorNickname || peer?.nickname || "Usuario",
      authorAvatar: payload.authorAvatar ?? peer?.avatar ?? null,
      text: payload.text,
      timestamp: Math.min(rawTs, now),
      isHidden: Boolean(payload.isHidden),
      isWebhook: Boolean(payload.isWebhook),
      webhookId: payload.webhookId || null,
      embeds: Array.isArray(payload.embeds) ? payload.embeds : [],
      isSystemMessage: Boolean(payload.isSystemMessage),
      systemType: payload.systemType || null,
      systemData: payload.systemData || null,
      ...(eph.isEphemeral ? { isEphemeral: true, expiresAt: eph.expiresAt } : {}),
    };

    if (message.isHidden) {
      try {
        const cryptoService = require("../services/cryptoService.cjs");
        const decryptedText = cryptoService.decrypt(payload.roomCode, message.text);
        const decryptedMessage = { ...message, text: decryptedText };
        const pluginSandboxService = require("../services/pluginSandboxService.cjs");
        pluginSandboxService.processLiveChatMessage(decryptedMessage);
      } catch (err) {
        console.error("[ChatService] Error triggering remote plugin sandbox:", err);
      }
      return;
    }

    if (this.chatStore?._recentMessageIds?.has(message.id)) return;
    await this.persistAndEmit(message, payload.roomCode);
    if (message.isEphemeral) {
      this._scheduleEphemeralExpiry(message, payload.roomCode);
    }

    const stickerInfo = this._extractStickerInfo(message.text, payload.roomCode);
    if (stickerInfo) {
      this.requestSticker(stickerInfo.stickerId, stickerInfo.ext, fromPeerId);
    }
  }

  _extractStickerInfo(text, roomCode) {
    if (!text || typeof text !== "string") return null;
    let plain = text.trim();
    if (plain.startsWith("[E2EE]:")) {
      try {
        const cryptoService = require("../services/cryptoService.cjs");
        const dec = cryptoService.decrypt(roomCode, plain);
        if (dec) plain = dec.trim();
      } catch (e) {}
    }
    if (!plain || typeof plain !== "string") return null;

    try {
      let obj = JSON.parse(plain);
      if (obj && typeof obj === "object") {
        if (obj.body) {
          if (typeof obj.body === "string") {
            try { obj = JSON.parse(obj.body); } catch (_) {}
          } else if (typeof obj.body === "object") {
            obj = obj.body;
          }
        }
        if (obj?.type === "sticker" && obj?.stickerId) {
          const cleanId = String(obj.stickerId).replace(/\.(png|jpg|jpeg|gif|webp)$/i, "").trim();
          return { stickerId: cleanId, ext: obj.ext || "webp" };
        }
      }
    } catch (_) {}

    const matchId = plain.match(/"stickerId"\s*:\s*"([^"]+)"/);
    if (matchId && matchId[1]) {
      const cleanId = String(matchId[1]).replace(/\.(png|jpg|jpeg|gif|webp)$/i, "").trim();
      const matchExt = plain.match(/"ext"\s*:\s*"([^"]+)"/);
      return { stickerId: cleanId, ext: matchExt ? matchExt[1].trim() : "webp" };
    }

    const legacyMatch = plain.match(/\[STICKER\]:(stk-[a-zA-Z0-9_-]+)/);
    if (legacyMatch && legacyMatch[1]) {
      return { stickerId: legacyMatch[1].trim(), ext: "webp" };
    }

    return null;
  }

  requestSticker(stickerId, ext = "webp", preferredPeerId = null) {
    if (!stickerId) return;
    const cleanId = String(stickerId).replace(/\.(png|jpg|jpeg|gif|webp)$/i, "").trim();
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanId)) return;

    const allowedExts = new Set(["webp", "png", "jpg", "jpeg", "gif"]);
    const cleanExt = String(ext || "webp").toLowerCase().replace(/^\./, "");
    const safeExt = allowedExts.has(cleanExt) ? cleanExt : "webp";

    const stickersDir = path.join(app.getPath("userData"), "stickers");
    const exists = ["webp", "png", "jpg", "gif", "jpeg"].some((e) =>
      fs.existsSync(path.join(stickersDir, `${cleanId}.${e}`))
    );
    if (exists) return;

    if (!this._requestedStickers) this._requestedStickers = new Map();
    const now = Date.now();
    const lastReq = this._requestedStickers.get(cleanId);
    if (lastReq && now - lastReq < 6000) {
      return; // Throttle to 1 request per 6s
    }
    this._requestedStickers.set(cleanId, now);

    console.log(
      `[ARES STICKER SYNC] Solicitando sticker faltante (${cleanId}) a los peers...`
    );

    const payload = { stickerId: cleanId, ext: safeExt };
    if (preferredPeerId) {
      this.p2p._sendToPeer(preferredPeerId, "sticker-request", payload);
    }
    // Also broadcast so any peer in the room holding the sticker can reply
    this.p2p._broadcast("sticker-request", payload, this.roomCode);
  }

  handleStickerRequest(peerId, payload) {
    try {
      const cleanId = String(payload?.stickerId || "").trim();
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanId)) return;

      const allowedExts = new Set(["webp", "png", "jpg", "jpeg", "gif"]);
      const ext = String(payload?.ext || "webp").toLowerCase().replace(/^\./, "");
      if (!allowedExts.has(ext)) return;

      const stickersDir = path.join(app.getPath("userData"), "stickers");
      let foundPath = null;
      let foundExt = null;

      for (const candidateExt of ["webp", "png", "jpg", "gif", "jpeg"]) {
        const targetPath = path.join(stickersDir, `${cleanId}.${candidateExt}`);
        const resolvedTarget = path.resolve(targetPath);
        if (!resolvedTarget.startsWith(path.resolve(stickersDir) + path.sep)) return;
        if (fs.existsSync(resolvedTarget)) {
          foundPath = resolvedTarget;
          foundExt = candidateExt;
          break;
        }
      }

      if (foundPath) {
        const buffer = fs.readFileSync(foundPath);
        console.log(`[ARES STICKER SYNC] Enviando sticker ${cleanId} a peer ${peerId}`);
        this.p2p._sendToPeer(peerId, "sticker-response", {
          stickerId: cleanId,
          ext: foundExt,
          base64Data: buffer.toString("base64"),
        });
      }
    } catch (err) {
      console.error("[Sticker Send Error]", err.message);
    }
  }

  handleStickerResponse(payload) {
    try {
      if (!payload?.stickerId || !payload?.base64Data) return;
      const cleanId = String(payload?.stickerId || "").trim();
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(cleanId)) return;

      const allowedExts = new Set(["webp", "png", "jpg", "jpeg", "gif"]);
      const ext = String(payload?.ext || "webp").toLowerCase().replace(/^\./, "");
      if (!allowedExts.has(ext)) return;

      if (!this._requestedStickers || !this._requestedStickers.has(cleanId)) return;

      const stickersDir = path.join(app.getPath("userData"), "stickers");

      if (!fs.existsSync(stickersDir))
        fs.mkdirSync(stickersDir, { recursive: true });

      const targetPath = path.join(stickersDir, `${cleanId}.${ext}`);
      const resolvedTarget = path.resolve(targetPath);
      if (!resolvedTarget.startsWith(path.resolve(stickersDir) + path.sep)) return;

      const buffer = Buffer.from(payload.base64Data, "base64");
      fs.writeFileSync(resolvedTarget, buffer);
      this._requestedStickers.delete(cleanId);

      console.log(
        `✅ [ARES STICKER SYNC] Sticker ${cleanId}.${ext} guardado exitosamente.`
      );
      if (global.mainWindow && !global.mainWindow.isDestroyed()) {
        global.mainWindow.webContents.send("sync:complete", {
          type: "sticker_imported",
          stickerId: cleanId,
        });
      }
    } catch (err) {
      console.error("[Sticker Receive Error]", err.message);
    }
  }
}

module.exports = { ChatService };
