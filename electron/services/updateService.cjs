const { app } = require("electron");
const diagService = require("./diagService.cjs");

class UpdateService {
  constructor() {
    this.mainWindow = null;
    this.isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
    this.autoUpdater = null;
    this.updateAvailableInfo = null;
  }

  init(mainWindow) {
    this.mainWindow = mainWindow;
    this._setupAutoUpdater();
  }

  _setupAutoUpdater() {
    try {
      const { autoUpdater } = require("electron-updater");
      this.autoUpdater = autoUpdater;
      this.autoUpdater.autoDownload = false;
      this.autoUpdater.autoInstallOnAppQuit = true;

      this._registerEvents();
    } catch (err) {
      diagService.log("warn", "UpdateService", `Could not initialize electron-updater: ${err.message}`);
    }
  }

  _sendToRenderer(channel, payload) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, payload);
    }
  }

  _registerEvents() {
    if (!this.autoUpdater) return;

    this.autoUpdater.on("checking-for-update", () => {
      diagService.log("info", "UpdateService", "Checking for update...");
      this._sendToRenderer("update:status", { status: "checking" });
    });

    this.autoUpdater.on("update-available", (info) => {
      diagService.log("info", "UpdateService", `Update available: ${info?.version}`);
      this.updateAvailableInfo = info;
      this._sendToRenderer("update:status", {
        status: "available",
        version: info?.version,
        releaseDate: info?.releaseDate,
        releaseNotes: info?.releaseNotes,
        isPortable: this.isPortable,
      });
    });

    this.autoUpdater.on("update-not-available", (info) => {
      diagService.log("info", "UpdateService", "App is up-to-date");
      this._sendToRenderer("update:status", {
        status: "not-available",
        version: info?.version || app.getVersion(),
      });
    });

    this.autoUpdater.on("error", (err) => {
      diagService.log("error", "UpdateService", `Update error: ${err?.message || err}`);
      this._sendToRenderer("update:status", {
        status: "error",
        error: err?.message || "Error checking or downloading update",
      });
    });

    this.autoUpdater.on("download-progress", (progressObj) => {
      this._sendToRenderer("update:status", {
        status: "downloading",
        percent: Math.floor(progressObj?.percent || 0),
        bytesPerSecond: progressObj?.bytesPerSecond || 0,
        transferred: progressObj?.transferred || 0,
        total: progressObj?.total || 0,
      });
    });

    this.autoUpdater.on("update-downloaded", (info) => {
      diagService.log("info", "UpdateService", `Update downloaded: ${info?.version}`);
      this._sendToRenderer("update:status", {
        status: "downloaded",
        version: info?.version,
      });
    });
  }

  async checkForUpdates() {
    if (!app.isPackaged) {
      diagService.log("info", "UpdateService", "Dev mode: auto update disabled");
      return {
        status: "dev-mode",
        message: "Las actualizaciones automáticas están deshabilitadas en entorno de desarrollo.",
      };
    }

    if (!this.autoUpdater) {
      return {
        status: "error",
        error: "Servicio de actualización no disponible.",
      };
    }

    try {
      const result = await this.autoUpdater.checkForUpdates();
      return { status: "ok", updateInfo: result?.updateInfo };
    } catch (err) {
      diagService.log("error", "UpdateService", `checkForUpdates error: ${err.message}`);
      return { status: "error", error: err.message };
    }
  }

  async startDownload() {
    if (this.isPortable) {
      return { status: "error", error: "La descarga automática no está soportada en versión Portable." };
    }

    if (!this.autoUpdater) {
      return { status: "error", error: "Servicio de actualización no inicializado." };
    }

    try {
      await this.autoUpdater.downloadUpdate();
      return { status: "downloading" };
    } catch (err) {
      diagService.log("error", "UpdateService", `startDownload error: ${err.message}`);
      return { status: "error", error: err.message };
    }
  }

  quitAndInstall() {
    if (this.autoUpdater) {
      this.autoUpdater.quitAndInstall(false, true);
    }
  }

  getIsPortable() {
    return this.isPortable;
  }
}

module.exports = new UpdateService();
