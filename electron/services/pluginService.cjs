const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

function isNewerVersion(latest, current) {
  if (!latest || !current) return false;
  const clean = (v) =>
    String(v)
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

class PluginService {
  constructor() {
    this._pluginsCache = null;
    this._pluginsCacheTime = 0;
  }

  _invalidatePluginsCache() {
    this._pluginsCache = null;
    this._pluginsCacheTime = 0;
  }

  getPluginsDir() {
    const dir = path.join(app.getPath("userData"), "plugins");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  getPluginPath(pluginId) {
    if (!pluginId) return this.getPluginsDir();
    const safeId = String(pluginId).replace(/[^a-zA-Z0-9._-]/g, "");
    const found = this.findPluginDir(safeId);
    if (found) return found;
    return path.join(this.getPluginsDir(), safeId);
  }

  computeHash(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  resolvePluginIcon(iconProp, dirName) {
    if (!iconProp || typeof iconProp !== "string") return null;
    const trimmed = iconProp.trim();
    if (!trimmed) return null;

    if (
      trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("data:") ||
      trimmed.startsWith("onicord-media://")
    ) {
      return trimmed;
    }

    try {
      const pluginFolder = this.findPluginDir(dirName) || path.join(this.getPluginsDir(), dirName);
      if (!pluginFolder || !fs.existsSync(pluginFolder)) {
        return null;
      }

      const cleanRelative = trimmed.replace(/^[\/\\]+/, "").replace(/^\.\//, "");
      let targetPath = path.join(pluginFolder, cleanRelative);

      if (!fs.existsSync(targetPath)) {
        const baseName = path.basename(cleanRelative).toLowerCase();
        const findFileRecursive = (dir) => {
          try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
              const p = path.join(dir, entry.name);
              if (entry.isDirectory()) {
                const found = findFileRecursive(p);
                if (found) return found;
              } else if (entry.isFile() && entry.name.toLowerCase() === baseName) {
                return p;
              }
            }
          } catch (e) {}
          return null;
        };
        const fallbackPath = findFileRecursive(pluginFolder);
        if (fallbackPath) {
          targetPath = fallbackPath;
        }
      }

      if (fs.existsSync(targetPath)) {
        const ext = path.extname(targetPath).toLowerCase().replace(".", "");
        let mimeType = "image/png";
        if (ext === "svg") mimeType = "image/svg+xml";
        else if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
        else if (ext === "gif") mimeType = "image/gif";
        else if (ext === "webp") mimeType = "image/webp";
        else if (ext === "ico") mimeType = "image/x-icon";

        let fileBuf = fs.readFileSync(targetPath);

        // AUTO-REPAIR: If file on disk was corrupted by plain Base64 text write
        if (fileBuf && fileBuf.length > 0 && ext !== "svg") {
          const sampleText = fileBuf.toString("utf-8", 0, Math.min(fileBuf.length, 120)).trim();
          if (sampleText.startsWith("data:image/") || /^[A-Za-z0-9+/=]{30,}/.test(sampleText)) {
            try {
              const fullText = fileBuf.toString("utf-8").trim();
              let cleanB64 = fullText.includes(",") ? fullText.split(",")[1] : fullText;
              cleanB64 = cleanB64.replace(/\s+/g, "");
              const repairedBuf = Buffer.from(cleanB64, "base64");
              if (repairedBuf.length > 0) {
                fs.writeFileSync(targetPath, repairedBuf);
                fileBuf = repairedBuf;
                console.log(`[PLUGIN SERVICE] Auto-repaired corrupted image file on disk: ${targetPath}`);
              }
            } catch (e) {
              console.error("[PLUGIN SERVICE] Failed auto-repairing image:", e);
            }
          }
        }

        if (fileBuf && fileBuf.length > 0) {
          const b64 = fileBuf.toString("base64");
          return `data:${mimeType};base64,${b64}`;
        }
      } else {
        console.warn(`[PLUGIN SERVICE] Icon file "${trimmed}" not found in plugin dir: ${pluginFolder}`);
      }
    } catch (e) {
      console.error("[PLUGIN SERVICE] Error resolving plugin icon:", e);
    }

    return null;
  }

  _getAddonsDb() {
    const { DbManager } = require("../storage/dbManager.cjs");
    return DbManager.getInstance(app.getPath("userData")).getGlobalDb("addons");
  }

  _getUninstalledPlugins() {
    try {
      const db = this._getAddonsDb();
      const rows = db
        .prepare("SELECT plugin_id FROM installed_addons WHERE uninstalled = 1")
        .all();
      return rows.map((r) => r.plugin_id);
    } catch (_) {}
    return [];
  }

  _addUninstalledPlugin(pluginId) {
    if (!pluginId) return;
    const target = String(pluginId).trim();
    const now = Date.now();
    try {
      const db = this._getAddonsDb();
      db.prepare(`
        INSERT INTO installed_addons (
          plugin_id, name, version, author, enabled_globally, uninstalled, manifest_json, installed_at, updated_at
        ) VALUES (?, ?, '0.0.0', NULL, 0, 1, '{}', ?, ?)
        ON CONFLICT(plugin_id) DO UPDATE SET
          uninstalled = 1,
          enabled_globally = 0,
          updated_at = excluded.updated_at
      `).run(target, target, now, now);
    } catch (_) {}
  }

  _removeUninstalledPlugin(pluginId) {
    if (!pluginId) return;
    const target = String(pluginId).trim().toLowerCase();
    try {
      const db = this._getAddonsDb();
      db.prepare(`
        UPDATE installed_addons
        SET uninstalled = 0, enabled_globally = 1, updated_at = ?
        WHERE LOWER(plugin_id) = ?
      `).run(Date.now(), target);
    } catch (_) {}
  }

  async listPlugins() {
    const now = Date.now();
    if (this._pluginsCache && now - this._pluginsCacheTime < 3000) {
      return this._pluginsCache;
    }

    const uninstalledList = this._getUninstalledPlugins().map((id) => String(id).trim().toLowerCase());
    const pluginsDir = this.getPluginsDir();
    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
    const plugins = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        let activeDirName = entry.name;
        if (uninstalledList.includes(activeDirName.toLowerCase())) continue;

        let currentDirPath = path.join(pluginsDir, entry.name);
        const manifestPath = path.join(currentDirPath, "manifest.json");

        if (fs.existsSync(manifestPath)) {
          try {
            const raw = fs.readFileSync(manifestPath, "utf-8");
            const manifest = JSON.parse(raw);

            // AUTO-UNIFICATION: Force directory name on disk to strictly match manifest.id
            const cleanId = manifest.id ? manifest.id.replace(/[^a-zA-Z0-9._-]/g, "") : activeDirName;
            if (uninstalledList.includes(cleanId.toLowerCase()) || (manifest.id && uninstalledList.includes(String(manifest.id).trim().toLowerCase()))) continue;

            if (cleanId && activeDirName !== cleanId) {
              const targetDirPath = path.join(pluginsDir, cleanId);
              try {
                if (fs.existsSync(targetDirPath)) {
                  fs.rmSync(targetDirPath, { recursive: true, force: true });
                }
                fs.renameSync(currentDirPath, targetDirPath);
                activeDirName = cleanId;
                currentDirPath = targetDirPath;
                console.log(`[PLUGIN SERVICE] Auto-renamed plugin folder from "${entry.name}" to "${cleanId}" to match manifest.id`);
              } catch (renameErr) {
                console.error(`[PLUGIN SERVICE] Could not rename folder "${entry.name}" to "${cleanId}":`, renameErr);
              }
            }

            const updatedManifestPath = path.join(currentDirPath, "manifest.json");
            const scriptPath = path.join(currentDirPath, manifest.main || "index.js");
            const code = fs.existsSync(scriptPath) ? fs.readFileSync(scriptPath, "utf-8") : "";
            const hash = this.computeHash(raw + code);

            const rawIcon = manifest.icon || manifest.avatar || null;
            const resolvedIcon = this.resolvePluginIcon(rawIcon, activeDirName);

            plugins.push({
              ...manifest,
              icon: resolvedIcon,
              rawIcon,
              dirName: activeDirName,
              hash,
              installedAt: fs.existsSync(updatedManifestPath) ? fs.statSync(updatedManifestPath).mtimeMs : Date.now(),
              enabled: manifest.enabled !== false,
            });
          } catch (err) {
            console.error(`[PLUGIN SERVICE] Error leyendo manifiesto en ${entry.name}:`, err);
          }
        }
      }
    }

    // Auto-discover development addons from local workspace addons/ folder
    try {
      const workspaceAddonsDir = path.join(app.getAppPath(), "addons");
      if (fs.existsSync(workspaceAddonsDir)) {
        const workspaceEntries = fs.readdirSync(workspaceAddonsDir, { withFileTypes: true });
        for (const entry of workspaceEntries) {
          if (
            entry.isDirectory() &&
            entry.name !== "plugins" &&
            entry.name !== "docs"
          ) {
            const manifestPath = path.join(workspaceAddonsDir, entry.name, "manifest.json");
            if (fs.existsSync(manifestPath)) {
              try {
                const raw = fs.readFileSync(manifestPath, "utf-8");
                const manifest = JSON.parse(raw);
                const pluginId = manifest.id || entry.name;
                if (
                  uninstalledList.includes(String(pluginId).trim().toLowerCase()) ||
                  uninstalledList.includes(String(entry.name).trim().toLowerCase())
                ) {
                  continue;
                }
                const alreadyIncluded = plugins.some((p) => p.id === pluginId);
                if (!alreadyIncluded) {
                  const rawIcon = manifest.icon || manifest.avatar || null;
                  const resolvedIcon = this.resolvePluginIcon(rawIcon, entry.name);
                  plugins.push({
                    ...manifest,
                    icon: resolvedIcon,
                    rawIcon,
                    dirName: entry.name,
                    hash: "dev-addon",
                    installedAt: fs.statSync(manifestPath).mtimeMs,
                    enabled: manifest.enabled !== false,
                    isWorkspaceDev: true,
                  });
                }
              } catch (_) {}
            }
          }
        }
      }
    } catch (_) {}

    this._pluginsCache = plugins;
    this._pluginsCacheTime = Date.now();
    return plugins;
  }

  async installPluginArchive(archiveFilePath) {
    if (!fs.existsSync(archiveFilePath)) {
      throw new Error("El archivo .onipkg no existe");
    }

    const compressed = fs.readFileSync(archiveFilePath);
    let decompressed;
    try {
      decompressed = zlib.gunzipSync(compressed, { maxOutputLength: 50 * 1024 * 1024 }).toString("utf-8");
    } catch {
      decompressed = compressed.toString("utf-8");
    }

    const packageData = JSON.parse(decompressed);
    if (!packageData.manifest || !packageData.manifest.id) {
      throw new Error("El paquete .onipkg no contiene un manifest.json válido con 'id'");
    }

    const manifest = packageData.manifest;
    const pluginId = manifest.id.replace(/[^a-zA-Z0-9._-]/g, "");
    const targetDir = path.join(this.getPluginsDir(), pluginId);

    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    fs.mkdirSync(targetDir, { recursive: true });

    fs.writeFileSync(
      path.join(targetDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
      "utf-8"
    );

    if (packageData.files) {
      const targetRoot = path.resolve(targetDir) + path.sep;
      for (const [filename, fileEntry] of Object.entries(packageData.files)) {
        const safeName = path.normalize(filename).replace(/^(\.\.[\/\\])+/, "");
        const filePath = path.resolve(targetDir, safeName);
        if (!path.resolve(filePath).startsWith(targetRoot)) {
          throw new Error("Ruta de archivo insegura en el paquete (Zip-Slip bloqueado).");
        }
        const fileDir = path.dirname(filePath);
        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }

        const ext = path.extname(filePath).toLowerCase();
        const isBinary = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".bmp", ".ttf", ".woff", ".mp3"].includes(ext);

        if (typeof fileEntry === "string") {
          if (isBinary) {
            try {
              let cleanStr = fileEntry.trim();
              if (cleanStr.includes(",")) cleanStr = cleanStr.split(",")[1];
              fs.writeFileSync(filePath, Buffer.from(cleanStr, "base64"));
            } catch (e) {
              fs.writeFileSync(filePath, fileEntry, "utf-8");
            }
          } else {
            fs.writeFileSync(filePath, fileEntry, "utf-8");
          }
        } else if (fileEntry && fileEntry.encoding === "base64") {
          fs.writeFileSync(filePath, Buffer.from(fileEntry.content, "base64"));
        } else if (fileEntry && fileEntry.content !== undefined) {
          if (fileEntry.encoding === "base64" || isBinary) {
            let cleanStr = String(fileEntry.content).trim();
            if (cleanStr.includes(",")) cleanStr = cleanStr.split(",")[1];
            fs.writeFileSync(filePath, Buffer.from(cleanStr, "base64"));
          } else {
            fs.writeFileSync(filePath, fileEntry.content, fileEntry.encoding || "utf-8");
          }
        }
      }
    }

    this._removeUninstalledPlugin(manifest.id);
    this._removeUninstalledPlugin(pluginId);
    this._invalidatePluginsCache();
    console.log(`[PLUGIN SERVICE] Complemento instalado con éxito: ${manifest.name} (${pluginId})`);
    return { success: true, manifest };
  }

  async downloadAndInstallPlugin(pluginId, timeoutMs = 5000) {
    if (!pluginId || typeof pluginId !== "string") {
      throw new Error("ID de complemento no válido");
    }

    const cleanId = pluginId.replace(/[^a-zA-Z0-9._-]/g, "");
    const REPO_BASE = "https://raw.githubusercontent.com/OniverseDesign/onicord-addons/main";
    const packageUrl = `${REPO_BASE}/plugins/${cleanId}/package.onipkg`;

    let buffer = null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`[PLUGIN SERVICE] Intentando descargar complemento '${cleanId}' desde GitHub...`);
      const resp = await fetch(packageUrl, { signal: controller.signal });
      clearTimeout(timer);

      if (resp.ok) {
        const arrayBuffer = await resp.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
      } else {
        throw new Error(`HTTP ${resp.status}`);
      }
    } catch (err) {
      clearTimeout(timer);
      const localPackagePath = path.join(app.getAppPath(), "addons", "plugins", cleanId, "package.onipkg");
      if (fs.existsSync(localPackagePath)) {
        console.log(`[PLUGIN SERVICE] Fallback: cargando paquete local .onipkg para '${cleanId}'`);
        buffer = fs.readFileSync(localPackagePath);
      } else {
        const workspaceAddonDir = path.join(app.getAppPath(), "addons", cleanId);
        if (fs.existsSync(workspaceAddonDir) && fs.existsSync(path.join(workspaceAddonDir, "manifest.json"))) {
          console.log(`[PLUGIN SERVICE] Fallback: cargando directorio de complemento local '${cleanId}'`);
          const targetDir = path.join(this.getPluginsDir(), cleanId);
          if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
          fs.cpSync(workspaceAddonDir, targetDir, { recursive: true });
          const manifest = JSON.parse(fs.readFileSync(path.join(targetDir, "manifest.json"), "utf-8"));
          this._removeUninstalledPlugin(cleanId);
          this._removeUninstalledPlugin(pluginId);
          if (manifest.id) this._removeUninstalledPlugin(manifest.id);
          this._invalidatePluginsCache();
          return { success: true, manifest };
        }
        if (err.name === "AbortError") {
          throw new Error(`Timeout de ${timeoutMs / 1000}s alcanzado al intentar descargar '${cleanId}' desde GitHub.`);
        }
        throw new Error(`El complemento '${cleanId}' no está disponible en GitHub ni localmente: ${err.message}`);
      }
    }

    try {
      let decompressed;
      try {
        decompressed = zlib.gunzipSync(buffer, { maxOutputLength: 50 * 1024 * 1024 }).toString("utf-8");
      } catch {
        decompressed = buffer.toString("utf-8");
      }

      const packageData = JSON.parse(decompressed);
      if (!packageData.manifest || !packageData.manifest.id) {
        throw new Error("El paquete descargado de GitHub no contiene un manifiesto válido");
      }

      const manifest = packageData.manifest;
      const targetDir = path.join(this.getPluginsDir(), cleanId);

      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDir, { recursive: true });

      fs.writeFileSync(
        path.join(targetDir, "manifest.json"),
        JSON.stringify(manifest, null, 2),
        "utf-8"
      );

      if (packageData.files) {
        const targetRoot = path.resolve(targetDir) + path.sep;
        for (const [filename, fileEntry] of Object.entries(packageData.files)) {
          const safeName = path.normalize(filename).replace(/^(\.\.[\/\\])+/, "");
          const filePath = path.join(targetDir, safeName);
          if (!path.resolve(filePath).startsWith(targetRoot)) {
            throw new Error("Ruta de archivo insegura en el paquete (Zip-Slip bloqueado).");
          }
          const fileDir = path.dirname(filePath);
          if (!fs.existsSync(fileDir)) {
            fs.mkdirSync(fileDir, { recursive: true });
          }

          const ext = path.extname(filePath).toLowerCase();
          const isBinary = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".bmp", ".ttf", ".woff", ".mp3"].includes(ext);

          if (typeof fileEntry === "string") {
            if (isBinary) {
              try {
                let cleanStr = fileEntry.trim();
                if (cleanStr.includes(",")) cleanStr = cleanStr.split(",")[1];
                fs.writeFileSync(filePath, Buffer.from(cleanStr, "base64"));
              } catch (e) {
                fs.writeFileSync(filePath, fileEntry, "utf-8");
              }
            } else {
              fs.writeFileSync(filePath, fileEntry, "utf-8");
            }
          } else if (fileEntry && fileEntry.encoding === "base64") {
            fs.writeFileSync(filePath, Buffer.from(fileEntry.content, "base64"));
          } else if (fileEntry && fileEntry.content !== undefined) {
            if (fileEntry.encoding === "base64" || isBinary) {
              let cleanStr = String(fileEntry.content).trim();
              if (cleanStr.includes(",")) cleanStr = cleanStr.split(",")[1];
              fs.writeFileSync(filePath, Buffer.from(cleanStr, "base64"));
            } else {
              fs.writeFileSync(filePath, fileEntry.content, fileEntry.encoding || "utf-8");
            }
          }
        }
      }

      this._removeUninstalledPlugin(cleanId);
      this._removeUninstalledPlugin(pluginId);
      if (manifest.id) this._removeUninstalledPlugin(manifest.id);
      this._invalidatePluginsCache();
      console.log(`[PLUGIN SERVICE] Complemento descargado e instalado con éxito desde GitHub: ${manifest.name} (${cleanId})`);
      return { success: true, manifest };
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new Error(`Timeout de ${timeoutMs / 1000}s alcanzado al intentar descargar '${cleanId}' desde GitHub.`);
      }
      throw err;
    }
  }

  async packPluginFolder(folderPath, outputPath) {
    const manifestPath = path.join(folderPath, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      throw new Error("La carpeta no contiene un manifest.json válido");
    }

    const rawManifest = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(rawManifest);

    const files = {};
    const readDirRecursive = (currentDir, baseDir) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");

        if (entry.name === "manifest.json" || entry.name.startsWith(".")) continue;

        if (entry.isDirectory()) {
          readDirRecursive(fullPath, baseDir);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          const isText = [".js", ".json", ".txt", ".md", ".css", ".html", ".svg"].includes(ext);
          if (isText) {
            files[relPath] = {
              content: fs.readFileSync(fullPath, "utf-8"),
              encoding: "utf-8",
            };
          } else {
            files[relPath] = {
              content: fs.readFileSync(fullPath).toString("base64"),
              encoding: "base64",
            };
          }
        }
      }
    };

    readDirRecursive(folderPath, folderPath);

    const packageData = {
      formatVersion: 1,
      type: "plugin",
      version: 1,
      manifest,
      files,
      createdAt: new Date().toISOString(),
    };

    const jsonString = JSON.stringify(packageData);
    const compressed = zlib.gzipSync(Buffer.from(jsonString, "utf-8"));

    const finalOutput = outputPath || path.join(folderPath, `${manifest.id}.onipkg`);
    fs.writeFileSync(finalOutput, compressed);

    console.log(`[PLUGIN SERVICE] Complemento empaquetado en: ${finalOutput}`);
    return { success: true, outputPath: finalOutput };
  }

  findPluginDir(pluginIdOrDirName) {
    if (!pluginIdOrDirName) return null;
    const pluginsDir = this.getPluginsDir();

    // 1. Direct directory match in pluginsDir
    if (fs.existsSync(pluginsDir)) {
      const directPath = path.join(pluginsDir, pluginIdOrDirName);
      if (fs.existsSync(directPath)) return directPath;

      const safeId = String(pluginIdOrDirName).replace(/[^a-zA-Z0-9._-]/g, "");
      const safePath = path.join(pluginsDir, safeId);
      if (fs.existsSync(safePath)) return safePath;

      // 2. Scan all subdirectories to find directory whose manifest.json has matching id
      try {
        const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const manifestPath = path.join(pluginsDir, entry.name, "manifest.json");
            if (fs.existsSync(manifestPath)) {
              try {
                const raw = fs.readFileSync(manifestPath, "utf-8");
                const manifest = JSON.parse(raw);
                if (manifest.id === pluginIdOrDirName || entry.name === pluginIdOrDirName) {
                  return path.join(pluginsDir, entry.name);
                }
              } catch (e) {}
            }
          }
        }
      } catch (e) {}
    }

    // 3. Fallback to local workspace addons directory if present
    try {
      const workspaceAddonsDir = path.join(app.getAppPath(), "addons");
      if (fs.existsSync(workspaceAddonsDir)) {
        const directWorkspace = path.join(workspaceAddonsDir, pluginIdOrDirName);
        if (fs.existsSync(directWorkspace) && fs.existsSync(path.join(directWorkspace, "manifest.json"))) {
          return directWorkspace;
        }

        const entries = fs.readdirSync(workspaceAddonsDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const manifestPath = path.join(workspaceAddonsDir, entry.name, "manifest.json");
            if (fs.existsSync(manifestPath)) {
              try {
                const raw = fs.readFileSync(manifestPath, "utf-8");
                const manifest = JSON.parse(raw);
                if (manifest.id === pluginIdOrDirName || entry.name === pluginIdOrDirName) {
                  return path.join(workspaceAddonsDir, entry.name);
                }
              } catch (e) {}
            }
          }
        }
      }
    } catch (_) {}

    return null;
  }

  async uninstallPlugin(pluginId) {
    if (global.pluginSandboxService) {
      try {
        global.pluginSandboxService.unloadPlugin(pluginId);
      } catch (e) {}
    }

    this._addUninstalledPlugin(pluginId);

    const targetDir = this.findPluginDir(pluginId);
    if (targetDir && fs.existsSync(targetDir)) {
      const dirName = path.basename(targetDir);
      this._addUninstalledPlugin(dirName);

      try {
        fs.rmSync(targetDir, { recursive: true, force: true });
        console.log(`[PLUGIN SERVICE] Complemento desinstalado de ${targetDir}`);
      } catch (err) {
        console.warn(`[PLUGIN SERVICE] No se pudo borrar ${targetDir} en disco (posible archivo en uso), pero se marcó desinstalado:`, err.message);
      }
      this._invalidatePluginsCache();
      return { success: true };
    }

    this._invalidatePluginsCache();
    return { success: true };
  }

  getPlugin(id) {
    if (!id) return null;
    const targetDir = this.findPluginDir(id);
    if (targetDir) {
      const manifestPath = path.join(targetDir, "manifest.json");
      if (fs.existsSync(manifestPath)) {
        try {
          const raw = fs.readFileSync(manifestPath, "utf-8");
          const manifest = JSON.parse(raw);
          const rawIcon = manifest.icon || manifest.avatar || null;
          const resolvedIcon = this.resolvePluginIcon(rawIcon, path.basename(targetDir));
          return {
            ...manifest,
            id: manifest.id || id,
            dir: targetDir,
            icon: resolvedIcon,
            rawIcon,
            manifest,
          };
        } catch (_) {}
      }
    }
    return null;
  }

  async togglePlugin(pluginId, enabled) {
    const targetDir = this.findPluginDir(pluginId);
    if (targetDir) {
      const manifestPath = path.join(targetDir, "manifest.json");
      if (fs.existsSync(manifestPath)) {
        const raw = fs.readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(raw);
        manifest.enabled = enabled;
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
        try {
          const db = this._getAddonsDb();
          const now = Date.now();
          db.prepare(`
            INSERT INTO installed_addons (
              plugin_id, name, version, author, enabled_globally, uninstalled, manifest_json, installed_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
            ON CONFLICT(plugin_id) DO UPDATE SET
              enabled_globally = excluded.enabled_globally,
              manifest_json = excluded.manifest_json,
              updated_at = excluded.updated_at
          `).run(
            String(manifest.id || pluginId),
            String(manifest.name || pluginId),
            String(manifest.version || "1.0.0"),
            manifest.author || null,
            enabled ? 1 : 0,
            JSON.stringify(manifest),
            now,
            now
          );
        } catch (_) {}
        this._invalidatePluginsCache();
        return { success: true, enabled };
      }
    }
    return { success: false, error: "Manifest no encontrado" };
  }

  _resolveStorageDb(roomCode = null) {
    const { DbManager } = require("../storage/dbManager.cjs");
    const dbMgr = DbManager.getInstance(app.getPath("userData"));
    const targetCode = String(roomCode || global.roomManager?.roomCode || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-F0-9]/g, "");
    if (targetCode && /^[A-F0-9]{8}$/.test(targetCode)) {
      return {
        db: dbMgr.getServerDb(targetCode, "addons"),
        table: "addon_server_storage",
      };
    }
    return {
      db: dbMgr.getGlobalDb("addons"),
      table: "global_addon_storage",
    };
  }

  getPluginStorage(pluginId, key, roomCode = null) {
    try {
      const safeId = String(pluginId || "unknown").trim();
      const { db, table } = this._resolveStorageDb(roomCode);
      if (key) {
        const row = db
          .prepare(`SELECT value_json FROM ${table} WHERE plugin_id = ? AND storage_key = ?`)
          .get(safeId, String(key));
        return row ? JSON.parse(row.value_json) : null;
      } else {
        const rows = db
          .prepare(`SELECT storage_key, value_json FROM ${table} WHERE plugin_id = ?`)
          .all(safeId);
        if (rows.length === 0) return null;
        const store = {};
        for (const r of rows) {
          try {
            store[r.storage_key] = JSON.parse(r.value_json);
          } catch {}
        }
        return store;
      }
    } catch (err) {
      console.error(`[PLUGIN SERVICE] Error reading SQLite storage for ${pluginId}:`, err);
    }
    return null;
  }

  setPluginStorage(pluginId, key, value, roomCode = null) {
    try {
      const safeId = String(pluginId || "unknown").trim();
      if (!key) return;
      const { db, table } = this._resolveStorageDb(roomCode);
      db.prepare(`
        INSERT OR REPLACE INTO ${table} (plugin_id, storage_key, value_json, updated_at)
        VALUES (?, ?, ?, ?)
      `).run(safeId, String(key), JSON.stringify(value), Date.now());
    } catch (err) {
      console.error(`[PLUGIN SERVICE] Error writing SQLite storage for ${pluginId}:`, err);
    }
  }

  async checkPluginUpdates() {
    const REPO_CATALOG = "https://raw.githubusercontent.com/OniverseDesign/onicord-addons/main/index.json";
    try {
      const resp = await fetch(REPO_CATALOG, {
        headers: { "User-Agent": "Onicord-App" },
      });
      if (!resp.ok) {
        return { success: false, error: `HTTP ${resp.status}`, updates: [] };
      }
      const data = await resp.json();
      const catalogPlugins = Array.isArray(data?.plugins) ? data.plugins : [];
      const localPlugins = await this.listPlugins();

      const updates = [];
      for (const local of localPlugins) {
        const catalogEntry = catalogPlugins.find((cp) => cp.id === local.id);
        if (catalogEntry && isNewerVersion(catalogEntry.version, local.version)) {
          updates.push({
            id: local.id,
            name: catalogEntry.name || local.name,
            currentVersion: local.version || "1.0",
            latestVersion: catalogEntry.version,
            description: catalogEntry.description || local.description,
            icon: catalogEntry.icon || local.icon,
          });
        }
      }
      return { success: true, updates };
    } catch (err) {
      console.warn("[PLUGIN SERVICE] Error comprobando actualizaciones de complementos:", err.message);
      return { success: false, error: err.message, updates: [] };
    }
  }

  async updatePlugin(pluginId) {
    if (!pluginId) throw new Error("ID de complemento no válido");
    console.log(`[PLUGIN SERVICE] Iniciando actualización del complemento: ${pluginId}`);
    const installResult = await this.downloadAndInstallPlugin(pluginId);

    // Hot-reload the plugin in sandbox
    if (global.pluginSandboxService) {
      try {
        global.pluginSandboxService.unloadPlugin(pluginId);
        const updatedPlugins = await this.listPlugins();
        const updated = updatedPlugins.find((p) => p.id === pluginId);
        if (updated && updated.enabled !== false) {
          global.pluginSandboxService.runPlugin(updated);
        }
      } catch (reloadErr) {
        console.error(`[PLUGIN SERVICE] Error reiniciando complemento ${pluginId} en sandbox:`, reloadErr);
      }
    }

    return installResult;
  }

  async updateAllPlugins() {
    const checkResult = await this.checkPluginUpdates();
    if (!checkResult.success || !checkResult.updates || checkResult.updates.length === 0) {
      return { success: true, updatedCount: 0, updates: [] };
    }

    const results = [];
    for (const update of checkResult.updates) {
      try {
        await this.updatePlugin(update.id);
        results.push({ id: update.id, success: true, version: update.latestVersion });
      } catch (err) {
        console.error(`[PLUGIN SERVICE] Error actualizando complemento ${update.id}:`, err);
        results.push({ id: update.id, success: false, error: err.message });
      }
    }

    const updatedCount = results.filter((r) => r.success).length;
    return { success: true, updatedCount, results };
  }
}

module.exports = new PluginService();
