import emojiCatalog from "./emojiCatalog.json" with { type: "json" };

export const RECENT_EMOJIS_KEY = "onicord_recent_emojis";
export const EMOJI_CATEGORIES = emojiCatalog.categories;

const SHORTCODE_PATTERN_BODY = "[a-zA-Z0-9_+\\-\\u00C0-\\u017F]{2,32}";
export const CUSTOM_EMOJI_TOKEN_SOURCE =
  "<(a?):([a-zA-Z0-9_-]{2,32}):([a-zA-Z0-9_-]{1,64}):(webp|png|gif|jpg|jpeg)>";
const CUSTOM_EMOJI_TOKEN_EXACT_REGEX = new RegExp(
  `^${CUSTOM_EMOJI_TOKEN_SOURCE}$`,
  "i"
);
const CUSTOM_EMOJI_TOKEN_NON_CAPTURING =
  "<a?:[a-zA-Z0-9_-]{2,32}:[a-zA-Z0-9_-]{1,64}:(?:webp|png|gif|jpg|jpeg)>";

const ACTIVE_QUERY_REGEX = new RegExp(
  `(?:^|[^\\w:/\\\\<])(:(${SHORTCODE_PATTERN_BODY}))$`
);
const COMPLETED_SHORTCODE_REGEX = new RegExp(
  `(?:^|[^\\w:/\\\\<])(:(${SHORTCODE_PATTERN_BODY}):)$`
);
const TEXT_SHORTCODE_REGEX = new RegExp(`:(${SHORTCODE_PATTERN_BODY}):`, "g");
const CODE_SEGMENT_REGEX = new RegExp(
  "(\\`\\`\\`[\\s\\S]*?\\`\\`\\`|\\`[^\\`\\n]+\\`|" +
    CUSTOM_EMOJI_TOKEN_NON_CAPTURING +
    ")",
  "gi"
);

