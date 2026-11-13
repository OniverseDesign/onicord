const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

let ffmpegPath = null;
try {
  ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
  if (
    ffmpegPath &&
    ffmpegPath.includes("app.asar") &&
    !ffmpegPath.includes("app.asar.unpacked")
  ) {
    const unpackedPath = ffmpegPath.replace("app.asar", "app.asar.unpacked");
    if (fs.existsSync(unpackedPath)) {
      ffmpegPath = unpackedPath;
    }
  }
} catch (err) {
  console.warn(
    "[MediaTranscodeService] @ffmpeg-installer/ffmpeg no disponible:",
    err.message
  );
}

const SUPPORTED_VIDEO_EXTS = new Set([
  ".mp4",
  ".webm",
  ".mkv",
  ".mov",
  ".avi",
  ".flv",
  ".wmv",
  ".m4v",
]);

class MediaTranscodeService {
  static isVideoFile(filePathOrName) {
    if (!filePathOrName) return false;
    const ext = path.extname(filePathOrName).toLowerCase();
    return SUPPORTED_VIDEO_EXTS.has(ext);
  }

  static getFFmpegPath() {
    return ffmpegPath;
  }

  /**
   * Generates a compressed WebP thumbnail (base64 data URI) from the first seconds of a video.
   * Runs non-blocking via child_process.spawn with an automatic timeout.
   */
  static async generateVideoThumbnailBase64(videoPath, options = {}) {
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
      console.warn("[MediaTranscodeService] Binario FFmpeg no encontrado.");
      return null;
    }
    if (!videoPath || !fs.existsSync(videoPath)) {
      return null;
    }

    const {
      seekSeconds = 1,
      width = 360,
      quality = 65,
      timeoutMs = 8000,
    } = options;

    return new Promise((resolve) => {
      let isDone = false;
      const chunks = [];

      const timer = setTimeout(() => {
        if (!isDone) {
          isDone = true;
          try {
            proc.kill("SIGKILL");
          } catch (_) {}
          console.warn(
            `[MediaTranscodeService] Timeout (${timeoutMs}ms) generando miniatura para: ${path.basename(videoPath)}`
          );
          resolve(null);
        }
      }, timeoutMs);

      // WebP via libwebp into pipe:1
      const ffmpegArgs = [
        "-hide_banner",
        "-loglevel", "error",
        "-ss", String(seekSeconds),
        "-i", videoPath,
        "-vframes", "1",
        "-vf", `scale=${width}:-2`,
        "-c:v", "libwebp",
        "-lossless", "0",
        "-compression_level", "4",
        "-q:v", String(quality),
        "-f", "image2",
        "pipe:1",
      ];

      const proc = spawn(ffmpegPath, ffmpegArgs, { windowsHide: true });

      proc.stdout.on("data", (chunk) => {
        chunks.push(chunk);
      });

      proc.on("error", (err) => {
        if (!isDone) {
          isDone = true;
          clearTimeout(timer);
          console.warn("[MediaTranscodeService] Error en proceso FFmpeg:", err.message);
          resolve(null);
        }
      });

      proc.on("close", (code) => {
        if (!isDone) {
          isDone = true;
          clearTimeout(timer);
          if (code === 0 && chunks.length > 0) {
            const buffer = Buffer.concat(chunks);
            if (buffer.length > 0) {
              const base64 = buffer.toString("base64");
              return resolve(`data:image/webp;base64,${base64}`);
            }
          }
          // If webp pipe produced nothing, try JPEG fallback
          MediaTranscodeService._generateJpegFallback(videoPath, options)
            .then(resolve)
            .catch(() => resolve(null));
        }
      });
    });
  }

  static async _generateJpegFallback(videoPath, options = {}) {
    const { seekSeconds = 1, width = 360, timeoutMs = 5000 } = options;
    return new Promise((resolve) => {
      let isDone = false;
      const chunks = [];

      const timer = setTimeout(() => {
        if (!isDone) {
          isDone = true;
          try { proc.kill("SIGKILL"); } catch (_) {}
          resolve(null);
        }
      }, timeoutMs);

      const proc = spawn(
        ffmpegPath,
        [
          "-hide_banner",
          "-loglevel", "error",
          "-ss", String(seekSeconds),
          "-i", videoPath,
          "-vframes", "1",
          "-vf", `scale=${width}:-2`,
          "-c:v", "mjpeg",
          "-q:v", "4",
          "-f", "image2",
          "pipe:1",
        ],
        { windowsHide: true }
      );

      proc.stdout.on("data", (c) => chunks.push(c));
      proc.on("error", () => {
        if (!isDone) {
          isDone = true;
          clearTimeout(timer);
          resolve(null);
        }
      });
      proc.on("close", (code) => {
        if (!isDone) {
          isDone = true;
          clearTimeout(timer);
          if (code === 0 && chunks.length > 0) {
            const buf = Buffer.concat(chunks);
            return resolve(`data:image/jpeg;base64,${buf.toString("base64")}`);
          }
          resolve(null);
        }
      });
    });
  }
}

module.exports = MediaTranscodeService;
