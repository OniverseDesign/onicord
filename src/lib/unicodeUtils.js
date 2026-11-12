/**
 * Truncates a string to a maximum number of visible graphemes/characters
 * safely without splitting surrogate pairs (e.g. emojis or Fraktur letters)
 * or separating combining diacritics.
 * Also removes unpaired/broken surrogates.
 *
 * @param {string} str - Input text
 * @param {number} maxLength - Maximum grapheme clusters allowed
 * @returns {string} Truncated string
 */
export function safeSliceUnicode(str, maxLength = 100) {
  if (!str) return "";
  const s = String(str).replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    ""
  );
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const segments = Array.from(segmenter.segment(s), (item) => item.segment);
    if (segments.length <= maxLength) return s;
    return segments.slice(0, maxLength).join("");
  }
  const codePoints = Array.from(s);
  if (codePoints.length <= maxLength) return s;
  return codePoints.slice(0, maxLength).join("");
}
