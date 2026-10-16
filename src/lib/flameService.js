import { notificationManager } from "./notificationManager";
import i18n from "../i18n/config";
import { soundEngine } from "./soundEngine";

export const FLAME_TIERS = [
  {
    minDays: 0,
    maxDays: 0,
    name: "No Streak",
    color: "#94A3B8", 
    badgeBg: "onicord-racha-badge-tier-0",
    glow: "",
    animate: "",
  },
  {
    minDays: 1,
    maxDays: 3,
    name: "Nivel 1",
    color: "#FACC15", 
    badgeBg: "onicord-racha-badge-tier-1",
    glow: "",
    animate: "",
  },
  {
    minDays: 4,
    maxDays: 7,
    name: "Nivel 2",
    color: "#FB923C", 
    badgeBg: "onicord-racha-badge-tier-2",
    glow: "",
    animate: "",
  },
  {
    minDays: 8,
    maxDays: 14,
    name: "Nivel 3",
    color: "#F87171", 
    badgeBg: "onicord-racha-badge-tier-3",
    glow: "",
    animate: "",
  },
  {
    minDays: 15,
    maxDays: 29,
    name: "Nivel 4",
    color: "#C084FC", 
    badgeBg: "onicord-racha-badge-tier-4",
    glow: "",
    animate: "",
  },
  {
    minDays: 30,
    maxDays: 59,
    name: "Nivel 5",
    color: "#38BDF8", 
    badgeBg: "onicord-racha-badge-tier-5",
    glow: "",
    animate: "",
  },
  {
    minDays: 60,
    maxDays: Infinity,
    name: "Nivel 6",
    color: "#FFFFFF", 
    badgeBg: "onicord-racha-badge-tier-6",
    glow: "",
    animate: "",
    isLegendary: true,
  },
];

export function getFlameTier(days = 0) {
  const d = Math.max(0, days || 0);
  return (
    FLAME_TIERS.find((t) => d >= t.minDays && d <= t.maxDays) ||
    FLAME_TIERS[FLAME_TIERS.length - 1]
  );
}

