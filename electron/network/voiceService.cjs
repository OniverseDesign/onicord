const os = require("os");
const { encodeMessage, getLocalIPs, isSameSubnet } = require("./p2pService.cjs");

class VoiceService {
  constructor(p2pService) {
    this.p2p = p2pService;
    this.localVoice = null;
    this.networkTopology = "mesh";
    this.currentSfuHostId = null;
    this._pendingSignals = new Map();
  }

  getVoiceSnapshot(profile) {
    const localId = this.p2p._resolveLocalPeerId();
    const members = [];
    if (this.localVoice?.channelId) {
      members.push({
        peerId: localId,
        channelId: this.localVoice.channelId,
        nickname: profile?.nickname ?? "You",
        avatar: profile?.avatar ?? null,
        muted: Boolean(this.localVoice.muted),
        deafened: Boolean(this.localVoice.deafened),
        isSelf: true,
        isStreaming: Boolean(this.localVoice.isStreaming),
        audioStreamId: this.localVoice.audioStreamId || null,
        videoStreamId: this.localVoice.videoStreamId || null,
        sfuScore: this.localVoice.sfuScore || 0,
        ping: 0,
        bandwidth: this.localVoice.bandwidth || 0,
        connectionType: null, // Self has no remote connection type
        joinedAt: this.localVoice.joinedAt || Date.now(),
      });
    }
    for (const p of this.p2p.peers.values()) {
      if (p.voiceState?.channelId) {
        members.push({
          peerId: p.id,
          channelId: p.voiceState.channelId,
          nickname: p.nickname,
          avatar: p.avatar,
          muted: Boolean(p.voiceState.muted),
          deafened: Boolean(p.voiceState.deafened),
          isSelf: false,
          isStreaming: Boolean(p.voiceState.isStreaming),
          audioStreamId: p.voiceState.audioStreamId || null,
          videoStreamId: p.voiceState.videoStreamId || null,
          sfuScore: p.voiceState.sfuScore || 0,
          ping: p.ping !== undefined ? Math.round(p.ping) : 999,
          bandwidth: p.voiceState.bandwidth || 0,
          connectionType: this.p2p.getConnectionType(p.id),
          localIPs: p.localIPs || [],
          joinedAt: p.voiceState.joinedAt || Date.now(),
        });
      }
    }
    return {
      localPeerId: localId,
      members,
      networkTopology: this.networkTopology || "mesh",
      sfuHostId: this.currentSfuHostId || null,
    };
  }

  _broadcastLocalVoiceState(profile) {
    const localId = this.p2p._resolveLocalPeerId();
    if (!localId) return;
    this.p2p._broadcast("voice-state", {
      peerId: localId,
      channelId: this.localVoice?.channelId ?? null,
      muted: Boolean(this.localVoice?.muted),
      deafened: Boolean(this.localVoice?.deafened),
      nickname: profile?.nickname,
      avatar: profile?.avatar,
      isStreaming: Boolean(this.localVoice?.isStreaming),
      audioStreamId: this.localVoice?.audioStreamId ?? null,
      videoStreamId: this.localVoice?.videoStreamId ?? null,
      sfuScore: this.localVoice?.sfuScore ?? 0,
      bandwidth: this.localVoice?.bandwidth ?? 0,
      joinedAt: this.localVoice?.joinedAt ?? null,
    });
  }

  joinVoice(channelId, profile, emitVoiceState) {
    if (!channelId) throw new Error("Invalid voice channel");
    console.log(`\n[Voice Service] 🟢 ENTRANDO A CANAL DE VOZ: ${channelId}`);
    this.localVoice = { channelId, muted: false, deafened: false, joinedAt: Date.now() };
    this._broadcastLocalVoiceState(profile);
    emitVoiceState();
  }

