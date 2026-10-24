export function resolveAuthorDisplay(
  authorId,
  profile,
  peers,
  messageFallback = {},
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
    return { nickname: profile.nickname, avatar: profile.avatar ?? null };
  }

  if (peers instanceof Map) {
    const peer = peers.get(authorId);
    if (peer) {
      return { nickname: peer.nickname, avatar: peer.avatar ?? null };
    }
  } else if (Array.isArray(peers)) {
    for (const peer of peers) {
      if (peer.id === authorId) {
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