export function getTodayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDaysDifference(dateStr1, dateStr2) {
  if (!dateStr1 || !dateStr2) return 999;
  
  const [y1, m1, d1] = dateStr1.split("-").map(Number);
  const [y2, m2, d2] = dateStr2.split("-").map(Number);
  
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  
  const diffTime = Math.abs(utc2 - utc1);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

export function evaluateUserFlame(rawFlameData = {}, serverId = "") {
  const rawFlame = rawFlameData || {};
  let flameData = {};

  if (rawFlame && typeof rawFlame === "object") {
    if (serverId) {
      if (rawFlame[serverId] && typeof rawFlame[serverId] === "object") {
        flameData = rawFlame[serverId];
      } else if ("currentStreak" in rawFlame && rawFlame.serverId === serverId) {
        flameData = rawFlame;
      }
    } else {
      if (!("currentStreak" in rawFlame)) {
        let latestServerFlame = null;
        let latestDate = "";
        Object.keys(rawFlame).forEach((key) => {
          const val = rawFlame[key];
          if (val && typeof val === "object" && val.lastInteractionDate) {
            if (!latestDate || val.lastInteractionDate > latestDate) {
              latestDate = val.lastInteractionDate;
              latestServerFlame = val;
            }
          }
        });
        flameData = latestServerFlame || {};
      } else {
        flameData = rawFlame;
      }
    }
  }

  const today = getTodayStr();
  const currentStreak = flameData?.currentStreak || 0;
  const highestStreak = Math.max(flameData?.highestStreak || 0, currentStreak);
  const lastInteractionDate = flameData?.lastInteractionDate || null;

  if (!lastInteractionDate) {
    return {
      currentStreak: 0,
      highestStreak,
      lastInteractionDate: null,
      interactedToday: false,
      isDecayed: false,
      isReset: false,
    };
  }

  const diffDays = getDaysDifference(lastInteractionDate, today);

  if (diffDays === 0) {
    return {
      currentStreak,
      highestStreak,
      lastInteractionDate,
      interactedToday: true,
      isDecayed: false,
      isReset: false,
    };
  }

  if (diffDays >= 30) {
    return {
      currentStreak: 0,
      highestStreak,
      lastInteractionDate,
      interactedToday: false,
      isDecayed: true,
      isReset: true,
    };
  }

  const missedDays = diffDays - 1;
  const newStreak = Math.max(0, currentStreak - missedDays);

  return {
    currentStreak: newStreak,
    highestStreak,
    lastInteractionDate,
    interactedToday: false,
    isDecayed: missedDays > 0,
    isReset: newStreak === 0,
  };
}

const milestoneListeners = new Set();

export function subscribeStreakMilestone(callback) {
  milestoneListeners.add(callback);
  return () => milestoneListeners.delete(callback);
}

function notifyMilestoneReached(userId, streakDays, tier) {
  milestoneListeners.forEach((cb) => {
    try {
      cb({ userId, streakDays, tier });
    } catch (e) {
      console.error("[Flame Milestone Hook Error]", e);
    }
  });
}

export function recordUserInteraction(userProfile = {}, serverId = "") {
  const profileObj = userProfile || {};
  if (!serverId) return profileObj.flame || {};

  const userFlame = profileObj.flame || {};
  let serverFlame = userFlame;

  // Extract this server's specific flame if it's already a map, or if we need to initialize one
  const isMap = userFlame && typeof userFlame === "object" && !("currentStreak" in userFlame);
  if (isMap) {
    serverFlame = userFlame[serverId] || {};
  } else if (userFlame && typeof userFlame === "object" && "currentStreak" in userFlame) {
    // If it's a legacy single-server flame, migrate it to the map
    serverFlame = userFlame.serverId === serverId ? userFlame : {};
  }

  const currentFlame = evaluateUserFlame(serverFlame);
  const today = getTodayStr();

  if (currentFlame.interactedToday) {
    return userFlame; 
  }

  // Check if streak decayed or reset prior to this new interaction
  const rawRecordedStreak = serverFlame?.currentStreak || 0;
  const rawRecordedTier = getFlameTier(rawRecordedStreak);
  const evaluatedTier = getFlameTier(currentFlame.currentStreak);

  if (currentFlame.isReset && rawRecordedStreak > 0) {
    soundEngine.playCue("warning");
    notificationManager.showToast(
      i18n.t("flame.streaksEvaporated", "¡Se evaporaron las flamas!"),
      i18n.t("flame.continuousDays", { count: 0 })
    );
  } else if (currentFlame.isDecayed && evaluatedTier.minDays < rawRecordedTier.minDays) {
    soundEngine.playCue("warning");
    notificationManager.showToast(
      i18n.t("flame.streakDecreased", "Flama reducida"),
      i18n.t("flame.continuousDays", { count: currentFlame.currentStreak })
    );
  }

  const prevStreak = currentFlame.currentStreak;
  const prevTier = getFlameTier(prevStreak);

  const nextStreak = prevStreak + 1;
  const nextHighest = Math.max(currentFlame.highestStreak || 0, nextStreak);
  const nextTier = getFlameTier(nextStreak);

  const updatedServerFlame = {
    currentStreak: nextStreak,
    highestStreak: nextHighest,
    lastInteractionDate: today,
    serverId,
  };

  const updatedFlameMap = isMap
    ? { ...userFlame, [serverId]: updatedServerFlame }
    : { [serverId]: updatedServerFlame };

  if (!prevTier || (nextTier && nextTier.minDays > (prevTier?.minDays || 0))) {
    soundEngine.playCue("reward");
    notificationManager.showToast(
      i18n.t("flame.streakEvolvedTitle", { tier: nextTier?.name || "siguiente nivel" }),
      i18n.t("flame.continuousDays", { count: nextStreak })
    );
    notifyMilestoneReached(userProfile.id, nextStreak, nextTier);
  } else {
    soundEngine.playCue("success");
    notificationManager.showToast(
      i18n.t("flame.streakMaintained"),
      i18n.t("flame.continuousDays", { count: nextStreak })
    );
  }

  return updatedFlameMap;
}

export function formatDateStr(timestamp) {
  if (!timestamp) return getTodayStr();
  const d = new Date(timestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function evaluateServerFlame(server = {}, membersList = []) {
  const isServerObject = typeof server === "object" && server !== null && ("roomCode" in server || "createdAt" in server);
  const serverFlame = isServerObject ? (server.flame || {}) : server;

  const createdAt = (isServerObject ? server.createdAt : null) || serverFlame.createdAt || Date.now();
  const todayStr = getTodayStr();
  const createdStr = formatDateStr(createdAt);
  const serverAgeDays = getDaysDifference(createdStr, todayStr) + 1;

  const serverId = isServerObject ? (server.roomCode || server.id) : "";

  const activeUserStreaks = membersList.map(
    (m) => evaluateUserFlame(m?.flame || {}, serverId).currentStreak
  );
  const allZero = activeUserStreaks.every((s) => s === 0);

  if (membersList.length === 0 || allZero) {
    return {
      serverStreak: 0,
      isAtRisk: false,
      isReset: true,
    };
  }

  const maxUserStreak = Math.max(0, ...activeUserStreaks);
  const currentServerStreak = maxUserStreak;

  const interactedTodayCount = membersList.filter(
    (m) => evaluateUserFlame(m?.flame || {}, serverId).interactedToday
  ).length;

  const isAtRisk = interactedTodayCount === 0 && currentServerStreak >= 3;

  return {
    serverStreak: currentServerStreak,
    isAtRisk,
    isReset: false,
  };
}
