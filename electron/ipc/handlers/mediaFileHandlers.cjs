const { app, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const crypto = require("crypto");
const mediaScannerService = require("../../services/mediaScannerService.cjs");
const stickerService = require("../../services/stickerService.cjs");
const ytdlpService = require("../../services/ytdlpService.cjs");
const { DbManager } = require("../../storage/dbManager.cjs");

async function saveDownloadToRegistry(fileId, targetPath, sourceRoomCode = null) {
  try {
    const appConfigDb = DbManager.getInstance(app.getPath("userData")).getGlobalDb("app_config");
    let size = 0;
    try {
      if (fs.existsSync(targetPath)) size = fs.statSync(targetPath).size;
    } catch {}
    appConfigDb
      .prepare(`
        INSERT OR REPLACE INTO downloads (
          download_id, file_name, file_path, size_bytes, mime_type, source_room_code, downloaded_at
        ) VALUES (?, ?, ?, ?, NULL, ?, ?)
      `)
      .run(
        String(fileId),
        path.basename(String(targetPath)),
        String(targetPath),
        size,
        sourceRoomCode || global.roomManager?.roomCode || null,
        Date.now()
      );
  } catch (err) {
    console.error("Error al registrar descarga local en app_config.db:", err.message);
  }
}

function migrateLegacyDownloadsJson(userDataPath) {
  try {
    const jsonPath = path.join(userDataPath, "downloads.json");
    if (!fs.existsSync(jsonPath)) return;
    const raw = fs.readFileSync(jsonPath, "utf8");
    const data = JSON.parse(raw);
    const db = DbManager.getInstance(userDataPath).getGlobalDb("app_config");
    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO downloads (
        download_id, file_name, file_path, size_bytes, mime_type, source_room_code, downloaded_at
      ) VALUES (?, ?, ?, ?, NULL, NULL, ?)
    `);

    db.transaction(() => {
      for (const [id, entry] of Object.entries(data)) {
        if (!entry || !entry.localPath) continue;
        const filePath = String(entry.localPath);
        if (!fs.existsSync(filePath)) continue;
        let size = 0;
        try { size = fs.statSync(filePath).size; } catch {}
        insertStmt.run(
          String(id),
          path.basename(filePath),
          filePath,
          size,
          entry.savedAt || Date.now()
        );
      }
    })();
    console.log("[ARES MIGRATION] Migradas descargas previas de downloads.json a app_config.db");
  } catch (err) {
    console.warn("[ARES MIGRATION] Error migrando downloads.json:", err.message);
  }
}

function registerMediaFileHandlers() {
  migrateLegacyDownloadsJson(app.getPath("userData"));

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
    await global.roomManager.fileIndexStore.merge(targetCode, [record], { isLocal: true });
    await saveDownloadToRegistry(id, fp, targetCode);

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

      await global.roomManager.fileIndexStore.merge(targetCode, [record], { isLocal: true });
      await saveDownloadToRegistry(id, fp, targetCode);
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
    await global.roomManager.fileIndexStore.merge(targetCode, [record], { isLocal: true });
    await saveDownloadToRegistry(id, fp, targetCode);

    global.mainWindow?.webContents.send("sync:complete", {
      type: "file_upload",
      id,
    });

    return { id, name, size: stat.size };
  });

  ipcMain.handle("files:selectDownloadDirectory", async () => {
    const result = await dialog.showOpenDialog(global.mainWindow, {
      title: "Seleccionar carpeta de descargas",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("files:getDefaultDownloadDirectory", () => {
    return app.getPath("downloads");
  });

  ipcMain.handle("files:download", async (_event, roomCode, fileId, fileName, fileSize, options = {}) => {
    const targetCode = roomCode || global.roomManager?.roomCode;
    if (!global.roomManager || !targetCode)
      throw new Error("No hay sala activa");
    const id = String(fileId || "");
    const safeFileName =
      path.basename(String(fileName || "archivo")).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") || "archivo";
    const defaultName = safeFileName;

    // 1. Check historical download cache (app_config.db -> downloads)
    try {
      const appConfigDb = DbManager.getInstance(app.getPath("userData")).getGlobalDb("app_config");
      const fileRecord = appConfigDb
        .prepare("SELECT file_path FROM downloads WHERE download_id = ?")
        .get(id);
      if (fileRecord && fileRecord.file_path && fs.existsSync(fileRecord.file_path)) {
        console.log(`[ARES DOWNLOAD] Archivo ${id} ya existe localmente en: ${fileRecord.file_path}. Omitiendo re-descarga.`);
        global.mainWindow?.webContents.send("file:progress", {
          fileId: id,
          progress: 100,
          done: true,
          localPath: fileRecord.file_path,
        });
        return { done: true, filePath: fileRecord.file_path, alreadyExists: true };
      }
    } catch (regErr) {
      console.warn("[ARES DOWNLOAD] Error verificando registry previo:", regErr.message);
    }

    // 1b. Fallback a downloads.json
    try {
      const legacyPath = path.join(app.getPath("userData"), "downloads.json");
      if (fs.existsSync(legacyPath)) {
        const legacy = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
        if (legacy[id]?.localPath && fs.existsSync(legacy[id].localPath)) {
          console.log(`[ARES DOWNLOAD] Archivo ${id} hallado en downloads.json: ${legacy[id].localPath}. Migrando a app_config.db y omitiendo re-descarga.`);
          await saveDownloadToRegistry(id, legacy[id].localPath, targetCode);
          global.mainWindow?.webContents.send("file:progress", {
            fileId: id,
            progress: 100,
            done: true,
            localPath: legacy[id].localPath,
          });
          return { done: true, filePath: legacy[id].localPath, alreadyExists: true };
        }
      }
    } catch (_) {}

    // 2. Check local user uploads cache (fileIndexStore)
    if (global.roomManager?.fileIndexStore) {
      try {
        const records = await global.roomManager.fileIndexStore.load(targetCode);
        const localFileMeta = records.find((f) => f.id === id);
        if (localFileMeta && localFileMeta.realPath && fs.existsSync(localFileMeta.realPath)) {
          console.log(`[ARES DOWNLOAD] Archivo ${id} subido localmente ya existe en: ${localFileMeta.realPath}. Reutilizando.`);
          await saveDownloadToRegistry(id, localFileMeta.realPath, targetCode);
          global.mainWindow?.webContents.send("file:progress", {
            fileId: id,
            progress: 100,
            done: true,
            localPath: localFileMeta.realPath,
          });
          return { done: true, filePath: localFileMeta.realPath, alreadyExists: true };
        }
      } catch (storeErr) {
        console.warn("[ARES DOWNLOAD] Error verificando fileIndexStore previo:", storeErr.message);
      }
    }

    let targetFilePath;
    const downloadDir =
      options?.customDir && fs.existsSync(options.customDir)
        ? options.customDir
        : app.getPath("downloads");

    if (!fs.existsSync(downloadDir)) {
      try {
        fs.mkdirSync(downloadDir, { recursive: true });
      } catch (_) {}
    }

    if (options?.autoDownload) {
      // 1c. Evitar re-descargas redundantes: si el archivo con el nombre original ya existe en downloads con el mismo tamaño
      const defaultCandidate = path.join(downloadDir, defaultName);
      if (fs.existsSync(defaultCandidate)) {
        let sizeMatches = true;
        const expectedBytes = Number(fileSize) || 0;
        if (expectedBytes > 0) {
          try {
            sizeMatches = fs.statSync(defaultCandidate).size === expectedBytes;
          } catch (_) {
            sizeMatches = false;
          }
        }
        if (sizeMatches) {
          console.log(`[ARES DOWNLOAD] Archivo ${id} (${defaultName}) ya existe físicamente en ${defaultCandidate} con tamaño coincidente (${expectedBytes} bytes). Omitiendo re-descarga y registrando.`);
          await saveDownloadToRegistry(id, defaultCandidate, targetCode);
          global.mainWindow?.webContents.send("file:progress", {
            fileId: id,
            progress: 100,
            done: true,
            localPath: defaultCandidate,
          });
          return { done: true, filePath: defaultCandidate, alreadyExists: true };
        }
      }

      let candidate = defaultCandidate;
      let count = 1;
      const ext = path.extname(defaultName);
      const base = path.basename(defaultName, ext);
      while (fs.existsSync(candidate)) {
        candidate = path.join(downloadDir, `${base} (${count})${ext}`);
        count++;
      }
      targetFilePath = candidate;
    } else {
      const result = await dialog.showSaveDialog(global.mainWindow, {
        title: "Save received file",
        defaultPath: path.join(downloadDir, defaultName),
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      targetFilePath = result.filePath;
    }

    const downloadResult = await global.roomManager.requestFileDownload(
      String(fileId),
      targetFilePath,
      defaultName,
      Number(fileSize) || 0,
      options
    );
    if (downloadResult && !downloadResult.error) {
      await saveDownloadToRegistry(String(fileId), targetFilePath, targetCode);
      global.mainWindow?.webContents.send("file:progress", {
        fileId: String(fileId),
        progress: 100,
        done: true,
        localPath: targetFilePath,
      });
    }
    return downloadResult;
  });

  ipcMain.handle("files:cancel", async (_event, fileId) => {
    if (!global.roomManager) return { canceled: false };
    return global.roomManager.cancelFileDownload(fileId);
  });

  ipcMain.handle("files:getLocalPath", async (_event, fileId, roomCode) => {
    try {
      const id = String(fileId || "").trim();
      if (!id) return null;

      // 1. Consultar historial de descargas (app_config.db -> downloads)
      try {
        const appConfigDb = DbManager.getInstance(app.getPath("userData")).getGlobalDb("app_config");
        const fileRecord = appConfigDb
          .prepare("SELECT file_path FROM downloads WHERE download_id = ?")
          .get(id);
        if (fileRecord && fileRecord.file_path && fs.existsSync(fileRecord.file_path)) {
          return fileRecord.file_path;
        }
      } catch (err) {
        console.warn("[files:getLocalPath] Error consultando app_config.db:", err.message);
      }

      // 2. Fallback legacy downloads.json
      try {
        const registryPath = path.join(app.getPath("userData"), "downloads.json");
        if (fs.existsSync(registryPath)) {
          const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
          const fileRecord = registry[id];
          if (fileRecord && fileRecord.localPath && fs.existsSync(fileRecord.localPath)) {
            await saveDownloadToRegistry(id, fileRecord.localPath, roomCode);
            return fileRecord.localPath;
          }
        }
      } catch (_) {}

      // 3. Query local user upload index (fileIndexStore)
      const targetCode = roomCode || global.roomManager?.roomCode;
      if (global.roomManager?.fileIndexStore && targetCode) {
        try {
          const records = await global.roomManager.fileIndexStore.load(targetCode);
          const localFileMeta = records.find((f) => f.id === id);
          if (localFileMeta && localFileMeta.realPath && fs.existsSync(localFileMeta.realPath)) {
            return localFileMeta.realPath;
          }
        } catch (_) {}
      }

      return null;
    } catch (err) {
      return null;
    }
  });

  ipcMain.handle("files:getUploadedLocalPath", async (_event, roomCode, fileId) => {
    const targetCode = roomCode || global.roomManager?.roomCode;
    try {
      const id = String(fileId || "").trim();
      if (!id) return null;

      // 1. Check fileIndexStore for current room
      if (global.roomManager?.fileIndexStore && targetCode) {
        try {
          const records = await global.roomManager.fileIndexStore.load(targetCode);
          const localFileMeta = records.find((f) => f.id === id);

          if (
            localFileMeta &&
            localFileMeta.realPath &&
            fs.existsSync(localFileMeta.realPath)
          ) {
            return localFileMeta.realPath;
          }
        } catch (_) {}
      }

      // 2. Check app_config.db downloads table (auto-seeds uploads and downloads)
      try {
        const appConfigDb = DbManager.getInstance(app.getPath("userData")).getGlobalDb("app_config");
        const row = appConfigDb
          .prepare("SELECT file_path FROM downloads WHERE download_id = ?")
          .get(id);
        if (row && row.file_path && fs.existsSync(row.file_path)) {
          return row.file_path;
        }
      } catch (_) {}

      // 3. Fallback check across all joined rooms in fileIndexStore
      if (global.roomManager?.fileIndexStore && global.roomManager.p2pService?.joinedRooms) {
        for (const room of global.roomManager.p2pService.joinedRooms) {
          if (room === targetCode) continue;
          try {
            const records = await global.roomManager.fileIndexStore.load(room);
            const localFileMeta = records.find((f) => f.id === id);
            if (
              localFileMeta &&
              localFileMeta.realPath &&
              fs.existsSync(localFileMeta.realPath)
            ) {
              return localFileMeta.realPath;
            }
          } catch (_) {}
        }
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
  ipcMain.handle("save-sticker-local", async (event, payload) => {
    if (!payload) return false;
    let { id, ext, base64Data, dataUrl, filename } = payload;
    if (dataUrl && !base64Data) {
      base64Data = dataUrl;
    }
    if (filename && (!id || !ext)) {
      const parts = filename.split(".");
      ext = ext || (parts.length > 1 ? parts.pop().toLowerCase() : "png");
      const baseName = parts.join(".");
      const sanitized = baseName.replace(/[^a-zA-Z0-9_-]/g, "_");
      id = id || (sanitized || `sticker_${Date.now()}`);
    }
    if (!id) id = `sticker_${Date.now()}`;
    if (!ext) ext = "png";
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

  ipcMain.handle("delete-sticker-local", async (event, data) => {
    const id = typeof data === "string" ? data : data?.id;
    const ext = typeof data === "object" && data !== null ? data?.ext : undefined;
    if (!id) return false;
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

  // === Motor Torrent Nativo P2P ===
  const torrentService = require("../../services/torrentService.cjs");

  ipcMain.handle("torrent:get-stream-url", async (_event, { infoHash, fileIdx = 0, trackers = [] } = {}) => {
    const cleanHash = String(infoHash || "").trim().toLowerCase();
    if (!/^[a-f0-9]{40}$/.test(cleanHash)) {
      throw new Error("Invalid torrent infoHash");
    }
    const port = ytdlpService.streamPort || 42883;
    const params = new URLSearchParams();
    if (Array.isArray(trackers)) {
      for (const tr of trackers) {
        if (typeof tr === "string") {
          const cleanTr = tr.replace(/^tracker:/i, "").trim();
          if (cleanTr.startsWith("udp://") || cleanTr.startsWith("http://") || cleanTr.startsWith("https://") || cleanTr.startsWith("wss://")) {
            params.append("tr", cleanTr);
          }
        }
      }
    }
    const qs = params.toString();
    return `http://127.0.0.1:${port}/torrent/${cleanHash}/${fileIdx}${qs ? `?${qs}` : ""}`;
  });

  ipcMain.handle("torrent:stop", async (_event, infoHash) => {
    if (infoHash) {
      torrentService.destroyEngine(infoHash);
    } else {
      torrentService.destroyAll();
    }
    return { success: true };
  });
}

module.exports = { registerMediaFileHandlers };
