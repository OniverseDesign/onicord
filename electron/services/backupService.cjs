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
    const dbDir = path.join(ud, "db");
    if (fs.existsSync(dbDir)) paths.push({ src: dbDir, dest: "db", isDir: true });
    const casDir = path.join(ud, "cas");
    if (fs.existsSync(casDir)) paths.push({ src: casDir, dest: "cas", isDir: true });
  }

  if (categories.includes("servers")) {
    const srvDir = path.join(ud, "servers");
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

// ─── RESOLVE AVATAR FROM BACKUP ZIP ──────────────────────────────────────────
function resolveAvatarFromBackupZip(zip, avatarRef, ud = null) {
  if (!avatarRef || typeof avatarRef !== "string") return null;
  const trimmed = avatarRef.trim();
  if (trimmed.startsWith("data:image/") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  const { EXT_TO_MIME, CasStore } = require("../storage/casStore.cjs");

  // Attempt to extract from zip if it is a CAS reference
  let target = trimmed;
  if (target.startsWith("onicord-media://cas/")) {
    target = target.slice("onicord-media://cas/".length).split("?")[0];
  }
  target = path.basename(target);

  let hash = target;
  let ext = "png";
  const dotIdx = target.indexOf(".");
  if (dotIdx !== -1) {
    hash = target.slice(0, dotIdx);
    ext = target.slice(dotIdx + 1);
  }
  hash = hash.toLowerCase().replace(/[^a-f0-9]/g, "");

  if (hash.length === 64) {
    const prefix = hash.slice(0, 2);
    const cleanExt = ext.replace(/[^a-z0-9]/g, "") || "png";
    let entry = zip.getEntry(`cas/${prefix}/${hash}.${cleanExt}`);
    if (!entry) {
      entry = zip.getEntry(`cas/${hash}.${cleanExt}`);
    }
    if (!entry) {
      const allEntries = zip.getEntries();
      entry = allEntries.find((e) => !e.isDirectory && e.entryName.toLowerCase().includes(hash));
    }

    if (entry) {
      try {
        const buf = entry.getData();
        if (buf && buf.length > 0) {
          const entryExt = path.extname(entry.entryName).slice(1).toLowerCase() || cleanExt;
          const mime = EXT_TO_MIME[entryExt] || "image/png";
          return `data:${mime};base64,${buf.toString("base64")}`;
        }
      } catch (err) {
        console.warn("[BackupService] Error reading avatar entry from zip:", err.message);
      }
    }
  }

  // Fallback: check local CasStore
  try {
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
    const zip = new AdmZip(filePath);
    const manifestEntry = zip.getEntry("manifest.json");
    if (!manifestEntry) {
      throw new Error("El archivo no es una copia de seguridad válida de Onicord (falta manifest.json).");
    }

    const raw = manifestEntry.getData().toString("utf8");
    const manifest = JSON.parse(raw);

    const fileStats = fs.statSync(filePath);

    let profile = manifest.profile || null;
    if (profile && profile.avatar) {
      const resolvedAvatar = resolveAvatarFromBackupZip(zip, profile.avatar, getUserDataPath());
      if (resolvedAvatar) {
        profile = { ...profile, avatar: resolvedAvatar };
      }
    }

    return {
      valid: true,
      filePath,
      fileName: path.basename(filePath),
      fileSize: fileStats.size,
      manifest,
      type: manifest.type || "backup",
      profile,
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

  const rawCats = categoriesToRestore || manifest.categories || ["profile", "servers", "addons", "stickers"];
  const cats = Array.isArray(rawCats)
    ? rawCats
    : Object.keys(rawCats).filter((k) => Boolean(rawCats[k]));
  const ud = getUserDataPath();

  try {
    const { DbManager } = require("../storage/dbManager.cjs");
    DbManager.getInstance(ud).closeAll();
  } catch (closeErr) {
    console.warn("[BackupService] Error closing DB handles before restore:", closeErr.message);
  }

  const prefixMap = {
    profile: "profile/",
    servers: "servers/",
    addons: "addons/",
    stickers: "stickers/",
  };

  const rootWithSep = path.resolve(ud) + path.sep;
  const totalEntries = entries.length;
  let processed = 0;

  for (const entry of entries) {
    processed++;
    if (entry.entryName === "manifest.json" || entry.isDirectory) continue;

    const normalizedEntry = entry.entryName.replace(/\\/g, "/");
    let matchedCat = null;
    let relPath = null;

    if (
      cats.includes("profile") &&
      (normalizedEntry.startsWith("db/") ||
        normalizedEntry.startsWith("cas/") ||
        normalizedEntry.startsWith("profile/"))
    ) {
      matchedCat = "profile";
      relPath = normalizedEntry.startsWith("profile/")
        ? normalizedEntry.slice("profile/".length)
        : normalizedEntry;
    } else {
      matchedCat = cats.find((c) => c !== "profile" && normalizedEntry.startsWith(prefixMap[c] || `${c}/`));
      if (matchedCat) {
        const prefix = prefixMap[matchedCat] || `${matchedCat}/`;
        if (matchedCat === "servers" && !normalizedEntry.startsWith("servers/servers/")) {
          relPath = normalizedEntry;
        } else {
          relPath = normalizedEntry.slice(prefix.length);
        }
      }
    }

    if (!matchedCat || !relPath) continue;

    try {
      // Prevenir vulnerabilidad Zip Slip / Path Traversal
      const safeRelPath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, "");
      const destPath = path.join(ud, safeRelPath);
      const resolvedDest = path.resolve(destPath);

      if (!resolvedDest.startsWith(rootWithSep)) {
        console.warn(`[BackupService] Bloqueada ruta insegura en backup: ${entry.entryName}`);
        continue;
      }

      await fsPromises.mkdir(path.dirname(resolvedDest), { recursive: true });
      if (resolvedDest.endsWith(".db")) {
        try {
          if (fs.existsSync(`${resolvedDest}-wal`)) await fsPromises.unlink(`${resolvedDest}-wal`);
          if (fs.existsSync(`${resolvedDest}-shm`)) await fsPromises.unlink(`${resolvedDest}-shm`);
        } catch {}
      }
      await fsPromises.writeFile(resolvedDest, entry.getData());

      const percent = Math.min(95, Math.round(20 + (processed / Math.max(totalEntries, 1)) * 75));
      sendProgress(`Restaurando ${path.basename(resolvedDest)}...`, percent);
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
