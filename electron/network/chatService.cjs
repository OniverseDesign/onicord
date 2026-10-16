const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

class ChatService {
  constructor(p2pService, chatStore, fileIndexStore, roomMetaStore, callbacks) {
    this.p2p = p2pService;
    this.chatStore = chatStore;
    this.fileIndexStore = fileIndexStore;
    this.roomMetaStore = roomMetaStore;
    this.callbacks = callbacks;
    this.roomCode = null;
    this.roomCodes = new Set();
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
    if (!code || !this.roomMetaStore) return false;
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
    this.p2p._broadcast("meta-update", meta);
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
        const { realPath, ...safe } = f || {};
        return safe;
      });
    const theirV = watermarks._metaVersion || 0;
    const theirT = watermarks._metaUpdatedAt || 0;
    const sendMeta =
      meta &&
      (meta.version > theirV ||
        (meta.version === theirV && meta.updatedAt > theirT))
        ? meta
        : null;
    return { messages: allowedMessages, meta: sendMeta, files };
  }

  async mergeSyncPayload(payload, fromPeerId, roomCode) {
    const code = this._resolveRoomCode(roomCode);
    let messagesAdded = 0;
    let filesAdded = 0;
    if (!code) return { messagesAdded, filesAdded };

    if (payload.messages?.length) {
      const myUserId = this.p2p.profile?.id;
      const filteredIncoming = payload.messages.filter((msg) => {
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
      }).map((msg) => {
        if (msg && msg.timestamp) {
          msg.timestamp = Math.min(msg.timestamp, Date.now());
        }
        return msg;
      });

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
      const { added } = await this.fileIndexStore.merge(
        code,
        payload.files
      );
      filesAdded = added;
    }
    return { messagesAdded, filesAdded };
  }

  async handleSyncRequest(fromPeerId, payload, roomCode) {
    const code = this._resolveRoomCode(roomCode);
    const peer = this.p2p.peers.get(fromPeerId);
    if (!peer || peer.syncBusy || !code) return;
    peer.syncBusy = true;
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

      // Phase 2: Send messages in safe chunks (< 1.5MB / 75 msgs per chunk) to avoid socket overflow
      if (messages && messages.length > 0) {
        const CHUNK_SIZE = 75;
        const total = messages.length;
        for (let i = 0; i < total; i += CHUNK_SIZE) {
          const chunk = messages.slice(i, i + CHUNK_SIZE);
          const isLastChunk = i + CHUNK_SIZE >= total;
          // Slight yield to avoid blocking socket buffer
          await new Promise((resolve) => setTimeout(resolve, 30));
          this.p2p._sendToPeer(fromPeerId, "sync-res", {
            messages: chunk,
            roomCode: code,
            hasMore: !isLastChunk,
          });
        }
      }

      if (!peer.syncRequested) {
        peer.syncRequested = true;
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
      peer.syncBusy = false;
    }
  }

  async handleSyncResponse(fromPeerId, payload, roomCode) {
    const code = this._resolveRoomCode(roomCode || payload?.roomCode);
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
      if (!code) return;
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

  createChatMessage(channelId, text, roomCode) {
    const code = this._resolveRoomCode(roomCode);
    return {
      id: crypto.randomUUID(),
      roomCode: code,
      channelId: channelId || "general",
      authorId: this.authorId(),
      authorNickname: this.p2p.profile?.nickname ?? "Anonymous",
      authorAvatar: this.p2p.profile?.avatar ?? null,
      text: String(text).trim(),
      timestamp: Date.now(),
    };
  }

  normalizeStoredMessage(msg) {
    if (!msg) return msg;
    // Solo reescribir "self" si el nickname coincide fehacientemente con el perfil local actual
    if (msg.authorId === "self") {
      const myId = this.p2p.profile?.id;
      const myNick = this.p2p.profile?.nickname;
      if (myId && myNick && msg.authorNickname === myNick) {
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
      this.p2p._broadcast("chat", message);
    }
    return message;
  }

  async deleteChatMessage(channelId, messageId, roomCode) {
    const code = this._resolveRoomCode(roomCode);
    if (!code) throw new Error("You are not in a room");
    const ch = channelId || "general";
    const id = String(messageId || "").trim();
    if (!id) return { ok: false, deleted: 0 };
    const res = await this.chatStore?.delete(code, ch, id);
    if (this.fileIndexStore && code) {
      await this.fileIndexStore.removeByMessageId(code, id).catch(() => {});
    }
    this.callbacks.onChatMessageDeleted?.(id);
    this.p2p._broadcast("chat-delete", { channelId: ch, id, roomCode: code });
    return res || { ok: true, deleted: 1 };
  }

  async handleIncomingChatDelete(payload, fromPeerId) {
    if (!payload?.id) return;
    const ch = payload.channelId || "general";
    const id = String(payload.id).trim();
    if (!id) return;
    const code = this._resolveRoomCode(payload.roomCode);
    if (!code) return;
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
      nickname: this.p2p.profile?.nickname ?? "Alguien",
      roomCode: code,
    });
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
    return rows.map((msg) => this.normalizeStoredMessage(msg));
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

    const message = {
      id: payload.id,
      roomCode: payload.roomCode,
      channelId,
      authorId,
      authorNickname: payload.authorNickname || peer?.nickname || "Usuario",
      authorAvatar: payload.authorAvatar ?? peer?.avatar ?? null,
      text: payload.text,
      timestamp: Math.min(payload.timestamp || Date.now(), Date.now()),
      isHidden: Boolean(payload.isHidden),
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

    const existing = await this.chatStore?.load(payload.roomCode, channelId);
    if (existing?.some((m) => m.id === message.id)) return;
    await this.persistAndEmit(message, payload.roomCode);

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
    if (!cleanId) return;

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

    const payload = { stickerId: cleanId, ext: ext || "webp" };
    if (preferredPeerId) {
      this.p2p._sendToPeer(preferredPeerId, "sticker-request", payload);
    }
    // Also broadcast so any peer in the room holding the sticker can reply
    this.p2p._broadcast("sticker-request", payload);
  }

  handleStickerRequest(peerId, payload) {
    try {
      if (!payload?.stickerId) return;
      const cleanId = String(payload.stickerId).replace(/\.(png|jpg|jpeg|gif|webp)$/i, "").trim();
      const stickersDir = path.join(app.getPath("userData"), "stickers");
      let foundPath = null;
      let foundExt = null;

      for (const ext of ["webp", "png", "jpg", "gif", "jpeg"]) {
        const testPath = path.join(stickersDir, `${cleanId}.${ext}`);
        if (fs.existsSync(testPath)) {
          foundPath = testPath;
          foundExt = ext;
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
      const cleanId = String(payload.stickerId).replace(/\.(png|jpg|jpeg|gif|webp)$/i, "").trim();
      const ext = payload.ext || "webp";
      const stickersDir = path.join(app.getPath("userData"), "stickers");

      if (!fs.existsSync(stickersDir))
        fs.mkdirSync(stickersDir, { recursive: true });

      const targetPath = path.join(stickersDir, `${cleanId}.${ext}`);
      const buffer = Buffer.from(payload.base64Data, "base64");
      fs.writeFileSync(targetPath, buffer);

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