export function normalizeEmojiSearch(str) {
  return (str || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function formatCustomEmojiToken({
  shortcode,
  id,
  ext = "webp",
  animated = false,
}) {
  return `<${animated ? "a" : ""}:${shortcode}:${id}:${String(ext || "webp").toLowerCase()}>`;
}

export function parseCustomEmojiToken(value) {
  if (!value || typeof value !== "string") return null;
  const match = CUSTOM_EMOJI_TOKEN_EXACT_REGEX.exec(value.trim());
  if (!match) return null;
  return {
    animated: match[1].toLowerCase() === "a",
    shortcode: match[2],
    id: match[3],
    ext: match[4].toLowerCase(),
    token: value.trim(),
  };
}

export function isCustomEmojiToken(value) {
  return Boolean(parseCustomEmojiToken(value));
}

const seenEmojis = new Set();
export const EMOJI_LIST = [];
export const EMOJI_TO_SHORTCODE = new Map();
export const SHORTCODE_TO_EMOJI = new Map();

for (const category of EMOJI_CATEGORIES) {
  const normalizedCategory = normalizeEmojiSearch(category.name);
  for (const emoji of category.emojis) {
    if (seenEmojis.has(emoji)) continue;
    seenEmojis.add(emoji);

    const meta = emojiCatalog.entries[emoji] || {};
    const shortcode = meta.shortcode || "";
    const aliases = Array.isArray(meta.aliases) ? meta.aliases : [];
    const keywords = meta.keywords || "";

    const normalizedShortcode = normalizeEmojiSearch(shortcode);
    const normalizedAliases = aliases.map(normalizeEmojiSearch).filter(Boolean);
    const normalizedKeywords = normalizeEmojiSearch(keywords);
    const normalizedKeywordTokens = normalizedKeywords
      .split(/\s+/)
      .filter(Boolean);

    EMOJI_LIST.push({
      isCustom: false,
      emoji,
      shortcode,
      aliases,
      keywords,
      categoryId: category.id,
      categoryName: category.name,
      catalogIndex: EMOJI_LIST.length,
      normalizedShortcode,
      normalizedAliases,
      normalizedKeywords,
      normalizedKeywordTokens,
      normalizedCategory,
    });

    if (shortcode) {
      EMOJI_TO_SHORTCODE.set(emoji, shortcode);
    }
    if (normalizedShortcode && !SHORTCODE_TO_EMOJI.has(normalizedShortcode)) {
      SHORTCODE_TO_EMOJI.set(normalizedShortcode, emoji);
    }
  }
}

for (const entry of EMOJI_LIST) {
  for (const alias of entry.normalizedAliases) {
    if (!SHORTCODE_TO_EMOJI.has(alias)) {
      SHORTCODE_TO_EMOJI.set(alias, entry.emoji);
    }
  }
}

let customEmojiList = [];
let customShortcodeToEntry = new Map();
let customIdToEntry = new Map();
const customSubscribers = new Set();
let customSyncInitialized = false;
let unsubCustomSync = null;

export function setCustomEmojis(rawList = []) {
  const nextList = [];
  const nextShortcodeMap = new Map();
  const nextIdMap = new Map();
  const seenIds = new Set();

  if (Array.isArray(rawList)) {
    rawList.forEach((item) => {
      if (!item?.id) return;
      const cleanId = String(item.id).trim();
      if (!cleanId || seenIds.has(cleanId)) return;
      seenIds.add(cleanId);

      const rawCode = String(item.shortcode || item.name || cleanId).trim();
      const safeShortcode = rawCode
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 32);
      const shortcode =
        safeShortcode.length >= 2
          ? safeShortcode
          : `${safeShortcode || "em"}_emoji`.slice(0, 32);
      const ext = String(item.ext || "webp").toLowerCase();
      const animated = Boolean(item.animated || ext === "gif");
      const token = formatCustomEmojiToken({
        shortcode,
        id: cleanId,
        ext,
        animated,
      });

      const normalizedShortcode = normalizeEmojiSearch(shortcode);
      const normalizedKeywords = `${normalizedShortcode} custom`.trim();

      const entry = {
        isCustom: true,
        id: cleanId,
        emoji: token,
        token,
        shortcode,
        aliases: [],
        keywords: normalizedKeywords,
        ext,
        animated,
        localPath: item.localPath || null,
        casUri: item.casUri || null,
        packId: item.packId || null,
        categoryId: "custom",
        categoryName: "Custom",
        catalogIndex: EMOJI_LIST.length + nextList.length,
        normalizedShortcode,
        normalizedAliases: [],
        normalizedKeywords,
        normalizedKeywordTokens: [normalizedShortcode, "custom"].filter(Boolean),
        normalizedCategory: "custom",
      };

      nextList.push(entry);
      nextIdMap.set(cleanId, entry);
      if (normalizedShortcode && !nextShortcodeMap.has(normalizedShortcode)) {
        nextShortcodeMap.set(normalizedShortcode, entry);
      }
    });
  }

  customEmojiList = nextList;
  customShortcodeToEntry = nextShortcodeMap;
  customIdToEntry = nextIdMap;

  for (const listener of customSubscribers) {
    try {
      listener(customEmojiList);
    } catch (_) {}
  }
  return customEmojiList;
}

export function getCustomEmojis() {
  return customEmojiList;
}

export function getCustomEmojiById(id) {
  if (!id) return null;
  return customIdToEntry.get(String(id).trim()) || null;
}

export function subscribeCustomEmojis(listener) {
  if (typeof listener !== "function") return () => {};
  customSubscribers.add(listener);
  return () => {
    customSubscribers.delete(listener);
  };
}

export async function refreshCustomEmojis() {
  try {
    if (
      typeof window === "undefined" ||
      !window.electronAPI?.listLocalEmojis
    ) {
      return customEmojiList;
    }
    const list = await window.electronAPI.listLocalEmojis();
    return setCustomEmojis(list || []);
  } catch (err) {
    console.error("[emojiData] Failed to refresh custom emojis:", err);
    return customEmojiList;
  }
}

export function initCustomEmojisSync() {
  if (customSyncInitialized) return unsubCustomSync || (() => {});
  customSyncInitialized = true;

  refreshCustomEmojis();

  if (typeof window !== "undefined" && window.electronAPI?.onSyncComplete) {
    unsubCustomSync = window.electronAPI.onSyncComplete((data) => {
      if (
        data?.type === "emoji_imported" ||
        data?.type === "emoji_pack_imported" ||
        data?.type === "emoji_updated" ||
        data?.type === "emoji_deleted"
      ) {
        refreshCustomEmojis();
      }
    });
  }

  return unsubCustomSync || (() => {});
}

export function getEmojiShortcode(emojiOrToken) {
  const parsed = parseCustomEmojiToken(emojiOrToken);
  if (parsed) return parsed.shortcode;
  if (!emojiOrToken) return "";
  return (
    EMOJI_TO_SHORTCODE.get(emojiOrToken) ||
    EMOJI_TO_SHORTCODE.get(`${emojiOrToken}\uFE0F`) ||
    ""
  );
}

export function getRecentEmojis() {
  try {
    if (typeof localStorage === "undefined") return [];
    const saved = localStorage.getItem(RECENT_EMOJIS_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentEmoji(emoji, max = 14) {
  if (!emoji) return getRecentEmojis();
  const current = getRecentEmojis();
  const updated = [emoji, ...current.filter((e) => e !== emoji)].slice(0, max);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(updated));
    }
  } catch {
    // Ignore storage quota or access errors
  }
  return updated;
}

export function resolveEmojiShortcode(code) {
  if (!code || typeof code !== "string") return null;
  const cleaned = code.trim().replace(/^:|:$/g, "");
  const norm = normalizeEmojiSearch(cleaned);
  if (!norm) return null;
  const customMatch = customShortcodeToEntry.get(norm);
  if (customMatch) return customMatch.token;
  return SHORTCODE_TO_EMOJI.get(norm) || null;
}

export function searchEmojis(
  query,
  { recentEmojis = [], limit = Infinity, includeCustom = true } = {}
) {
  const rawTrimmed = (query || "").trim();
  const norm = normalizeEmojiSearch(rawTrimmed);
  if (!norm) return [];

  const recentRank = new Map();
  if (Array.isArray(recentEmojis)) {
    recentEmojis.forEach((emoji, idx) => {
      if (!recentRank.has(emoji)) {
        recentRank.set(emoji, idx);
      }
    });
  }

  const pool = includeCustom ? [...customEmojiList, ...EMOJI_LIST] : EMOJI_LIST;
  const matches = [];

  for (const entry of pool) {
    let tier = -1;

    if (
      entry.emoji === rawTrimmed ||
      entry.normalizedShortcode === norm ||
      entry.normalizedAliases.includes(norm)
    ) {
      tier = 0;
    } else if (
      entry.normalizedShortcode.startsWith(norm) ||
      entry.normalizedAliases.some((alias) => alias.startsWith(norm))
    ) {
      tier = 1;
    } else if (
      entry.normalizedKeywordTokens.some((token) => token.startsWith(norm))
    ) {
      tier = 2;
    } else if (
      entry.normalizedShortcode.includes(norm) ||
      entry.normalizedAliases.some((alias) => alias.includes(norm)) ||
      entry.normalizedKeywords.includes(norm) ||
      entry.normalizedCategory.includes(norm)
    ) {
      tier = 3;
    }

    if (tier !== -1) {
      matches.push({ entry, tier });
    }
  }

  matches.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const aRecent = recentRank.has(a.entry.emoji)
      ? recentRank.get(a.entry.emoji)
      : Infinity;
    const bRecent = recentRank.has(b.entry.emoji)
      ? recentRank.get(b.entry.emoji)
      : Infinity;
    if (aRecent !== bRecent) return aRecent - bRecent;
    return a.entry.catalogIndex - b.entry.catalogIndex;
  });

  const ordered = matches.map((m) => m.entry);
  return Number.isFinite(limit) ? ordered.slice(0, limit) : ordered;
}

