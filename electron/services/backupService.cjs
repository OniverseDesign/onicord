const { app } = require("electron");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const AdmZip = require("adm-zip");

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
function getCategoryPaths(categories) {
  const ud = getUserDataPath();
  const paths = [];

  if (categories.includes("profile")) {
    const p = path.join(ud, "profile.json");
    if (fs.existsSync(p)) paths.push({ src: p, dest: "profile/profile.json", isFile: true });
  }

  if (categories.includes("servers")) {
    // servers.json
    const s = path.join(ud, "servers.json");
    if (fs.existsSync(s)) paths.push({ src: s, dest: "servers/servers.json", isFile: true });

    // room-meta/
    const rm = path.join(ud, "room-meta");
    if (fs.existsSync(rm)) paths.push({ src: rm, dest: "servers/room-meta", isDir: true });

    // chats/
    const ch = path.join(ud, "chats");
    if (fs.existsSync(ch)) paths.push({ src: ch, dest: "servers/chats", isDir: true });

    // files-index/
    const fi = path.join(ud, "files-index");
    if (fs.existsSync(fi)) paths.push({ src: fi, dest: "servers/files-index", isDir: true });
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
  }

  return paths;
}

// ─── ESTIMATE SIZE ────────────────────────────────────────────────────────────
async function estimateBackupSize(categories = ["profile", "servers", "addons", "stickers"]) {
  const ud = getUserDataPath();
  let total = 0;

  if (categories.includes("profile")) {
    try {
      total += fs.statSync(path.join(ud, "profile.json")).size;
    } catch {}
  }
  if (categories.includes("servers")) {
    try {
      total += fs.statSync(path.join(ud, "servers.json")).size;
    } catch {}
    total += getDirSizeSync(path.join(ud, "room-meta"));
    total += getDirSizeSync(path.join(ud, "chats"));
    total += getDirSizeSync(path.join(ud, "files-index"));
  }
  if (categories.includes("addons")) {
    total += getDirSizeSync(path.join(ud, "plugins"));
  }
  if (categories.includes("stickers")) {
    total += getDirSizeSync(path.join(ud, "stickers"));
    total += getDirSizeSync(path.join(ud, "sticker_packs"));
  }

  return total;
}

// ─── ZIP BUILDER ──────────────────────────────────────────────────────────────
function addDirToZip(zip, srcDir, destPrefix) {
  if (!fs.existsSync(srcDir)) return;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const e of entries) {
    const fullSrc = path.join(srcDir, e.name);
    const fullDest = `${destPrefix}/${e.name}`;
    if (e.isDirectory()) {
      addDirToZip(zip, fullSrc, fullDest);
    } else {
      try {
        const buf = fs.readFileSync(fullSrc);
        zip.addFile(fullDest, buf);
      } catch {}
    }
  }
}

function getProfileSummary() {
  const ud = getUserDataPath();
  const profilePath = path.join(ud, "profile.json");
  try {
    if (fs.existsSync(profilePath)) {
      const raw = fs.readFileSync(profilePath, "utf8");
      const parsed = JSON.parse(raw);
      return {
        id: parsed.id || null,
        nickname: parsed.nickname || "",
        avatar: parsed.avatar || null,
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
    const sPath = path.join(ud, "servers.json");
    if (fs.existsSync(sPath)) {
      const s = JSON.parse(fs.readFileSync(sPath, "utf8"));
      if (Array.isArray(s)) serversCount = s.length;
    }
  } catch {}

  try {
    const plPath = path.join(ud, "plugins");
    if (fs.existsSync(plPath)) {
      pluginsCount = fs.readdirSync(plPath, { withFileTypes: true }).filter((d) => d.isDirectory()).length;
    }
  } catch {}

  try {
    const stPath = path.join(ud, "stickers");
    if (fs.existsSync(stPath)) {
      stickersCount = fs.readdirSync(stPath, { withFileTypes: true }).filter((d) => !d.isDirectory()).length;
    }
  } catch {}

  return { serversCount, pluginsCount, stickersCount };
}

async function buildZip(categories) {
  const zip = new AdmZip();
  const cpaths = getCategoryPaths(categories);
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

  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));

  const totalEntries = cpaths.length;
  let currentEntry = 0;

  for (const entry of cpaths) {
    currentEntry++;
    const progressPercent = Math.min(85, Math.round(15 + (currentEntry / Math.max(totalEntries, 1)) * 60));
    sendProgress(`Empaquetando ${entry.dest}...`, progressPercent);

    if (entry.isDir) {
      addDirToZip(zip, entry.src, entry.dest);
    } else {
      try {
        const buf = fs.readFileSync(entry.src);
        zip.addFile(entry.dest, buf);
      } catch {}
    }
  }

  return { zip, manifest };
}

