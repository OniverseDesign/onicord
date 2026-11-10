const path = require("path");
const { DbManager } = require("../storage/dbManager.cjs");
const { CasStore } = require("../storage/casStore.cjs");

const MAX_MESSAGES = 5000;
const DEFAULT_CHANNEL = "general";

function safeParse(jsonStr, fallback) {
  if (!jsonStr || typeof jsonStr !== "string") return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}

class ChatStore {
  constructor(userDataPath) {
    this.userDataPath = path.resolve(userDataPath);
    this._recentMessageIds = new Set();
  }

  _dbMgr() {
    return DbManager.getInstance(this.userDataPath);
  }

  _cas() {
    return CasStore.getInstance(this.userDataPath);
  }

  _safeCode(roomCode) {
    if (!roomCode) return "";
    const str = String(roomCode).trim().toUpperCase();
    const clean = str.replace(/[^A-F0-9]/g, "");
    return clean || str;
  }

  _getLocalUserId() {
    try {
      const profileDb = this._dbMgr().getGlobalDb("profile");
      const row = profileDb.prepare("SELECT user_id FROM main_profile WHERE id = 1").get();
      return row?.user_id || null;
    } catch {
      return null;
    }
  }

  _isDmChannel(channelId) {
    return typeof channelId === "string" && channelId.startsWith("dm_");
  }

  _resolveDmPeerId(channelId) {
    const str = String(channelId || "");
    if (!str.startsWith("dm_")) return str;
    const parts = str.split("_");
    const localUserId = this._getLocalUserId();
    if (parts.length >= 3 && localUserId) {
      if (parts[1] === localUserId) return parts.slice(2).join("_");
      if (parts[2] === localUserId) return parts[1];
    }
    return str.slice(3);
  }

  _rowToMessageObject(row, fallbackChannelId) {
    const extra = safeParse(row.extra_json, {});
    const attach = safeParse(row.attachments_json, {});
    return {
      ...extra,
      id: row.id,
      channelId: extra.channelId || row.channel_id || fallbackChannelId || DEFAULT_CHANNEL,
      authorId: row.sender_id || extra.authorId,
      authorNickname: row.sender_nickname || extra.authorNickname || "Usuario",
      authorAvatar: row.sender_avatar_ref || extra.authorAvatar || null,
      text: row.content !== undefined ? row.content : extra.text || "",
      timestamp: row.timestamp || extra.timestamp || 0,
      filePath: attach?.filePath ?? extra.filePath,
      fileName: attach?.fileName ?? extra.fileName,
      fileSize: attach?.fileSize ?? extra.fileSize,
      fileType: attach?.fileType ?? extra.fileType,
    };
  }

  async load(roomCode, channelId = DEFAULT_CHANNEL) {
    const safeCode = this._safeCode(roomCode);
    if (!safeCode) return [];
    const targetChannel = String(channelId || DEFAULT_CHANNEL);

    try {
      if (this._isDmChannel(targetChannel)) {
        const peerId = this._resolveDmPeerId(targetChannel);
        const dmDb = this._dbMgr().getServerDmDb(safeCode, peerId);
        const rows = dmDb
          .prepare(
            `SELECT * FROM dm_messages
             WHERE id NOT IN (SELECT message_id FROM dm_tombstones)
             ORDER BY timestamp ASC
             LIMIT ?`
          )
          .all(MAX_MESSAGES);
        return rows.map((r) => this._rowToMessageObject(r, targetChannel));
      } else {
        const msgDb = this._dbMgr().getServerDb(safeCode, "messages");
        const rows = msgDb
          .prepare(
            `SELECT * FROM messages
             WHERE channel_id = ? AND id NOT IN (SELECT message_id FROM tombstones)
             ORDER BY timestamp ASC
             LIMIT ?`
          )
          .all(targetChannel, MAX_MESSAGES);
        return rows.map((r) => this._rowToMessageObject(r, targetChannel));
      }
    } catch (err) {
      console.error(`[ChatStore] Error loading messages (${safeCode}/${targetChannel}):`, err.message);
      return [];
    }
  }

