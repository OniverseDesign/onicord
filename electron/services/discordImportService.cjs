const crypto = require("crypto");
const { safeSliceUnicode } = require("../p2p/serverStore.cjs");

const DISCORD_TEMPLATE_API_BASE = "https://discord.com/api/v10/guilds/templates";
const REQUEST_TIMEOUT_MS = 10000;

// Discord permission bitflags mapped to Onicord role permissions
const BIT_ADMINISTRATOR = 1n << 3n;
const BIT_MANAGE_CHANNELS = 1n << 4n;
const BIT_MANAGE_GUILD = 1n << 5n;
const BIT_STREAM = 1n << 9n;
const BIT_VIEW_CHANNEL = 1n << 10n;
const BIT_SEND_MESSAGES = 1n << 11n;
const BIT_CONNECT = 1n << 20n;
const BIT_PRIORITY_SPEAKER = 1n << 8n;
const BIT_MUTE_MEMBERS = 1n << 22n;
const BIT_MOVE_MEMBERS = 1n << 24n;

/**
 * Safely parses a Discord permission integer/string into BigInt.
 * @param {string|number|bigint|null|undefined} raw
 * @returns {bigint}
 */
function parsePermBits(raw) {
  if (raw === null || raw === undefined || raw === "") return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

/**
 * Extracts and validates a Discord Server Template code from a URL or raw code.
 * Supports:
 * - https://discord.new/<CODE>
 * - https://discord.com/template/<CODE>
 * - discord.new/<CODE>
 * - <CODE>
 *
 * @param {string} input
 * @returns {string} Validated template code
 */
function extractTemplateCode(input) {
  if (!input || typeof input !== "string") {
    throw new Error("INVALID_TEMPLATE_URL");
  }

  let candidate = input.trim();
  if (!candidate) {
    throw new Error("INVALID_TEMPLATE_URL");
  }

  // Strip query parameters and hash fragments
  candidate = candidate.split(/[?#]/)[0].replace(/\/+$/, "");

  const urlMatch = candidate.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:discord\.new|discord\.com\/template)\/([A-Za-z0-9_-]+)$/i
  );
  if (urlMatch && urlMatch[1]) {
    candidate = urlMatch[1];
  } else if (candidate.includes("/") || candidate.includes(":")) {
    throw new Error("INVALID_TEMPLATE_URL");
  }

  if (!/^[A-Za-z0-9_-]{4,32}$/.test(candidate)) {
    throw new Error("INVALID_TEMPLATE_URL");
  }

  return candidate;
}

/**
 * Maps Discord integer RGB color to #RRGGBB hex string.
 * @param {number} colorInt
 * @returns {string}
 */
function discordColorToHex(colorInt) {
  const n = Number(colorInt);
  if (!Number.isFinite(n) || n <= 0) return "#99aab5";
  return `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;
}

/**
 * Maps Discord role permission bitfield to Onicord's 7 role permission keys.
 * @param {string|number} rawPermissions
 * @returns {Object}
 */
function mapDiscordRolePermissions(rawPermissions) {
  const bits = parsePermBits(rawPermissions);
  const isAdmin = (bits & BIT_ADMINISTRATOR) !== 0n;
  return {
    admin: isAdmin,
    send_messages: isAdmin || (bits & BIT_SEND_MESSAGES) !== 0n,
    connect_voice: isAdmin || (bits & BIT_CONNECT) !== 0n,
    share_video: isAdmin || (bits & BIT_STREAM) !== 0n,
    manage_music:
      isAdmin ||
      (bits & (BIT_MANAGE_CHANNELS | BIT_MUTE_MEMBERS | BIT_PRIORITY_SPEAKER)) !== 0n,
    move_members: isAdmin || (bits & BIT_MOVE_MEMBERS) !== 0n,
    view_advanced_settings: isAdmin || (bits & BIT_MANAGE_GUILD) !== 0n,
  };
}

/**
 * Maps Discord channel type integer to Onicord channel type string.
 * Returns null for unsupported channel types.
 * @param {number} discordType
 * @returns {"category"|"text"|"voice"|"forum"|null}
 */
function mapDiscordChannelType(discordType) {
  switch (Number(discordType)) {
    case 4:
      return "category";
    case 2:
    case 13:
      return "voice";
    case 15:
      return "forum";
    case 0:
    case 5:
      return "text";
    default:
      return null;
  }
}

/**
 * Normalizes a raw Discord template JSON payload into a previewable Onicord structure.
 * @param {Object} raw
 * @returns {Object}
 */
function normalizeDiscordTemplate(raw) {
  if (!raw || typeof raw !== "object" || !raw.serialized_source_guild) {
    throw new Error("DISCORD_TEMPLATE_INVALID_PAYLOAD");
  }

  const guild = raw.serialized_source_guild;
  const serverName =
    safeSliceUnicode(String(guild.name || raw.name || "Imported Server").trim(), 48) ||
    "Imported Server";

  // 1. Normalize roles (skip @everyone id 0, sort highest position first)
  const rawRoles = Array.isArray(guild.roles) ? guild.roles : [];
  const roles = rawRoles
    .filter((r) => r && String(r.id) !== "0" && r.name !== "@everyone")
    .sort((a, b) => Number(b.position ?? 0) - Number(a.position ?? 0))
    .map((r, idx) => ({
      discordId: String(r.id),
      name: safeSliceUnicode(String(r.name || "Role").trim(), 64) || "Role",
      color: discordColorToHex(r.color),
      position: idx,
      hoist: Boolean(r.hoist),
      permissions: mapDiscordRolePermissions(r.permissions),
    }));

  // 2. Normalize channels & categories
  const rawChannels = Array.isArray(guild.channels) ? guild.channels : [];
  let skippedUnsupportedChannels = 0;
  let hasUnsupportedMeta = false;
  const parsedItems = [];

  for (const ch of rawChannels) {
    if (!ch || ch.id === undefined || ch.id === null) continue;
    const mappedType = mapDiscordChannelType(ch.type);
    if (!mappedType) {
      skippedUnsupportedChannels += 1;
      continue;
    }

    const overwrites = Array.isArray(ch.permission_overwrites) ? ch.permission_overwrites : [];
    const everyoneOw = overwrites.find((ow) => ow && String(ow.id) === "0");
    const isPrivate = Boolean(
      everyoneOw && (parsePermBits(everyoneOw.deny) & BIT_VIEW_CHANNEL) !== 0n
    );
    const allowedDiscordRoleIds = overwrites
      .filter(
        (ow) =>
          ow &&
          Number(ow.type) === 0 &&
          String(ow.id) !== "0" &&
          (parsePermBits(ow.allow) & BIT_VIEW_CHANNEL) !== 0n
      )
      .map((ow) => String(ow.id));

    const slowmodeSec = Number(ch.rate_limit_per_user) || 0;
    const topic = ch.topic ? String(ch.topic).trim().slice(0, 500) : null;
    if (slowmodeSec > 0 || topic || overwrites.length > 0) {
      hasUnsupportedMeta = true;
    }

    parsedItems.push({
      discordId: String(ch.id),
      name:
        safeSliceUnicode(String(ch.name || (mappedType === "category" ? "Category" : "channel")).trim(), 100) ||
        (mappedType === "category" ? "Category" : "channel"),
      type: mappedType,
      parentDiscordId: ch.parent_id != null ? String(ch.parent_id) : null,
      rawPosition: Number(ch.position ?? 0),
      nsfw: Boolean(ch.nsfw),
      topic,
      slowmodeSec,
      isPrivate,
      allowedDiscordRoleIds,
    });
  }

  if (skippedUnsupportedChannels > 0) {
    hasUnsupportedMeta = true;
  }

  const categoryIds = new Set(
    parsedItems.filter((c) => c.type === "category").map((c) => c.discordId)
  );

  // Order: root channels first, then each category followed immediately by its children
  const rootChannels = parsedItems
    .filter(
      (c) =>
        c.type !== "category" &&
        (!c.parentDiscordId || !categoryIds.has(c.parentDiscordId))
    )
    .sort((a, b) => a.rawPosition - b.rawPosition)
    .map((c) => ({ ...c, parentDiscordId: null }));

  const categories = parsedItems
    .filter((c) => c.type === "category")
    .sort((a, b) => a.rawPosition - b.rawPosition);

  const orderedChannels = [...rootChannels];
  for (const cat of categories) {
    orderedChannels.push(cat);
    const children = parsedItems
      .filter((c) => c.type !== "category" && c.parentDiscordId === cat.discordId)
      .sort((a, b) => a.rawPosition - b.rawPosition);
    orderedChannels.push(...children);
  }

  const channels = orderedChannels.map(({ rawPosition, ...rest }, idx) => ({
    ...rest,
    position: idx,
  }));

  return {
    code: String(raw.code || ""),
    templateName: String(raw.name || ""),
    templateDescription: String(raw.description || ""),
    serverName,
    channels,
    roles,
    afkChannelDiscordId: guild.afk_channel_id != null ? String(guild.afk_channel_id) : null,
    afkTimeout: Number(guild.afk_timeout) || 300,
    skippedUnsupportedChannels,
    hasUnsupportedMeta,
  };
}

/**
 * Fetches and normalizes a Discord Server Template from Discord's public API.
 * @param {string} input
 * @returns {Promise<Object>}
 */
async function fetchDiscordTemplate(input) {
  const code = extractTemplateCode(input);
  const url = `${DISCORD_TEMPLATE_API_BASE}/${encodeURIComponent(code)}`;

  let res;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Onicord-Importer/1.0",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err?.name === "TimeoutError" || err?.name === "AbortError") {
      throw new Error("DISCORD_TIMEOUT");
    }
    throw new Error(`DISCORD_NETWORK_ERROR:${err?.message || "Connection failed"}`);
  }

  if (res.status === 404) {
    throw new Error("DISCORD_TEMPLATE_NOT_FOUND");
  }
  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after") || "5";
    throw new Error(`DISCORD_RATE_LIMITED:${retryAfter}`);
  }
  if (!res.ok) {
    throw new Error(`DISCORD_API_ERROR:${res.status}`);
  }

  let raw;
  try {
    raw = await res.json();
  } catch {
    throw new Error("DISCORD_TEMPLATE_INVALID_PAYLOAD");
  }

  return normalizeDiscordTemplate(raw);
}

/**
 * Builds a unique Onicord channel ID following Onicord's prefix conventions.
 * @param {"category"|"text"|"voice"|"forum"} type
 * @param {string} name
 * @returns {string}
 */
function buildOnicordChannelId(type, name) {
  const prefix =
    type === "category"
      ? "cat"
      : type === "voice"
        ? "voice"
        : type === "forum"
          ? "forum"
          : "ch";
  const slug = String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
  const rand = crypto.randomBytes(3).toString("hex");
  return `${prefix}-${slug || "item"}-${rand}`;
}

/**
 * Converts a normalized preview + user selection into final Onicord server metadata.
 * @param {Object} importData
 * @returns {Object}
 */
function buildServerImportPayload(importData) {
  if (!importData || typeof importData !== "object") {
    throw new Error("INVALID_IMPORT_DATA");
  }

  const rawRoles = Array.isArray(importData.roles) ? importData.roles : [];
  const rawChannels = Array.isArray(importData.channels) ? importData.channels : [];

  const selectedRoleSet = Array.isArray(importData.selectedRoleIds)
    ? new Set(importData.selectedRoleIds.map(String))
    : null;
  const selectedChannelSet = Array.isArray(importData.selectedChannelIds)
    ? new Set(importData.selectedChannelIds.map(String))
    : null;

  // 1. Remap roles
  const roleIdMap = new Map();
  const finalRoles = rawRoles
    .filter((r) => r && (!selectedRoleSet || selectedRoleSet.has(String(r.discordId))))
    .map((r, idx) => {
      const newId = `role-${crypto.randomBytes(4).toString("hex")}`;
      roleIdMap.set(String(r.discordId), newId);
      return {
        id: newId,
        name: safeSliceUnicode(String(r.name || "Role").trim(), 64) || "Role",
        color: /^#[0-9a-f]{6}$/i.test(String(r.color || "")) ? String(r.color) : "#99aab5",
        position: idx,
        hoist: Boolean(r.hoist),
        permissions:
          r.permissions && typeof r.permissions === "object"
            ? r.permissions
            : {
                admin: false,
                send_messages: true,
                connect_voice: true,
                share_video: true,
                manage_music: false,
                move_members: false,
                view_advanced_settings: false,
              },
      };
    });

  // 2. Filter channels and assign Onicord IDs (categories first so parent lookup is always ready)
  const selectedChannels = rawChannels.filter(
    (ch) => ch && (!selectedChannelSet || selectedChannelSet.has(String(ch.discordId)))
  );

  const channelIdMap = new Map();
  for (const ch of selectedChannels) {
    if (ch.type === "category") {
      channelIdMap.set(String(ch.discordId), buildOnicordChannelId("category", ch.name));
    }
  }
  for (const ch of selectedChannels) {
    if (ch.type !== "category") {
      channelIdMap.set(String(ch.discordId), buildOnicordChannelId(ch.type, ch.name));
    }
  }

  const finalChannels = selectedChannels.map((ch) => {
    const mappedId = channelIdMap.get(String(ch.discordId));
    const isCat = ch.type === "category";
    const mappedParent =
      !isCat && ch.parentDiscordId ? channelIdMap.get(String(ch.parentDiscordId)) || null : null;

    const allowedRoles = Array.isArray(ch.allowedDiscordRoleIds)
      ? ch.allowedDiscordRoleIds.map((rid) => roleIdMap.get(String(rid))).filter(Boolean)
      : [];

    return {
      id: mappedId,
      type: isCat
        ? "category"
        : ch.type === "voice"
          ? "voice"
          : ch.type === "forum"
            ? "forum"
            : "text",
      name: safeSliceUnicode(String(ch.name || "channel").trim(), 100) || "channel",
      parentId: mappedParent,
      nsfw: Boolean(ch.nsfw),
      topic: ch.topic ? String(ch.topic).slice(0, 500) : null,
      slowmodeSec: Number(ch.slowmodeSec) || 0,
      isPrivate: Boolean(ch.isPrivate),
      allowedRoles,
      hasSpeakRestrictions: false,
      disallowedSpeakRoles: [],
    };
  });

  // Guarantee at least one non-category channel
  if (!finalChannels.some((c) => c.type !== "category")) {
    finalChannels.push({
      id: "general",
      type: "text",
      name: "general",
      parentId: null,
      nsfw: false,
      topic: null,
      slowmodeSec: 0,
      isPrivate: false,
      allowedRoles: [],
      hasSpeakRestrictions: false,
      disallowedSpeakRoles: [],
    });
  }

  // 3. Map AFK voice channel if present and selected
  let afkChannelId = null;
  if (importData.afkChannelDiscordId) {
    const candidateId = channelIdMap.get(String(importData.afkChannelDiscordId));
    const candidateCh = candidateId ? finalChannels.find((c) => c.id === candidateId) : null;
    if (candidateCh && candidateCh.type === "voice") {
      afkChannelId = candidateCh.id;
    }
  }

  return {
    name:
      safeSliceUnicode(String(importData.serverName || "Imported Server").trim(), 100) ||
      "Imported Server",
    icon: importData.icon || null,
    channels: finalChannels,
    roles: finalRoles,
    afkSettings: {
      channelId: afkChannelId,
      timeout: Number(importData.afkTimeout) || 300,
    },
    groupByRoles: finalRoles.some((r) => Boolean(r.hoist)),
  };
}

module.exports = {
  extractTemplateCode,
  fetchDiscordTemplate,
  normalizeDiscordTemplate,
  buildServerImportPayload,
  discordColorToHex,
  mapDiscordRolePermissions,
  mapDiscordChannelType,
};
