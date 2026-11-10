const net = require("net");
const fs = require("fs");
const path = require("path");
const { encodeMessage } = require("./p2pService.cjs");

const BLOCK_SIZE = 512 * 1024; // 512 KB per block
const MAX_INFLIGHT_PER_PEER = 2;

const LISTA_NEGRA = [
  ".js",
  ".cjs",
  ".mjs",
  ".vbs",
  ".bat",
  ".cmd",
  ".exe",
  ".sh",
  ".lnk",
  ".html",
];

class FileService {
  constructor(p2pService, fileIndexStore, userDataPath, roomMetaStore = null) {
    this.p2p = p2pService;
    this.fileIndexStore = fileIndexStore;
    this.userDataPath = userDataPath;
    this.roomMetaStore = roomMetaStore;

    this.fileServerPort = 0;
    this.fileServer = null;
    this.roomCode = null;

    this._activeDownloads = new Map();
    this._activeUploads = new Map();
    this._readHandles = new Map(); // realPath -> { handle, openPromise, activeReads, timer }
  }

  setRoomCode(roomCode) {
    this.roomCode = roomCode;
  }

  async _isExecutableAllowed() {
    try {
      if (!this.roomCode) return false;
      let metaStore = this.roomMetaStore;
      if (!metaStore && this.userDataPath) {
        const { RoomMetaStore } = require("../p2p/roomMetaStore.cjs");
        metaStore = new RoomMetaStore(this.userDataPath);
        this.roomMetaStore = metaStore;
      }
      if (metaStore) {
        const meta = await metaStore.load(this.roomCode);
        return Boolean(meta?.allowExecutableFiles);
      }
    } catch {}
    return false;
  }

  async _resolveLocalFilePath(fileId) {
    if (!fileId) return null;
    const cleanFileId = String(fileId).trim();
    let candidatePath = null;

    // 1. Check fileIndexStore for current room
    try {
      if (this.roomCode && this.fileIndexStore) {
        const records = await this.fileIndexStore.load(this.roomCode);
        const fileMeta = records.find((f) => f.id === cleanFileId);
        if (fileMeta?.realPath && fs.existsSync(fileMeta.realPath)) {
          candidatePath = fileMeta.realPath;
        }
      }
    } catch {}

    // 2. Check app_config.db downloads table (auto-seeding for any peer who already downloaded the file)
    if (!candidatePath && this.userDataPath) {
      try {
        const { DbManager } = require("../storage/dbManager.cjs");
        const appConfigDb = DbManager.getInstance(this.userDataPath).getGlobalDb("app_config");
        const row = appConfigDb
          .prepare("SELECT file_path FROM downloads WHERE download_id = ?")
          .get(cleanFileId);
        if (row?.file_path && fs.existsSync(row.file_path)) {
          candidatePath = row.file_path;
        }
      } catch {}
    }

    if (!candidatePath) return null;

    // 3. Enforce dangerous extension blacklist unless allowExecutableFiles === true
    const ext = path.extname(candidatePath).toLowerCase();
    if (LISTA_NEGRA.includes(ext)) {
      const allowExec = await this._isExecutableAllowed();
      if (!allowExec) {
        console.warn(
          `🚨 Ares blocked an attempt to extract a dangerous file: ${ext}`
        );
        return null;
      }
    }

    return candidatePath;
  }

