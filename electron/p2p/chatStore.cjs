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
    this._recentMessageIds = new Set()
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

  async load(roomCode, channelId = DEFAULT_CHANNEL) {
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
    if (!message || !message.id) return []
    if (this._recentMessageIds.has(message.id)) return []
    this._recentMessageIds.add(message.id)
    if (this._recentMessageIds.size > 20000) {
      const iter = this._recentMessageIds.values()
      for (let i = 0; i < 5000; i++) {
        this._recentMessageIds.delete(iter.next().value)
      }
    }

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
    try {
      const { getSearchStore } = require('./searchStore.cjs')
      const searchStore = getSearchStore(this)
      searchStore?.indexMessage(roomCode, { ...message, channelId })
    } catch {}
    return trimmed
  }

  _tombstonesPath(roomCode) {
    return path.join(this.dir, this._safeCode(roomCode), '_tombstones.json')
  }

  async getTombstones(roomCode) {
    try {
      const raw = await fs.readFile(this._tombstonesPath(roomCode), 'utf8')
      const data = JSON.parse(raw)
      return Array.isArray(data) ? new Set(data) : new Set()
    } catch {
      return new Set()
    }
  }

  async addTombstone(roomCode, messageId) {
    const safeId = String(messageId || '').trim()
    if (!safeId) return
    try {
      const tombstones = await this.getTombstones(roomCode)
      tombstones.add(safeId)
      const list = Array.from(tombstones).slice(-2000)
      await writeFileAtomic(this._tombstonesPath(roomCode), JSON.stringify(list))
    } catch (err) {
      console.error('[ChatStore] Error saving tombstone:', err)
    }
  }

  async delete(roomCode, channelId, messageId) {
    const safeId = String(messageId || '').trim()
    if (!safeId) return { ok: false, deleted: 0 }
    await this.addTombstone(roomCode, safeId)
    try {
      const { getSearchStore } = require('./searchStore.cjs')
      const searchStore = getSearchStore(this)
      searchStore?.removeMessage(roomCode, safeId)
    } catch {}
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
    const dir = path.join(this.dir, this._safeCode(roomCode))
    try {
      const files = await readdir(dir)
      return files.filter((f) => f.endsWith('.json') && !f.startsWith('_')).map((f) => f.replace(/\.json$/, ''))
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
    const tombstones = await this.getTombstones(roomCode)
    const channels = await this.listChannelIds(roomCode)
    const out = []
    for (const channelId of channels) {
      const since = watermarks[channelId] || 0
      const messages = await this.load(roomCode, channelId)
      for (const m of messages) {
        if ((m.timestamp || 0) > since && !tombstones.has(m.id)) out.push(m)
      }
    }
    out.sort((a, b) => a.timestamp - b.timestamp)
    return out.slice(-limit)
  }

  async mergeBatch(roomCode, messages, { onMessage } = {}) {
    const tombstones = await this.getTombstones(roomCode)
    let totalAdded = 0
    const byChannel = new Map()

    for (const msg of messages) {
      if (!msg?.id || tombstones.has(msg.id)) continue
      const channelId = msg.channelId || DEFAULT_CHANNEL
      if (!byChannel.has(channelId)) byChannel.set(channelId, [])
      byChannel.get(channelId).push(msg)
    }

    for (const [channelId, batch] of byChannel) {
      const existing = await this.load(roomCode, channelId)
      const existingIds = new Set(existing.map((m) => m.id))
      let channelAdded = 0

      for (const msg of batch.sort((a, b) => a.timestamp - b.timestamp)) {
        if (existingIds.has(msg.id) || tombstones.has(msg.id)) continue
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
        try {
          const { getSearchStore } = require('./searchStore.cjs')
          const searchStore = getSearchStore(this)
          if (searchStore) {
            for (const msg of batch) {
              searchStore.indexMessage(roomCode, { ...msg, channelId })
            }
          }
        } catch {}
      }
    }

    return { added: totalAdded }
  }
}

module.exports = { ChatStore, DEFAULT_CHANNEL }
