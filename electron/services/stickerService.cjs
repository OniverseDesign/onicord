const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");
const { app } = require("electron");
const { DbManager } = require("../storage/dbManager.cjs");
const { CasStore } = require("../storage/casStore.cjs");

class StickerService {
  constructor(userDataPath = null) {
    this._customUserData = userDataPath;
    this._dirsEnsured = false;
  }

  _userData() {
    if (this._customUserData) return this._customUserData;
    return app.getPath("userData");
  }

  get stickersDir() {
    this.ensureDirs();
    return path.join(this._userData(), "stickers");
  }

  get packsDir() {
    this.ensureDirs();
    return path.join(this._userData(), "sticker_packs");
  }

  _db() {
    return DbManager.getInstance(this._userData()).getGlobalDb("stickers");
  }

  _cas() {
    return CasStore.getInstance(this._userData());
  }

  ensureDirs() {
    if (this._dirsEnsured) return;
    try {
      const base = this._userData();
      [path.join(base, "stickers"), path.join(base, "sticker_packs")].forEach((dir) => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir);
        }
      });
      this._dirsEnsured = true;
    } catch (_) {}
  }

  async saveStickerLocal({ id, ext, base64Data, name = null, packId = null }) {
    try {
      const cleanId = String(id || "").trim();
      const cleanExt = String(ext || "webp").toLowerCase().replace(/^\.+/, "");
      if (!cleanId) return false;

      const stickersDb = this._db();
      const cas = this._cas();

      const existing = stickersDb
        .prepare("SELECT cas_hash, ext FROM stickers WHERE sticker_id = ?")
        .get(cleanId);
      if (existing && cas.resolveFilePath(existing.cas_hash, existing.ext)) {
        return true;
      }

      if (!base64Data || typeof base64Data !== "string") {
        console.warn(`[Sticker Service] Se intentó guardar el sticker ${cleanId} pero la data Base64 es inválida.`);
        return false;
      }

      let rawBase64 = base64Data;
      if (base64Data.includes(",")) {
        rawBase64 = base64Data.split(",")[1];
      }
      if (!rawBase64) return false;

      const buffer = Buffer.from(rawBase64, "base64");
      const stored = cas.storeBuffer(buffer, cleanExt);
      if (!stored) return false;

      stickersDb
        .prepare(`
          INSERT OR REPLACE INTO stickers (
            sticker_id, pack_id, name, ext, cas_hash, is_favorite, use_count, last_used_at, added_at
          ) VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?)
        `)
        .run(
          cleanId,
          packId || null,
          String(name || cleanId),
          stored.ext,
          stored.hash,
          Date.now()
        );

      return true;
    } catch (err) {
      console.error("[Sticker Service Error] Falló saveStickerLocal:", err);
      throw err;
    }
  }

  async getStickerPath(id) {
    try {
      const cleanId = String(id || "").trim();
      if (!cleanId) return null;

      const row = this._db()
        .prepare("SELECT cas_hash, ext FROM stickers WHERE sticker_id = ?")
        .get(cleanId);
      if (row) {
        const casPath = this._cas().resolveFilePath(row.cas_hash, row.ext);
        if (casPath && fs.existsSync(casPath)) {
          return casPath.replace(/\\/g, "/");
        }
      }

      const extensions = ["png", "jpg", "gif", "webp", "jpeg"];
      for (const ext of extensions) {
        const filePath = path.join(this.stickersDir, `${cleanId}.${ext}`);
        if (fs.existsSync(filePath)) {
          return filePath.replace(/\\/g, "/");
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  async exportStickerPack(packName, stickersList, roomManager, authorName = null, iconName = null) {
    try {
      console.log(`[Sticker Export P2P] Empaquetando grupo: "${packName}" a .onipkg...`);
      const packRaw = {
        formatVersion: 1,
        type: "stickers",
        version: "1.0.0",
        name: packName,
        author: authorName || roomManager?.profile?.nickname || null,
        iconName: iconName || null,
        stickers: [],
        createdAt: new Date().toISOString(),
      };

      for (const stk of stickersList) {
        const resolvedPath = await this.getStickerPath(stk.id);
        if (resolvedPath && fs.existsSync(resolvedPath)) {
          const bitmap = await fsPromises.readFile(resolvedPath);
          const ext = stk.ext || path.extname(resolvedPath).slice(1) || "webp";
          packRaw.stickers.push({
            id: stk.id,
            name: stk.name,
            ext,
            base64: `data:image/${ext};base64,${bitmap.toString("base64")}`,
          });
        }
      }

      const fileName = `${packName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.onipkg`;
      const finalPath = path.join(this.packsDir, fileName);

      const jsonString = JSON.stringify(packRaw);
      const compressed = zlib.gzipSync(Buffer.from(jsonString, "utf8"));
      await fsPromises.writeFile(finalPath, compressed);

      // Persist pack record in stickers.db
      const stickersDb = this._db();
      const packId = path.basename(fileName, ".onipkg");
      const now = Date.now();
      stickersDb
        .prepare(`
          INSERT OR REPLACE INTO sticker_packs (
            pack_id, name, author, icon_name, icon_ref, position, is_builtin, created_at
          ) VALUES (?, ?, ?, ?, NULL, 0, 0, ?)
        `)
        .run(packId, packName, packRaw.author, iconName || null, now);

      let generatedFileId = crypto.randomUUID();
      if (roomManager && roomManager.roomCode && roomManager.fileIndexStore) {
        const stat = fs.statSync(finalPath);
        const record = {
          id: generatedFileId,
          name: fileName,
          size: stat.size,
          uploadedAt: Date.now(),
          updatedAt: Date.now(),
          realPath: finalPath,
          ownerId: roomManager.profile?.id || null,
        };

        await roomManager.fileIndexStore.merge(roomManager.roomCode, [record]);
        console.log(`[Sticker Export P2P] Registrado en Ares Server con ID: ${generatedFileId} (${fileName})`);
      }

      return {
        finalPath,
        fileName,
        fileId: generatedFileId,
        size: compressed.length,
      };
    } catch (err) {
      console.error("[Sticker Service Error] Falló exportStickerPack:", err);
      throw err;
    }
  }

  async importStickerPackRaw(argumentData) {
    try {
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
        throw new Error("Datos de paquete no válidos.");
      }

      let rawString = "";
      try {
        rawString = zlib.gunzipSync(bufferToProcess).toString("utf8");
      } catch {
        rawString = bufferToProcess.toString("utf8");
      }

      const pack = JSON.parse(rawString);

      if (!pack || !pack.name || !pack.stickers || !Array.isArray(pack.stickers)) {
        throw new Error("Estructura de paquete .onipkg inválida o corrupta.");
      }

      const cleanPackName = pack.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const stickersDb = this._db();
      const cas = this._cas();
      const now = Date.now();

      const tx = stickersDb.transaction(() => {
        stickersDb
          .prepare(`
            INSERT OR REPLACE INTO sticker_packs (
              pack_id, name, author, icon_name, icon_ref, position, is_builtin, created_at
            ) VALUES (?, ?, ?, ?, NULL, 0, 0, ?)
          `)
          .run(cleanPackName, pack.name, pack.author || null, pack.iconName || null, now);

        const upsertSticker = stickersDb.prepare(`
          INSERT OR REPLACE INTO stickers (
            sticker_id, pack_id, name, ext, cas_hash, is_favorite, use_count, last_used_at, added_at
          ) VALUES (?, ?, ?, ?, ?, 0, 0, NULL, ?)
        `);

        for (const stk of pack.stickers) {
          if (!stk?.id || !stk.base64) continue;
          const cleanStickerId = String(stk.id).trim();
          const extensionFinal = String(stk.ext || "png").toLowerCase();
          const base64Parts = stk.base64.split(",");
          const targetBufferString = base64Parts[1] || base64Parts[0];
          const buffer = Buffer.from(targetBufferString, "base64");
          const stored = cas.storeBuffer(buffer, extensionFinal);
          if (stored) {
            upsertSticker.run(
              cleanStickerId,
              cleanPackName,
              String(stk.name || cleanStickerId),
              stored.ext,
              stored.hash,
              now
            );
          }
        }
      });
      tx();

      const packIndiceAlivianado = {
        formatVersion: 1,
        type: "stickers",
        version: pack.version || "1.0.0",
        name: pack.name,
        author: pack.author || null,
        iconName: pack.iconName || null,
        stickers: pack.stickers.map((stk) => ({
          id: String(stk.id).trim(),
          name: stk.name,
          ext: stk.ext || "png",
        })),
      };

      const finalPackPath = path.join(this.packsDir, `${cleanPackName}.onipkg`);
      const compressedIndex = zlib.gzipSync(
        Buffer.from(JSON.stringify(packIndiceAlivianado, null, 2), "utf8")
      );
      await fsPromises.writeFile(finalPackPath, compressedIndex);

      if (global.mainWindow && !global.mainWindow.webContents.isDestroyed()) {
        global.mainWindow.webContents.send("sync:complete", {
          type: "sticker_pack_imported",
          name: pack.name,
        });
      }

      console.log(`✨ [Sticker Service] Pack "${pack.name}" indexado en stickers.db + CAS.`);
      const listaIds = pack.stickers.map((stk) => String(stk.id).trim());

      return {
        success: true,
        name: pack.name,
        count: pack.stickers.length,
        ids: listaIds,
      };
    } catch (err) {
      console.error("❌ [Sticker Service Error]:", err.message);
      throw err;
    }
  }

  async listLocalStickers() {
    try {
      const stickersDb = this._db();
      const cas = this._cas();
      const rows = stickersDb.prepare("SELECT * FROM stickers ORDER BY added_at DESC").all();
      const list = [];
      const seen = new Set();

      for (const r of rows) {
        const casPath = cas.resolveFilePath(r.cas_hash, r.ext);
        if (casPath && fs.existsSync(casPath)) {
          seen.add(r.sticker_id);
          list.push({
            id: r.sticker_id,
            name: r.name || r.sticker_id,
            packId: r.pack_id || null,
            ext: r.ext,
            casUri: `onicord-media://cas/${r.cas_hash}.${r.ext}`,
            localPath: casPath.replace(/\\/g, "/"),
          });
        }
      }

      // Fallback scan of legacy stickers/ folder if any file wasn't in DB yet
      if (fs.existsSync(this.stickersDir)) {
        const files = await fsPromises.readdir(this.stickersDir);
        for (const file of files) {
          const ext = path.extname(file).slice(1).toLowerCase();
          if (!["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) continue;
          const id = path.basename(file, `.${ext}`).trim();
          if (seen.has(id)) continue;
          const filePath = path.join(this.stickersDir, file);
          list.push({
            id,
            ext,
            localPath: filePath.replace(/\\/g, "/"),
          });
        }
      }

      return list;
    } catch (err) {
      console.error("❌ [Sticker Service Error] La lista de stickers falló:", err.message);
      return [];
    }
  }

  async deleteStickerLocal(id, ext) {
    try {
      const cleanId = String(id || "").trim();
      const info = this._db()
        .prepare("DELETE FROM stickers WHERE sticker_id = ?")
        .run(cleanId);

      const filePath = path.join(this.stickersDir, `${cleanId}.${ext}`);
      if (fs.existsSync(filePath)) {
        await fsPromises.unlink(filePath);
        return true;
      }
      return info.changes > 0;
    } catch (err) {
      console.error("[Sticker Service Error] Falló deleteStickerLocal:", err);
      throw err;
    }
  }

  async downloadAndInstallStickerPack(downloadUrl, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`[Sticker Service] Descargando pack de stickers desde: ${downloadUrl}`);
      const response = await fetch(downloadUrl, { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return await this.importStickerPackRaw(Buffer.from(arrayBuffer));
    } catch (err) {
      clearTimeout(timer);
      console.error("[Sticker Service Error] Descarga remota de sticker pack falló:", err.message);
      throw err;
    }
  }
}

const defaultInstance = new StickerService();
defaultInstance.StickerService = StickerService;
module.exports = defaultInstance;
