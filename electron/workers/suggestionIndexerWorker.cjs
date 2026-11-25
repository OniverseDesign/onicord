const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parentPort } = require("worker_threads");
const Database = require("better-sqlite3");

function loadNormalizeModule() {
  const localPath = path.join(__dirname, "../services/suggestionNormalize.cjs");
  if (fs.existsSync(localPath)) {
    return require(localPath);
  }
  if (__dirname.includes("app.asar.unpacked")) {
    const asarPath = localPath.replace("app.asar.unpacked", "app.asar");
    return require(asarPath);
  }
  return require("../services/suggestionNormalize.cjs");
}

const {
  normalizeSuggestionKey,
  isQuestionText,
  extractEligibleSuggestionText,
  extractWordsAndEmojis,
  updateEwma,
  mergeVariants,
} = loadNormalizeModule();

const SALT = Buffer.from("Onicord::E2EE::Salt::2026");
const QUESTION_WINDOW_MS = 10 * 60 * 1000;
const keyCache = new Map();

function deriveKey(roomCode) {
  const raw = String(roomCode || "").trim().toUpperCase();
  if (keyCache.has(raw)) return keyCache.get(raw);
  const derived = crypto.pbkdf2Sync(raw, SALT, 10000, 32, "sha256");
  keyCache.set(raw, derived);
  return derived;
}

function deriveLegacyKey(roomCode) {
  const raw = String(roomCode || "").trim().toUpperCase();
  return crypto.createHash("sha256").update(raw).digest();
}