export function isInsideBackticks(text, index) {
  if (!text || index <= 0) return false;
  const limit = Math.min(index, text.length);
  let inFenced = false;
  let inInline = false;
  let i = 0;

  while (i < limit) {
    if (inFenced) {
      if (text.startsWith("```", i)) {
        inFenced = false;
        i += 3;
        continue;
      }
      i += 1;
      continue;
    }

    if (text[i] === "\\") {
      if (i + 1 < limit) {
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    if (!inInline && text.startsWith("```", i)) {
      inFenced = true;
      i += 3;
      continue;
    }

    if (text[i] === "`") {
      inInline = !inInline;
    }
    i += 1;
  }

  return inFenced || inInline;
}

export function getActiveEmojiQuery(text, cursorPos) {
  if (!text || typeof cursorPos !== "number" || cursorPos <= 0) return null;
  const before = text.slice(0, cursorPos);
  const match = ACTIVE_QUERY_REGEX.exec(before);
  if (!match) return null;

  const startIndex = before.length - match[1].length;
  if (isInsideBackticks(text, startIndex)) return null;

  return {
    query: match[2],
    startIndex,
    endIndex: cursorPos,
  };
}

export function replaceCompletedShortcodeAtCursor(text, cursorPos) {
  if (!text || typeof cursorPos !== "number" || cursorPos <= 0) return null;
  const before = text.slice(0, cursorPos);
  const match = COMPLETED_SHORTCODE_REGEX.exec(before);
  if (!match) return null;

  const startIndex = before.length - match[1].length;
  if (isInsideBackticks(text, startIndex)) return null;

  const emoji = resolveEmojiShortcode(match[2]);
  if (!emoji) return null;

  return {
    newText: text.slice(0, startIndex) + emoji + text.slice(cursorPos),
    newCursorPos: startIndex + emoji.length,
    emoji,
    shortcode: getEmojiShortcode(emoji),
  };
}

export function replaceShortcodesInText(text) {
  if (!text || typeof text !== "string" || !text.includes(":")) return text;

  const segments = text.split(CODE_SEGMENT_REGEX);
  return segments
    .map((segment, segIdx) => {
      if (segIdx % 2 === 1) return segment;

      let out = "";
      let cursor = 0;
      let lastReplacedEnd = -1;
      let match;
      TEXT_SHORTCODE_REGEX.lastIndex = 0;

      while ((match = TEXT_SHORTCODE_REGEX.exec(segment)) !== null) {
        const matchIndex = match.index;
        const prevChar = matchIndex > 0 ? segment[matchIndex - 1] : "";
        const validBoundary =
          matchIndex === 0 ||
          matchIndex === lastReplacedEnd ||
          !/[\w:/\\<]/.test(prevChar);

        const emoji = validBoundary ? resolveEmojiShortcode(match[1]) : null;
        if (emoji) {
          out += segment.slice(cursor, matchIndex) + emoji;
          cursor = matchIndex + match[0].length;
          lastReplacedEnd = cursor;
        } else {
          out += segment.slice(cursor, matchIndex + 1);
          cursor = matchIndex + 1;
          TEXT_SHORTCODE_REGEX.lastIndex = cursor;
        }
      }

      if (cursor < segment.length) {
        out += segment.slice(cursor);
      }
      return out;
    })
    .join("");
}