  initFileServer() {
    if (this.fileServer !== null || this.fileServerPort > 0) {
      console.log(
        `[Onishare SECURE] Reusing existing P2P server on port: ${this.fileServerPort}`
      );
      return;
    }

    this.fileServer = net.createServer((socket) => {
      let fileId = null;
      let readStream = null;
      socket.setTimeout(15000);

      socket.on("data", async (data) => {
        if (!fileId) {
          fileId = data.toString("utf8").trim().slice(0, 128);
          if (!/^[0-9a-fA-F-]{36}$/.test(fileId)) {
            socket.write("ERROR: INVALID_ID\n");
            socket.end();
            return;
          }
          try {
            if (!this.roomCode || !this.fileIndexStore) {
              socket.write("ERROR: NO_ROOM_OR_STORE\n");
              socket.end();
              return;
            }

            const realPath = await this._resolveLocalFilePath(fileId);
            if (!realPath) {
              socket.write("ERROR: FILE_NOT_FOUND\n");
              socket.end();
              return;
            }

            readStream = fs.createReadStream(realPath, {
              highWaterMark: 64 * 1024,
            });
            readStream.pipe(socket);
          } catch (err) {
            socket.write(`ERROR: ${err.message}\n`);
            socket.end();
          }
        }
      });

      socket.on("timeout", () => {
        try {
          socket.end();
          socket.destroy();
        } catch {}
        if (readStream) readStream.destroy();
      });

      socket.on("error", () => {
        if (readStream) readStream.destroy();
      });
    });

    this.fileServer.listen(0, "127.0.0.1", () => {
      this.fileServerPort = this.fileServer.address().port;
      console.log(
        `[ARES SERVER] P2P file server ready on port: ${this.fileServerPort}`
      );
    });
  }

