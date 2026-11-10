"use strict";

/**
 * Voice, signaling, media stream, ping/pong packet handler.
 * Dispatches: 'voice-state', 'webrtc-signal', 'speaking-state', 'sfu-host-claim',
 *             'music-channel-state', 'music-channel-cmd', 'watch-party-state',
 *             'watch-party-cmd', 'ping', 'pong'.
 */
async function handleVoicePacket(roomManager, peerId, type, payload) {
  if (type === "voice-state" && payload) {
    roomManager.voiceService.handleVoiceState(peerId, payload, () => roomManager._emitVoiceState());
    return true;
  }

  if (type === "webrtc-signal" && payload) {
    if (!payload?.signal) return true;
    roomManager._callbacks.onVoiceSignal?.({
      peerId: peerId,
      fromPeerId: peerId,
      channelId: payload.channelId,
      signal: payload.signal,
    });
    return true;
  }

  if (type === "speaking-state" && payload) {
    global.mainWindow?.webContents.send("voice:speaking-updated", {
      peerId: payload.peerId,
      isSpeaking: Boolean(payload.isSpeaking),
      volumeLevel: Number(payload.volumeLevel),
    });
    return true;
  }

  if (type === "sfu-host-claim" && payload) {
    roomManager.voiceService.handleSfuHostClaim(peerId, payload);
    return true;
  }

  if (type === "music-channel-state" && payload) {
    global.mainWindow?.webContents.send("music:channel-state", {
      ...payload,
      peerId,
    });
    return true;
  }

  if (type === "music-channel-cmd" && payload) {
    global.mainWindow?.webContents.send("music:channel-cmd", {
      ...payload,
      peerId,
    });
    return true;
  }

  if (type === "watch-party-state" && payload) {
    global.mainWindow?.webContents.send("watch-party:state", {
      ...payload,
      peerId,
    });
    return true;
  }

  if (type === "watch-party-cmd" && payload) {
    global.mainWindow?.webContents.send("watch-party:cmd", {
      ...payload,
      peerId,
    });
    return true;
  }

  if (type === "ping" && payload) {
    roomManager.voiceService.handlePing(peerId, payload);
    return true;
  }

  if (type === "pong" && payload) {
    const prevPeer = roomManager.p2pService.peers.get(peerId);
    const prevPing = prevPeer?.ping;
    const rtt = Date.now() - payload.timestamp;
    roomManager.voiceService.handlePong(peerId, payload, roomManager.p2pService.profile, () => roomManager._emitVoiceState());
    const pObj = roomManager.p2pService.peers.get(peerId);
    const shouldEmitPingUpdate = prevPing === undefined || Math.abs(prevPing - rtt) >= 5;
    if (shouldEmitPingUpdate && pObj && !pObj.isPreview && roomManager.isPeerInRoom(peerId, roomManager.roomCode) && roomManager._callbacks.onPeerUpdated) {
      let effectiveNickname = pObj.nickname;
      let effectiveAvatar = pObj.avatar;
      let effectiveCustomLink = pObj.customLink;
      let effectiveProfileColor = pObj.profileColor;
      let effectiveCustomStatus = pObj.customStatus;
      let effectiveGlobalNick = pObj.nickname;

      const roomCodeKey = roomManager.roomCode ? String(roomManager.roomCode).trim().toUpperCase() : null;
      if (roomManager.roomMetaStore && roomCodeKey) {
        const cached = roomManager.roomMetaStore._cache?.get(roomCodeKey);
        const savedMember = cached?.savedMembers?.[pObj.userId];
        if (savedMember) {
          effectiveNickname = savedMember.nickname || effectiveNickname;
          effectiveAvatar = savedMember.avatar !== undefined ? savedMember.avatar : effectiveAvatar;
          effectiveCustomLink = savedMember.customLink !== undefined ? savedMember.customLink : effectiveCustomLink;
          effectiveProfileColor = savedMember.profileColor || effectiveProfileColor;
          effectiveCustomStatus = savedMember.customStatus !== undefined ? savedMember.customStatus : effectiveCustomStatus;
          effectiveGlobalNick = savedMember.globalNickname || effectiveGlobalNick;
        }
      }

      if (roomCodeKey && pObj.serverProfiles) {
        const override = pObj.serverProfiles[roomCodeKey] || pObj.serverProfiles[roomManager.roomCode];
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

      roomManager._callbacks.onPeerUpdated({
        id: pObj.userId,
        peerId: pObj.id,
        nickname: effectiveNickname,
        avatar: effectiveAvatar,
        online: true,
        activity: pObj.activity || null,
        customLink: effectiveCustomLink,
        profileColor: effectiveProfileColor,
        customStatus: effectiveCustomStatus,
        globalNickname: effectiveGlobalNick,
        serverProfiles: pObj.serverProfiles || null,
        showRichPresence: pObj.showRichPresence,
        flame: pObj.flame,
        ping: pObj.averagePing !== undefined ? Math.round(pObj.averagePing) : (pObj.ping !== undefined ? Math.round(pObj.ping) : null),
      });
    }
    return true;
  }

  return false;
}

module.exports = { handleVoicePacket };