function decryptText(roomCode, ciphertext) {
  if (!roomCode || typeof ciphertext !== "string" || !ciphertext.startsWith("[E2EE]:")) {
    return ciphertext;
  }
  const parts = ciphertext.slice(7).split(":");
  if (parts.length !== 3) return ciphertext;

  const iv = Buffer.from(parts[0], "hex");
  const encryptedHex = parts[1];
  const authTag = Buffer.from(parts[2], "hex");

  try {
    const key = deriveKey(roomCode);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    try {
      const legacyKey = deriveLegacyKey(roomCode);
      const decipher = crypto.createDecipheriv("aes-256-gcm", legacyKey, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      return "";
    }
  }
}

function addPhraseObservation(phraseMap, scopeKey, normKey, exactText, ts, wasAfterQuestion) {
  const mapKey = `${scopeKey}\u0000${normKey}`;
  let entry = phraseMap.get(mapKey);
  if (!entry) {
    entry = {
      scopeKey,
      normKey,
      totalCount: 0,
      ewmaScore: 0,
      ewmaUpdatedAt: ts,
      afterQuestionCount: 0,
      firstUsedAt: ts,
      lastUsedAt: ts,
      variants: {},
    };
    phraseMap.set(mapKey, entry);
  }

  const ewma = updateEwma(entry.ewmaScore, entry.ewmaUpdatedAt, ts, 1);
  entry.ewmaScore = ewma.score;
  entry.ewmaUpdatedAt = ewma.updatedAt;
  entry.totalCount += 1;
  if (wasAfterQuestion) entry.afterQuestionCount += 1;
  if (ts < entry.firstUsedAt) entry.firstUsedAt = ts;
  if (ts > entry.lastUsedAt) entry.lastUsedAt = ts;

  const merged = mergeVariants(entry.variants, exactText, 1, ts);
  entry.variants = merged.variants;
  entry.bestText = merged.bestText;
  entry.bestVariantCount = merged.bestVariantCount;
}

function addWordObservation(wordMap, scopeKey, normWord, word, ts) {
  const mapKey = `${scopeKey}\u0000${normWord}`;
  let entry = wordMap.get(mapKey);
  if (!entry) {
    entry = {
      scopeKey,
      normWord,
      bestWord: word,
      bestCount: 1,
      totalCount: 0,
      ewmaScore: 0,
      ewmaUpdatedAt: ts,
      lastUsedAt: ts,
      _counts: new Map(),
    };
    wordMap.set(mapKey, entry);
  }

  const ewma = updateEwma(entry.ewmaScore, entry.ewmaUpdatedAt, ts, 1);
  entry.ewmaScore = ewma.score;
  entry.ewmaUpdatedAt = ewma.updatedAt;
  entry.totalCount += 1;
  if (ts > entry.lastUsedAt) entry.lastUsedAt = ts;

  const prevCount = (entry._counts.get(word) || 0) + 1;
  entry._counts.set(word, prevCount);
  if (prevCount >= entry.bestCount) {
    entry.bestWord = word;
    entry.bestCount = prevCount;
  }
}

function recordUserMessage(phraseMap, wordMap, scopeKey, cleanText, ts, wasAfterQuestion) {
  const normKey = normalizeSuggestionKey(cleanText);
  if (normKey) {
    addPhraseObservation(phraseMap, "global", normKey, cleanText, ts, wasAfterQuestion);
    addPhraseObservation(phraseMap, scopeKey, normKey, cleanText, ts, wasAfterQuestion);
  }

  const tokens = extractWordsAndEmojis(cleanText);
  const seenInMsg = new Set();
  for (const { normWord, word } of tokens) {
    if (seenInMsg.has(normWord)) continue;
    seenInMsg.add(normWord);
    addWordObservation(wordMap, "global", normWord, word, ts);
    addWordObservation(wordMap, scopeKey, normWord, word, ts);
  }
}

function scanServerMessagesDb(dbPath, roomCode, userId, lastTs, phraseMap, wordMap) {
  let db = null;
  let maxTs = lastTs;
  let lastId = null;
  let scanned = 0;

  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma("busy_timeout = 3000");

    const stmt = db.prepare(
      `SELECT id, channel_id, sender_id, content, attachments_json, timestamp
       FROM messages
       WHERE timestamp > ? AND id NOT IN (SELECT message_id FROM tombstones)
       ORDER BY channel_id ASC, timestamp ASC`
    );

    const prevOtherByChannel = new Map();
    for (const row of stmt.iterate(lastTs)) {
      scanned += 1;
      const ts = Number(row.timestamp || 0);
      if (ts > maxTs) {
        maxTs = ts;
        lastId = row.id;
      }

      const channelId = row.channel_id || "general";
      const isSelf = row.sender_id === userId || row.sender_id === "self";
      const hasAttachment = Boolean(row.attachments_json);

      if (!row.content) {
        if (!isSelf) prevOtherByChannel.set(channelId, { isQuestion: false, ts });
        continue;
      }

      const plain = decryptText(roomCode, row.content);
      if (!isSelf) {
        prevOtherByChannel.set(channelId, {
          isQuestion: isQuestionText(plain),
          ts,
        });
        continue;
      }

      const cleanText = extractEligibleSuggestionText(plain, hasAttachment);
      if (!cleanText) continue;

      const prevOther = prevOtherByChannel.get(channelId);
      const wasAfterQuestion = Boolean(
        prevOther &&
          prevOther.isQuestion &&
          ts - prevOther.ts >= 0 &&
          ts - prevOther.ts <= QUESTION_WINDOW_MS
      );

      recordUserMessage(
        phraseMap,
        wordMap,
        `${roomCode}:${channelId}`,
        cleanText,
        ts,
        wasAfterQuestion
      );
    }
  } finally {
    try {
      if (db && db.open) db.close();
    } catch {}
  }

  return { maxTs, lastId, scanned };
}

function scanDmMessagesDb(dbPath, roomCode, peerId, userId, lastTs, phraseMap, wordMap) {
  let db = null;
  let maxTs = lastTs;
  let lastId = null;
  let scanned = 0;

  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    db.pragma("busy_timeout = 3000");

    const stmt = db.prepare(
      `SELECT id, sender_id, content, attachments_json, timestamp
       FROM dm_messages
       WHERE timestamp > ? AND id NOT IN (SELECT message_id FROM dm_tombstones)
       ORDER BY timestamp ASC`
    );

    const scopeKey = `${roomCode}:dm_${peerId}`;
    let prevOther = null;

    for (const row of stmt.iterate(lastTs)) {
      scanned += 1;
      const ts = Number(row.timestamp || 0);
      if (ts > maxTs) {
        maxTs = ts;
        lastId = row.id;
      }

      const isSelf = row.sender_id === userId || row.sender_id === "self";
      const hasAttachment = Boolean(row.attachments_json);

      if (!row.content) {
        if (!isSelf) prevOther = { isQuestion: false, ts };
        continue;
      }

      const plain = decryptText(roomCode, row.content);
      if (!isSelf) {
        prevOther = { isQuestion: isQuestionText(plain), ts };
        continue;
      }

      const cleanText = extractEligibleSuggestionText(plain, hasAttachment);
      if (!cleanText) continue;

      const wasAfterQuestion = Boolean(
        prevOther &&
          prevOther.isQuestion &&
          ts - prevOther.ts >= 0 &&
          ts - prevOther.ts <= QUESTION_WINDOW_MS
      );

      recordUserMessage(phraseMap, wordMap, scopeKey, cleanText, ts, wasAfterQuestion);
    }
  } finally {
    try {
      if (db && db.open) db.close();
    } catch {}
  }

  return { maxTs, lastId, scanned };
}

