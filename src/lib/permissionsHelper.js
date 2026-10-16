export function checkPermission(server, userId, permissionKey) {
  // 1. Owner always has all permissions
  if (server?.ownerId && server.ownerId === userId) return true;

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

export function hasChannelAccess(server, channel, userId) {
  // 1. If channel is not private, everyone has access
  if (!channel?.isPrivate) return true;

  // 2. Owner has access
  if (server?.ownerId && server.ownerId === userId) return true;

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
