/**
 * Pure helpers for grouping server members by shared Rich Presence activity.
 */

const EXCLUDED_ACTIVITY_TYPES = new Set(["client", "launcher"]);

/**
 * Returns a consistent canonical identifier for a member across voice and member lists.
 */
export function getMemberCanonicalId(member) {
  if (!member) return null;
  if (member.isSelf) {
    return member.id || member.userId || member.peerId || "self";
  }
  return member.id || member.userId || member.peerId || null;
}

/**
 * Normalizes an activity name for case-, whitespace-, and trademark-insensitive matching.
 */
export function normalizeActivityName(name) {
  return String(name || "")
    .replace(/[™®©]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Extracts normalized grouping metadata from a member's activity, or null if the
 * activity should not be grouped (e.g., idle client menus, launchers, or catalogs).
 */
export function getActivityGroupInfo(activity) {
  if (!activity || !activity.name) return null;
  if (activity.isCatalog === true) return null;
  if (activity.type && EXCLUDED_ACTIVITY_TYPES.has(activity.type)) return null;

  const isMovie =
    activity.type === "movie" ||
    activity.type === "cinema" ||
    activity.name === "Cinema" ||
    activity.source === "addon:onicord-cinema";

  let canonicalType = "game";
  if (isMovie) {
    canonicalType = "movie";
  } else if (activity.type === "music") {
    canonicalType = "music";
  } else if (activity.type === "app") {
    canonicalType = "app";
  } else if (activity.type && activity.type !== "game") {
    return null;
  }

  let rawDisplayName = String(activity.name).trim();
  if (
    isMovie &&
    rawDisplayName.toLowerCase() === "cinema" &&
    typeof activity.details === "string" &&
    activity.details.trim()
  ) {
    rawDisplayName = activity.details.trim();
  }

  const normalizedName = normalizeActivityName(rawDisplayName);
  if (!normalizedName) return null;

  return {
    key: `${canonicalType}:${normalizedName}`,
    type: canonicalType,
    displayName: rawDisplayName,
    cover: activity.cover || activity.smallCover || null,
  };
}

/**
 * Partitions members into voice, shared-activity groups, remaining online, and offline.
 *
 * Only activities with 2 or more online members form a group, and each distinct
 * activity gets its own group sorted by member count (descending) then name.
 */
export function groupMembersByActivity({ members = [], voiceMembers = [] } = {}) {
  const safeMembers = Array.isArray(members) ? members : [];
  const safeVoice = Array.isArray(voiceMembers) ? voiceMembers : [];

  const inVoice = safeVoice.filter((m) => m?.channelId);
  const online = safeMembers.filter(
    (m) => m && (m.isSelf || m.online === true || m.online === undefined),
  );
  const offline = safeMembers.filter(
    (m) => m && !(m.isSelf || m.online === true || m.online === undefined),
  );

  // Build fallback activity lookup from voiceMembers in case a member's activity
  // is fresher or only populated on the voice entry.
  const voiceActivityById = new Map();
  for (const vm of safeVoice) {
    const id = getMemberCanonicalId(vm);
    if (id && vm?.activity?.name) {
      voiceActivityById.set(id, vm.activity);
    }
  }

  const groupsByKey = new Map();
  const memberGroupKeyById = new Map();

  for (const m of online) {
    const id = getMemberCanonicalId(m);
    const effectiveActivity = m.activity?.name
      ? m.activity
      : (id ? voiceActivityById.get(id) : null);

    const info = getActivityGroupInfo(effectiveActivity);
    if (!info) continue;

    let group = groupsByKey.get(info.key);
    if (!group) {
      group = {
        key: info.key,
        type: info.type,
        displayName: info.displayName,
        cover: info.cover,
        members: [],
      };
      groupsByKey.set(info.key, group);
    } else if (!group.cover && info.cover) {
      group.cover = info.cover;
    }

    const memberEntry =
      m.activity?.name || !effectiveActivity
        ? m
        : { ...m, activity: effectiveActivity };

    group.members.push(memberEntry);
    if (id) {
      memberGroupKeyById.set(id, info.key);
    }
  }

  const activityGroups = [];
  const groupedKeys = new Set();

  for (const group of groupsByKey.values()) {
    if (group.members.length > 1) {
      activityGroups.push(group);
      groupedKeys.add(group.key);
    }
  }

  activityGroups.sort((a, b) => {
    if (b.members.length !== a.members.length) {
      return b.members.length - a.members.length;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  const justOnline = [];
  for (const m of online) {
    const id = getMemberCanonicalId(m);
    const groupKey = id ? memberGroupKeyById.get(id) : null;
    if (!groupKey || !groupedKeys.has(groupKey)) {
      justOnline.push(m);
    }
  }

  return {
    inVoice,
    online,
    offline,
    activityGroups,
    justOnline,
  };
}
