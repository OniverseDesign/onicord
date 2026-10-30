/**
 * Script de respaldo y restauración para herramientas y scripts locales de Onicord.
 * Guarda y restaura archivos que no se suben a Git/GitHub para evitar que un
 * comando accidental de 'git clean' los borre.
 */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKUP_DIR = path.join(ROOT_DIR, '.local_backup');

const LOCAL_FILES = [
  'check-i18n.js',
  'obtener iconos.py',
  'resultado_games.json',
  'CHANGELOG_DISCOVERIES.md',
  'DISTRIBUIR.md',
  'migrate-to-onicord.js',
  'start.bat',
  'start_user2.bat',
  'auditoria_protocolo_onicord_media.md',
  'sistema_complementos.md',
  'design.md',
  'implementation_plan.md',
  'scripts/pack-addons-repo.cjs'
];

function backup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  let count = 0;
  for (const relPath of LOCAL_FILES) {
    const src = path.join(ROOT_DIR, relPath);
    if (fs.existsSync(src)) {
      const dest = path.join(BACKUP_DIR, path.basename(relPath));
      fs.copyFileSync(src, dest);
      count++;
    }
  }
  console.log(`\x1b[32m[Backup OK]\x1b[0m ${count} archivos locales respaldados en .local_backup/`);
}

function restore() {
  if (!fs.existsSync(BACKUP_DIR)) {
    console.error(`\x1b[31m[Error]\x1b[0m No se encontró la carpeta .local_backup/`);
    process.exit(1);
  }

  let count = 0;
  for (const relPath of LOCAL_FILES) {
    const backupFile = path.join(BACKUP_DIR, path.basename(relPath));
    const targetFile = path.join(ROOT_DIR, relPath);

    if (fs.existsSync(backupFile)) {
      const targetDir = path.dirname(targetFile);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.copyFileSync(backupFile, targetFile);
      count++;
    }
  }
  console.log(`\x1b[32m[Restore OK]\x1b[0m ${count} archivos locales restaurados correctamente.`);
}

const mode = process.argv[2] || 'backup';
if (mode === 'restore') {
  restore();
} else {
  backup();
}
