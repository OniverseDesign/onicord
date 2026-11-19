const { app } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const torrentStream = require("torrent-stream");

let ffmpegPath = null;
try {
  ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
  if (ffmpegPath && ffmpegPath.includes("app.asar") && !ffmpegPath.includes("app.asar.unpacked")) {
    const unpackedPath = ffmpegPath.replace("app.asar", "app.asar.unpacked");
    if (fs.existsSync(unpackedPath)) {
      ffmpegPath = unpackedPath;
    }
  }
} catch (err) {
  console.warn("[TorrentService] @ffmpeg-installer/ffmpeg no disponible:", err.message);
}

const DEFAULT_TRACKERS = [
  "udp://tracker.opentrackr.org:1337/announce",
  "udp://open.demonii.com:1337/announce",
  "udp://open.stealth.si:80/announce",
  "udp://exodus.desync.com:6969/announce",
  "udp://tracker.torrent.eu.org:451/announce",
  "udp://explodie.org:6969/announce",
  "udp://tracker.openbittorrent.com:6969/announce",
  "udp://opentracker.i2p.rocks:6969/announce",
  "udp://tracker.dler.org:6969/announce",
  "udp://amigacity.xyz:6969/announce",
  "http://tracker.opentrackr.org:1337/announce",
  "http://open.acgnxtracker.com:80/announce",
  "wss://tracker.openwebtorrent.com",
  "wss://tracker.btorrent.xyz",
];

const VIDEO_EXT_REGEX = /\.(mp4|mkv|webm|avi|mov|m4v|ts|m2ts|ogv|flv|wmv)$/i;
const AUDIO_EXT_REGEX = /\.(mp3|flac|ogg|wav|aac|m4a|opus)$/i;

const MIME_TYPES = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".ts": "video/mp2t",
  ".m2ts": "video/mp2t",
  ".ogv": "video/ogg",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".m4a": "audio/mp4",
  ".opus": "audio/opus",
};

// Codecs natively supported by Chromium / Electron without transcoding
const NATIVE_VIDEO_CODECS = new Set(["h264", "avc1", "vp8", "vp9", "av1", "theora"]);
const NATIVE_AUDIO_CODECS = new Set(["aac", "mp3", "opus", "vorbis", "flac", "pcm_s16le", "pcm_s24le", "pcm_f32le", "mp4a"]);
const FORCE_REMUX_EXTENSIONS = new Set([".avi", ".ts", ".m2ts", ".flv", ".wmv", ".mov"]);

/**
 * Service managing on-demand BitTorrent streaming for media files.
 * Provides on-the-fly byte-range HTTP streaming and real-time FFmpeg transcoding
 * for non-native video/audio codecs.
 */
class TorrentService {
  constructor() {
    this.engines = new Map(); // infoHash -> entry
    this.tempBaseDir = path.join(app.getPath("temp"), "onicord-torrents");
    this.cleanupInterval = setInterval(() => this.cleanupIdleEngines(), 60 * 1000);
  }

  getStreamPort() {
    const ytdlpService = require("./ytdlpService.cjs");
    return ytdlpService.streamPort || 42883;
  }

  normalizeTrackers(customTrackers = []) {
    const set = new Set(DEFAULT_TRACKERS);
    if (Array.isArray(customTrackers)) {
      for (const raw of customTrackers) {
        if (typeof raw !== "string") continue;
        const cleaned = raw.replace(/^tracker:/i, "").trim();
        if (
          cleaned.startsWith("udp://") ||
          cleaned.startsWith("http://") ||
          cleaned.startsWith("https://") ||
          cleaned.startsWith("ws://") ||
          cleaned.startsWith("wss://")
        ) {
          set.add(cleaned);
        }
      }
    }
    return Array.from(set);
  }

