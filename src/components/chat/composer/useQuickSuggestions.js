import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { CUSTOM_EMOJI_TOKEN_SOURCE } from "../../../lib/emojiData";

const MAX_SUGGESTIONS = 6;
const MAX_VISUAL_LENGTH = 100;
const CONTEXT_WINDOW_MS = 10 * 60 * 1000;
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;

const CONTROL_PATTERNS = [
  '"type":"sticker"',
  "[MUSIC_ACTION]",
  "[NUDGE_MESSAGE]",
  "[REACTION_ACTION]",
  "[TTS_MESSAGE]",
  "[PIN_ACTION]",
  "[EDIT_MESSAGE]",
  "[FORWARD_MESSAGE]",
  "[PLUGIN_ACTION]",
  "[PLUGIN_EMBED]",
  "[FILE_ATTACHMENT]",
];

const BUILTIN_MENTION_HANDLES = new Set(["everyone", "here", "todos", "all"]);

const QUESTION_START_REGEX =
  /^(?:qué|que|cómo|como|cuándo|cuando|dónde|donde|por qué|porque|quién|quien|cuál|cual|cuánto|cuanto|what|when|where|why|who|how|which|can|could|would|should|do|does|did|is|are|was|were|have|has|will|qual|quem|onde|como|quando|por que|você|voce|vc|pode)\b/i;

const GREETING_REGEX =
  /^(?:hola+|holi+|buenas|buen d[ií]a|buenos d[ií]as|buenas tardes|buenas noches|hey+|hi+|hello+|yo+|wena+s?|qué tal|que tal|como est[aá]s|ol[aá]|oi+|bom dia|boa tarde|boa noite|e a[ií]|tudo bem)\b/i;

const THANKS_REGEX =
  /\b(?:gracias|muchas gracias|grx|ty|thx|tysm|thank you|thanks|obrigad[oa]|valeu|vlw)\b/i;

const FAREWELL_REGEX =
  /\b(?:chau+|chao+|nos vemos|hasta luego|hasta ma[ñn]ana|adi[oó]s|bye+|cya|see ya|gn|good night|flw|falou|até mais|ate logo|tchau)\b/i;

const SHORT_QUESTION_REPLY_REGEX =
  /^(?:s[ií]+|no+|nop|sip|dale+|ok+|okay|claro+|obvio|seguro|ya voy|voy|ahora veo|luego veo|despu[eé]s|puede ser|tal vez|ni idea|no s[eé]|yes+|yeah+|yep|nope|nah|sure|maybe|idk|on my way|omw|sim+|n[aã]o+|beleza|blz|bora|já vou|ja vou|sei l[aá])\b/i;

/**
 * Strips inline markdown delimiters while keeping custom emoji tokens intact.
 */
export function stripMarkdownFormatting(text) {
  if (!text || typeof text !== "string") return "";
  const tokens = [];
  const tokenRegex = new RegExp(CUSTOM_EMOJI_TOKEN_SOURCE, "gi");
  let stripped = text.replace(tokenRegex, (match) => {
    const placeholder = `\uE000${tokens.length}\uE001`;
    tokens.push(match);
    return placeholder;
  });

  let prev;
  do {
    prev = stripped;
    stripped = stripped
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
      .replace(/___([^_]+)___/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/_([^_]+)_/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1");
  } while (stripped !== prev);

  return stripped.replace(/\uE000(\d+)\uE001/g, (_, idx) => tokens[Number(idx)] || "");
}

/**
 * Replaces raw custom emoji tokens with `:shortcode:` and strips markdown
 * for readable tooltips, length checks, and search matching.
 */
export function getReadableSuggestionText(text) {
  if (!text || typeof text !== "string") return "";
  const regex = new RegExp(CUSTOM_EMOJI_TOKEN_SOURCE, "gi");
  return stripMarkdownFormatting(text).replace(
    regex,
    (_, _animated, shortcode) => `:${shortcode}:`
  );
}

function normalizePlainSegment(segment) {
  if (!segment || typeof segment !== "string") return "";
  return segment
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(\p{L})\1+/gu, "$1");
}

