export function getEffectiveProfile(profile, serverIdOrRoomCode, servers = []) {
  if (!profile) return null;
  if (!serverIdOrRoomCode) return profile;
  const targetKey = (typeof serverIdOrRoomCode === "object" && serverIdOrRoomCode !== null)
    ? (serverIdOrRoomCode.roomCode || serverIdOrRoomCode.id || "")
    : serverIdOrRoomCode;
  const rawKey = String(targetKey).trim();
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

  if (messageFallback?.isWebhook || messageFallback?.webhookName) {
    return {
      nickname: messageFallback?.authorNickname || messageFallback?.webhookName || "Webhook",
      avatar: messageFallback?.authorAvatar ?? messageFallback?.avatar ?? null,
      isWebhook: true,
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

  const serverObj = (typeof serverContext === "object" && serverContext !== null) ? serverContext : null;
  const serverScope = serverObj ? (serverObj.roomCode || serverObj.id) : serverContext;

  // 1. Self profile display
  if (profile?.id && (authorId === profile.id || authorId === "self")) {
    const effective = serverScope ? getEffectiveProfile(profile, serverScope) : profile;
    return { nickname: effective.nickname, avatar: effective.avatar ?? null };
  }

  // 2. Server savedMembers display (takes priority for current server nicknames & avatars)
  const savedMember = serverObj?.savedMembers?.[authorId];
  if (savedMember && savedMember.nickname) {
    return {
      nickname: savedMember.nickname,
      avatar: savedMember.avatar !== undefined ? savedMember.avatar : null,
    };
  }

  // 3. Message author metadata (sent at time of message creation with effective profile)
  if (messageFallback?.authorNickname) {
    return {
      nickname: messageFallback.authorNickname,
      avatar: messageFallback.authorAvatar !== undefined ? messageFallback.authorAvatar : (messageFallback.avatar ?? null),
    };
  }

  // 4. Online peer lookup
  let peer = null;
  if (peers instanceof Map) {
    peer = peers.get(authorId);
  } else if (Array.isArray(peers)) {
    peer = peers.find((p) => p && (p.id === authorId || p.userId === authorId || p.peerId === authorId));
  }

  if (peer) {
    let effNickname = peer.nickname;
    let effAvatar = peer.avatar;
    if (serverScope && peer.serverProfiles) {
      const scopeKey = String(serverScope).trim().toUpperCase();
      const override = peer.serverProfiles[scopeKey] || peer.serverProfiles[serverScope];
      if (override?.nickname) effNickname = override.nickname;
      if (override?.avatar !== undefined && override?.avatar !== null && override?.avatar !== "") {
        effAvatar = override.avatar;
      }
    }
    return {
      nickname: effNickname || "Usuario",
      avatar: effAvatar ?? null,
    };
  }

  // 5. Final fallback
  return {
    nickname:
      messageFallback?.complementName ||
      messageFallback?.nickname ||
      "Usuario",
    avatar: messageFallback?.avatar ?? null,
  };
}

export function buildPeerLookup(peers) {
  if (peers instanceof Map) return peers;
  const byKey = new Map();
  if (Array.isArray(peers)) {
    for (const peer of peers) {
      if (peer && peer.id) byKey.set(peer.id, peer);
      if (peer && peer.userId) byKey.set(peer.userId, peer);
      if (peer && peer.peerId) byKey.set(peer.peerId, peer);
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

/**
 * Resolves a clean, human-readable author nickname and avatar for notifications.
 * Accurately recognizes webhooks, plugins/complements, bots, server members, and peers,
 * avoiding raw IDs or ambiguous fallbacks like "Alguien".
 */
export function getNotificationAuthor(msg, server = null, profile = null, peers = null) {
  if (!msg) return { nickname: "Usuario", avatar: null };

  // 1. Webhook
  if (msg.isWebhook || msg.webhookName) {
    return {
      nickname: msg.authorNickname || msg.webhookName || "Webhook",
      avatar: msg.authorAvatar || msg.avatar || null,
    };
  }

  // 2. Addon / Complement
  if (msg.isComplement || msg.complementName || msg.addonName) {
    return {
      nickname: msg.complementName || msg.addonName || msg.authorNickname || "Complemento",
      avatar: msg.authorAvatar || msg.avatar || null,
    };
  }

  // 3. Bot
  if (msg.authorId === "onicord-bot" || msg.authorName === "Onicord") {
    return {
      nickname: "Onicord",
      avatar: "bot-star",
    };
  }

  const authorId = msg.authorId || msg.userId || msg.user?.id;
  const res = resolveAuthorDisplay(authorId, profile, peers, msg, server);
  let nickname = res.nickname;

  // Sanitize fallback
  if (!nickname || nickname.toLowerCase() === "alguien") {
    nickname = msg.authorNickname || msg.authorName || msg.user?.nickname || "Usuario";
  }

  // Strip raw hash/UUID if mistakenly used as nickname
  if (/^[0-9a-fA-F]{32,64}$/.test(nickname) || /^[0-9a-fA-F-]{36}$/.test(nickname)) {
    nickname = "Usuario";
  }

  return {
    nickname,
    avatar: res.avatar || msg.authorAvatar || msg.avatar || msg.user?.avatar || null,
  };
}
