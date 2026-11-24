const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const MIME_TO_EXT = {
  "image/webp": "webp",
  "image/avif": "avif",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/opus": "opus",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "application/pdf": "pdf",
};

const EXT_TO_MIME = {
  webp: "image/webp",
  avif: "image/avif",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  opus: "audio/opus",
  mp4: "video/mp4",
  webm: "video/webm",
  pdf: "application/pdf",
};

function ensureDirSync(targetDir) {
  const resolved = path.resolve(targetDir);
  if (fs.existsSync(resolved)) return;
  const missing = [];
  let cur = resolved;
  while (cur && !fs.existsSync(cur)) {
    missing.unshift(cur);
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  for (const dir of missing) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
  }
}

class CasStore {
  static _instances = new Map();

  static getInstance(userDataPath) {
    const resolved = path.resolve(userDataPath);
    const key = resolved.toLowerCase();
    if (!CasStore._instances.has(key)) {
      CasStore._instances.set(key, new CasStore(resolved));
    }
    return CasStore._instances.get(key);
  }

  constructor(userDataPath) {
    this.userDataPath = path.resolve(userDataPath);
    this.casDir = path.join(this.userDataPath, "cas");
    ensureDirSync(this.casDir);
    this._worker = undefined;
    this._workerReqId = 1;
    this._pendingWorkerRequests = new Map();
    this._lastTouchMap = new Map();
  }

  _ensureWorker() {
    if (this._worker !== undefined) return this._worker;
    try {
      const { Worker } = require("worker_threads");
      const workerPath = path.join(__dirname, "../workers/casHasherWorker.cjs");
      if (fs.existsSync(workerPath)) {
        this._worker = new Worker(workerPath);
        this._worker.unref(); // Do not prevent process from exiting

        this._worker.on("message", (res) => {
          if (!res || !res.id) return;
          const handler = this._pendingWorkerRequests.get(res.id);
          if (handler) {
            this._pendingWorkerRequests.delete(res.id);
            if (res.error) {
              handler.reject(new Error(res.error));
            } else {
              try {
                const { DbManager } = require("./dbManager.cjs");
                const dbMgr = DbManager._instances?.get(this.userDataPath.toLowerCase());
                if (dbMgr) {
                  const discoverDb = dbMgr.getGlobalDb("discover");
                  const now = Date.now();
                  discoverDb
                    .prepare(
                      `INSERT INTO cas_index (hash, ext, mime_type, size_bytes, created_at, last_accessed_at)
                       VALUES (?, ?, ?, ?, ?, ?)
                       ON CONFLICT(hash) DO UPDATE SET last_accessed_at = excluded.last_accessed_at`
                    )
                    .run(res.hash, res.ext, res.mimeType, res.size, now, now);
                }
              } catch (_) {}
              handler.resolve(res);
            }
          }
        });

        this._worker.on("error", (err) => {
          console.warn("[CasStore] Worker thread error, falling back to main thread:", err.message);
          this._worker = null;
        });

        return this._worker;
      }
    } catch (_) {
      this._worker = null;
    }
    this._worker = null;
    return null;
  }

  async storeBufferAsync(buffer, ext = "bin", mimeType = null) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
    const worker = this._ensureWorker();

    // For buffers > 64KB, offload SHA-256 and disk writing to worker thread
    if (worker && buffer.length > 64 * 1024) {
      return new Promise((resolve, reject) => {
        const id = this._workerReqId++;
        this._pendingWorkerRequests.set(id, { resolve, reject });
        worker.postMessage({
          id,
          buffer,
          ext,
          mimeType,
          casDir: this.casDir,
        });
      });
    }

