const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const { app } = require("electron");

class CacheService {
  async getServerFiles(roomCode) {
    if (!roomCode || !global.roomManager?.fileIndexStore) return [];
    try {
      const records = await global.roomManager.fileIndexStore.load(roomCode);
      const files = [];

      // Load downloads registry
      const registryPath = path.join(app.getPath("userData"), "downloads.json");
      let downloadsRegistry = {};
      if (fs.existsSync(registryPath)) {
        try {
          downloadsRegistry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
        } catch (e) {}
      }

      for (const record of records) {
        let localPath = null;

        // Case A: User uploaded this file, check realPath
        if (record.realPath && fs.existsSync(record.realPath)) {
          localPath = record.realPath;
        }
        // Case B: User downloaded this file, check downloads registry
        else if (downloadsRegistry[record.id]?.localPath && fs.existsSync(downloadsRegistry[record.id].localPath)) {
          localPath = downloadsRegistry[record.id].localPath;
        }

        if (localPath) {
          const stats = await fsPromises.stat(localPath);
          const ext = path.extname(record.name).toLowerCase();
          
          let category = "document";
          if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext)) {
            category = "image";
          } else if ([".mp4", ".webm", ".mkv", ".mov", ".avi"].includes(ext)) {
            category = "video";
          } else if ([".mp3", ".wav", ".ogg", ".m4a", ".flac"].includes(ext)) {
            category = "audio";
          } else if ([".txt", ".log", ".js", ".json", ".css", ".md", ".html", ".py", ".ts", ".jsx", ".tsx"].includes(ext)) {
            category = "text";
          } else if (ext === ".pdf") {
            category = "pdf";
          }

          files.push({
            id: record.id,
            name: record.name,
            size: stats.size,
            updatedAt: stats.mtimeMs || record.uploadedAt || Date.now(),
            type: category,
            extension: ext,
            localPath: localPath,
          });
        }
      }
      return files;
    } catch (err) {
      console.error("[CacheService] Error reading server files:", err.message);
      return [];
    }
  }

  async deleteServerFile(roomCode, fileName) {
    if (!roomCode || !global.roomManager?.fileIndexStore) return false;
    try {
      const records = await global.roomManager.fileIndexStore.load(roomCode);
      const fileRecord = records.find((f) => f.name === fileName || f.id === fileName);
      if (!fileRecord) return false;

      // Safely un-index file from fileIndexStore (DO NOT unlink user's PC physical file!)
      await global.roomManager.fileIndexStore.remove(roomCode, fileRecord.id);

      // Clean up downloads registry entry if present
      const registryPath = path.join(app.getPath("userData"), "downloads.json");
      if (fs.existsSync(registryPath)) {
        try {
          let downloadsRegistry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
          if (downloadsRegistry[fileRecord.id]) {
            delete downloadsRegistry[fileRecord.id];
            await fsPromises.writeFile(
              registryPath,
              JSON.stringify(downloadsRegistry, null, 2),
              "utf8"
            );
          }
        } catch (e) {}
      }

      return true;
    } catch (err) {
      console.error("[CacheService] Error un-indexing file:", err.message);
      return false;
    }
  }

  async clearServerCache(roomCode) {
    if (!roomCode || !global.roomManager?.fileIndexStore) return false;
    try {
      // Clear downloads registry entries safely without unlinking any physical files on disk
      const registryPath = path.join(app.getPath("userData"), "downloads.json");
      if (fs.existsSync(registryPath)) {
        try {
          await fsPromises.writeFile(registryPath, JSON.stringify({}, null, 2), "utf8");
        } catch (e) {}
      }

      return true;
    } catch (err) {
      console.error("[CacheService] Error clearing server cache:", err.message);
      return false;
    }
  }

  async getTotalCacheStats() {
    let totalSize = 0;
    let totalFiles = 0;

    try {
      const registryPath = path.join(app.getPath("userData"), "downloads.json");
      if (fs.existsSync(registryPath)) {
        const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
        for (const key of Object.keys(registry)) {
          const lp = registry[key].localPath;
          if (lp && fs.existsSync(lp)) {
            const stats = fs.statSync(lp);
            totalSize += stats.size;
            totalFiles += 1;
          }
        }
      }
    } catch (e) {
      console.error("[CacheService] Error calculating total cache stats:", e.message);
    }

    return { totalSize, totalFiles };
  }

  async getFilePath(roomCode, fileId) {
    if (!fileId) return null;
    try {
      const code = roomCode || global.roomManager?.roomCode;
      if (code && global.roomManager?.fileIndexStore) {
        const records = await global.roomManager.fileIndexStore.load(code);
        const record = records.find((f) => String(f.id) === String(fileId));
        if (record?.realPath && fs.existsSync(record.realPath)) {
          return record.realPath;
        }
      }

      const registryPath = path.join(app.getPath("userData"), "downloads.json");
      if (fs.existsSync(registryPath)) {
        const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
        const dl = registry[String(fileId)];
        if (dl?.localPath && fs.existsSync(dl.localPath)) {
          return dl.localPath;
        }
      }

      return null;
    } catch (e) {
      console.error("[CacheService] Error resolving file path:", e.message);
      return null;
    }
  }

  async getAudioCover(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return null;
    try {
      const fd = fs.openSync(filePath, "r");
      const stat = fs.statSync(filePath);
      const readSize = Math.min(stat.size, 3 * 1024 * 1024);
      const buf = Buffer.alloc(readSize);
      fs.readSync(fd, buf, 0, readSize, 0);
      fs.closeSync(fd);

      // 1. MP3 ID3v2 APIC tag
      if (buf.length > 10 && buf.toString("ascii", 0, 3) === "ID3") {
        let offset = 10;
        const tagSize =
          ((buf[6] & 0x7f) << 21) |
          ((buf[7] & 0x7f) << 14) |
          ((buf[8] & 0x7f) << 7) |
          (buf[9] & 0x7f);

        const limit = Math.min(tagSize + 10, buf.length - 10);
        while (offset < limit) {
          const frameID = buf.toString("ascii", offset, offset + 4);
          const frameSize = buf.readUInt32BE(offset + 4);
          if (frameSize <= 0 || frameSize > limit) break;

          if (frameID === "APIC" || frameID === "PIC") {
            const frameData = buf.subarray(offset + 10, offset + 10 + frameSize);
            const encoding = frameData[0];
            let mimeEnd = 1;
            while (mimeEnd < frameData.length && frameData[mimeEnd] !== 0) mimeEnd++;
            const mimeType = frameData.toString("ascii", 1, mimeEnd) || "image/jpeg";
            let descEnd = mimeEnd + 2;
            if (encoding === 1 || encoding === 2) {
              while (descEnd < frameData.length - 1 && !(frameData[descEnd] === 0 && frameData[descEnd + 1] === 0)) descEnd += 2;
              descEnd += 2;
            } else {
              while (descEnd < frameData.length && frameData[descEnd] !== 0) descEnd++;
              descEnd += 1;
            }
            const imgBuffer = frameData.subarray(descEnd);
            if (imgBuffer.length > 10) {
              const cleanMime = mimeType.startsWith("image/") ? mimeType : "image/jpeg";
              return `data:${cleanMime};base64,${imgBuffer.toString("base64")}`;
            }
          }
          offset += 10 + frameSize;
        }
      }

      // 2. FLAC metadata picture block parser
      if (buf.length > 4 && buf.toString("ascii", 0, 4) === "fLaC") {
        let offset = 4;
        while (offset < buf.length - 4) {
          const blockHeader = buf[offset];
          const isLast = (blockHeader & 0x80) !== 0;
          const blockType = blockHeader & 0x7f;
          const length = (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
          offset += 4;

          if (blockType === 6 && offset + length <= buf.length) {
            const pBuf = buf.subarray(offset, offset + length);
            const mimeLen = pBuf.readUInt32BE(4);
            const mimeType = pBuf.toString("ascii", 8, 8 + mimeLen) || "image/jpeg";
            const descLen = pBuf.readUInt32BE(8 + mimeLen);
            const dataOffset = 8 + mimeLen + 4 + descLen + 16;
            const dataLen = pBuf.readUInt32BE(dataOffset);
            const imgBuf = pBuf.subarray(dataOffset + 4, dataOffset + 4 + dataLen);
            if (imgBuf.length > 10) {
              return `data:${mimeType};base64,${imgBuf.toString("base64")}`;
            }
          }
          if (isLast) break;
          offset += length;
        }
      }

      // 3. M4A / MP4 'covr' atom
      const covrIdx = buf.indexOf("covr");
      if (covrIdx !== -1 && covrIdx + 8 < buf.length) {
        const dataIdx = buf.indexOf("data", covrIdx);
        if (dataIdx !== -1 && dataIdx + 16 < buf.length) {
          const dataSize = buf.readUInt32BE(dataIdx - 4);
          const flags = buf.readUInt32BE(dataIdx + 4);
          const imgBuf = buf.subarray(dataIdx + 12, dataIdx - 4 + dataSize);
          if (imgBuf.length > 10) {
            const mimeType = flags === 14 ? "image/png" : "image/jpeg";
            return `data:${mimeType};base64,${imgBuf.toString("base64")}`;
          }
        }
      }
    } catch (e) {
      console.error("[CacheService] Error extracting audio cover:", e.message);
    }
    return null;
  }
}

module.exports = new CacheService();
