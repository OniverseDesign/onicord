export const WEB_INVITE_BASE_URL = "https://oniversedesign.github.io/onicord";

/**
 * Genera el enlace de invitación universal HTTPS (clickeable en chats y navegadores)
 * @param {string} roomCode - Código de 8 caracteres de la sala
 * @param {string} [serverName] - Nombre del servidor para mostrar en la web
 * @param {string} [inviterName] - Nombre del usuario que invita
 * @returns {string} URL HTTPS completa
 */
export function getWebInviteUrl(roomCode, serverName = "", inviterName = "") {
  if (!roomCode) return "";
  const params = new URLSearchParams();
  params.set("code", roomCode.toUpperCase());
  if (serverName && serverName !== `Servidor ${roomCode}`) {
    params.set("name", serverName);
  }
  if (inviterName) {
    params.set("by", inviterName);
  }
  return `${WEB_INVITE_BASE_URL}/?${params.toString()}`;
}

/**
 * Genera el enlace de conexión directa TCP universal HTTPS
 * @param {string} ip - Dirección IP o Hostname
 * @param {number|string} port - Puerto TCP
 * @param {string} roomCode - Código de la sala
 * @param {string} [serverName] - Nombre del servidor
 * @returns {string} URL HTTPS completa
 */
export function getWebDirectInviteUrl(ip, port, roomCode, serverName = "") {
  if (!ip || !port || !roomCode) return "";
  const params = new URLSearchParams();
  params.set("ip", String(ip).trim());
  params.set("port", String(port));
  params.set("code", roomCode.toUpperCase());
  if (serverName && serverName !== `Servidor ${roomCode}`) {
    params.set("name", serverName);
  }
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
