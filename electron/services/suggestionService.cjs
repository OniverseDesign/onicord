const path = require("path");
const { DbManager } = require("../storage/dbManager.cjs");
const { runOneShotWorker } = require("../workers/workerRunner.cjs");
const {
  normalizeSuggestionKey,
  extractEligibleSuggestionText,
  extractWordsAndEmojis,
  computeDecayedScore,
  updateEwma,
  mergeVariants,
} = require("./suggestionNormalize.cjs");

const MAX_SCOPE_PHRASES = 4000;
const MAX_SCOPE_WORDS = 5000;

class SuggestionService {
  constructor() {
    this._indexingPromise = null;
    this._hasIndexedThisSession = false;
    this._initialTimer = null;
    this._userDataOverride = null;
  }

  _setUserDataPathForTests(userDataPath) {
    this._userDataOverride = userDataPath ? path.resolve(userDataPath) : null;
    this._hasIndexedThisSession = false;
    this._indexingPromise = null;
  }

  _getUserDataPath() {
    if (this._userDataOverride) return this._userDataOverride;
    const { app } = require("electron");
    return app.getPath("userData");
  }

  _dbMgr() {
    return DbManager.getInstance(this._getUserDataPath());
  }

  _getDb() {
    return this._dbMgr().getGlobalDb("suggestions");
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

  _safeRoomCode(roomCode) {
    return String(roomCode || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, "");
  }

  _resolveScopeKey(roomCode, channelId, userId) {
    const code = this._safeRoomCode(roomCode);
    if (!code) return "global";
    const rawChannel = String(channelId || "general");
    if (!rawChannel.startsWith("dm_")) {
      return `${code}:${rawChannel}`;
    }

    const raw = rawChannel.slice(3);
    let peerId = raw;
    if (userId && raw.includes(userId)) {
      if (raw.startsWith(`${userId}_`)) {
        peerId = raw.slice(userId.length + 1);
      } else if (raw.endsWith(`_${userId}`)) {
        peerId = raw.slice(0, raw.length - userId.length - 1);
      }
    } else {
      const parts = rawChannel.split("_");
      if (parts.length >= 3 && userId) {
        peerId = parts[1] === userId ? parts.slice(2).join("_") : parts[1];
      }
    }

    const safePeerId = String(peerId || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    return `${code}:dm_${safePeerId}`;
  }

  _mergePhraseIntoDb(stmts, delta) {
    const existing = stmts.getPhrase.get(delta.scopeKey, delta.normKey);
    if (!existing) {
      let variants = delta.variants;
      let bestText = delta.bestText;
      let bestVariantCount = delta.bestVariantCount;
      if (!variants || !bestText) {
        const merged = mergeVariants({}, delta.exactText, delta.totalCount || 1, delta.lastUsedAt);
        variants = merged.variants;
        bestText = merged.bestText;
        bestVariantCount = merged.bestVariantCount;
      }
      stmts.insertPhrase.run(
        delta.scopeKey,
        delta.normKey,
        bestText,
        bestVariantCount || 1,
        delta.totalCount || 1,
        delta.ewmaScore || 1,
        delta.ewmaUpdatedAt,
        delta.afterQuestionCount || 0,
        delta.firstUsedAt || delta.lastUsedAt,
        delta.lastUsedAt,
        JSON.stringify(variants)
      );
      return;
    }

    let existingVariants = {};
    try {
      existingVariants = JSON.parse(existing.variants_json || "{}");
    } catch {}

    let merged;
    if (delta.variants && typeof delta.variants === "object") {
      const combined = new Map();
      for (const [k, v] of Object.entries(existingVariants)) {
        if (v && typeof v === "object") {
          combined.set(k, { c: Number(v.c || 0), t: Number(v.t || 0) });
        }
      }
      for (const [k, v] of Object.entries(delta.variants)) {
        if (v && typeof v === "object") {
          const prev = combined.get(k) || { c: 0, t: 0 };
          combined.set(k, {
            c: prev.c + Number(v.c || 0),
            t: Math.max(prev.t, Number(v.t || 0)),
          });
        }
      }
      merged = mergeVariants(combined, null, 0, delta.lastUsedAt);
    } else {
      merged = mergeVariants(
        existingVariants,
        delta.exactText || delta.bestText,
        delta.totalCount || 1,
        delta.lastUsedAt
      );
    }

    const targetTs = Math.max(existing.ewma_updated_at, delta.ewmaUpdatedAt);
    const baseExisting = computeDecayedScore(existing.ewma_score, existing.ewma_updated_at, targetTs);
    const baseDelta = computeDecayedScore(delta.ewmaScore, delta.ewmaUpdatedAt, targetTs);

    stmts.updatePhrase.run(
      merged.bestText,
      merged.bestVariantCount,
      existing.total_count + (delta.totalCount || 1),
      baseExisting + baseDelta,
      targetTs,
      existing.after_question_count + (delta.afterQuestionCount || 0),
      Math.min(existing.first_used_at, delta.firstUsedAt || delta.lastUsedAt),
      Math.max(existing.last_used_at, delta.lastUsedAt),
      JSON.stringify(merged.variants),
      delta.scopeKey,
      delta.normKey
    );
  }

  _mergeWordIntoDb(stmts, delta) {
    const existing = stmts.getWord.get(delta.scopeKey, delta.normWord);
    if (!existing) {
      stmts.insertWord.run(
        delta.scopeKey,
        delta.normWord,
        delta.bestWord,
        delta.totalCount || 1,
        delta.ewmaScore || 1,
        delta.ewmaUpdatedAt,
        delta.lastUsedAt
      );
      return;
    }

    const targetTs = Math.max(existing.ewma_updated_at, delta.ewmaUpdatedAt);
    const baseExisting = computeDecayedScore(existing.ewma_score, existing.ewma_updated_at, targetTs);
    const baseDelta = computeDecayedScore(delta.ewmaScore, delta.ewmaUpdatedAt, targetTs);
    const bestWord =
      (delta.lastUsedAt >= existing.last_used_at && delta.totalCount >= existing.total_count)
        ? delta.bestWord
        : existing.best_word;

    stmts.updateWord.run(
      bestWord,
      existing.total_count + (delta.totalCount || 1),
      baseExisting + baseDelta,
      targetTs,
      Math.max(existing.last_used_at, delta.lastUsedAt),
      delta.scopeKey,
      delta.normWord
    );
  }

  _prepareStatements(db) {
    return {
      getPhrase: db.prepare(
        "SELECT * FROM suggestion_phrases WHERE scope_key = ? AND norm_key = ?"
      ),
      insertPhrase: db.prepare(
        `INSERT INTO suggestion_phrases
         (scope_key, norm_key, best_text, best_variant_count, total_count, ewma_score, ewma_updated_at, after_question_count, first_used_at, last_used_at, variants_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ),
      updatePhrase: db.prepare(
        `UPDATE suggestion_phrases
         SET best_text = ?, best_variant_count = ?, total_count = ?, ewma_score = ?, ewma_updated_at = ?, after_question_count = ?, first_used_at = ?, last_used_at = ?, variants_json = ?
         WHERE scope_key = ? AND norm_key = ?`
      ),
      getWord: db.prepare(
        "SELECT * FROM suggestion_words WHERE scope_key = ? AND norm_word = ?"
      ),
      insertWord: db.prepare(
        `INSERT INTO suggestion_words
         (scope_key, norm_word, best_word, total_count, ewma_score, ewma_updated_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ),
      updateWord: db.prepare(
        `UPDATE suggestion_words
         SET best_word = ?, total_count = ?, ewma_score = ?, ewma_updated_at = ?, last_used_at = ?
         WHERE scope_key = ? AND norm_word = ?`
      ),
      upsertWatermark: db.prepare(
        `INSERT INTO suggestion_index_state
         (source_key, last_indexed_timestamp, last_indexed_message_id, messages_scanned, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(source_key) DO UPDATE SET
           last_indexed_timestamp = MAX(suggestion_index_state.last_indexed_timestamp, excluded.last_indexed_timestamp),
           last_indexed_message_id = COALESCE(excluded.last_indexed_message_id, suggestion_index_state.last_indexed_message_id),
           messages_scanned = suggestion_index_state.messages_scanned + excluded.messages_scanned,
           updated_at = excluded.updated_at`
      ),
    };
  }

  _pruneScopeIfNeeded(db, scopeKey) {
    const phraseCountRow = db
      .prepare("SELECT COUNT(*) AS cnt FROM suggestion_phrases WHERE scope_key = ?")
      .get(scopeKey);
    if ((phraseCountRow?.cnt || 0) > MAX_SCOPE_PHRASES) {
      const excess = phraseCountRow.cnt - MAX_SCOPE_PHRASES;
      db.prepare(
        `DELETE FROM suggestion_phrases
         WHERE scope_key = ? AND norm_key IN (
           SELECT norm_key FROM suggestion_phrases
           WHERE scope_key = ?
           ORDER BY total_count ASC, last_used_at ASC
           LIMIT ?
         )`
      ).run(scopeKey, scopeKey, excess);
    }

    const wordCountRow = db
      .prepare("SELECT COUNT(*) AS cnt FROM suggestion_words WHERE scope_key = ?")
      .get(scopeKey);
    if ((wordCountRow?.cnt || 0) > MAX_SCOPE_WORDS) {
      const excess = wordCountRow.cnt - MAX_SCOPE_WORDS;
      db.prepare(
        `DELETE FROM suggestion_words
         WHERE scope_key = ? AND norm_word IN (
           SELECT norm_word FROM suggestion_words
           WHERE scope_key = ?
           ORDER BY total_count ASC, last_used_at ASC
           LIMIT ?
         )`
      ).run(scopeKey, scopeKey, excess);
    }
  }

  scheduleInitialIndex(delayMs = 4000) {
    if (this._initialTimer) return;
    this._initialTimer = setTimeout(() => {
      this._initialTimer = null;
      this.runIncrementalIndex().catch((err) => {
        console.warn("[SuggestionService] Initial background index error:", err.message);
      });
    }, delayMs);
    if (typeof this._initialTimer.unref === "function") {
      this._initialTimer.unref();
    }
  }

  async runIncrementalIndex({ forceFull = false, userIdOverride = null } = {}) {
    if (this._indexingPromise) {
      if (!forceFull) return this._indexingPromise;
      await this._indexingPromise.catch(() => {});
    }

    const task = (async () => {
      const db = this._getDb();
      if (forceFull) {
        db.transaction(() => {
          db.prepare("DELETE FROM suggestion_phrases").run();
          db.prepare("DELETE FROM suggestion_words").run();
          db.prepare("DELETE FROM suggestion_index_state").run();
        })();
      }

      const userId = userIdOverride || this._getLocalUserId();
      const watermarkRows = db
        .prepare("SELECT source_key, last_indexed_timestamp FROM suggestion_index_state")
        .all();
      const watermarks = {};
      for (const row of watermarkRows) {
        watermarks[row.source_key] = Number(row.last_indexed_timestamp || 0);
      }

      const result = await runOneShotWorker("suggestionIndexerWorker.cjs", {
        userDataPath: this._getUserDataPath(),
        userId,
        watermarks,
      });

      this._hasIndexedThisSession = true;

      if (result) {
        const stmts = this._prepareStatements(db);
        const now = Date.now();
        const touchedScopes = new Set();

        db.transaction(() => {
          for (const p of result.phrases || []) {
            this._mergePhraseIntoDb(stmts, p);
            touchedScopes.add(p.scopeKey);
          }
          for (const w of result.words || []) {
            this._mergeWordIntoDb(stmts, w);
            touchedScopes.add(w.scopeKey);
          }
          for (const wm of result.newWatermarks || []) {
            stmts.upsertWatermark.run(
              wm.sourceKey,
              wm.lastIndexedTimestamp,
              wm.lastIndexedMessageId || null,
              wm.messagesScanned || 0,
              now
            );
          }
          for (const sk of touchedScopes) {
            this._pruneScopeIfNeeded(db, sk);
          }
        })();
      }

      try {
        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
          global.mainWindow.webContents.send("suggestions:updated", {
            indexedAt: Date.now(),
          });
        }
      } catch {}

      return {
        ok: true,
        phrasesMerged: result?.phrases?.length || 0,
        wordsMerged: result?.words?.length || 0,
        sourcesUpdated: result?.newWatermarks?.length || 0,
      };
    })();

    this._indexingPromise = task;
    try {
      return await task;
    } finally {
      if (this._indexingPromise === task) {
        this._indexingPromise = null;
      }
    }
  }

  recordOutgoingMessage({
    roomCode,
    channelId,
    text,
    timestamp = Date.now(),
    wasAfterQuestion = false,
  }) {
    const cleanText = extractEligibleSuggestionText(text, false);
    if (!cleanText) return false;

    const normKey = normalizeSuggestionKey(cleanText);
    if (!normKey) return false;

    const db = this._getDb();
    const userId = this._getLocalUserId();
    const localScopeKey = this._resolveScopeKey(roomCode, channelId, userId);
    const scopes = localScopeKey === "global" ? ["global"] : ["global", localScopeKey];
    const ts = Number(timestamp || Date.now());
    const stmts = this._prepareStatements(db);
    const tokens = extractWordsAndEmojis(cleanText);

    db.transaction(() => {
      for (const scopeKey of scopes) {
        const existing = stmts.getPhrase.get(scopeKey, normKey);
        if (!existing) {
          const merged = mergeVariants({}, cleanText, 1, ts);
          stmts.insertPhrase.run(
            scopeKey,
            normKey,
            merged.bestText,
            merged.bestVariantCount,
            1,
            1.0,
            ts,
            wasAfterQuestion ? 1 : 0,
            ts,
            ts,
            JSON.stringify(merged.variants)
          );
        } else {
          let existingVariants = {};
          try {
            existingVariants = JSON.parse(existing.variants_json || "{}");
          } catch {}
          const merged = mergeVariants(existingVariants, cleanText, 1, ts);
          const ewma = updateEwma(existing.ewma_score, existing.ewma_updated_at, ts, 1);
          stmts.updatePhrase.run(
            merged.bestText,
            merged.bestVariantCount,
            existing.total_count + 1,
            ewma.score,
            ewma.updatedAt,
            existing.after_question_count + (wasAfterQuestion ? 1 : 0),
            Math.min(existing.first_used_at, ts),
            Math.max(existing.last_used_at, ts),
            JSON.stringify(merged.variants),
            scopeKey,
            normKey
          );
        }

        const seenWords = new Set();
        for (const { normWord, word } of tokens) {
          if (seenWords.has(normWord)) continue;
          seenWords.add(normWord);

          const existingWord = stmts.getWord.get(scopeKey, normWord);
          if (!existingWord) {
            stmts.insertWord.run(scopeKey, normWord, word, 1, 1.0, ts, ts);
          } else {
            const ewmaWord = updateEwma(existingWord.ewma_score, existingWord.ewma_updated_at, ts, 1);
            stmts.updateWord.run(
              word,
              existingWord.total_count + 1,
              ewmaWord.score,
              ewmaWord.updatedAt,
              Math.max(existingWord.last_used_at, ts),
              scopeKey,
              normWord
            );
          }
        }
      }
    })();

    return true;
  }

  getSnapshot({ roomCode, channelId } = {}) {
    if (!this._hasIndexedThisSession && !this._indexingPromise) {
      this.runIncrementalIndex().catch((err) => {
        console.warn("[SuggestionService] Lazy background index error:", err.message);
      });
    }

    const db = this._getDb();
    const userId = this._getLocalUserId();
    const localScopeKey = this._resolveScopeKey(roomCode, channelId, userId);
    const now = Date.now();

    const prefRows = db
      .prepare(
        "SELECT norm_key, status, display_text, pin_order, updated_at FROM suggestion_prefs ORDER BY pin_order ASC, updated_at DESC"
      )
      .all();

    const pinned = [];
    const dismissed = [];
    for (const row of prefRows) {
      if (row.status === "pinned" && row.display_text) {
        pinned.push({
          normKey: row.norm_key,
          text: row.display_text,
          pinOrder: row.pin_order,
        });
      } else if (row.status === "dismissed") {
        dismissed.push(row.norm_key);
      }
    }

    const fetchPhrasesForScope = db.prepare(
      `SELECT norm_key, best_text, total_count, ewma_score, ewma_updated_at, after_question_count, last_used_at
       FROM suggestion_phrases
       WHERE scope_key = ?
       ORDER BY ewma_score DESC, last_used_at DESC
       LIMIT 120`
    );

    const localPhrases = localScopeKey !== "global" ? fetchPhrasesForScope.all(localScopeKey) : [];
    const globalPhrases = fetchPhrasesForScope.all("global");

    const phraseMap = new Map();
    for (const row of globalPhrases) {
      const decayed = computeDecayedScore(row.ewma_score, row.ewma_updated_at, now);
      phraseMap.set(row.norm_key, {
        normKey: row.norm_key,
        text: row.best_text,
        totalCount: row.total_count,
        baseScore: decayed,
        afterQuestionCount: row.after_question_count || 0,
        lastUsedAt: row.last_used_at,
        isLocal: false,
      });
    }

    for (const row of localPhrases) {
      const decayedLocal = computeDecayedScore(row.ewma_score, row.ewma_updated_at, now);
      const existing = phraseMap.get(row.norm_key);
      if (!existing) {
        phraseMap.set(row.norm_key, {
          normKey: row.norm_key,
          text: row.best_text,
          totalCount: row.total_count,
          baseScore: decayedLocal * 1.6,
          afterQuestionCount: row.after_question_count || 0,
          lastUsedAt: row.last_used_at,
          isLocal: true,
        });
      } else {
        phraseMap.set(row.norm_key, {
          normKey: row.norm_key,
          text: row.best_text || existing.text,
          totalCount: Math.max(existing.totalCount, row.total_count),
          baseScore: existing.baseScore + decayedLocal * 0.6,
          afterQuestionCount: Math.max(
            existing.afterQuestionCount,
            row.after_question_count || 0
          ),
          lastUsedAt: Math.max(existing.lastUsedAt, row.last_used_at),
          isLocal: true,
        });
      }
    }

    const phrases = Array.from(phraseMap.values())
      .sort((a, b) => {
        if (b.baseScore !== a.baseScore) return b.baseScore - a.baseScore;
        return b.lastUsedAt - a.lastUsedAt;
      })
      .slice(0, 140);

    const fetchWordsForScope = db.prepare(
      `SELECT norm_word, best_word, total_count, ewma_score, ewma_updated_at, last_used_at
       FROM suggestion_words
       WHERE scope_key = ?
       ORDER BY ewma_score DESC, last_used_at DESC
       LIMIT 160`
    );

    const localWords = localScopeKey !== "global" ? fetchWordsForScope.all(localScopeKey) : [];
    const globalWords = fetchWordsForScope.all("global");

    const wordMap = new Map();
    for (const row of globalWords) {
      const decayed = computeDecayedScore(row.ewma_score, row.ewma_updated_at, now);
      wordMap.set(row.norm_word, {
        normWord: row.norm_word,
        text: row.best_word,
        totalCount: row.total_count,
        baseScore: decayed,
        lastUsedAt: row.last_used_at,
      });
    }

    for (const row of localWords) {
      const decayedLocal = computeDecayedScore(row.ewma_score, row.ewma_updated_at, now);
      const existing = wordMap.get(row.norm_word);
      if (!existing) {
        wordMap.set(row.norm_word, {
          normWord: row.norm_word,
          text: row.best_word,
          totalCount: row.total_count,
          baseScore: decayedLocal * 1.5,
          lastUsedAt: row.last_used_at,
        });
      } else {
        wordMap.set(row.norm_word, {
          normWord: row.norm_word,
          text: row.best_word || existing.text,
          totalCount: Math.max(existing.totalCount, row.total_count),
          baseScore: existing.baseScore + decayedLocal * 0.5,
          lastUsedAt: Math.max(existing.lastUsedAt, row.last_used_at),
        });
      }
    }

    const words = Array.from(wordMap.values())
      .sort((a, b) => {
        if (b.baseScore !== a.baseScore) return b.baseScore - a.baseScore;
        return b.lastUsedAt - a.lastUsedAt;
      })
      .slice(0, 250);

    return {
      scopeKey: localScopeKey,
      pinned,
      dismissed,
      phrases,
      words,
      indexing: Boolean(this._indexingPromise),
    };
  }

  setPreference({ normKey, status, displayText = null }) {
    if (!normKey || typeof normKey !== "string") return { ok: false };
    const db = this._getDb();
    const now = Date.now();

    if (status === "clear" || !status) {
      db.prepare("DELETE FROM suggestion_prefs WHERE norm_key = ?").run(normKey);
      return { ok: true };
    }

    if (status !== "pinned" && status !== "dismissed") {
      return { ok: false };
    }

    let nextOrder = 0;
    if (status === "pinned") {
      const maxRow = db
        .prepare("SELECT COALESCE(MAX(pin_order), -1) AS max_order FROM suggestion_prefs WHERE status = 'pinned'")
        .get();
      nextOrder = Number(maxRow?.max_order ?? -1) + 1;
    }

    db.prepare(
      `INSERT INTO suggestion_prefs (norm_key, status, display_text, pin_order, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(norm_key) DO UPDATE SET
         status = excluded.status,
         display_text = COALESCE(excluded.display_text, suggestion_prefs.display_text),
         pin_order = CASE WHEN excluded.status = 'pinned' THEN excluded.pin_order ELSE 0 END,
         updated_at = excluded.updated_at`
    ).run(normKey, status, displayText, nextOrder, now);

    return { ok: true };
  }

  clearDismissed() {
    const db = this._getDb();
    const res = db.prepare("DELETE FROM suggestion_prefs WHERE status = 'dismissed'").run();
    return { ok: true, cleared: res.changes || 0 };
  }

  async reindexAll() {
    return this.runIncrementalIndex({ forceFull: true });
  }
}

module.exports = new SuggestionService();
