const { app } = require("electron");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const { runOneShotWorker } = require("../workers/workerRunner.cjs");

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getUserDataPath() {
  if (app && typeof app.getPath === "function") {
    return app.getPath("userData");
  }
  return process.env.APPDATA
    ? path.join(process.env.APPDATA, "Onicord")
    : path.join(process.env.HOME || ".", ".onicord");
}

function getBackupsDirPath() {
  const dir = path.join(getUserDataPath(), "backups");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      console.error("[BackupService] Error creating backups directory:", err);
    }
  }
  return dir;
}

function sendProgress(step, percent = 0) {
  try {
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send("backup:progress", { step, percent });
    }
  } catch {}
}

function getDirSizeSync(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  let size = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dirPath, e.name);
      if (e.isDirectory()) {
        size += getDirSizeSync(full);
      } else {
        try {
          size += fs.statSync(full).size;
        } catch {}
      }
    }
  } catch {}
  return size;
}

// ─── CATEGORY → FILES MAPPING ────────────────────────────────────────────────
function getCategoryPaths(categories, stagingDir = null) {
  const ud = getUserDataPath();
  const paths = [];

  if (categories.includes("profile")) {
    const dbDir = stagingDir ? path.join(stagingDir, "db") : path.join(ud, "db");
    if (fs.existsSync(dbDir)) paths.push({ src: dbDir, dest: "db", isDir: true });
    const casDir = path.join(ud, "cas");
    if (fs.existsSync(casDir)) paths.push({ src: casDir, dest: "cas", isDir: true });
  }

  if (categories.includes("servers")) {
    const srvDir = stagingDir ? path.join(stagingDir, "servers") : path.join(ud, "servers");
    if (fs.existsSync(srvDir)) paths.push({ src: srvDir, dest: "servers", isDir: true });
  }

  if (categories.includes("addons")) {
    const pl = path.join(ud, "plugins");
    if (fs.existsSync(pl)) paths.push({ src: pl, dest: "addons/plugins", isDir: true });
  }

  if (categories.includes("stickers")) {
    const st = path.join(ud, "stickers");
    if (fs.existsSync(st)) paths.push({ src: st, dest: "stickers/stickers", isDir: true });
    const sp = path.join(ud, "sticker_packs");
    if (fs.existsSync(sp)) paths.push({ src: sp, dest: "stickers/sticker_packs", isDir: true });
    const ep = path.join(ud, "emoji_packs");
    if (fs.existsSync(ep)) paths.push({ src: ep, dest: "stickers/emoji_packs", isDir: true });
  }

  return paths;
}

// ─── ESTIMATE SIZE ────────────────────────────────────────────────────────────
async function estimateBackupSize(categories = ["profile", "servers", "addons", "stickers"]) {
  const ud = getUserDataPath();
  let total = 0;

  if (categories.includes("profile")) {
    total += getDirSizeSync(path.join(ud, "db"));
    total += getDirSizeSync(path.join(ud, "cas"));
  }
  if (categories.includes("servers")) {
    total += getDirSizeSync(path.join(ud, "servers"));
  }
  if (categories.includes("addons")) {
    total += getDirSizeSync(path.join(ud, "plugins"));
  }
  if (categories.includes("stickers")) {
    total += getDirSizeSync(path.join(ud, "stickers"));
    total += getDirSizeSync(path.join(ud, "sticker_packs"));
    total += getDirSizeSync(path.join(ud, "emoji_packs"));
  }

  return total;
}

function getProfileSummary() {
  const ud = getUserDataPath();
  try {
    const { DbManager } = require("../storage/dbManager.cjs");
    const { CasStore } = require("../storage/casStore.cjs");
    const profileDb = DbManager.getInstance(ud).getGlobalDb("profile");
    const row = profileDb.prepare("SELECT user_id, nickname, avatar_ref FROM main_profile WHERE id = 1").get();
    if (row) {
      let avatarData = row.avatar_ref || null;
      if (avatarData && avatarData.startsWith("onicord-media://cas/")) {
        try {
          const cas = CasStore.getInstance(ud);
          const dataUri = cas.toDataUri(avatarData);
          if (dataUri && dataUri.startsWith("data:")) {
            avatarData = dataUri;
          }
        } catch {}
      }
      return {
        id: row.user_id || null,
        nickname: row.nickname || "",
        avatar: avatarData,
      };
    }
  } catch {}
  return null;
}

