/**
 * Garantiza que el binario de yt-dlp para la plataforma objetivo exista en
 * electron/bin/<win|linux|mac>/ antes de empaquetar con electron-builder.
 *
 * Uso:
 *   node scripts/ensure-ytdlp.cjs                  (detecta process.platform actual)
 *   node scripts/ensure-ytdlp.cjs --platform=win
 *   node scripts/ensure-ytdlp.cjs --platform=linux
 *   node scripts/ensure-ytdlp.cjs --platform=mac
 *   node scripts/ensure-ytdlp.cjs --platform=all
 */
const fs = require("fs");
const path = require("path");
const https = require("https");

const ROOT_DIR = path.resolve(__dirname, "..");
const BIN_ROOT = path.join(ROOT_DIR, "electron", "bin");

const PLATFORMS = {
  win: {
    dir: "win",
    file: "yt-dlp.exe",
    asset: "yt-dlp.exe",
    executable: false,
  },
  linux: {
    dir: "linux",
    file: "yt-dlp",
    asset: "yt-dlp",
    executable: true,
  },
  mac: {
    dir: "mac",
    file: "yt-dlp",
    asset: "yt-dlp_macos",
    executable: true,
  },
};

function resolveRequestedPlatforms() {
  const arg = process.argv.find((a) => a.startsWith("--platform="));
  const raw = arg ? arg.split("=")[1].trim().toLowerCase() : null;

  if (raw === "all") return ["win", "linux", "mac"];
  if (raw && PLATFORMS[raw]) return [raw];

  if (process.platform === "win32") return ["win"];
  if (process.platform === "darwin") return ["mac"];
  return ["linux"];
}

function downloadFile(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft <= 0) {
      return reject(new Error("Demasiadas redirecciones al descargar yt-dlp"));
    }

    https
      .get(
        url,
        {
          headers: {
            "User-Agent": "Onicord-Build-EnsureYtdlp/1.0",
          },
        },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            res.resume();
            return resolve(
              downloadFile(res.headers.location, destPath, redirectsLeft - 1),
            );
          }

          if (res.statusCode !== 200) {
            res.resume();
            return reject(
              new Error(`HTTP ${res.statusCode} descargando ${url}`),
            );
          }

          const tmpPath = `${destPath}.tmp`;
          const fileStream = fs.createWriteStream(tmpPath);
          res.pipe(fileStream);

          fileStream.on("finish", () => {
            fileStream.close(() => {
              try {
                fs.renameSync(tmpPath, destPath);
                resolve();
              } catch (err) {
                reject(err);
              }
            });
          });

          fileStream.on("error", (err) => {
            try {
              if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
            } catch (_) {}
            reject(err);
          });
        },
      )
      .on("error", reject);
  });
}

async function ensurePlatformBinary(key) {
  const cfg = PLATFORMS[key];
  if (!cfg) return;

  const targetDir = path.join(BIN_ROOT, cfg.dir);
  const targetPath = path.join(targetDir, cfg.file);
  fs.mkdirSync(targetDir, { recursive: true });

  // Si estamos asegurando Windows y ya existe electron/bin/yt-dlp.exe legacy, reutilizarlo
  if (key === "win" && !fs.existsSync(targetPath)) {
    const legacyWinPath = path.join(BIN_ROOT, "yt-dlp.exe");
    if (fs.existsSync(legacyWinPath) && fs.statSync(legacyWinPath).size > 1024 * 100) {
      fs.copyFileSync(legacyWinPath, targetPath);
      console.log(`[ensure-ytdlp] Copiado binario existente electron/bin/yt-dlp.exe -> electron/bin/win/yt-dlp.exe`);
      return;
    }
  }

  if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 1024 * 100) {
    if (cfg.executable && process.platform !== "win32") {
      try {
        fs.chmodSync(targetPath, 0o755);
      } catch (_) {}
    }
    console.log(`[ensure-ytdlp] Binario verificado para ${key}: ${path.relative(ROOT_DIR, targetPath)}`);
    return;
  }

  const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${cfg.asset}`;
  console.log(`[ensure-ytdlp] Descargando yt-dlp (${key}) desde ${downloadUrl}...`);
  await downloadFile(downloadUrl, targetPath);

  if (cfg.executable && process.platform !== "win32") {
    try {
      fs.chmodSync(targetPath, 0o755);
    } catch (_) {}
  }
  console.log(`[ensure-ytdlp] Descarga completada para ${key}: ${path.relative(ROOT_DIR, targetPath)}`);
}

async function main() {
  const targets = resolveRequestedPlatforms();
  for (const key of targets) {
    await ensurePlatformBinary(key);
  }
}

main().catch((err) => {
  console.error("[ensure-ytdlp Error]", err.message || err);
  process.exit(1);
});
