/**
 * Onicord Plugin Utilities & Classification Engine
 */

/**
 * Compares two semantic version strings (e.g. v1.0.0 vs v1.0.1).
 * Returns true if catalogVer is strictly newer than installedVer.
 */
export function isNewerVersion(catalogVer, installedVer) {
  if (!catalogVer || !installedVer) return false;
  const clean = (v) =>
    String(v)
      .replace(/^v/i, "")
      .trim()
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const v1 = clean(catalogVer);
  const v2 = clean(installedVer);
  for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
    const num1 = v1[i] || 0;
    const num2 = v2[i] || 0;
    if (num1 > num2) return true;
    if (num1 < num2) return false;
  }
  return false;
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
 * Determines the operational scope of an addon/plugin:
 * - "server": Designed for P2P servers and collaborative chat/rooms.
 * - "client": Designed exclusively for personal usage / Bento Dashboard widgets.
 * - "hybrid": Combines both server capabilities and dashboard widgets.
 *
 * @param {object} manifest - Plugin manifest or catalog entry.
 * @returns {"server" | "client" | "hybrid"}
 */
export function getPluginScope(manifest) {
  if (!manifest) return "client";

  // 1. Explicit declaration if present in manifest or catalog
  if (
    manifest.scope === "server" ||
    manifest.scope === "client" ||
    manifest.scope === "hybrid"
  ) {
    return manifest.scope;
  }

  const perms = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  const hasServerCapabilities =
    perms.includes("ui.plugin_island") ||
    perms.includes("p2p.network") ||
    perms.includes("chat.read") ||
    perms.includes("chat.send") ||
    (Array.isArray(manifest.commands) && manifest.commands.length > 0) ||
    Boolean(manifest.commands);

  const hasDashboardCapabilities =
    (Array.isArray(manifest.dashboardWidgets) && manifest.dashboardWidgets.length > 0) ||
    Boolean(manifest.dashboardWidgets) ||
    perms.includes("ui.custom_widget");

  if (hasServerCapabilities && hasDashboardCapabilities) {
    return "hybrid";
  }
  if (hasServerCapabilities) {
    return "server";
  }
  return "client";
}

/**
 * Returns visual metadata for the scope badge to render in UI components.
 *
 * @param {string} scope - "server" | "client" | "hybrid"
 * @param {function} [t] - Optional translation function
 */
export function getScopeBadgeInfo(scope, t = (key, fallback) => fallback) {
  switch (scope) {
    case "server":
      return {
        key: "server",
        label: t("plugins.scope.server", "Servidor"),
        description: t("plugins.scope.serverDesc", "Pensado para salas y servidores colaborativos"),
        icon: "groups",
        badgeClass: "bg-sky-500/15 border-sky-500/30 text-sky-300",
      };
    case "hybrid":
      return {
        key: "hybrid",
        label: t("plugins.scope.hybrid", "Híbrido"),
        description: t("plugins.scope.hybridDesc", "Combina widgets personales con funciones para servidores"),
        icon: "hub",
        badgeClass: "bg-amber-500/15 border-amber-500/30 text-amber-300",
      };
    case "client":
    default:
      return {
        key: "client",
        label: t("plugins.scope.client", "Personal"),
        description: t("plugins.scope.clientDesc", "Funciona de forma local e independiente en tu equipo"),
        icon: "dashboard",
        badgeClass: "bg-purple-500/15 border-purple-500/30 text-purple-300",
      };
  }
}
