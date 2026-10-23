const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const addonsDir = __dirname;
const pluginsDir = path.join(addonsDir, "plugins");

if (!fs.existsSync(pluginsDir)) {
  fs.mkdirSync(pluginsDir, { recursive: true });
}

function packFolder(folderPath) {
  const manifestPath = path.join(folderPath, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;

  const rawManifest = fs.readFileSync(manifestPath, "utf-8");
  const manifest = JSON.parse(rawManifest);

  const files = {};
  const readDirRecursive = (currentDir, baseDir) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, "/");

      if (entry.name === "manifest.json" || entry.name.startsWith(".") || entry.name.endsWith(".onipkg") || entry.name.endsWith(".onimod") || entry.name === "node_modules") continue;

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
  return { manifest, compressed: zlib.gzipSync(Buffer.from(jsonString, "utf-8")) };
}

function buildAddonsRepo() {
  console.log("Packaging addons and updating index.json catalog...");

  const entries = fs.readdirSync(addonsDir, { withFileTypes: true });
  const catalog = [];

  for (const entry of entries) {
    if (entry.isDirectory() && entry.name !== "plugins" && !entry.name.startsWith(".")) {
      const folderPath = path.join(addonsDir, entry.name);
      const packed = packFolder(folderPath);

      if (packed) {
        const { manifest, compressed } = packed;
        const pluginId = manifest.id || entry.name;

        const targetIdDir = path.join(pluginsDir, pluginId);
        if (!fs.existsSync(targetIdDir)) fs.mkdirSync(targetIdDir, { recursive: true });
        
        fs.writeFileSync(path.join(targetIdDir, "package.onipkg"), compressed);
        // Clean legacy package if exists
        const legacyPath = path.join(targetIdDir, "package.onimod");
        if (fs.existsSync(legacyPath)) fs.unlinkSync(legacyPath);
        fs.writeFileSync(path.join(targetIdDir, "manifest.json"), JSON.stringify(manifest, null, 2));

        // Copy assets folder if exists
        const sourceAssetsDir = path.join(folderPath, "assets");
        const targetAssetsDir = path.join(targetIdDir, "assets");
        if (fs.existsSync(sourceAssetsDir)) {
          if (!fs.existsSync(targetAssetsDir)) fs.mkdirSync(targetAssetsDir, { recursive: true });
          const assetFiles = fs.readdirSync(sourceAssetsDir);
          for (const assetFile of assetFiles) {
            fs.copyFileSync(path.join(sourceAssetsDir, assetFile), path.join(targetAssetsDir, assetFile));
          }
        }

        const iconPath = manifest.icon || "assets/icon.png";

        const catalogItem = {
          id: pluginId,
          name: manifest.name,
          version: manifest.version,
          scope: manifest.scope || "client",
          author: manifest.author || "Oniverse",
          description: manifest.description || "",
          icon: `https://raw.githubusercontent.com/OniverseDesign/onicord-addons/main/${entry.name}/${iconPath}`,
          downloadUrl: `https://raw.githubusercontent.com/OniverseDesign/onicord-addons/main/plugins/${pluginId}/package.onipkg`
        };

        if (manifest.locales) {
          catalogItem.locales = manifest.locales;
        }

        catalog.push(catalogItem);

        console.log(`[OK] Addon packaged: ${manifest.name} (ID: ${pluginId}) -> plugins/${pluginId}/package.onipkg`);
      }
    }
  }

  const indexData = {
    version: "1.0.0",
    updatedAt: new Date().toISOString(),
    plugins: catalog
  };

  fs.writeFileSync(path.join(addonsDir, "index.json"), JSON.stringify(indexData, null, 2));
  console.log("Catalog index.json updated successfully.");
  console.log("Build process completed successfully.");
}

buildAddonsRepo();
