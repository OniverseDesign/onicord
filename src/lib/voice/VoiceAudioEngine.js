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
    return this.audioContext;
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
            window.dispatchEvent(
              new CustomEvent("peer-speaking-change", {
                detail: {
                  peerId: localPeerId || "self",
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

    const dest = ctx.createMediaStreamDestination();
    gain.connect(dest);

    // Direct hardware audio output via Web Audio API (immune to DOM element autoplay throttling)
    gain.connect(ctx.destination);
    const targetSink = this._normalizeDeviceId(this.outputDeviceId);
    if (typeof ctx.setSinkId === "function") {
      ctx.setSinkId(targetSink).catch((err) => {
        console.warn("[voice] ctx.setSinkId error:", err.message);
      });
    }

    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.playsInline = true;
    // Muted to prevent echo/duplicate sound since gain is already connected to ctx.destination
    audio.muted = true;
    audio.style.display = "none";
    audio.srcObject = dest.stream;
    document.body.appendChild(audio);
    this.applySink(audio);

    const playAudio = () => {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name === "AbortError" || err.message?.includes("interrupted")) {
            return; // Normal playback abort/interruption by pause or stream swap
          }
          console.warn("[voice] Media auto-play demorado. Aguardando interacción:", err.message);
          const unlock = () => {
            if (ctx.state === "suspended") ctx.resume().catch(() => {});
            audio.play().catch(() => {});
          };
          window.addEventListener("click", unlock, { once: true });
          window.addEventListener("keydown", unlock, { once: true });
        });
      }
    };
    playAudio();

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
      audio,
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
    if (this.audioContext && this.audioContext.state !== "closed") {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
  }
}
