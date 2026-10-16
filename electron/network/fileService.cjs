const net = require("net");
const fs = require("fs");
const path = require("path");
const { encodeMessage } = require("./p2pService.cjs");

class FileService {
  constructor(p2pService, fileIndexStore, userDataPath) {
    this.p2p = p2pService;
    this.fileIndexStore = fileIndexStore;
    this.userDataPath = userDataPath;

    this.fileServerPort = 0;
    this.fileServer = null;
    this.roomCode = null;

    this._activeDownloads = new Map();
    this._activeUploads = new Map();
  }

  setRoomCode(roomCode) {
    this.roomCode = roomCode;
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

            const records = await this.fileIndexStore.load(this.roomCode);
            const fileMeta = records.find((f) => f.id === fileId);

            if (!fileMeta || !fs.existsSync(fileMeta.realPath)) {
              socket.write("ERROR: FILE_NOT_FOUND\n");
              socket.end();
              return;
            }

            const ext = path.extname(fileMeta.realPath).toLowerCase();
            const listaNegra = [
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

            if (listaNegra.includes(ext)) {
              console.warn(
                `🚨 Ares blocked an attempt to extract a dangerous file: ${ext}`
              );
              socket.write("ERROR: DANGEROUS_FILE_TYPE_BLOCKED\n");
              socket.end();
              return;
            }

            readStream = fs.createReadStream(fileMeta.realPath, {
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

  async requestFileDownload(fileId, targetPath, fileName, fileSize) {
    if (!this.roomCode) return;

    try {
      const records = await this.fileIndexStore.load(this.roomCode);
      const localFileMeta = records.find((f) => f.id === fileId);
      if (
        localFileMeta &&
        localFileMeta.realPath &&
        fs.existsSync(localFileMeta.realPath)
      ) {
        console.log(
          `[ARES LOCAL] Auto-descarga detectada: ${localFileMeta.realPath}`
        );
        fs.copyFileSync(localFileMeta.realPath, targetPath);

        try {
          const registryPath = path.join(this.userDataPath, "downloads.json");
          let registry = {};
          if (fs.existsSync(registryPath)) {
            registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
          }

          registry[String(fileId)] = {
            localPath: String(targetPath),
            savedAt: Date.now(),
          };
          fs.writeFileSync(
            registryPath,
            JSON.stringify(registry, null, 2),
            "utf8"
          );
          console.log(
            `[ARES REGISTRY LOCAL] ¡ÉXITO! Archivo indexado correctamente en descargas históricas.`
          );
        } catch (regErr) {
          console.error(
            "[ARES REGISTRY LOCAL ERROR] JSON physical write failed:",
            regErr.message
          );
        }

        global.mainWindow?.webContents.send("file:progress", {
          fileId,
          progress: 100,
          done: true,
          localPath: targetPath,
        });
        return;
      }
    } catch (localErr) {
      console.error(
        "[ARES LOCAL ERROR] Verification failed:",
        localErr.message
      );
    }

    console.log(
      `[ARES NETWORK] Requesting network ports for fileId: ${fileId}`
    );
    this._activeDownloads.set(fileId, {
      writeStream: null,
      targetPath,
      receivedBytes: 0,
      totalSize: fileSize,
      abort: null,
      socket: null,
      providerPeerId: null,
    });
    this.p2p._broadcast("file-request-port", { fileId });
  }

  cancelFileDownload(fileId) {
    const id = String(fileId || "");
    const dl = this._activeDownloads.get(id);
    if (!dl) return { canceled: false };

    try {
      if (dl.writeStream) {
        try {
          dl.writeStream.destroy();
        } catch {}
      }

      if (dl.providerPeerId) {
        this.p2p._sendToPeer(dl.providerPeerId, "file-cancel-transfer", { fileId: id });
      }

      this._activeDownloads.delete(id);

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
      const records = await this.fileIndexStore.load(this.roomCode);
      const fileMeta = records.find((f) => f.id === payload.fileId);

      if (fileMeta && fs.existsSync(fileMeta.realPath)) {
        console.log(
          `[ARES SWARM STREAM] Opening pipe WITH BACKPRESSURE for: ${fileMeta.name}`
        );

        const uploadKey = `${peerId}:${payload.fileId}`;
        const readStream = fs.createReadStream(fileMeta.realPath, {
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
      } else {
        this.p2p._sendToPeer(peerId, "file-response-error", {
          fileId: payload.fileId,
          error: "FILE_NOT_FOUND",
        });
      }
    } catch (err) {
      console.error("[ARES SWARM ERROR]", err.message);
    }
  }

  handleFileResponseChunk(peerId, payload) {
    const dl = this._activeDownloads.get(payload.fileId);
    if (dl) {
      if (dl.providerPeerId && dl.providerPeerId !== peerId) return;

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

        if (payload.done) {
          dl.writeStream.end(() => {
            console.log(
              `[ARES SUCCESS] File assembled and SEALED successfully at: ${dl.targetPath}`
            );

            try {
              const registryPath = path.join(this.userDataPath, "downloads.json");
              let registry = {};
              if (fs.existsSync(registryPath)) {
                registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
              }
              registry[String(payload.fileId)] = {
                localPath: String(dl.targetPath),
                savedAt: Date.now(),
              };
              fs.writeFileSync(
                registryPath,
                JSON.stringify(registry, null, 2),
                "utf8"
              );
              console.log("[ARES REGISTRY P2P] Indexado en descargas históricas con éxito.");
            } catch (regErr) {
              console.error("[ARES REGISTRY P2P ERROR] Failed to update downloads.json:", regErr.message);
            }

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
        if (dl.writeStream) dl.writeStream.end();
        this._activeDownloads.delete(payload.fileId);
        global.mainWindow?.webContents.send("file:progress", {
          fileId: payload.fileId,
          error: writeErr.message,
        });
      }
    }
  }

  handleFileResponseError(payload) {
    console.error(
      `[ARES REMOTE ERROR] Peer reported error: ${payload.error}`
    );
    const dl = this._activeDownloads.get(payload.fileId);
    if (dl && dl.writeStream) dl.writeStream.end();
    this._activeDownloads.delete(payload.fileId);
    global.mainWindow?.webContents.send("file:progress", {
      fileId: payload.fileId,
      error: "El archivo ya no está disponible en la PC del dueño.",
    });
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
    // 1. Abort downloads where this peer was the provider
    for (const [fileId, dl] of this._activeDownloads.entries()) {
      if (dl.providerPeerId === peerId) {
        console.log(`[ARES DOWNLOAD CLEANUP] Cancelando descarga de fileId ${fileId} porque el proveedor se desconectó.`);
        if (dl.writeStream) {
          try {
            dl.writeStream.destroy();
          } catch {}
        }
        this._activeDownloads.delete(fileId);
        global.mainWindow?.webContents.send("file:progress", {
          fileId,
          error: "El proveedor del archivo se ha desconectado de la sala.",
        });

        if (dl.targetPath) {
          fs.unlink(dl.targetPath, () => {});
        }
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
    this.roomCode = null;
  }

  destroy() {
    this.closeFileServer();
    this._activeDownloads.clear();
    this._activeUploads.clear();
  }
}

module.exports = { FileService };