function getQuickStats() {
  const ud = getUserDataPath();
  let serversCount = 0;
  let pluginsCount = 0;
  let stickersCount = 0;

  try {
    const { DbManager } = require("../storage/dbManager.cjs");
    const dbMgr = DbManager.getInstance(ud);
    const srvRow = dbMgr.getGlobalDb("servers_list").prepare("SELECT COUNT(*) AS cnt FROM joined_servers").get();
    serversCount = srvRow?.cnt || 0;
    const stkRow = dbMgr.getGlobalDb("stickers").prepare("SELECT COUNT(*) AS cnt FROM stickers").get();
    stickersCount = stkRow?.cnt || 0;
  } catch {}

  try {
    const plPath = path.join(ud, "plugins");
    if (fs.existsSync(plPath)) {
      pluginsCount = fs.readdirSync(plPath, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".")).length;
    }
  } catch {}

  return { serversCount, pluginsCount, stickersCount };
}

async function buildAndWriteBackupZip(categories, targetFilePath) {
  const ud = getUserDataPath();
  const stagingDir = path.join(ud, `_backup_staging_${Date.now()}`);
  const { DbManager } = require("../storage/dbManager.cjs");
  const dbMgr = DbManager.getInstance(ud);

  try {
    sendProgress("Generando snapshot atómico de bases de datos...", 5);
    await dbMgr.prepareDatabasesForBackup(stagingDir, categories);

    const cpaths = getCategoryPaths(categories, stagingDir);
    const profileSummary = getProfileSummary();
    const stats = getQuickStats();

    const manifest = {
      type: "backup",
      formatVersion: 1,
      createdAt: Date.now(),
      categories,
      appVersion: typeof app.getVersion === "function" ? app.getVersion() : "0.2.1",
      profile: profileSummary,
      stats,
    };

    const res = await runOneShotWorker(
      "zipWorker.cjs",
      {
        op: "buildZipFile",
        manifest,
        cpaths,
        targetFilePath,
        skipSqliteJournals: true,
      },
      { onProgress: sendProgress }
    );

    return { filePath: res.filePath, size: res.size, manifest };
  } finally {
    if (fs.existsSync(stagingDir)) {
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

// ─── SETTINGS STORAGE ─────────────────────────────────────────────────────────
const SETTINGS_FILE = "backup-settings.json";
const OLD_DRIVE_SETTINGS_FILE = "drive-backup-settings.json";

function _writeBackupSettingsRaw(db, data) {
  db.prepare(`
    INSERT OR REPLACE INTO app_settings (key, value_json, updated_at)
    VALUES (?, ?, ?)
  `).run("backup_settings", JSON.stringify(data), Date.now());
}

function getBackupSettings() {
  const ud = getUserDataPath();
  let db = null;
  try {
    const { DbManager } = require("../storage/dbManager.cjs");
    db = DbManager.getInstance(ud).getGlobalDb("app_config");
    const row = db.prepare("SELECT value_json FROM app_settings WHERE key = ?").get("backup_settings");
    if (row && row.value_json) {
      return JSON.parse(row.value_json);
    }
  } catch (err) {
    console.warn("[BackupService] Error loading backup settings from SQLite:", err.message);
  }

  // 2. Migración legacy de backup-settings.json o drive-backup-settings.json
  const p = path.join(ud, SETTINGS_FILE);
  const oldP = path.join(ud, OLD_DRIVE_SETTINGS_FILE);

  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      const data = JSON.parse(raw);
      if (db) _writeBackupSettingsRaw(db, data);
      try { fs.unlinkSync(p); } catch {}
      return data;
    } else if (fs.existsSync(oldP)) {
      const raw = fs.readFileSync(oldP, "utf8");
      const oldSettings = JSON.parse(raw);
      const migrated = {
        autoBackupEnabled: Boolean(oldSettings.autoBackupEnabled),
        frequency: oldSettings.frequency || "weekly",
        maxBackups: oldSettings.replacePrevious ? 1 : 3,
        selectedCategories: oldSettings.selectedCategories || ["profile", "servers"],
        lastAutoBackupTime: oldSettings.lastAutoBackupTime || 0,
      };
      if (db) _writeBackupSettingsRaw(db, migrated);
      try { fs.unlinkSync(oldP); } catch {}
      return migrated;
    }
  } catch (err) {
    console.error("[BackupService] Error migrando settings JSON a SQLite:", err);
  }

  const defaultSettings = {
    autoBackupEnabled: false,
    frequency: "weekly",
    maxBackups: 3,
    selectedCategories: ["profile", "servers"],
    lastAutoBackupTime: 0,
  };
  if (db) {
    try { _writeBackupSettingsRaw(db, defaultSettings); } catch {}
  }
  return defaultSettings;
}

function saveBackupSettings(newSettings) {
  try {
    const ud = getUserDataPath();
    const current = getBackupSettings();
    const updated = { ...current, ...newSettings };
    const { DbManager } = require("../storage/dbManager.cjs");
    const db = DbManager.getInstance(ud).getGlobalDb("app_config");
    _writeBackupSettingsRaw(db, updated);
    return updated;
  } catch (err) {
    console.error("[BackupService] Error saving backup settings:", err);
    throw err;
  }
}

// ─── PUBLIC: CREATE BACKUP FILE (.onipkg) ─────────────────────────────────────
async function createBackupFile(categories = ["profile", "servers", "addons", "stickers"], targetFilePath = null) {
  sendProgress("Preparando datos y estructura...", 10);

  let finalPath = targetFilePath;
  if (!finalPath) {
    const date = new Date();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
    const filename = `onicord-backup-${dateStr}-${timeStr}.onipkg`;
    finalPath = path.join(getBackupsDirPath(), filename);
  }

  const { filePath, size, manifest } = await buildAndWriteBackupZip(categories, finalPath);
  sendProgress("Copia de seguridad completada", 100);

  return {
    success: true,
    filePath,
    fileName: path.basename(filePath),
    size,
    manifest,
  };
}

// ─── RESOLVE AVATAR FROM LOCAL CAS ───────────────────────────────────────────
function resolveLocalAvatarFallback(avatarRef, ud = null) {
  if (!avatarRef || typeof avatarRef !== "string") return null;
  try {
    const { CasStore } = require("../storage/casStore.cjs");
    const cas = CasStore.getInstance(ud || getUserDataPath());
    const dataUri = cas.toDataUri(avatarRef);
    if (dataUri && (dataUri.startsWith("data:image/") || dataUri.startsWith("data:"))) {
      return dataUri;
    }
  } catch {}
  return null;
}

// ─── PUBLIC: INSPECT BACKUP PACKAGE ──────────────────────────────────────────
async function inspectBackup(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("El archivo de copia de seguridad no existe.");
  }

  try {
    const res = await runOneShotWorker("zipWorker.cjs", {
      op: "inspectZip",
      filePath,
    });
    const manifest = res.manifest;

    let profile = manifest.profile || null;
    if (profile && profile.avatar) {
      const resolvedAvatar = res.avatarFromZip || resolveLocalAvatarFallback(profile.avatar, getUserDataPath());
      if (resolvedAvatar) {
        profile = { ...profile, avatar: resolvedAvatar };
      }
    }

    return {
      valid: true,
      filePath,
      fileName: path.basename(filePath),
      fileSize: res.fileSize,
      manifest,
      type: manifest.type || "backup",
      profile,
      categories: manifest.categories || ["profile", "servers"],
      createdAt: manifest.createdAt || res.mtimeMs,
      appVersion: manifest.appVersion || "Desconocida",
      stats: manifest.stats || {},
    };
  } catch (err) {
    console.error("[BackupService] Error inspecting backup package:", err);
    throw new Error(`Archivo .onipkg inválido: ${err.message}`);
  }
}

