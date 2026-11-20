const path = require("path");
const { DbManager } = require("../storage/dbManager.cjs");

function safeParse(jsonStr, fallback) {
  if (!jsonStr || typeof jsonStr !== "string") return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}

class WhiteboardStore {
  constructor(userDataPath) {
    this.userDataPath = path.resolve(userDataPath);
  }

  _dbMgr() {
    return DbManager.getInstance(this.userDataPath);
  }

  _safeCode(roomCode) {
    if (!roomCode) return "";
    const str = String(roomCode).trim().toUpperCase();
    const clean = str.replace(/[^A-F0-9]/g, "");
    return clean || str;
  }

  loadChannel(roomCode, channelId) {
    const code = this._safeCode(roomCode);
    if (!code || !channelId) return { clearedAt: 0, elements: [] };
    try {
      const db = this._dbMgr().getServerDb(code, "whiteboard");
      const metaRow = db
        .prepare("SELECT cleared_at FROM whiteboard_meta WHERE channel_id = ?")
        .get(channelId);
      const clearedAt = metaRow?.cleared_at || 0;
      const rows = db
        .prepare("SELECT data_json FROM whiteboard_elements WHERE channel_id = ? ORDER BY updated_at ASC")
        .all(channelId);
      const elements = [];
      for (const r of rows) {
        const parsed = safeParse(r.data_json, null);
        if (parsed && parsed.id) elements.push(parsed);
      }
      return { clearedAt, elements };
    } catch (err) {
      console.warn("[WhiteboardStore] loadChannel error:", err.message);
      return { clearedAt: 0, elements: [] };
    }
  }

  applyElements(roomCode, channelId, elements = []) {
    const code = this._safeCode(roomCode);
    if (!code || !channelId || !Array.isArray(elements) || elements.length === 0) return;
    try {
      const db = this._dbMgr().getServerDb(code, "whiteboard");
      const getExisting = db.prepare(
        "SELECT updated_at FROM whiteboard_elements WHERE channel_id = ? AND element_id = ?"
      );
      const upsertStmt = db.prepare(`
        INSERT OR REPLACE INTO whiteboard_elements (channel_id, element_id, data_json, updated_at, deleted)
        VALUES (?, ?, ?, ?, ?)
      `);
      const tx = db.transaction((items) => {
        for (const el of items) {
          if (!el || !el.id) continue;
          const nextTs = Number(el.updatedAt) || 0;
          const existing = getExisting.get(channelId, el.id);
          if (!existing || nextTs >= (existing.updated_at || 0)) {
            upsertStmt.run(
              channelId,
              el.id,
              JSON.stringify(el),
              nextTs,
              el.deleted ? 1 : 0
            );
          }
        }
      });
      tx(elements);
    } catch (err) {
      console.warn("[WhiteboardStore] applyElements error:", err.message);
    }
  }

  clearChannel(roomCode, channelId, clearedAt = Date.now()) {
    const code = this._safeCode(roomCode);
    if (!code || !channelId) return;
    try {
      const db = this._dbMgr().getServerDb(code, "whiteboard");
      const tx = db.transaction(() => {
        db.prepare(
          "INSERT OR REPLACE INTO whiteboard_meta (channel_id, cleared_at) VALUES (?, ?)"
        ).run(channelId, clearedAt);
        db.prepare(
          "DELETE FROM whiteboard_elements WHERE channel_id = ? AND updated_at < ?"
        ).run(channelId, clearedAt);
      });
      tx();
    } catch (err) {
      console.warn("[WhiteboardStore] clearChannel error:", err.message);
    }
  }
}

module.exports = { WhiteboardStore };
