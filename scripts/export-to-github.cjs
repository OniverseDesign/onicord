const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT_DIR = path.resolve(__dirname, "..");
const TARGET_DIR = path.join(ROOT_DIR, "project");
const GITHUB_REPO_URL = "https://github.com/OniverseDesign/onicord.git";

function log(msg) {
  console.log(`\n\x1b[36m[Export Script]\x1b[0m \x1b[1m${msg}\x1b[0m`);
}

function bumpSemver(version, type) {
  const clean = version.split("-")[0];
  const parts = clean.split(".").map((n) => parseInt(n, 10) || 0);
  let [major = 0, minor = 0, patch = 0] = parts;

  if (type === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (type === "minor") {
    minor += 1;
    patch = 0;
  } else if (type === "patch") {
    patch += 1;
  }
  return `${major}.${minor}.${patch}`;
}

function resolveVersion(currentVersion, args) {
  const rawArg =
    args.find((arg) => !arg.startsWith("-")) ||
    args.find((arg) => arg.startsWith("--version="))?.split("=")[1];

  if (!rawArg) return currentVersion;

  const val = rawArg.toLowerCase().trim();
  if (val === "patch" || val === "minor" || val === "major") {
    const newVer = bumpSemver(currentVersion, val);
    log(`Bumping versión SemVer (${val}): ${currentVersion} -> ${newVer}`);
    return newVer;
  }

  const semverRegex = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?$/;
  if (semverRegex.test(val)) {
    log(`Estableciendo nueva versión SemVer explícita: ${val}`);
    return val;
  }

  console.warn(
    `[AVISO] Argumento de versión "${rawArg}" no válido según SemVer. Se mantendrá la versión actual: ${currentVersion}`,
  );
  return currentVersion;
}

const USEFUL_FOLDERS = [
  "src",
  "electron",
  "public",
  "build",
  "scripts",
  "docs",
  ".github",
  "mcp-server",
  "addons",
];

const USEFUL_FILES = [
  "package.json",
  "package-lock.json",
  "vite.config.js",
  "tailwind.config.js",
  "postcss.config.js",
  "eslint.config.js",
  "index.html",
  ".gitignore",
  ".env.example",
  ".nvmrc",
  "LICENSE",
  "README.md",
  "RELEASE_NOTES.md",
];

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === "release" ||
      entry.name === ".git" ||
      entry.name === "project" ||
      entry.name === "proyect" ||
      entry.name === "logs" ||
      entry.name === "pack-addons-repo.cjs" ||
      entry.name === "check-i18n.js" ||
      entry.name === ".DS_Store" ||
      entry.name === "Thumbs.db"
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function prepareTargetDir(targetDir, remoteUrl) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const gitDir = path.join(targetDir, ".git");
  if (!fs.existsSync(gitDir)) {
    log("Inicializando repositorio Git en /project/...");
    execSync("git init", { cwd: targetDir, stdio: "inherit" });
    execSync(`git remote add origin ${remoteUrl}`, { cwd: targetDir, stdio: "inherit" });
    try {
      log("Descargando rama main desde el repositorio remoto...");
      execSync("git fetch origin main", { cwd: targetDir, stdio: "inherit" });
      execSync("git checkout -B main origin/main", { cwd: targetDir, stdio: "inherit" });
    } catch (fetchErr) {
      log("Aviso: No se pudo hacer checkout de origin/main (puede ser un repositorio nuevo).");
      execSync("git branch -M main", { cwd: targetDir, stdio: "inherit" });
    }
  } else {
    try {
      log("Sincronizando rama main con el repositorio remoto...");
      execSync(`git remote set-url origin ${remoteUrl}`, { cwd: targetDir, stdio: "inherit" });
      execSync("git fetch origin main", { cwd: targetDir, stdio: "inherit" });
      execSync("git checkout main", { cwd: targetDir, stdio: "inherit" });
      execSync("git reset --hard origin/main", { cwd: targetDir, stdio: "inherit" });
    } catch (syncErr) {
      console.warn("Aviso: No se pudo sincronizar con origin/main previamente:", syncErr.message);
    }
  }

  log("Limpiando archivos de /project/ (preservando .git y node_modules)...");
  const entries = fs.readdirSync(targetDir);
  for (const entry of entries) {
    if (entry === ".git" || entry === "node_modules") {
      continue;
    }
    const fullPath = path.join(targetDir, entry);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
}

async function main() {
  const rootPkgPath = path.join(ROOT_DIR, "package.json");
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
  const currentVersion = rootPkg.version || "0.1.0";

  const targetVersion = resolveVersion(currentVersion, process.argv.slice(2));

  if (targetVersion !== currentVersion) {
    log(`Actualizando versión en package.json de la raíz: v${targetVersion}`);
    rootPkg.version = targetVersion;
    fs.writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n", "utf8");
  }

  log(`1. Preparando directorio /project/ (preservando historial Git)...`);
  prepareTargetDir(TARGET_DIR, GITHUB_REPO_URL);

  log("2. Copiando archivos y carpetas útiles...");
  for (const folder of USEFUL_FOLDERS) {
    const src = path.join(ROOT_DIR, folder);
    const dest = path.join(TARGET_DIR, folder);
    if (fs.existsSync(src)) {
      log(`   Copiando carpeta: ${folder}/`);
      copyDirRecursive(src, dest);
    }
  }

  for (const file of USEFUL_FILES) {
    const src = path.join(ROOT_DIR, file);
    const dest = path.join(TARGET_DIR, file);
    if (fs.existsSync(src)) {
      log(`   Copiando archivo: ${file}`);
      fs.copyFileSync(src, dest);
    }
  }

  log("3. Actualizando README.md...");
  const readmePath = path.join(TARGET_DIR, "README.md");
  if (fs.existsSync(readmePath)) {
    let readmeContent = fs.readFileSync(readmePath, "utf8");
    if (/^# Onicord/m.test(readmeContent)) {
      readmeContent = readmeContent.replace(
        /^# Onicord(?:\s+\(v[0-9.]+(?:-[a-zA-Z0-9.]+)?\))?/m,
        `# Onicord (v${targetVersion})`
      );
      fs.writeFileSync(readmePath, readmeContent, "utf8");
    }
  }

  const enableLocalBuild = process.argv.includes("--local-build");

  log(`4. Instalando dependencias en /project/ (Versión: v${targetVersion})...`);
  execSync("npm install --no-audit --no-fund", { cwd: TARGET_DIR, stdio: "inherit" });

  log("5. Validando compilación web (Vite & icons)...");
  execSync("npm run icons", { cwd: TARGET_DIR, stdio: "inherit" });
  execSync("npm run build", { cwd: TARGET_DIR, stdio: "inherit" });

  if (enableLocalBuild) {
    log(`   [--local-build activo] Compilando Instalador Setup NSIS v${targetVersion} (.exe)...`);
    execSync("npx electron-builder --win nsis", {
      cwd: TARGET_DIR,
      stdio: "inherit",
    });

    log(`   [--local-build activo] Compilando Ejecutable Portable v${targetVersion} (.exe)...`);
    execSync("npx electron-builder --win portable", {
      cwd: TARGET_DIR,
      stdio: "inherit",
    });
  } else {
    log("   Compilación de instaladores y paquetes delegada a GitHub Actions CI en la nube (Windows, Linux, macOS).");
    log("   (Usa --local-build si deseas generar los ejecutables Windows localmente antes de exportar).");
  }

  log("6. Verificando directorio /project/release/...");
  const releaseDir = path.join(TARGET_DIR, "release");
  if (!fs.existsSync(releaseDir)) {
    fs.mkdirSync(releaseDir, { recursive: true });
  }
  const files = fs.readdirSync(releaseDir);
  if (files.length > 0) {
    log(`Archivos existentes en release: ${files.join(", ")}`);
  }

  log(`7. Sincronizando v${targetVersion} con GitHub (${GITHUB_REPO_URL})...`);
  try {
    execSync("git add -A", { cwd: TARGET_DIR, stdio: "inherit" });
    const status = execSync("git status --porcelain", { cwd: TARGET_DIR }).toString().trim();
    const changelog = resolveChangelog(targetVersion, process.argv.slice(2));
    const bullets = changelog
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- ") || l.startsWith("* "))
      .map((l) => l.replace(/^[-*]\s+/, ""));

    let commitSubject = `release: v${targetVersion}`;
    if (bullets.length > 0) {
      const topics = bullets
        .map((b) => {
          const match = b.match(/^\*\*([^*]+)\*\*[:\s]*/);
          return match ? match[1].toLowerCase() : null;
        })
        .filter(Boolean);
      if (topics.length > 0) {
        commitSubject += ` - ${topics.slice(0, 4).join(", ")}`;
      }
    }

    const commitMsgFile = path.join(TARGET_DIR, ".git", "COMMIT_EDITMSG_CUSTOM");
    const commitBody = [commitSubject, "", ...bullets.map((b) => `- ${b}`)].join("\n");
    fs.writeFileSync(commitMsgFile, commitBody, "utf8");

    if (status.length > 0) {
      execSync(`git commit -F "${commitMsgFile}"`, {
        cwd: TARGET_DIR,
        stdio: "inherit",
      });
      try { fs.unlinkSync(commitMsgFile); } catch {}
    } else {
      log("No se detectaron modificaciones en los archivos para commitear.");
      try { fs.unlinkSync(commitMsgFile); } catch {}
    }

    try {
      execSync(`git tag -f -a v${targetVersion} -m "Release v${targetVersion}"`, {
        cwd: TARGET_DIR,
        stdio: "inherit",
      });
    } catch (tagErr) {
      console.warn(`Tag v${targetVersion} ya existente o no pudo crearse:`, tagErr.message);
    }

    log("Subiendo cambios y tags a GitHub...");
    execSync("git push origin main --tags --force", {
      cwd: TARGET_DIR,
      stdio: "inherit",
    });
    log(`[OK] Onicord v${targetVersion} compilado, organizado y subido con éxito a GitHub!`);

    await publishGitHubRelease(targetVersion, releaseDir, process.argv.slice(2));
  } catch (gitErr) {
    console.error("[ERROR] Error durante git push:", gitErr.message);
    log(
      "El proyecto se organizó y compiló correctamente en /project/release/. Puedes realizar el push manualmente ejecutando:",
    );
    console.log(`cd project && git push origin main --tags`);
  }
}

function findGhCommand() {
  try {
    execSync("gh --version", { stdio: "ignore" });
    return "gh";
  } catch {}
  const standardPath = "C:\\Program Files\\GitHub CLI\\gh.exe";
  if (fs.existsSync(standardPath)) {
    return `"${standardPath}"`;
  }
  return null;
}

function resolveChangelog(version = "0.1.0", args = []) {
  // 1. Argumento inline: --changelog="..." o --notes="..." o -m="..."
  for (const arg of args) {
    if (arg.startsWith("--changelog=") || arg.startsWith("--notes=") || arg.startsWith("-m=")) {
      const val = arg.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
      if (val) {
        log("Usando changelog personalizado pasado por argumento CLI.");
        return val;
      }
    }
    // 2. Argumento de archivo: --notes-file="..." o --changelog-file="..."
    if (arg.startsWith("--notes-file=") || arg.startsWith("--changelog-file=")) {
      const filePath = arg.split("=").slice(1).join("=").trim().replace(/^["']|["']$/g, "");
      const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(ROOT_DIR, filePath);
      if (fs.existsSync(resolvedPath)) {
        log(`Cargando changelog desde archivo: ${filePath}`);
        return fs.readFileSync(resolvedPath, "utf8").trim();
      }
    }
  }

  // 3. Archivo RELEASE_NOTES.md en la raíz si existe
  const defaultNotesFiles = ["RELEASE_NOTES.md", "release-notes.md"];
  for (const f of defaultNotesFiles) {
    const p = path.join(ROOT_DIR, f);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf8").trim();
      if (content) {
        const normalized = content.replace(/\r\n/g, "\n");
        const sections = normalized.split(/(?=\n#\s*Onicord\s*v)/i);
        const match = sections.find((s) =>
          s.toLowerCase().includes(`onicord v${version.toLowerCase()}`)
        );
        if (match && match.trim()) {
          log(`Usando notas de versión v${version} encontradas en ${f}`);
          return match.trim();
        }
        log(`Usando notas de versión encontradas en ${f}`);
        return sections[0].trim();
      }
    }
  }

  // 4. Plantilla por defecto profesional
  return `### Onicord v${version}

Primera versión oficial de **Onicord**, plataforma de comunicación descentralizada y libre (P2P).

#### Características destacadas:
- Red de comunicación de voz y chat P2P descentralizada mediante Hyperswarm y WebRTC.
- Sin servidores centrales ni recopilación de datos de terceros.
- Canales de voz, salas interactivas y soporte de streaming de pantalla.
- Sistema modular de complementos (plugins) y tablero interactivo (dashboard).
- Atajos globales, audio posicional/sonidos de sistema y diseño oscuro adaptable.
- Distribución oficial para Windows (instalador NSIS y ejecutable portable).`;
}

async function publishGitHubRelease(targetVersion, releaseDir, args = []) {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const tagName = `v${targetVersion}`;

  // Generar SHA256SUMS.txt para verificación criptográfica de integridad
  const crypto = require("crypto");
  const binFiles = fs.readdirSync(releaseDir).filter((f) =>
    f.endsWith(".exe") || f.endsWith(".AppImage") || f.endsWith(".deb") || f.endsWith(".dmg") || f.endsWith(".zip")
  );
  if (binFiles.length > 0) {
    const checksumLines = binFiles.map((file) => {
      const data = fs.readFileSync(path.join(releaseDir, file));
      const hash = crypto.createHash("sha256").update(data).digest("hex");
      return `${hash}  ${file}`;
    });
    fs.writeFileSync(path.join(releaseDir, "SHA256SUMS.txt"), checksumLines.join("\n") + "\n", "utf8");
    log(`Generado archivo SHA256SUMS.txt con ${binFiles.length} hashes de verificación.`);
  }

  const releaseAssets = fs.existsSync(releaseDir)
    ? fs
        .readdirSync(releaseDir)
        .filter((f) =>
          f.endsWith(".exe") ||
          f.endsWith(".yml") ||
          f.endsWith(".AppImage") ||
          f.endsWith(".deb") ||
          f.endsWith(".dmg") ||
          f.endsWith(".zip") ||
          f === "SHA256SUMS.txt"
        )
        .map((f) => path.join(releaseDir, f))
    : [];

  const changelog = resolveChangelog(targetVersion, args);
  if (releaseAssets.length > 0) {
    log(`8. Generando Changelog y subiendo artefactos locales (${releaseAssets.map((f) => path.basename(f)).join(", ")})...`);
  } else {
    log(`8. Creando/actualizando Release v${targetVersion} en GitHub (los artefactos se compilarán en GitHub Actions CI)...`);
  }
  log(`   Changelog a publicar:\n\n${changelog}\n`);

  // Intento 1: Vía gh CLI si está disponible
  const ghCmd = findGhCommand();
  if (ghCmd) {
    const tempNotesPath = path.join(releaseDir, "temp_release_notes.md");
    try {
      fs.writeFileSync(tempNotesPath, changelog, "utf8");
      const fileArgs = releaseAssets.length > 0 ? releaseAssets.map((f) => `"${f}"`).join(" ") : "";

      // Comprobamos si el release ya existe en GitHub
      let releaseExists = false;
      try {
        execSync(`${ghCmd} release view ${tagName} --repo OniverseDesign/onicord`, {
          cwd: TARGET_DIR,
          stdio: "ignore",
        });
        releaseExists = true;
      } catch {}

      if (releaseExists) {
        log(`Release ${tagName} ya existe en GitHub. Actualizando notas...`);
        if (fileArgs) {
          execSync(
            `${ghCmd} release upload ${tagName} ${fileArgs} --clobber --repo OniverseDesign/onicord`,
            { cwd: TARGET_DIR, stdio: "inherit" }
          );
        }
        execSync(
          `${ghCmd} release edit ${tagName} --notes-file "${tempNotesPath}" --title "Release ${tagName}" --repo OniverseDesign/onicord`,
          { cwd: TARGET_DIR, stdio: "inherit" }
        );
      } else {
        log(`Creando Release ${tagName} en GitHub...`);
        execSync(
          `${ghCmd} release create ${tagName} ${fileArgs ? fileArgs + " " : ""}--title "Release ${tagName}" --notes-file "${tempNotesPath}" --repo OniverseDesign/onicord`,
          { cwd: TARGET_DIR, stdio: "inherit" }
        );
      }
      log(`[OK] ¡Changelog y artefactos subidos con éxito a GitHub Releases vía CLI!`);
      try { fs.unlinkSync(tempNotesPath); } catch {}
      return;
    } catch (ghErr) {
      console.warn(`[AVISO] No se pudo completar con gh CLI: ${ghErr.message}`);
      try { fs.unlinkSync(tempNotesPath); } catch {}
    }
  }

  // Intento 2: Vía GitHub REST API si existe GH_TOKEN / GITHUB_TOKEN
  if (token) {
    try {
      log("Subiendo artefactos usando GH_TOKEN a GitHub REST API...");
      const repoPath = "OniverseDesign/onicord";

      let releaseResponse = await fetch(
        `https://api.github.com/repos/${repoPath}/releases/tags/${tagName}`,
        {
          headers: {
            Authorization: `token ${token}`,
            "User-Agent": "Onicord-Exporter",
          },
        }
      );

      let releaseData;
      if (releaseResponse.ok) {
        releaseData = await releaseResponse.json();
      } else {
        const createRes = await fetch(
          `https://api.github.com/repos/${repoPath}/releases`,
          {
            method: "POST",
            headers: {
              Authorization: `token ${token}`,
              "Content-Type": "application/json",
              "User-Agent": "Onicord-Exporter",
            },
            body: JSON.stringify({
              tag_name: tagName,
              name: `Release ${tagName}`,
              body: changelog,
              generate_release_notes: true,
              draft: false,
              prerelease: false,
            }),
          }
        );
        if (!createRes.ok) {
          throw new Error(
            `Error al crear la Release en GitHub: ${createRes.statusText}`
          );
        }
        releaseData = await createRes.json();
      }

      const uploadUrlBase = releaseData.upload_url.split("{")[0];

      for (const filePath of releaseAssets) {
        const fileName = path.basename(filePath);
        log(`   Subiendo artefacto: ${fileName}...`);
        const fileData = fs.readFileSync(filePath);

        const uploadRes = await fetch(
          `${uploadUrlBase}?name=${encodeURIComponent(fileName)}`,
          {
            method: "POST",
            headers: {
              Authorization: `token ${token}`,
              "Content-Type": "application/octet-stream",
              "User-Agent": "Onicord-Exporter",
            },
            body: fileData,
          }
        );

        if (uploadRes.ok) {
          log(`   [OK] ${fileName} subido con éxito.`);
        } else {
          console.warn(`   [AVISO] Falló la subida de ${fileName}: ${uploadRes.statusText}`);
        }
      }
      log(`[OK] Changelog y binarios subidos a GitHub Releases con éxito.`);
      return;
    } catch (apiErr) {
      console.warn("[AVISO] Falló la subida por API:", apiErr.message);
    }
  }

  log(
    "[INFO] Para publicar los binarios (.exe) y el Changelog automáticamente en GitHub Releases:\n" +
      "   Opción 1 (GitHub CLI): Instala 'gh' y ejecuta: gh auth login\n" +
      "   Opción 2 (Token de GitHub): Define la variable antes de ejecutar el script:\n" +
      '             $env:GH_TOKEN="tu_personal_access_token"\n' +
      "   Opción 3 (GitHub Actions): Usar una GitHub Action que publica en Releases al recibir un Tag."
  );
}

main().catch((err) => {
  console.error("[ERROR] Error en la ejecución del script:", err);
  process.exit(1);
});