function runIndexTask({ userDataPath, userId, watermarks = {} }) {
  const serversDir = path.join(path.resolve(userDataPath), "servers");
  const phraseMap = new Map();
  const wordMap = new Map();
  const newWatermarks = [];

  if (!fs.existsSync(serversDir)) {
    return { phrases: [], words: [], newWatermarks };
  }

  const serverEntries = fs.readdirSync(serversDir, { withFileTypes: true });
  for (const dirEntry of serverEntries) {
    if (!dirEntry.isDirectory()) continue;
    const roomCode = dirEntry.name.toUpperCase();
    const srvDir = path.join(serversDir, dirEntry.name);

    const messagesDbPath = path.join(srvDir, "messages.db");
    if (fs.existsSync(messagesDbPath)) {
      const sourceKey = `server:${roomCode}`;
      const lastTs = Number(watermarks[sourceKey] || 0);
      try {
        const res = scanServerMessagesDb(
          messagesDbPath,
          roomCode,
          userId,
          lastTs,
          phraseMap,
          wordMap
        );
        if (res.scanned > 0) {
          newWatermarks.push({
            sourceKey,
            lastIndexedTimestamp: res.maxTs,
            lastIndexedMessageId: res.lastId,
            messagesScanned: res.scanned,
          });
        }
      } catch (err) {
        console.warn(`[suggestionIndexerWorker] Failed scanning ${messagesDbPath}:`, err.message);
      }
    }

    const dmsDir = path.join(srvDir, "dms");
    if (fs.existsSync(dmsDir)) {
      let dmFiles = [];
      try {
        dmFiles = fs.readdirSync(dmsDir);
      } catch {}
      for (const fileName of dmFiles) {
        if (!fileName.startsWith("dm_") || !fileName.endsWith(".db")) continue;
        const peerId = fileName.slice(3, -3);
        const dmDbPath = path.join(dmsDir, fileName);
        const sourceKey = `dm:${roomCode}:${peerId}`;
        const lastTs = Number(watermarks[sourceKey] || 0);
        try {
          const res = scanDmMessagesDb(
            dmDbPath,
            roomCode,
            peerId,
            userId,
            lastTs,
            phraseMap,
            wordMap
          );
          if (res.scanned > 0) {
            newWatermarks.push({
              sourceKey,
              lastIndexedTimestamp: res.maxTs,
              lastIndexedMessageId: res.lastId,
              messagesScanned: res.scanned,
            });
          }
        } catch (err) {
          console.warn(`[suggestionIndexerWorker] Failed scanning ${dmDbPath}:`, err.message);
        }
      }
    }
  }

  const words = [];
  for (const w of wordMap.values()) {
    words.push({
      scopeKey: w.scopeKey,
      normWord: w.normWord,
      bestWord: w.bestWord,
      totalCount: w.totalCount,
      ewmaScore: w.ewmaScore,
      ewmaUpdatedAt: w.ewmaUpdatedAt,
      lastUsedAt: w.lastUsedAt,
    });
  }

  return {
    phrases: Array.from(phraseMap.values()),
    words,
    newWatermarks,
  };
}

parentPort.on("message", (msg) => {
  if (!msg) return;
  try {
    const result = runIndexTask(msg);
    parentPort.postMessage({ id: msg.id, result });
  } catch (err) {
    parentPort.postMessage({ id: msg.id, error: err?.message || String(err) });
  }
});
