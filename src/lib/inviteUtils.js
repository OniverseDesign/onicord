export const WEB_INVITE_BASE_URL = "https://oniversedesign.github.io/onicord";

const SECRET_RE = /^[A-Za-z0-9_-]{32,64}$/;
const MANAGED_SECRET_RE = /^I:([A-Za-z0-9_-]{32,64})$/;

export function formatManagedInviteToken(roomCode, inviteSecret = null) {
  if (!roomCode) return "";
  const code = String(roomCode).trim().toUpperCase();
  const cleanSecret = typeof inviteSecret === "string" ? inviteSecret.trim() : "";
  return cleanSecret && SECRET_RE.test(cleanSecret) ? `${code}#I:${cleanSecret}` : code;
}

export function formatInviteToken(roomCode, secret = null, { isManagedInvite = false } = {}) {
  if (!roomCode) return "";
  const code = String(roomCode).trim().toUpperCase();
  const cleanSecret = typeof secret === "string" ? secret.trim() : "";
  if (cleanSecret && MANAGED_SECRET_RE.test(cleanSecret)) {
    return `${code}#${cleanSecret}`;
  }
  if (cleanSecret && SECRET_RE.test(cleanSecret)) {
    return isManagedInvite ? `${code}#I:${cleanSecret}` : `${code}#${cleanSecret}`;
  }
  return code;
}

/**
 * Generates a universal HTTPS invite link (clickable in web browsers and chats).
 * Optional secret/inviteSecret is attached in the URL fragment (#SECRET or #I:SECRET) so it is never sent to the static server.
 */
export function getWebInviteUrl(roomCode, _serverName = null, secret = null, options = {}) {
  if (!roomCode) return "";
  const params = new URLSearchParams();
  params.set("code", roomCode.toUpperCase());
  const cleanSecret = typeof secret === "string" ? secret.trim() : "";
  let hash = "";
  if (cleanSecret && MANAGED_SECRET_RE.test(cleanSecret)) {
    hash = `#${cleanSecret}`;
  } else if (cleanSecret && SECRET_RE.test(cleanSecret)) {
    hash = options?.isManagedInvite ? `#I:${cleanSecret}` : `#${cleanSecret}`;
  }
  return `${WEB_INVITE_BASE_URL}/?${params.toString()}${hash}`;
}

/**
 * Generates a universal HTTPS direct TCP connection link.
 */
export function getWebDirectInviteUrl(ip, port, roomCode, secret = null, options = {}) {
  if (!ip || !port || !roomCode) return "";
  const params = new URLSearchParams();
  params.set("ip", String(ip).trim());
  params.set("port", String(port));
  params.set("code", roomCode.toUpperCase());
  const cleanSecret = typeof secret === "string" ? secret.trim() : "";
  let hash = "";
  if (cleanSecret && MANAGED_SECRET_RE.test(cleanSecret)) {
    hash = `#${cleanSecret}`;
  } else if (cleanSecret && SECRET_RE.test(cleanSecret)) {
    hash = options?.isManagedInvite ? `#I:${cleanSecret}` : `#${cleanSecret}`;
  }
  return `${WEB_INVITE_BASE_URL}/?${params.toString()}${hash}`;
}

/**
 * Genera el protocolo nativo deep link onicord://
 */
export function getNativeDeepLink(roomCode, secret = null, options = {}) {
  if (!roomCode) return "";
  return `onicord://join/${formatInviteToken(roomCode, secret, options)}`;
}

/**
 * Genera el protocolo nativo deep link directo onicord://
 */
export function getNativeDirectDeepLink(ip, port, roomCode, secret = null, options = {}) {
  if (!ip || !port || !roomCode) return "";
  return `onicord://direct:${String(ip).trim()}:${port}/${formatInviteToken(roomCode, secret, options)}`;
}

function parseFragmentSecret(rawFragment) {
  const frag = typeof rawFragment === "string" ? rawFragment.trim() : "";
  if (!frag) return { roomSecret: null, inviteSecret: null, isManagedInvite: false };
  const managedMatch = frag.match(MANAGED_SECRET_RE);
  if (managedMatch) {
    return { roomSecret: null, inviteSecret: managedMatch[1], isManagedInvite: true };
  }
  if (SECRET_RE.test(frag)) {
    return { roomSecret: frag, inviteSecret: null, isManagedInvite: false };
  }
  return { roomSecret: null, inviteSecret: null, isManagedInvite: false };
}