// ─── SETTINGS STORAGE ─────────────────────────────────────────────────────────
const SETTINGS_FILE = "backup-settings.json";
const OLD_DRIVE_SETTINGS_FILE = "drive-backup-settings.json";

function getSettingsFilePath() {
  return path.join(getUserDataPath(), SETTINGS_FILE);
}

function getBackupSettings() {
  const ud = getUserDataPath();
  const p = getSettingsFilePath();
  const oldP = path.join(ud, OLD_DRIVE_SETTINGS_FILE);

  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      return JSON.parse(raw);
    } else if (fs.existsSync(oldP)) {
      // Migrate from old Google Drive settings
      const raw = fs.readFileSync(oldP, "utf8");
      const oldSettings = JSON.parse(raw);
      const migrated = {
        autoBackupEnabled: Boolean(oldSettings.autoBackupEnabled),
        frequency: oldSettings.frequency || "weekly",
        maxBackups: oldSettings.replacePrevious ? 1 : 3,
        selectedCategories: oldSettings.selectedCategories || ["profile", "servers"],
        lastAutoBackupTime: oldSettings.lastAutoBackupTime || 0,
      };
      fs.writeFileSync(p, JSON.stringify(migrated, null, 2), "utf8");
      return migrated;
    }
  } catch (err) {
    console.error("[BackupService] Error loading backup settings:", err);
  }

  return {
    autoBackupEnabled: false,
    frequency: "weekly",
    maxBackups: 3,
    selectedCategories: ["profile", "servers"],
    lastAutoBackupTime: 0,
  };
}

function saveBackupSettings(newSettings) {
  try {
    const current = getBackupSettings();
    const updated = { ...current, ...newSettings };
    fs.writeFileSync(getSettingsFilePath(), JSON.stringify(updated, null, 2), "utf8");
    return updated;
  } catch (err) {
    console.error("[BackupService] Error saving backup settings:", err);
    throw err;
  }
}

