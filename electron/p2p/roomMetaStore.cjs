const fs = require("fs/promises");
const path = require("path");
const { DEFAULT_CHANNELS } = require("./serverStore.cjs");

class RoomMetaStore {
  constructor(userDataPath) {
    this.dir = path.join(userDataPath, "room-meta");
    this._cache = new Map();
  }

  _path(roomCode) {
    const safe = String(roomCode)
      .trim()
      .toUpperCase()
      .replace(/[^A-F0-9]/g, "");
    return path.join(this.dir, `${safe}.json`);
  }

  async load(roomCode, forceReload = false) {
    const safeCode = String(roomCode).trim().toUpperCase().replace(/[^A-F0-9]/g, "");
    if (!forceReload && this._cache.has(safeCode)) {
      return this._cache.get(safeCode);
    }

    try {
      const filePath = this._path(roomCode);
      const raw = await fs.readFile(filePath, "utf8");
      let meta = null;
      try {
        meta = JSON.parse(raw);
      } catch {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          let candidate = match[0];
          while (candidate.length > 0) {
            try {
              meta = JSON.parse(candidate);
              await fs.writeFile(filePath, JSON.stringify(meta, null, 2), "utf8");
              console.log(`[RoomMetaStore] Auto-repaired corrupted room meta JSON: ${filePath}`);
              break;
            } catch {
              const lastBrace = candidate.lastIndexOf("}");
              if (lastBrace <= 0) break;
              candidate = candidate.slice(0, lastBrace);
            }
          }
        }
      }
      if (!meta) meta = JSON.parse(raw);
      if (meta) this._cache.set(safeCode, meta);
      return meta;
    } catch {
      const defaultMeta = {
        roomCode: safeCode,
        version: 0,
        updatedAt: 0,
        updatedBy: null,
        name: null,
        icon: null,
        banner: null,
        channels: DEFAULT_CHANNELS.map((c) => ({ ...c })),
        roles: [],
        userRoles: {},
        plugins: [],
        music: null,
        disableFlameSystem: false,
        groupByRoles: false,
        allowExecutableFiles: false,
        iceServers: [],
        directConnectionEnabled: false,
        directIP: "",
        directPort: 7777,
        ownerId: null,
        savedMembers: {},
        bannedUsers: [],
        kickedUsers: {},
        auditLog: [],
      };
      this._cache.set(safeCode, defaultMeta);
      return defaultMeta;
    }
  }

  async save(roomCode, meta) {
    const safeCode = String(roomCode).trim().toUpperCase().replace(/[^A-F0-9]/g, "");
    const filePath = this._path(roomCode);
    const dataString = JSON.stringify(meta, null, 2);
    const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(tmpPath, dataString, "utf8");
    try {
      await fs.rename(tmpPath, filePath);
    } catch (e) {
      await fs.copyFile(tmpPath, filePath);
      await fs.unlink(tmpPath).catch(() => {});
    }
    this._cache.set(safeCode, meta);
    return meta;
  }

  merge(roomCode, remote, senderUserId) {
    if (!remote?.version) return Promise.resolve({ applied: false, meta: null });
    return this.load(roomCode).then(async (local) => {
      // Uninitialized check: local has no owner OR local version is 0 (new joining peer) OR default empty meta
      const isLocalUninitialized = !local.ownerId || local.version === 0 || (!local.name && !local.icon);
      let isAuthorized = false;

      if (isLocalUninitialized) {
        // Any peer joining a server must accept initial valid server metadata if remote has an ownerId and version
        isAuthorized = Boolean(remote.ownerId || remote.version);
      } else if (local.ownerId && remote.ownerId && local.ownerId === remote.ownerId) {
        // Incoming metadata matches our local server owner ID (authentic server update)
        isAuthorized = true;
      } else if (remote.ownerId && senderUserId && remote.ownerId === senderUserId) {
        // The sender IS the owner of the incoming metadata (authentic server owner update)
        isAuthorized = true;
      } else if (!senderUserId) {
        // Fallback if sender identity is unknown
        isAuthorized = true;
      } else if (local.ownerId === senderUserId || checkAdminPermission(local, senderUserId)) {
        isAuthorized = true;
      } else if (
        senderUserId &&
        local.savedMembers &&
        local.savedMembers[senderUserId] &&
        remote.version > local.version
      ) {
        // Known member is relaying metadata with a strictly higher version.
        // This happens when a peer cached metadata from the real owner and
        // forwards it during periodic sync. Safe to accept.
        isAuthorized = true;
      }

      if (!isAuthorized) {
        // Downgraded from warn to log: most rejections are stale metadata from
        // periodic sync (every 15s), not security incidents.
        console.log(
          `[RoomMeta] Metadata update skipped for room ${roomCode}: Sender=${senderUserId}, RemoteOwner=${remote.ownerId}, LocalOwner=${local.ownerId}, RemoteV=${remote.version}, LocalV=${local.version}`,
        );
        return { applied: false, meta: local };
      }

      // Conflict Resolution Algorithm: Role-Based Authority & Timestamps
      const remoteAuth = getAuthorityLevel(local, remote.updatedBy || senderUserId || remote.ownerId);
      const localAuth = getAuthorityLevel(local, local.updatedBy || local.ownerId);

      let newer = false;
      if (isLocalUninitialized) {
        newer = true;
      } else if (remote.version > local.version) {
        // Strictly newer version from an authorized peer is always accepted
        newer = true;
      } else if (remote.version < local.version) {
        // Strictly older version is rejected
        newer = false;
      } else if (remoteAuth > localAuth) {
        // Same version, but remote has higher authority (e.g. Owner overriding Member)
        newer = true;
      } else if (remoteAuth < localAuth) {
        // Same version, but local has higher authority
        newer = false;
      } else {
        // Same version and same authority: compare timestamps
        newer = (remote.updatedAt || 0) > (local.updatedAt || 0);
      }

      if (!newer) return { applied: false, meta: local };

      // Merge Audit Logs
      const localLog = Array.isArray(local.auditLog) ? local.auditLog : [];
      const remoteLog = Array.isArray(remote.auditLog) ? remote.auditLog : [];

      const logMap = new Map();
      for (const entry of [...localLog, ...remoteLog]) {
        if (entry && entry.id) {
          logMap.set(entry.id, entry);
        }
      }
      const mergedAuditLog = Array.from(logMap.values())
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 100);

      // Merge saved members gracefully preserving timestamps
      const mergedSavedMembers = { ...(local.savedMembers || {}) };
      if (remote.savedMembers && typeof remote.savedMembers === "object") {
        for (const [mId, mData] of Object.entries(remote.savedMembers)) {
          if (!mData) continue;
          const existing = mergedSavedMembers[mId];
          if (!existing || (mData.updatedAt || 0) >= (existing.updatedAt || 0)) {
            mergedSavedMembers[mId] = mData;
          }
        }
      }

      const merged = {
        roomCode: local.roomCode,
        version: remote.version,
        updatedAt: remote.updatedAt || Date.now(),
        updatedBy: remote.updatedBy || senderUserId || remote.ownerId || null,
        name: remote.name ?? local.name,
        icon: remote.icon !== undefined ? remote.icon : local.icon,
        banner: remote.banner !== undefined ? remote.banner : (local.banner ?? null),
        channels:
          Array.isArray(remote.channels) && remote.channels.length > 0
            ? remote.channels
            : local.channels,
        roles: remote.roles ?? local.roles ?? [],
        userRoles: remote.userRoles ?? local.userRoles ?? {},
        plugins: remote.plugins ?? local.plugins ?? [],
        music: remote.music !== undefined ? remote.music : local.music,
        disableFlameSystem:
          remote.disableFlameSystem !== undefined
            ? remote.disableFlameSystem
            : (local.disableFlameSystem ?? false),
        groupByRoles:
          remote.groupByRoles !== undefined
            ? remote.groupByRoles
            : (local.groupByRoles ?? false),
        allowExecutableFiles:
          remote.allowExecutableFiles !== undefined
            ? remote.allowExecutableFiles
            : (local.allowExecutableFiles ?? false),
        iceServers: remote.iceServers ?? local.iceServers ?? [],
        directConnectionEnabled:
          remote.directConnectionEnabled !== undefined
            ? remote.directConnectionEnabled
            : (local.directConnectionEnabled ?? false),
        directIP: remote.directIP ?? local.directIP ?? "",
        directPort: remote.directPort ?? local.directPort ?? 7777,
        ownerId: remote.ownerId ?? local.ownerId ?? null,
        savedMembers: mergedSavedMembers,
        bannedUsers: remote.bannedUsers ?? local.bannedUsers ?? [],
        kickedUsers: remote.kickedUsers ?? local.kickedUsers ?? {},
        auditLog: mergedAuditLog,
      };
      await this.save(roomCode, merged);
      return { applied: true, meta: merged };
    });
  }

  async bump(roomCode, patch, updatedByUserId) {
    const local = await this.load(roomCode);
    const next = {
      ...local,
      ...patch,
      version: local.version + 1,
      updatedAt: Date.now(),
      updatedBy: updatedByUserId || null,
    };
    await this.save(roomCode, next);
    return next;
  }

  async updateSavedMembers(roomCode, savedMembers) {
    const local = await this.load(roomCode);
    const mergedSavedMembers = { ...(local.savedMembers || {}) };
    if (savedMembers && typeof savedMembers === "object") {
      for (const [mId, mData] of Object.entries(savedMembers)) {
        if (!mData) continue;
        const existing = mergedSavedMembers[mId];
        if (!existing || (mData.updatedAt || 0) >= (existing.updatedAt || 0)) {
          mergedSavedMembers[mId] = mData;
        }
      }
    }
    local.savedMembers = mergedSavedMembers;
    await this.save(roomCode, local);
    return local;
  }
}

function checkAdminPermission(meta, userId) {
  if (!userId) return false;
  if (meta.ownerId && meta.ownerId === userId) return true;
  if (!meta.roles || !meta.userRoles) return false;

  const uRoles = meta.userRoles[userId];
  if (!uRoles) return false;

  const roleIds = Array.isArray(uRoles) ? uRoles : [uRoles];
  for (const rId of roleIds) {
    const role = meta.roles.find((r) => r.id === rId);
    if (role && role.permissions && role.permissions.admin === true) {
      return true;
    }
  }
  return false;
}

function getAuthorityLevel(meta, userId) {
  if (!userId) return 0;
  if (meta.ownerId && meta.ownerId === userId) return 3; // Owner
  if (checkAdminPermission(meta, userId)) return 2; // Admin
  const uRoles = meta.userRoles?.[userId];
  if (uRoles || (meta.savedMembers && meta.savedMembers[userId])) return 1; // Member
  return 0; // Guest
}

module.exports = { RoomMetaStore };
