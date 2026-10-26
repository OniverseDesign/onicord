const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const zlib = require("zlib");

class PluginService {
  getPluginsDir() {
    const dir = path.join(app.getPath("userData"), "plugins");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  getPluginPath(pluginId) {
    const safeId = pluginId.replace(/[^a-zA-Z0-9._-]/g, "");
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

  async listPlugins() {
    const pluginsDir = this.getPluginsDir();
    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true });
    const plugins = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        let activeDirName = entry.name;
        let currentDirPath = path.join(pluginsDir, entry.name);
        const manifestPath = path.join(currentDirPath, "manifest.json");

        if (fs.existsSync(manifestPath)) {
          try {
            const raw = fs.readFileSync(manifestPath, "utf-8");
            const manifest = JSON.parse(raw);

            // AUTO-UNIFICATION: Force directory name on disk to strictly match manifest.id
            const cleanId = manifest.id ? manifest.id.replace(/[^a-zA-Z0-9._-]/g, "") : activeDirName;
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

    return plugins;
  }

  async installPluginArchive(archiveFilePath) {
    if (!fs.existsSync(archiveFilePath)) {
      throw new Error("El archivo .onipkg no existe");
    }

    const compressed = fs.readFileSync(archiveFilePath);
    let decompressed;
    try {
      decompressed = zlib.gunzipSync(compressed).toString("utf-8");
    } catch {
      decompressed = compressed.toString("utf-8");
    }

    const packageData = JSON.parse(decompressed);
    if (!packageData.manifest || !packageData.manifest.id) {
      throw new Error("El paquete .onipkg no contiene un manifest.json válido con 'id'");
    }

    const manifest = packageData.manifest;
    const pluginId = manifest.id.replace(/[^a-zA-Z0-9._-]/g, "");
    const targetDir = this.getPluginPath(pluginId);

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
      for (const [filename, fileEntry] of Object.entries(packageData.files)) {
        const safeName = path.normalize(filename).replace(/^(\.\.[\/\\])+/, "");
        const filePath = path.join(targetDir, safeName);
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
          const targetDir = this.getPluginPath(cleanId);
          if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
          fs.cpSync(workspaceAddonDir, targetDir, { recursive: true });
          const manifest = JSON.parse(fs.readFileSync(path.join(targetDir, "manifest.json"), "utf-8"));
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
        decompressed = zlib.gunzipSync(buffer).toString("utf-8");
      } catch {
        decompressed = buffer.toString("utf-8");
      }

      const packageData = JSON.parse(decompressed);
      if (!packageData.manifest || !packageData.manifest.id) {
        throw new Error("El paquete descargado de GitHub no contiene un manifiesto válido");
      }

      const manifest = packageData.manifest;
      const targetDir = this.getPluginPath(cleanId);

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
        for (const [filename, fileEntry] of Object.entries(packageData.files)) {
          const safeName = path.normalize(filename).replace(/^(\.\.[\/\\])+/, "");
          const filePath = path.join(targetDir, safeName);
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
    if (!fs.existsSync(pluginsDir)) return null;

    // 1. Direct directory match
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

    // 3. Fallback to local workspace addons directory if present
    try {
      const workspaceAddonDir = path.join(app.getAppPath(), "addons", pluginIdOrDirName);
      if (fs.existsSync(workspaceAddonDir) && fs.existsSync(path.join(workspaceAddonDir, "manifest.json"))) {
        return workspaceAddonDir;
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

    const targetDir = this.findPluginDir(pluginId);
    if (targetDir && fs.existsSync(targetDir)) {
      try {
        fs.rmSync(targetDir, { recursive: true, force: true });
        console.log(`[PLUGIN SERVICE] Complemento desinstalado: ${targetDir}`);
        return { success: true };
      } catch (err) {
        console.error(`[PLUGIN SERVICE] Error desinstalando complemento ${targetDir}:`, err);
        try {
          await new Promise((resolve) => setTimeout(resolve, 150));
          fs.rmSync(targetDir, { recursive: true, force: true });
          return { success: true };
        } catch (retryErr) {
          return { success: false, error: retryErr.message };
        }
      }
    }
    return { success: false, error: "Plugin not found on disk" };
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
        return { success: true, enabled };
      }
    }
    return { success: false, error: "Manifest no encontrado" };
  }

  getPluginStoragePath(pluginId) {
    const dataDir = path.join(this.getPluginsDir(), ".storage");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, `${pluginId}.json`);
  }

  getPluginStorage(pluginId, key) {
    try {
      const filePath = this.getPluginStoragePath(pluginId);
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        const store = JSON.parse(raw);
        return key ? store[key] : store;
      }
    } catch (err) {
      console.error(`[PLUGIN SERVICE] Error reading storage for ${pluginId}:`, err);
    }
    return null;
  }

  setPluginStorage(pluginId, key, value) {
    try {
      const filePath = this.getPluginStoragePath(pluginId);
      let store = {};
      if (fs.existsSync(filePath)) {
        try {
          store = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        } catch (e) {}
      }
      store[key] = value;
      fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
    } catch (err) {
      console.error(`[PLUGIN SERVICE] Error writing storage for ${pluginId}:`, err);
    }
  }
}

module.exports = new PluginService();
