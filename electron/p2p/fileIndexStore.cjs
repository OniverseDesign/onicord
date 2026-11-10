const path = require("path");
const { DbManager } = require("../storage/dbManager.cjs");

const MAX_FILES = 500;

function safeParse(jsonStr, fallback) {
  if (!jsonStr || typeof jsonStr !== "string") return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}

class FileIndexStore {
  constructor(userDataPath) {
    this.userDataPath = path.resolve(userDataPath);
  }

  _dbMgr() {
    return DbManager.getInstance(this.userDataPath);
  }

  _safeCode(roomCode) {
    return String(roomCode || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-F0-9]/g, "");
  }

  _rowToFile(row) {
    const extra = safeParse(row.extra_json, {});
    delete extra.realPath;
    delete extra.local_path;
    return {
      ...extra,
      id: row.file_id,
      ownerId: row.owner_id || extra.ownerId || null,
      name: row.name,
      size: Number(row.size_bytes) || extra.size || 0,
      realPath: row.local_path || null,
      uploadedAt: Number(row.uploaded_at) || extra.uploadedAt || 0,
      updatedAt: Number(row.updated_at) || extra.updatedAt || 0,
    };
  }

  async load(roomCode) {
    const safeCode = this._safeCode(roomCode);
    if (!safeCode) return [];
    try {
      const msgDb = this._dbMgr().getServerDb(safeCode, "messages");
      const rows = msgDb
        .prepare("SELECT * FROM shared_files ORDER BY uploaded_at ASC LIMIT ?")
        .all(MAX_FILES);
      return rows.map((r) => this._rowToFile(r));
    } catch {
      return [];
    }
  }

  async merge(roomCode, remoteFiles, options = {}) {
    const safeCode = this._safeCode(roomCode);
    if (!safeCode) return { added: 0, files: [] };
    if (!remoteFiles?.length) return { added: 0, files: await this.load(safeCode) };

    const msgDb = this._dbMgr().getServerDb(safeCode, "messages");
    let added = 0;
    const allowLocalPath = Boolean(options && options.isLocal === true);

    const getExisting = msgDb.prepare("SELECT * FROM shared_files WHERE file_id = ?");
    const upsertFile = msgDb.prepare(`
      INSERT INTO shared_files (
        file_id, owner_id, name, size_bytes, mime_type, cas_hash, local_path, extra_json, uploaded_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_id) DO UPDATE SET
        owner_id = excluded.owner_id,
        name = excluded.name,
        size_bytes = excluded.size_bytes,
        mime_type = excluded.mime_type,
        cas_hash = COALESCE(shared_files.cas_hash, excluded.cas_hash),
        local_path = COALESCE(shared_files.local_path, excluded.local_path),
        extra_json = excluded.extra_json,
        uploaded_at = excluded.uploaded_at,
        updated_at = excluded.updated_at
    `);

    const tx = msgDb.transaction((items) => {
      for (const f of items) {
        if (!f?.id) continue;
        const fId = String(f.id);
        const existingRow = getExisting.get(fId);
        const now = Date.now();
        const { realPath: _rp, local_path: _lp, ...safeIncoming } = f;
        const trustedLocalPath = allowLocalPath ? (f.realPath || f.local_path || null) : null;

        if (!existingRow) {
          upsertFile.run(
            fId,
            safeIncoming.ownerId || null,
            String(safeIncoming.name || "archivo"),
            Number(safeIncoming.size) || 0,
            safeIncoming.mimeType || null,
            null,
            trustedLocalPath,
            JSON.stringify(safeIncoming),
            Number(safeIncoming.uploadedAt) || now,
            Number(safeIncoming.updatedAt || safeIncoming.uploadedAt) || now
          );
          added++;
        } else {
          const exFile = this._rowToFile(existingRow);
          if ((safeIncoming.updatedAt || safeIncoming.uploadedAt || 0) > (exFile.updatedAt || exFile.uploadedAt || 0)) {
            const preservedLocalPath = existingRow.local_path || trustedLocalPath || null;
            const { realPath: _exRp, local_path: _exLp, ...safeExisting } = exFile;
            const merged = { ...safeExisting, ...safeIncoming };
            upsertFile.run(
              fId,
              merged.ownerId || null,
              String(merged.name || "archivo"),
              Number(merged.size) || 0,
              merged.mimeType || null,
              null,
              preservedLocalPath,
              JSON.stringify(merged),
              Number(merged.uploadedAt) || now,
              Number(merged.updatedAt || merged.uploadedAt) || now
            );
            added++;
          }
        }
      }
    });
    tx(remoteFiles);

    const files = await this.load(safeCode);
    return { added, files };
  }

  getWatermark(files) {
    if (!files?.length) return 0;
    return Math.max(...files.map((f) => f.updatedAt || f.uploadedAt || 0));
  }

  async remove(roomCode, fileId) {
    const safeCode = this._safeCode(roomCode);
    if (!safeCode || !fileId) return false;
    try {
      const msgDb = this._dbMgr().getServerDb(safeCode, "messages");
      const info = msgDb
        .prepare("DELETE FROM shared_files WHERE file_id = ?")
        .run(String(fileId));
      return info.changes > 0;
    } catch {
      return false;
    }
  }

  async removeByMessageId(roomCode, messageId) {
    const safeCode = this._safeCode(roomCode);
    if (!safeCode || !messageId) return false;
    try {
      const msgDb = this._dbMgr().getServerDb(safeCode, "messages");
      const rows = msgDb.prepare("SELECT * FROM shared_files").all();
      let deleted = 0;
      const delStmt = msgDb.prepare("DELETE FROM shared_files WHERE file_id = ?");
      for (const r of rows) {
        const extra = safeParse(r.extra_json, {});
        if (extra.messageId === messageId) {
          delStmt.run(r.file_id);
          deleted++;
        }
      }
      return deleted > 0;
    } catch {
      return false;
    }
  }
}

module.exports = { FileIndexStore };