// ─── PUBLIC: CREATE BACKUP FILE (.onipkg) ─────────────────────────────────────
async function createBackupFile(categories = ["profile", "servers", "addons", "stickers"], targetFilePath = null) {
  sendProgress("Preparando datos y estructura...", 10);

  const { zip, manifest } = await buildZip(categories);

  let finalPath = targetFilePath;
  if (!finalPath) {
    const date = new Date();
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const timeStr = `${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
    const filename = `onicord-backup-${dateStr}-${timeStr}.onipkg`;
    finalPath = path.join(getBackupsDirPath(), filename);
  }

  sendProgress("Generando archivo .onipkg...", 90);
  await fsPromises.mkdir(path.dirname(finalPath), { recursive: true });
  zip.writeZip(finalPath);

  const fileStats = await fsPromises.stat(finalPath);
  sendProgress("Copia de seguridad completada", 100);

  return {
    success: true,
    filePath: finalPath,
    fileName: path.basename(finalPath),
    size: fileStats.size,
    manifest,
  };
}

// ─── PUBLIC: INSPECT BACKUP PACKAGE ──────────────────────────────────────────
async function inspectBackup(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error("El archivo de copia de seguridad no existe.");
  }

  try {
    const zip = new AdmZip(filePath);
    const manifestEntry = zip.getEntry("manifest.json");
    if (!manifestEntry) {
      throw new Error("El archivo no es una copia de seguridad válida de Onicord (falta manifest.json).");
    }

    const raw = manifestEntry.getData().toString("utf8");
    const manifest = JSON.parse(raw);

    const fileStats = fs.statSync(filePath);

    return {
      valid: true,
      filePath,
      fileName: path.basename(filePath),
      fileSize: fileStats.size,
      manifest,
      type: manifest.type || "backup",
      profile: manifest.profile || null,
      categories: manifest.categories || ["profile", "servers"],
      createdAt: manifest.createdAt || fileStats.mtimeMs,
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
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();

  const manifestEntry = entries.find((e) => e.entryName === "manifest.json");
  let manifest = {};
  if (manifestEntry) {
    try {
      manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
    } catch {}
  }

  const cats = categoriesToRestore || manifest.categories || ["profile", "servers", "addons", "stickers"];
  const ud = getUserDataPath();

  const prefixMap = {
    profile: "profile/",
    servers: "servers/",
    addons: "addons/",
    stickers: "stickers/",
  };

  const totalEntries = entries.length;
  let processed = 0;

  for (const entry of entries) {
    processed++;
    if (entry.entryName === "manifest.json" || entry.isDirectory) continue;

    const matchedCat = cats.find((c) => entry.entryName.startsWith(prefixMap[c] || `${c}/`));
    if (!matchedCat) continue;

    try {
      const prefix = prefixMap[matchedCat] || `${matchedCat}/`;
      const relPath = entry.entryName.slice(prefix.length);

      // Prevenir vulnerabilidad Zip Slip / Path Traversal
      const safeRelPath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, "");
      const destPath = path.join(ud, safeRelPath);

      if (!destPath.startsWith(ud)) {
        console.warn(`[BackupService] Bloqueada ruta insegura en backup: ${entry.entryName}`);
        continue;
      }

      await fsPromises.mkdir(path.dirname(destPath), { recursive: true });
      await fsPromises.writeFile(destPath, entry.getData());

      const percent = Math.min(95, Math.round(20 + (processed / Math.max(totalEntries, 1)) * 75));
      sendProgress(`Restaurando ${path.basename(destPath)}...`, percent);
    } catch (err) {
      console.error(`[BackupService] Error al restaurar ${entry.entryName}:`, err.message);
    }
  }

  sendProgress("Restauración completada con éxito", 100);
  return { restored: true, categories: cats, manifest };
}

// ─── PUBLIC: LOCAL VAULT (COPIAS EN DISCO LOCAL) ──────────────────────────────
async function listLocalBackups() {
  const dir = getBackupsDirPath();
  if (!fs.existsSync(dir)) return [];

  const files = await fsPromises.readdir(dir);
  const backups = [];

  for (const file of files) {
    if (!file.endsWith(".onipkg")) continue;
    const fullPath = path.join(dir, file);
    try {
      const stat = await fsPromises.stat(fullPath);
      let manifest = null;
      try {
        const zip = new AdmZip(fullPath);
        const mEntry = zip.getEntry("manifest.json");
        if (mEntry) {
          manifest = JSON.parse(mEntry.getData().toString("utf8"));
        }
      } catch {}

      backups.push({
        id: file,
        name: file,
        filePath: fullPath,
        size: stat.size,
        createdAt: manifest?.createdAt ? new Date(manifest.createdAt).toISOString() : stat.mtime.toISOString(),
        categories: manifest?.categories || ["profile", "servers"],
        profile: manifest?.profile || null,
        stats: manifest?.stats || {},
      });
    } catch {}
  }

  // Ordenar por fecha descendente (más recientes primero)
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

      // Limitar el número de backups en la bóveda local si maxBackups está definido
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
  buildZip,
  createBackupFile,
  inspectBackup,
  restoreBackup,
  listLocalBackups,
  deleteLocalBackup,
  getBackupSettings,
  saveBackupSettings,
  checkAndRunAutoBackup,
};