    return this.storeBuffer(buffer, ext, mimeType);
  }

  async storeDataUriAsync(value) {
    if (!value || typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed.startsWith("data:")) return value;

    const commaIdx = trimmed.indexOf(",");
    if (commaIdx === -1) return value;

    const header = trimmed.slice(5, commaIdx);
    const body = trimmed.slice(commaIdx + 1);
    if (!body) return value;

    const isBase64 = /;base64/i.test(header);
    const mimeMatch = header.match(/^([^;]+)/);
    const mimeType = (mimeMatch ? mimeMatch[1] : "image/png").toLowerCase().trim();
    let ext = MIME_TO_EXT[mimeType];
    if (!ext) {
      const slashIdx = mimeType.indexOf("/");
      ext = slashIdx !== -1 ? mimeType.slice(slashIdx + 1).split("+")[0] : "bin";
    }

    try {
      const buffer = isBase64
        ? Buffer.from(body.replace(/\s+/g, ""), "base64")
        : Buffer.from(decodeURIComponent(body), "utf8");
      if (buffer.length === 0) return value;
      const stored = await this.storeBufferAsync(buffer, ext, mimeType);
      return stored ? stored.uri : value;
    } catch {
      return value;
    }
  }

  _sanitizeExt(ext) {
    const clean = String(ext || "bin")
      .toLowerCase()
      .replace(/^\.+/, "")
      .replace(/[^a-z0-9]/g, "");
    return clean || "bin";
  }

  /**
   * Stores a Buffer in CAS (`userData/cas/<ab>/<sha256>.<ext>`) and returns metadata.
   */
  storeBuffer(buffer, ext = "bin", mimeType = null) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return null;
    const cleanExt = this._sanitizeExt(ext);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const prefix = hash.slice(0, 2);
    const subDir = path.join(this.casDir, prefix);
    ensureDirSync(subDir);

    const fileName = `${hash}.${cleanExt}`;
    const filePath = path.join(subDir, fileName);

    if (!fs.existsSync(filePath)) {
      const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      try {
        fs.writeFileSync(tmpPath, buffer);
        fs.renameSync(tmpPath, filePath);
      } catch {
        try {
          fs.writeFileSync(filePath, buffer);
        } catch (err) {
          console.error("[CasStore] Error writing blob:", err.message);
          return null;
        } finally {
          if (fs.existsSync(tmpPath)) {
            try {
              fs.unlinkSync(tmpPath);
            } catch {}
          }
        }
      }
    }

    const resolvedMime = mimeType || EXT_TO_MIME[cleanExt] || "application/octet-stream";

    // Optionally record in discover.db -> cas_index if DbManager is initialized
    try {
      const { DbManager } = require("./dbManager.cjs");
      const dbMgr = DbManager._instances?.get(this.userDataPath.toLowerCase());
      if (dbMgr) {
        const discoverDb = dbMgr.getGlobalDb("discover");
        const now = Date.now();
        discoverDb
          .prepare(
            `INSERT INTO cas_index (hash, ext, mime_type, size_bytes, created_at, last_accessed_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(hash) DO UPDATE SET last_accessed_at = excluded.last_accessed_at`
          )
          .run(hash, cleanExt, resolvedMime, buffer.length, now, now);
      }
    } catch {}

    return {
      hash,
      ext: cleanExt,
      mimeType: resolvedMime,
      size: buffer.length,
      filePath,
      uri: `onicord-media://cas/${hash}.${cleanExt}`,
    };
  }

  /**
   * If `value` is a `data:...` URI, extracts the binary into CAS and returns `onicord-media://cas/<sha256>.<ext>`.
   * Otherwise returns `value` unchanged.
   */
  storeDataUri(value) {
    if (!value || typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed.startsWith("data:")) return value;

    const commaIdx = trimmed.indexOf(",");
    if (commaIdx === -1) return value;

    const header = trimmed.slice(5, commaIdx);
    const body = trimmed.slice(commaIdx + 1);
    if (!body) return value;

    const isBase64 = /;base64/i.test(header);
    const mimeMatch = header.match(/^([^;]+)/);
    const mimeType = (mimeMatch ? mimeMatch[1] : "image/png").toLowerCase().trim();
    let ext = MIME_TO_EXT[mimeType];
    if (!ext) {
      const slashIdx = mimeType.indexOf("/");
      ext = slashIdx !== -1 ? mimeType.slice(slashIdx + 1).split("+")[0] : "bin";
    }

    try {
      const buffer = isBase64
        ? Buffer.from(body.replace(/\s+/g, ""), "base64")
        : Buffer.from(decodeURIComponent(body), "utf8");
      if (buffer.length === 0) return value;
      const stored = this.storeBuffer(buffer, ext, mimeType);
      return stored ? stored.uri : value;
    } catch {
      return value;
    }
  }

  /**
   * Resolves a CAS URI (`onicord-media://cas/<hash>.<ext>`) or `(hash, ext)` to an absolute path on disk.
   */
  resolveFilePath(uriOrHash, fallbackExt = null) {
    if (!uriOrHash || typeof uriOrHash !== "string") return null;
    let target = uriOrHash.trim();
    if (target.startsWith("onicord-media://cas/")) {
      target = target.slice("onicord-media://cas/".length).split("?")[0];
    }
    target = path.basename(target);

    let hash = target;
    let ext = fallbackExt;
    const dotIdx = target.indexOf(".");
    if (dotIdx !== -1) {
      hash = target.slice(0, dotIdx);
      ext = target.slice(dotIdx + 1);
    }

    hash = hash.toLowerCase().replace(/[^a-f0-9]/g, "");
    if (hash.length !== 64) return null;

    const prefix = hash.slice(0, 2);
    const subDir = path.join(this.casDir, prefix);
    if (!fs.existsSync(subDir)) return null;

    if (ext) {
      const cleanExt = this._sanitizeExt(ext);
      const candidate = path.join(subDir, `${hash}.${cleanExt}`);
      if (fs.existsSync(candidate)) {
        this._touchAccess(hash);
        return candidate;
      }
    }

    // Fallback scan inside the 2-char prefix folder
    try {
      const entries = fs.readdirSync(subDir);
      const match = entries.find((f) => f.startsWith(`${hash}.`));
      if (match) {
        this._touchAccess(hash);
        return path.join(subDir, match);
      }
    } catch {}

    return null;
  }

  _touchAccess(hash) {
    if (!hash) return;
    const now = Date.now();
    const last = this._lastTouchMap.get(hash) || 0;
    // Throttle SQLite touch to once every 6 hours per hash
    if (now - last < 6 * 60 * 60 * 1000) return;
    this._lastTouchMap.set(hash, now);
    if (this._lastTouchMap.size > 4096) {
      const oldest = this._lastTouchMap.keys().next().value;
      this._lastTouchMap.delete(oldest);
    }
    try {
      const { DbManager } = require("./dbManager.cjs");
      const dbMgr = DbManager._instances?.get(this.userDataPath.toLowerCase());
      if (dbMgr) {
        const discoverDb = dbMgr.getGlobalDb("discover");
        discoverDb
          .prepare("UPDATE cas_index SET last_accessed_at = ? WHERE hash = ?")
          .run(now, hash);
      }
    } catch {}
  }

  /**
   * Prunes unused CAS blobs inside `this.casDir` when total size exceeds `maxTotalBytes`
   * AND entries have not been accessed within `maxAgeDays`.
   * Strictly enforces path containment inside `this.casDir`.
   */
  async pruneCache({ maxTotalBytes = 1024 * 1024 * 1024, maxAgeDays = 30 } = {}) {
    let deletedCount = 0;
    let freedBytes = 0;
    try {
      const { DbManager } = require("./dbManager.cjs");
      const dbMgr = DbManager.getInstance(this.userDataPath);
      const discoverDb = dbMgr.getGlobalDb("discover");
      const statsRow = discoverDb
        .prepare("SELECT COALESCE(SUM(size_bytes), 0) AS totalBytes FROM cas_index")
        .get();
      let totalBytes = Number(statsRow?.totalBytes || 0);
      if (totalBytes <= maxTotalBytes) {
        return { deletedCount: 0, freedBytes: 0 };
      }

      const cutoffTs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      const candidates = discoverDb
        .prepare(
          "SELECT hash, ext, size_bytes, last_accessed_at FROM cas_index WHERE last_accessed_at < ? ORDER BY last_accessed_at ASC LIMIT 500"
        )
        .all(cutoffTs);

      const managedRoot = path.resolve(this.casDir) + path.sep;
      const deleteStmt = discoverDb.prepare("DELETE FROM cas_index WHERE hash = ?");
      const deletedHashes = [];

      for (const row of candidates) {
        if (totalBytes <= maxTotalBytes) break;
        const hash = String(row.hash || "").toLowerCase().replace(/[^a-f0-9]/g, "");
        if (hash.length !== 64) continue;
        const cleanExt = this._sanitizeExt(row.ext);
        const filePath = path.resolve(this.casDir, hash.slice(0, 2), `${hash}.${cleanExt}`);
        if (!filePath.startsWith(managedRoot)) continue;

        try {
          if (fs.existsSync(filePath)) {
            await fsPromises.unlink(filePath);
          }
          const size = Number(row.size_bytes || 0);
          totalBytes = Math.max(0, totalBytes - size);
          freedBytes += size;
          deletedCount += 1;
          deletedHashes.push(row.hash);
        } catch {}
      }

      if (deletedHashes.length > 0) {
        const tx = discoverDb.transaction((hashes) => {
          for (const h of hashes) deleteStmt.run(h);
        });
        tx(deletedHashes);
      }
    } catch (err) {
      console.warn("[CasStore] Error pruning CAS cache:", err.message);
    }
    return { deletedCount, freedBytes };
  }

  /**
   * Converts `onicord-media://cas/<hash>.<ext>` back to a `data:<mime>;base64,...` URI
   * for P2P network transmission or export packages (.onipkg).
   */
  toDataUri(value) {
    if (!value || typeof value !== "string") return value;
    if (!value.startsWith("onicord-media://cas/")) return value;

    const filePath = this.resolveFilePath(value);
    if (!filePath || !fs.existsSync(filePath)) return value;

    try {
      const ext = path.extname(filePath).slice(1).toLowerCase();
      const mime = EXT_TO_MIME[ext] || "image/png";
      const buf = fs.readFileSync(filePath);
      return `data:${mime};base64,${buf.toString("base64")}`;
    } catch {
      return value;
    }
  }

  /**
   * Deeply traverses an object/array and replaces any `data:image/...` or `data:audio/...` strings
   * with `onicord-media://cas/<sha256>.<ext>` references.
   */
  ingestObject(input) {
    if (!input) return input;
    if (typeof input === "string") {
      return input.startsWith("data:") ? this.storeDataUri(input) : input;
    }
    if (Array.isArray(input)) {
      return input.map((item) => this.ingestObject(item));
    }
    if (typeof input === "object" && input.constructor === Object) {
      const out = {};
      for (const [k, v] of Object.entries(input)) {
        out[k] = this.ingestObject(v);
      }
      return out;
    }
    return input;
  }

  /**
   * Deeply traverses an object/array and hydrates `onicord-media://cas/<sha256>.<ext>` strings
   * back into `data:...;base64,...` strings so P2P peers on other instances/machines receive the binary payload.
   */
  hydrateForNetwork(input) {
    if (!input) return input;
    if (typeof input === "string") {
      return input.startsWith("onicord-media://cas/") ? this.toDataUri(input) : input;
    }
    if (Array.isArray(input)) {
      return input.map((item) => this.hydrateForNetwork(item));
    }
    if (typeof input === "object" && input.constructor === Object) {
      const out = {};
      for (const [k, v] of Object.entries(input)) {
        out[k] = this.hydrateForNetwork(v);
      }
      return out;
    }
    return input;
  }
}

module.exports = { CasStore, MIME_TO_EXT, EXT_TO_MIME };