function normalizeSuggestionKey(text) {
  const unformatted = stripMarkdownFormatting(text);
  const regex = new RegExp(CUSTOM_EMOJI_TOKEN_SOURCE, "gi");
  let result = "";
  let lastIndex = 0;

  for (const match of unformatted.matchAll(regex)) {
    const plain = unformatted.slice(lastIndex, match.index);
    result += normalizePlainSegment(plain);
    result += match[0].toLowerCase();
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < unformatted.length) {
    result += normalizePlainSegment(unformatted.slice(lastIndex));
  }

  return result.trim().replace(/\s+/g, " ");
}

function extractEligibleTextFromMessage(message, userId) {
  if (!message) return null;
  const isMe = message.authorId === userId || message.authorId === "self";
  if (!isMe) return null;
  if (message.fileName || message.filePath) return null;
  if (typeof message.text !== "string") return null;

  const text = message.text.trim();
  if (!text) return null;
  if (text.startsWith("{") || text.startsWith("/")) return null;
  if (/^https?:\/\/\S+$/i.test(text)) return null;
  if (CONTROL_PATTERNS.some((pattern) => text.includes(pattern))) return null;

  const hasCustomEmoji = new RegExp(CUSTOM_EMOJI_TOKEN_SOURCE, "i").test(text);
  const readable = getReadableSuggestionText(text).trim();
  const visualLength = readable.length;
  if (visualLength < 1 || visualLength > MAX_VISUAL_LENGTH) return null;

  if (!hasCustomEmoji) {
    if (/^[\d\s.,:+\-/#]+$/.test(readable)) return null;
    if (/^[0-9a-f]{12,}$/i.test(readable)) return null;
    if (!/[\p{L}\p{Extended_Pictographic}]/u.test(readable)) return null;
    if (visualLength === 1 && !/\p{Extended_Pictographic}/u.test(readable)) return null;
  }

  return text;
}

function extractWordsForFallback(text) {
  const results = [];
  const tokenRegex = new RegExp(CUSTOM_EMOJI_TOKEN_SOURCE, "gi");
  let lastIndex = 0;

  const pushPlain = (plain) => {
    const clean = stripMarkdownFormatting(plain);
    for (let part of clean.split(/\s+/)) {
      if (!part) continue;
      if (part.startsWith("@") || part.startsWith("/") || /^https?:\/\//i.test(part)) continue;
      part = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (!part || part.length < 3 || /^\d+$/.test(part) || !/\p{L}/u.test(part)) continue;
      const normWord = normalizePlainSegment(part);
      if (normWord.length >= 2) results.push({ normWord, word: part });
    }
  };

  for (const match of text.matchAll(tokenRegex)) {
    if (match.index > lastIndex) pushPlain(text.slice(lastIndex, match.index));
    results.push({ normWord: match[0].toLowerCase(), word: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) pushPlain(text.slice(lastIndex));
  return results;
}

function detectMessageIntent(rawText) {
  if (!rawText || typeof rawText !== "string") return null;
  const clean = getReadableSuggestionText(rawText).trim();
  if (!clean) return null;

  if (/[?¿？]/.test(clean) || QUESTION_START_REGEX.test(clean)) {
    return "question";
  }
  if (THANKS_REGEX.test(clean)) return "thanks";
  if (GREETING_REGEX.test(clean)) return "greeting";
  if (FAREWELL_REGEX.test(clean)) return "farewell";
  return null;
}

function computeIntentMultiplier(candidate, lastIntent) {
  if (!lastIntent) return 1;
  const readable = getReadableSuggestionText(candidate.text).trim();

  if (lastIntent === "question") {
    let mult = 1;
    if (candidate.afterQuestionCount > 0) {
      mult *= 1 + Math.min(1.5, candidate.afterQuestionCount * 0.4);
    }
    if (SHORT_QUESTION_REPLY_REGEX.test(readable)) {
      mult *= 1.6;
    }
    return mult;
  }

  if (lastIntent === "greeting" && GREETING_REGEX.test(readable)) return 1.8;
  if (
    lastIntent === "thanks" &&
    /\b(?:de nada|por nada|no hay de qué|tranqui|con gusto|you'?re welcome|welcome|np|no problem|de boa|disponha|magina)\b/i.test(
      readable
    )
  ) {
    return 1.8;
  }
  if (lastIntent === "farewell" && FAREWELL_REGEX.test(readable)) return 1.8;

  return 1;
}

function hasInvalidMention(text, validMentionHandles) {
  if (!text || !text.includes("@")) return false;
  const unformatted = stripMarkdownFormatting(text);
  const mentionRegex = /(?:^|[\s(])@([\p{L}\p{N}_.-]+)/gu;
  for (const match of unformatted.matchAll(mentionRegex)) {
    const handle = match[1].toLowerCase();
    if (!BUILTIN_MENTION_HANDLES.has(handle) && !validMentionHandles.has(handle)) {
      return true;
    }
  }
  return false;
}

function buildFallbackFromMessages(messages, userId) {
  const userEntries = [];
  let prevOther = null;

  for (const msg of messages || []) {
    if (!msg) continue;
    const isMe = msg.authorId === userId || msg.authorId === "self";
    const ts = Number(msg.timestamp || 0);
    if (!isMe) {
      if (typeof msg.text === "string" && !msg.text.trim().startsWith("{")) {
        prevOther = { isQuestion: /[?¿？]/.test(msg.text), ts };
      }
      continue;
    }
    const cleanText = extractEligibleTextFromMessage(msg, userId);
    if (!cleanText) continue;
    const wasAfterQuestion = Boolean(
      prevOther && prevOther.isQuestion && ts - prevOther.ts >= 0 && ts - prevOther.ts <= CONTEXT_WINDOW_MS
    );
    userEntries.push({ text: cleanText, ts, wasAfterQuestion });
  }

  const recent = userEntries.slice(-200);
  const groups = new Map();
  const wordMap = new Map();
  const now = Date.now();

  recent.forEach(({ text, ts, wasAfterQuestion }, idx) => {
    const normKey = normalizeSuggestionKey(text);
    if (normKey) {
      let group = groups.get(normKey);
      if (!group) {
        group = {
          normKey,
          totalCount: 0,
          afterQuestionCount: 0,
          lastUsedAt: ts || idx,
          baseScore: 0,
          variants: new Map(),
        };
        groups.set(normKey, group);
      }
      group.totalCount += 1;
      if (wasAfterQuestion) group.afterQuestionCount += 1;
      if (ts > group.lastUsedAt) group.lastUsedAt = ts;
      const ageMs = ts ? Math.max(0, now - ts) : (recent.length - idx) * 60000;
      group.baseScore += Math.exp((-Math.LN2 * ageMs) / HALF_LIFE_MS);

      const prevVar = group.variants.get(text) || { c: 0, t: 0 };
      group.variants.set(text, { c: prevVar.c + 1, t: Math.max(prevVar.t, ts || idx) });
    }

    for (const { normWord, word } of extractWordsForFallback(text)) {
      const prev = wordMap.get(normWord);
      const ageMs = ts ? Math.max(0, now - ts) : (recent.length - idx) * 60000;
      const delta = Math.exp((-Math.LN2 * ageMs) / HALF_LIFE_MS);
      if (!prev) {
        wordMap.set(normWord, {
          normWord,
          text: word,
          totalCount: 1,
          baseScore: delta,
          lastUsedAt: ts || idx,
        });
      } else {
        prev.totalCount += 1;
        prev.baseScore += delta;
        if ((ts || idx) >= prev.lastUsedAt) {
          prev.text = word;
          prev.lastUsedAt = ts || idx;
        }
      }
    }
  });

  const phrases = Array.from(groups.values()).map((g) => {
    let bestText = "";
    let bestCount = -1;
    let bestLast = -1;
    for (const [variantText, stats] of g.variants.entries()) {
      if (stats.c > bestCount || (stats.c === bestCount && stats.t > bestLast)) {
        bestText = variantText;
        bestCount = stats.c;
        bestLast = stats.t;
      }
    }
    return {
      normKey: g.normKey,
      text: bestText,
      totalCount: g.totalCount,
      baseScore: g.baseScore,
      afterQuestionCount: g.afterQuestionCount,
      lastUsedAt: g.lastUsedAt,
      isLocal: true,
    };
  });

  return {
    pinned: [],
    dismissed: [],
    phrases,
    words: Array.from(wordMap.values()),
  };
}

/**
 * Provides ranked, context-aware, IDE-style quick message and last-word suggestions.
 */
export function useQuickSuggestions({
  roomCode = null,
  channelId = null,
  messages = [],
  profile = null,
  peers = [],
  isInputFocused = false,
  input = "",
}) {
  const enableSuggestions = profile?.general?.enableQuickSuggestions ?? true;
  const userId = profile?.id;
  const hasElectronSuggestions = Boolean(window.electronAPI?.getQuickSuggestionsSnapshot);

  const [snapshotState, setSnapshotState] = useState({
    key: null,
    data: null,
    fetchedAt: 0,
  });

  const activeScopeKey = `${roomCode || "global"}:${channelId || "general"}`;
  const activeScopeRef = useRef(activeScopeKey);
  activeScopeRef.current = activeScopeKey;

  const loadSnapshot = useCallback(async () => {
    if (!enableSuggestions || !hasElectronSuggestions) return;
    const reqKey = `${roomCode || "global"}:${channelId || "general"}`;
    try {
      const data = await window.electronAPI.getQuickSuggestionsSnapshot(
        roomCode,
        channelId || "general"
      );
      if (activeScopeRef.current !== reqKey) return;
      setSnapshotState({
        key: reqKey,
        data,
        fetchedAt: Date.now(),
      });
    } catch (err) {
      console.warn("[useQuickSuggestions] Failed loading snapshot:", err?.message || err);
    }
  }, [enableSuggestions, hasElectronSuggestions, roomCode, channelId]);

  useEffect(() => {
    if (!enableSuggestions || !hasElectronSuggestions) return;
    loadSnapshot();
  }, [enableSuggestions, hasElectronSuggestions, loadSnapshot]);

  useEffect(() => {
    if (!enableSuggestions || !window.electronAPI?.on) return;
    return window.electronAPI.on("suggestions:updated", () => {
      loadSnapshot();
    });
  }, [enableSuggestions, loadSnapshot]);

  const validMentionHandles = useMemo(() => {
    const handles = new Set();
    if (profile?.nickname) handles.add(String(profile.nickname).toLowerCase());
    if (Array.isArray(peers)) {
      for (const p of peers) {
        if (p?.nickname) handles.add(String(p.nickname).toLowerCase());
      }
    } else if (peers && typeof peers === "object") {
      for (const p of Object.values(peers)) {
        if (p?.nickname) handles.add(String(p.nickname).toLowerCase());
      }
    }
    return handles;
  }, [profile?.nickname, peers]);

  const mergedCorpus = useMemo(() => {
    if (!enableSuggestions) {
      return { pinned: [], dismissedSet: new Set(), phrases: [], words: [] };
    }

    const currentSnapshot =
      snapshotState.key === activeScopeKey ? snapshotState.data : null;

    if (!currentSnapshot) {
      const fb = buildFallbackFromMessages(messages, userId);
      return {
        pinned: fb.pinned,
        dismissedSet: new Set(fb.dismissed),
        phrases: fb.phrases,
        words: fb.words,
      };
    }

    const phraseMap = new Map();
    for (const p of currentSnapshot.phrases || []) {
      phraseMap.set(p.normKey, { ...p });
    }
    const wordMap = new Map();
    for (const w of currentSnapshot.words || []) {
      wordMap.set(w.normWord, { ...w });
    }

    // Optimistically incorporate newly sent messages in the active session
    const recentSlice = Array.isArray(messages) ? messages.slice(-30) : [];
    const fetchedAt = snapshotState.fetchedAt || 0;
    let prevOther = null;

    for (const msg of recentSlice) {
      if (!msg) continue;
      const isMe = msg.authorId === userId || msg.authorId === "self";
      const ts = Number(msg.timestamp || 0);
      if (!isMe) {
        if (typeof msg.text === "string" && !msg.text.trim().startsWith("{")) {
          prevOther = { isQuestion: /[?¿？]/.test(msg.text), ts };
        }
        continue;
      }
      if (ts && ts <= fetchedAt) continue;
      const cleanText = extractEligibleTextFromMessage(msg, userId);
      if (!cleanText) continue;

      const wasAfterQuestion = Boolean(
        prevOther && prevOther.isQuestion && ts - prevOther.ts >= 0 && ts - prevOther.ts <= CONTEXT_WINDOW_MS
      );
      const normKey = normalizeSuggestionKey(cleanText);
      if (normKey) {
        const existing = phraseMap.get(normKey);
        if (!existing) {
          phraseMap.set(normKey, {
            normKey,
            text: cleanText,
            totalCount: 1,
            baseScore: 1.6,
            afterQuestionCount: wasAfterQuestion ? 1 : 0,
            lastUsedAt: ts || Date.now(),
            isLocal: true,
          });
        } else if ((ts || 0) > (existing.lastUsedAt || 0)) {
          existing.totalCount += 1;
          existing.baseScore += 1.6;
          if (wasAfterQuestion) existing.afterQuestionCount += 1;
          existing.lastUsedAt = ts;
          existing.text = cleanText;
          existing.isLocal = true;
        }
      }

      for (const { normWord, word } of extractWordsForFallback(cleanText)) {
        const existingW = wordMap.get(normWord);
        if (!existingW) {
          wordMap.set(normWord, {
            normWord,
            text: word,
            totalCount: 1,
            baseScore: 1.5,
            lastUsedAt: ts || Date.now(),
          });
        } else if ((ts || 0) > (existingW.lastUsedAt || 0)) {
          existingW.totalCount += 1;
          existingW.baseScore += 1.5;
          existingW.lastUsedAt = ts;
          existingW.text = word;
        }
      }
    }

    return {
      pinned: currentSnapshot.pinned || [],
      dismissedSet: new Set(currentSnapshot.dismissed || []),
      phrases: Array.from(phraseMap.values()),
      words: Array.from(wordMap.values()),
    };
  }, [enableSuggestions, snapshotState, activeScopeKey, messages, userId]);

  // Detect recent incoming message intent from another user
  const lastOtherIntent = useMemo(() => {
    if (!Array.isArray(messages) || messages.length === 0) return null;
    const now = Date.now();
    for (let i = messages.length - 1; i >= Math.max(0, messages.length - 12); i -= 1) {
      const m = messages[i];
      if (!m) continue;
      const isMe = m.authorId === userId || m.authorId === "self";
      if (isMe) continue;
      if (m.isSystemMessage || typeof m.text !== "string") continue;
      const ts = Number(m.timestamp || 0);
      if (ts && now - ts > CONTEXT_WINDOW_MS) return null;
      return detectMessageIntent(m.text);
    }
    return null;
  }, [messages, userId]);

  const visibleSuggestions = useMemo(() => {
    if (!enableSuggestions || !isInputFocused) return [];

    const { pinned, dismissedSet, phrases, words } = mergedCorpus;
    const pinnedMap = new Map();
    for (const p of pinned) {
      if (!dismissedSet.has(p.normKey)) {
        pinnedMap.set(p.normKey, p);
      }
    }

    const validPhrases = phrases.filter(
      (p) => !dismissedSet.has(p.normKey) && !hasInvalidMention(p.text, validMentionHandles)
    );

    const trimmedInput = (input || "").trim().toLowerCase();

    // Empty input: show pinned first, then repeated phrases (threshold >= 2 with soft fallback)
    if (!trimmedInput) {
      const results = [];
      const usedKeys = new Set();

      for (const p of pinnedMap.values()) {
        if (hasInvalidMention(p.text, validMentionHandles)) continue;
        results.push({
          id: `pin:${p.normKey}`,
          kind: "phrase",
          displayText: p.text,
          insertText: p.text,
          normKey: p.normKey,
          isPinned: true,
          isLocal: true,
        });
        usedKeys.add(p.normKey);
        if (results.length >= MAX_SUGGESTIONS) return results;
      }

      const scored = validPhrases
        .filter((p) => !usedKeys.has(p.normKey))
        .map((p) => ({
          ...p,
          effectiveScore: p.baseScore * computeIntentMultiplier(p, lastOtherIntent),
        }))
        .sort((a, b) => {
          if (b.effectiveScore !== a.effectiveScore) return b.effectiveScore - a.effectiveScore;
          return b.lastUsedAt - a.lastUsedAt;
        });

      const repeated = scored.filter((p) => p.totalCount >= 2);
      for (const p of repeated) {
        results.push({
          id: `phrase:${p.normKey}`,
          kind: "phrase",
          displayText: p.text,
          insertText: p.text,
          normKey: p.normKey,
          isPinned: false,
          isLocal: p.isLocal,
        });
        if (results.length >= MAX_SUGGESTIONS) return results;
      }

      if (repeated.length < 3) {
        for (const p of scored) {
          if (p.totalCount >= 2) continue;
          if (getReadableSuggestionText(p.text).trim().length > 40) continue;
          results.push({
            id: `phrase:${p.normKey}`,
            kind: "phrase",
            displayText: p.text,
            insertText: p.text,
            normKey: p.normKey,
            isPinned: false,
            isLocal: p.isLocal,
          });
          if (results.length >= MAX_SUGGESTIONS) break;
        }
      }

      return results;
    }

    // Partial input: combine phrase matches + last-word autocomplete
    const normQuery = normalizePlainSegment(trimmedInput);
    const phraseCandidates = [];
    const seenPhraseKeys = new Set();

    for (const p of pinnedMap.values()) {
      if (hasInvalidMention(p.text, validMentionHandles)) continue;
      seenPhraseKeys.add(p.normKey);
      phraseCandidates.push({
        normKey: p.normKey,
        text: p.text,
        totalCount: 999,
        effectiveScore: 1e6,
        lastUsedAt: Date.now(),
        isPinned: true,
        isLocal: true,
      });
    }

    for (const p of validPhrases) {
      if (seenPhraseKeys.has(p.normKey)) continue;
      phraseCandidates.push({
        ...p,
        isPinned: false,
        effectiveScore: p.baseScore * computeIntentMultiplier(p, lastOtherIntent),
      });
    }

    const pinnedMatches = [];
    const startsWithMatches = [];
    const includesMatches = [];

    for (const c of phraseCandidates) {
      const lowerText = c.text.trim().toLowerCase();
      const readableLower = getReadableSuggestionText(c.text).trim().toLowerCase();
      const normReadable = normalizePlainSegment(readableLower);

      if (lowerText === trimmedInput) continue;

      const isStartsWith =
        lowerText.startsWith(trimmedInput) ||
        readableLower.startsWith(trimmedInput) ||
        (normQuery.length >= 2 && normReadable.startsWith(normQuery));

      const isIncludes =
        !isStartsWith &&
        (c.totalCount >= 2 || c.isPinned) &&
        (lowerText.includes(trimmedInput) ||
          readableLower.includes(trimmedInput) ||
          (normQuery.length >= 2 && normReadable.includes(normQuery)));

      if (!isStartsWith && !isIncludes) continue;

      const item = {
        id: `${c.isPinned ? "pin" : "phrase"}:${c.normKey}`,
        kind: "phrase",
        displayText: c.text,
        insertText: c.text,
        normKey: c.normKey,
        isPinned: c.isPinned,
        isLocal: Boolean(c.isLocal),
        effectiveScore: c.effectiveScore,
      };

      if (c.isPinned) pinnedMatches.push(item);
      else if (isStartsWith) startsWithMatches.push(item);
      else includesMatches.push(item);
    }

    startsWithMatches.sort((a, b) => b.effectiveScore - a.effectiveScore);
    includesMatches.sort((a, b) => b.effectiveScore - a.effectiveScore);

    const combined = [...pinnedMatches, ...startsWithMatches, ...includesMatches].slice(
      0,
      MAX_SUGGESTIONS
    );
    const usedInsertTexts = new Set(combined.map((i) => i.insertText));

    // Last-word autocomplete if multi-word input or fewer than 4 phrase matches
    const hasSpaces = /\s/.test(input);
    if ((hasSpaces || combined.length < 4) && !input.endsWith(" ")) {
      const lastWordMatch = input.match(/^([\s\S]*\s)?([^\s]+)$/);
      const prefix = lastWordMatch?.[1] || "";
      const lastToken = lastWordMatch?.[2] || "";

      if (
        lastToken.length >= 2 &&
        !lastToken.startsWith(":") &&
        !lastToken.startsWith("@") &&
        !lastToken.startsWith("/")
      ) {
        const lowerLast = lastToken.toLowerCase();
        const normLast = normalizePlainSegment(lastToken);

        const wordMatches = words
          .filter((w) => {
            if (!w.text || w.text.toLowerCase() === lowerLast) return false;
            const readableWord = getReadableSuggestionText(w.text).toLowerCase();
            if (readableWord.startsWith(`:${lowerLast}`)) return true;
            return normLast.length >= 2 && w.normWord.startsWith(normLast);
          })
          .sort((a, b) => b.baseScore - a.baseScore);

        for (const w of wordMatches) {
          if (combined.length >= MAX_SUGGESTIONS) break;
          const insertText = `${prefix}${w.text}`;
          if (usedInsertTexts.has(insertText)) continue;
          usedInsertTexts.add(insertText);
          combined.push({
            id: `word:${w.normWord}`,
            kind: "word",
            displayText: w.text,
            insertText,
            normKey: w.normWord,
            isPinned: false,
            isLocal: false,
          });
        }
      }
    }

    return combined;
  }, [enableSuggestions, isInputFocused, mergedCorpus, validMentionHandles, input, lastOtherIntent]);

  const pinSuggestion = useCallback(
    async (item) => {
      if (!item || !item.normKey) return;
      const displayText = item.displayText || item.insertText;
      setSnapshotState((prev) => {
        if (!prev.data) return prev;
        const nextPinned = [
          ...prev.data.pinned.filter((p) => p.normKey !== item.normKey),
          { normKey: item.normKey, text: displayText, pinOrder: prev.data.pinned.length },
        ];
        const nextDismissed = prev.data.dismissed.filter((k) => k !== item.normKey);
        return {
          ...prev,
          data: { ...prev.data, pinned: nextPinned, dismissed: nextDismissed },
        };
      });
      await window.electronAPI?.setQuickSuggestionPref?.({
        normKey: item.normKey,
        status: "pinned",
        displayText,
      });
    },
    []
  );

  const unpinSuggestion = useCallback(async (normKey) => {
    if (!normKey) return;
    setSnapshotState((prev) => {
      if (!prev.data) return prev;
      return {
        ...prev,
        data: {
          ...prev.data,
          pinned: prev.data.pinned.filter((p) => p.normKey !== normKey),
        },
      };
    });
    await window.electronAPI?.setQuickSuggestionPref?.({
      normKey,
      status: "clear",
    });
  }, []);

  const dismissSuggestion = useCallback(async (normKey) => {
    if (!normKey) return;
    setSnapshotState((prev) => {
      if (!prev.data) return prev;
      const nextPinned = prev.data.pinned.filter((p) => p.normKey !== normKey);
      const nextDismissed = prev.data.dismissed.includes(normKey)
        ? prev.data.dismissed
        : [...prev.data.dismissed, normKey];
      return {
        ...prev,
        data: { ...prev.data, pinned: nextPinned, dismissed: nextDismissed },
      };
    });
    await window.electronAPI?.setQuickSuggestionPref?.({
      normKey,
      status: "dismissed",
    });
  }, []);

  return {
    visibleSuggestions,
    pinSuggestion,
    unpinSuggestion,
    dismissSuggestion,
  };
}