// ─── PUBLIC: RESTORE BACKUP ───────────────────────────────────────────────────
async function restoreBackup(filePath, categoriesToRestore = null) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("El archivo seleccionado no existe.");
  }

  sendProgress("Leyendo paquete .onipkg...", 15);
  const ud = getUserDataPath();

  try {
    const { DbManager } = require("../storage/dbManager.cjs");
    DbManager.getInstance(ud).closeAll();
  } catch (closeErr) {
    console.warn("[BackupService] Error closing DB handles before restore:", closeErr.message);
  }

  const res = await runOneShotWorker(
    "zipWorker.cjs",
    {
      op: "restoreZip",
      filePath,
      categoriesToRestore,
      userDataPath: ud,
      mode: "backup",
    },
    { onProgress: sendProgress }
  );

  sendProgress("Restauración completada con éxito", 100);
  return res;
}

// ─── PUBLIC: LOCAL VAULT (COPIAS EN DISCO LOCAL) ──────────────────────────────
async function listLocalBackups() {
  const dir = getBackupsDirPath();
  if (!fs.existsSync(dir)) return [];

  const files = await fsPromises.readdir(dir);
  const filePaths = files
    .filter((f) => f.endsWith(".onipkg"))
    .map((f) => path.join(dir, f));

  if (filePaths.length === 0) return [];

  const entries = await runOneShotWorker("zipWorker.cjs", {
    op: "readManifests",
    filePaths,
  });

  const backups = (entries || []).map((item) => {
    const file = path.basename(item.filePath);
    const manifest = item.manifest;
    return {
      id: file,
      name: file,
      filePath: item.filePath,
      size: item.size,
      createdAt: manifest?.createdAt ? new Date(manifest.createdAt).toISOString() : item.mtimeIso,
      categories: manifest?.categories || ["profile", "servers"],
      profile: manifest?.profile || null,
      stats: manifest?.stats || {},
    };
  });

  // Sort descending by creation date (newest first)
  backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return backups;
}

