const CUSTOM_EMOJI_TOKEN_SOURCE =
  "<(a?):([a-zA-Z0-9_-]{2,32}):([a-zA-Z0-9_-]{1,64}):(webp|png|gif|jpg|jpeg)>";

const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_VISUAL_LENGTH = 100;
const MAX_VARIANTS_PER_GROUP = 8;

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

/**
 * Unwraps up to 2 JSON envelope layers (thread/reply/ephemeral messages).
 * Returns null for non-text payloads like stickers or raw JSON objects without text/body.
 */
function unwrapMessageText(rawText) {
  if (typeof rawText !== "string") return null;
  let text = rawText;

  for (let depth = 0; depth < 2; depth += 1) {
    const trimmed = text.trim();
    if (!trimmed.startsWith("{")) break;
    try {
      const parsed = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object") return null;
      if (parsed.type === "sticker") return null;
      if (typeof parsed.body === "string") {
        text = parsed.body;
      } else if (typeof parsed.text === "string") {
        text = parsed.text;
      } else {
        return null;
      }
    } catch {
      break;
    }
  }

  return text;
}

/**
 * Strips inline markdown delimiters while preserving custom emoji tokens.
 */
function stripMarkdownFormatting(text) {
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
 * Produces human-readable plain text (no markdown wrappers, `:shortcode:` for custom emojis).
 */
function getReadableSuggestionText(text) {
  if (!text || typeof text !== "string") return "";
  const regex = new RegExp(CUSTOM_EMOJI_TOKEN_SOURCE, "gi");
  return stripMarkdownFormatting(text).replace(
    regex,
    (_, _animated, shortcode) => `:${shortcode}:`
  );
}

/**
 * Unicode-aware segment normalization: lowercase, strip combining marks,
 * and collapse repeated consecutive letters across all scripts.
 */
function normalizePlainSegment(segment) {
  if (!segment || typeof segment !== "string") return "";
  return segment
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/(\p{L})\1+/gu, "$1");
}

/**
 * Computes a grouping key for a suggestion phrase while keeping custom emoji tokens distinct.
 */
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

/**
 * Universal check for whether a message is a question across languages.
 */
function isQuestionText(rawText) {
  const unwrapped = unwrapMessageText(rawText);
  if (!unwrapped) return false;
  return /[?¿？]/.test(unwrapped);
}

/**
 * Validates and extracts a clean eligible suggestion text from a raw stored message.
 */
function extractEligibleSuggestionText(rawText, hasAttachment = false) {
  if (hasAttachment) return null;
  const unwrapped = unwrapMessageText(rawText);
  if (typeof unwrapped !== "string") return null;

  const text = unwrapped.trim();
  if (!text) return null;
  if (text.startsWith("{") || text.startsWith("/")) return null;
  if (/^https?:\/\/\S+$/i.test(text)) return null;
  if (CONTROL_PATTERNS.some((p) => text.includes(p))) return null;

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

/**
 * Extracts individual words (>= 3 chars) and custom emoji tokens for last-word autocomplete.
 */
function extractWordsAndEmojis(text) {
  if (!text || typeof text !== "string") return [];
  const results = [];
  const tokenRegex = new RegExp(CUSTOM_EMOJI_TOKEN_SOURCE, "gi");
  let lastIndex = 0;

  const processPlain = (plain) => {
    const clean = stripMarkdownFormatting(plain);
    const parts = clean.split(/\s+/);
    for (let rawPart of parts) {
      if (!rawPart) continue;
      if (rawPart.startsWith("@") || rawPart.startsWith("/") || /^https?:\/\//i.test(rawPart)) {
        continue;
      }
      rawPart = rawPart.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (!rawPart || rawPart.length < 3) continue;
      if (/^\d+$/.test(rawPart)) continue;
      if (!/\p{L}/u.test(rawPart)) continue;

      const normWord = normalizePlainSegment(rawPart);
      if (normWord.length >= 2) {
        results.push({ normWord, word: rawPart });
      }
    }
  };

  for (const match of text.matchAll(tokenRegex)) {
    if (match.index > lastIndex) {
      processPlain(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    results.push({ normWord: token.toLowerCase(), word: token });
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    processPlain(text.slice(lastIndex));
  }

  return results;
}

function computeDecayedScore(ewmaScore, ewmaUpdatedAt, nowTs) {
  const dt = Math.max(0, Number(nowTs || 0) - Number(ewmaUpdatedAt || 0));
  if (dt === 0) return Number(ewmaScore || 0);
  return Number(ewmaScore || 0) * Math.exp((-Math.LN2 * dt) / HALF_LIFE_MS);
}

function updateEwma(oldScore, oldTs, newTs, increment = 1) {
  const prevScore = Number(oldScore || 0);
  const prevTs = Number(oldTs || 0);
  const ts = Number(newTs || Date.now());

  if (!prevTs || ts >= prevTs) {
    return {
      score: computeDecayedScore(prevScore, prevTs || ts, ts) + increment,
      updatedAt: ts,
    };
  }

  const backwardDecay = Math.exp((-Math.LN2 * (prevTs - ts)) / HALF_LIFE_MS);
  return {
    score: prevScore + increment * backwardDecay,
    updatedAt: prevTs,
  };
}

function mergeVariants(existingMap, exactText, countDelta, lastTs) {
  const map = new Map();
  if (existingMap && typeof existingMap === "object") {
    const entries = existingMap instanceof Map ? existingMap.entries() : Object.entries(existingMap);
    for (const [k, v] of entries) {
      if (v && typeof v === "object") {
        map.set(k, { c: Number(v.c || 0), t: Number(v.t || 0) });
      }
    }
  }

  if (exactText) {
    const prev = map.get(exactText) || { c: 0, t: 0 };
    map.set(exactText, {
      c: prev.c + Number(countDelta || 1),
      t: Math.max(prev.t, Number(lastTs || 0)),
    });
  }

  const sorted = Array.from(map.entries()).sort((a, b) => {
    if (b[1].c !== a[1].c) return b[1].c - a[1].c;
    return b[1].t - a[1].t;
  });

  const trimmed = sorted.slice(0, MAX_VARIANTS_PER_GROUP);
  const variantsObj = {};
  for (const [k, v] of trimmed) {
    variantsObj[k] = v;
  }

  const best = trimmed[0];
  return {
    variants: variantsObj,
    bestText: best ? best[0] : exactText || "",
    bestVariantCount: best ? best[1].c : 1,
  };
}

module.exports = {
  CUSTOM_EMOJI_TOKEN_SOURCE,
  HALF_LIFE_MS,
  MAX_VISUAL_LENGTH,
  MAX_VARIANTS_PER_GROUP,
  unwrapMessageText,
  stripMarkdownFormatting,
  getReadableSuggestionText,
  normalizePlainSegment,
  normalizeSuggestionKey,
  isQuestionText,
  extractEligibleSuggestionText,
  extractWordsAndEmojis,
  computeDecayedScore,
  updateEwma,
  mergeVariants,
};
