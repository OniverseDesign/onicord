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

// Códecs que Chromium / Electron reproduce de forma nativa sin transcodificación
const NATIVE_VIDEO_CODECS = new Set(["h264", "avc1", "vp8", "vp9", "av1", "theora"]);
const NATIVE_AUDIO_CODECS = new Set(["aac", "mp3", "opus", "vorbis", "flac", "pcm_s16le", "pcm_s24le", "pcm_f32le", "mp4a"]);
const FORCE_REMUX_EXTENSIONS = new Set([".avi", ".ts", ".m2ts", ".flv", ".wmv", ".mov"]);

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

  async getOrCreateEngine(infoHash, customTrackers = []) {
    const cleanHash = String(infoHash || "").trim().toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(cleanHash)) {
      throw new Error(`Invalid infoHash: ${infoHash}`);
    }

    // Pausar otros torrents inactivos para concentrar el ancho de banda en la reproducción actual
    for (const [hash, existing] of this.engines.entries()) {
      if (hash !== cleanHash && existing.activeRequests <= 0) {
        this.destroyEngine(hash);
      }
    }

    if (this.engines.has(cleanHash)) {
      const existing = this.engines.get(cleanHash);
      existing.lastAccessed = Date.now();
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
      storagePath,
      readyPromise: null,
    };

    entry.readyPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.destroyEngine(cleanHash);
        reject(new Error("Timeout esperando metadatos de la red P2P (sin semillas activas)."));
      }, 35000);

      engine.once("ready", () => {
        clearTimeout(timeout);
        entry.ready = true;
        entry.lastAccessed = Date.now();
        console.log(
          `[TorrentService] Metadatos P2P listos para ${cleanHash}: ${engine.files.length} archivo(s)`
        );
        // Deseleccionar todos por defecto hasta que se pida el archivo específico
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

    // Buscar el archivo de video/audio más grande si el índice no coincide con un medio válido
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

    // Fallback al archivo de mayor tamaño general
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

  async probeStreamCodecs(entry, fileIndex) {
    if (entry.codecCache.has(fileIndex)) {
      return entry.codecCache.get(fileIndex);
    }

    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      const fallback = Promise.resolve({
        videoCodec: "h264",
        audioCodec: "aac",
        duration: 0,
        isVideoNative: true,
        isAudioNative: true,
        needsTranscode: false,
      });
      entry.codecCache.set(fileIndex, fallback);
      return fallback;
    }

    const port = this.getStreamPort();
    const rawUrl = `http://127.0.0.1:${port}/torrent/${entry.infoHash}/${fileIndex}/raw`;

    const probePromise = new Promise((resolve) => {
      let stderrData = "";
      const proc = spawn(
        ffmpegPath,
        [
          "-hide_banner",
          "-analyzeduration",
          "1500000",
          "-probesize",
          "1500000",
          "-i",
          rawUrl,
        ],
        { windowsHide: true }
      );

      const timer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch (_) {}
      }, 10000);

      proc.stderr.on("data", (chunk) => {
        stderrData += chunk.toString();
      });

      proc.on("close", () => {
        clearTimeout(timer);
        const videoMatch = stderrData.match(/Stream #\d+:\d+.*?: Video: ([a-zA-Z0-9_]+)/);
        const audioMatch = stderrData.match(/Stream #\d+:\d+.*?: Audio: ([a-zA-Z0-9_]+)/);
        const durMatch = stderrData.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);

        const videoCodec = videoMatch ? videoMatch[1].toLowerCase() : "h264";
        const audioCodec = audioMatch ? audioMatch[1].toLowerCase() : "aac";
        let duration = 0;
        if (durMatch) {
          duration =
            parseInt(durMatch[1], 10) * 3600 +
            parseInt(durMatch[2], 10) * 60 +
            parseFloat(durMatch[3]);
        }

        const isVideoNative = NATIVE_VIDEO_CODECS.has(videoCodec);
        const isAudioNative = !audioMatch || NATIVE_AUDIO_CODECS.has(audioCodec);

        const result = {
          videoCodec,
          audioCodec,
          duration,
          isVideoNative,
          isAudioNative,
          needsTranscode: !isVideoNative || !isAudioNative,
        };

        console.log(
          `[TorrentService] Probe (${entry.infoHash}/${fileIndex}): video=${videoCodec} (native=${isVideoNative}), audio=${audioCodec} (native=${isAudioNative}), duration=${Math.round(duration)}s`
        );

        resolve(result);
      });

      proc.on("error", () => {
        clearTimeout(timer);
        resolve({
          videoCodec: "h264",
          audioCodec: "aac",
          duration: 0,
          isVideoNative: true,
          isAudioNative: true,
          needsTranscode: false,
        });
      });
    });

    entry.codecCache.set(fileIndex, probePromise);
    return probePromise;
  }

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

  serveTranscodedStream(req, res, entry, fileIndex, probeInfo, startTimeSec = 0) {
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      const resolved = this.resolveTargetFile(entry.engine, fileIndex);
      return this.serveRawRangeStream(req, res, entry, resolved.file);
    }

    const port = this.getStreamPort();
    const rawUrl = `http://127.0.0.1:${port}/torrent/${entry.infoHash}/${fileIndex}/raw`;

    const copyVideo = probeInfo && probeInfo.isVideoNative;
    const ffmpegArgs = ["-hide_banner", "-loglevel", "error"];

    if (startTimeSec > 0) {
      ffmpegArgs.push("-ss", String(startTimeSec));
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
      "0:a:0?",
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

    ffmpegArgs.push(
      "-c:a",
      "aac",
      "-ac",
      "2",
      "-b:a",
      "192k",
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

    entry.activeRequests++;
    const ffmpegProc = spawn(ffmpegPath, ffmpegArgs, { windowsHide: true });
    entry.ffmpegProcesses.add(ffmpegProc);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      entry.activeRequests = Math.max(0, entry.activeRequests - 1);
      entry.lastAccessed = Date.now();
      entry.ffmpegProcesses.delete(ffmpegProc);
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
    // Formato esperado: /torrent/:infoHash/:fileIdx[/raw|/stats]
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

    try {
      const entry = await this.getOrCreateEngine(infoHash, queryTrackers);

      if (secondParam === "meta" || subAction === "meta") {
        const resolved = this.resolveTargetFile(entry.engine, secondParam === "meta" ? 0 : secondParam);
        const actualIndex = resolved?.index ?? 0;
        const probeInfo = await this.probeStreamCodecs(entry, actualIndex);
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
          needsTranscode: Boolean(probeInfo?.needsTranscode),
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

      // Endpoint interno /raw siempre sirve bytes directos por Range
      if (subAction === "raw" || parsedUrl.query?.raw === "1") {
        return this.serveRawRangeStream(req, res, entry, file);
      }

      const forceTranscode = parsedUrl.query?.transcode === "1";
      const startTimeSec = Number.parseFloat(parsedUrl.query?.ss || "0") || 0;
      const ext = path.extname(file.name).toLowerCase();

      if (forceTranscode || FORCE_REMUX_EXTENSIONS.has(ext)) {
        const probeInfo = await this.probeStreamCodecs(entry, actualIndex);
        return this.serveTranscodedStream(req, res, entry, actualIndex, probeInfo, startTimeSec);
      }

      // Para archivos .mkv o .mp4, verificar si tienen audio AC3/EAC3/DTS o video HEVC
      if (ext === ".mkv" || ext === ".mp4" || ext === ".m4v") {
        const probeInfo = await this.probeStreamCodecs(entry, actualIndex);
        if (probeInfo.needsTranscode) {
          return this.serveTranscodedStream(req, res, entry, actualIndex, probeInfo, startTimeSec);
        }
      }

      return this.serveRawRangeStream(req, res, entry, file);
    } catch (err) {
      console.error("[TorrentService] Error al servir stream:", err.message);
      if (!res.headersSent) {
        res.writeHead(500, {
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
