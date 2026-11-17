/**
 * webcamCompositor.js
 * Composes desktop/window video streams with a webcam overlay (16:9 rounded PiP)
 * or renders a standalone webcam stream using a background-safe Web Worker timer.
 */

const WORKER_TIMER_SCRIPT = `
let timerId = null;
self.onmessage = function(e) {
  const data = e.data || {};
  if (data.cmd === 'start') {
    if (timerId !== null) clearInterval(timerId);
    const intervalMs = Math.max(10, Math.round(1000 / (data.fps || 30)));
    timerId = setInterval(function() {
      self.postMessage('tick');
    }, intervalMs);
  } else if (data.cmd === 'stop') {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }
};
`;

const RESOLUTION_PRESETS = {
  original: { width: 1920, height: 1080 },
  "1080": { width: 1920, height: 1080 },
  "720": { width: 1280, height: 720 },
  "480": { width: 854, height: 480 },
};

/**
 * Acquires a video-only MediaStream from the requested camera device.
 * Never requests microphone audio because voice audio is already handled by VoicePeerManager.
 */
export async function acquireWebcamStream({
  deviceId = "",
  resolution = "720",
  gameMode = false,
  isPipOverlay = false,
} = {}) {
  const targetRes = isPipOverlay
    ? RESOLUTION_PRESETS["720"]
    : RESOLUTION_PRESETS[resolution] || RESOLUTION_PRESETS["720"];
  const targetFps = gameMode ? 60 : 30;

  const baseVideo = {
    width: { ideal: targetRes.width },
    height: { ideal: targetRes.height },
    frameRate: { ideal: targetFps, max: targetFps },
  };

  if (deviceId && deviceId !== "default") {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { ...baseVideo, deviceId: { exact: deviceId } },
      });
    } catch {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { ...baseVideo, deviceId: { ideal: deviceId } },
        });
      } catch {
        // Fallback to any available webcam below
      }
    }
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: baseVideo,
    });
  } catch {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: true,
    });
  }
}

/**
 * Captures system loopback audio on Electron without keeping any video track.
 * Used when sharing only the webcam while system audio is enabled.
 */
export async function acquireSystemAudioOnlyStream() {
  try {
    const audioOnly = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "desktop",
        },
      },
      video: false,
    });
    if (audioOnly.getAudioTracks().length > 0) {
      return audioOnly;
    }
    audioOnly.getTracks().forEach((t) => t.stop());
  } catch {
    // Fallback below if Chromium requires a desktop video source alongside desktop audio
  }

  try {
    const sources = await window.electronAPI?.getScreenSources?.();
    const screenSource =
      sources?.find((s) => s.id?.startsWith("screen:")) || sources?.[0];
    if (!screenSource) return null;

    const desktopStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "desktop",
        },
      },
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: screenSource.id,
          maxWidth: 16,
          maxHeight: 16,
          maxFrameRate: 1,
        },
      },
    });

    desktopStream.getVideoTracks().forEach((t) => {
      t.enabled = false;
      t.stop();
      desktopStream.removeTrack(t);
    });

    if (desktopStream.getAudioTracks().length > 0) {
      return desktopStream;
    }
    desktopStream.getTracks().forEach((t) => t.stop());
  } catch (err) {
    console.warn("[WebcamCompositor] No se pudo capturar audio del sistema:", err?.message);
  }
  return null;
}

function drawRoundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawVideoCover(ctx, videoEl, dx, dy, dw, dh) {
  const vw = videoEl.videoWidth || dw;
  const vh = videoEl.videoHeight || dh;
  if (!vw || !vh) return;

  const videoRatio = vw / vh;
  const targetRatio = dw / dh;

  let sx = 0;
  let sy = 0;
  let sw = vw;
  let sh = vh;

  if (videoRatio > targetRatio) {
    sw = vh * targetRatio;
    sx = (vw - sw) / 2;
  } else if (videoRatio < targetRatio) {
    sh = vw / targetRatio;
    sy = (vh - sh) / 2;
  }

  ctx.drawImage(videoEl, sx, sy, sw, sh, dx, dy, dw, dh);
}

