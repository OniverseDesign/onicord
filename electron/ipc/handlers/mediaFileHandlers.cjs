const { app, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const crypto = require("crypto");
const mediaScannerService = require("../../services/mediaScannerService.cjs");
const stickerService = require("../../services/stickerService.cjs");
const ytdlpService = require("../../services/ytdlpService.cjs");

function getDownloadsRegistryPath() {
  return path.join(app.getPath("userData"), "downloads.json");
}

async function saveDownloadToRegistry(fileId, targetPath) {
  try {
    const registryPath = getDownloadsRegistryPath();
    let registry = {};
    if (fs.existsSync(registryPath)) {
      const raw = await fsPromises.readFile(registryPath, "utf8");
      registry = JSON.parse(raw);
    }
    registry[String(fileId)] = {
      localPath: String(targetPath),
      savedAt: Date.now(),
    };
    await fsPromises.writeFile(
      registryPath,
      JSON.stringify(registry, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("Error al registrar descarga local:", err.message);
  }
}

function registerMediaFileHandlers() {
  // === Files & Ares P2P ===
  ipcMain.handle("files:processDroppedMeta", async (_event, roomCode, filePath) => {
    const targetCode = roomCode || global.roomManager?.roomCode;
    if (!global.roomManager || !targetCode)
      throw new Error("No hay sala activa");
    const fp = String(filePath || "");
    const stat = await fsPromises.stat(fp);
    const name = path.basename(fp);
    const id = crypto.randomUUID();

    const record = {
      id,
      name,
      size: stat.size,
      uploadedAt: Date.now(),
      updatedAt: Date.now(),
      realPath: fp,
      ownerId: global.roomManager.profile?.id || null,
    };
    await global.roomManager.fileIndexStore.merge(targetCode, [record]);

    global.mainWindow?.webContents.send("sync:complete", {
      type: "file_upload",
      id,
    });
    return { id, name, size: stat.size };
  });

  ipcMain.handle("files:uploadClipboardImage", async (_event, roomCode, arrayBuffer) => {
    const targetCode = roomCode || global.roomManager?.roomCode;
    if (!global.roomManager || !targetCode)
      throw new Error("No hay sala activa");

    try {
      const buffer = Buffer.from(arrayBuffer);
      const tempDir = path.join(app.getPath("userData"), "temp_uploads");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const fileName = `Clipboard_Capture_${Date.now()}.png`;
      const fp = path.join(tempDir, fileName);
      fs.writeFileSync(fp, buffer);

      const stat = await fsPromises.stat(fp);
      const id = crypto.randomUUID();

      const record = {
        id,
        name: fileName,
        size: stat.size,
        uploadedAt: Date.now(),
        updatedAt: Date.now(),
        realPath: fp,
        ownerId: global.roomManager.profile?.id || null,
      };

      await global.roomManager.fileIndexStore.merge(targetCode, [record]);
      console.log(`[ARES CLIPBOARD] Captura guardada e indexada con éxito. ID: ${id}`);
      global.mainWindow?.webContents.send("sync:complete", {
        type: "file_upload",
        id,
      });
      return { id, name: fileName, size: stat.size };
    } catch (err) {
      console.error("[ARES CLIPBOARD ERROR] Falló el procesamiento binario:", err.message);
      throw err;
    }
  });

  ipcMain.handle("files:selectFileMeta", async (_event, roomCode) => {
    const targetCode = roomCode || global.roomManager?.roomCode;
    if (!global.roomManager || !targetCode)
      throw new Error("No hay sala activa");
    const result = await dialog.showOpenDialog(global.mainWindow, {
      title: "Seleccionar archivo",
      properties: ["openFile"],
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    const fp = result.filePaths[0];
    const stat = await fsPromises.stat(fp);
    const name = path.basename(fp);
    const id = crypto.randomUUID();
    const record = {
      id,
      name,
      size: stat.size,
      uploadedAt: Date.now(),
      updatedAt: Date.now(),
      realPath: fp,
      ownerId: global.roomManager.profile?.id || null,
    };
    await global.roomManager.fileIndexStore.merge(targetCode, [record]);

    global.mainWindow?.webContents.send("sync:complete", {
      type: "file_upload",
      id,
    });

    return { id, name, size: stat.size };
  });

  ipcMain.handle("files:download", async (_event, roomCode, fileId, fileName, fileSize) => {
    const targetCode = roomCode || global.roomManager?.roomCode;
    if (!global.roomManager || !targetCode)
      throw new Error("No hay sala activa");
    const defaultName = fileName ? String(fileName) : "archivo";
    const result = await dialog.showSaveDialog(global.mainWindow, {
      title: "Save received file",
      defaultPath: path.join(app.getPath("downloads"), defaultName),
    });
    if (result.canceled || !result.filePath) return { canceled: true };

    const downloadResult = await global.roomManager.requestFileDownload(
      String(fileId),
      result.filePath,
      defaultName,
      Number(fileSize) || 0
    );
    if (downloadResult && !downloadResult.error) {
      await saveDownloadToRegistry(String(fileId), result.filePath);
      global.mainWindow?.webContents.send("file:progress", {
        fileId: String(fileId),
        progress: 100,
        done: true,
        localPath: result.filePath,
      });
    }
    return downloadResult;
  });

  ipcMain.handle("files:cancel", async (_event, fileId) => {
    if (!global.roomManager) return { canceled: false };
    return global.roomManager.cancelFileDownload(fileId);
  });

  ipcMain.handle("files:getLocalPath", (_event, fileId) => {
    try {
      const id = String(fileId || "");
      const registryPath = getDownloadsRegistryPath();
      if (!fs.existsSync(registryPath)) return null;

      const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
      const fileRecord = registry[id];
      if (fileRecord && fs.existsSync(fileRecord.localPath))
        return fileRecord.localPath;
      return null;
    } catch (err) {
      return null;
    }
  });

  ipcMain.handle("files:getUploadedLocalPath", async (_event, roomCode, fileId) => {
    const targetCode = roomCode || global.roomManager?.roomCode;
    if (!global.roomManager || !targetCode || !global.roomManager.fileIndexStore)
      return null;
    try {
      const id = String(fileId || "").trim();
      const records = await global.roomManager.fileIndexStore.load(targetCode);
      const localFileMeta = records.find((f) => f.id === id);

      if (
        localFileMeta &&
        localFileMeta.realPath &&
        fs.existsSync(localFileMeta.realPath)
      ) {
        return localFileMeta.realPath;
      }
      return null;
    } catch (err) {
      console.error("[Node Upload Paths Error]:", err.message);
      return null;
    }
  });

  ipcMain.handle("dashboard:getRecentFiles", async (_event, roomCode) => {
    try {
      const targetCode = roomCode || global.roomManager?.roomCode;
      if (!global.roomManager || !targetCode || !global.roomManager.fileIndexStore)
        return [];

      const records = await global.roomManager.fileIndexStore.load(targetCode);
      return records.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));
    } catch (err) {
      return [];
    }
  });

  ipcMain.handle("stream:get-sources", async () => {
    return mediaScannerService.getSources();
  });

  // === Stickers ===
  ipcMain.handle("save-sticker-local", async (event, { id, ext, base64Data }) => {
    return stickerService.saveStickerLocal({ id, ext, base64Data });
  });

  ipcMain.handle("get-sticker-path", async (event, id) => {
    const existing = await stickerService.getStickerPath(id);
    if (existing) return existing;
    if (id && global.roomManager?.chatService) {
      global.roomManager.chatService.requestSticker(id);
    }
    return null;
  });

  ipcMain.handle("request-sticker", async (event, { id, ext } = {}) => {
    if (id && global.roomManager?.chatService) {
      global.roomManager.chatService.requestSticker(id, ext);
      return { requested: true };
    }
    return { requested: false };
  });

  ipcMain.handle("export-sticker-pack", async (event, { packName, stickersList }) => {
    return stickerService.exportStickerPack(packName, stickersList, global.roomManager);
  });

  ipcMain.handle("import-sticker-pack-raw", async (event, argumentData) => {
    return stickerService.importStickerPackRaw(argumentData);
  });

  ipcMain.handle("list-local-stickers", async () => {
    return stickerService.listLocalStickers();
  });

  ipcMain.handle("delete-sticker-local", async (event, { id, ext }) => {
    return stickerService.deleteStickerLocal(id, ext);
  });

  ipcMain.handle("stickers:download-install", async (_event, downloadUrl) => {
    return stickerService.downloadAndInstallStickerPack(downloadUrl);
  });

  // === Music / YT-DLP ===
  ipcMain.on("music:process-auto-queue-track", (_ev, subUrl) => {
    ytdlpService.iniciarExtraccionTradicional(subUrl, true, () => {});
  });

  ipcMain.handle("music:abort-all-downloads", async () => {
    ytdlpService.abortAllMusicDownloads();
    return { success: true };
  });

  ipcMain.handle("music:extract-track", async (event, videoUrl) => {
    return ytdlpService.extractTrack(videoUrl);
  });

  ipcMain.handle("music:resolve-prepare", async (event, videoUrl) => {
    return ytdlpService.resolveAndPrepareStream(videoUrl);
  });

  ipcMain.handle("music:localize-track", async (event, track) => {
    return ytdlpService.localizeTrack(track);
  });

  ipcMain.handle("music:broadcast-state", async (_event, channelId, state, roomCode) => {
    global.roomManager?.broadcastMusicState(channelId, state, roomCode);
    return { success: true };
  });

  ipcMain.handle("music:send-command", async (_event, channelId, command, roomCode) => {
    global.roomManager?.sendMusicCommand(channelId, command, roomCode);
    return { success: true };
  });

  // === Watch Party Sincronizada P2P ===
  ipcMain.handle("watch-party:broadcast-state", async (_event, channelId, state, roomCode) => {
    global.roomManager?.broadcastWatchPartyState(channelId, state, roomCode);
    return { success: true };
  });

  ipcMain.handle("watch-party:send-command", async (_event, channelId, command, roomCode) => {
    global.roomManager?.sendWatchPartyCommand(channelId, command, roomCode);
    return { success: true };
  });
}

module.exports = { registerMediaFileHandlers };
