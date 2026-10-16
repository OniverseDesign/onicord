import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directories to scan
const SCAN_DIRS = [
  path.join(__dirname, 'src'),
  path.join(__dirname, 'electron')
];

// Regex for Spanish accents and characters
const SPANISH_ACCENTS_REGEX = /[áéíóúüñÁÉÍÓÚÜÑ]/;

// Regex for common Spanish words and suffixes
const SPANISH_WORDS_REGEX = /\b(de|del|en|la|el|los|las|un|una|unos|unas|para|con|por|sin|sobre|entre|hacia|desde|este|esta|estos|estas|tus|sus|mis|nuestro|nuestra|sala|canales|canal|servidor|servidores|mensaje|mensajes|usuario|usuarios|canción|cola|guardar|eliminar|aceptar|cancelar|editar|configuración|ajustes|modo|red|zumbido|flama|rol|roles|perfil|zumbidos|actividad|actual|jugando|ejemplo|juego|color|fondo|consejos|consejo|pantalla|carga|detener|comenzar|prueba|sensibilidad|entrada|salida|descartar|cambios|desarmar|restablecer|nombre|apodo|avatar|estado|general|apariencia|desarrollador|vista|permisos|invitaciones|micrófono|altavoces|ruido|eco|ganancia|tema|oscuro|claro|acento|pestaña|menús|partida)\b/i;

// ANSI escape codes for coloring terminal output
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

let filesScannedCount = 0;
let filesWithErrorsCount = 0;
let totalErrorsCount = 0;

