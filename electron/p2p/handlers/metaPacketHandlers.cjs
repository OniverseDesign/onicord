"use strict";

const diagService = require("../../services/diagService.cjs");
const { ServerStore } = require("../serverStore.cjs");
const {
  checkAdminPermission,
  isAuthorizedSignerKey,
  buildSignableActiveInvite,
  buildSignableKeyEnvelope,
} = require("../roomMetaStore.cjs");

/**
 * Metadata, sync, discovery, membership, knock, eviction, and diagnostics packet handler.
 */
async function handleMetaPacket(roomManager, peerId, type, payload) {
  const peer = roomManager.p2pService.peers.get(peerId);
  if (!peer) return false;

  if (type === "room-announce" && payload && Array.isArray(payload.rooms)) {
    const announcedRooms = payload.rooms.map((r) => String(r || "").trim().toUpperCase()).filter(Boolean);
    const announcedSet = new Set(announcedRooms);
    if (peer.syncRequestedRooms) {
      for (const r of Array.from(peer.syncRequestedRooms)) {
        if (!announcedSet.has(r)) peer.syncRequestedRooms.delete(r);
      }
    }
    const currentCode = roomManager.roomCode ? String(roomManager.roomCode).trim().toUpperCase() : null;
    if (currentCode && !announcedSet.has(currentCode)) {
      roomManager._callbacks.onPeerLeft?.({ id: peer.userId || peerId, peerId, roomCode: currentCode });
      roomManager.voiceService.handlePeerLeft(peerId, () => roomManager._emitVoiceState());
    } else if (currentCode && announcedSet.has(currentCode) && peer.userId && !peer.isPreview) {
      roomManager._emitPeerProfile(peerId);
      roomManager.chatService.scheduleSync(peerId, currentCode);
    }
    return true;
  }

  if (type === "onicord:discover-request" || type === "onicord:discover-req") {
    try {
      const discoverService = require("../../services/discoverService.cjs");
      discoverService.syncAndAnnounceLocalServers().catch(() => {});
    } catch (_) {}
    return true;
  }

  if (type === "invite-preview-req" && payload && payload.roomCode) {
    const reqCode = String(payload.roomCode).trim().toUpperCase();
    if (roomManager.roomMetaStore && (roomManager.roomCode === reqCode || (roomManager.rooms && roomManager.rooms.has(reqCode)))) {
      roomManager.roomMetaStore.load(reqCode).then((meta) => {
        if (meta) {
          const onlinePeers = roomManager.getPeersForRoom ? roomManager.getPeersForRoom(reqCode) : [];
          const membersCount = meta.savedMembers ? Object.keys(meta.savedMembers).length : 1;
          roomManager.p2pService._sendToPeer(peerId, "invite-preview-res", {
            roomCode: reqCode,
            name: meta.name,
            icon: meta.icon,
            banner: meta.banner,
            memberCount: Math.max(1, membersCount),
            onlineCount: onlinePeers.length + 1,
          });
        }
      }).catch(() => {});
    }
    return true;
  }

  if (type === "invite-preview-res" && payload && payload.roomCode) {
    global.mainWindow?.webContents.send("invite:details-updated", payload);
    return true;
  }

  if (type === "member-profile-update" && payload && payload.roomCode && payload.memberData) {
    const targetRoom = String(payload.roomCode).trim().toUpperCase();
    const currentCode = roomManager.roomCode ? String(roomManager.roomCode).trim().toUpperCase() : null;
    if (currentCode === targetRoom || (roomManager.rooms && roomManager.rooms.has(targetRoom))) {
      const m = payload.memberData;
      if (!peer.userId && m.id) {
        peer.userId = m.id;
      }
      if (peer.userId && m.id && peer.userId === m.id) {
        if (roomManager.roomMetaStore) {
          roomManager.roomMetaStore.load(targetRoom).then(async (meta) => {
            if (!meta.savedMembers) meta.savedMembers = {};
            const antiguo = meta.savedMembers[m.id];
            meta.savedMembers[m.id] = {
              ...(antiguo || {}),
              id: m.id,
              nickname: m.nickname || antiguo?.nickname || peer.nickname,
              avatar: m.avatar !== undefined ? m.avatar : (antiguo?.avatar ?? peer.avatar),
              banner: m.banner !== undefined ? m.banner : (antiguo?.banner ?? peer.banner ?? null),
              customLink: m.customLink !== undefined ? m.customLink : (antiguo?.customLink ?? ""),
              profileColor: m.profileColor !== undefined ? m.profileColor : (antiguo?.profileColor ?? ""),
              customStatus: m.customStatus !== undefined ? m.customStatus : (antiguo?.customStatus ?? ""),
              globalNickname: m.globalNickname || antiguo?.globalNickname || peer.nickname,
              hasCustomProfile: Boolean(m.hasCustomProfile || (m.globalNickname && m.nickname !== m.globalNickname)),
              ...(m.flame && typeof m.flame === "object" ? { flame: m.flame } : {}),
              updatedAt: m.updatedAt || Date.now(),
              joinedAt: antiguo?.joinedAt || Date.now(),
            };
            if (m.flame && typeof m.flame === "object") {
              const existingPeerFlame =
                peer.flame && typeof peer.flame === "object" && !("currentStreak" in peer.flame)
                  ? peer.flame
                  : {};
              peer.flame = {
                ...existingPeerFlame,
                [targetRoom]: m.flame,
              };
            }
            await roomManager.roomMetaStore.updateSavedMembers(targetRoom, meta.savedMembers);
            roomManager._callbacks.onServerMetaUpdated?.(targetRoom, meta);

            if (roomManager._callbacks.onPeerUpdated && currentCode === targetRoom) {
              roomManager._callbacks.onPeerUpdated({
                id: peer.userId,
                userId: peer.userId,
                peerId: peer.id,
                nickname: meta.savedMembers[m.id].nickname,
                avatar: meta.savedMembers[m.id].avatar,
                banner: meta.savedMembers[m.id].banner ?? null,
                customLink: meta.savedMembers[m.id].customLink,
                profileColor: meta.savedMembers[m.id].profileColor,
                customStatus: meta.savedMembers[m.id].customStatus,
                globalNickname: meta.savedMembers[m.id].globalNickname,
                status: peer.status || "online",
                online: peer.status !== "invisible",
                activity: peer.activity || null,
                showRichPresence: peer.showRichPresence,
                flame: peer.flame,
                ping: peer.averagePing !== undefined ? Math.round(peer.averagePing) : null,
              });
            }
          }).catch((err) => console.error("[RoomManager] Error en member-profile-update:", err.message));
        }
      }
    }
    return true;
  }

  if (type === "member-leave" && payload && payload.roomCode && payload.userId) {
    const targetRoom = String(payload.roomCode).trim().toUpperCase();
    const currentCode = roomManager.roomCode ? String(roomManager.roomCode).trim().toUpperCase() : null;
    const isLocalRoomMember = currentCode === targetRoom || (roomManager.rooms && roomManager.rooms.has(targetRoom));
    if (roomManager.roomMetaStore && isLocalRoomMember) {
      roomManager.roomMetaStore.load(targetRoom).then(async (localMeta) => {
        const senderId = peer.userId;
        const isSelfLeave = Boolean(senderId && senderId === payload.userId);
        const isAdminAction = Boolean(
          senderId &&
          localMeta &&
          (localMeta.ownerId === senderId || localMeta.creatorID === senderId || checkAdminPermission(localMeta, senderId))
        );
        if (senderId && !isSelfLeave && !isAdminAction) {
          return;
        }

        let leavingPeerSocketId = null;
        for (const [pId, pObj] of roomManager.p2pService.peers.entries()) {
          if (pObj.userId === payload.userId || pId === payload.userId) {
            leavingPeerSocketId = pId;
            roomManager.p2pService.peerRooms.get(pId)?.delete(targetRoom);
            pObj.syncRequestedRooms?.delete(targetRoom);
          }
        }

        const meta = await roomManager.roomMetaStore.removeSavedMember(targetRoom, payload.userId);
        if (meta) {
          roomManager._callbacks.onServerMetaUpdated?.(targetRoom, meta);
        }
        if (currentCode === targetRoom) {
          roomManager._callbacks.onPeerLeft?.({
            id: payload.userId,
            peerId: leavingPeerSocketId || payload.userId,
            roomCode: targetRoom,
          });
          if (leavingPeerSocketId) {
            roomManager.voiceService.handlePeerLeft(leavingPeerSocketId, () => roomManager._emitVoiceState());
          }
        }
      }).catch((err) => console.error("[RoomManager] Error en member-leave:", err.message));
    }
    return true;
  }

  if (type === "activity-state" && payload) {
    if (payload.name) {
      peer.activity = payload;
    } else {
      delete peer.activity;
    }
    roomManager._callbacks.onPeerActivityUpdated?.({
      peerId,
      userId: peer.userId,
      activity: peer.activity || null,
    });
    return true;
  }

  if (type === "sync-req" && payload) {
    const syncRoomCode = payload?.roomCode || roomManager.roomCode;
    roomManager.chatService.handleSyncRequest(peerId, payload, syncRoomCode).catch((err) =>
      console.error("[p2p] sync-req error", err.message)
    );
    return true;
  }

  if (type === "sync-res" && payload) {
    const syncRoomCode = payload?.roomCode || roomManager.roomCode;
    roomManager.chatService.handleSyncResponse(peerId, payload, syncRoomCode).catch((err) =>
      console.error("[p2p] sync-res error", err.message)
    );
    return true;
  }

  if (type === "meta-update" && payload) {
    const metaRoomCode = payload?.roomCode || roomManager.roomCode;
    if (metaRoomCode) {
      roomManager.chatService.applyRemoteMeta(payload, peerId, metaRoomCode).catch((err) =>
        console.error("[p2p] meta error", err.message)
      );
    }
    return true;
  }

  if (type === "room-key-sync" && payload && payload.roomCode) {
    try {
      const code = String(payload.roomCode).trim().toUpperCase();
      if (!roomManager.isPeerInRoom(peerId, code)) return true;
      if (!roomManager.rooms?.has(code) && roomManager.roomCode !== code) return true;

      const meta = await roomManager.roomMetaStore?.load(code);
      if (meta && peer?.userId && Array.isArray(meta.bannedUsers) && meta.bannedUsers.includes(peer.userId)) {
        return true;
      }

      const cryptoService = require("../../services/cryptoService.cjs");
      const incomingEnvelopes = Array.isArray(payload.keyEnvelopes) ? payload.keyEnvelopes : [];
      const currentState = roomManager.getRoomKeyState(code);
      const nextRing = { ...(currentState.keyRing || {}) };
      const envByEpoch = new Map();
      for (const existingEnv of (currentState.keyEnvelopes || [])) {
        if (existingEnv && Number(existingEnv.epoch) >= 2) {
          envByEpoch.set(Number(existingEnv.epoch), existingEnv);
        }
      }

      let maxVerifiedEpoch = currentState.currentEpoch || 1;
      let changed = false;

      for (const env of incomingEnvelopes) {
        if (!env || typeof env !== "object") continue;
        const ep = Number(env.epoch) || 0;
        if (ep < 2 || !cryptoService.isValidRoomSecret(env.secret)) continue;

        const signerPub =
          typeof env.signedByPublicKey === "string" ? env.signedByPublicKey.trim().toLowerCase() : null;
        if (!signerPub || typeof env.signature !== "string") continue;

        if (meta?.ownerPublicKey) {
          if (!isAuthorizedSignerKey(meta, signerPub)) {
            console.warn(`[room-key-sync] Rejected unauthorized signer ${signerPub} for ${code} epoch ${ep}`);
            continue;
          }
        } else if (meta?.ownerId && peer?.userId && peer.userId !== meta.ownerId && !checkAdminPermission(meta, peer.userId)) {
          continue;
        }

        const sigOk = cryptoService.verifyPayload(
          buildSignableKeyEnvelope(code, env),
          env.signature,
          signerPub
        );
        if (!sigOk) {
          console.warn(`[room-key-sync] Rejected invalid signature for ${code} epoch ${ep}`);
          continue;
        }

        if (nextRing[String(ep)] !== env.secret.trim()) {
          nextRing[String(ep)] = env.secret.trim();
          changed = true;
        }
        envByEpoch.set(ep, { ...env, roomCode: code, epoch: ep, secret: env.secret.trim() });
        if (ep > maxVerifiedEpoch) {
          maxVerifiedEpoch = ep;
        }
      }

      if (changed || maxVerifiedEpoch > (currentState.currentEpoch || 1)) {
        const mergedEnvelopes = Array.from(envByEpoch.values()).sort((a, b) => Number(a.epoch) - Number(b.epoch));
        roomManager._roomKeyRings?.set(code, {
          currentEpoch: maxVerifiedEpoch,
          keyRing: nextRing,
          keyEnvelopes: mergedEnvelopes,
        });
        const serverStore = new ServerStore(roomManager.userDataPath);
        const updatedServer = await serverStore.updateRoomKeyRing(code, {
          currentKeyEpoch: maxVerifiedEpoch,
          keyRing: nextRing,
          keyEnvelopes: mergedEnvelopes,
        });
        if (updatedServer) {
          global.mainWindow?.webContents.send("server:updated", {
            ...updatedServer,
            savedMembers: meta?.savedMembers || updatedServer.savedMembers || {},
          });
        }
      }
    } catch (err) {
      console.error("[p2p] room-key-sync error:", err.message);
    }
    return true;
  }

  if (type === "invite-redeem-req" && payload && payload.roomCode && payload.requestId) {
    try {
      const code = String(payload.roomCode).trim().toUpperCase();
      if (!roomManager.rooms?.has(code) && roomManager.roomCode !== code) return true;
      if (!roomManager.roomMetaStore) return true;

      const meta = await roomManager.roomMetaStore.load(code);
      const inv = meta?.activeInvite || null;
      const sendRes = (resPayload) => {
        roomManager.p2pService._sendToPeer(peerId, "invite-redeem-res", {
          requestId: payload.requestId,
          roomCode: code,
          ...resPayload,
        });
      };

      const cryptoService = require("../../services/cryptoService.cjs");
      if (!inv || !cryptoService.isValidRoomSecret(inv.inviteSecret)) {
        sendRes({ ok: false, reason: "INVALID" });
        return true;
      }

      if (meta?.ownerPublicKey) {
        const invSigner = typeof inv.signedByPublicKey === "string" ? inv.signedByPublicKey.trim().toLowerCase() : null;
        if (
          !invSigner ||
          !isAuthorizedSignerKey(meta, invSigner) ||
          !cryptoService.verifyPayload(buildSignableActiveInvite(code, inv), inv.signature, invSigner)
        ) {
          sendRes({ ok: false, reason: "INVALID" });
          return true;
        }
      }

      const expectedHash = cryptoService.hashInviteSecret(inv.inviteSecret);
      if (!payload.inviteSecretHash || expectedHash !== String(payload.inviteSecretHash).trim().toLowerCase()) {
        sendRes({ ok: false, reason: "INVALID" });
        return true;
      }

      if (inv.revoked) {
        sendRes({ ok: false, reason: "REVOKED" });
        return true;
      }

      if (inv.expiresAt !== undefined && inv.expiresAt !== null && Date.now() > Number(inv.expiresAt) + 60000) {
        sendRes({ ok: false, reason: "EXPIRED" });
        return true;
      }

      const applicantId = payload.applicant?.id || peer?.userId || null;
      if (applicantId && Array.isArray(meta?.bannedUsers) && meta.bannedUsers.includes(applicantId)) {
        sendRes({ ok: false, reason: "BANNED" });
        return true;
      }

      const mode = payload.mode === "preview" ? "preview" : "redeem";
      const memberCount = meta?.savedMembers ? Object.keys(meta.savedMembers).length : 1;
      const onlinePeers = roomManager.getPeersForRoom ? roomManager.getPeersForRoom(code) : [];

      if (mode === "preview") {
        sendRes({
          ok: true,
          preview: true,
          name: meta.name || `Servidor ${code.slice(0, 4)}`,
          icon: meta.icon || null,
          memberCount: Math.max(1, memberCount),
          onlineCount: onlinePeers.length + 1,
          expiresAt: inv.expiresAt || null,
        });
        return true;
      }

      const roomRoutingSecret = roomManager.getRoomSecret(code);
      const keyState = roomManager.getRoomKeyState(code);
      sendRes({
        ok: true,
        preview: false,
        name: meta.name || `Servidor ${code.slice(0, 4)}`,
        icon: meta.icon || null,
        expiresAt: inv.expiresAt || null,
        roomRoutingSecret,
        currentKeyEpoch: keyState.currentEpoch,
        keyRing: keyState.keyRing,
        keyEnvelopes: keyState.keyEnvelopes,
      });
    } catch (err) {
      console.error("[p2p] invite-redeem-req error:", err.message);
    }
    return true;
  }

  if (type === "invite-redeem-res" && payload && payload.requestId) {
    const waiter = roomManager._pendingInviteRedeems?.get(payload.requestId);
    if (waiter) {
      roomManager._pendingInviteRedeems.delete(payload.requestId);
      waiter(payload);
    }
    return true;
  }

  if (type === "room-secret-migrate" && payload && payload.roomCode) {
    try {
      const code = String(payload.roomCode).trim().toUpperCase();
      if (!roomManager.rooms?.has(code) && roomManager.roomCode !== code) return true;
      const cryptoService = require("../../services/cryptoService.cjs");
      if (!cryptoService.isValidRoomSecret(payload.roomSecret)) return true;

      const meta = await roomManager.roomMetaStore?.load(code);
      const signerPub =
        typeof payload.signedByPublicKey === "string"
          ? payload.signedByPublicKey.trim().toLowerCase()
          : null;
      const expectedOwnerPub = meta?.ownerPublicKey
        ? String(meta.ownerPublicKey).trim().toLowerCase()
        : null;
      // Verify against anchored ownerPublicKey (or allow initial anchor ONLY if authenticated peer IS the room owner)
      const senderIsKnownOwner = Boolean(meta?.ownerId && peer?.userId === meta.ownerId);
      if (!signerPub || (expectedOwnerPub ? signerPub !== expectedOwnerPub : !senderIsKnownOwner)) {
        console.warn(`[room-secret-migrate] Rejected unauthorized secret migration for ${code} from ${peerId}`);
        return true;
      }

      const validSig = cryptoService.verifyPayload(
        {
          roomCode: code,
          roomSecret: payload.roomSecret.trim(),
          migratedAt: Number(payload.migratedAt),
        },
        payload.signature,
        signerPub
      );
      if (!validSig) {
        console.warn(`[room-secret-migrate] Invalid Ed25519 signature for ${code}`);
        return true;
      }

      const cleanSecret = payload.roomSecret.trim();
      const serverStore = new ServerStore(roomManager.userDataPath);
      await serverStore.setRoomSecret(code, cleanSecret);
      roomManager._roomSecrets?.set(code, cleanSecret);

      if (roomManager.roomMetaStore && meta) {
        if (!meta.ownerPublicKey) meta.ownerPublicKey = signerPub;
        meta.roomSecretMigration = {
          roomCode: code,
          roomSecret: cleanSecret,
          migratedAt: Number(payload.migratedAt),
          signedByPublicKey: signerPub,
          signature: payload.signature,
        };
        await roomManager.roomMetaStore.save(code, meta);
      }

      await roomManager.p2pService.joinRoom(code, {
        roomSecret: cleanSecret,
        keepLegacyTopic: true,
      });

      const updatedServer = await serverStore.getByRoomCode(code);
      if (updatedServer) {
        global.mainWindow?.webContents.send("server:updated", {
          ...updatedServer,
          savedMembers: meta?.savedMembers || updatedServer.savedMembers || {},
        });
      }
      roomManager._callbacks?.onServerMetaUpdated?.(code, meta || {});
    } catch (err) {
      console.error("[p2p] room-secret-migrate error:", err.message);
    }
    return true;
  }

  if (type === "evict" && payload) {
    const { type: evictType, roomCode, name } = payload;
    const normalizedCode = String(roomCode || "").trim().toUpperCase();
    if (!normalizedCode) return true;

    const serverStore = new ServerStore(roomManager.userDataPath);
    const localServer = (await serverStore.get(normalizedCode)) || (await serverStore.getByRoomCode(normalizedCode));
    const myId = roomManager.profile?.id || roomManager.p2pService?.profile?.id;

    if (localServer?.isOwner || (myId && localServer?.ownerId && localServer.ownerId === myId)) {
      console.warn(`[P2P Evict] Ignored eviction attempt in owned room ${normalizedCode} from peer ${peerId}`);
      return true;
    }

    if (roomManager.roomMetaStore) {
      try {
        const localMeta = await roomManager.roomMetaStore.load(normalizedCode);
        if (myId && localMeta?.ownerId && localMeta.ownerId === myId) {
          console.warn(`[P2P Evict] Ignored eviction attempt against owner in room ${normalizedCode}`);
          return true;
        }
        if (localMeta?.ownerPublicKey) {
          const cryptoService = require("../../services/cryptoService.cjs");
          const signerPub =
            typeof payload.signedByPublicKey === "string"
              ? payload.signedByPublicKey.trim().toLowerCase()
              : null;
          const ownerPub = String(localMeta.ownerPublicKey).trim().toLowerCase();
          const adminPubs = new Set(
            Object.values(localMeta.adminPublicKeys || {})
              .map((k) => String(k || "").trim().toLowerCase())
              .filter(Boolean)
          );
          const isAllowedSigner = Boolean(signerPub && (signerPub === ownerPub || adminPubs.has(signerPub)));
          const evictTs = Number(payload.timestamp) || 0;
          const fresh = evictTs > 0 && Math.abs(Date.now() - evictTs) <= 5 * 60 * 1000;
          const sigOk = Boolean(
            isAllowedSigner &&
            fresh &&
            typeof payload.signature === "string" &&
            cryptoService.verifyPayload(
              {
                type: evictType,
                roomCode: normalizedCode,
                targetUserId: payload.targetUserId || myId,
                timestamp: evictTs,
              },
              payload.signature,
              signerPub
            )
          );
          if (!sigOk) {
            console.warn(`[P2P Evict] Rejected forged/unsigned eviction for room ${normalizedCode} from peer ${peerId}`);
            return true;
          }
        } else if (peer.userId && (localMeta?.ownerId || localMeta?.creatorID)) {
          const isAuthorizedEvictor =
            localMeta.ownerId === peer.userId ||
            localMeta.creatorID === peer.userId ||
            checkAdminPermission(localMeta, peer.userId);
          if (!isAuthorizedEvictor) {
            console.warn(`[P2P Evict] Rejected unauthorized eviction from ${peer.userId} in room ${normalizedCode}`);
            return true;
          }
        }
      } catch (_) {}
    }

    console.log(`[P2P Evict] Received authorized eviction (${evictType}) from room ${normalizedCode}`);
    try {
      await roomManager.leaveSingleRoom(normalizedCode);
      if (localServer) {
        await serverStore.remove(localServer.id);
      } else {
        await serverStore.remove(normalizedCode);
      }
    } catch (e) {
      console.error(`[P2P Evict Error removing server ${normalizedCode}]:`, e);
    }
    const resolvedName = name || localServer?.name || normalizedCode;
    if (evictType === "banned") {
      global.mainWindow?.webContents.send("server:banned", { roomCode: normalizedCode, name: resolvedName });
    } else {
      global.mainWindow?.webContents.send("server:kicked", { roomCode: normalizedCode, name: resolvedName });
    }
    return true;
  }

  if (type === "diag-request" && payload) {
    const sharedRooms = roomManager.p2pService.peerRooms.get(peerId);
    if (!sharedRooms || sharedRooms.size === 0) {
      console.warn(`[Diagnostics] Rechazada petición diag-request de ${peerId}: no comparte sala activa.`);
      return true;
    }

    const now = Date.now();
    const lastReqAt = roomManager._diagCooldownByPeer?.get(peerId) || 0;
    if (now - lastReqAt < 30000) {
      console.warn(`[Diagnostics] Cooldown activo para diag-request de ${peerId}.`);
      return true;
    }
    roomManager._diagCooldownByPeer?.set(peerId, now);

    const requestId = payload.requestId || require("crypto").randomUUID();
    diagService.log("info", "Diagnostics", `Received log request from peer ${peerId}`);

    if (process.env.ONICORD_DEV_ALLOW_DIAG === "1") {
      const sanitizedLogs = diagService.sanitizeLogs(diagService.getLocalLogs());
      roomManager.p2pService._sendToPeer(peerId, "diag-response", {
        requestId,
        nickname: roomManager.profile?.nickname || "Peer",
        logs: sanitizedLogs,
      });
      return true;
    }

    const nickname = peer?.nickname || "Peer";
    const expiresAt = now + 60000;
    const timer = setTimeout(() => {
      if (roomManager._pendingDiagRequests?.has(requestId)) {
        roomManager._pendingDiagRequests.delete(requestId);
        roomManager.p2pService._sendToPeer(peerId, "diag-response", {
          requestId,
          rejected: true,
          reason: "timeout",
          nickname: roomManager.profile?.nickname || "Peer",
          logs: [],
        });
      }
    }, 60000);
    if (typeof timer.unref === "function") timer.unref();

    roomManager._pendingDiagRequests?.set(requestId, {
      requestId,
      peerId,
      nickname,
      expiresAt,
      timer,
    });

    roomManager._callbacks?.onDiagConsentRequest?.({
      requestId,
      peerId,
      nickname,
      expiresAt,
    });
    return true;
  }

  if (type === "diag-response" && payload) {
    diagService.log("info", "Diagnostics", `Received logs response from peer ${peerId}`);
    if (roomManager._peerLogListener) {
      roomManager._peerLogListener({
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
    return true;
  }

  if (type === "onicord:widget-p2p" && payload) {
    try {
      const pluginSandboxService = require("../../services/pluginSandboxService.cjs");
      pluginSandboxService.handleIncomingWidgetP2PData(peerId, payload);
    } catch (err) {
      console.error("[p2p] onicord:widget-p2p error:", err.message);
    }
    return true;
  }

  if (type === "onicord:discover-announce" && payload) {
    try {
      const discoverService = require("../../services/discoverService.cjs");
      discoverService.handleIncomingAnnouncement(payload, false, peerId);
    } catch (err) {
      console.error("[p2p] onicord:discover-announce error:", err.message);
    }
    return true;
  }

  if (type === "onicord:discover-unannounce" && payload && payload.roomCode) {
    try {
      const discoverService = require("../../services/discoverService.cjs");
      await discoverService.handleIncomingUnannounce(payload, peerId);
    } catch (err) {
      console.error("[p2p] onicord:discover-unannounce error:", err.message);
    }
    return true;
  }

  if (type === "onicord:knock-request" && payload) {
    try {
      const discoverService = require("../../services/discoverService.cjs");
      discoverService.handleIncomingKnock(payload);
    } catch (err) {
      console.error("[p2p] onicord:knock-request error:", err.message);
    }
    return true;
  }

  if (type === "onicord:knock-approved" && payload) {
    try {
      const discoverService = require("../../services/discoverService.cjs");
      await discoverService.handleKnockApproved(payload, roomManager);
    } catch (err) {
      console.error("[p2p] onicord:knock-approved error:", err.message);
    }
    return true;
  }

  if (type === "onicord:knock-rejected" && payload) {
    try {
      const discoverService = require("../../services/discoverService.cjs");
      await discoverService.handleKnockRejected(payload, roomManager);
    } catch (err) {
      console.error("[p2p] onicord:knock-rejected error:", err.message);
    }
    return true;
  }

  return false;
}

module.exports = { handleMetaPacket };