export class WebcamStreamCompositor {
  constructor(screenStream = null, webcamStream = null, options = {}) {
    this.screenStream = screenStream;
    this.webcamStream = webcamStream;
    this.mode =
      options.mode ||
      (screenStream?.getVideoTracks()?.length > 0 ? "screen" : "camera");
    this.position = options.position || "bottom-right";
    this.sizeRatio = 0.22; // Fixed 22% width, 16:9 rounded rectangle
    this.mirror = options.mirror !== false;
    this.fps = options.fps || (options.gameMode ? 60 : 30);

    this._destroyed = false;
    this._worker = null;
    this._workerUrl = null;
    this._fallbackTimer = null;

    this._canvas = document.createElement("canvas");
    this._canvas.width = options.width || 1280;
    this._canvas.height = options.height || 720;
    this._ctx = this._canvas.getContext("2d", { alpha: false });

    this._screenVideo = this._createHiddenVideo();
    this._camVideo = this._createHiddenVideo();

    if (this.screenStream && this.screenStream.getVideoTracks().length > 0) {
      this._attachVideoSource(this._screenVideo, this.screenStream);
    }
    if (this.webcamStream && this.webcamStream.getVideoTracks().length > 0) {
      this._attachVideoSource(this._camVideo, this.webcamStream);
    }

    this._syncCanvasDimensions();
    this._renderFrame();

    const canvasStream = this._canvas.captureStream(this.fps);
    const composedTracks = [...canvasStream.getVideoTracks()];

    // Preserve system audio track (desktop loopback) whether webcam is active or not
    const systemAudioTracks = this.screenStream?.getAudioTracks?.() || [];
    for (const audioTrack of systemAudioTracks) {
      composedTracks.push(audioTrack);
    }

    this.outputStream = new MediaStream(composedTracks);
    this._startRenderLoop();
  }

  _createHiddenVideo() {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    return video;
  }

  _attachVideoSource(videoEl, stream) {
    if (!videoEl) return;
    videoEl.srcObject = stream || null;
    if (stream) {
      const playPromise = videoEl.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    }
  }

  _syncCanvasDimensions() {
    if (this.mode === "screen") {
      const sw = this._screenVideo?.videoWidth;
      const sh = this._screenVideo?.videoHeight;
      if (sw > 0 && sh > 0) {
        if (this._canvas.width !== sw || this._canvas.height !== sh) {
          this._canvas.width = sw;
          this._canvas.height = sh;
        }
      }
    } else {
      const cw = this._camVideo?.videoWidth;
      const ch = this._camVideo?.videoHeight;
      if (cw > 0 && ch > 0) {
        if (this._canvas.width !== cw || this._canvas.height !== ch) {
          this._canvas.width = cw;
          this._canvas.height = ch;
        }
      }
    }
  }

  _startRenderLoop() {
    try {
      const blob = new Blob([WORKER_TIMER_SCRIPT], { type: "application/javascript" });
      this._workerUrl = URL.createObjectURL(blob);
      this._worker = new Worker(this._workerUrl);
      this._worker.onmessage = () => {
        if (!this._destroyed) {
          this._renderFrame();
        }
      };
      this._worker.postMessage({ cmd: "start", fps: this.fps });
      return;
    } catch {
      // Fallback to standard interval if Worker creation is blocked
    }

    const intervalMs = Math.max(10, Math.round(1000 / this.fps));
    this._fallbackTimer = setInterval(() => {
      if (!this._destroyed) {
        this._renderFrame();
      }
    }, intervalMs);
  }

  _renderFrame() {
    if (this._destroyed || !this._ctx) return;

    this._syncCanvasDimensions();
    const ctx = this._ctx;
    const cw = this._canvas.width;
    const ch = this._canvas.height;

    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, cw, ch);

