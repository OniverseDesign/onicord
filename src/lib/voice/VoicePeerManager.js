/**
 * VoicePeerManager.js
 * Main orchestrator for P2P and SFU WebRTC voice and video calls in Onicord.
 */

import { peerVolumeToGain, getPeerVolumePercent } from "../audioSettings";
import { notificationManager } from "../notificationManager";
import { createNativePeer } from "./WebRtcPeerWrapper";
import { VoiceAudioEngine } from "./VoiceAudioEngine";
import { VoiceSfuRouter } from "./VoiceSfuRouter";
import { VoiceStatsMonitor, getAdaptiveVideoBitrate } from "./VoiceBitrateAdapter";

export class VoicePeerManager {
  constructor({
    localPeerId,
    channelId,
    onSignalOut,
    onRemoteStream,
    onError,
    audioSettings = {},
    inputDeviceId = "",
    outputDeviceId = "",
    peerVolumes = {},
    peers = {},
    iceServers = [],
    lanPeerIPs = new Map(),
    initialMuted = false,
    initialDeafened = false,
  }) {
    this.options = { iceServers };
    this.audioSettings = audioSettings;
    this.localPeerId = localPeerId;
    this.channelId = channelId;
    this.onSignalOut = onSignalOut;
    this.onRemoteStream = onRemoteStream;
    this.onError = onError;
    this.inputDeviceId = (inputDeviceId && inputDeviceId !== "default") ? inputDeviceId : "";
    this.outputDeviceId = (outputDeviceId && outputDeviceId !== "default") ? outputDeviceId : "";
    this.inputDeviceLabel = audioSettings?.inputDeviceLabel || "";
    this.outputDeviceLabel = audioSettings?.outputDeviceLabel || "";
    this.peerVolumes = { ...peerVolumes };
    this.peerIdentities = peers;
    this.localStream = null;
    this.localVideoStream = null;
    this.peers = new Map();
    this.muted = Boolean(initialMuted);
    this.deafened = Boolean(initialDeafened);
    this.speakingTimeouts = new Map();
    this.reconnectAttempts = new Map();
    this._lastBitrateUpdatePeerCount = -1;
    this._voiceJoinedAt = Date.now();
    this._notifiedPeerJoins = new Set();
    this.lanPeerIPs = lanPeerIPs instanceof Map ? lanPeerIPs : new Map();
    this._remoteVideoStreams = new Map();
    this.micHardwareError = false;
    this.micErrorMessage = null;
    this._negotiationWatchdogs = new Map();
    this._peerSerialCounters = new Map();
    this._pendingRemoteSignals = new Map();

    // Sub-modules
    this.audioEngine = new VoiceAudioEngine({
      outputDeviceId: this.outputDeviceId,
      audioSettings: this.audioSettings,
    });

    this.sfuRouter = new VoiceSfuRouter({
      localPeerId: this.localPeerId,
      peersMap: this.peers,
      onRemoteStream: this.onRemoteStream,
      attachRemoteAudioFn: (peerId, stream) => {
        this.audioEngine.attachRemoteAudio({
          peerId,
          stream,
          volumeValue: this.getPeerVolume(peerId),
          deafened: this.deafened,
          peersMap: this.peers,
        });
      },
    });

    this.statsMonitor = new VoiceStatsMonitor();

    this.handleOnline = () => {
      console.log("[WebRTC] Network came online! Resetting reconnection counters and trying handshake...");
      this.reconnectAttempts.clear();

      const activeMemberIds = new Set(this.voiceMembers ? this.voiceMembers.map((m) => m.peerId) : []);
      for (const peerId of this.peers.keys()) {
        const peer = this.peers.get(peerId);
        if (!activeMemberIds.has(peerId) || peer._pc?.connectionState === "failed" || peer._pc?.connectionState === "disconnected") {
          this.removePeer(peerId);
        }
      }

      if (this.voiceMembers && this.localStream) {
        this.voiceMembers.forEach(async (member) => {
          if (member.peerId !== this.localPeerId && !this.peers.has(member.peerId)) {
            const initiator = this.shouldInitiate(member.peerId);
            console.log(`[WebRTC] Spawning new connection to ${member.peerId} after network recovery`);
            await this.connectToPeer(member.peerId, { initiator });
          }
        });
      }
    };

    this._unlockAudio = () => {
      this.audioEngine.resumeAudioContext();
    };
    window.addEventListener("click", this._unlockAudio);
    window.addEventListener("keydown", this._unlockAudio);
    window.addEventListener("online", this.handleOnline);

    this.startStatsMonitoring();
  }

  // Backwards compatibility getters
  get audioContext() {
    return this.audioEngine.audioContext;
  }
  set audioContext(ctx) {
    this.audioEngine.audioContext = ctx;
  }
  get peerAudio() {
    return this.audioEngine.peerAudio;
  }
  get networkTopology() {
    return this.sfuRouter.networkTopology;
  }
  set networkTopology(t) {
    this.sfuRouter.networkTopology = t;
  }
  get sfuHostId() {
    return this.sfuRouter.sfuHostId;
  }
  set sfuHostId(h) {
    this.sfuRouter.sfuHostId = h;
  }
  get isLocalHost() {
    return this.sfuRouter.isLocalHost;
  }
  set isLocalHost(v) {
    this.sfuRouter.isLocalHost = v;
  }
  get voiceMembers() {
    return this.sfuRouter.voiceMembers;
  }
  set voiceMembers(m) {
    this.sfuRouter.voiceMembers = m;
  }