  leaveVoice(profile, emitVoiceState) {
    console.log(`\n[Voice Service] 🔴 SALIENDO DEL CANAL DE VOZ`);
    this.localVoice = null;
    this._pendingSignals.clear();
    this._broadcastLocalVoiceState(profile);
    emitVoiceState();
  }

  setVoiceMuted(muted, profile, emitVoiceState) {
    if (!this.localVoice) return;
    this.localVoice.muted = Boolean(muted);
    this._broadcastLocalVoiceState(profile);
    emitVoiceState();
  }

  setVoiceDeafened(deafened, profile, emitVoiceState) {
    if (!this.localVoice) return;
    this.localVoice.deafened = Boolean(deafened);
    if (deafened) this.localVoice.muted = true;
    this._broadcastLocalVoiceState(profile);
    emitVoiceState();
  }

  setStreamingState(isStreaming, profile, emitVoiceState) {
    if (!this.localVoice?.channelId) {
      console.warn("[VoiceService] Ignoring setStreamingState: not in an active voice channel.");
      return;
    }
    this.localVoice.isStreaming = Boolean(isStreaming);
    this._broadcastLocalVoiceState(profile);
    emitVoiceState();
  }

  relayVoiceSignal(toPeerId, channelId, signal) {
    const fromPeerId = this.p2p._resolveLocalPeerId();
    if (!fromPeerId || !toPeerId) return;
    const peer = this.p2p.peers.get(toPeerId);
    if (peer?.socket && !peer.socket.destroyed) {
      this.p2p._sendToPeer(toPeerId, "webrtc-signal", {
        fromPeerId,
        channelId,
        signal,
      });
      this._flushPendingSignals(toPeerId);
    } else {
      if (!this._pendingSignals.has(toPeerId)) {
        this._pendingSignals.set(toPeerId, []);
      }
      const queue = this._pendingSignals.get(toPeerId);
      if (queue.length < 50) {
        queue.push({ channelId, signal, timestamp: Date.now() });
        console.log(
          `[Voice Signal Queue] Señal encolada para ${toPeerId} (${queue.length} pendientes). Socket no disponible aún.`
        );
      }

      setTimeout(() => {
        const q = this._pendingSignals.get(toPeerId);
        if (q) {
          const now = Date.now();
          const filtered = q.filter((s) => now - s.timestamp < 15000);
          if (filtered.length === 0) {
            this._pendingSignals.delete(toPeerId);
          } else {
            this._pendingSignals.set(toPeerId, filtered);
          }
        }
      }, 15000);
    }
  }

  _flushPendingSignals(toPeerId) {
    const queue = this._pendingSignals.get(toPeerId);
    if (!queue || queue.length === 0) return;

    const fromPeerId = this.p2p._resolveLocalPeerId();
    if (!fromPeerId) return;

    const now = Date.now();
    let sent = 0;
    for (const { channelId, signal, timestamp } of queue) {
      if (now - timestamp < 15000) {
        this.p2p._sendToPeer(toPeerId, "webrtc-signal", {
          fromPeerId,
          channelId,
          signal,
        });
        sent++;
      }
    }

    this._pendingSignals.delete(toPeerId);
    if (sent > 0) {
      console.log(
        `[Voice Signal Queue] ✅ Dispatched ${sent} pending signals to ${toPeerId}`
      );
    }
  }

  /**
   * Claims SFU hosting duties for the local client.
   * Promotes the current node to be the central voice stream forwarder,
   * switching the network topology from mesh to SFU to conserve upload bandwidth.
   * 
   * @param {function} emitVoiceState - Callback to broadcast the updated state.
   * @returns {void}
   */
  claimVoiceHost(emitVoiceState) {
    const localId = this.p2p._resolveLocalPeerId();
    if (!localId) return;

    this.currentSfuHostId = localId;
    this.networkTopology = "sfu";
    console.log(`[SFU Service] Auto-promocionando mi PC a Servidor Central de Voz...`);

    this.p2p._broadcast("sfu-host-claim", { peerId: localId });

    global.mainWindow?.webContents.send("voice:sfu-migrated", {
      newHostId: localId,
      topology: "sfu",
    });

    emitVoiceState();
  }