    if (this.mode === "screen") {
      if (
        this._screenVideo &&
        this._screenVideo.readyState >= 2 &&
        this._screenVideo.videoWidth > 0
      ) {
        ctx.drawImage(this._screenVideo, 0, 0, cw, ch);
      }

      if (
        this.webcamStream &&
        this._camVideo &&
        this._camVideo.readyState >= 2 &&
        this._camVideo.videoWidth > 0
      ) {
        this._drawWebcamPip(ctx, cw, ch);
      }
    } else {
      if (
        this.webcamStream &&
        this._camVideo &&
        this._camVideo.readyState >= 2 &&
        this._camVideo.videoWidth > 0
      ) {
        ctx.save();
        if (this.mirror) {
          ctx.translate(cw, 0);
          ctx.scale(-1, 1);
        }
        drawVideoCover(ctx, this._camVideo, 0, 0, cw, ch);
        ctx.restore();
      } else {
        this._drawCameraPausedState(ctx, cw, ch);
      }
    }
  }

  _drawWebcamPip(ctx, cw, ch) {
    const pipW = Math.max(140, Math.round(cw * this.sizeRatio));
    const pipH = Math.round((pipW * 9) / 16);
    const margin = Math.max(14, Math.round(cw * 0.018));
    const radius = Math.max(10, Math.round(pipW * 0.055));

    let x = cw - pipW - margin;
    let y = ch - pipH - margin;

    if (this.position === "bottom-left") {
      x = margin;
      y = ch - pipH - margin;
    } else if (this.position === "top-right") {
      x = cw - pipW - margin;
      y = margin;
    } else if (this.position === "top-left") {
      x = margin;
      y = margin;
    }

    // Soft drop shadow behind PiP box
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = Math.max(12, Math.round(cw * 0.012));
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = "#09090b";
    ctx.beginPath();
    drawRoundedRectPath(ctx, x, y, pipW, pipH, radius);
    ctx.fill();
    ctx.restore();

    // Clipped 16:9 webcam video frame
    ctx.save();
    ctx.beginPath();
    drawRoundedRectPath(ctx, x, y, pipW, pipH, radius);
    ctx.clip();

    if (this.mirror) {
      ctx.translate(x + pipW, y);
      ctx.scale(-1, 1);
      drawVideoCover(ctx, this._camVideo, 0, 0, pipW, pipH);
    } else {
      drawVideoCover(ctx, this._camVideo, x, y, pipW, pipH);
    }
    ctx.restore();

    // Subtle crisp border
    ctx.save();
    ctx.beginPath();
    drawRoundedRectPath(ctx, x, y, pipW, pipH, radius);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.24)";
    ctx.lineWidth = Math.max(1.5, cw * 0.0016);
    ctx.stroke();
    ctx.restore();
  }

  _drawCameraPausedState(ctx, cw, ch) {
    const cx = cw / 2;
    const cy = ch / 2;
    const r = Math.min(cw, ch) * 0.08;

    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = Math.max(2, cw * 0.002);
    ctx.stroke();

    // Simple camera-off icon glyph
    const iconW = r * 0.68;
    const iconH = r * 0.48;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = Math.max(2, cw * 0.0025);
    ctx.beginPath();
    drawRoundedRectPath(ctx, cx - iconW * 0.6, cy - iconH * 0.5, iconW, iconH, 6);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - r * 0.52, cy + r * 0.52);
    ctx.lineTo(cx + r * 0.52, cy - r * 0.52);
    ctx.stroke();
    ctx.restore();
  }

  setWebcamStream(nextCamStream) {
    if (this._destroyed) return;
    if (this.webcamStream && this.webcamStream !== nextCamStream) {
      this.webcamStream.getTracks().forEach((track) => {
        try {
          track.enabled = false;
          track.stop();
        } catch {}
      });
    }
    this.webcamStream = nextCamStream || null;
    this._attachVideoSource(this._camVideo, this.webcamStream);
    this._renderFrame();
  }

  setPosition(nextPosition) {
    if (
      nextPosition === "bottom-right" ||
      nextPosition === "bottom-left" ||
      nextPosition === "top-right" ||
      nextPosition === "top-left"
    ) {
      this.position = nextPosition;
      this._renderFrame();
    }
  }

  setMirror(mirrorBool) {
    this.mirror = Boolean(mirrorBool);
    this._renderFrame();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;

    if (this._worker) {
      try {
        this._worker.postMessage({ cmd: "stop" });
        this._worker.terminate();
      } catch {}
      this._worker = null;
    }
    if (this._workerUrl) {
      try {
        URL.revokeObjectURL(this._workerUrl);
      } catch {}
      this._workerUrl = null;
    }
    if (this._fallbackTimer) {
      clearInterval(this._fallbackTimer);
      this._fallbackTimer = null;
    }

    if (this.outputStream) {
      this.outputStream.getTracks().forEach((t) => {
        try {
          t.enabled = false;
          t.stop();
        } catch {}
      });
      this.outputStream = null;
    }

    if (this.webcamStream) {
      this.webcamStream.getTracks().forEach((t) => {
        try {
          t.enabled = false;
          t.stop();
        } catch {}
      });
      this.webcamStream = null;
    }

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => {
        try {
          t.enabled = false;
          t.stop();
        } catch {}
      });
      this.screenStream = null;
    }

    if (this._screenVideo) {
      this._screenVideo.srcObject = null;
      this._screenVideo = null;
    }
    if (this._camVideo) {
      this._camVideo.srcObject = null;
      this._camVideo = null;
    }
  }
}
