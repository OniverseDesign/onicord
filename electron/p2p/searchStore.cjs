const path = require("path");
const fs = require("fs/promises");
const cryptoService = require("../services/cryptoService.cjs");

/**
 * Normaliza y tokeniza un texto eliminando tildes, signos de puntuación y convirtiendo a minúsculas.
 * Soporta caracteres Unicode completos (acentos, diéresis, ñ, etc.).
 */
function normalizeText(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remueve diacríticos (á -> a, é -> e, etc.)
    .replace(/[^\p{L}\p{N}_\s]+/gu, " ") // Convierte signos de puntuación en espacios
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  // Divide por cualquier carácter no alfanumérico
  return normalized
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((t) => t.length > 0);
}

/**
 * Parsea una consulta de búsqueda que puede contener texto libre y operadores especiales:
 * - from:<usuario>  (filtra por autor)
 * - in:<canal>      (filtra por id de canal)
 * - has:file        (solo mensajes con archivo adjunto)
 * - has:image       (solo mensajes con imágenes)
 * - has:link        (solo mensajes con enlaces web)
 * - "frase exacta"  (coincidencia exacta)
 */
function parseSearchQuery(rawQuery) {
  if (!rawQuery || typeof rawQuery !== "string") {
    return { terms: [], phrases: [], filters: {} };
  }

  let text = rawQuery.trim();
  const filters = {
    from: null,
    in: null,
    hasFile: false,
    hasImage: false,
    hasLink: false,
  };
  const phrases = [];

  // Extraer frases entre comillas "..."
  text = text.replace(/"([^"]+)"/g, (_match, phrase) => {
    const trimmed = phrase.trim();
    if (trimmed) phrases.push(trimmed);
    return " ";
  });

  // Extraer operadores from:...
  text = text.replace(/(?:^|\s)from:(\S+)/gi, (_match, val) => {
    filters.from = normalizeText(val);
    return " ";
  });

  // Extraer operadores in:...
  text = text.replace(/(?:^|\s)in:(\S+)/gi, (_match, val) => {
    filters.in = String(val).toLowerCase().replace(/^#/, "").trim();
    return " ";
  });

  // Extraer operadores has:...
  text = text.replace(/(?:^|\s)has:(\S+)/gi, (match, val) => {
    const lower = val.toLowerCase();
    if (lower === "file" || lower === "attachment" || lower === "archivo" || lower === "adjunto" || lower.startsWith("fil")) {
      filters.hasFile = true;
      return " ";
    } else if (lower === "image" || lower === "img" || lower === "foto" || lower === "imagen" || lower.startsWith("imag") || lower.startsWith("fot")) {
      filters.hasImage = true;
      return " ";
    } else if (lower === "link" || lower === "url" || lower === "enlace" || lower.startsWith("lin") || lower.startsWith("url")) {
      filters.hasLink = true;
      return " ";
    }
    return match;
  });

  const terms = tokenize(text);

  return {
    raw: rawQuery,
    terms,
    phrases,
    filters,
  };
}

class SearchStore {
  constructor(chatStore) {
    this.chatStore = chatStore;
    // Map<roomCode, { indexed: boolean, docs: Map<messageId, Doc>, inverted: Map<token, Map<messageId, freq>>, avgdl: number }>
    this.indices = new Map();
  }

  _getOrCreateIndex(roomCode) {
    const safeCode = this.chatStore._safeCode(roomCode);
    if (!this.indices.has(safeCode)) {
      this.indices.set(safeCode, {
        indexed: false,
        indexingPromise: null,
        docs: new Map(),
        inverted: new Map(),
        totalTokens: 0,
      });
    }
    return this.indices.get(safeCode);
  }

  _isSystemMessage(text) {
    if (!text || typeof text !== "string") return false;
    const trimmed = text.trim();
    return (
      trimmed.startsWith("[REACTION_ACTION]:") ||
      trimmed.startsWith("[PIN_ACTION]:") ||
      trimmed.startsWith("[EDIT_MESSAGE]:") ||
      trimmed.startsWith("[PLUGIN_ACTION]:") ||
      trimmed.startsWith("[NUDGE_MESSAGE]") ||
      trimmed.includes("[NUDGE_MESSAGE]")
    );
  }

