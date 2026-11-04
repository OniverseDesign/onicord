/**
 * Utilities for Welcome Messages & Multilingual Support
 */

export const KNOWN_DEFAULT_WELCOME_TEMPLATES = [
  "",
  "¡Bienvenido {user} a {server}! 🎉",
  "Welcome {user} to {server}! 🎉",
  "Boas-vindas {user} ao {server}! 🎉",
  "¡Bienvenido {user} a {server}!",
  "Welcome {user} to {server}!",
  "Boas-vindas {user} ao {server}!",
  "¡bienvenido {user} a {server}! 🎉",
  "welcome {user} to {server}! 🎉",
  "boas-vindas {user} ao {server}! 🎉",
];

export const DEFAULT_WELCOME_PATTERNS = [
  // Spanish
  /^¡?Bienvenido\s+(.+?)\s+a\s+(.+?)!?(?:\s*🎉)?$/i,
  // English
  /^Welcome\s+(.+?)\s+to\s+(.+?)!?(?:\s*🎉)?$/i,
  // Portuguese
  /^Boas-vindas\s+(.+?)\s+ao\s+(.+?)!?(?:\s*🎉)?$/i,
];

/**
 * Checks if a given template string represents the default welcome template
 * @param {string|null|undefined} template 
 * @returns {boolean}
 */
export function isDefaultWelcomeTemplate(template) {
  if (!template || typeof template !== "string") return true;
  const trimmed = template.trim();
  if (!trimmed) return true;
  return KNOWN_DEFAULT_WELCOME_TEMPLATES.some(
    (dt) => dt.toLowerCase() === trimmed.toLowerCase()
  );
}

/**
 * Formats a template string replacing {user} and {server}
 * @param {string} template 
 * @param {string} userNick 
 * @param {string} serverName 
 * @returns {string}
 */
export function formatWelcomeMessage(template, userNick, serverName) {
  return String(template || "")
    .replace(/\{user\}/g, userNick || "")
    .replace(/\{server\}/g, serverName || "");
}

/**
 * Resolves the welcome message text. If the message is the default welcome message,
 * it returns the message translated dynamically to the viewer's language.
 * If the message is custom, it preserves the custom text.
 * 
 * @param {string} rawText
 * @param {Object} welcomeData
 * @param {Object} server
 * @param {Function} t - i18next translation function
 * @returns {{ text: string, isDefault: boolean, userNick: string, serverName: string }}
 */
export function resolveWelcomeMessageText(rawText, welcomeData = {}, server = null, t = (k, def) => def) {
  const isExplicitDefault = welcomeData?.isDefaultTemplate === true;
  let matchedNick = welcomeData?.nickname || "";
  let matchedServer = welcomeData?.serverName || server?.name || "";

  let isPatternDefault = false;
  if (!isExplicitDefault && typeof rawText === "string") {
    const trimmed = rawText.trim();
    for (const rx of DEFAULT_WELCOME_PATTERNS) {
      const match = rx.exec(trimmed);
      if (match) {
        isPatternDefault = true;
        if (!matchedNick) matchedNick = match[1]?.trim();
        if (!matchedServer) matchedServer = match[2]?.trim();
        break;
      }
    }
  }

  if (isExplicitDefault || isPatternDefault) {
    const userNick = matchedNick || welcomeData?.nickname || t("chat.newMember", "Nuevo Miembro");
    const serverName = matchedServer || welcomeData?.serverName || server?.name || "Servidor";
    const localizedTemplate = t(
      "chat.defaultWelcomeMessage",
      t("serverSettings.overview.defaultWelcomeTemplate", "¡Bienvenido {user} a {server}! 🎉")
    );
    return {
      text: formatWelcomeMessage(localizedTemplate, userNick, serverName),
      isDefault: true,
      userNick,
      serverName,
    };
  }

  return {
    text: rawText || "",
    isDefault: false,
    userNick: matchedNick,
    serverName: matchedServer,
  };
}
