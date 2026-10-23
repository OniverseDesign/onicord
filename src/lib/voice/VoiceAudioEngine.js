/**
 * VoiceAudioEngine.js
 * Web Audio API processing: VAD (Voice Activity Detection), GainNodes, and HTMLAudioElements.
 */

import { peerVolumeToGain } from "../audioSettings";

export class VoiceAudioEngine {
  constructor({ outputDeviceId = "", audioSettings = {} } = {}) {
    this.outputDeviceId = this._normalizeDeviceId(outputDeviceId);
    this.audioSettings = audioSettings;
    this.audioContext = null;
    this.peerAudio = new Map();
    this.localVoiceSource = null;
    this.localVoiceAnimationFrame = null;
    this.localPeerId = null;

    // Master Audio Bus (Gain + DynamicsCompressor Anti-Clipping Limiter)
    this.masterBus = null;
    this.masterGain = null;
    this.masterCompressor = null;

    // Auto-Ducking state
    this.activeSpeakers = new Set();
  }

  _normalizeDeviceId(id) {
    if (!id || id === "default") return "";
    return id;
  }

  ensureContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (this.audioContext.state === "suspended") {
      this.audioContext
        .resume()
        .then(() => console.log("[Voice AudioContext] Successfully awakened from P2P Core!"))
        .catch((err) => console.warn("[Voice AudioContext] Error al despertar:", err.message));
    }
    this.ensureMasterBus(this.audioContext);
    return this.audioContext;
  }

  ensureMasterBus(ctx) {
    if (!this.masterBus && ctx) {
      this.masterGain = ctx.createGain();
      const masterVol = (this.audioSettings?.outputVolume ?? 100) / 100;
      this.masterGain.gain.setValueAtTime(masterVol, ctx.currentTime);

      this.masterCompressor = ctx.createDynamicsCompressor();
      // Transparent anti-clipping limiter settings
      this.masterCompressor.threshold.setValueAtTime(-1.5, ctx.currentTime);
      this.masterCompressor.knee.setValueAtTime(2.0, ctx.currentTime);
      this.masterCompressor.ratio.setValueAtTime(12.0, ctx.currentTime);
      this.masterCompressor.attack.setValueAtTime(0.002, ctx.currentTime);
      this.masterCompressor.release.setValueAtTime(0.05, ctx.currentTime);

      this.updateMasterRouting();
      this.masterBus = this.masterGain;
    }
    return this.masterBus;
  }

  updateMasterRouting() {
    if (!this.audioContext || !this.masterGain || !this.masterCompressor) return;
    const ctx = this.audioContext;
    try {
      this.masterGain.disconnect();
      this.masterCompressor.disconnect();
    } catch {}

    const useCompressor = this.audioSettings?.dynamicsCompression !== false;
    if (useCompressor) {
      this.masterGain.connect(this.masterCompressor);
      this.masterCompressor.connect(ctx.destination);
    } else {
      this.masterGain.connect(ctx.destination);
    }
  }

  applyAudioSettings(newSettings) {
    this.audioSettings = { ...this.audioSettings, ...newSettings };
    if (this.audioContext && this.masterGain) {
      const masterVol = (this.audioSettings?.outputVolume ?? 100) / 100;
      this.masterGain.gain.setTargetAtTime(masterVol, this.audioContext.currentTime, 0.05);
      this.updateMasterRouting();
    }
    this._handleSpeakingStateChange();
  }

  _handleSpeakingStateChange() {
    const hasSpeakers = this.activeSpeakers.size > 0;
    const isDuckingEnabled = this.audioSettings?.autoDucking !== false;
    const isDucking = hasSpeakers && isDuckingEnabled;
    const duckAmount = (this.audioSettings?.autoDuckingAmount ?? 50) / 100;
    const duckMultiplier = isDucking ? Math.max(0.05, 1 - duckAmount) : 1.0;

    window.dispatchEvent(
      new CustomEvent("voice-ducking-change", {
        detail: {
          isDucking,
          duckMultiplier,
          duckAmount: this.audioSettings?.autoDuckingAmount ?? 50,
          activeSpeakersCount: this.activeSpeakers.size,
        },
      }),
    );
  }

  async resumeAudioContext() {
    if (this.audioContext && this.audioContext.state === "suspended") {
      try {
        await this.audioContext.resume();
        console.log("[Voice] Explicitly resumed AudioContext via UI action");
      } catch (err) {
        console.warn("[Voice] Failed to resume AudioContext:", err.message);
      }
    }
  }

  cleanupLocalVoice() {
    if (this.localVoiceAnimationFrame) {
      cancelAnimationFrame(this.localVoiceAnimationFrame);
      this.localVoiceAnimationFrame = null;
    }
    if (this.localVoiceSource) {
      try {
        this.localVoiceSource.disconnect();
      } catch {}
      this.localVoiceSource = null;
    }
    if (this.localPeerId) {
      this.activeSpeakers.delete(this.localPeerId);
    }
    this.activeSpeakers.delete("self");
    this._handleSpeakingStateChange();
  }

  setupLocalVoiceAnalysis(stream, localPeerId) {
    try {
      this.cleanupLocalVoice();

      const ctx = this.ensureContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const source = ctx.createMediaStreamSource(stream);
      this.localVoiceSource = source;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      source.connect(analyser);

      let isSpeaking = false;
      let silenceCounter = 0;

      const checkLocalSpeaking = () => {
        if (!this.audioContext || this.audioContext.state === "closed") return;

        if (stream && stream.getAudioTracks().some((t) => t.enabled)) {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const averageVolume = sum / bufferLength;

          let isSpeakingNow = false;
          if (this.audioSettings?.autoVad === false) {
            const percent = Math.min(100, Math.round((averageVolume / 128) * 100));
            isSpeakingNow = percent > (this.audioSettings.vadThreshold || 50);
          } else {
            isSpeakingNow = averageVolume > 8;
          }

          if (isSpeakingNow) {
            silenceCounter = 0;
          } else {
            silenceCounter++;
            if (silenceCounter < 15 && isSpeaking) {
              isSpeakingNow = true;
            }
          }

          if (isSpeaking !== isSpeakingNow) {
            isSpeaking = isSpeakingNow;
            const localId = localPeerId || "self";
            if (isSpeakingNow) {
              this.activeSpeakers.add(localId);
            } else {
              this.activeSpeakers.delete(localId);
            }
            this._handleSpeakingStateChange();
            window.dispatchEvent(
              new CustomEvent("peer-speaking-change", {
                detail: {
                  peerId: localId,
                  isSpeaking: isSpeakingNow,
                  volumeLevel: averageVolume,
                },
              }),
            );
          }
        }
        this.localVoiceAnimationFrame = requestAnimationFrame(checkLocalSpeaking);
      };

      checkLocalSpeaking();
    } catch (e) {
      console.error("[voice] Error en el análisis de voz local:", e.message);
    }
  }

  setOutputDevice(deviceId) {
    this.outputDeviceId = this._normalizeDeviceId(deviceId);
    if (this.audioContext && typeof this.audioContext.setSinkId === "function") {
      this.audioContext.setSinkId(this.outputDeviceId).catch((err) => {
        console.warn("[voice] setOutputDevice on AudioContext error:", err.message);
      });
    }
    for (const entry of this.peerAudio.values()) {
      if (entry.audio) this.applySink(entry.audio);
    }
  }

  async applySink(audioEl) {
    const sinkId = this._normalizeDeviceId(this.outputDeviceId);
    if (this.audioContext && typeof this.audioContext.setSinkId === "function") {
      try {
        await this.audioContext.setSinkId(sinkId);
      } catch (err) {
        console.warn("[voice] audioContext.setSinkId error:", err.message);
      }
    }
    if (audioEl?.setSinkId) {
      try {
        await audioEl.setSinkId(sinkId);
      } catch (err) {
        console.warn("[voice] setSinkId error:", err.message);
      }
    }
  }

  disposePeerAudio(peerId) {
    const entry = this.peerAudio.get(peerId);
    if (!entry) return;

    try {
      this.activeSpeakers.delete(peerId);
      this._handleSpeakingStateChange();
      entry.cancelRaf?.();
      this.peerAudio.delete(peerId);

      if (entry.audio) {
        entry.audio.pause();
        entry.audio.srcObject = null;
        entry.audio.remove();
      }

      if (entry.dummyAudio) {
        entry.dummyAudio.pause();
        entry.dummyAudio.srcObject = null;
        entry.dummyAudio.remove();
      }

      if (entry.keepAliveAudio) {
        entry.keepAliveAudio.pause();
        entry.keepAliveAudio.srcObject = null;
        entry.keepAliveAudio.remove();
      }

      if (entry.analyser) {
        try {
          entry.analyser.disconnect();
        } catch {}
      }

      if (entry.gain) entry.gain.disconnect();
      if (entry.source) entry.source.disconnect();
      if (entry.sources) entry.sources.forEach((s) => { try { s.disconnect(); } catch {} });
    } catch (err) {
      console.error(`[voice] Error al limpiar nodos de ${peerId}:`, err);
    }
  }

  attachRemoteAudio({
    peerId,
    stream,
    retryCount = 0,
    volumeValue = 100,
    deafened = false,
    peersMap,
  }) {
    if (stream && stream.stream) stream = stream.stream;

    if (
      !(stream instanceof MediaStream) ||
      stream.getAudioTracks().length === 0
    ) {
      // Do not dispose existing audio if the incoming stream is video-only
      if (retryCount < 5) {
        if (!peersMap?.has(peerId) && !this.peerAudio.has(peerId)) return;
        setTimeout(
          () =>
            this.attachRemoteAudio({
              peerId,
              stream,
              retryCount: retryCount + 1,
              volumeValue,
              deafened,
              peersMap,
            }),
          200 * (retryCount + 1),
        );
      }
      return;
    }

    // Now safe to dispose previous audio setup for this peer
    this.disposePeerAudio(peerId);

    const ctx = this.ensureContext();
    const audioTracks = stream.getAudioTracks();
    const sources = [];

    const gain = ctx.createGain();
    const masterVolume = (this.audioSettings?.outputVolume ?? 100) / 100;
    gain.gain.value = deafened
      ? 0
      : peerVolumeToGain(volumeValue) * masterVolume;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    analyser.connect(gain);

    audioTracks.forEach((track, index) => {
      try {
        const singleTrackStream = new MediaStream([track]);
        const sourceNode = ctx.createMediaStreamSource(singleTrackStream);
        sources.push(sourceNode);
        if (index === 0) {
          sourceNode.connect(analyser);
        } else {
          sourceNode.connect(gain);
        }
      } catch (err) {
        console.warn(`[voice] Error conectando audio track ${track.id}:`, err);
      }
    });

    const source = sources[0] || null;

    let silenceCounter = 0;
    let rafId = null;

    const checkSpeaking = () => {
      if (!this.peerAudio.has(peerId)) return;

      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];

      const averageVolume = sum / bufferLength;
      let isSpeakingNow = averageVolume > 15;
      const entry = this.peerAudio.get(peerId);

      if (entry) {
        if (isSpeakingNow) {
          silenceCounter = 0;
        } else {
          silenceCounter++;
          if (silenceCounter < 15 && entry.isSpeaking) {
            isSpeakingNow = true;
          }
        }

        if (entry.isSpeaking !== isSpeakingNow) {
          entry.isSpeaking = isSpeakingNow;
          if (isSpeakingNow) {
            this.activeSpeakers.add(peerId);
          } else {
            this.activeSpeakers.delete(peerId);
          }
          this._handleSpeakingStateChange();
          window.dispatchEvent(
            new CustomEvent("peer-speaking-change", {
              detail: { peerId, isSpeaking: isSpeakingNow },
            }),
          );
        }
      }

      rafId = requestAnimationFrame(checkSpeaking);
    };

    setTimeout(() => {
      rafId = requestAnimationFrame(checkSpeaking);
    }, 100);

    // Direct hardware audio output via Master Bus with transparent anti-clipping limiter
    const masterBus = this.ensureMasterBus(ctx);
    gain.connect(masterBus);
    const targetSink = this._normalizeDeviceId(this.outputDeviceId);
    if (typeof ctx.setSinkId === "function") {
      ctx.setSinkId(targetSink).catch((err) => {
        console.warn("[voice] ctx.setSinkId error:", err.message);
      });
    }

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    // Chromium stream keep-alive: attaching remote stream to a muted HTMLAudioElement ensures Web Audio API receives active audio frames
    const keepAliveAudio = document.createElement("audio");
    keepAliveAudio.autoplay = true;
    keepAliveAudio.playsInline = true;
    keepAliveAudio.muted = true;
    keepAliveAudio.style.display = "none";
    keepAliveAudio.srcObject = stream;
    document.body.appendChild(keepAliveAudio);
    keepAliveAudio.play().catch(() => {});

    this.peerAudio.set(peerId, {
      source,
      sources,
      gain,
      analyser,
      keepAliveAudio,
      stream,
      isSpeaking: false,
      rafId: null,
      getRafId: () => rafId,
      cancelRaf: () => {
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }
      },
    });
  }

  createSilentAudioTrack() {
    try {
      const ctx = this.ensureContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      const dest = ctx.createMediaStreamDestination();
      gain.connect(dest);
      osc.start();
      const track = dest.stream.getAudioTracks()[0];
      if (track) {
        track.enabled = false;
        return track;
      }
    } catch (e) {
      console.warn("[VoiceAudioEngine] No se pudo crear silent audio track sintetizado:", e);
    }
    return null;
  }

  destroy() {
    this.cleanupLocalVoice();
    for (const peerId of [...this.peerAudio.keys()]) {
      this.disposePeerAudio(peerId);
    }
    this.activeSpeakers.clear();
    this._handleSpeakingStateChange();

    if (this.masterGain) {
      try { this.masterGain.disconnect(); } catch {}
      this.masterGain = null;
    }
    if (this.masterCompressor) {
      try { this.masterCompressor.disconnect(); } catch {}
      this.masterCompressor = null;
    }
    this.masterBus = null;

    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}