  _recordDownload(fileId, targetPath) {
    try {
      const { DbManager } = require("../storage/dbManager.cjs");
      const appConfigDb = DbManager.getInstance(this.userDataPath).getGlobalDb("app_config");
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
          this.roomCode || null,
          Date.now()
        );
      console.log(`[ARES REGISTRY P2P] Indexado en app_config.db con éxito: ${fileId} -> ${targetPath}`);
    } catch (err) {
      console.error("[ARES REGISTRY ERROR] Falló al registrar en app_config.db:", err.message);
    }
  }

  async _cleanupDownloadState(fileId, dl, removeFiles = true) {
    if (!dl) return;
    if (dl.discoveryTimer) {
      clearTimeout(dl.discoveryTimer);
      dl.discoveryTimer = null;
    }
    if (dl.inflight) {
      for (const info of dl.inflight.values()) {
        if (info?.timer) clearTimeout(info.timer);
      }
      dl.inflight.clear();
    }
    if (dl.writeStream) {
      try {
        dl.writeStream.destroy();
      } catch {}
      dl.writeStream = null;
    }
    if (dl.fileHandle) {
      try {
        await dl.fileHandle.close();
      } catch {}
      dl.fileHandle = null;
    }
    this._activeDownloads.delete(fileId);
    if (removeFiles) {
      if (dl.partPath && fs.existsSync(dl.partPath)) {
        fs.unlink(dl.partPath, () => {});
      }
      if (dl.legacyStreamMode && dl.targetPath && fs.existsSync(dl.targetPath)) {
        fs.unlink(dl.targetPath, () => {});
      }
    }
  }

  async requestFileDownload(fileId, targetPath, fileName, fileSize, options = {}) {
    if (!this.roomCode) return;

    if (this._activeDownloads.has(fileId)) {
      console.log(`[ARES NETWORK] Descarga ya en curso para fileId: ${fileId}. Omitiendo solicitud duplicada.`);
      return;
    }

    try {
      const localRealPath = await this._resolveLocalFilePath(fileId);
      if (localRealPath) {
        console.log(
          `[ARES LOCAL] Archivo local detectado: ${localRealPath}`
        );
        const isAuto = Boolean(options?.autoDownload);
        const finalPath = (isAuto || targetPath === localRealPath)
          ? localRealPath
          : targetPath;

        // Only copy file physically if this is an explicit manual download to a custom destination
        if (finalPath !== localRealPath) {
          fs.copyFileSync(localRealPath, finalPath);
        }

        this._recordDownload(fileId, finalPath);

        global.mainWindow?.webContents.send("file:progress", {
          fileId,
          progress: 100,
          done: true,
          localPath: finalPath,
        });
        return { done: true, filePath: finalPath };
      }
    } catch (localErr) {
      console.error(
        "[ARES LOCAL ERROR] Verification failed:",
        localErr.message
      );
    }

    console.log(
      `[ARES NETWORK] Requesting network ports/blocks for fileId: ${fileId}`
    );

    const totalSize = Number(fileSize) || 0;
    const totalBlocks = totalSize > 0 ? Math.ceil(totalSize / BLOCK_SIZE) : 0;
    const pendingBlocks = totalBlocks > 0
      ? Array.from({ length: totalBlocks }, (_, i) => i)
      : [];

    const dl = {
      writeStream: null,
      targetPath,
      partPath: `${targetPath}.part`,
      fileHandle: null,
      fileHandlePromise: null,
      receivedBytes: 0,
      totalSize,
      abort: null,
      socket: null,
      providerPeerId: null,
      seeders: new Set(),
      missingPeers: new Set(),
      inflight: new Map(),
      completedBlocks: new Set(),
      pendingBlocks,
      totalBlocks,
      legacyStreamMode: !(totalSize > 0),
      lastProgressEmit: 0,
      finishing: false,
      discoveryTimer: null,
    };

    dl.discoveryTimer = setTimeout(() => {
      const current = this._activeDownloads.get(fileId);
      if (current === dl && dl.seeders.size === 0 && dl.receivedBytes === 0) {
        this._cleanupDownloadState(fileId, dl, true);
        global.mainWindow?.webContents.send("file:progress", {
          fileId,
          error: "Tiempo de espera agotado buscando el archivo en la sala.",
        });
      }
    }, 20000);

    this._activeDownloads.set(fileId, dl);
    this.p2p._broadcast(
      "file-request-port",
      { fileId, supportsBlocks: true, blockSize: BLOCK_SIZE },
      this.roomCode
    );
  }

  cancelFileDownload(fileId) {
    const id = String(fileId || "");
    const dl = this._activeDownloads.get(id);
    if (!dl) return { canceled: false };

    try {
      if (dl.providerPeerId) {
        this.p2p._sendToPeer(dl.providerPeerId, "file-cancel-transfer", { fileId: id });
      }
      if (dl.seeders) {
        for (const seederId of dl.seeders) {
          this.p2p._sendToPeer(seederId, "file-cancel-transfer", { fileId: id });
        }
      }

      this._cleanupDownloadState(id, dl, true);
      if (dl.targetPath && fs.existsSync(dl.targetPath)) {
        fs.unlink(dl.targetPath, () => {});
      }
      console.log(`[ARES DOWNLOAD CANCEL] Descarga de ${id} cancelada con éxito.`);
      return { canceled: true };
    } catch (err) {
      console.error("[FileService] Error aborting download:", err.message);
      return { canceled: false, error: err.message };
    }
  }

  async handleFileRequestPort(peerId, payload) {
    try {
      if (!payload?.fileId) return;
      const realPath = await this._resolveLocalFilePath(payload.fileId);

      if (!realPath) {
        this.p2p._sendToPeer(peerId, "file-response-error", {
          fileId: payload.fileId,
          error: "FILE_NOT_FOUND",
        });
        return;
      }

      if (payload.supportsBlocks) {
        const stat = await fs.promises.stat(realPath);
        this.p2p._sendToPeer(peerId, "file-seeder-offer", {
          fileId: payload.fileId,
          fileSize: stat.size,
          blockSize: payload.blockSize || BLOCK_SIZE,
        });
        return;
      }

      console.log(
        `[ARES SWARM STREAM] Opening legacy pipe WITH BACKPRESSURE for: ${path.basename(realPath)}`
      );

      const uploadKey = `${peerId}:${payload.fileId}`;
      const readStream = fs.createReadStream(realPath, {
        highWaterMark: 64 * 1024,
      });
      this._activeUploads.set(uploadKey, readStream);

      readStream.on("data", (chunk) => {
        const peer = this.p2p.peers.get(peerId);
        if (!peer || !peer.socket || peer.socket.destroyed) {
          readStream.destroy();
          this._activeUploads.delete(uploadKey);
          return;
        }

        const line = encodeMessage("file-response-chunk", {
          fileId: payload.fileId,
          binaryData: chunk.toString("base64"),
          done: false,
        });

        const canContinue = peer.socket.write(line);
        if (!canContinue) {
          readStream.pause();
          peer.socket.once("drain", () => {
            readStream.resume();
          });
        }
      });

      readStream.on("end", () => {
        this._activeUploads.delete(uploadKey);
        this.p2p._sendToPeer(peerId, "file-response-chunk", {
          fileId: payload.fileId,
          done: true,
        });
      });

      readStream.on("error", (err) => {
        this._activeUploads.delete(uploadKey);
        this.p2p._sendToPeer(peerId, "file-response-error", {
          fileId: payload.fileId,
          error: err.message,
        });
      });
    } catch (err) {
      console.error("[ARES SWARM ERROR]", err.message);
    }
  }

  handleFileSeederOffer(peerId, payload) {
    if (!payload?.fileId || !peerId) return;
    const dl = this._activeDownloads.get(payload.fileId);
    if (!dl || dl.finishing) return;

    if (dl.legacyStreamMode && Number(payload.fileSize) > 0) {
      dl.totalSize = Number(payload.fileSize);
      dl.totalBlocks = Math.ceil(dl.totalSize / BLOCK_SIZE);
      dl.pendingBlocks = Array.from({ length: dl.totalBlocks }, (_, i) => i);
      dl.legacyStreamMode = false;
    } else if (dl.totalSize === 0 && Number(payload.fileSize) === 0) {
      // Handle 0-byte empty file immediately
      dl.legacyStreamMode = false;
      dl.totalBlocks = 0;
      if (dl.discoveryTimer) {
        clearTimeout(dl.discoveryTimer);
        dl.discoveryTimer = null;
      }
      try {
        fs.writeFileSync(dl.targetPath, Buffer.alloc(0));
        this._recordDownload(payload.fileId, dl.targetPath);
        this._activeDownloads.delete(payload.fileId);
        global.mainWindow?.webContents.send("file:progress", {
          fileId: payload.fileId,
          progress: 100,
          done: true,
          localPath: dl.targetPath,
        });
      } catch {}
      return;
    }

    dl.missingPeers.delete(peerId);
    dl.seeders.add(peerId);
    if (dl.discoveryTimer) {
      clearTimeout(dl.discoveryTimer);
      dl.discoveryTimer = null;
    }

    this._scheduleBlocks(payload.fileId);
  }

  _scheduleBlocks(fileId) {
    const dl = this._activeDownloads.get(fileId);
    if (!dl || dl.legacyStreamMode || dl.finishing || dl.seeders.size === 0) return;

    for (const peerId of dl.seeders) {
      if (dl.pendingBlocks.length === 0) break;

      let count = 0;
      for (const info of dl.inflight.values()) {
        if (info.peerId === peerId) count++;
      }

      while (count < MAX_INFLIGHT_PER_PEER && dl.pendingBlocks.length > 0) {
        const blockIndex = dl.pendingBlocks.shift();
        if (dl.completedBlocks.has(blockIndex) || dl.inflight.has(blockIndex)) {
          continue;
        }

        const offset = blockIndex * BLOCK_SIZE;
        const length = Math.min(BLOCK_SIZE, Math.max(0, dl.totalSize - offset));

        const timer = setTimeout(() => {
          const activeDl = this._activeDownloads.get(fileId);
          if (!activeDl || activeDl !== dl) return;
          if (dl.inflight.has(blockIndex)) {
            dl.inflight.delete(blockIndex);
            dl.seeders.delete(peerId);
            if (!dl.completedBlocks.has(blockIndex) && !dl.pendingBlocks.includes(blockIndex)) {
              dl.pendingBlocks.unshift(blockIndex);
            }
            this._scheduleBlocks(fileId);
          }
        }, 15000);

        dl.inflight.set(blockIndex, { peerId, offset, length, timer });
        count++;

        this.p2p._sendToPeer(peerId, "file-request-block", {
          fileId,
          blockIndex,
          offset,
          length,
        });
      }
    }
  }

  async _acquireReadHandle(realPath) {
    let entry = this._readHandles.get(realPath);
    if (!entry) {
      entry = {
        handle: null,
        openPromise: fs.promises.open(realPath, "r").then((fh) => {
          entry.handle = fh;
          return fh;
        }),
        activeReads: 0,
        timer: null,
      };
      this._readHandles.set(realPath, entry);
    }
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    entry.activeReads++;
    try {
      const fh = entry.handle || (await entry.openPromise);
      return { fh, entry };
    } catch (err) {
      entry.activeReads = Math.max(0, entry.activeReads - 1);
      this._readHandles.delete(realPath);
      throw err;
    }
  }

  _releaseReadHandle(realPath, entry) {
    if (!entry) return;
    entry.activeReads = Math.max(0, entry.activeReads - 1);
    if (entry.activeReads === 0) {
      entry.timer = setTimeout(async () => {
        if (entry.activeReads === 0) {
          this._readHandles.delete(realPath);
          try {
            await entry.handle?.close();
          } catch {}
        }
      }, 10000);
    }
  }

  async handleFileRequestBlock(peerId, payload) {
    if (!payload?.fileId || typeof payload.blockIndex !== "number") return;
    const realPath = await this._resolveLocalFilePath(payload.fileId);
    if (!realPath) {
      this.p2p._sendToPeer(peerId, "file-response-error", {
        fileId: payload.fileId,
        error: "FILE_NOT_FOUND",
      });
      return;
    }

    const offset = Math.max(0, Number(payload.offset) || 0);
    const length = Math.min(Math.max(1, Number(payload.length) || BLOCK_SIZE), 2 * 1024 * 1024);

    let acquired = null;
    try {
      acquired = await this._acquireReadHandle(realPath);
      const buf = Buffer.allocUnsafe(length);
      const { bytesRead } = await acquired.fh.read(buf, 0, length, offset);
      this.p2p._sendToPeer(peerId, "file-response-chunk", {
        fileId: payload.fileId,
        blockIndex: payload.blockIndex,
        offset,
        binaryData: buf.subarray(0, bytesRead).toString("base64"),
        done: false,
      });
    } catch (err) {
      console.error("[ARES BLOCK READ ERROR]", err.message);
      this.p2p._sendToPeer(peerId, "file-response-error", {
        fileId: payload.fileId,
        error: err.message,
      });
    } finally {
      if (acquired) {
        this._releaseReadHandle(realPath, acquired.entry);
      }
    }
  }

  async handleFileResponseChunk(peerId, payload) {
    const dl = this._activeDownloads.get(payload?.fileId);
    if (!dl || dl.finishing) return;

    // Multi-peer block mode
    if (typeof payload.blockIndex === "number") {
      const blockIndex = payload.blockIndex;
      if (dl.completedBlocks.has(blockIndex)) return;

      if (dl.discoveryTimer) {
        clearTimeout(dl.discoveryTimer);
        dl.discoveryTimer = null;
      }

      const inflightInfo = dl.inflight.get(blockIndex);
      if (inflightInfo) {
        clearTimeout(inflightInfo.timer);
        dl.inflight.delete(blockIndex);
      }

      try {
        if (!dl.fileHandle) {
          if (!dl.fileHandlePromise) {
            dl.fileHandlePromise = fs.promises.open(dl.partPath, "w+").then((fh) => {
              dl.fileHandle = fh;
              return fh;
            });
          }
          await dl.fileHandlePromise;
        }

        if (!this._activeDownloads.has(payload.fileId) || dl.completedBlocks.has(blockIndex) || dl.finishing) {
          return;
        }

        const buffer = Buffer.from(payload.binaryData || "", "base64");
        const writeOffset =
          typeof payload.offset === "number" ? payload.offset : blockIndex * BLOCK_SIZE;

        await dl.fileHandle.write(buffer, 0, buffer.length, writeOffset);

        if (!this._activeDownloads.has(payload.fileId) || dl.completedBlocks.has(blockIndex) || dl.finishing) {
          return;
        }

        dl.completedBlocks.add(blockIndex);
        dl.receivedBytes += buffer.length;

        const now = Date.now();
        if (!dl.lastProgressEmit || now - dl.lastProgressEmit >= 80) {
          dl.lastProgressEmit = now;
          const percent = dl.totalSize > 0
            ? Math.min(Math.round((dl.receivedBytes / dl.totalSize) * 100), 99)
            : 50;

          global.mainWindow?.webContents.send("file:progress", {
            fileId: payload.fileId,
            progress: percent,
            done: false,
          });
        }

        this._scheduleBlocks(payload.fileId);

        if (dl.totalBlocks > 0 && dl.completedBlocks.size >= dl.totalBlocks && !dl.finishing) {
          dl.finishing = true;
          await this._cleanupDownloadState(payload.fileId, dl, false);
          try {
            if (fs.existsSync(dl.targetPath)) {
              await fs.promises.unlink(dl.targetPath);
            }
          } catch {}
          await fs.promises.rename(dl.partPath, dl.targetPath);

          console.log(
            `[ARES SUCCESS] Swarm file assembled and SEALED successfully at: ${dl.targetPath}`
          );

          this._recordDownload(payload.fileId, dl.targetPath);

          global.mainWindow?.webContents.send("file:progress", {
            fileId: payload.fileId,
            progress: 100,
            done: true,
            localPath: dl.targetPath,
          });
        }
      } catch (writeErr) {
        console.error("[ARES BLOCK WRITE ERROR]", writeErr.message);
        await this._cleanupDownloadState(payload.fileId, dl, true);
        global.mainWindow?.webContents.send("file:progress", {
          fileId: payload.fileId,
          error: writeErr.message,
        });
      }
      return;
    }

    // Legacy sequential fallback
    if ((!dl.legacyStreamMode && dl.seeders.size > 0) || (dl.providerPeerId && dl.providerPeerId !== peerId)) {
      this.p2p._sendToPeer(peerId, "file-cancel-transfer", { fileId: payload.fileId });
      return;
    }

    if (dl.discoveryTimer) {
      clearTimeout(dl.discoveryTimer);
      dl.discoveryTimer = null;
    }

    try {
      if (!dl.writeStream) {
        dl.writeStream = fs.createWriteStream(dl.targetPath, {
          flags: "w",
        });
        dl.providerPeerId = peerId;
      }

      if (payload.binaryData) {
        const buffer = Buffer.from(payload.binaryData, "base64");
        dl.writeStream.write(buffer);
        dl.receivedBytes += buffer.length;

        const now = Date.now();
        if (!dl.lastProgressEmit || now - dl.lastProgressEmit >= 80) {
          dl.lastProgressEmit = now;
          const percent = dl.totalSize
            ? Math.min(
                Math.round((dl.receivedBytes / dl.totalSize) * 100),
                99
              )
            : 50;

          global.mainWindow?.webContents.send("file:progress", {
            fileId: payload.fileId,
            progress: percent,
            done: false,
          });
        }
      }

      if (payload.done) {
        dl.finishing = true;
        dl.writeStream.end(() => {
          console.log(
            `[ARES SUCCESS] File assembled and SEALED successfully at: ${dl.targetPath}`
          );

          this._recordDownload(payload.fileId, dl.targetPath);
          this._activeDownloads.delete(payload.fileId);

          global.mainWindow?.webContents.send("file:progress", {
            fileId: payload.fileId,
            progress: 100,
            done: true,
            localPath: dl.targetPath,
          });
        });
      }
    } catch (writeErr) {
      console.error("[ARES WRITE ERROR]", writeErr.message);
      await this._cleanupDownloadState(payload.fileId, dl, true);
      global.mainWindow?.webContents.send("file:progress", {
        fileId: payload.fileId,
        error: writeErr.message,
      });
    }
  }

  handleFileResponseError(peerIdOrPayload, maybePayload) {
    const payload = maybePayload !== undefined ? maybePayload : peerIdOrPayload;
    const peerId = maybePayload !== undefined ? peerIdOrPayload : payload?.peerId || null;
    if (!payload?.fileId) return;

    console.warn(
      `[ARES REMOTE ERROR] Peer ${peerId || "unknown"} reported error for ${payload.fileId}: ${payload.error}`
    );

    const dl = this._activeDownloads.get(payload.fileId);
    if (!dl || dl.finishing) return;

    if (peerId) {
      dl.missingPeers.add(peerId);
      dl.seeders.delete(peerId);

      // Requeue any in-flight blocks assigned to this peer
      for (const [blockIndex, info] of dl.inflight.entries()) {
        if (info.peerId === peerId) {
          clearTimeout(info.timer);
          dl.inflight.delete(blockIndex);
          if (!dl.completedBlocks.has(blockIndex) && !dl.pendingBlocks.includes(blockIndex)) {
            dl.pendingBlocks.unshift(blockIndex);
          }
        }
      }

      if (dl.seeders.size > 0) {
        this._scheduleBlocks(payload.fileId);
        return;
      }
    }

    const normalizedRoom = this.roomCode ? String(this.roomCode).trim().toUpperCase() : null;
    const roomPeerIds = [];
    for (const [pId, pObj] of (this.p2p?.peers?.entries() || [])) {
      if (!pObj || pObj.isPreview || !pObj.socket || pObj.socket.destroyed) continue;
      const rooms = this.p2p?.peerRooms?.get(pId);
      if (!normalizedRoom || !rooms || rooms.size === 0 || rooms.has(normalizedRoom)) {
        roomPeerIds.push(pId);
      }
    }

    const allRoomPeersMissing =
      !peerId ||
      roomPeerIds.length === 0 ||
      roomPeerIds.every((pId) => dl.missingPeers.has(pId));

    if (dl.seeders.size === 0 && allRoomPeersMissing) {
      this._cleanupDownloadState(payload.fileId, dl, true);
      global.mainWindow?.webContents.send("file:progress", {
        fileId: payload.fileId,
        error: "El archivo ya no está disponible en la PC del dueño.",
      });
    }
  }

  handleFileCancelTransfer(peerId, payload) {
    const uploadKey = `${peerId}:${payload.fileId}`;
    const readStream = this._activeUploads.get(uploadKey);
    if (readStream) {
      console.log(`[ARES SWARM STREAM] Cancelando envío de archivo por petición del receptor.`);
      try {
        readStream.destroy();
      } catch {}
      this._activeUploads.delete(uploadKey);
    }
  }

  handlePeerLeft(peerId) {
    // 1. Handle active downloads where this peer was a seeder or legacy provider
    for (const [fileId, dl] of this._activeDownloads.entries()) {
      if (dl.seeders && dl.seeders.has(peerId)) {
        dl.seeders.delete(peerId);
        for (const [blockIndex, info] of dl.inflight.entries()) {
          if (info.peerId === peerId) {
            clearTimeout(info.timer);
            dl.inflight.delete(blockIndex);
            if (!dl.completedBlocks.has(blockIndex) && !dl.pendingBlocks.includes(blockIndex)) {
              dl.pendingBlocks.unshift(blockIndex);
            }
          }
        }
        if (dl.seeders.size > 0) {
          this._scheduleBlocks(fileId);
          continue;
        }
        console.log(`[ARES DOWNLOAD CLEANUP] Cancelando descarga de fileId ${fileId} porque todos los seeders se desconectaron.`);
        this._cleanupDownloadState(fileId, dl, true);
        global.mainWindow?.webContents.send("file:progress", {
          fileId,
          error: "El proveedor del archivo se ha desconectado de la sala.",
        });
      } else if (dl.providerPeerId === peerId) {
        console.log(`[ARES DOWNLOAD CLEANUP] Cancelando descarga de fileId ${fileId} porque el proveedor se desconectó.`);
        this._cleanupDownloadState(fileId, dl, true);
        global.mainWindow?.webContents.send("file:progress", {
          fileId,
          error: "El proveedor del archivo se ha desconectado de la sala.",
        });
      }
    }

    // 2. Abort uploads (read streams) to this peer
    for (const [uploadKey, readStream] of this._activeUploads.entries()) {
      if (uploadKey.startsWith(`${peerId}:`)) {
        console.log(`[ARES UPLOAD CLEANUP] Destruyendo readStream para peer desconectado: ${peerId}`);
        try {
          readStream.destroy();
        } catch {}
        this._activeUploads.delete(uploadKey);
      }
    }
  }

  closeFileServer() {
    if (this.fileServer) {
      try {
        this.fileServer.close();
      } catch {}
      this.fileServer = null;
      this.fileServerPort = 0;
      console.log(
        "[FileService] Servidor Ares cerrado y puerto liberado con éxito."
      );
    }
    for (const [, entry] of this._readHandles.entries()) {
      if (entry.timer) clearTimeout(entry.timer);
      try {
        entry.handle?.close();
      } catch {}
    }
    this._readHandles.clear();
    this.roomCode = null;
  }

  destroy() {
    this.closeFileServer();
    for (const [fileId, dl] of this._activeDownloads.entries()) {
      this._cleanupDownloadState(fileId, dl, false);
    }
    this._activeDownloads.clear();
    this._activeUploads.clear();
  }
}

module.exports = { FileService };
