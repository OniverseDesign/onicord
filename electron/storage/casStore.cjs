const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MIME_TO_EXT = {
  "image/webp": "webp",
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
      if (fs.existsSync(candidate)) return candidate;
    }

    // Fallback scan inside the 2-char prefix folder
    try {
      const entries = fs.readdirSync(subDir);
      const match = entries.find((f) => f.startsWith(`${hash}.`));
      if (match) return path.join(subDir, match);
    } catch {}

    return null;
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
