const path = require("path");
const { app } = require("electron");
const diagService = require("./diagService.cjs");

function getCurrentAppVersion() {
  if (app && typeof app.getVersion === "function") {
    try {
      return app.getVersion();
    } catch (_) {}
  }
  try {
    return require("../../package.json").version || "0.1.0";
  } catch (_) {
    return "0.1.0";
  }
}

function isNewerVersion(latest, current) {
  if (!latest || !current) return false;
  const clean = (v) =>
    v
      .replace(/^v/, "")
      .trim()
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const [lMaj = 0, lMin = 0, lPatch = 0] = clean(latest);
  const [cMaj = 0, cMin = 0, cPatch = 0] = clean(current);
  if (lMaj > cMaj) return true;
  if (lMaj < cMaj) return false;
  if (lMin > cMin) return true;
  if (lMin < cMin) return false;
  return lPatch > cPatch;
}

class UpdateService {
  constructor() {
    this.mainWindow = null;
    this.isPortable = Boolean(
      process.env.PORTABLE_EXECUTABLE_DIR ||
      process.env.PORTABLE_EXECUTABLE_FILE ||
      process.env.PORTABLE_EXECUTABLE_APP_FILENAME ||
      (process.execPath && /portable/i.test(path.basename(process.execPath)))
    );
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
      this.autoUpdater.logger = console;

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
        version: info?.version || getCurrentAppVersion(),
      });
    });

    this.autoUpdater.on("error", (err) => {
      diagService.log("warn", "UpdateService", `electron-updater error event: ${err?.message || err}`);
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

  async _checkGitHubReleasesDirectly() {
    const currentVersion = getCurrentAppVersion();
    diagService.log("info", "UpdateService", `Checking GitHub releases fallback (current: v${currentVersion})`);

    // Método 1: GitHub REST API
    try {
      const response = await fetch(
        "https://api.github.com/repos/OniverseDesign/onicord/releases/latest",
        {
          headers: {
            "User-Agent": "Onicord-App",
            "Accept": "application/vnd.github.v3+json",
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        const latestVersion = (data.tag_name || "").replace(/^v/, "").trim();
        if (latestVersion && isNewerVersion(latestVersion, currentVersion)) {
          diagService.log("info", "UpdateService", `Update available via GitHub API: v${latestVersion}`);
          const updateInfo = {
            version: latestVersion,
            releaseDate: data.published_at,
            releaseNotes: data.body,
            isPortable: this.isPortable,
          };
          this.updateAvailableInfo = updateInfo;
          this._sendToRenderer("update:status", {
            status: "available",
            ...updateInfo,
          });
          return { status: "ok", updateInfo };
        } else {
          diagService.log("info", "UpdateService", `App is up-to-date (API reports v${latestVersion})`);
          this._sendToRenderer("update:status", {
            status: "not-available",
            version: currentVersion,
          });
          return { status: "not-available", version: currentVersion };
        }
      }
    } catch (err) {
      diagService.log("warn", "UpdateService", `GitHub REST API check failed: ${err.message}`);
    }

    // Método 2: Web HTTP redirect fallback (inmune a cuotas y límites de GitHub API)
    try {
      diagService.log("info", "UpdateService", "Attempting web redirect fallback to github.com/releases/latest");
      const redirectRes = await fetch("https://github.com/OniverseDesign/onicord/releases/latest", {
        redirect: "manual",
        headers: { "User-Agent": "Onicord-App" },
      });
      const location = redirectRes.headers.get("location") || "";
      const tagMatch = location.match(/\/tag\/v?([^/]+)$/);
      if (tagMatch && tagMatch[1]) {
        const latestVersion = tagMatch[1].replace(/^v/, "").trim();
        if (latestVersion && isNewerVersion(latestVersion, currentVersion)) {
          diagService.log("info", "UpdateService", `Update available via web redirect: v${latestVersion}`);
          const updateInfo = {
            version: latestVersion,
            releaseDate: new Date().toISOString(),
            isPortable: this.isPortable,
          };
          this.updateAvailableInfo = updateInfo;
          this._sendToRenderer("update:status", {
            status: "available",
            ...updateInfo,
          });
          return { status: "ok", updateInfo };
        } else {
          this._sendToRenderer("update:status", {
            status: "not-available",
            version: currentVersion,
          });
          return { status: "not-available", version: currentVersion };
        }
      }
    } catch (err) {
      diagService.log("warn", "UpdateService", `GitHub Web redirect check failed: ${err.message}`);
    }

    return null;
  }

  async checkForUpdates() {
    this._sendToRenderer("update:status", { status: "checking" });

    // 1. Entorno de desarrollo: consultar directamente a GitHub
    if (!app.isPackaged) {
      diagService.log("info", "UpdateService", "Dev mode: checking GitHub releases directly");
      const devResult = await this._checkGitHubReleasesDirectly();
      if (devResult) return devResult;
      return {
        status: "dev-mode",
        message: "Las actualizaciones automáticas están deshabilitadas en entorno de desarrollo.",
      };
    }

    // 2. Si es versión Portable: siempre consultar directamente a GitHub Releases
    if (this.isPortable) {
      diagService.log("info", "UpdateService", "Portable build detected: checking GitHub releases directly");
      const portableResult = await this._checkGitHubReleasesDirectly();
      if (portableResult) return portableResult;
      this._sendToRenderer("update:status", {
        status: "error",
        error: "No se pudo consultar la última versión en GitHub.",
      });
      return { status: "error", error: "No se pudo consultar la última versión en GitHub." };
    }

    // 3. Paquete instalable (NSIS): intentar con electron-updater
    if (this.autoUpdater) {
      try {
        const result = await this.autoUpdater.checkForUpdates();
        if (result?.updateInfo) {
          const isAvail = isNewerVersion(result.updateInfo.version, getCurrentAppVersion());
          if (isAvail) {
            this.updateAvailableInfo = result.updateInfo;
            this._sendToRenderer("update:status", {
              status: "available",
              version: result.updateInfo.version,
              releaseDate: result.updateInfo.releaseDate,
              releaseNotes: result.updateInfo.releaseNotes,
              isPortable: false,
            });
            return { status: "ok", updateInfo: result.updateInfo };
          } else {
            this._sendToRenderer("update:status", {
              status: "not-available",
              version: getCurrentAppVersion(),
            });
            return { status: "not-available", version: getCurrentAppVersion() };
          }
        }
      } catch (err) {
        diagService.log("warn", "UpdateService", `electron-updater failed (${err.message}), trying GitHub fallback`);
      }
    }

    // 4. Fallback directo a GitHub si electron-updater falló
    const fallbackResult = await this._checkGitHubReleasesDirectly();
    if (fallbackResult) {
      return fallbackResult;
    }

    this._sendToRenderer("update:status", {
      status: "error",
      error: "Error al comprobar actualizaciones.",
    });
    return { status: "error", error: "Error al comprobar actualizaciones." };
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
      this._sendToRenderer("update:status", {
        status: "error",
        error: err.message,
      });
      return { status: "error", error: err.message };
    }
  }

  quitAndInstall() {
    if (this.autoUpdater) {
      // isSilent: true (executes installer in background with /S, preserving custom install location)
      // isForceRunAfter: true (automatically relaunches Onicord after completion)
      this.autoUpdater.quitAndInstall(true, true);
    }
  }

  getIsPortable() {
    return this.isPortable;
  }
}

module.exports = new UpdateService();
