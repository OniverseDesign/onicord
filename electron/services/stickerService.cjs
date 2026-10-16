const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { app } = require("electron");

class StickerService {
  constructor() {
    this.stickersDir = path.join(app.getPath("userData"), "stickers");
    this.packsDir = path.join(app.getPath("userData"), "sticker_packs");
    this.ensureDirs();
  }

  ensureDirs() {
    [this.stickersDir, this.packsDir].forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async saveStickerLocal({ id, ext, base64Data }) {
    try {
      const filePath = path.join(this.stickersDir, `${id}.${ext}`);
      if (fs.existsSync(filePath)) return true;

      if (!base64Data || typeof base64Data !== "string" || !base64Data.includes(",")) {
        console.warn(`[Sticker Service] Se intentó guardar el sticker ${id} pero la data Base64 es inválida.`);
        return false;
      }

      const parts = base64Data.split(",");
      if (!parts[1]) return false;

      const buffer = Buffer.from(parts[1], "base64");
      await fsPromises.writeFile(filePath, buffer);
      return true;
    } catch (err) {
      console.error("[Sticker Service Error] Falló saveStickerLocal:", err);
      throw err;
    }
  }

  async getStickerPath(id) {
    try {
      const extensions = ["png", "jpg", "gif", "webp", "jpeg"];
      for (const ext of extensions) {
        const filePath = path.join(this.stickersDir, `${id}.${ext}`);
        if (fs.existsSync(filePath)) {
          return filePath.replace(/\\/g, "/");
        }
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  async exportStickerPack(packName, stickersList, roomManager, authorName = null, iconName = null) {
    try {
      console.log(`[Sticker Export P2P] Empaquetando grupo: "${packName}"...`);
      const packRaw = {
        version: "1.0",
        name: packName,
        author: authorName || roomManager?.profile?.nickname || null,
        iconName: iconName || null,
        stickers: [],
      };

      for (const stk of stickersList) {
        const filePath = path.join(this.stickersDir, `${stk.id}.${stk.ext}`);
        if (fs.existsSync(filePath)) {
          const bitmap = await fsPromises.readFile(filePath);
          packRaw.stickers.push({
            id: stk.id,
            name: stk.name,
            ext: stk.ext,
            base64: `data:image/${stk.ext};base64,${bitmap.toString("base64")}`,
          });
        }
      }

      const fileName = `${packName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.opk`;
      const finalPath = path.join(this.packsDir, fileName);

      const stringifiedPack = JSON.stringify(packRaw);
      await fsPromises.writeFile(finalPath, stringifiedPack, "utf8");

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
        console.log(`[Sticker Export P2P] Registrado en Ares Server con ID: ${generatedFileId}`);
      }

      return {
        finalPath,
        fileName,
        fileId: generatedFileId,
        size: stringifiedPack.length,
      };
    } catch (err) {
      console.error("[Sticker Service Error] Falló exportStickerPack:", err);
      throw err;
    }
  }

  async importStickerPackRaw(argumentData) {
    try {
      let pack = null;
      let rawContentToSave = "";

      if (typeof argumentData === "string" && argumentData.trim().startsWith("{")) {
        rawContentToSave = argumentData;
        pack = JSON.parse(argumentData);
      } else {
        if (!fs.existsSync(argumentData)) {
          throw new Error(`No se encontró el archivo temporal: ${argumentData}`);
        }
        rawContentToSave = await fsPromises.readFile(argumentData, "utf8");
        pack = JSON.parse(rawContentToSave);
      }

      if (!pack || !pack.name || !pack.stickers || !Array.isArray(pack.stickers)) {
        throw new Error("Estructura de pack de stickers inválida o corrupta.");
      }

      for (const stk of pack.stickers) {
        if (!stk?.id) continue;

        const cleanStickerId = String(stk.id).trim();
        const extensionFinal = stk.ext || "png";
        const filePathStk = path.join(this.stickersDir, `${cleanStickerId}.${extensionFinal}`);

        if (!stk.base64) {
          continue;
        }

        const base64Parts = stk.base64.split(",");
        const targetBufferString = base64Parts[1] || base64Parts[0];
        const buffer = Buffer.from(targetBufferString, "base64");

        await fsPromises.writeFile(filePathStk, buffer);
      }

      const packIndiceAlivianado = {
        version: pack.version || "1.0",
        name: pack.name,
        author: pack.author || null,
        iconName: pack.iconName || null,
        stickers: pack.stickers.map((stk) => ({
          id: String(stk.id).trim(),
          name: stk.name,
          ext: stk.ext || "png",
        })),
      };

      const cleanPackName = pack.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const finalPackPath = path.join(this.packsDir, `${cleanPackName}.opk`);

      await fsPromises.writeFile(
        finalPackPath,
        JSON.stringify(packIndiceAlivianado, null, 2),
        "utf8"
      );

      if (global.mainWindow && !global.mainWindow.webContents.isDestroyed()) {
        global.mainWindow.webContents.send("sync:complete", {
          type: "sticker_pack_imported",
          name: pack.name,
        });
      }

      console.log(`✨ [Sticker Service] Pack "${pack.name}" indexado con éxito.`);
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
      if (!fs.existsSync(this.stickersDir)) return [];

      const files = await fsPromises.readdir(this.stickersDir);
      let list = [];

      for (const file of files) {
        const ext = path.extname(file).slice(1).toLowerCase();
        if (!["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) continue;

        const id = path.basename(file, `.${ext}`);
        const filePath = path.join(this.stickersDir, file);

        list.push({
          id: String(id).trim(),
          ext: ext,
          localPath: filePath.replace(/\\/g, "/"),
        });
      }

      return list;
    } catch (err) {
      console.error("❌ [Sticker Service Error] La lista de stickers falló:", err.message);
      return [];
    }
  }

  async deleteStickerLocal(id, ext) {
    try {
      const filePath = path.join(this.stickersDir, `${id}.${ext}`);
      if (fs.existsSync(filePath)) {
        await fsPromises.unlink(filePath);
        return true;
      }
      return false;
    } catch (err) {
      console.error("[Sticker Service Error] Falló deleteStickerLocal:", err);
      throw err;
    }
  }

  async downloadAndInstallStickerPack(downloadUrl, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`[Sticker Service] Descargando pack de stickers desde: ${downloadUrl}`);
      const response = await fetch(downloadUrl, { signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const jsonText = await response.text();
      return await this.importStickerPackRaw(jsonText);
    } catch (err) {
      clearTimeout(timer);
      console.error("[Sticker Service Error] Descarga remota de sticker pack falló:", err.message);
      throw err;
    }
  }
}

module.exports = new StickerService();
