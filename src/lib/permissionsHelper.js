/**
 * Evaluates whether a user holds a specific permission on a server.
 * Evaluation follows hierarchical precedence:
 * 1. Owner & Creator: Grant all permissions unconditionally.
 * 2. Unconfigured Roles: Grants standard permissions (denies "admin" & "view_advanced_settings").
 * 3. Administrator Role: If user holds any role with { permissions: { admin: true } }, grants all permissions.
 * 4. Additive Role Permissions: Checks if any assigned role explicitly enables the requested permissionKey.
 *
 * @param {Object} server - Server metadata object with roles and userRoles
 * @param {string} userId - User profile ID to verify
 * @param {string} permissionKey - Permission flag key (e.g. "admin", "manage_channels", "send_messages")
 * @returns {boolean} True if the user is authorized for the permissionKey
 */
export function checkPermission(server, userId, permissionKey) {
  // 1. Owner and Creator always have all permissions
  if (server?.ownerId && server.ownerId === userId) return true;
  if ((server?.creatorID && server.creatorID === userId) || (server?.creatorId && server.creatorId === userId)) return true;

  // 2. If no server roles or userRoles mapping, default permissions
  if (!server?.roles || !server?.userRoles) {
    return permissionKey !== "admin" && permissionKey !== "view_advanced_settings"; 
  }

  // 3. Find user roles
  const uRoles = server.userRoles[userId];
  if (!uRoles) {
    // If user has no roles, check default permissions
    return permissionKey !== "admin" && permissionKey !== "view_advanced_settings";
  }

  const roleIds = Array.isArray(uRoles) ? uRoles : [uRoles];

  // 4. Admin role grants all permissions
  if (permissionKey !== "admin") {
    const hasAdmin = roleIds.some((rId) => {
      const r = server.roles.find((role) => role.id === rId);
      return r?.permissions?.admin === true;
    });
    if (hasAdmin) return true;
  }

  // 5. Sum permissions of all user roles
  for (const rId of roleIds) {
    const role = server.roles.find((r) => r.id === rId);
    if (role) {
      if (role.permissions && role.permissions[permissionKey] !== undefined) {
        if (role.permissions[permissionKey] === true) {
          return true;
        }
      } else {
        // Fallback for roles that don't have permissions defined yet
        if (permissionKey !== "admin" && permissionKey !== "view_advanced_settings") {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Checks if a user has access to view and read a given channel.
 * - Public channels are accessible to all members.
 * - Private channels are strictly restricted to Server Owner, Creator, Admins,
 *   or members holding at least one role listed in `channel.allowedRoles`.
 *
 * @param {Object} server - Server metadata object
 * @param {Object} channel - Channel object with isPrivate and allowedRoles
 * @param {string} userId - User profile ID
 * @returns {boolean} True if the channel is visible/accessible to the user
 */
export function hasChannelAccess(server, channel, userId) {
  // 1. If channel is not private, everyone has access
  if (!channel?.isPrivate) return true;

  // 2. Owner or Creator has access
  if (server?.ownerId && server.ownerId === userId) return true;
  if ((server?.creatorID && server.creatorID === userId) || (server?.creatorId && server.creatorId === userId)) return true;

  // 3. Admin permission has access (Total Control)
  if (checkPermission(server, userId, "admin")) return true;

  // 4. Check if the user has any of the allowed roles
  if (!channel.allowedRoles || channel.allowedRoles.length === 0) {
    // If private but allowedRoles is empty, only owner and admins can see it
    return false;
  }

  const uRoles = server?.userRoles?.[userId];
  if (!uRoles) return false;

  const roleIds = Array.isArray(uRoles) ? uRoles : [uRoles];
  return roleIds.some((rId) => channel.allowedRoles.includes(rId));
}

/**
 * Evaluates whether a user is permitted to speak/broadcast audio in a voice channel.
 *
 * @param {Object} server - Server metadata object
 * @param {Object} channel - Voice channel object with hasSpeakRestrictions and disallowedSpeakRoles
 * @param {string} userId - User profile ID
 * @returns {boolean} True if the user is allowed to speak
 */
export function canSpeakInChannel(server, channel, userId) {
  // 1. Channel not defined or no speak restrictions -> everyone can speak by default
  if (!channel || !channel.hasSpeakRestrictions) return true;

  const disallowed = Array.isArray(channel.disallowedSpeakRoles)
    ? channel.disallowedSpeakRoles
    : [];
  if (disallowed.length === 0) return true;

  // 2. Owner or Creator has bypass
  if (server?.ownerId && server.ownerId === userId) return true;
  if ((server?.creatorID && server.creatorID === userId) || (server?.creatorId && server.creatorId === userId)) return true;

  // 3. Admin permission has bypass
  if (checkPermission(server, userId, "admin")) return true;

  // 4. Retrieve user roles
  const uRoles = server?.userRoles?.[userId];
  const roleIds = uRoles ? (Array.isArray(uRoles) ? uRoles : [uRoles]) : [];

  // If user has no custom roles, check if "@everyone" is restricted
  if (roleIds.length === 0) {
    return !disallowed.includes("@everyone");
  }

  // If user has roles, check if all of them are disallowed
  const allDisallowed = roleIds.every((rId) => disallowed.includes(rId));
  return !allDisallowed;
}