async function deleteLocalBackup(filename) {
  const dir = getBackupsDirPath();
  const safeName = path.basename(filename);
  const target = path.join(dir, safeName);

  if (fs.existsSync(target)) {
    await fsPromises.unlink(target);
    return { success: true };
  }
  return { success: false, error: "Archivo no encontrado" };
}

// ─── AUTO BACKUP SCHEDULER ───────────────────────────────────────────────────
const FREQUENCY_MS = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  biweekly: 15 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

async function checkAndRunAutoBackup() {
  try {
    const settings = getBackupSettings();
    if (!settings.autoBackupEnabled) return;
    if (!settings.selectedCategories || settings.selectedCategories.length === 0) return;

    const interval = FREQUENCY_MS[settings.frequency] || FREQUENCY_MS.weekly;
    const now = Date.now();
    const elapsed = now - (settings.lastAutoBackupTime || 0);

    if (elapsed >= interval) {
      console.log(`[BackupService] Ejecutando copia de seguridad automática (Frecuencia: ${settings.frequency})...`);
      await createBackupFile(settings.selectedCategories);
      saveBackupSettings({ lastAutoBackupTime: now });

      // Enforce local backup retention limit if maxBackups is configured
      const max = settings.maxBackups || 3;
      const allBackups = await listLocalBackups();
      if (allBackups.length > max) {
        const toDelete = allBackups.slice(max);
        for (const b of toDelete) {
          try {
            await deleteLocalBackup(b.name);
            console.log(`[BackupService] Backup antiguo eliminado por retención: ${b.name}`);
          } catch {}
        }
      }
      console.log("[BackupService] Copia de seguridad automática finalizada.");
    }
  } catch (err) {
    console.error("[BackupService] Error en copia automática:", err.message);
  }
}

function startAutoBackupScheduler() {
  setTimeout(() => checkAndRunAutoBackup(), 15000);
  setInterval(() => checkAndRunAutoBackup(), 60 * 60 * 1000);
}

startAutoBackupScheduler();

module.exports = {
  getUserDataPath,
  getBackupsDirPath,
  estimateBackupSize,
  buildZip: buildAndWriteBackupZip,
  buildAndWriteBackupZip,
  createBackupFile,
  inspectBackup,
  restoreBackup,
  listLocalBackups,
  deleteLocalBackup,
  getBackupSettings,
  saveBackupSettings,
  checkAndRunAutoBackup,
};
