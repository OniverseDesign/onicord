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
