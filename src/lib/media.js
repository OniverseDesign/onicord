/**
 * Centralized utility to format and generate safe local media URLs using the onicord-media:// protocol.
 * Correctly handles Windows drive letters to prevent Chromium URL parsing issues (via win-disk/).
 * Escapes special characters such as spaces or accent marks cleanly.
 *
 * @param {string} localPath - Absolute or relative local file path.
 * @returns {string} Safe onicord-media:// URL.
 */
export function getMediaUrl(localPath) {
  if (!localPath || typeof localPath !== "string") return "";

  // Strip existing protocol/host prefix if already formatted
  let cleanPath = localPath.trim();
  if (cleanPath.startsWith("onicord-media://")) {
    cleanPath = cleanPath.slice("onicord-media://".length);
  }
  if (cleanPath.startsWith("win-disk/")) {
    cleanPath = cleanPath.slice("win-disk/".length);
  }

  // Normalize backslashes to forward slashes
  cleanPath = cleanPath.replace(/\\/g, "/");

  // Prepend win-disk/ on Windows drive letters so Chromium does not break unit letters (e.g. D:)
  if (/^[a-zA-Z]:/.test(cleanPath)) {
    return `onicord-media://win-disk/${encodeURI(cleanPath)}`;
  }

  return `onicord-media://${encodeURI(cleanPath)}`;
}
