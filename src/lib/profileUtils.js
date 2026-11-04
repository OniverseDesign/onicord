export function getEffectiveProfile(profile, serverIdOrRoomCode, servers = []) {
  if (!profile) return null;
  if (!serverIdOrRoomCode) return profile;
  const rawKey = String(serverIdOrRoomCode).trim();
  const safeKey = rawKey.toUpperCase();
  const serverProfiles = profile.serverProfiles || {};

  // 1. Direct match
  let override = serverProfiles[rawKey] || serverProfiles[safeKey];

  // 2. Case-insensitive key match
  if (!override) {
    for (const [key, val] of Object.entries(serverProfiles)) {
      if (key && (key === rawKey || key.toUpperCase() === safeKey)) {
        override = val;
        break;
      }
    }
  }

  // 3. Match via servers array (id <-> roomCode bidirectional resolution)
  if (!override && Array.isArray(servers) && servers.length > 0) {
    const s = servers.find(
      (srv) =>
        (srv.id && String(srv.id).toUpperCase() === safeKey) ||
        (srv.roomCode && String(srv.roomCode).toUpperCase() === safeKey)
    );
    if (s) {
      const codeKey = s.roomCode ? String(s.roomCode).trim().toUpperCase() : null;
      const idKey = s.id ? String(s.id).trim() : null;
      override =
        (codeKey && (serverProfiles[codeKey] || serverProfiles[s.roomCode])) ||
        (idKey && (serverProfiles[idKey] || serverProfiles[s.id]));
    }
  }

  if (!override) return profile;

  return {
    ...profile,
    nickname: (override.nickname && override.nickname.trim()) || profile.nickname,
    avatar: override.avatar !== undefined && override.avatar !== null && override.avatar !== "" ? override.avatar : profile.avatar,
    customLink: override.customLink !== undefined ? override.customLink : "",
    profileColor: override.profileColor !== undefined && override.profileColor !== "" ? override.profileColor : profile.profileColor,
    customStatus: override.customStatus !== undefined ? override.customStatus : "",
    isServerProfile: true,
    serverProfileRoomCode: safeKey,
  };
}

export function resolveAuthorDisplay(
  authorId,
  profile,
  peers,
  messageFallback = {},
  serverContext = null,
) {
  if (messageFallback?.authorId === "onicord-bot" || authorId === "onicord-bot") {
    return {
      nickname: "Onicord",
      avatar: "bot-star",
      isComplement: true,
    };
  }

  if (
    messageFallback?.isComplement ||
    (typeof authorId === "string" && authorId.startsWith("bot_"))
  ) {
    return {
      nickname:
        messageFallback?.authorNickname ||
        messageFallback?.complementName ||
        messageFallback?.user?.nickname ||
        messageFallback?.nickname ||
        "Complemento",
      avatar:
        messageFallback?.authorAvatar ??
        messageFallback?.avatar ??
        messageFallback?.user?.avatar ??
        null,
      isComplement: true,
    };
  }

  if (!authorId) {
    return {
      nickname:
        messageFallback?.authorNickname ||
        messageFallback?.complementName ||
        messageFallback?.nickname ||
        "Usuario",
      avatar: messageFallback?.authorAvatar ?? messageFallback?.avatar ?? null,
    };
  }

  if (profile?.id && (authorId === profile.id || authorId === "self")) {
    const effective = serverContext ? getEffectiveProfile(profile, serverContext) : profile;
    return { nickname: effective.nickname, avatar: effective.avatar ?? null };
  }

  if (peers instanceof Map) {
    const peer = peers.get(authorId);
    if (peer) {
      return { nickname: peer.nickname, avatar: peer.avatar ?? null };
    }
  } else if (Array.isArray(peers)) {
    for (const peer of peers) {
      if (peer.id === authorId || peer.userId === authorId) {
        return { nickname: peer.nickname, avatar: peer.avatar ?? null };
      }
    }
  }

  return {
    nickname:
      messageFallback?.authorNickname ||
      messageFallback?.complementName ||
      messageFallback?.nickname ||
      "Usuario",
    avatar: messageFallback?.authorAvatar ?? messageFallback?.avatar ?? null,
  };
}

export function buildPeerLookup(peers) {
  if (peers instanceof Map) return peers;
  const byKey = new Map();
  if (Array.isArray(peers)) {
    for (const peer of peers) {
      if (peer && peer.id) byKey.set(peer.id, peer);
      if (peer && peer.userId) byKey.set(peer.userId, peer);
    }
  }
  return byKey;
}

export function getPluginLocalizedMeta(plugin, language = "es") {
  if (!plugin) return { name: "", description: "" };
  const langKey = String(language || "en").substring(0, 2).toLowerCase();
  const localized = plugin.locales?.[langKey];

  return {
    name: localized?.name || plugin.name || plugin.id || "",
    description: localized?.description || plugin.description || "",
    commands: localized?.commands || {},
  };
}