  /**
   * Initializes or retrieves an active torrent-stream engine instance for the given infoHash.
   * Pauses inactive torrent engines to prioritize network bandwidth.
   *
   * @param {string} infoHash - 40-character hex BitTorrent infoHash
   * @param {string[]} [customTrackers=[]] - Additional tracker URLs to announce to
   * @returns {Promise<Object>} Active engine entry object
   */
  async getOrCreateEngine(infoHash, customTrackers = []) {
    const cleanHash = String(infoHash || "").trim().toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(cleanHash)) {
      throw new Error(`Invalid infoHash: ${infoHash}`);
    }

    // Pause inactive torrents to prioritize bandwidth for active playback
    for (const [hash, existing] of this.engines.entries()) {
      if (hash !== cleanHash && existing.activeRequests <= 0) {
        this.destroyEngine(hash);
      }
    }

    if (this.engines.has(cleanHash)) {
      const existing = this.engines.get(cleanHash);
      existing.lastAccessed = Date.now();
      const extraTrackers = this.normalizeTrackers(customTrackers);
      if (extraTrackers.length > 0) {
        if (!existing.trackers) existing.trackers = new Set();
        for (const tr of extraTrackers) {
          if (!existing.trackers.has(tr)) {
            existing.trackers.add(tr);
            try {
              if (typeof existing.engine?.announce === "function") {
                existing.engine.announce(tr);
              } else if (Array.isArray(existing.engine?.trackers)) {
                existing.engine.trackers.push(tr);
              }
            } catch (_) {}
          }
        }
      }
      await existing.readyPromise;
      return existing;
    }

    const trackers = this.normalizeTrackers(customTrackers);
    const storagePath = path.join(this.tempBaseDir, cleanHash);
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    console.log(`[TorrentService] Iniciando motor P2P para infoHash: ${cleanHash} (${trackers.length} trackers)`);

    const magnetUri = `magnet:?xt=urn:btih:${cleanHash}`;
    const engine = torrentStream(magnetUri, {
      tmp: this.tempBaseDir,
      path: storagePath,
      verify: true,
      dht: true,
      tracker: true,
      trackers,
      connections: 100,
      uploads: 4,
    });

    const entry = {
      infoHash: cleanHash,
      engine,
      ready: false,
      lastAccessed: Date.now(),
      activeRequests: 0,
      codecCache: new Map(),
      ffmpegProcesses: new Set(),
      activeTranscodeProcesses: new Set(),
      trackers: new Set(trackers),
      storagePath,
      readyPromise: null,
    };

