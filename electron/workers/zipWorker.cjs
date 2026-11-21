const { parentPort } = require("worker_threads");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const AdmZip = require("adm-zip");

const EXT_TO_MIME = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
};

function emitProgress(step, percent) {
  if (parentPort) {
    parentPort.postMessage({ type: "progress", step, percent });
  }
}

function addDirToZip(zip, srcDir, destPrefix, skipSqliteJournals = true) {
  if (!fs.existsSync(srcDir)) return;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const e of entries) {
    if (
      skipSqliteJournals &&
      (e.name.endsWith("-wal") || e.name.endsWith("-shm") || e.name.endsWith("-journal"))
    ) {
      continue;
    }
    const fullSrc = path.join(srcDir, e.name);
    const fullDest = `${destPrefix}/${e.name}`;
    if (e.isDirectory()) {
      addDirToZip(zip, fullSrc, fullDest, skipSqliteJournals);
    } else {
      try {
        const buf = fs.readFileSync(fullSrc);
        zip.addFile(fullDest, buf);
      } catch {}
    }
  }
}

async function handleBuildZipFile({ manifest, cpaths = [], targetFilePath = null, returnBuffer = false, skipSqliteJournals = true }) {
  const zip = new AdmZip();
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));

  const totalEntries = cpaths.length;
  let currentEntry = 0;

  for (const entry of cpaths) {
    currentEntry++;
    const progressPercent = Math.min(85, Math.round(15 + (currentEntry / Math.max(totalEntries, 1)) * 60));
    emitProgress(`Empaquetando ${entry.dest}...`, progressPercent);

    if (entry.isDir) {
      addDirToZip(zip, entry.src, entry.dest, skipSqliteJournals);
    } else {
      try {
        const buf = fs.readFileSync(entry.src);
        zip.addFile(entry.dest, buf);
      } catch {}
    }
  }

  if (targetFilePath) {
    emitProgress("Generando archivo .onipkg...", 90);
    await fsPromises.mkdir(path.dirname(targetFilePath), { recursive: true });
    zip.writeZip(targetFilePath);
    const stat = await fsPromises.stat(targetFilePath);
    return { filePath: targetFilePath, size: stat.size };
  }

  if (returnBuffer) {
    const buf = zip.toBuffer();
    return { buffer: buf };
  }

  return { ok: true };
}

function resolveAvatarFromZipEntries(zip, avatarRef) {
  if (!avatarRef || typeof avatarRef !== "string") return null;
  const trimmed = avatarRef.trim();
  if (trimmed.startsWith("data:image/") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

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
    if (!entry) entry = zip.getEntry(`cas/${hash}.${cleanExt}`);
    if (!entry) {
      entry = zip.getEntries().find((e) => !e.isDirectory && e.entryName.toLowerCase().includes(hash));
    }

    if (entry) {
      try {
        const buf = entry.getData();
        if (buf && buf.length > 0) {
          const entryExt = path.extname(entry.entryName).slice(1).toLowerCase() || cleanExt;
          const mime = EXT_TO_MIME[entryExt] || "image/png";
          return `data:${mime};base64,${buf.toString("base64")}`;
        }
      } catch {}
    }
  }
  return null;
}

function handleInspectZip({ filePath }) {
  const zip = new AdmZip(filePath);
  const manifestEntry = zip.getEntry("manifest.json");
  if (!manifestEntry) {
    throw new Error("El archivo no es una copia de seguridad válida de Onicord (falta manifest.json).");
  }
  const manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
  const fileStats = fs.statSync(filePath);
  const avatarFromZip = manifest?.profile?.avatar
    ? resolveAvatarFromZipEntries(zip, manifest.profile.avatar)
    : null;

  return {
    manifest,
    fileSize: fileStats.size,
    mtimeMs: fileStats.mtimeMs,
    avatarFromZip,
  };
}

function handleReadManifests({ filePaths = [] }) {
  const results = [];
  for (const filePath of filePaths) {
    try {
      const stat = fs.statSync(filePath);
      let manifest = null;
      try {
        const zip = new AdmZip(filePath);
        const mEntry = zip.getEntry("manifest.json");
        if (mEntry) {
          manifest = JSON.parse(mEntry.getData().toString("utf8"));
        }
      } catch {}
      results.push({
        filePath,
        size: stat.size,
        mtimeIso: stat.mtime.toISOString(),
        manifest,
      });
    } catch {}
  }
  return results;
}

async function handleRestoreZip({ filePath = null, zipBuffer = null, categoriesToRestore = null, userDataPath, mode = "backup" }) {
  const zip = filePath ? new AdmZip(filePath) : new AdmZip(Buffer.from(zipBuffer));
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

  const prefixMap = {
    profile: "profile/",
    servers: "servers/",
    addons: "addons/",
    stickers: "stickers/",
  };

  const rootWithSep = path.resolve(userDataPath) + path.sep;
  const totalEntries = entries.length;
  let processed = 0;

  for (const entry of entries) {
    processed++;
    if (entry.entryName === "manifest.json" || entry.isDirectory) continue;

    const normalizedEntry = entry.entryName.replace(/\\/g, "/");
    let matchedCat = null;
    let relPath = null;

    if (mode === "drive") {
      matchedCat = cats.find((c) => normalizedEntry.startsWith(prefixMap[c] || `${c}/`));
      if (matchedCat) {
        const prefix = prefixMap[matchedCat] || `${matchedCat}/`;
        relPath = normalizedEntry.slice(prefix.length);
      }
    } else if (
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
      const safeRelPath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, "");
      const destPath = path.join(userDataPath, safeRelPath);
      const resolvedDest = path.resolve(destPath);

      if (!resolvedDest.startsWith(rootWithSep)) {
        continue;
      }

      await fsPromises.mkdir(path.dirname(resolvedDest), { recursive: true });
      if (mode === "backup" && resolvedDest.endsWith(".db")) {
        try {
          if (fs.existsSync(`${resolvedDest}-wal`)) await fsPromises.unlink(`${resolvedDest}-wal`);
          if (fs.existsSync(`${resolvedDest}-shm`)) await fsPromises.unlink(`${resolvedDest}-shm`);
        } catch {}
      }
      await fsPromises.writeFile(resolvedDest, entry.getData());

      if (mode === "backup") {
        const percent = Math.min(95, Math.round(20 + (processed / Math.max(totalEntries, 1)) * 75));
        emitProgress(`Restaurando ${path.basename(resolvedDest)}...`, percent);
      }
    } catch {}
  }

  return { restored: true, categories: cats, manifest };
}

if (parentPort) {
  parentPort.on("message", async (msg) => {
    if (!msg || !msg.id) return;
    try {
      let result;
      if (msg.op === "buildZipFile") {
        result = await handleBuildZipFile(msg);
      } else if (msg.op === "inspectZip") {
        result = handleInspectZip(msg);
      } else if (msg.op === "readManifests") {
        result = handleReadManifests(msg);
      } else if (msg.op === "restoreZip") {
        result = await handleRestoreZip(msg);
      } else {
        throw new Error(`Unknown zipWorker op: ${msg.op}`);
      }
      parentPort.postMessage({ id: msg.id, result });
    } catch (err) {
      parentPort.postMessage({ id: msg.id, error: err?.message || String(err) });
    }
  });
}