  _insertMessageSync(safeCode, channelId, message) {
    const cas = this._cas();
    const avRef = cas.storeDataUri(message.authorAvatar || null);
    const cleanMsg = {
      ...message,
      channelId,
      authorAvatar: avRef,
    };
    const attachJson =
      message.filePath || message.fileName
        ? JSON.stringify({
            filePath: message.filePath,
            fileName: message.fileName,
            fileSize: message.fileSize,
            fileType: message.fileType,
          })
        : null;

    if (this._isDmChannel(channelId)) {
      const peerId = this._resolveDmPeerId(channelId);
      const dmDb = this._dbMgr().getServerDmDb(safeCode, peerId);
      const localUserId = this._getLocalUserId();
      const isPeerAuthor = message.authorId && message.authorId !== localUserId;

      const tx = dmDb.transaction(() => {
        dmDb
          .prepare(`
            INSERT OR REPLACE INTO dm_messages (
              id, sender_id, sender_nickname, sender_avatar_ref, content, type,
              reply_to_id, attachments_json, reactions_json, pinned, edited_at, extra_json, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .run(
            String(message.id),
            String(message.authorId || "unknown"),
            message.authorNickname || null,
            avRef,
            message.text || "",
            message.isSystemMessage ? "system" : "text",
            message.replyToId || null,
            attachJson,
            null,
            message.pinned ? 1 : 0,
            message.editedAt || null,
            JSON.stringify(cleanMsg),
            Number(message.timestamp) || Date.now()
          );

        dmDb
          .prepare(`
            INSERT INTO dm_meta (
              peer_user_id, room_code, peer_nickname_snapshot, peer_avatar_ref_snapshot,
              last_read_message_id, unread_count, updated_at
            ) VALUES (?, ?, ?, ?, ?, 0, ?)
            ON CONFLICT(peer_user_id) DO UPDATE SET
              peer_nickname_snapshot = COALESCE(excluded.peer_nickname_snapshot, dm_meta.peer_nickname_snapshot),
              peer_avatar_ref_snapshot = COALESCE(excluded.peer_avatar_ref_snapshot, dm_meta.peer_avatar_ref_snapshot),
              last_read_message_id = excluded.last_read_message_id,
              updated_at = excluded.updated_at
          `)
          .run(
            peerId,
            safeCode,
            isPeerAuthor ? message.authorNickname || null : null,
            isPeerAuthor ? avRef : null,
            channelId,
            Date.now()
          );
      });
      tx();
    } else {
      const msgDb = this._dbMgr().getServerDb(safeCode, "messages");
      msgDb
        .prepare(`
          INSERT OR REPLACE INTO messages (
            id, channel_id, sender_id, sender_nickname, sender_avatar_ref, content, type,
            reply_to_id, thread_id, attachments_json, reactions_json, mentions_json,
            pinned, edited_at, extra_json, timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          String(message.id),
          String(channelId || DEFAULT_CHANNEL),
          String(message.authorId || "unknown"),
          message.authorNickname || null,
          avRef,
          message.text || "",
          message.isSystemMessage
            ? "system"
            : message.isWebhook
            ? "webhook"
            : message.isComplement
            ? "plugin"
            : "text",
          message.replyToId || null,
          message.threadParentId || null,
          attachJson,
          null,
          null,
          message.pinned ? 1 : 0,
          message.editedAt || null,
          JSON.stringify(cleanMsg),
          Number(message.timestamp) || Date.now()
        );
    }

    return cleanMsg;
  }

  async getMessageAuthor(roomCode, channelId, messageId) {
    const safeCode = this._safeCode(roomCode);
    const safeId = String(messageId || "").trim();
    if (!safeCode || !safeId) return null;
    try {
      if (channelId && this._isDmChannel(channelId)) {
        const peerId = this._resolveDmPeerId(channelId);
        const dmDb = this._dbMgr().getServerDmDb(safeCode, peerId);
        const row = dmDb
          .prepare("SELECT sender_id, extra_json FROM dm_messages WHERE id = ?")
          .get(safeId);
        if (row) {
          return row.sender_id || safeParse(row.extra_json, {}).authorId || null;
        }
      }
      const msgDb = this._dbMgr().getServerDb(safeCode, "messages");
      const row = msgDb
        .prepare("SELECT sender_id, extra_json FROM messages WHERE id = ?")
        .get(safeId);
      if (row) {
        return row.sender_id || safeParse(row.extra_json, {}).authorId || null;
      }
    } catch {}
    return null;
  }

  async append(roomCode, channelId, message) {
    if (!message || !message.id) return false;
    const safeCode = this._safeCode(roomCode);
    if (!safeCode) return false;

    const targetChannel = String(channelId || message.channelId || DEFAULT_CHANNEL);
    const dedupKey = `${safeCode}:${targetChannel}:${message.id}`;
    if (this._recentMessageIds.has(dedupKey)) {
      return true;
    }
    this._recentMessageIds.add(dedupKey);
    if (this._recentMessageIds.size > 20000) {
      const iter = this._recentMessageIds.values();
      for (let i = 0; i < 5000; i++) {
        this._recentMessageIds.delete(iter.next().value);
      }
    }

    const tombstones = await this.getTombstones(safeCode);
    if (tombstones.has(message.id)) {
      return false;
    }

    const cleanMsg = this._insertMessageSync(safeCode, targetChannel, message);

    try {
      const { getSearchStore } = require("./searchStore.cjs");
      const searchStore = getSearchStore(this);
      searchStore?.indexMessage(safeCode, { ...cleanMsg, channelId: targetChannel });
    } catch {}

    return true;
  }

  async getTombstones(roomCode) {
    const safeCode = this._safeCode(roomCode);
    if (!safeCode) return new Set();
    try {
      const msgDb = this._dbMgr().getServerDb(safeCode, "messages");
      const rows = msgDb.prepare("SELECT message_id FROM tombstones").all();
      const set = new Set(rows.map((r) => r.message_id));

      const dmPeers = this._dbMgr().listServerDmPeerIds(safeCode);
      for (const peerId of dmPeers) {
        try {
          const dmDb = this._dbMgr().getServerDmDb(safeCode, peerId);
          const dmRows = dmDb.prepare("SELECT message_id FROM dm_tombstones").all();
          for (const r of dmRows) set.add(r.message_id);
        } catch {}
      }
      return set;
    } catch {
      return new Set();
    }
  }

  async addTombstone(roomCode, messageId, channelId = null) {
    const safeCode = this._safeCode(roomCode);
    const safeId = String(messageId || "").trim();
    if (!safeCode || !safeId) return;
    const now = Date.now();
    try {
      const msgDb = this._dbMgr().getServerDb(safeCode, "messages");
      msgDb
        .prepare(`
          INSERT OR REPLACE INTO tombstones (message_id, channel_id, deleted_by, deleted_at)
          VALUES (?, ?, NULL, ?)
        `)
        .run(safeId, channelId || null, now);

      if (channelId && this._isDmChannel(channelId)) {
        const peerId = this._resolveDmPeerId(channelId);
        const dmDb = this._dbMgr().getServerDmDb(safeCode, peerId);
        dmDb
          .prepare(`
            INSERT OR REPLACE INTO dm_tombstones (message_id, deleted_by, deleted_at)
            VALUES (?, NULL, ?)
          `)
          .run(safeId, now);
      }
    } catch (err) {
      console.error("[ChatStore] Error saving tombstone:", err.message);
    }
  }

  async delete(roomCode, channelId, messageId) {
    const safeCode = this._safeCode(roomCode);
    const safeId = String(messageId || "").trim();
    if (!safeCode || !safeId) return { ok: false, deleted: 0 };

    await this.addTombstone(safeCode, safeId, channelId);
    try {
      const { getSearchStore } = require("./searchStore.cjs");
      const searchStore = getSearchStore(this);
      searchStore?.removeMessage(safeCode, safeId);
    } catch {}

    let deleted = 0;
    try {
      if (channelId && this._isDmChannel(channelId)) {
        const peerId = this._resolveDmPeerId(channelId);
        const dmDb = this._dbMgr().getServerDmDb(safeCode, peerId);
        const info = dmDb.prepare("DELETE FROM dm_messages WHERE id = ?").run(safeId);
        deleted += info.changes;
      } else {
        const msgDb = this._dbMgr().getServerDb(safeCode, "messages");
        const info = msgDb.prepare("DELETE FROM messages WHERE id = ?").run(safeId);
        deleted += info.changes;
        if (deleted === 0) {
          // Also check DMs if channelId wasn't explicitly specified as dm_
          const dmPeers = this._dbMgr().listServerDmPeerIds(safeCode);
          for (const peerId of dmPeers) {
            const dmDb = this._dbMgr().getServerDmDb(safeCode, peerId);
            const dmInfo = dmDb.prepare("DELETE FROM dm_messages WHERE id = ?").run(safeId);
            if (dmInfo.changes > 0) {
              dmDb
                .prepare("INSERT OR REPLACE INTO dm_tombstones (message_id, deleted_by, deleted_at) VALUES (?, NULL, ?)")
                .run(safeId, Date.now());
              deleted += dmInfo.changes;
            }
          }
        }
      }
    } catch (err) {
      console.error("[ChatStore] Error deleting message:", err.message);
    }

    return { ok: true, deleted };
  }

  async listChannelIds(roomCode) {
    const safeCode = this._safeCode(roomCode);
    if (!safeCode) return [DEFAULT_CHANNEL];
    try {
      const msgDb = this._dbMgr().getServerDb(safeCode, "messages");
      const rows = msgDb.prepare("SELECT DISTINCT channel_id FROM messages").all();
      const channels = new Set(rows.map((r) => r.channel_id).filter(Boolean));
      if (channels.size === 0) channels.add(DEFAULT_CHANNEL);

      const dmPeers = this._dbMgr().listServerDmPeerIds(safeCode);
      const localUserId = this._getLocalUserId();
      for (const peerId of dmPeers) {
        try {
          const dmDb = this._dbMgr().getServerDmDb(safeCode, peerId);
          const metaRow = dmDb.prepare("SELECT last_read_message_id FROM dm_meta LIMIT 1").get();
          if (metaRow?.last_read_message_id && metaRow.last_read_message_id.startsWith("dm_")) {
            channels.add(metaRow.last_read_message_id);
          } else if (localUserId) {
            const sorted = [localUserId, peerId].sort();
            channels.add(`dm_${sorted[0]}_${sorted[1]}`);
          } else {
            channels.add(`dm_${peerId}`);
          }
        } catch {}
      }

      return Array.from(channels);
    } catch {
      return [DEFAULT_CHANNEL];
    }
  }

  async getWatermarks(roomCode) {
    const safeCode = this._safeCode(roomCode);
    if (!safeCode) return {};
    const watermarks = {};
    try {
      const msgDb = this._dbMgr().getServerDb(safeCode, "messages");
      const rows = msgDb
        .prepare("SELECT channel_id, MAX(timestamp) AS max_ts FROM messages GROUP BY channel_id")
        .all();
      for (const r of rows) {
        if (r.channel_id) {
          watermarks[r.channel_id] = Number(r.max_ts) || 0;
        }
      }

      const dmChannels = (await this.listChannelIds(safeCode)).filter((c) => this._isDmChannel(c));
      for (const dmCh of dmChannels) {
        const peerId = this._resolveDmPeerId(dmCh);
        const dmDb = this._dbMgr().getServerDmDb(safeCode, peerId);
        const row = dmDb.prepare("SELECT MAX(timestamp) AS max_ts FROM dm_messages").get();
        watermarks[dmCh] = Number(row?.max_ts) || 0;
      }
    } catch {}
    return watermarks;
  }

  async getMessagesSince(roomCode, sinceTimestamp = {}, limit = 400) {
    const safeCode = this._safeCode(roomCode);
    if (!safeCode) return [];
    const out = [];

    try {
      const msgDb = this._dbMgr().getServerDb(safeCode, "messages");
      const isNumericSince = typeof sinceTimestamp === "number";
      const watermarks = !isNumericSince && sinceTimestamp && typeof sinceTimestamp === "object"
        ? sinceTimestamp
        : {};
      const globalSince = isNumericSince ? Number(sinceTimestamp) || 0 : 0;

      if (isNumericSince) {
        const rows = msgDb
          .prepare(
            `SELECT * FROM messages
             WHERE timestamp > ? AND id NOT IN (SELECT message_id FROM tombstones)
             ORDER BY timestamp ASC
             LIMIT 5000`
          )
          .all(globalSince);
        for (const r of rows) {
          out.push(this._rowToMessageObject(r, r.channel_id || DEFAULT_CHANNEL));
        }
      } else {
        const channels = await this.listChannelIds(safeCode);
        const regularChannels = channels.filter((c) => !this._isDmChannel(c));
        const stmtByChannel = msgDb.prepare(
          `SELECT * FROM messages
           WHERE channel_id = ? AND timestamp > ? AND id NOT IN (SELECT message_id FROM tombstones)
           ORDER BY timestamp ASC
           LIMIT 5000`
        );
        for (const channelId of regularChannels) {
          const since = Number(watermarks[channelId]) || 0;
          const rows = stmtByChannel.all(channelId, since);
          for (const r of rows) {
            out.push(this._rowToMessageObject(r, channelId));
          }
        }
      }

      const allChannels = await this.listChannelIds(safeCode);
      const dmChannels = allChannels.filter((c) => this._isDmChannel(c));
      for (const dmCh of dmChannels) {
        try {
          const peerId = this._resolveDmPeerId(dmCh);
          const dmDb = this._dbMgr().getServerDmDb(safeCode, peerId);
          const since = isNumericSince ? globalSince : Number(watermarks[dmCh]) || 0;
          const dmRows = dmDb
            .prepare(
              `SELECT * FROM dm_messages
               WHERE timestamp > ? AND id NOT IN (SELECT message_id FROM dm_tombstones)
               ORDER BY timestamp ASC
               LIMIT 5000`
            )
            .all(since);
          for (const r of dmRows) {
            out.push(this._rowToMessageObject(r, dmCh));
          }
        } catch {}
      }
    } catch (err) {
      console.error(`[ChatStore] Error in getMessagesSince (${safeCode}):`, err.message);
    }

    out.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return out.slice(-limit);
  }

  async mergeBatch(roomCode, incomingMessages, { onMessage } = {}) {
    const safeCode = this._safeCode(roomCode);
    if (!safeCode || !Array.isArray(incomingMessages) || incomingMessages.length === 0) {
      return { added: 0 };
    }

    const tombstones = await this.getTombstones(safeCode);
    const msgDb = this._dbMgr().getServerDb(safeCode, "messages");
    const checkMsgExists = msgDb.prepare("SELECT 1 FROM messages WHERE id = ?");
    const insertedList = [];
    const seenIds = new Set();

    const sortedIncoming = [...incomingMessages].sort(
      (a, b) => (a?.timestamp || 0) - (b?.timestamp || 0)
    );

    const tx = msgDb.transaction((items) => {
      for (const msg of items) {
        if (!msg?.id || tombstones.has(msg.id) || seenIds.has(msg.id)) continue;
        const channelId = msg.channelId || DEFAULT_CHANNEL;

        if (this._isDmChannel(channelId)) {
          const peerId = this._resolveDmPeerId(channelId);
          const dmDb = this._dbMgr().getServerDmDb(safeCode, peerId);
          const exists = dmDb.prepare("SELECT 1 FROM dm_messages WHERE id = ?").get(String(msg.id));
          if (exists) continue;
        } else {
          const exists = checkMsgExists.get(String(msg.id));
          if (exists) continue;
        }

        seenIds.add(msg.id);
        const cleanMsg = this._insertMessageSync(safeCode, channelId, msg);
        insertedList.push({ cleanMsg, channelId });
      }
    });

    tx(sortedIncoming);

    let searchStore = null;
    try {
      const { getSearchStore } = require("./searchStore.cjs");
      searchStore = getSearchStore(this);
    } catch {}

    for (const { cleanMsg, channelId } of insertedList) {
      if (onMessage) await onMessage(cleanMsg);
      try {
        searchStore?.indexMessage(safeCode, { ...cleanMsg, channelId });
      } catch {}
    }

    return { added: insertedList.length };
  }
}

module.exports = { ChatStore, DEFAULT_CHANNEL };
