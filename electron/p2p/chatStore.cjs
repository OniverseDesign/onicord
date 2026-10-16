const fs = require('fs/promises')
const path = require('path')
const { readdir } = require('fs/promises')

const MAX_MESSAGES = 5000
const DEFAULT_CHANNEL = 'general'

async function writeFileAtomic(filePath, data, encoding = 'utf8') {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmpPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  await fs.writeFile(tmpPath, data, encoding)
  try {
    await fs.rename(tmpPath, filePath)
  } catch (err) {
    await fs.copyFile(tmpPath, filePath)
    await fs.unlink(tmpPath).catch(() => {})
  }
}

class ChatStore {
  constructor(userDataPath) {
    this.dir = path.join(userDataPath, 'chats')
  }

  _safeCode(roomCode) {
    if (!roomCode) return ''
    const str = String(roomCode).trim().toUpperCase()
    const clean = str.replace(/[^A-F0-9]/g, '')
    return clean || str
  }

  _channelPath(roomCode, channelId = DEFAULT_CHANNEL) {
    const safe = this._safeCode(roomCode)
    const safeChannel = String(channelId).replace(/[^a-zA-Z0-9_-]/g, '') || DEFAULT_CHANNEL
    return path.join(this.dir, safe, `${safeChannel}.json`)
  }

  _legacyPath(roomCode) {
    return path.join(this.dir, `${this._safeCode(roomCode)}.json`)
  }

  async _migrateLegacy(roomCode, channelId) {
    const legacy = this._legacyPath(roomCode)
    const target = this._channelPath(roomCode, channelId)
    try {
      const raw = await fs.readFile(legacy, 'utf8')
      let messages = []
      try {
        const data = JSON.parse(raw)
        if (Array.isArray(data)) {
          messages = data
        } else if (Array.isArray(data.messages)) {
          messages = data.messages
        } else if (data && typeof data === 'object') {
          for (const val of Object.values(data)) {
            if (Array.isArray(val) && val.length > 0) {
              messages = val
              break
            }
          }
        }
      } catch (err) {
        console.error('[ChatStore] Error parsing legacy chat file:', err.message)
      }

      if (messages.length > 0) {
        await writeFileAtomic(
          target,
          JSON.stringify(
            { roomCode: this._safeCode(roomCode), channelId, messages, updatedAt: Date.now() },
            null,
            2
          )
        )
      }

      const targetStat = await fs.stat(target).catch(() => null)
      if (targetStat && targetStat.size > 0) {
        await fs.unlink(legacy).catch(() => {})
      }
    } catch {
    }
  }

  async load(roomCode, channelId = DEFAULT_CHANNEL) {
    await this._migrateLegacy(roomCode, channelId)
    try {
      const filePath = this._channelPath(roomCode, channelId)
      const raw = await fs.readFile(filePath, 'utf8')
      let data = null
      try {
        data = JSON.parse(raw)
      } catch {
        const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
        if (match) {
          try {
            data = JSON.parse(match[0])
          } catch {}
        }
      }

      if (Array.isArray(data)) return data
      if (Array.isArray(data?.messages)) return data.messages
      return []
    } catch {
      return []
    }
  }

  async append(roomCode, channelId, message) {
    const messages = await this.load(roomCode, channelId)
    if (messages.some((m) => m.id === message.id)) return messages

    messages.push(message)
    messages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    const trimmed =
      messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages

    const filePath = this._channelPath(roomCode, channelId)
    await writeFileAtomic(
      filePath,
      JSON.stringify(
        {
          roomCode: this._safeCode(roomCode),
          channelId,
          messages: trimmed,
          updatedAt: Date.now(),
        },
        null,
        2
      )
    )
    return trimmed
  }

  async delete(roomCode, channelId, messageId) {
    const safeId = String(messageId || '').trim()
    if (!safeId) return { ok: false, deleted: 0 }
    const messages = await this.load(roomCode, channelId)
    const before = messages.length
    const next = messages.filter((m) => m.id !== safeId)
    const deleted = before - next.length
    if (!deleted) return { ok: true, deleted: 0 }

    const filePath = this._channelPath(roomCode, channelId)
    await writeFileAtomic(
      filePath,
      JSON.stringify(
        {
          roomCode: this._safeCode(roomCode),
          channelId,
          messages: next,
          updatedAt: Date.now(),
        },
        null,
        2
      )
    )
    return { ok: true, deleted }
  }

  async listChannelIds(roomCode) {
    await this._migrateLegacy(roomCode, DEFAULT_CHANNEL)
    const dir = path.join(this.dir, this._safeCode(roomCode))
    try {
      const files = await readdir(dir)
      return files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
    } catch {
      return [DEFAULT_CHANNEL]
    }
  }

  async getWatermarks(roomCode) {
    const channels = await this.listChannelIds(roomCode)
    const watermarks = {}
    for (const channelId of channels) {
      const messages = await this.load(roomCode, channelId)
      watermarks[channelId] = messages.length
        ? Math.max(0, ...messages.map((m) => (Number.isFinite(m.timestamp) ? m.timestamp : 0)))
        : 0
    }
    return watermarks
  }

  async getMessagesSince(roomCode, watermarks = {}, limit = 400) {
    const channels = await this.listChannelIds(roomCode)
    const out = []
    for (const channelId of channels) {
      const since = watermarks[channelId] || 0
      const messages = await this.load(roomCode, channelId)
      for (const m of messages) {
        if ((m.timestamp || 0) > since) out.push(m)
      }
    }
    out.sort((a, b) => a.timestamp - b.timestamp)
    return out.slice(-limit)
  }

  async mergeBatch(roomCode, messages, { onMessage } = {}) {
    let totalAdded = 0
    const byChannel = new Map()

    for (const msg of messages) {
      if (!msg?.id) continue
      const channelId = msg.channelId || DEFAULT_CHANNEL
      if (!byChannel.has(channelId)) byChannel.set(channelId, [])
      byChannel.get(channelId).push(msg)
    }

    for (const [channelId, batch] of byChannel) {
      const existing = await this.load(roomCode, channelId)
      const existingIds = new Set(existing.map((m) => m.id))
      let channelAdded = 0

      for (const msg of batch.sort((a, b) => a.timestamp - b.timestamp)) {
        if (existingIds.has(msg.id)) continue
        existingIds.add(msg.id)
        existing.push(msg)
        channelAdded++
        if (onMessage) await onMessage(msg)
      }

      if (channelAdded > 0) {
        totalAdded += channelAdded
        existing.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
        const trimmed =
          existing.length > MAX_MESSAGES ? existing.slice(-MAX_MESSAGES) : existing
        const filePath = this._channelPath(roomCode, channelId)
        await writeFileAtomic(
          filePath,
          JSON.stringify(
            {
              roomCode: this._safeCode(roomCode),
              channelId,
              messages: trimmed,
              updatedAt: Date.now(),
            },
            null,
            2
          )
        )
      }
    }

    return { added: totalAdded }
  }
}

module.exports = { ChatStore, DEFAULT_CHANNEL }