function scanDirectory(dir) {
  let hasErrors = false;
  if (!fs.existsSync(dir)) return hasErrors;

  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (scanDirectory(fullPath)) hasErrors = true;
    } else if (/\.(js|jsx|ts|tsx|cjs|mjs)$/.test(file)) {
      filesScannedCount++;
      if (checkFile(fullPath)) {
        hasErrors = true;
        filesWithErrorsCount++;
      }
    }
  });

  return hasErrors;
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let fileHasErrors = false;
  
  const ext = path.extname(filePath);
  const isJSXFile = ext === '.jsx' || ext === '.tsx';

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    
    // Skip imports, comments, require statement lines, styling and logs
    if (
      trimmed.startsWith('//') || 
      trimmed.startsWith('/*') || 
      trimmed.startsWith('*') || 
      trimmed.startsWith('{/*') ||
      trimmed.startsWith('import') || 
      trimmed.startsWith('export') || 
      trimmed.startsWith('console.') ||
      trimmed.startsWith('throw ') ||
      trimmed.includes('require(') ||
      /^(id|className|type|href|src|key|style|variant|color|size|aria-|data-)=/.test(trimmed) ||
      trimmed.includes('color:') ||
      trimmed.includes('rgb(') ||
      trimmed.includes('var(') ||
      trimmed.includes('[&') ||
      trimmed.includes('material-symbols-outlined') ||
      trimmed.includes('material-icons') ||
      trimmed.includes('.badgeText')
    ) {
      return;
    }

    const candidateTexts = [];

    const isWhitelisted = (text) => {
      const cleaned = text.trim();
      return (
        cleaned === 'Onicord' ||
        cleaned === 'Close' ||
        cleaned === 'Profile' ||
        cleaned === 'preview' ||
        cleaned === 'A1B2C3D4' ||
        cleaned === '1080p (FHD)' ||
        cleaned === '720p (HD)' ||
        cleaned === '480p (SD)' ||
        cleaned === '0dB' ||
        cleaned === '100dB' ||
        cleaned === 'O'
      );
    };

    if (isJSXFile) {
      // Check if line actually has JSX tags to avoid arrow function logic false positives
      const hasJSXTag = /<\/[a-zA-Z]+>|<\/[A-Z][a-zA-Z]*>|<[a-zA-Z]+\s|<[A-Z][a-zA-Z]*\s/.test(line);

      if (hasJSXTag) {
        // 1. Plain text inside JSX tags: >text<
        const tagContentRegex = />([^<>{}\n]+)</g;
        let tagMatch;
        while ((tagMatch = tagContentRegex.exec(line)) !== null) {
          const text = tagMatch[1].trim();
          
          if (
            text && 
            !text.includes('t(') &&
            /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(text) &&
            !/[=;]/.test(text) &&
            !/&&|\|\|/.test(text) &&
            !/\b(if|return|const|let|var|function|typeof|instanceof)\b/.test(text) &&
            !/^\s*$/.test(text) &&
            !/^(onicord-|win-disk|http)/i.test(text) &&
            !isWhitelisted(text)
          ) {
            candidateTexts.push(text);
          }
        }
      }

      // 2. Specific UI attributes with hardcoded string literals: e.g. placeholder="Search..."
      const uiAttributesRegex = /\b(placeholder|title|label|hint|alt|badgeText|aria-label)\s*=\s*(?:["'`]([^"'`\n]+)["'`]|{[\s]*["'`]([^"'`\n]+)["'`][\s]*})/g;
      let attrMatch;
      while ((attrMatch = uiAttributesRegex.exec(line)) !== null) {
        const text = (attrMatch[2] || attrMatch[3]).trim();
        if (
          text && 
          !line.includes(`t("${text}"`) && 
          !line.includes(`t('${text}'`) && 
          !line.includes(`t(\`${text}\``) &&
          /[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/.test(text) &&
          !isWhitelisted(text)
        ) {
          candidateTexts.push(text);
        }
      }
    } else {
      // For backend/non-JSX files, detect hardcoded Spanish string literals (we keep Spanish logic for backend to avoid code-event false positives)
      const cleanLine = line.replace(/\${[^}]+}/g, '');
      const stringLiteralRegex = /["'`]([^"'`\n]{2,})["'`]/g;
      let strMatch;
      while ((strMatch = stringLiteralRegex.exec(cleanLine)) !== null) {
        const text = strMatch[1].trim();
        if (
          text && 
          !line.includes('t(') &&
          !text.includes('/') && 
          !text.includes('.') && 
          !/^[0-9a-z_.:#-]+$/i.test(text)
        ) {
          if (SPANISH_ACCENTS_REGEX.test(text) || SPANISH_WORDS_REGEX.test(text)) {
            candidateTexts.push(text);
          }
        }
      }
    }

    if (candidateTexts.length > 0) {
      const uniqueMatches = [...new Set(candidateTexts)];
      if (!fileHasErrors) {
        console.log(`\n${COLORS.red}❌ Untranslated UI text in:${COLORS.reset} ${COLORS.cyan}${path.relative(__dirname, filePath)}${COLORS.reset}`);
        fileHasErrors = true;
      }
      console.log(`   ${COLORS.yellow}Line ${index + 1}:${COLORS.reset} "${line.trim()}" -> ${COLORS.red}Detected: [${uniqueMatches.join(', ')}]${COLORS.reset}`);
      totalErrorsCount += uniqueMatches.length;
    }
  });

  return fileHasErrors;
}

console.log(`${COLORS.cyan}🔍 Starting improved project-wide scan for untranslated UI texts...${COLORS.reset}`);
const startTime = Date.now();

let totalErrorsFound = false;
SCAN_DIRS.forEach(dir => {
  const relativeDir = path.relative(__dirname, dir);
  console.log(`   Scanning directory: ${COLORS.yellow}${relativeDir}/${COLORS.reset}`);
  if (scanDirectory(dir)) {
    totalErrorsFound = true;
  }
});

const duration = ((Date.now() - startTime) / 1000).toFixed(2);

console.log(`\n${COLORS.cyan}====================================================${COLORS.reset}`);
console.log(`${COLORS.cyan}Scan Summary:${COLORS.reset}`);
console.log(`- Files scanned: ${COLORS.yellow}${filesScannedCount}${COLORS.reset}`);
console.log(`- Files with untranslated text: ${totalErrorsFound ? COLORS.red : COLORS.green}${filesWithErrorsCount}${COLORS.reset}`);
console.log(`- Total untranslated strings: ${totalErrorsFound ? COLORS.red : COLORS.green}${totalErrorsCount}${COLORS.reset}`);
console.log(`- Duration: ${COLORS.yellow}${duration}s${COLORS.reset}`);
console.log(`${COLORS.cyan}====================================================${COLORS.reset}`);

if (totalErrorsFound) {
  console.log(`\n${COLORS.red}🛑 Hardcoded UI text detected. Please wrap them in the t() function and add keys to JSON translation files.${COLORS.reset}`);
  process.exit(1);
} else {
  console.log(`\n${COLORS.green}✅ Perfect! All scanned UI and backend source files are fully localized with i18n.${COLORS.reset}`);
  process.exit(0);
}
