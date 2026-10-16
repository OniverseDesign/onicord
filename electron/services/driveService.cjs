const { app } = require("electron");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const AdmZip = require("adm-zip");
const driveAuthService = require("./driveAuthService.cjs");

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const APP_FOLDER = "Onicord Backups"; // appDataFolder — not visible in Drive UI
const BACKUP_MIME = "application/zip";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function getUserDataPath() {
  return app.getPath("userData");
}

function sendProgress(step, percent = 0) {
  try {
    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
      global.mainWindow.webContents.send("drive:progress", { step, percent });
    }
  } catch {}
}

async function driveGet(endpoint, params = {}) {
  const token = await driveAuthService.getValidToken();
  const url = new URL(`${DRIVE_API}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Drive API GET ${endpoint} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function driveDelete(fileId) {
  const token = await driveAuthService.getValidToken();
  const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) throw new Error(`Drive delete failed: ${res.status}`);
}

// ─── DIRECTORY SIZE CALCULATION ───────────────────────────────────────────────
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
        try { size += fs.statSync(full).size; } catch {}
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
    if (fs.existsSync(p)) paths.push({ src: p, dest: "profile/profile.json" });
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
async function estimateBackupSize(categories) {
  const ud = getUserDataPath();
  let total = 0;

  if (categories.includes("profile")) {
    try { total += fs.statSync(path.join(ud, "profile.json")).size; } catch {}
  }
  if (categories.includes("servers")) {
    try { total += fs.statSync(path.join(ud, "servers.json")).size; } catch {}
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

async function buildZip(categories) {
  const zip = new AdmZip();
  const cpaths = getCategoryPaths(categories);

  // Write manifest
  const manifest = {
    version: 1,
    createdAt: Date.now(),
    categories,
    appVersion: app.getVersion(),
  };
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));

  for (const entry of cpaths) {
    if (entry.isDir) {
      addDirToZip(zip, entry.src, entry.dest);
    } else {
      try {
        const buf = fs.readFileSync(entry.src);
        zip.addFile(entry.dest, buf);
      } catch {}
    }
  }

  return zip.toBuffer();
}

// ─── UPLOAD TO DRIVE ──────────────────────────────────────────────────────────
async function uploadToDrive(zipBuffer, filename, categories) {
  const token = await driveAuthService.getValidToken();

  const metadata = {
    name: filename,
    parents: ["appDataFolder"],
    appProperties: {
      categories: categories.join(","),
      onicordBackup: "true",
    },
  };

  const boundary = "onicord_drive_boundary";
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
  const dataPart = `--${boundary}\r\nContent-Type: ${BACKUP_MIME}\r\n\r\n`;
  const closePart = `\r\n--${boundary}--`;

  const body = Buffer.concat([
    Buffer.from(metaPart, "utf8"),
    Buffer.from(dataPart, "utf8"),
    zipBuffer,
    Buffer.from(closePart, "utf8"),
  ]);

  const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": body.length,
    },
    body,
  });

  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// ─── SETTINGS STORAGE ─────────────────────────────────────────────────────────
const SETTINGS_FILE = "drive-backup-settings.json";

function getSettingsFilePath() {
  return path.join(getUserDataPath(), SETTINGS_FILE);
}

function getBackupSettings() {
  try {
    const p = getSettingsFilePath();
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("[driveService] Error loading backup settings:", err);
  }
  return {
    autoBackupEnabled: false,
    frequency: "weekly",
    replacePrevious: false,
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
    console.error("[driveService] Error saving backup settings:", err);
    throw err;
  }
}

// ─── PUBLIC: CREATE BACKUP ────────────────────────────────────────────────────
async function createBackup(categories = ["profile", "servers", "addons", "stickers"], customName) {
  sendProgress("Preparando archivos...", 10);

  const settings = getBackupSettings();
  const catsToUse = categories || settings.selectedCategories || ["profile", "servers"];

  const date = new Date();
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const timeStr = `${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
  const filename = customName || `onicord-backup-${dateStr}-${timeStr}.zip`;

  sendProgress("Comprimiendo datos...", 30);
  const zipBuffer = await buildZip(catsToUse);

  sendProgress("Subiendo a Google Drive...", 60);
  const file = await uploadToDrive(zipBuffer, filename, catsToUse);

  // If replacePrevious is enabled, delete older backups except the newly created one!
  if (settings.replacePrevious) {
    try {
      const existing = await listBackups();
      for (const oldBackup of existing) {
        if (oldBackup.id !== file.id) {
          await deleteBackup(oldBackup.id);
        }
      }
    } catch (err) {
      console.error("[driveService] Error replacing previous backups:", err.message);
    }
  }

  sendProgress("Completado", 100);
  return { fileId: file.id, name: filename, size: zipBuffer.length };
}

// ─── PUBLIC: LIST BACKUPS ─────────────────────────────────────────────────────
async function listBackups() {
  const data = await driveGet("/files", {
    spaces: "appDataFolder",
    fields: "files(id,name,size,createdTime,appProperties)",
    orderBy: "createdTime desc",
    q: "appProperties has { key='onicordBackup' and value='true' }",
  });

  return (data.files || []).map((f) => ({
    id: f.id,
    name: f.name,
    size: parseInt(f.size || "0", 10),
    createdAt: f.createdTime,
    categories: (f.appProperties?.categories || "").split(",").filter(Boolean),
  }));
}

// ─── PUBLIC: DELETE BACKUP ────────────────────────────────────────────────────
async function deleteBackup(fileId) {
  await driveDelete(fileId);
  return { deleted: true };
}

// ─── PUBLIC: DOWNLOAD & RESTORE ───────────────────────────────────────────────
async function downloadBackup(fileId, categoriesToRestore = null) {
  sendProgress("Descargando backup...", 20);

  const token = await driveAuthService.getValidToken();
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  const arrayBuffer = await res.arrayBuffer();
  const zipBuffer = Buffer.from(arrayBuffer);

  sendProgress("Extrayendo archivos...", 50);

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  // Read manifest
  let manifest = {};
  const manifestEntry = entries.find((e) => e.entryName === "manifest.json");
  if (manifestEntry) {
    try { manifest = JSON.parse(manifestEntry.getData().toString("utf8")); } catch {}
  }

  const cats = categoriesToRestore || manifest.categories || ["profile", "servers", "addons", "stickers"];
  const ud = getUserDataPath();

  // Restore by prefix
  const prefixMap = {
    profile: "profile/",
    servers: "servers/",
    addons: "addons/",
    stickers: "stickers/",
  };

  for (const entry of entries) {
    if (entry.entryName === "manifest.json") continue;
    if (entry.isDirectory) continue;

    const matchedCat = cats.find((c) => entry.entryName.startsWith(prefixMap[c] || `${c}/`));
    if (!matchedCat) continue;

    try {
      // Strip the category prefix to get the actual relative path
      const prefix = prefixMap[matchedCat];
      const relPath = entry.entryName.slice(prefix.length);
      const destPath = path.join(ud, relPath);
      await fsPromises.mkdir(path.dirname(destPath), { recursive: true });
      await fsPromises.writeFile(destPath, entry.getData());
    } catch (err) {
      console.error(`[DriveService] Failed to restore entry ${entry.entryName}:`, err.message);
    }
  }

  sendProgress("Completado...", 100);
  return { restored: true, categories: cats, manifest };
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
    if (!driveAuthService.isConnected()) return;

    const settings = getBackupSettings();
    if (!settings.autoBackupEnabled) return;
    if (!settings.selectedCategories || settings.selectedCategories.length === 0) return;

    const interval = FREQUENCY_MS[settings.frequency] || FREQUENCY_MS.weekly;
    const now = Date.now();
    const elapsed = now - (settings.lastAutoBackupTime || 0);

    if (elapsed >= interval) {
      console.log(`[driveService] Triggering automatic background backup (Frequency: ${settings.frequency})...`);
      await createBackup(settings.selectedCategories);
      saveBackupSettings({ lastAutoBackupTime: now });
      console.log("[driveService] Automatic background backup completed.");
    }
  } catch (err) {
    console.error("[driveService] Auto backup error:", err.message);
  }
}

// Start auto backup scheduler
function startAutoBackupScheduler() {
  setTimeout(() => checkAndRunAutoBackup(), 10000);
  setInterval(() => checkAndRunAutoBackup(), 60 * 60 * 1000);
}

startAutoBackupScheduler();

module.exports = {
  getBackupSettings,
  saveBackupSettings,
  estimateBackupSize,
  createBackup,
  listBackups,
  deleteBackup,
  downloadBackup,
  checkAndRunAutoBackup,
};