  startStatsMonitoring() {
    this.statsMonitor.start(this.peers, 4000);
  }

  _cleanupLocalVoice() {
    this.audioEngine.cleanupLocalVoice();
  }

  _ensureContext() {
    return this.audioEngine.ensureContext();
  }

  async resumeAudioContext() {
    return this.audioEngine.resumeAudioContext();
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      try {
        peer.removeAllListeners?.();
        peer._pc?.close();
        peer.destroy();
      } catch (err) {
        console.warn(`[voice] Error menor al destruir peer ${peerId}:`, err.message);
      }
      this.peers.delete(peerId);
    }
    this.audioEngine.disposePeerAudio(peerId);
    this._remoteVideoStreams.delete(peerId);
  }

  getPeerVolume(peerId) {
    return getPeerVolumePercent(this.peerVolumes[peerId]);
  }

  setPeerVolume(peerId, percent) {
    this.peerVolumes[peerId] = percent;
    const entry = this.audioEngine.peerAudio.get(peerId);
    if (entry && entry.gain) {
      const masterVolume = (this.audioSettings?.outputVolume ?? 100) / 100;
      entry.gain.gain.value = this.deafened
        ? 0
        : peerVolumeToGain(percent) * masterVolume;
    }
  }

  setPeerEntries(map) {
    this.peerIdentities = map;
  }

  setLanPeerIPs(map) {
    this.lanPeerIPs = map instanceof Map ? map : new Map();
  }

  setOutputDevice(deviceId, label = "") {
    this.outputDeviceId = (deviceId && deviceId !== "default") ? deviceId : "";
    if (label) this.outputDeviceLabel = label;
    this.audioEngine.setOutputDevice(this.outputDeviceId);
  }

  setInputDevice(deviceId, label = "") {
    this.inputDeviceId = (deviceId && deviceId !== "default") ? deviceId : "";
    if (label) this.inputDeviceLabel = label;
  }

  async _resolveValidDeviceId() {
    if (!this.inputDeviceId || !this.inputDeviceLabel) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === "audioinput");
      const exists = inputs.some((d) => d.deviceId === this.inputDeviceId);
      if (!exists) {
        const match = inputs.find((d) => d.label && d.label.trim() === this.inputDeviceLabel.trim());
        if (match) {
          console.log(`[voice] Re-bound inputDeviceId from label "${this.inputDeviceLabel}": ${this.inputDeviceId} -> ${match.deviceId}`);
          this.inputDeviceId = match.deviceId;
        }
      }
    } catch {}
  }

  async _resolveValidOutputDeviceId() {
    if (!this.outputDeviceId || !this.outputDeviceLabel) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter((d) => d.kind === "audiooutput");
      const exists = outputs.some((d) => d.deviceId === this.outputDeviceId);
      if (!exists) {
        const match = outputs.find((d) => d.label && d.label.trim() === this.outputDeviceLabel.trim());
        if (match) {
          console.log(`[voice] Re-bound outputDeviceId from label "${this.outputDeviceLabel}": ${this.outputDeviceId} -> ${match.deviceId}`);
          this.setOutputDevice(match.deviceId, match.label);
        }
      }
    } catch {}
  }

  stopLocalAudioTracks() {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
        track.stop();
      });
    }
    this.audioEngine.cleanupLocalVoice();
  }

  async replaceAudioTrackInPeers(newAudioTrack) {
    if (!newAudioTrack) return;
    for (const peer of this.peers.values()) {
      if (peer && !peer.destroyed && peer._pc) {
        try {
          const senders = peer._pc.getSenders();
          const audioSender = senders.find((s) => s.track && s.track.kind === "audio");
          if (audioSender) {
            await audioSender.replaceTrack(newAudioTrack);
          }
        } catch (e) {
          console.warn("[voice] replaceAudioTrackInPeers error:", e.message);
        }
      }
    }
  }

  createSilentAudioTrack() {
    return this.audioEngine.createSilentAudioTrack();
  }

  async reclaimMicrophone() {
    console.log("[voice] Intentando recuperar el hardware del micrófono...");
    try {
      const baseConfig = {
        echoCancellation: this.audioSettings?.echoCancellation ?? true,
        noiseSuppression: this.audioSettings?.noiseSuppression ?? true,
        autoGainControl: this.audioSettings?.autoGainControl ?? true,
      };

      await this._resolveValidDeviceId();
      let newStream = null;
      if (this.inputDeviceId) {
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            audio: { ...baseConfig, deviceId: { exact: this.inputDeviceId } },
            video: false,
          });
        } catch {
          try {
            newStream = await navigator.mediaDevices.getUserMedia({
              audio: { ...baseConfig, deviceId: { ideal: this.inputDeviceId } },
              video: false,
            });
          } catch {
            console.warn("[voice] Preferred inputDeviceId could not be acquired, using default fallback");
          }
        }
      }

      if (!newStream) {
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            audio: { ...baseConfig },
            video: false,
          });
        } catch {
          newStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
        }
      }

      if (newStream) {
        const newAudioTrack = newStream.getAudioTracks()[0];
        if (newAudioTrack) {
          if (this.localStream) {
            this.localStream.getAudioTracks().forEach((tr) => {
              tr.enabled = false;
              tr.stop();
              try {
                this.localStream.removeTrack(tr);
              } catch {}
            });
            this.localStream.addTrack(newAudioTrack);
          } else {
            this.localStream = newStream;
          }

          await this.replaceAudioTrackInPeers(newAudioTrack);
          this.micHardwareError = false;
          this.micErrorMessage = null;
          console.log("[voice] Microfono recuperado con exito y aplicado a los peers");
          return true;
        }
      }
    } catch (err) {
      console.warn("[voice] Reclamo de micrófono fallido:", err.message);
      this.micHardwareError = true;
      this.micErrorMessage = err.message;
    }
    return false;
  }

  async startMicrophone(options = {}) {
    if (this.localStream && !options.forceReclaim) return this.localStream;

    if (options.forceReclaim) {
      this.stopLocalAudioTracks();
      this.localStream = null;
    }

    const baseConfig = {
      echoCancellation: this.audioSettings?.echoCancellation ?? true,
      noiseSuppression: this.audioSettings?.noiseSuppression ?? true,
      autoGainControl: this.audioSettings?.autoGainControl ?? true,
    };

    let acquiredStream = null;

    await this._resolveValidDeviceId();
    await this._resolveValidOutputDeviceId();

    if (this.inputDeviceId && this.inputDeviceId !== "default") {
      try {
        acquiredStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...baseConfig,
            channelCount: { ideal: 1 },
            sampleRate: { ideal: 48000 },
            deviceId: { exact: this.inputDeviceId },
          },
          video: false,
        });
      } catch {
        try {
          acquiredStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              ...baseConfig,
              deviceId: { ideal: this.inputDeviceId },
            },
            video: false,
          });
        } catch {
          console.warn("[voice] Preferred input device unavailable, using fallback stream");
        }
      }
    }

    if (!acquiredStream) {
      try {
        acquiredStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...baseConfig,
            channelCount: { ideal: 1 },
            sampleRate: { ideal: 48000 },
          },
          video: false,
        });
      } catch {
        try {
          acquiredStream = await navigator.mediaDevices.getUserMedia({
            audio: { ...baseConfig },
            video: false,
          });
        } catch {
          try {
            acquiredStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: this.audioSettings?.echoCancellation ?? true,
                noiseSuppression: this.audioSettings?.noiseSuppression ?? true,
              },
              video: false,
            });
          } catch {
            try {
              acquiredStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false,
              });
            } catch (err5) {
              console.error("[voice] Fallaron todas las etapas de captura multimedia de hardware:", err5);

              if (!options.isRetryAttempt && err5?.name === "NotReadableError") {
                await new Promise((resolve) => setTimeout(resolve, 500));
                return this.startMicrophone({ ...options, isRetryAttempt: true });
              }

              this.micHardwareError = true;
              let friendlyMsg = err5?.message || "Could not access microphone";
              if (err5?.name === "NotReadableError") {
                friendlyMsg = "El micrófono está ocupado por otra app (ej. Discord, Zoom) o Windows en modo exclusivo.";
              } else if (err5?.name === "NotAllowedError" || err5?.name === "PermissionDeniedError") {
                friendlyMsg = "Permiso de micrófono denegado.";
              } else if (err5?.name === "NotFoundError" || err5?.name === "DevicesNotFoundError") {
                friendlyMsg = "No se encontró ningún micrófono conectado.";
              }
              this.micErrorMessage = friendlyMsg;
              this.onError?.(err5);

              const silentTrack = this.createSilentAudioTrack();
              if (silentTrack) {
                acquiredStream = new MediaStream([silentTrack]);
              } else {
                throw err5;
              }
            }
          }
        }
      }
    } else {
      this.micHardwareError = false;
      this.micErrorMessage = null;
    }

    this.localStream = acquiredStream;
    this._flushPendingSignals();

    if (this.localStream) {
      if (this.muted) {
        for (const track of this.localStream.getAudioTracks()) {
          track.enabled = false;
        }
      }
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        if (audioTrack.readyState === "live" && audioTrack.enabled && !this.muted) {
          this.audioEngine.setupLocalVoiceAnalysis(this.localStream, this.localPeerId);
        } else {
          audioTrack.onunmute = () => {
            if (!this.muted) {
              this.audioEngine.setupLocalVoiceAnalysis(this.localStream, this.localPeerId);
            }
            audioTrack.onunmute = null;
          };
        }
      }
    }

    return this.localStream;
  }

  async applyDeviceSettings(newSettings) {
    const oldSettings = { ...this.audioSettings };
    this.audioSettings = { ...oldSettings, ...newSettings };
    this.audioEngine.audioSettings = this.audioSettings;
    this.audioEngine.applyAudioSettings?.(this.audioSettings);

    const inputChanged =
      newSettings.inputDeviceId !== undefined &&
      newSettings.inputDeviceId !== this.inputDeviceId;

    const filtersChanged =
      oldSettings.noiseSuppression !== newSettings.noiseSuppression ||
      oldSettings.echoCancellation !== newSettings.echoCancellation ||
      oldSettings.autoGainControl !== newSettings.autoGainControl;

    if (newSettings.outputDeviceId !== undefined) {
      this.setOutputDevice(newSettings.outputDeviceId, newSettings.outputDeviceLabel);
    }
    if (newSettings.inputDeviceId !== undefined) {
      this.setInputDevice(newSettings.inputDeviceId, newSettings.inputDeviceLabel);
    }
    await this._resolveValidDeviceId();
    await this._resolveValidOutputDeviceId();

    if (oldSettings.outputVolume !== newSettings.outputVolume) {
      for (const peerId of this.audioEngine.peerAudio.keys()) {
        this.setPeerVolume(peerId, this.getPeerVolume(peerId));
      }
    }

    if ((inputChanged || filtersChanged) && this.localStream) {
      try {
        const baseConfig = {
          echoCancellation: this.audioSettings.echoCancellation ?? true,
          noiseSuppression: this.audioSettings.noiseSuppression ?? true,
          autoGainControl: this.audioSettings.autoGainControl ?? true,
        };

        const oldTrack = this.localStream.getAudioTracks()[0];
        let newStream = null;

        if (this.inputDeviceId && this.inputDeviceId !== "default") {
          try {
            newStream = await navigator.mediaDevices.getUserMedia({
              audio: { ...baseConfig, deviceId: { exact: this.inputDeviceId } },
              video: false,
            });
          } catch {
            try {
              newStream = await navigator.mediaDevices.getUserMedia({
                audio: { ...baseConfig, deviceId: { ideal: this.inputDeviceId } },
                video: false,
              });
            } catch {
              console.warn("[voice] Error applying new inputDeviceId, falling back");
            }
          }
        }

        if (!newStream) {
          try {
            newStream = await navigator.mediaDevices.getUserMedia({
              audio: { ...baseConfig },
              video: false,
            });
          } catch {
            try {
              newStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                  echoCancellation: this.audioSettings?.echoCancellation ?? true,
                  noiseSuppression: this.audioSettings?.noiseSuppression ?? true,
                },
                video: false,
              });
            } catch {
              newStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: false,
              });
            }
          }
        }

        const newTrack = newStream.getAudioTracks()[0];
        const oldVideoTrack = this.localStream.getVideoTracks()[0];
        if (oldVideoTrack) {
          try {
            newStream.addTrack(oldVideoTrack);
          } catch {}
        }

        for (const peer of this.peers.values()) {
          if (peer && oldTrack) {
            try {
              peer.replaceTrack(oldTrack, newTrack, this.localStream);
            } catch {}
          }
        }

        oldTrack?.stop();
        this.localStream = newStream;
        this.audioEngine.setupLocalVoiceAnalysis(this.localStream, this.localPeerId);
      } catch (err) {
        console.error("[voice] Error al aplicar filtros en caliente:", err);
      }
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (!this.localStream) return;
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = !muted;
    }
  }

  setDeafened(deafened) {
    this.deafened = Boolean(deafened);
    const masterVolume = (this.audioSettings?.outputVolume ?? 100) / 100;
    for (const [peerId, entry] of this.audioEngine.peerAudio) {
      if (entry.gain) {
        entry.gain.gain.value = this.deafened
          ? 0
          : peerVolumeToGain(this.getPeerVolume(peerId)) * masterVolume;
      }
      if (entry.audio) entry.audio.muted = true;
    }
  }

  _isPeerAlive(peer) {
    if (!peer || peer.destroyed || !peer._pc) return false;
    const pc = peer._pc;
    return (
      pc.connectionState !== "failed" &&
      pc.connectionState !== "closed" &&
      pc.iceConnectionState !== "failed"
    );
  }

  _flushPendingSignals() {
    if (!this.localStream || this._pendingRemoteSignals.size === 0) return;
    const now = Date.now();
    for (const [fromPeerId, signals] of this._pendingRemoteSignals.entries()) {
      const validSignals = signals.filter((item) => now - item.at < 15000);
      if (validSignals.length > 0) {
        console.log(`[voice] ${validSignals.length} senales encoladas procesadas`);
        for (const item of validSignals) {
          this.handleSignal(fromPeerId, item.signal).catch((err) => {
            console.error(`[voice] Error processing buffered signal from ${fromPeerId}:`, err);
          });
        }
      }
    }
    this._pendingRemoteSignals.clear();
  }

  _ensureRemoteAudio(ownerId, track, remoteStream) {
    if (track.kind !== "audio") return;

    // Do not route screen share audio tracks to the voice chat engine!
    // Screen share audio is played and controlled exclusively by StreamDisplay.
    if (remoteStream && remoteStream.getVideoTracks().length > 0) {
      return;
    }

    // Gather live microphone audio tracks from this peer's RTCPeerConnection receivers
    const peer = this.peers.get(ownerId);
    let voiceAudioTracks = [];
    if (peer && peer._pc) {
      const videoStream = this._remoteVideoStreams.get(ownerId);
      const screenAudioTracks = videoStream ? videoStream.getAudioTracks() : [];

      voiceAudioTracks = peer._pc
        .getReceivers()
        .map((r) => r.track)
        .filter((t) => {
          if (!t || t.kind !== "audio" || t.readyState !== "live") return false;
          if (screenAudioTracks.includes(t)) return false;
          return true;
        });
    }
    if (voiceAudioTracks.length === 0 && track.readyState === "live") {
      voiceAudioTracks = [track];
    }

    const currentEntry = this.audioEngine.peerAudio.get(ownerId);
    const existingTracks = currentEntry?.stream?.getAudioTracks?.() || [];
    const isNewTrack = voiceAudioTracks.some((t) => !existingTracks.includes(t));
    const allEnded = existingTracks.length > 0 && existingTracks.every((t) => t.readyState === "ended");

    if (!currentEntry || allEnded || isNewTrack) {
      console.log(`[voice] Audio remoto de voz acoplado para ${ownerId} (${voiceAudioTracks.length} tracks, trigger=${track.id})`);
      const combinedStream = new MediaStream(voiceAudioTracks);
      this.audioEngine.attachRemoteAudio({
        peerId: ownerId,
        stream: combinedStream,
        volumeValue: this.getPeerVolume(ownerId),
        deafened: this.deafened,
        peersMap: this.peers,
      });
    }
  }

  shouldInitiate(remotePeerId) {
    if (!this.localPeerId || !remotePeerId) return false;
    return this.localPeerId < remotePeerId;
  }

  _createNativePeer(remotePeerId, initiator, iceServers, isLan = false) {
    return createNativePeer({
      localPeerId: this.localPeerId,
      remotePeerId,
      initiator,
      iceServers,
      isLan,
      lanPeerIPs: this.lanPeerIPs,
      onRemoteVideoUpdate: (pId, st) => {
        if (st) {
          this._remoteVideoStreams.set(pId, st);
        } else {
          this._remoteVideoStreams.delete(pId);
        }
      },
    });
  }

  async connectToPeer(remotePeerId, { initiator } = {}) {
    if (!remotePeerId || remotePeerId === this.localPeerId) return;

    const existing = this.peers.get(remotePeerId);
    if (existing) {
      if (this._isPeerAlive(existing)) {
        return;
      }
      this.disconnectPeer(remotePeerId, true);
    }

    if (this.networkTopology === "sfu") {
      if (!this.isLocalHost && remotePeerId !== this.sfuHostId) {
        return;
      }
    }

    if (!this.localStream) return;

    const customizedIceServers =
      this.options.iceServers && this.options.iceServers.length > 0
        ? this.options.iceServers
        : [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            { urls: "stun:stun.cloudflare.com:3478" },
            {
              urls: [
                "turn:openrelay.metered.ca:80",
                "turn:openrelay.metered.ca:443",
                "turn:openrelay.metered.ca:443?transport=tcp",
              ],
              username: "openrelayproject",
              credential: "openrelayproject",
            },
            {
              urls: "turn:relay1.expressturn.com:3478",
              username: "efKME2JQKDZ1TA4HL3",
              credential: "gXjDGSOKf3gCADM4",
            },
          ];

    const serial = (this._peerSerialCounters.get(remotePeerId) || 0) + 1;
    this._peerSerialCounters.set(remotePeerId, serial);
    console.log(`[voice] Peer creado con ${remotePeerId} (initiator=${Boolean(initiator)}, pcSerial=${serial})`);

    const isLan = this.lanPeerIPs.has(remotePeerId);
    const peer = this._createNativePeer(remotePeerId, initiator, customizedIceServers, isLan);
    peer._pcSerial = serial;
    this.peers.set(remotePeerId, peer);

    if (this._negotiationWatchdogs.has(remotePeerId)) {
      clearTimeout(this._negotiationWatchdogs.get(remotePeerId));
      this._negotiationWatchdogs.delete(remotePeerId);
    }
    const watchdogTimer = setTimeout(() => {
      this._negotiationWatchdogs.delete(remotePeerId);
      const currentPeer = this.peers.get(remotePeerId);
      const connState = currentPeer?._pc?.connectionState;
      if (
        currentPeer === peer &&
        connState !== "connected" &&
        connState !== "connecting"
      ) {
        console.warn(`[voice] Negotiation watchdog: recreando conexion con ${remotePeerId} (estado: ${connState})`);
        this.disconnectPeer(remotePeerId, true);
        this.attemptReconnection(remotePeerId);
      }
    }, 25000);
    this._negotiationWatchdogs.set(remotePeerId, watchdogTimer);

    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach((track) => {
        peer.addTrack(track, this.localStream);
      });

      const liveVideoTrack = this.localVideoStream?.getVideoTracks()[0];
      if (liveVideoTrack && liveVideoTrack.readyState === "live") {
        peer.addTrack(liveVideoTrack, this.localVideoStream || this.localStream);
      }

      const liveScreenAudioTrack = this.localVideoStream?.getAudioTracks()[0];
      if (liveScreenAudioTrack && liveScreenAudioTrack.readyState === "live") {
        peer.addTrack(liveScreenAudioTrack, this.localVideoStream || this.localStream);
      }
    }

    peer.on("signal", (signal) => {
      this.onSignalOut(remotePeerId, this.channelId, signal);
    });

    peer.on("connect", () => {
      if (this._negotiationWatchdogs.has(remotePeerId)) {
        clearTimeout(this._negotiationWatchdogs.get(remotePeerId));
        this._negotiationWatchdogs.delete(remotePeerId);
      }
      this.reconnectAttempts.delete(remotePeerId);
      const amigoConectado = this.peerIdentities[remotePeerId] || {
        nickname: `User (${remotePeerId.slice(0, 5)})`,
      };

      const timeSinceLocalJoin = Date.now() - (this._voiceJoinedAt || 0);
      if (timeSinceLocalJoin > 4000 && !this._notifiedPeerJoins.has(remotePeerId)) {
        this._notifiedPeerJoins.add(remotePeerId);
        notificationManager.trigger("USER_JOIN_VOICE", {
          nickname: amigoConectado.nickname,
        });
      }

      // If we are Host, inject forwarded tracks from other peers
      if (this.isLocalHost) {
        for (const [otherPeerId, tracks] of this.sfuRouter._forwardedTracks.entries()) {
          if (otherPeerId !== remotePeerId) {
            for (const { track, stream } of tracks) {
              try {
                peer.addTrack(track, stream);
              } catch {}
            }
          }
        }
      }
    });

    peer.on("stream", (remoteStream) => {
      this.audioEngine.ensureContext();
      let ownerId = remotePeerId;
      if (this.networkTopology === "sfu" && !this.isLocalHost) {
        const resolvedId = this.sfuRouter.resolvePeerIdFromStreamId(remoteStream.id);
        if (resolvedId) {
          ownerId = resolvedId;
        } else {
          this.sfuRouter.registerPendingSfuStream(remoteStream, remotePeerId);
          return;
        }
      }
      if (remoteStream.getVideoTracks().length > 0) {
        this._remoteVideoStreams.set(ownerId, remoteStream);
      }
      if (remoteStream.getAudioTracks().length > 0 && remoteStream.getVideoTracks().length === 0) {
        this.audioEngine.attachRemoteAudio({
          peerId: ownerId,
          stream: remoteStream,
          volumeValue: this.getPeerVolume(ownerId),
          deafened: this.deafened,
          peersMap: this.peers,
        });
      }
      this.onRemoteStream?.(ownerId, remoteStream);
    });

    peer.on("track", (track, remoteStream) => {
      this.audioEngine.ensureContext();

      let ownerId = remotePeerId;
      if (this.networkTopology === "sfu" && !this.isLocalHost) {
        const resolvedId = this.sfuRouter.resolvePeerIdFromStreamId(remoteStream.id);
        if (resolvedId) {
          ownerId = resolvedId;
        } else {
          this.sfuRouter.registerPendingSfuStream(remoteStream, remotePeerId);
          return;
        }
      }

      if (this.isLocalHost) {
        this.sfuRouter.forwardTrackToPeers(track, remoteStream, remotePeerId);
      }

      this._ensureRemoteAudio(ownerId, track, remoteStream);

      if (track.kind === "audio") {
        const entry = this.audioEngine.peerAudio.get(ownerId);
        if (entry) {
          entry.stream = remoteStream;
        }
      }

      if (track.kind === "video") {
        this._remoteVideoStreams.set(ownerId, remoteStream);
        window.dispatchEvent(
          new CustomEvent("peer-video-update", {
            detail: { peerId: ownerId, stream: remoteStream },
          }),
        );
      }
    });

    peer.on("track-unmuted", (track, remoteStream) => {
      let ownerId = remotePeerId;
      if (this.networkTopology === "sfu" && !this.isLocalHost) {
        const resolvedId = this.sfuRouter.resolvePeerIdFromStreamId(remoteStream.id);
        if (resolvedId) ownerId = resolvedId;
      }

      this._ensureRemoteAudio(ownerId, track, remoteStream);
    });

    peer.on("error", (err) => {
      const nickname = this.peerIdentities[remotePeerId]?.nickname || remotePeerId;
      this.onError?.(new Error(`WebRTC connection failed with ${nickname}: ${err.message}`));
      this.disconnectPeer(remotePeerId);
      this.attemptReconnection(remotePeerId);
    });

    peer.on("close", () => {
      this.disconnectPeer(remotePeerId);
      this.attemptReconnection(remotePeerId);
    });
  }

  async onRemoteJoinedVoice(peerId) {
    if (!peerId || peerId === this.localPeerId) return;
    const existing = this.peers.get(peerId);
    if (this._isPeerAlive(existing)) {
      console.log(`[voice] onRemoteJoinedVoice: conexion viva con ${peerId} (${existing._pc?.connectionState}), se conserva`);
      return;
    }
    if (existing) this.disconnectPeer(peerId, true);
    const initiator = this.shouldInitiate(peerId);
    await this.connectToPeer(peerId, { initiator });
  }

  onRemoteLeftVoice(peerId) {
    this._notifiedPeerJoins.delete(peerId);
    this.disconnectPeer(peerId);
  }

  attemptReconnection(remotePeerId) {
    if (!this.localStream || !this.channelId) return;

    const isStillInChannel = this.voiceMembers?.some((m) => m.peerId === remotePeerId);
    if (!isStillInChannel) return;

    const attempts = this.reconnectAttempts.get(remotePeerId) || 0;
    if (attempts >= 3) return;

    this.reconnectAttempts.set(remotePeerId, attempts + 1);

    setTimeout(async () => {
      const stillInChannel = this.voiceMembers?.some((m) => m.peerId === remotePeerId);
      if (stillInChannel && !this.peers.has(remotePeerId) && this.localStream) {
        const initiator = this.shouldInitiate(remotePeerId);
        await this.connectToPeer(remotePeerId, { initiator });
      }
    }, 2000);
  }

  async handleSignal(fromPeerId, signal) {
    if (!fromPeerId || fromPeerId === this.localPeerId) return;

    if (!this.localStream) {
      console.log(`[voice] Senal encolada de ${fromPeerId} (motivo: sin microfono)`);
      if (!this._pendingRemoteSignals.has(fromPeerId)) {
        this._pendingRemoteSignals.set(fromPeerId, []);
      }
      const queue = this._pendingRemoteSignals.get(fromPeerId);
      if (queue.length < 50) {
        queue.push({ signal, at: Date.now() });
      }
      return;
    }

    let peer = this.peers.get(fromPeerId);
    const isOffer = signal?.type === "offer";

    const isDead = !this._isPeerAlive(peer);
    const isDisconnectedOffer = isOffer && peer && peer._pc?.connectionState === "disconnected";

    if (isDead || isDisconnectedOffer) {
      if (peer) this.disconnectPeer(fromPeerId, true);
      await this.connectToPeer(fromPeerId, { initiator: false });
      peer = this.peers.get(fromPeerId);
    }
    if (!peer) return;

    try {
      peer.signal(signal);
    } catch (err) {
      console.error("[voice] signal error", err.message);
      this.disconnectPeer(fromPeerId, true);
    }
  }

  disconnectPeer(peerId, silent = false) {
    if (this._negotiationWatchdogs.has(peerId)) {
      clearTimeout(this._negotiationWatchdogs.get(peerId));
      this._negotiationWatchdogs.delete(peerId);
    }
    this._pendingRemoteSignals.delete(peerId);

    const peer = this.peers.get(peerId);
    if (peer) {
      if (!silent) {
        this._notifiedPeerJoins.delete(peerId);
        const amigoDesconectado = this.peerIdentities[peerId] || {
          nickname: `Usuario`,
        };
        notificationManager.trigger("USER_LEFT_VOICE", {
          nickname: amigoDesconectado.nickname,
        });
      }

      try {
        peer.removeAllListeners?.();
        peer._pc?.close();
        peer.destroy();
      } catch (err) {
        console.warn(`[voice] Error menor al destruir peer ${peerId}:`, err.message);
      }
      this.peers.delete(peerId);
    }

    if (this.isLocalHost) {
      this.sfuRouter.cleanupForwardedTracksOfPeer(peerId);
    }

    this._remoteVideoStreams.delete(peerId);
    this.audioEngine.disposePeerAudio(peerId);
  }

  getAdaptiveVideoBitrate(isRealStream = true) {
    return getAdaptiveVideoBitrate(this.peers.size, isRealStream);
  }

  setLocalVideoStream(videoStream, streamOptions = {}) {
    this.localVideoStream = videoStream;
    this.streamOptions = streamOptions;
    const isGameMode = Boolean(streamOptions?.gameMode);

    const videoTrack = videoStream ? videoStream.getVideoTracks()[0] : null;
    if (videoTrack) {
      videoTrack.enabled = true;
      videoTrack.contentHint = isGameMode ? "motion" : "text";
    }

    const screenAudioTrack = videoStream ? videoStream.getAudioTracks()[0] : null;
    if (screenAudioTrack) {
      screenAudioTrack.enabled = true;
      screenAudioTrack.contentHint = "music";
    }

    const audioId = this.localStream ? this.localStream.id : null;
    const videoId = videoStream ? videoStream.id : null;
    let downlinkSpeed = 10;
    if (navigator.connection && typeof navigator.connection.downlink === "number") {
      downlinkSpeed = navigator.connection.downlink;
    }
    window.electronAPI?.updateVoiceStreamIds?.(audioId, videoId, downlinkSpeed);

    const micTrack = this.localStream?.getAudioTracks()[0];

    for (const [peerId, peer] of this.peers.entries()) {
      if (!peer || peer.destroyed || !peer._pc) continue;
      peer.isGameMode = isGameMode;

      try {
        const senders = peer._pc.getSenders() || [];
        const existingVideoSender = senders.find(
          (s) => s.track?.kind === "video" || (videoTrack && s.track === videoTrack),
        );

        if (videoTrack) {
          if (existingVideoSender) {
            existingVideoSender.replaceTrack(videoTrack);
          } else {
            peer.addTrack(videoTrack, videoStream);
          }

          try {
            const sender = existingVideoSender || peer._pc.getSenders().find((s) => s.track === videoTrack);
            if (sender) {
              const params = sender.getParameters();
              if (params && params.encodings && params.encodings.length > 0) {
                const baseBitrate = this.getAdaptiveVideoBitrate(true);
                const targetBitrate = isGameMode
                  ? Math.min(6000000, Math.round(baseBitrate * 1.5))
                  : baseBitrate;
                params.encodings[0].active = true;
                params.encodings[0].maxBitrate = targetBitrate;
                if (isGameMode) {
                  params.encodings[0].maxFramerate = 60;
                } else {
                  params.encodings[0].maxFramerate = 30;
                }
                sender.setParameters(params);
              }
            }
          } catch {}
        } else {
          if (existingVideoSender) {
            peer.removeTrack(existingVideoSender.track, videoStream);
          }
        }

        // Screen audio track sync
        const existingScreenAudioSender = senders.find(
          (s) => s.track?.kind === "audio" && s.track !== micTrack,
        );

        if (screenAudioTrack) {
          if (existingScreenAudioSender) {
            existingScreenAudioSender.replaceTrack(screenAudioTrack);
          } else {
            peer.addTrack(screenAudioTrack, videoStream);
          }
        } else {
          if (existingScreenAudioSender && existingScreenAudioSender.track) {
            peer.removeTrack(existingScreenAudioSender.track, videoStream);
          }
        }
      } catch (err) {
        console.warn(`[voice mesh] Error video/audio sync with ${peerId}:`, err.message);
      }
    }
  }

  getRemoteStream(peerId) {
    if (!peerId) return null;
    const peer = this.peers.get(peerId);
    if (peer && peer._pc) {
      try {
        const receivers = peer._pc.getReceivers() || [];
        const videoTrack = receivers.map((r) => r.track).find((t) => t && t.kind === "video" && t.readyState === "live" && !t.muted);
        if (videoTrack) {
          videoTrack.enabled = true;
          const cached = this._remoteVideoStreams.get(peerId);
          if (cached && cached.getVideoTracks().includes(videoTrack)) {
            return cached;
          }
          const voiceTracks = this.audioEngine.peerAudio.get(peerId)?.stream?.getAudioTracks() || [];
          const screenAudioTracks = receivers
            .map((r) => r.track)
            .filter((t) => t && t.kind === "audio" && t.readyState === "live" && !voiceTracks.includes(t));
          const tracks = [videoTrack, ...screenAudioTracks];
          const liveStream = new MediaStream(tracks);
          this._remoteVideoStreams.set(peerId, liveStream);

          if (!videoTrack.onunmute) {
            videoTrack.onunmute = () => {
              window.dispatchEvent(
                new CustomEvent("peer-video-update", {
                  detail: { peerId, stream: liveStream },
                }),
              );
            };
          }

          return liveStream;
        }
      } catch {}
    }
    const cached = this._remoteVideoStreams.get(peerId);
    if (cached && cached.getVideoTracks().some((t) => t.readyState === "live" && !t.muted)) {
      return cached;
    }
    return this.audioEngine.peerAudio.get(peerId)?.stream || null;
  }

  setTopology(topology, sfuHostId) {
    this.sfuRouter.setTopology(topology, sfuHostId, (peerId, silent) => this.disconnectPeer(peerId, silent));
  }

  updatePeerIdentities(members) {
    this.sfuRouter.updateMembers(members);

    for (const member of members) {
      if (member.isSelf) continue;
      const entry = this.audioEngine.peerAudio.get(member.peerId);
      if (entry) {
        const shouldMute = Boolean(member.muted) || Boolean(member.deafened) || this.deafened;
        if (entry.audio) {
          entry.audio.muted = shouldMute;
        }
        if (entry.stream) {
          entry.stream.getAudioTracks().forEach((track) => {
            if (track.enabled === shouldMute) {
              track.enabled = !shouldMute;
            }
          });
        }
      }
    }

    const currentPeerCount = this.peers.size;
    if (currentPeerCount !== this._lastBitrateUpdatePeerCount) {
      this._lastBitrateUpdatePeerCount = currentPeerCount;
      const hasRealVideo = Boolean(this.localVideoStream && this.localVideoStream.getVideoTracks().some((t) => t.enabled));
      const targetBitrate = this.getAdaptiveVideoBitrate(hasRealVideo);

      for (const [peerId, peer] of this.peers.entries()) {
        if (!peer || peer.destroyed) continue;
        try {
          const senders = peer._pc?.getSenders() || [];
          const existingVideoSender = senders.find((s) => s.track?.kind === "video");
          if (existingVideoSender) {
            const params = existingVideoSender.getParameters();
            if (params && params.encodings && params.encodings.length > 0) {
              params.encodings[0].maxBitrate = targetBitrate;
              existingVideoSender.setParameters(params);
            }
          }
        } catch {}
      }
    }
  }

  destroy() {
    console.log("[Voice Hardware] Iniciando purga total de la sesión de voz...");
    this._notifiedPeerJoins?.clear();

    this.statsMonitor.stop();
    window.removeEventListener("online", this.handleOnline);
    if (this._unlockAudio) {
      window.removeEventListener("click", this._unlockAudio);
      window.removeEventListener("keydown", this._unlockAudio);
    }

    for (const timer of this._negotiationWatchdogs.values()) {
      clearTimeout(timer);
    }
    this._negotiationWatchdogs.clear();
    this._pendingRemoteSignals.clear();

    for (const peerId of [...this.peers.keys()]) {
      this.disconnectPeer(peerId, true);
    }

    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach((track) => {
          track.enabled = false;
          track.stop();
        });
      } catch {}
      this.localStream = null;
    }

    this.audioEngine.destroy();
    this.sfuRouter.destroy();
    this._remoteVideoStreams.clear();

    console.log("[Voice Hardware] Manager destruido por completo y recursos devueltos al sistema.");
  }
}