  _extractMessageMeta(rawText, roomCode) {
    if (!rawText) return null;
    let text = rawText;
    if (typeof text === "string" && text.startsWith("[E2EE]:")) {
      text = cryptoService.decrypt(roomCode, text);
    }
    if (this._isSystemMessage(text)) return null;

    if (typeof text === "string" && text.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.body) text = parsed.body;
        else if (parsed.text) text = parsed.text;
      } catch {}
    }

    let isFile = false;
    let fileName = "";
    let cleanText = text || "";

    if (typeof text === "string" && text.includes("[FILE_ATTACHMENT]:")) {
      isFile = true;
      try {
        const parts = text.split("[FILE_ATTACHMENT]:");
        cleanText = parts[0] ? parts[0].trim() : "";
        const fileData = JSON.parse(parts[1]);
        if (fileData?.name) fileName = fileData.name;
      } catch {}
    }

    let linkUrl = null;
    if (typeof cleanText === "string" && cleanText.includes("[LINK]:")) {
      const parts = cleanText.split("[LINK]:");
      cleanText = parts[0] ? parts[0].trim() : "";
      linkUrl = parts[1] ? parts[1].trim() : linkUrl;
    }

    const hasLink = Boolean(linkUrl || (typeof cleanText === "string" && /https?:\/\/[^\s\)]+/i.test(cleanText)));
    const isImage = Boolean(
      fileName && /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(fileName)
    );

    return { cleanText, fileName, isFile, isImage, hasLink };
  }

  _indexDocument(indexData, doc) {
    // Si ya existe, primero des-indexarlo
    if (indexData.docs.has(doc.id)) {
      this._removeDocument(indexData, doc.id);
    }

    const searchableText = `${doc.text || ""} ${doc.fileName || ""} ${doc.authorName || ""}`;
    const tokens = tokenize(searchableText);
    const tokenFreq = new Map();

    for (const t of tokens) {
      tokenFreq.set(t, (tokenFreq.get(t) || 0) + 1);
    }

    doc.tokenCount = tokens.length;
    doc.tokens = new Set(tokens);
    indexData.docs.set(doc.id, doc);
    indexData.totalTokens += tokens.length;

    for (const [token, freq] of tokenFreq) {
      if (!indexData.inverted.has(token)) {
        indexData.inverted.set(token, new Map());
      }
      indexData.inverted.get(token).set(doc.id, freq);
    }
  }

  _removeDocument(indexData, messageId) {
    const doc = indexData.docs.get(messageId);
    if (!doc) return;

    indexData.totalTokens = Math.max(0, indexData.totalTokens - (doc.tokenCount || 0));
    indexData.docs.delete(messageId);

    if (doc.tokens) {
      for (const token of doc.tokens) {
        const postings = indexData.inverted.get(token);
        if (postings) {
          postings.delete(messageId);
          if (postings.size === 0) {
            indexData.inverted.delete(token);
          }
        }
      }
    }
  }

  async ensureIndex(roomCode) {
    const safeCode = this.chatStore._safeCode(roomCode);
    const indexData = this._getOrCreateIndex(safeCode);

    if (indexData.indexed) return indexData;
    if (indexData.indexingPromise) return indexData.indexingPromise;

    indexData.indexingPromise = (async () => {
      try {
        const tombstones = await this.chatStore.getTombstones(safeCode);
        const channelIds = await this.chatStore.listChannelIds(safeCode);

        for (const channelId of channelIds) {
          const rawMessages = await this.chatStore.load(safeCode, channelId);
          for (const msg of rawMessages) {
            if (!msg?.id || tombstones.has(msg.id)) continue;
            const meta = this._extractMessageMeta(msg.text, safeCode);
            if (!meta && !msg.fileName) continue;

            const finalFileName = meta?.fileName || msg.fileName || null;
            const isFile = Boolean(meta?.isFile || msg.filePath || msg.fileName);
            const isImage = Boolean(
              meta?.isImage ||
              (msg.fileType && msg.fileType.startsWith("image/")) ||
              (finalFileName && /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(finalFileName))
            );
            const hasLink = Boolean(meta?.hasLink || msg.linkUrl);

            const doc = {
              id: msg.id,
              roomCode: safeCode,
              channelId: msg.channelId || channelId,
              authorId: msg.authorId,
              authorName: msg.authorNickname || msg.authorName || "",
              authorAvatar: msg.authorAvatar || null,
              text: meta?.cleanText || "",
              timestamp: msg.timestamp || 0,
              filePath: msg.filePath || null,
              fileName: finalFileName,
              isFile,
              isImage,
              hasLink,
              isSystemMessage: Boolean(msg.isSystemMessage),
              isComplement: Boolean(msg.isComplement),
              complementName: msg.complementName || null,
              threadParentId: msg.threadParentId || null,
            };
            this._indexDocument(indexData, doc);
          }
        }

        indexData.indexed = true;
      } catch (err) {
        console.error(`[SearchStore] Error building index for ${safeCode}:`, err);
      } finally {
        indexData.indexingPromise = null;
      }
      return indexData;
    })();

    return indexData.indexingPromise;
  }

  indexMessage(roomCode, msg) {
    if (!roomCode || !msg?.id) return;
    const safeCode = this.chatStore._safeCode(roomCode);
    const indexData = this._getOrCreateIndex(safeCode);

    const meta = this._extractMessageMeta(msg.text, safeCode);
    if (!meta && !msg.fileName) return;

    const finalFileName = meta?.fileName || msg.fileName || null;
    const isFile = Boolean(meta?.isFile || msg.filePath || msg.fileName);
    const isImage = Boolean(
      meta?.isImage ||
      (msg.fileType && msg.fileType.startsWith("image/")) ||
      (finalFileName && /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(finalFileName))
    );
    const hasLink = Boolean(meta?.hasLink || msg.linkUrl);

    const doc = {
      id: msg.id,
      roomCode: safeCode,
      channelId: msg.channelId || "general",
      authorId: msg.authorId,
      authorName: msg.authorNickname || msg.authorName || "",
      authorAvatar: msg.authorAvatar || null,
      text: meta?.cleanText || "",
      timestamp: msg.timestamp || Date.now(),
      filePath: msg.filePath || null,
      fileName: finalFileName,
      isFile,
      isImage,
      hasLink,
      isSystemMessage: Boolean(msg.isSystemMessage),
      isComplement: Boolean(msg.isComplement),
      complementName: msg.complementName || null,
      threadParentId: msg.threadParentId || null,
    };

    this._indexDocument(indexData, doc);
  }

  removeMessage(roomCode, messageId) {
    if (!roomCode || !messageId) return;
    const safeCode = this.chatStore._safeCode(roomCode);
    const indexData = this.indices.get(safeCode);
    if (!indexData) return;
    this._removeDocument(indexData, messageId);
  }

  /**
   * Ejecuta una búsqueda BM25 completa con filtrado por operadores.
   * @param {string} roomCode
   * @param {string} queryString
   * @param {object} [options]
   * @param {string} [options.channelId]
   * @param {number} [options.limit=50]
   * @returns {Promise<Array>} Lista de mensajes ordenados por relevancia y fecha
   */
  async search(roomCode, queryString, options = {}) {
    if (!roomCode || !queryString || typeof queryString !== "string") {
      return [];
    }

    const safeCode = this.chatStore._safeCode(roomCode);
    const indexData = await this.ensureIndex(safeCode);

    const parsed = parseSearchQuery(queryString);
    const { terms, phrases, filters } = parsed;

    // Si no hay términos, frases ni filtros válidos, retornar vacío
    if (terms.length === 0 && phrases.length === 0 && !filters.from && !filters.in && !filters.hasFile && !filters.hasImage && !filters.hasLink) {
      return [];
    }

    const totalDocs = indexData.docs.size;
    if (totalDocs === 0) return [];

    const avgdl = (indexData.totalTokens / totalDocs) || 1;
    const k1 = 1.2;
    const b = 0.75;

    // Filtro por canal explícito si se pasa por opción y no se especificó in:
    const targetChannel = filters.in || (options.channelOnly ? options.channelId : null);

    // Candidatos a considerar
    let candidateIds = null;

    if (terms.length > 0) {
      // Para búsquedas con términos, calculamos la unión o intersección de candidatos
      candidateIds = new Set();
      for (const term of terms) {
        const postings = indexData.inverted.get(term);
        if (postings) {
          for (const msgId of postings.keys()) {
            candidateIds.add(msgId);
          }
        } else {
          // Búsqueda por prefijo/subcadena para términos parciales si no hay coincidencia exacta de token
          for (const [indexedToken, postingsMap] of indexData.inverted) {
            if (indexedToken.startsWith(term) || (term.length >= 3 && indexedToken.includes(term))) {
              for (const msgId of postingsMap.keys()) {
                candidateIds.add(msgId);
              }
            }
          }
        }
      }
    } else {
      // Si solo hay frases o filtros (ej. from:pepe o has:file), todos los docs son candidatos
      candidateIds = new Set(indexData.docs.keys());
    }

    const results = [];

    for (const msgId of candidateIds) {
      const doc = indexData.docs.get(msgId);
      if (!doc) continue;

      // 1. Filtro de Canal
      if (targetChannel && doc.channelId.toLowerCase() !== targetChannel.toLowerCase()) {
        continue;
      }

      // 2. Filtro from:autor
      if (filters.from) {
        const normalizedAuthor = normalizeText(doc.authorName);
        if (!normalizedAuthor.includes(filters.from)) {
          continue;
        }
      }

      // 3. Filtro has:file
      if (filters.hasFile && !doc.isFile) {
        continue;
      }

      // 4. Filtro has:image
      if (filters.hasImage && !doc.isImage) {
        continue;
      }

      // 5. Filtro has:link
      if (filters.hasLink && !doc.hasLink) {
        continue;
      }

      // 6. Verificación de Frases Exactas ("frase")
      if (phrases.length > 0) {
        const docNormalized = normalizeText(`${doc.text || ""} ${doc.fileName || ""}`);
        const allPhrasesMatch = phrases.every((phrase) =>
          docNormalized.includes(normalizeText(phrase))
        );
        if (!allPhrasesMatch) continue;
      }

      // 7. Cálculo de Score BM25
      let score = 0;
      let matchedTermsCount = 0;
      const docLen = doc.tokenCount || 1;

      for (const term of terms) {
        let tf = 0;
        const postings = indexData.inverted.get(term);
        if (postings && postings.has(msgId)) {
          tf = postings.get(msgId);
        } else {
          // Búsqueda aproximada en el texto del doc si no es un token exacto
          const docNorm = normalizeText(`${doc.text || ""} ${doc.fileName || ""}`);
          if (docNorm.includes(term)) {
            tf = 1;
          }
        }

        if (tf > 0) {
          matchedTermsCount++;
          const n = postings ? postings.size : 1;
          const idf = Math.log(1 + (totalDocs - n + 0.5) / (n + 0.5));
          const num = tf * (k1 + 1);
          const den = tf + k1 * (1 - b + (b * docLen) / avgdl);
          score += idf * (num / den);
        }
      }

      // Si había términos y el mensaje no contiene ninguno de ellos, descartar
      if (terms.length > 0 && matchedTermsCount === 0) {
        continue;
      }

      // Bonus por coincidencia en nombre de archivo
      if (doc.fileName && terms.some((t) => normalizeText(doc.fileName).includes(t))) {
        score += 2.0;
      }

      // Bonus por coincidencia de frase exacta
      if (phrases.length > 0) {
        score += 5.0 * phrases.length;
      }

      // Bonus de frescura temporal muy sutil (mensajes más recientes rompen empates)
      const ageHours = Math.max(0, (Date.now() - (doc.timestamp || 0)) / 3600000);
      const recencyBonus = Math.max(0, 1.0 / (1.0 + ageHours * 0.05));
      score += recencyBonus;

      results.push({
        score,
        message: {
          id: doc.id,
          roomCode: doc.roomCode,
          channelId: doc.channelId,
          authorId: doc.authorId,
          authorNickname: doc.authorName,
          authorName: doc.authorName,
          authorAvatar: doc.authorAvatar,
          text: doc.text,
          timestamp: doc.timestamp,
          filePath: doc.filePath,
          fileName: doc.fileName,
          fileSize: doc.fileSize,
          fileType: doc.fileType,
          isSystemMessage: doc.isSystemMessage,
          isComplement: doc.isComplement,
          complementName: doc.complementName,
          threadParentId: doc.threadParentId,
        },
      });
    }

    // Ordenar resultados por Score descendente y luego por timestamp
    results.sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.001) {
        return b.score - a.score;
      }
      return (b.message.timestamp || 0) - (a.message.timestamp || 0);
    });

    const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 50;
    return results.slice(0, limit).map((r) => r.message);
  }
}

let globalSearchStoreInstance = null;

function getSearchStore(chatStore) {
  if (!globalSearchStoreInstance && chatStore) {
    globalSearchStoreInstance = new SearchStore(chatStore);
  }
  return globalSearchStoreInstance;
}

module.exports = {
  SearchStore,
  getSearchStore,
  parseSearchQuery,
  normalizeText,
  tokenize,
};