  updateVoiceStreamIds(audioStreamId, videoStreamId, bandwidth, profile, emitVoiceState) {
    if (!this.localVoice) {
      this.localVoice = { channelId: null, muted: false, deafened: false };
    }
    this.localVoice.audioStreamId = audioStreamId || null;
    this.localVoice.videoStreamId = videoStreamId || null;
    if (bandwidth !== undefined) {
      this.localVoice.bandwidth = Number(bandwidth);
    }
    this._recalculateLocalSfuScore();
    this._broadcastLocalVoiceState(profile);
    emitVoiceState();
  }

  _recalculateLocalSfuScore() {
    if (!this.localVoice) return;
    const cpuCount = os.cpus()?.length || 2;
    const totalRamGb = Math.round(os.totalmem() / (1024 * 1024 * 1024)) || 8;
    const hwScore = (cpuCount * 2) + totalRamGb;

    let totalPing = 0;
    let peerCount = 0;
    const localChannelId = this.localVoice.channelId;

    let hasLanGatewayPeer = false;
    if (localChannelId) {
      const myIPs = getLocalIPs();
      for (const peer of this.p2p.peers.values()) {
        if (peer.voiceState?.channelId === localChannelId) {
          const pingVal = peer.averagePing !== undefined ? peer.averagePing : (peer.ping || 100);
          totalPing += pingVal;
          peerCount++;

          const peerIPs = peer.localIPs || [];
          let peerIsLAN = false;
          for (const myIP of myIPs) {
            for (const peerIP of peerIPs) {
              if (isSameSubnet(myIP, peerIP)) {
                peerIsLAN = true;
                break;
              }
            }
            if (peerIsLAN) break;
          }

          if (peerIsLAN) {
            const peerIsSfuHost = this.currentSfuHostId === peer.id;
            const peerHasHigherScore = (peer.voiceState?.sfuScore || 0) > (hwScore * 1000);
            if (peerIsSfuHost || peerHasHigherScore) {
              hasLanGatewayPeer = true;
            }
          }
        }
      }
    }

    const avgPing = peerCount > 0 ? (totalPing / peerCount) : 0;
    const bandwidth = this.localVoice.bandwidth || 10;

    let baseScore = (hwScore * 1000) + (bandwidth * 10) - avgPing;
    if (hasLanGatewayPeer) {
      baseScore -= 5000; // Penalización para evitar colisiones en la misma LAN
    }
    this.localVoice.sfuScore = Math.round(baseScore);
  }

  /**
   * Resets SFU state on voice disconnect (ping is handled by RoomManager's unified interval).
   */
  stopPingInterval() {
    this.networkTopology = "mesh";
    this.currentSfuHostId = null;
  }

  /**
   * Processes voice state updates broadcast by a specific remote peer.
   * Tracks mute/deafened options and media streams, and detects if the current
   * SFU Host left our voice channel, triggering automatic mesh fallback.
   * 
   * @param {string} fromPeerId - The unique network identifier of the remote peer.
   * @param {Object} payload - The updated voice status and streams payload.
   * @param {function} emitVoiceState - Callback to broadcast the change to local subscribers.
   * @returns {void}
   */
  handleVoiceState(fromPeerId, payload, emitVoiceState) {
    const peer = this.p2p.peers.get(fromPeerId);
    if (!peer) return;

    if (!payload?.channelId) {
      delete peer.voiceState;
    } else {
      peer.voiceState = {
        channelId: payload.channelId,
        muted: Boolean(payload.muted),
        deafened: Boolean(payload.deafened),
        isStreaming: Boolean(payload.isStreaming),
        audioStreamId: payload.audioStreamId || null,
        videoStreamId: payload.videoStreamId || null,
        sfuScore: payload.sfuScore || 0,
        bandwidth: payload.bandwidth || 0,
        joinedAt: payload.joinedAt || Date.now(),
      };
      if (payload.nickname) peer.nickname = payload.nickname;
      if (payload.avatar !== undefined) peer.avatar = payload.avatar;
    }

    if (this.currentSfuHostId === fromPeerId && (!payload?.channelId || payload.channelId !== this.localVoice?.channelId)) {
      console.log(`[SFU Service] El Host SFU (${fromPeerId}) dejó nuestro canal de voz. Revirtiendo a Malla (Mesh)...`);
      this.currentSfuHostId = null;
      this.networkTopology = "mesh";
      global.mainWindow?.webContents.send("voice:sfu-migrated", {
        newHostId: null,
        topology: "mesh",
      });
    }

    emitVoiceState();
  }