/**
 * Parses any URL or raw string to verify whether it matches a valid Onicord invite link.
 * Supports managed expiring invites (`#I:SECRET`), v2 `#SECRET` fragments, and legacy v1 `<CODE>` links.
 */
export function parseInviteUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return null;
  const cleanStr = urlStr.trim();

  // 0. Raw CODE#I:SECRET or CODE#SECRET shorthand
  const rawTokenMatch = cleanStr.match(/^([A-F0-9]{8})#((?:I:)?[A-Za-z0-9_-]{32,64})$/i);
  if (rawTokenMatch) {
    const parsedFrag = parseFragmentSecret(rawTokenMatch[2]);
    return {
      roomCode: rawTokenMatch[1].toUpperCase(),
      ...parsedFrag,
      ip: null,
      port: null,
      fullUrl: cleanStr,
    };
  }

  // 1. Native deep links directos: onicord://direct:IP:PORT/ROOMCODE(#(I:)?SECRET)?
  const directNativeMatch = cleanStr.match(/^onicord:\/\/direct:([^:/]+):(\d+)\/([a-zA-Z0-9]+)(?:#((?:I:)?[A-Za-z0-9_-]{32,64}))?$/i);
  if (directNativeMatch) {
    const parsedFrag = parseFragmentSecret(directNativeMatch[4]);
    return {
      roomCode: directNativeMatch[3].toUpperCase(),
      ...parsedFrag,
      ip: directNativeMatch[1],
      port: directNativeMatch[2],
      fullUrl: cleanStr,
    };
  }

  // 2. Native deep links normales: onicord://join/ROOMCODE(#(I:)?SECRET)?
  const joinNativeMatch = cleanStr.match(/^onicord:\/\/join\/([a-zA-Z0-9]+)(?:#((?:I:)?[A-Za-z0-9_-]{32,64}))?$/i);
  if (joinNativeMatch) {
    const parsedFrag = parseFragmentSecret(joinNativeMatch[2]);
    return {
      roomCode: joinNativeMatch[1].toUpperCase(),
      ...parsedFrag,
      ip: null,
      port: null,
      fullUrl: cleanStr,
    };
  }

  // 3. Web URLs legacy: https://*.onicord.(app|io|com)/join/ROOMCODE(#(I:)?SECRET)?
  const legacyMatch = cleanStr.match(/^https?:\/\/(?:[a-zA-Z0-9-]+\.)?onicord\.(?:app|io|com)\/join\/([a-zA-Z0-9]+)(?:#((?:I:)?[A-Za-z0-9_-]{32,64}))?/i);
  if (legacyMatch) {
    const parsedFrag = parseFragmentSecret(legacyMatch[2]);
    return {
      roomCode: legacyMatch[1].toUpperCase(),
      ...parsedFrag,
      ip: null,
      port: null,
      fullUrl: cleanStr,
    };
  }

  // 4. Web URLs (GitHub Pages landing o dominio Onicord con query params + optional #SECRET / #I:SECRET fragment)
  try {
    const parsed = new URL(cleanStr);
    const host = parsed.hostname.toLowerCase();
    const isGithubLanding = host.endsWith("github.io") && parsed.pathname.toLowerCase().includes("onicord");
    const isCustomDomain = host.includes("onicord");

    if (isGithubLanding || isCustomDomain) {
      const queryCode = parsed.searchParams.get("code") || parsed.searchParams.get("c");
      const rawHash = parsed.hash ? parsed.hash.replace(/^#/, "").trim() : "";

      if (queryCode && /^[a-zA-Z0-9]+$/.test(queryCode)) {
        const parsedFrag = parseFragmentSecret(rawHash);
        return {
          roomCode: queryCode.toUpperCase(),
          ...parsedFrag,
          ip: parsed.searchParams.get("ip") || null,
          port: parsed.searchParams.get("port") || null,
          fullUrl: cleanStr,
        };
      }

      if (rawHash && /^[a-zA-Z0-9]+$/.test(rawHash)) {
        return {
          roomCode: rawHash.toUpperCase(),
          roomSecret: null,
          inviteSecret: null,
          isManagedInvite: false,
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