    entry.readyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.warn(`[TorrentService] Timeout esperando metadatos de la red P2P para ${cleanHash} (sin semillas activas).`);
        this.destroyEngine(cleanHash);
        const timeoutErr = new Error("Timeout esperando metadatos de la red P2P (sin semillas activas).");
        timeoutErr.isP2pTimeout = true;
        reject(timeoutErr);
      }, 35000);

      engine.once("ready", () => {
        clearTimeout(timeout);
        entry.ready = true;
        entry.lastAccessed = Date.now();
        console.log(
          `[TorrentService] Metadatos P2P listos para ${cleanHash}: ${engine.files.length} archivo(s)`
        );
        // Deselect all files by default until a specific stream file is requested
        engine.files.forEach((f) => {
          try {
            f.deselect();
          } catch (_) {}
        });
        resolve(entry);
      });

      engine.once("error", (err) => {
        clearTimeout(timeout);
        console.error(`[TorrentService] Error en motor P2P (${cleanHash}):`, err.message);
        if (!entry.ready) {
          this.destroyEngine(cleanHash);
          reject(err);
        }
      });
    });

    this.engines.set(cleanHash, entry);
    return entry.readyPromise;
  }

  resolveTargetFile(engine, requestedIdx) {
    if (!engine || !Array.isArray(engine.files) || engine.files.length === 0) {
      return null;
    }

    const idx = Number.parseInt(requestedIdx, 10);
    if (!Number.isNaN(idx) && idx >= 0 && idx < engine.files.length) {
      const candidate = engine.files[idx];
      if (
        VIDEO_EXT_REGEX.test(candidate.name) ||
        AUDIO_EXT_REGEX.test(candidate.name) ||
        engine.files.length === 1
      ) {
        return { file: candidate, index: idx };
      }
    }

    // Find largest audio/video file if candidate index is not valid media
    let bestFile = null;
    let bestIdx = 0;
    for (let i = 0; i < engine.files.length; i++) {
      const f = engine.files[i];
      if (VIDEO_EXT_REGEX.test(f.name) || AUDIO_EXT_REGEX.test(f.name)) {
        if (!bestFile || f.length > bestFile.length) {
          bestFile = f;
          bestIdx = i;
        }
      }
    }

    if (bestFile) {
      return { file: bestFile, index: bestIdx };
    }

    // Fallback to largest file overall
    let largest = engine.files[0];
    let largestIdx = 0;
    for (let i = 1; i < engine.files.length; i++) {
      if (engine.files[i].length > largest.length) {
        largest = engine.files[i];
        largestIdx = i;
      }
    }
    return { file: largest, index: largestIdx };
  }

  /**
   * Parses FFmpeg probe stderr output into codec capabilities and full audio track list.
   *
   * @param {string} stderrData - Raw FFmpeg stderr output
   * @param {string} [fileExt=""] - Lowercase file extension
   * @returns {Object} Parsed codec/audio metadata
   */
  parseFfmpegProbeStderr(stderrData, fileExt = "") {
    const videoMatch = stderrData.match(/Stream #\d+:\d+(?:\[[^\]]+\])?.*?: Video:\s*([a-zA-Z0-9_]+)/i);
    const durMatch = stderrData.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);

    let duration = 0;
    if (durMatch) {
      duration =
        parseInt(durMatch[1], 10) * 3600 +
        parseInt(durMatch[2], 10) * 60 +
        parseFloat(durMatch[3]);
    }

    // Parse all available audio tracks from ffmpeg probe output
    const audioTracks = [];
    const lines = stderrData.split(/\r?\n/);
    let currentAudioIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const audioLineMatch = line.match(
        /Stream #\d+:(\d+)(?:\[[^\]]+\])?(?:\(([a-zA-Z0-9_-]+)\))?.*?: Audio:\s*([a-zA-Z0-9_]+)/i
      );
      if (audioLineMatch) {
        const streamIndex = parseInt(audioLineMatch[1], 10);
        const lang = audioLineMatch[2] ? audioLineMatch[2].toLowerCase() : "";
        const codec = audioLineMatch[3].toLowerCase();
        const isMultichannel = /5\.1|7\.1|6\.1|[3-8]\s*channels/i.test(line);

        let title = "";
        for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
          if (lines[j].includes("Stream #")) break;
          const titleMatch = lines[j].match(/title\s*:\s*(.+)$/i);
          if (titleMatch) {
            title = titleMatch[1].trim();
            break;
          }
        }

        let label = title;
        if (!label) {
          if (lang) {
            label = `Audio (${lang.toUpperCase()})`;
          } else {
            label = `Pista de Audio ${currentAudioIdx + 1}`;
          }
        }

        audioTracks.push({
          id: currentAudioIdx,
          streamIndex,
          lang: lang || "und",
          title,
          label,
          codec,
          isMultichannel,
        });
        currentAudioIdx++;
      }
    }

    const probeSucceeded = Boolean(videoMatch || audioTracks.length > 0 || duration > 0);
    const videoCodec = videoMatch ? videoMatch[1].toLowerCase() : "unknown";
    const audioCodec = audioTracks[0]?.codec || "unknown";
    const isVideoNative = Boolean(videoMatch) && NATIVE_VIDEO_CODECS.has(videoCodec);
    const allAudioTracksNative =
      probeSucceeded &&
      audioTracks.length > 0 &&
      audioTracks.every((track) => NATIVE_AUDIO_CODECS.has(track.codec) && !track.isMultichannel);
    const isAudioNative = allAudioTracksNative;

    // Force FFmpeg remux/transcode to AAC stereo whenever:
    // - probe failed or returned no audio tracks
    // - video or any audio track codec is non-native or multichannel (5.1/7.1)
    // - container is .mkv (ensures Chromium never drops multichannel/AC3/DTS tracks or stalls on seeks)
    // - stream has multiple audio tracks (enables live track switching via ?audio=X)
    const needsTranscode =
      !probeSucceeded ||
      !isVideoNative ||
      !isAudioNative ||
      fileExt === ".mkv" ||
      audioTracks.length > 1;

    return {
      probeSucceeded,
      videoCodec,
      audioCodec,
      duration,
      isVideoNative,
      isAudioNative,
      needsTranscode,
      audioTracks,
    };
  }

  /**
   * Probes media stream codecs sequentially from the first P2P bytes via pipe:0,
   * falling back to Range-based HTTP probe when moov atom resides at EOF (MP4/MOV).
   *
   * @param {Object} entry - Torrent engine entry
   * @param {number} fileIndex - Index of the target media file
   * @returns {Promise<Object>} Probe result
   */
  async probeStreamCodecs(entry, fileIndex) {
    if (entry.codecCache.has(fileIndex)) {
      return entry.codecCache.get(fileIndex);
    }

    const resolved = this.resolveTargetFile(entry.engine, fileIndex);
    if (!resolved || !resolved.file) {
      return {
        probeSucceeded: false,
        videoCodec: "unknown",
        audioCodec: "unknown",
        duration: 0,
        isVideoNative: false,
        isAudioNative: false,
        needsTranscode: true,
        audioTracks: [],
      };
    }

    const { file } = resolved;
    const ext = path.extname(file.name).toLowerCase();
    try {
      file.select();
    } catch (_) {}

    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      const fallback = Promise.resolve({
        probeSucceeded: false,
        videoCodec: "h264",
        audioCodec: "aac",
        duration: 0,
        isVideoNative: true,
        isAudioNative: true,
        needsTranscode: false,
        audioTracks: [],
      });
      entry.codecCache.set(fileIndex, fallback);
      return fallback;
    }

    const runHttpFallbackProbe = () =>
      new Promise((resolve) => {
        const port = this.getStreamPort();
        const rawUrl = `http://127.0.0.1:${port}/torrent/${entry.infoHash}/${fileIndex}/raw`;
        let stderrData = "";
        const proc = spawn(
          ffmpegPath,
          [
            "-hide_banner",
            "-analyzeduration",
            "2500000",
            "-probesize",
            "2500000",
            "-i",
            rawUrl,
          ],
          { windowsHide: true }
        );
        entry.ffmpegProcesses.add(proc);

        const timer = setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch (_) {}
        }, 15000);

        proc.stderr.on("data", (chunk) => {
          stderrData += chunk.toString();
        });

        const finish = () => {
          clearTimeout(timer);
          entry.ffmpegProcesses.delete(proc);
          resolve(stderrData);
        };

        proc.on("close", finish);
        proc.on("error", finish);
      });

    const probePromise = new Promise((resolve) => {
      let stderrData = "";
      let gotFirstData = false;
      let dataTimer = null;
      let finished = false;

      const maxReadEnd = Math.max(0, Math.min(file.length - 1, 4 * 1024 * 1024));
      const fileStream = file.createReadStream({ start: 0, end: maxReadEnd });

      const proc = spawn(
        ffmpegPath,
        [
          "-hide_banner",
          "-analyzeduration",
          "5000000",
          "-probesize",
          "4000000",
          "-i",
          "pipe:0",
        ],
        {
          stdio: ["pipe", "ignore", "pipe"],
          windowsHide: true,
        }
      );
      entry.ffmpegProcesses.add(proc);

      const killBoth = () => {
        try {
          if (!fileStream.destroyed) fileStream.destroy();
        } catch (_) {}
        try {
          proc.kill("SIGKILL");
        } catch (_) {}
      };

      const peerWaitTimer = setTimeout(() => {
        killBoth();
      }, 30000);

      fileStream.on("data", (chunk) => {
        entry.lastAccessed = Date.now();
        if (!gotFirstData) {
          gotFirstData = true;
          clearTimeout(peerWaitTimer);
          dataTimer = setTimeout(() => {
            killBoth();
          }, 10000);
        }
        if (proc.stdin && !proc.stdin.destroyed && proc.stdin.writable) {
          try {
            const ok = proc.stdin.write(chunk, () => {});
            if (!ok && !fileStream.destroyed) {
              fileStream.pause();
            }
          } catch (_) {
            try { fileStream.destroy(); } catch (__) {}
          }
        }
      });

      fileStream.on("end", () => {
        try {
          if (proc.stdin && !proc.stdin.destroyed) {
            proc.stdin.end();
          }
        } catch (_) {}
      });

      fileStream.on("error", () => {
        try {
          if (proc.stdin && !proc.stdin.destroyed) {
            proc.stdin.end();
          }
        } catch (_) {}
      });

      if (proc.stdin) {
        proc.stdin.on("drain", () => {
          if (!fileStream.destroyed) {
            try { fileStream.resume(); } catch (_) {}
          }
        });
        proc.stdin.on("error", () => {
          try {
            if (!fileStream.destroyed) fileStream.destroy();
          } catch (_) {}
        });
      }

      proc.stderr.on("data", (chunk) => {
        stderrData += chunk.toString();
      });

      const handleClose = async () => {
        if (finished) return;
        finished = true;
        clearTimeout(peerWaitTimer);
        if (dataTimer) clearTimeout(dataTimer);
        entry.ffmpegProcesses.delete(proc);
        try {
          if (!fileStream.destroyed) fileStream.destroy();
        } catch (_) {}

        let finalStderr = stderrData;
        if (
          (ext === ".mp4" || ext === ".m4v" || ext === ".mov") &&
          /moov atom not found/i.test(stderrData)
        ) {
          finalStderr = await runHttpFallbackProbe();
        }

        const result = this.parseFfmpegProbeStderr(finalStderr, ext);
        console.log(
          `[TorrentService] Probe (${entry.infoHash}/${fileIndex}): ok=${result.probeSucceeded}, video=${result.videoCodec} (native=${result.isVideoNative}), audio=${result.audioCodec} (tracks=${result.audioTracks.length}, native=${result.isAudioNative}), transcode=${result.needsTranscode}, duration=${Math.round(result.duration)}s`
        );

        resolve(result);
      };

      proc.on("close", handleClose);
      proc.on("error", handleClose);
    }).then((result) => {
      if (!result.probeSucceeded && entry.codecCache.get(fileIndex) === probePromise) {
        entry.codecCache.delete(fileIndex);
      }
      return result;
    });

    entry.codecCache.set(fileIndex, probePromise);
    return probePromise;
  }

  /**
   * Serves raw media stream using HTTP 206 Partial Content (Range requests) or full HTTP 200.
   *
   * @param {import("http").IncomingMessage} req
   * @param {import("http").ServerResponse} res
   * @param {Object} entry - Torrent engine entry
   * @param {Object} file - torrent-stream file handle
   */
  serveRawRangeStream(req, res, entry, file) {
    const fileSize = file.length;
    const ext = path.extname(file.name).toLowerCase();
    const contentType = MIME_TYPES[ext] || "video/mp4";
    const range = req.headers.range;

    entry.activeRequests++;
    let cleanedUp = false;
    let readStream = null;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      entry.activeRequests = Math.max(0, entry.activeRequests - 1);
      entry.lastAccessed = Date.now();
      if (readStream) {
        try {
          readStream.destroy();
        } catch (_) {}
      }
    };

    req.on("close", cleanup);
    res.on("close", cleanup);

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = Number.parseInt(parts[0], 10) || 0;
      const end = parts[1] ? Number.parseInt(parts[1], 10) : fileSize - 1;
      const safeStart = Math.max(0, Math.min(start, fileSize - 1));
      const safeEnd = Math.max(safeStart, Math.min(end, fileSize - 1));
      const chunkSize = safeEnd - safeStart + 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${safeStart}-${safeEnd}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
      });

      if (req.method === "HEAD") {
        cleanup();
        return res.end();
      }

      readStream = file.createReadStream({ start: safeStart, end: safeEnd });
      readStream.on("error", () => cleanup());
      readStream.pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Accept-Ranges": "bytes",
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
      });

      if (req.method === "HEAD") {
        cleanup();
        return res.end();
      }

      readStream = file.createReadStream();
      readStream.on("error", () => cleanup());
      readStream.pipe(res);
    }
  }

  /**
   * Spawns an FFmpeg pipeline to remux/transcode audio or video into fragmented MP4
   * on-the-fly and pipes output directly to the HTTP response stream.
   *
   * @param {import("http").IncomingMessage} req
   * @param {import("http").ServerResponse} res
   * @param {Object} entry - Torrent engine entry
   * @param {number} fileIndex - Index of the target media file
   * @param {Object} probeInfo - Output from probeStreamCodecs
   * @param {number} [startTimeSec=0] - Offset in seconds to seek to
   */
  serveTranscodedStream(req, res, entry, fileIndex, probeInfo, startTimeSec = 0, audioTrackIndex = 0) {
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      const resolved = this.resolveTargetFile(entry.engine, fileIndex);
      return this.serveRawRangeStream(req, res, entry, resolved.file);
    }

    const port = this.getStreamPort();
    const rawUrl = `http://127.0.0.1:${port}/torrent/${entry.infoHash}/${fileIndex}/raw`;

    const copyVideo = probeInfo && probeInfo.isVideoNative;
    const selectedTrack = probeInfo?.audioTracks?.[audioTrackIndex];
    const isMultichannel = selectedTrack ? Boolean(selectedTrack.isMultichannel) : true;
    const ffmpegArgs = ["-hide_banner", "-loglevel", "error", "-fflags", "+genpts"];

    if (startTimeSec > 0) {
      ffmpegArgs.push("-noaccurate_seek", "-ss", String(startTimeSec));
    }

    ffmpegArgs.push(
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "5",
      "-i",
      rawUrl,
      "-map",
      "0:v:0",
      "-map",
      `0:a:${audioTrackIndex}?`,
      "-sn"
    );

    if (copyVideo) {
      ffmpegArgs.push("-c:v", "copy");
    } else {
      ffmpegArgs.push(
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p"
      );
    }

    if (isMultichannel) {
      ffmpegArgs.push(
        "-af",
        "pan=stereo|FL=0.9*FC+0.7*FL+0.45*SL+0.45*BL|FR=0.9*FC+0.7*FR+0.45*SR+0.45*BR"
      );
    }

    ffmpegArgs.push(
      "-c:a",
      "aac",
      "-ac",
      "2",
      "-b:a",
      "256k",
      "-avoid_negative_ts",
      "make_zero",
      "-max_muxing_queue_size",
      "1024",
      "-f",
      "mp4",
      "-movflags",
      "frag_keyframe+empty_moov+default_base_moof",
      "pipe:1"
    );

    console.log(
      `[TorrentService] Remux/Transcode activo (${entry.infoHash}/${fileIndex}): video=${copyVideo ? "copy" : "libx264"}, audio=aac`
    );

    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "X-Media-Duration, X-Total-Duration",
      "X-Media-Duration": String(Math.round(probeInfo?.duration || 0)),
      "X-Total-Duration": String(Math.round(probeInfo?.duration || 0)),
      "Cache-Control": "no-cache, no-store",
      Connection: "keep-alive",
    });

    if (req.method === "HEAD") {
      return res.end();
    }

    // Ensure at most one active transcoding pipeline per torrent entry to prevent FFmpeg storms
    if (entry.activeTranscodeProcesses && entry.activeTranscodeProcesses.size > 0) {
      for (const prevProc of Array.from(entry.activeTranscodeProcesses)) {
        entry.activeTranscodeProcesses.delete(prevProc);
        entry.ffmpegProcesses.delete(prevProc);
        try {
          prevProc.kill("SIGKILL");
        } catch (_) {}
      }
    }

    entry.activeRequests++;
    const ffmpegProc = spawn(ffmpegPath, ffmpegArgs, { windowsHide: true });
    entry.ffmpegProcesses.add(ffmpegProc);
    if (!entry.activeTranscodeProcesses) entry.activeTranscodeProcesses = new Set();
    entry.activeTranscodeProcesses.add(ffmpegProc);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      entry.activeRequests = Math.max(0, entry.activeRequests - 1);
      entry.lastAccessed = Date.now();
      entry.ffmpegProcesses.delete(ffmpegProc);
      entry.activeTranscodeProcesses?.delete(ffmpegProc);
      try {
        ffmpegProc.kill("SIGKILL");
      } catch (_) {}
    };

    req.on("close", cleanup);
    res.on("close", cleanup);
    ffmpegProc.on("error", cleanup);
    ffmpegProc.on("close", cleanup);

    ffmpegProc.stdout.pipe(res);
  }

  async handleHttpRequest(req, res, parsedUrl) {
    // Expected format: /torrent/:infoHash/:fileIdx[/raw|/stats]
    const parts = (parsedUrl.pathname || "").split("/").filter(Boolean);
    // parts[0] === "torrent"
    const infoHash = (parts[1] || "").toLowerCase();
    const secondParam = parts[2] || "0";
    const subAction = parts[3] || "";

    if (!/^[a-f0-9]{40}$/.test(infoHash)) {
      res.writeHead(400, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      return res.end(JSON.stringify({ error: "Invalid torrent infoHash" }));
    }

    const queryTrackers = parsedUrl.query?.tr
      ? Array.isArray(parsedUrl.query.tr)
        ? parsedUrl.query.tr
        : [parsedUrl.query.tr]
      : [];
    const isMetaRequest = secondParam === "meta" || subAction === "meta";

    try {
      const entry = await this.getOrCreateEngine(infoHash, queryTrackers);

      if (isMetaRequest) {
        const resolved = this.resolveTargetFile(entry.engine, secondParam === "meta" ? 0 : secondParam);
        const actualIndex = resolved?.index ?? 0;
        try {
          resolved?.file?.select?.();
        } catch (_) {}
        const probeInfo = await this.probeStreamCodecs(entry, actualIndex);
        const ext = resolved?.file ? path.extname(resolved.file.name).toLowerCase() : "";
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        return res.end(JSON.stringify({
          infoHash: entry.infoHash,
          fileIndex: actualIndex,
          duration: probeInfo?.duration || 0,
          videoCodec: probeInfo?.videoCodec || "unknown",
          audioCodec: probeInfo?.audioCodec || "unknown",
          needsTranscode: Boolean(probeInfo?.needsTranscode) || FORCE_REMUX_EXTENSIONS.has(ext),
          audioTracks: probeInfo?.audioTracks || [],
        }));
      }

      if (secondParam === "stats" || subAction === "stats") {
        const swarm = entry.engine.swarm;
        const stats = {
          infoHash: entry.infoHash,
          ready: entry.ready,
          peers: swarm ? swarm.wires.length : 0,
          downloadSpeed: swarm ? swarm.downloadSpeed() : 0,
          uploaded: swarm ? swarm.uploaded : 0,
          downloaded: swarm ? swarm.downloaded : 0,
          files: entry.engine.files.map((f, idx) => ({
            index: idx,
            name: f.name,
            length: f.length,
          })),
        };
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        return res.end(JSON.stringify(stats));
      }

      const resolved = this.resolveTargetFile(entry.engine, secondParam);
      if (!resolved || !resolved.file) {
        res.writeHead(404, {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
        return res.end("No se encontró un archivo multimedia en el torrent.");
      }

      const { file, index: actualIndex } = resolved;
      try {
        file.select();
      } catch (_) {}

      // Internal /raw endpoint always serves direct bytes via HTTP Range
      if (subAction === "raw" || parsedUrl.query?.raw === "1") {
        return this.serveRawRangeStream(req, res, entry, file);
      }

      const forceTranscode = parsedUrl.query?.transcode === "1";
      const startTimeSec = Number.parseFloat(parsedUrl.query?.ss || "0") || 0;
      const audioTrackIndex = Number.parseInt(parsedUrl.query?.audio || "0", 10) || 0;
      const ext = path.extname(file.name).toLowerCase();

      if (forceTranscode || FORCE_REMUX_EXTENSIONS.has(ext) || audioTrackIndex > 0 || startTimeSec > 0) {
        const probeInfo = await this.probeStreamCodecs(entry, actualIndex);
        return this.serveTranscodedStream(req, res, entry, actualIndex, probeInfo, startTimeSec, audioTrackIndex);
      }

      // For .mkv/.mp4 containers, verify whether audio or video tracks require transcoding (e.g. AC3/DTS/HEVC)
      if (ext === ".mkv" || ext === ".mp4" || ext === ".m4v") {
        const probeInfo = await this.probeStreamCodecs(entry, actualIndex);
        if (probeInfo.needsTranscode || audioTrackIndex > 0) {
          return this.serveTranscodedStream(req, res, entry, actualIndex, probeInfo, startTimeSec, audioTrackIndex);
        }
      }

      return this.serveRawRangeStream(req, res, entry, file);
    } catch (err) {
      if (isMetaRequest) {
        if (!res.headersSent) {
          res.writeHead(err?.isP2pTimeout ? 504 : 500, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
        }
        return res.end(JSON.stringify({ error: err.message, retryable: Boolean(err?.isP2pTimeout) }));
      }
      if (!err?.isP2pTimeout) {
        console.error("[TorrentService] Error al servir stream:", err.message);
      }
      if (!res.headersSent) {
        res.writeHead(err?.isP2pTimeout ? 504 : 500, {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        });
      }
      res.end(`Error en motor torrent: ${err.message}`);
    }
  }

  cleanupIdleEngines() {
    const now = Date.now();
    for (const [hash, entry] of this.engines.entries()) {
      if (entry.activeRequests <= 0 && now - entry.lastAccessed > 3 * 60 * 1000) {
        this.destroyEngine(hash);
      }
    }
  }

  destroyEngine(infoHash) {
    const cleanHash = String(infoHash || "").toLowerCase();
    const entry = this.engines.get(cleanHash);
    if (!entry) return;

    this.engines.delete(cleanHash);
    console.log(`[TorrentService] Liberando recursos P2P de infoHash: ${cleanHash}`);

    for (const proc of entry.ffmpegProcesses) {
      try {
        proc.kill("SIGKILL");
      } catch (_) {}
    }
    entry.ffmpegProcesses.clear();
    entry.activeTranscodeProcesses?.clear();

    try {
      entry.engine.destroy(() => {
        try {
          if (entry.storagePath && fs.existsSync(entry.storagePath)) {
            fs.rmSync(entry.storagePath, { recursive: true, force: true });
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  destroyAll() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    for (const hash of Array.from(this.engines.keys())) {
      this.destroyEngine(hash);
    }
  }
}

module.exports = new TorrentService();