  handleSfuHostClaim(fromPeerId, payload) {
    console.log(`\n👑 [SFU Service] El peer ${fromPeerId} reclama ser el Servidor Central de Voz.`);
    this.currentSfuHostId = fromPeerId;
    this.networkTopology = "sfu";
    global.mainWindow?.webContents.send("voice:sfu-migrated", {
      newHostId: fromPeerId,
      topology: "sfu",
    });
  }

  handlePing(fromPeerId, payload) {
    this.p2p._sendToPeer(fromPeerId, "pong", { timestamp: payload.timestamp });
  }

  handlePong(fromPeerId, payload, profile, emitVoiceState) {
    const rtt = Date.now() - payload.timestamp;
    const peer = this.p2p.peers.get(fromPeerId);
    if (peer) {
      peer.ping = rtt;
      peer.lastPingAck = Date.now();
      if (peer.averagePing === undefined) {
        peer.averagePing = rtt;
      } else {
        peer.averagePing = peer.averagePing * 0.7 + rtt * 0.3;
      }
      if (this.localVoice?.channelId) {
        const oldScore = this.localVoice.sfuScore || 0;
        this._recalculateLocalSfuScore();
        if (Math.abs((this.localVoice.sfuScore || 0) - oldScore) > 5) {
          this._broadcastLocalVoiceState(profile);
          emitVoiceState();
        }
      }
    }
  }

  handlePeerLeft(peerId, emitVoiceState) {
    this._pendingSignals.delete(peerId);
    if (this.currentSfuHostId === peerId) {
      console.log(`[SFU Service] El Host SFU (${peerId}) se ha desconectado. Revirtiendo a mesh...`);
      this.currentSfuHostId = null;
      this.networkTopology = "mesh";

      global.mainWindow?.webContents.send("voice:sfu-migrated", {
        newHostId: null,
        topology: "mesh",
      });
    }
    emitVoiceState();
  }

  handlePeerJoined(peerId, socket) {
    if (this.localVoice?.channelId) {
      const localId = this.p2p._resolveLocalPeerId();
      if (localId) {
        socket.write(
          encodeMessage("voice-state", {
            peerId: localId,
            channelId: this.localVoice.channelId,
            muted: Boolean(this.localVoice.muted),
            deafened: Boolean(this.localVoice.deafened),
            nickname: this.p2p.profile?.nickname,
            avatar: this.p2p.profile?.avatar,
            isStreaming: Boolean(this.localVoice.isStreaming),
            audioStreamId: this.localVoice.audioStreamId || null,
            videoStreamId: this.localVoice.videoStreamId || null,
            sfuScore: this.localVoice.sfuScore || 0,
            bandwidth: this.localVoice.bandwidth || 0,
            joinedAt: this.localVoice.joinedAt || Date.now(),
          })
        );
      }
    }

    if (this.currentSfuHostId) {
      socket.write(
        encodeMessage("sfu-host-claim", { peerId: this.currentSfuHostId })
      );
    }

    this._flushPendingSignals(peerId);
  }
}

module.exports = { VoiceService };
