"use strict";

const diagService = require("../../services/diagService.cjs");
const { ServerStore } = require("../serverStore.cjs");
const { checkAdminPermission } = require("../roomMetaStore.cjs");

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

  if (type === "onicord:discover-request") {
    try {
      const discoverService = require("../../services/discoverService.cjs");
      discoverService.syncAndAnnounceLocalServers(peerId).catch(() => {});
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
              customLink: m.customLink !== undefined ? m.customLink : (antiguo?.customLink ?? ""),
              profileColor: m.profileColor !== undefined ? m.profileColor : (antiguo?.profileColor ?? ""),
              customStatus: m.customStatus !== undefined ? m.customStatus : (antiguo?.customStatus ?? ""),
              globalNickname: m.globalNickname || antiguo?.globalNickname || peer.nickname,
              hasCustomProfile: Boolean(m.hasCustomProfile || (m.globalNickname && m.nickname !== m.globalNickname)),
              updatedAt: m.updatedAt || Date.now(),
              joinedAt: antiguo?.joinedAt || Date.now(),
            };
            await roomManager.roomMetaStore.updateSavedMembers(targetRoom, meta.savedMembers);
            roomManager._callbacks.onServerMetaUpdated?.(targetRoom, meta);

            if (roomManager._callbacks.onPeerUpdated && currentCode === targetRoom) {
              roomManager._callbacks.onPeerUpdated({
                id: peer.userId,
                peerId: peer.id,
                nickname: meta.savedMembers[m.id].nickname,
                avatar: meta.savedMembers[m.id].avatar,
                customLink: meta.savedMembers[m.id].customLink,
                profileColor: meta.savedMembers[m.id].profileColor,
                customStatus: meta.savedMembers[m.id].customStatus,
                globalNickname: meta.savedMembers[m.id].globalNickname,
                online: true,
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
        if (peer.userId && (localMeta?.ownerId || localMeta?.creatorID)) {
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
    diagService.log("info", "Diagnostics", `Received log request from peer ${peerId}`);
    const sanitizedLogs = diagService.sanitizeLogs(diagService.getLocalLogs());
    roomManager.p2pService._sendToPeer(peerId, "diag-response", {
      requestId: payload.requestId,
      nickname: roomManager.profile?.nickname || "Peer",
      logs: sanitizedLogs,
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
      discoverService.handleIncomingAnnouncement(payload, false);
    } catch (err) {
      console.error("[p2p] onicord:discover-announce error:", err.message);
    }
    return true;
  }

  if (type === "onicord:discover-unannounce" && payload && payload.roomCode) {
    try {
      const discoverService = require("../../services/discoverService.cjs");
      discoverService.discoveredServers.delete(String(payload.roomCode).toUpperCase());
      discoverService._saveCacheDebounced();
      discoverService._broadcast("plugins:discover-servers-updated", discoverService.getDiscoveredServers());
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
      const myProfile = roomManager.profile || roomManager.p2pService?.profile;
      const myId = myProfile?.id;
      if (payload.applicantId && payload.applicantId === myId && payload.roomCode) {
        const serverName = payload.serverName || payload.serverData?.name || payload.roomCode;
        try {
          const serverService = require("../../services/serverService.cjs");
          await serverService.joinServer(payload.roomCode, serverName, myProfile);
          roomManager.connectToRoom(payload.roomCode, false, myProfile, { isBackground: true }).catch(() => {});
        } catch (joinErr) {
          console.error("[p2p] Error auto-joining approved server:", joinErr.message);
        }
        global.mainWindow?.webContents.send("plugins:show-toast", {
          title: "¡Solicitud Aprobada!",
          message: `Tu solicitud para unirte a "${serverName}" ha sido aprobada.`,
          type: "success",
        });
        global.mainWindow?.webContents.send("discover:knock-status-changed", {
          roomCode: payload.roomCode,
          status: "approved",
          serverName,
        });
      }
    } catch (err) {
      console.error("[p2p] onicord:knock-approved error:", err.message);
    }
    return true;
  }

  if (type === "onicord:knock-rejected" && payload) {
    try {
      const myId = roomManager.profile?.id || roomManager.p2pService?.profile?.id;
      if (payload.applicantId && payload.applicantId === myId) {
        global.mainWindow?.webContents.send("plugins:show-toast", {
          title: "Solicitud Rechazada",
          message: `Tu solicitud para unirte al servidor ${payload.roomCode} fue rechazada.`,
          type: "warning",
        });
        global.mainWindow?.webContents.send("discover:knock-status-changed", {
          roomCode: payload.roomCode,
          status: "rejected",
        });
      }
    } catch (err) {
      console.error("[p2p] onicord:knock-rejected error:", err.message);
    }
    return true;
  }

  return false;
}

module.exports = { handleMetaPacket };
