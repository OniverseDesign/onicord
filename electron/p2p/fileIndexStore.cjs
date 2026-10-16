const fs = require('fs/promises')
const path = require('path')

const MAX_FILES = 500

class FileIndexStore {
  constructor(userDataPath) {
    this.dir = path.join(userDataPath, 'files-index')
  }

  _path(roomCode) {
    const safe = String(roomCode).trim().toUpperCase().replace(/[^A-F0-9]/g, '')
    return path.join(this.dir, `${safe}.json`)
  }

  async load(roomCode) {
    try {
      const raw = await fs.readFile(this._path(roomCode), 'utf8')
      const data = JSON.parse(raw)
      return Array.isArray(data.files) ? data.files : []
    } catch {
      return []
    }
  }

  async merge(roomCode, incoming) {
    if (!incoming?.length) return { added: 0, files: await this.load(roomCode) }
    const files = await this.load(roomCode)
    let added = 0

    for (const f of incoming) {
      if (!f?.id) continue
      const idx = files.findIndex((x) => x.id === f.id)
      if (idx < 0) {
        files.push(f)
        added++
      } else if (
        (f.updatedAt || f.uploadedAt || 0) >
        (files[idx].updatedAt || files[idx].uploadedAt || 0)
      ) {
        const keepRealPath =
          files[idx].realPath && (f.realPath === undefined || f.realPath === null)
        files[idx] = { ...files[idx], ...f }
        if (keepRealPath) files[idx].realPath = files[idx].realPath
        added++
      }
    }

    const trimmed = files.length > MAX_FILES ? files.slice(-MAX_FILES) : files
    const filePath = this._path(roomCode)
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    const tmpPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const content = JSON.stringify({ roomCode, files: trimmed, updatedAt: Date.now() }, null, 2)
    await fs.writeFile(tmpPath, content, 'utf8')
    try {
      await fs.rename(tmpPath, filePath)
    } catch {
      await fs.copyFile(tmpPath, filePath)
      await fs.unlink(tmpPath).catch(() => {})
    }
    return { added, files: trimmed }
  }

  getWatermark(files) {
    if (!files.length) return 0
    return Math.max(...files.map((f) => f.updatedAt || f.uploadedAt || 0))
  }

  async remove(roomCode, fileId) {
    if (!fileId) return false
    const files = await this.load(roomCode)
    const initialLen = files.length
    const filtered = files.filter((f) => f.id !== fileId)
    if (filtered.length === initialLen) return false

    const filePath = this._path(roomCode)
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    const tmpPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const content = JSON.stringify({ roomCode, files: filtered, updatedAt: Date.now() }, null, 2)
    await fs.writeFile(tmpPath, content, 'utf8')
    try {
      await fs.rename(tmpPath, filePath)
    } catch {
      await fs.copyFile(tmpPath, filePath)
      await fs.unlink(tmpPath).catch(() => {})
    }
    return true
  }

  async removeByMessageId(roomCode, messageId) {
    if (!messageId) return false
    const files = await this.load(roomCode)
    const initialLen = files.length
    const filtered = files.filter((f) => f.messageId !== messageId)
    if (filtered.length === initialLen) return false

    const filePath = this._path(roomCode)
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    const tmpPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const content = JSON.stringify({ roomCode, files: filtered, updatedAt: Date.now() }, null, 2)
    await fs.writeFile(tmpPath, content, 'utf8')
    try {
      await fs.rename(tmpPath, filePath)
    } catch {
      await fs.copyFile(tmpPath, filePath)
      await fs.unlink(tmpPath).catch(() => {})
    }
    return true
  }
}

module.exports = { FileIndexStore }
