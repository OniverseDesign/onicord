export const WEB_INVITE_BASE_URL = "https://oniversedesign.github.io/onicord";

/**
 * Generates a universal HTTPS invite link (clickable in web browsers and chats).
 * @param {string} roomCode - 8-character room identifier code.
 * @param {string} [serverName] - Optional server display name for preview.
 * @param {string} [inviterName] - Optional inviting user display name.
 * @returns {string} Complete HTTPS URL.
 */
export function getWebInviteUrl(roomCode) {
  if (!roomCode) return "";
  const params = new URLSearchParams();
  params.set("code", roomCode.toUpperCase());
  return `${WEB_INVITE_BASE_URL}/?${params.toString()}`;
}

/**
 * Generates a universal HTTPS direct TCP connection link.
 * @param {string} ip - IP address or hostname.
 * @param {number|string} port - TCP port number.
 * @param {string} roomCode - Room identifier code.
 * @returns {string} Complete HTTPS URL.
 */
export function getWebDirectInviteUrl(ip, port, roomCode) {
  if (!ip || !port || !roomCode) return "";
  const params = new URLSearchParams();
  params.set("ip", String(ip).trim());
  params.set("port", String(port));
  params.set("code", roomCode.toUpperCase());
  return `${WEB_INVITE_BASE_URL}/?${params.toString()}`;
}

/**
 * Genera el protocolo nativo deep link onicord://
 * @param {string} roomCode
 * @returns {string}
 */
export function getNativeDeepLink(roomCode) {
  if (!roomCode) return "";
  return `onicord://join/${roomCode.toUpperCase()}`;
}

/**
 * Genera el protocolo nativo deep link directo onicord://
 * @param {string} ip
 * @param {number|string} port
 * @param {string} roomCode
 * @returns {string}
 */
export function getNativeDirectDeepLink(ip, port, roomCode) {
  if (!ip || !port || !roomCode) return "";
  return `onicord://direct:${String(ip).trim()}:${port}/${roomCode.toUpperCase()}`;
}

/**
 * Parses any URL or raw string to verify whether it matches a valid Onicord invite link.
 * Supports:
 * - onicord://join/<CODE>
 * - onicord://direct:<IP>:<PORT>/<CODE>
 * - https://oniversedesign.github.io/onicord/?code=<CODE> (and with optional ip/port)
 * - https://*.github.io/onicord/?code=<CODE>
 * - https://[subdomain.]onicord.(app|io|com)/join/<CODE>
 *
 * @param {string} urlStr - The URL or string to parse
 * @returns {{ roomCode: string, ip?: string|null, port?: string|null, fullUrl: string } | null}
 */
export function parseInviteUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return null;
  const cleanStr = urlStr.trim();

  // 1. Native deep links directos: onicord://direct:IP:PORT/ROOMCODE
  const directNativeMatch = cleanStr.match(/^onicord:\/\/direct:([^:/]+):(\d+)\/([a-zA-Z0-9]+)$/i);
  if (directNativeMatch) {
    return {
      roomCode: directNativeMatch[3].toUpperCase(),
      ip: directNativeMatch[1],
      port: directNativeMatch[2],
      fullUrl: cleanStr,
    };
  }

  // 2. Native deep links normales: onicord://join/ROOMCODE
  const joinNativeMatch = cleanStr.match(/^onicord:\/\/join\/([a-zA-Z0-9]+)$/i);
  if (joinNativeMatch) {
    return {
      roomCode: joinNativeMatch[1].toUpperCase(),
      ip: null,
      port: null,
      fullUrl: cleanStr,
    };
  }

  // 3. Web URLs legacy: https://*.onicord.(app|io|com)/join/ROOMCODE
  const legacyMatch = cleanStr.match(/^https?:\/\/(?:[a-zA-Z0-9-]+\.)?onicord\.(?:app|io|com)\/join\/([a-zA-Z0-9]+)/i);
  if (legacyMatch) {
    return {
      roomCode: legacyMatch[1].toUpperCase(),
      ip: null,
      port: null,
      fullUrl: cleanStr,
    };
  }

  // 4. Web URLs (GitHub Pages landing o dominio Onicord con query params)
  try {
    const parsed = new URL(cleanStr);
    const host = parsed.hostname.toLowerCase();
    const isGithubLanding = host.endsWith("github.io") && parsed.pathname.toLowerCase().includes("onicord");
    const isCustomDomain = host.includes("onicord");

    if (isGithubLanding || isCustomDomain) {
      const code = parsed.searchParams.get("code") || parsed.searchParams.get("c") || parsed.hash.replace("#", "").trim();
      if (code && /^[a-zA-Z0-9]+$/.test(code)) {
        return {
          roomCode: code.toUpperCase(),
          ip: parsed.searchParams.get("ip") || null,
          port: parsed.searchParams.get("port") || null,
          fullUrl: cleanStr,
        };
      }
    }
  } catch {}

  return null;
}

/**
 * Quickly tests whether a given URL is a valid Onicord invite link.
 *
 * @param {string} urlStr - The URL or string to test
 * @returns {boolean} True if the URL matches an invite pattern
 */
export function isInviteUrl(urlStr) {
  return Boolean(parseInviteUrl(urlStr));
}
