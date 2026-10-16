/**
 * Copia build/icon.png a public/ para favicon y ventana en desarrollo.
 * El instalador usa build/icon.png vía electron-builder (package.json → build.icon).
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const src = path.join(root, 'build', 'icon.png')
const dest = path.join(root, 'public', 'icon.png')

if (!fs.existsSync(src)) {
  console.error('[icons] No existe build/icon.png')
  console.error('        Coloca tu PNG 512x512 en build/icon.png (ver build/ICONOS.md)')
  process.exit(1)
}

fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.copyFileSync(src, dest)
console.log('[icons] Copiado build/icon.png → public/icon.png')
console.log('[icons] Para el instalador: npm run pack')
