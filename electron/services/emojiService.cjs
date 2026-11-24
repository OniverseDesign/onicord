const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { app } = require("electron");
const { DbManager } = require("../storage/dbManager.cjs");
const { CasStore } = require("../storage/casStore.cjs");

const ALLOWED_EXTS = new Set(["webp", "png", "gif", "jpg", "jpeg"]);

function sanitizeShortcode(raw, fallback = "emoji") {
  let cleaned = String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);

  if (!cleaned) return fallback;
  if (cleaned.length < 2) {
    if (!fallback) return "";
    cleaned = `${cleaned}_emoji`.slice(0, 32);
  }
  return cleaned;
}

function extractShortcodeFromFilename(filename, fallback = "emoji") {
  const base = path.basename(String(filename || ""));
  const noExt = base.includes(".")
    ? base.slice(0, base.lastIndexOf("."))
    : base;
  const stripped = noExt.replace(
    /^\d+(?:\s*-\s*|\s*_\s*|\s+)(?=[a-zA-Z0-9\u00C0-\u017F])/,
    ""
  );
  return sanitizeShortcode(stripped, fallback);
}

function formatPackNameFromZipFilename(zipFileName) {
  const base = path.basename(String(zipFileName || ""));
  const noExt = base.replace(/\.zip$/i, "");
  const stripped = noExt.replace(
    /^\d+(?:\s*-\s*|\s*_\s*|\s+)(?=[a-zA-Z0-9\u00C0-\u017F])/,
    ""
  );
  const spaced = stripped
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return "";
  return spaced
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

class EmojiService {
  constructor(userDataPath = null) {
    this._customUserData = userDataPath;
    this._dirsEnsured = false;
  }

  _userData() {
    if (this._customUserData) return this._customUserData;
    return app.getPath("userData");
  }

  get packsDir() {
    this.ensureDirs();
    return path.join(this._userData(), "emoji_packs");
  }

  _db() {
    return DbManager.getInstance(this._userData()).getGlobalDb("emojis");
  }

  _cas() {
    return CasStore.getInstance(this._userData());
  }

  _emitSync(payload) {
    try {
      if (global.mainWindow && !global.mainWindow.webContents.isDestroyed()) {
        global.mainWindow.webContents.send("sync:complete", payload);
      }
    } catch {}
  }

  ensureDirs() {
    if (this._dirsEnsured) return;
    try {
      const dir = path.join(this._userData(), "emoji_packs");
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this._dirsEnsured = true;
    } catch {}
  }

  getEmojiPathSync(id) {
    try {
      const cleanId = path.basename(String(id || "").trim());
      if (!cleanId) return null;

      const row = this._db()
        .prepare("SELECT cas_hash, ext FROM emojis WHERE emoji_id = ?")
        .get(cleanId);
      if (!row) return null;

      const casPath = this._cas().resolveFilePath(row.cas_hash, row.ext);
      if (casPath && fs.existsSync(casPath)) {
        return casPath.replace(/\\/g, "/");
      }
      return null;
    } catch {
      return null;
    }
  }

  async getEmojiPath(id) {
    return this.getEmojiPathSync(id);
  }

  getEmojiRecordSync(id) {
    try {
      const cleanId = path.basename(String(id || "").trim());
      if (!cleanId) return null;

      const row = this._db()
        .prepare("SELECT * FROM emojis WHERE emoji_id = ?")
        .get(cleanId);
      if (!row) return null;

      const casPath = this._cas().resolveFilePath(row.cas_hash, row.ext);
      if (!casPath || !fs.existsSync(casPath)) return null;

      return {
        id: row.emoji_id,
        shortcode: row.shortcode,
        ext: row.ext,
        animated: Boolean(row.animated),
        packId: row.pack_id || null,
        localPath: casPath.replace(/\\/g, "/"),
      };
    } catch {
      return null;
    }
  }

  async saveEmojiLocal({
    id,
    shortcode,
    ext = "webp",
    base64Data,
    packId = null,
    packName = null,
    animated = null,
  }) {
    try {
      const cleanId =
        path.basename(String(id || "").trim()) ||
        `emj_${crypto.randomBytes(6).toString("hex")}`;
      const rawExt = String(ext || "webp")
        .toLowerCase()
        .replace(/^\.+/, "");
      const cleanExt = ALLOWED_EXTS.has(rawExt) ? rawExt : "webp";
      const cleanShortcode = sanitizeShortcode(shortcode || cleanId);
      const isAnimated =
        animated !== null ? (animated ? 1 : 0) : cleanExt === "gif" ? 1 : 0;

      if (!base64Data || typeof base64Data !== "string") {
        console.warn(
          `[Emoji Service] Attempted to save emoji ${cleanId} with invalid Base64 data.`
        );
        return { success: false };
      }

      let rawBase64 = base64Data;
      if (base64Data.includes(",")) {
        rawBase64 = base64Data.split(",")[1];
      }
      if (!rawBase64) return { success: false };

      const buffer = Buffer.from(rawBase64, "base64");
      if (!buffer.length) return { success: false };

      const cas = this._cas();
      const stored = cas.storeBuffer(buffer, cleanExt);
      if (!stored) return { success: false };

      const emojisDb = this._db();
      const cleanPackId = packId ? String(packId).trim() : null;
      const now = Date.now();

      if (cleanPackId) {
        emojisDb
          .prepare(
            `
            INSERT OR IGNORE INTO emoji_packs (
              pack_id, name, author, version, icon_emoji_id, position, is_builtin, created_at
            ) VALUES (?, ?, NULL, '1.0.0', ?, 0, 0, ?)
          `
          )
          .run(cleanPackId, String(packName || cleanPackId).trim(), cleanId, now);
      }

      emojisDb
        .prepare(
          `
          INSERT INTO emojis (
            emoji_id, pack_id, shortcode, ext, cas_hash, animated, is_favorite, use_count, last_used_at, added_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL, ?)
          ON CONFLICT(emoji_id) DO UPDATE SET
            pack_id = COALESCE(excluded.pack_id, emojis.pack_id),
            shortcode = excluded.shortcode,
            ext = excluded.ext,
            cas_hash = excluded.cas_hash,
            animated = excluded.animated
        `
        )
        .run(
          cleanId,
          cleanPackId,
          cleanShortcode,
          stored.ext,
          stored.hash,
          isAnimated,
          now
        );

      const casPath = cas.resolveFilePath(stored.hash, stored.ext);
      this._emitSync({ type: "emoji_imported", emojiId: cleanId });

      return {
        success: true,
        id: cleanId,
        shortcode: cleanShortcode,
        ext: stored.ext,
        animated: Boolean(isAnimated),
        casUri: `onicord-media://cas/${stored.hash}.${stored.ext}`,
        localPath: casPath ? casPath.replace(/\\/g, "/") : null,
      };
    } catch (err) {
      console.error("[Emoji Service Error] saveEmojiLocal failed:", err);
      throw err;
    }
  }

  async updateEmojiShortcode(id, newShortcode) {
    try {
      const cleanId = path.basename(String(id || "").trim());
      const cleanShortcode = sanitizeShortcode(newShortcode, "");
      if (!cleanId || !cleanShortcode) {
        return { success: false };
      }

      const info = this._db()
        .prepare("UPDATE emojis SET shortcode = ? WHERE emoji_id = ?")
        .run(cleanShortcode, cleanId);

      if (info.changes > 0) {
        this._emitSync({
          type: "emoji_updated",
          emojiId: cleanId,
          shortcode: cleanShortcode,
        });
      }

      return {
        success: info.changes > 0,
        id: cleanId,
        shortcode: cleanShortcode,
      };
    } catch (err) {
      console.error("[Emoji Service Error] updateEmojiShortcode failed:", err);
      throw err;
    }
  }

  async listLocalEmojis() {
    try {
      const emojisDb = this._db();
      const cas = this._cas();
      const rows = emojisDb
        .prepare("SELECT * FROM emojis ORDER BY added_at DESC")
        .all();
      const list = [];

      for (const r of rows) {
        const casPath = cas.resolveFilePath(r.cas_hash, r.ext);
        if (casPath && fs.existsSync(casPath)) {
          list.push({
            id: r.emoji_id,
            shortcode: r.shortcode,
            name: r.shortcode,
            packId: r.pack_id || null,
            ext: r.ext,
            animated: Boolean(r.animated),
            useCount: r.use_count || 0,
            casUri: `onicord-media://cas/${r.cas_hash}.${r.ext}`,
            localPath: casPath.replace(/\\/g, "/"),
          });
        }
      }

      return list;
    } catch (err) {
      console.error("[Emoji Service Error] listLocalEmojis failed:", err.message);
      return [];
    }
  }

  async deleteEmojiLocal(id) {
    try {
      const cleanId = path.basename(String(id || "").trim());
      if (!cleanId) return false;

      const info = this._db()
        .prepare("DELETE FROM emojis WHERE emoji_id = ?")
        .run(cleanId);

      if (info.changes > 0) {
        this._emitSync({ type: "emoji_deleted", emojiId: cleanId });
      }
      return info.changes > 0;
    } catch (err) {
      console.error("[Emoji Service Error] deleteEmojiLocal failed:", err);
      throw err;
    }
  }

  async exportEmojiPack(packName, emojisList, roomManager, authorName = null) {
    try {
      const cleanDisplayName = String(packName || "Emoji Pack").trim() || "Emoji Pack";
      const packRaw = {
        formatVersion: 1,
        type: "emojis",
        version: "1.0.0",
        name: cleanDisplayName,
        author: authorName || roomManager?.profile?.nickname || null,
        emojis: [],
        createdAt: new Date().toISOString(),
      };

      for (const item of emojisList || []) {
        if (!item?.id) continue;
        const resolvedPath = await this.getEmojiPath(item.id);
        if (resolvedPath && fs.existsSync(resolvedPath)) {
          const bitmap = await fsPromises.readFile(resolvedPath);
          const ext = item.ext || path.extname(resolvedPath).slice(1) || "webp";
          packRaw.emojis.push({
            id: item.id,
            shortcode: sanitizeShortcode(item.shortcode || item.name || item.id),
            ext,
            animated: Boolean(item.animated || ext === "gif"),
            base64: `data:image/${ext};base64,${bitmap.toString("base64")}`,
          });
        }
      }

      const baseSlug =
        cleanDisplayName.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") ||
        "emoji_pack";
      const fileName = `${baseSlug}.onipkg`;
      const packsRoot = path.resolve(this.packsDir) + path.sep;
      const finalPath = path.join(this.packsDir, fileName);
      if (!path.resolve(finalPath).startsWith(packsRoot)) {
        throw new Error("Unsafe emoji pack path.");
      }

      const jsonString = JSON.stringify(packRaw);
      const compressed = zlib.gzipSync(Buffer.from(jsonString, "utf8"));
      await fsPromises.writeFile(finalPath, compressed);

      const now = Date.now();
      this._db()
        .prepare(
          `
          INSERT OR REPLACE INTO emoji_packs (
            pack_id, name, author, version, icon_emoji_id, position, is_builtin, created_at
          ) VALUES (?, ?, ?, ?, ?, 0, 0, ?)
        `
        )
        .run(
          baseSlug,
          cleanDisplayName,
          packRaw.author,
          packRaw.version,
          packRaw.emojis[0]?.id || null,
          now
        );

      const generatedFileId = crypto.randomUUID();
      if (roomManager && roomManager.roomCode && roomManager.fileIndexStore) {
        const stat = fs.statSync(finalPath);
        const record = {
          id: generatedFileId,
          name: fileName,
          size: stat.size,
          uploadedAt: now,
          updatedAt: now,
          realPath: finalPath,
          ownerId: roomManager.profile?.id || null,
        };
        await roomManager.fileIndexStore.merge(roomManager.roomCode, [record], {
          isLocal: true,
        });
      }

      return {
        finalPath,
        fileName,
        fileId: generatedFileId,
        size: compressed.length,
      };
    } catch (err) {
      console.error("[Emoji Service Error] exportEmojiPack failed:", err);
      throw err;
    }
  }

  async _parsePackBuffer(argumentData) {
    let bufferToProcess = null;

    if (Buffer.isBuffer(argumentData) || argumentData instanceof Uint8Array) {
      bufferToProcess = Buffer.from(argumentData);
    } else if (typeof argumentData === "string") {
      if (fs.existsSync(argumentData)) {
        bufferToProcess = await fsPromises.readFile(argumentData);
      } else if (argumentData.trim().startsWith("{")) {
        bufferToProcess = Buffer.from(argumentData, "utf8");
      } else {
        try {
          bufferToProcess = Buffer.from(argumentData, "base64");
        } catch {
          bufferToProcess = Buffer.from(argumentData, "utf8");
        }
      }
    }

    if (!bufferToProcess) {
      throw new Error("Invalid package data.");
    }

    let rawString = "";
    try {
      rawString = zlib
        .gunzipSync(bufferToProcess, { maxOutputLength: 50 * 1024 * 1024 })
        .toString("utf8");
    } catch {
      rawString = bufferToProcess.toString("utf8");
    }

    return JSON.parse(rawString);
  }

  async inspectOnipkgType(argumentData) {
    try {
      const pack = await this._parsePackBuffer(argumentData);
      if (
        pack?.type === "emojis" ||
        pack?.type === "emoji_pack" ||
        Array.isArray(pack?.emojis)
      ) {
        return "emojis";
      }
      if (Array.isArray(pack?.stickers)) {
        return "stickers";
      }
      return null;
    } catch {
      return null;
    }
  }

  async importEmojiPackRaw(argumentData) {
    try {
      const pack = await this._parsePackBuffer(argumentData);
      if (!pack || !pack.name || !Array.isArray(pack.emojis)) {
        throw new Error("Invalid or corrupted emoji .onipkg structure.");
      }

      const cleanPackId =
        pack.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") ||
        "emoji_pack";
      const emojisDb = this._db();
      const cas = this._cas();
      const now = Date.now();
      const packsRoot = path.resolve(this.packsDir) + path.sep;
      const importedIds = [];

      const tx = emojisDb.transaction(() => {
        emojisDb
          .prepare(
            `
            INSERT OR REPLACE INTO emoji_packs (
              pack_id, name, author, version, icon_emoji_id, position, is_builtin, created_at
            ) VALUES (?, ?, ?, ?, ?, 0, 0, ?)
          `
          )
          .run(
            cleanPackId,
            pack.name,
            pack.author || null,
            pack.version || "1.0.0",
            pack.emojis[0]?.id ? path.basename(String(pack.emojis[0].id).trim()) : null,
            now
          );

        const upsertEmoji = emojisDb.prepare(
          `
          INSERT INTO emojis (
            emoji_id, pack_id, shortcode, ext, cas_hash, animated, is_favorite, use_count, last_used_at, added_at
          ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, NULL, ?)
          ON CONFLICT(emoji_id) DO UPDATE SET
            pack_id = excluded.pack_id,
            shortcode = excluded.shortcode,
            ext = excluded.ext,
            cas_hash = excluded.cas_hash,
            animated = excluded.animated
        `
        );

        for (const item of pack.emojis) {
          if (!item?.id || !item.base64) continue;
          const cleanEmojiId = path.basename(String(item.id).trim());
          if (!cleanEmojiId) continue;

          const rawExt = String(item.ext || "webp")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
          const extensionFinal = ALLOWED_EXTS.has(rawExt) ? rawExt : "webp";
          const cleanShortcode = sanitizeShortcode(
            item.shortcode || item.name || cleanEmojiId
          );
          const isAnimated = item.animated || extensionFinal === "gif" ? 1 : 0;

          const base64Parts = item.base64.split(",");
          const targetBufferString = base64Parts[1] || base64Parts[0];
          const buffer = Buffer.from(targetBufferString, "base64");
          if (!buffer.length) continue;

          const stored = cas.storeBuffer(buffer, extensionFinal);
          if (stored) {
            upsertEmoji.run(
              cleanEmojiId,
              cleanPackId,
              cleanShortcode,
              stored.ext,
              stored.hash,
              isAnimated,
              now
            );
            importedIds.push(cleanEmojiId);
          }
        }
      });
      tx();

      const lightweightIndex = {
        formatVersion: 1,
        type: "emojis",
        version: pack.version || "1.0.0",
        name: pack.name,
        author: pack.author || null,
        emojis: pack.emojis.map((item) => ({
          id: String(item.id).trim(),
          shortcode: sanitizeShortcode(item.shortcode || item.name || item.id),
          ext: item.ext || "webp",
          animated: Boolean(item.animated || item.ext === "gif"),
        })),
      };

      const finalPackPath = path.join(this.packsDir, `${cleanPackId}.onipkg`);
      if (!path.resolve(finalPackPath).startsWith(packsRoot)) {
        throw new Error("Unsafe emoji pack path (Zip-Slip blocked).");
      }
      const compressedIndex = zlib.gzipSync(
        Buffer.from(JSON.stringify(lightweightIndex, null, 2), "utf8")
      );
      await fsPromises.writeFile(finalPackPath, compressedIndex);

      this._emitSync({ type: "emoji_pack_imported", name: pack.name });

      return {
        success: true,
        type: "emojis",
        name: pack.name,
        count: importedIds.length,
        ids: importedIds,
      };
    } catch (err) {
      console.error("[Emoji Service Error] importEmojiPackRaw failed:", err.message);
      throw err;
    }
  }

  async downloadAndInstallEmojiPack(downloadUrl, timeoutMs = 15000) {
    if (!downloadUrl || typeof downloadUrl !== "string") {
      throw new Error("Invalid download URL.");
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(downloadUrl.trim());
    } catch {
      throw new Error("Invalid URL format.");
    }
    if (parsedUrl.protocol !== "https:") {
      throw new Error("Only HTTPS URLs are allowed for emoji packs.");
    }
    const openGraphService = require("./openGraphService.cjs");
    if (openGraphService.isPrivateOrBlockedHost(parsedUrl.hostname)) {
      throw new Error("Private or loopback destinations are not allowed.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return await this.importEmojiPackRaw(Buffer.from(arrayBuffer));
    } catch (err) {
      clearTimeout(timer);
      console.error(
        "[Emoji Service Error] Remote emoji pack download failed:",
        err.message
      );
      throw err;
    }
  }

  async extractEmojiZip(argumentData, zipFileName = "") {
    const MAX_ENTRIES = 150;
    const MAX_GIF_BYTES = 2 * 1024 * 1024;
    const MAX_STATIC_BYTES = 8 * 1024 * 1024;
    const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

    let zipBuffer = null;
    if (Buffer.isBuffer(argumentData) || argumentData instanceof Uint8Array) {
      zipBuffer = Buffer.from(argumentData);
    } else if (typeof argumentData === "string" && fs.existsSync(argumentData)) {
      zipBuffer = await fsPromises.readFile(argumentData);
    }

    if (!zipBuffer || !zipBuffer.length) {
      throw new Error("Invalid ZIP file data.");
    }

    const AdmZip = require("adm-zip");
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    const items = [];
    let skippedTooLarge = 0;
    let totalBytes = 0;

    for (const entry of entries) {
      if (entry.isDirectory) continue;

      const normalizedPath = String(entry.entryName || "").replace(/\\/g, "/");
      const segments = normalizedPath.split("/");
      if (segments.some((seg) => seg === "__MACOSX")) continue;

      const base = path.posix.basename(normalizedPath);
      if (!base || base.startsWith(".")) continue;

      const dotIdx = base.lastIndexOf(".");
      if (dotIdx <= 0) continue;
      const ext = base.slice(dotIdx + 1).toLowerCase();
      if (!ALLOWED_EXTS.has(ext)) continue;

      const buf = entry.getData();
      if (!buf || !buf.length) continue;

      const isGif = ext === "gif";
      if ((isGif && buf.length > MAX_GIF_BYTES) || (!isGif && buf.length > MAX_STATIC_BYTES)) {
        skippedTooLarge += 1;
        continue;
      }

      if (totalBytes + buf.length > MAX_TOTAL_BYTES || items.length >= MAX_ENTRIES) {
        break;
      }

      totalBytes += buf.length;
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
      items.push({
        fileName: base,
        ext,
        animated: isGif,
        shortcode: extractShortcodeFromFilename(base),
        dataUrl: `data:${mime};base64,${buf.toString("base64")}`,
      });
    }

    return {
      success: true,
      suggestedPackName: formatPackNameFromZipFilename(zipFileName),
      items,
      skippedTooLarge,
    };
  }
}

const defaultInstance = new EmojiService();
defaultInstance.EmojiService = EmojiService;
defaultInstance.sanitizeShortcode = sanitizeShortcode;
defaultInstance.extractShortcodeFromFilename = extractShortcodeFromFilename;
module.exports = defaultInstance;
