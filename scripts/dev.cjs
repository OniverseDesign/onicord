/**
 * Arranca Vite y luego Electron (fiable en Windows).
 * Uso: node scripts/dev.cjs
 */
const { spawn } = require('child_process')
const http = require('http')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DEV_URL = 'http://127.0.0.1:5173'
const MAX_WAIT_MS = 90_000
const POLL_MS = 400

function waitForVite() {
  const deadline = Date.now() + MAX_WAIT_MS
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      if (Date.now() > deadline) {
        reject(new Error(`Vite no respondió en ${DEV_URL} tras ${MAX_WAIT_MS / 1000}s`))
        return
      }
      const req = http.get(DEV_URL, (res) => {
        res.resume()
        if (res.statusCode && res.statusCode < 500) resolve()
        else setTimeout(tryOnce, POLL_MS)
      })
      req.on('error', () => setTimeout(tryOnce, POLL_MS))
      req.setTimeout(2000, () => {
        req.destroy()
        setTimeout(tryOnce, POLL_MS)
      })
    }
    tryOnce()
  })
}

function run(command, args, label) {
  const isWin = process.platform === 'win32'
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: isWin,
    env: { ...process.env, VITE_DEV_SERVER_URL: DEV_URL },
  })
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`[${label}] salió con código ${code}`)
  })
  return child
}

console.log('[dev] Iniciando Vite en', DEV_URL, '...\n')

const vite = run('npx', ['vite'], 'VITE')

let electron = null

const shutdown = () => {
  if (electron && !electron.killed) electron.kill()
  if (vite && !vite.killed) vite.kill()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

waitForVite()
  .then(() => {
    console.log('\n[dev] Vite listo. Abriendo ventana de Electron...\n')
    electron = run(
      'npx',
      ['cross-env', `VITE_DEV_SERVER_URL=${DEV_URL}`, 'electron', '.'],
      'ELECTRON'
    )
    electron.on('exit', (code) => {
      if (vite && !vite.killed) vite.kill()
      process.exit(code ?? 0)
    })
  })
  .catch((err) => {
    console.error('[dev] Error:', err.message)
    if (vite && !vite.killed) vite.kill()
    process.exit(1)
  })
