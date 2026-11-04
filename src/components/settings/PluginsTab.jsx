import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import { Delete, IconAdd } from "../icons/StreamIcons";
import ConfirmDialogModal from "../modals/ConfirmDialogModal";
import {
  getPluginLocalizedMeta,
  getPluginScope,
  getScopeBadgeInfo,
  isNewerVersion,
} from "../../lib/pluginUtils";
import { notificationManager } from "../../lib/notificationManager";

export default function PluginsTab({ profile, onSaved }) {
  const { t, i18n } = useTranslation();
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedPluginId, setExpandedPluginId] = useState(null);
  const [pluginToDelete, setPluginToDelete] = useState(null);

  const [catalogPlugins, setCatalogPlugins] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [failedIcons, setFailedIcons] = useState({});

  const [scopeFilter, setScopeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const loadPlugins = async () => {
    setLoading(true);
    try {
      if (window.electronAPI?.listPlugins) {
        const list = await window.electronAPI.listPlugins();
        setPlugins(list || []);
      }
    } catch (err) {
      console.error("Error cargando complementos:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlugins();

    setLoadingCatalog(true);
    fetch("https://raw.githubusercontent.com/OniverseDesign/onicord-addons/main/index.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.plugins)) {
          setCatalogPlugins(data.plugins);
        }
      })
      .catch((err) => {
        console.warn("No se pudo cargar el catalogo de GitHub:", err);
      })
      .finally(() => {
        setLoadingCatalog(false);
      });
  }, []);

  const handleInstallFromCatalog = async (plugin) => {
    const pluginId = plugin.id;
    setDownloadingId(pluginId);

    try {
      if (!window.electronAPI?.downloadAndInstallPlugin) {
        throw new Error("API de instalación no disponible");
      }
      const res = await window.electronAPI.downloadAndInstallPlugin(pluginId);
      if (res && res.error) {
        throw new Error(res.error);
      }
      if (res && res.success === false) {
        throw new Error("No se pudo instalar el complemento.");
      }

      await loadPlugins();
      notificationManager.showToast(
        t("common.success", "Éxito"),
        t("settings.plugins.installSuccess", "Complemento instalado correctamente."),
        "success"
      );
    } catch (err) {
      console.error("Error al instalar complemento:", err);
      notificationManager.showToast(
        t("common.error", "Error"),
        err.message || "Error al instalar complemento.",
        "danger"
      );
    } finally {
      setDownloadingId(null);
    }
  };

  const pluginsWithUpdates = useMemo(() => {
    return plugins.filter((plugin) => {
      const catalogEntry = catalogPlugins.find((cp) => cp.id === plugin.id);
      return catalogEntry && isNewerVersion(catalogEntry.version, plugin.version);
    });
  }, [plugins, catalogPlugins]);

  const autoUpdatePlugins = profile?.general?.autoUpdatePlugins !== false;

  const handleToggleAutoUpdate = async () => {
    if (!profile) return;
    const nextVal = !autoUpdatePlugins;
    const updated = {
      ...profile,
      general: {
        ...(profile.general || {}),
        autoUpdatePlugins: nextVal,
      },
    };
    if (onSaved) {
      onSaved(updated);
    }
    if (window.electronAPI?.saveProfile) {
      await window.electronAPI.saveProfile(updated);
    }
  };

  const handleUpdateAll = async () => {
    setUpdatingAll(true);
    try {
      if (window.electronAPI?.updateAllPlugins) {
        const res = await window.electronAPI.updateAllPlugins();
        if (res?.success) {
          await loadPlugins();
          notificationManager.showToast(
            t("common.success", "Éxito"),
            t("settings.plugins.updateAllSuccess", "Se han actualizado {{count}} complemento(s) con éxito.", {
              count: res.updatedCount,
            }),
            "success"
          );
        }
      } else {
        // Fallback: update sequentially
        for (const p of pluginsWithUpdates) {
          const entry = catalogPlugins.find((cp) => cp.id === p.id);
          if (entry) await handleInstallFromCatalog(entry);
        }
      }
    } catch (err) {
      console.error("Error al actualizar complementos:", err);
      notificationManager.showToast(
        t("common.error", "Error"),
        err.message || "Error al actualizar complementos.",
        "danger"
      );
    } finally {
      setUpdatingAll(false);
    }
  };

  const handleImportPackage = async () => {
    setIsImporting(true);
    try {
      if (window.electronAPI?.installPluginDialog) {
        const res = await window.electronAPI.installPluginDialog();
        if (res?.success && res.manifest) {
          await loadPlugins();
          notificationManager.showToast(
            t("common.success", "Éxito"),
            t("settings.plugins.importSuccess", "Complemento '{{name}}' importado con éxito.", {
              name: res.manifest.name,
            }),
            "success"
          );
        }
      }
    } catch (err) {
      console.error("Error importando paquete:", err);
      notificationManager.showToast(
        t("common.error", "Error"),
        err.message || t("settings.plugins.importError", "Error al importar el paquete."),
        "danger"
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handlePackFolder = async () => {
    try {
      if (window.electronAPI?.packPluginDialog) {
        const res = await window.electronAPI.packPluginDialog();
        if (res?.success) {
          notificationManager.showToast(
            t("common.success", "Éxito"),
            t("settings.plugins.packSuccess", "Complemento empaquetado con éxito."),
            "success"
          );
        } else if (res?.error) {
          notificationManager.showToast(t("common.error", "Error"), res.error, "danger");
        }
      }
    } catch (err) {
      notificationManager.showToast(t("common.error", "Error"), err.message, "danger");
    }
  };

  const handleToggle = async (pluginId, currentEnabled) => {
    try {
      if (window.electronAPI?.togglePlugin) {
        await window.electronAPI.togglePlugin(pluginId, !currentEnabled);
        loadPlugins();
      }
    } catch (err) {
      console.error("Error cambiando estado del complemento:", err);
    }
  };

  const handleUninstall = async (pluginTarget, pluginName) => {
    try {
      if (window.electronAPI?.uninstallPlugin) {
        const idToUse = typeof pluginTarget === "object" ? pluginTarget.id : pluginTarget;
        const dirNameToUse = typeof pluginTarget === "object" ? pluginTarget.dirName : null;
        if (idToUse) await window.electronAPI.uninstallPlugin(idToUse);
        if (dirNameToUse && dirNameToUse !== idToUse) await window.electronAPI.uninstallPlugin(dirNameToUse);
        notificationManager.showToast(
          t("common.info", "Información"),
          t("settings.plugins.uninstallSuccess", "Complemento '{{name}}' eliminado de tu equipo.", {
            name: pluginName,
          }),
          "info"
        );
        loadPlugins();
      }
    } catch (err) {
      console.error("Error eliminando complemento:", err);
      notificationManager.showToast(t("common.error", "Error"), err.message || "Error al desinstalar", "danger");
    }
  };

  const allMergedPlugins = useMemo(() => {
    const list = [];
    const installedIds = new Set();
    const installedDirs = new Set();

    // 1. Locally installed plugins first
    for (const p of plugins) {
      if (!p) continue;
      if (p.id) installedIds.add(String(p.id).trim().toLowerCase());
      if (p.dirName) installedDirs.add(String(p.dirName).trim().toLowerCase());
      const catalogEntry = catalogPlugins.find(
        (cp) => cp.id && String(cp.id).trim().toLowerCase() === String(p.id).trim().toLowerCase()
      );
      list.push({
        ...p,
        isInstalled: true,
        catalogEntry,
      });
    }

    // 2. Catalog plugins that are NOT yet installed locally
    for (const cp of catalogPlugins) {
      if (!cp || !cp.id) continue;
      const lowerId = String(cp.id).trim().toLowerCase();
      const lowerDir = cp.dirName ? String(cp.dirName).trim().toLowerCase() : null;
      if (!installedIds.has(lowerId) && (!lowerDir || !installedDirs.has(lowerDir))) {
        list.push({
          ...cp,
          isInstalled: false,
          catalogEntry: cp,
        });
      }
    }

    return list;
  }, [plugins, catalogPlugins]);

  const filteredPlugins = useMemo(() => {
    return allMergedPlugins.filter((plugin) => {
      if (!plugin) return false;
      const scope = getPluginScope(plugin);
      if (scopeFilter !== "all" && scope !== scopeFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const meta = getPluginLocalizedMeta(plugin, i18n.language);
        const q = searchQuery.toLowerCase();
        const matchesName = (meta.name || "").toLowerCase().includes(q);
        const matchesDesc = (meta.description || "").toLowerCase().includes(q);
        const matchesId = (plugin.id || "").toLowerCase().includes(q);
        const matchesAuthor = (plugin.author || "").toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesId && !matchesAuthor) return false;
      }
      return true;
    });
  }, [allMergedPlugins, scopeFilter, searchQuery, i18n.language]);

  return (
    <div className="onicord-settings-container space-y-4">

      {/* Updates Available Banner */}
      {pluginsWithUpdates.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center shrink-0">
              <MaterialIcon name="upgrade" size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-amber-200">
                {t("settings.plugins.updatesAvailableTitle", "Actualizaciones de complementos disponibles")}
              </p>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                {pluginsWithUpdates.length === 1
                  ? t("settings.plugins.oneUpdateDesc", "Hay 1 complemento con una versión más reciente.")
                  : t("settings.plugins.multipleUpdatesDesc", "Hay {{count}} complementos con versiones más recientes.", { count: pluginsWithUpdates.length })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleUpdateAll}
            disabled={updatingAll}
            className="px-4 py-2 rounded-onicord-button bg-amber-500 hover:bg-amber-400 text-black text-xs font-extrabold transition flex items-center justify-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50 active:scale-95 shadow-md shadow-amber-500/15"
          >
            <MaterialIcon name={updatingAll ? "sync" : "update"} size={16} className={updatingAll ? "animate-spin" : ""} />
            <span>{updatingAll ? t("common.updating", "Actualizando...") : t("settings.plugins.updateAllBtn", "Actualizar Todos")}</span>
          </button>
        </div>
      )}

      {/* TOP BAR: SCOPE FILTER AND SEARCH */}
      <div className="onicord-settings-card space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Scope Pills */}
          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-onicord-base/60 border border-white/5 shrink-0 overflow-x-auto">
            <button
              type="button"
              onClick={() => setScopeFilter("all")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                scopeFilter === "all"
                  ? "bg-onicord-accent text-onicord-dark shadow-sm"
                  : "text-onicord-muted hover:text-onicord-text hover:bg-white/5"
              }`}
            >
              <span>{t("common.all", "Todos")}</span>
              <span className="text-[10px] opacity-75">({allMergedPlugins.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setScopeFilter("server")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                scopeFilter === "server"
                  ? "bg-sky-500 text-black shadow-sm"
                  : "text-onicord-muted hover:text-sky-300 hover:bg-white/5"
              }`}
            >
              <MaterialIcon name="groups" size={14} />
              <span>{t("plugins.scope.server", "Servidor")}</span>
            </button>

            <button
              type="button"
              onClick={() => setScopeFilter("client")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                scopeFilter === "client"
                  ? "bg-purple-500 text-white shadow-sm"
                  : "text-onicord-muted hover:text-purple-300 hover:bg-white/5"
              }`}
            >
              <MaterialIcon name="dashboard" size={14} />
              <span>{t("plugins.scope.client", "Personal")}</span>
            </button>

            <button
              type="button"
              onClick={() => setScopeFilter("hybrid")}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                scopeFilter === "hybrid"
                  ? "bg-amber-500 text-black shadow-sm"
                  : "text-onicord-muted hover:text-amber-300 hover:bg-white/5"
              }`}
            >
              <MaterialIcon name="hub" size={14} />
              <span>{t("plugins.scope.hybrid", "Híbrido")}</span>
            </button>
          </div>

          {/* Search field */}
          <div className="relative flex-1 min-w-[180px]">
            <MaterialIcon
              name="search"
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-onicord-muted pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("common.search", "Buscar...")}
              className="onicord-input h-10 pl-9 pr-8 text-xs placeholder:text-onicord-muted/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-onicord-muted hover:text-white transition cursor-pointer p-0.5"
              >
                <MaterialIcon name="close" size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Unified plugins library */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="onicord-settings-section-title mb-0 flex items-center gap-2">
            <span>{t("settings.plugins.title", "Complementos")}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-onicord-muted font-semibold">
              {filteredPlugins.length}
            </span>
          </h3>
          <p className="text-xs text-onicord-muted hidden sm:block">
            {t("settings.plugins.unifiedSubtitle", "Explora, instala y administra tus complementos")}
          </p>
        </div>

        {loading && loadingCatalog ? (
          <div className="py-8 text-center text-onicord-muted text-xs flex items-center justify-center gap-2">
            <span className="loading loading-spinner loading-sm"></span>
            <span>{t("settings.plugins.loadingLocal", "Cargando complementos...")}</span>
          </div>
        ) : filteredPlugins.length === 0 ? (
          <div className="py-8 text-center border-2 border-dashed border-white/5 rounded-2xl p-4">
            <MaterialIcon
              name="extension"
              size={36}
              className="mx-auto text-onicord-muted/30 mb-2"
            />
            <p className="text-xs text-onicord-muted italic">
              {allMergedPlugins.length === 0
                ? t("settings.plugins.noCatalogPlugins", "No hay complementos disponibles.")
                : t("settings.plugins.noMatchingPlugins", "No se encontraron complementos con el filtro seleccionado.")}
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5 pt-1">
            {filteredPlugins.map((plugin) => {
              const isExpanded = expandedPluginId === plugin.id;
              const meta = getPluginLocalizedMeta(plugin, i18n.language);
              const name = meta.name;
              const description =
                meta.description || t("common.noDescription", "Sin descripción disponible.");

              const scope = getPluginScope(plugin);
              const scopeInfo = getScopeBadgeInfo(scope, t);

              const isInstalled = Boolean(plugin.isInstalled);
              const catalogEntry = plugin.catalogEntry || catalogPlugins.find((cp) => cp.id === plugin.id);
              const hasUpdate =
                isInstalled && catalogEntry && isNewerVersion(catalogEntry.version, plugin.version);
              const isDownloading = downloadingId === plugin.id;

              return (
                <li
                  key={plugin.id}
                  className={`flex flex-col bg-onicord-base/40 border border-white/5 p-3.5 rounded-2xl transition-colors hover:border-white/10 ${
                    isInstalled && plugin.enabled === false ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 w-full">
                    {/* Main Icon */}
                    <div className="w-8 h-8 rounded-full bg-onicord-accent/10 text-onicord-accent flex items-center justify-center shrink-0 overflow-hidden">
                      {plugin.icon && !failedIcons[plugin.id] ? (
                        <img
                          src={plugin.icon}
                          alt=""
                          className="w-full h-full object-cover rounded-xl"
                          onError={() =>
                            setFailedIcons((prev) => ({ ...prev, [plugin.id]: true }))
                          }
                        />
                      ) : (
                        <MaterialIcon name="extension" size={18} />
                      )}
                    </div>

                    {/* Name, Scope and Version */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-xs text-onicord-text truncate">
                          {name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/5 text-onicord-muted font-mono">
                          v{plugin.version || "1.0"}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md border flex items-center gap-1 font-semibold ${scopeInfo.badgeClass}`}
                          title={scopeInfo.description}
                        >
                          <MaterialIcon name={scopeInfo.icon} size={12} />
                          <span>{scopeInfo.label}</span>
                        </span>
                        {plugin.author && (
                          <span className="text-[10px] text-onicord-muted/70 truncate hidden md:inline">
                            por {plugin.author}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-onicord-muted truncate mt-0.5">
                        {description}
                      </p>
                    </div>

                    {/* Update button if newer version exists */}
                    {hasUpdate && (
                      <button
                        type="button"
                        onClick={() => handleInstallFromCatalog(catalogEntry)}
                        disabled={isDownloading}
                        className="px-3 py-1.5 rounded-onicord-button bg-amber-500 text-black text-xs font-bold hover:opacity-90 transition flex items-center gap-1 shrink-0 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                        title={t("settings.plugins.updateAvailableTooltip", "Actualizar de v{{current}} a v{{latest}}", {
                          current: plugin.version || "1.0",
                          latest: catalogEntry.version,
                        })}
                      >
                        <MaterialIcon
                          name={isDownloading ? "sync" : "update"}
                          size={14}
                          className={isDownloading ? "animate-spin" : ""}
                        />
                        <span>{isDownloading ? t("common.updating", "Actualizando...") : t("common.update", "Actualizar")}</span>
                      </button>
                    )}

                    {/* Security / Permissions button */}
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedPluginId(isExpanded ? null : plugin.id)
                      }
                      className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors shrink-0 cursor-pointer ${
                        isExpanded
                          ? "bg-onicord-accent/20 text-onicord-accent"
                          : "hover:bg-white/10 text-onicord-muted hover:text-onicord-accent"
                      }`}
                      title={t("settings.plugins.detailsAndConfig", "Detalles y Configuración del complemento")}
                    >
                      <MaterialIcon name="shield" size={16} />
                    </button>

                    {/* Action Icon Button: Delete if installed, Download if not installed */}
                    {isInstalled ? (
                      <button
                        type="button"
                        onClick={() =>
                          setPluginToDelete({
                            id: plugin.id,
                            dirName: plugin.dirName,
                            name: plugin.name,
                          })
                        }
                        className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-onicord-danger/20 text-onicord-muted hover:text-onicord-danger transition-colors shrink-0 cursor-pointer"
                        title={t("settings.plugins.uninstallApp", "Eliminar complemento del equipo")}
                      >
                        <Delete size="base" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleInstallFromCatalog(catalogEntry || plugin)}
                        disabled={isDownloading}
                        className="w-8 h-8 flex items-center justify-center rounded-xl bg-onicord-accent/10 hover:bg-onicord-accent/25 text-onicord-accent transition-colors shrink-0 cursor-pointer disabled:opacity-50"
                        title={t("settings.plugins.installApp", "Instalar complemento")}
                      >
                        <MaterialIcon
                          name={isDownloading ? "sync" : "download"}
                          size={18}
                          className={isDownloading ? "animate-spin" : ""}
                        />
                      </button>
                    )}

                    {/* Global Enable / Disable toggle slider (only if installed) */}
                    {isInstalled && (
                      <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                        <input
                          type="checkbox"
                          checked={plugin.enabled !== false}
                          onChange={() =>
                            handleToggle(plugin.id, plugin.enabled !== false)
                          }
                          className="sr-only peer"
                        />
                        <div className="onicord-toggle-slider" />
                      </label>
                    )}
                  </div>

                  {/* Security and permissions inspection drawer */}
                  {isExpanded && (
                    <div className="w-full mt-3 p-4 bg-onicord-surface/80 border border-white/5 rounded-xl animate-fade-in space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-white/5">
                        <p className="font-bold text-onicord-accent uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                          <MaterialIcon name="verified_user" size={14} />
                          <span>{t("settings.plugins.securityInfo", "Información y Permisos de Seguridad")}</span>
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-onicord-muted font-mono">
                            ID: {plugin.id}
                          </span>
                          {!isInstalled && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-onicord-accent/10 border border-onicord-accent/20 text-onicord-accent font-semibold">
                              {t("settings.plugins.notInstalledBadge", "Disponible en catálogo")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2 text-left">
                        <p className="text-xs text-onicord-text font-medium">
                          {t("settings.plugins.fullDesc", "Descripción completa:")}
                        </p>
                        <p className="text-xs text-onicord-muted bg-black/20 p-2.5 rounded-lg border border-white/5">
                          {description}
                        </p>

                        <div className="pt-2">
                          <p className="text-xs text-onicord-text font-medium mb-1.5">
                            {t("settings.plugins.permissionsReq", "Permisos solicitados:")}
                          </p>
                          {plugin.permissions && plugin.permissions.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {plugin.permissions.map((perm) => {
                                let badgeStyle = "bg-white/5 border-white/10 text-onicord-muted";
                                if (perm === "network.outbound")
                                  badgeStyle = "bg-amber-500/10 border-amber-500/30 text-amber-300";
                                else if (
                                  perm.startsWith("user.") ||
                                  perm.startsWith("server.")
                                )
                                  badgeStyle = "bg-sky-500/10 border-sky-500/30 text-sky-300";
                                else if (
                                  perm.startsWith("audio.") ||
                                  perm.startsWith("gaming.")
                                )
                                  badgeStyle = "bg-purple-500/10 border-purple-500/30 text-purple-300";
                                else if (perm.startsWith("chat."))
                                  badgeStyle = "bg-emerald-500/10 border-emerald-500/30 text-emerald-300";
                                else if (perm.startsWith("p2p."))
                                  badgeStyle = "bg-indigo-500/10 border-indigo-500/30 text-indigo-300";

                                return (
                                  <span
                                    key={perm}
                                    className={`text-[10px] px-2 py-0.5 rounded-md font-mono border ${badgeStyle}`}
                                  >
                                    {perm}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-xs text-onicord-muted italic">
                              {t("settings.plugins.noSpecialPermissions", "Este complemento no requiere permisos especiales.")}
                            </p>
                          )}
                        </div>

                        {plugin.hash && (
                          <div className="pt-2 flex items-center gap-2 text-[10px] text-onicord-muted/60 font-mono">
                            <span>{t("settings.plugins.sha256Hash", "Hash SHA-256:")}</span>
                            <span className="truncate max-w-[280px]">
                              {plugin.hash}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* SECCIÓN DE PREFERENCIAS DE COMPLEMENTOS */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.plugins.preferencesTitle", "Preferencias")}</span>
        </h3>
        <div>
          <div className="onicord-settings-row transition-all">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.plugins.autoUpdateTitle", "Actualización automática de complementos")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.plugins.autoUpdateDesc", "Mantiene tus complementos actualizados en segundo plano y los recarga sin reiniciar.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={autoUpdatePlugins}
                onChange={handleToggleAutoUpdate}
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>
        </div>
      </div>

      {/* CARD 3: ADVANCED ACTIONS / IMPORT AND PACK */}
      <div className="onicord-settings-card flex flex-col sm:flex-row items-center gap-3">
        <button
          type="button"
          onClick={handleImportPackage}
          disabled={isImporting}
          className="onicord-btn-secondary w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 rounded-2xl border border-white/10 hover:bg-onicord-surface transition cursor-pointer"
        >
          <IconAdd size="sm" />
          <span>
            {isImporting
              ? t("settings.plugins.loadingPackage", "Cargando paquete...")
              : t("settings.plugins.loadLocalPackage", "Cargar paquete local (.onipkg)")}
          </span>
        </button>

        <button
          type="button"
          onClick={handlePackFolder}
          className="onicord-btn-secondary w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 rounded-2xl border border-white/10 hover:bg-onicord-surface transition cursor-pointer"
        >
          <MaterialIcon name="archive" size={16} />
          <span>{t("settings.plugins.packPluginFolder", "Empaquetar carpeta de complemento")}</span>
        </button>
      </div>

      {/* DISK UNINSTALL CONFIRMATION MODAL */}
      {pluginToDelete && (
        <ConfirmDialogModal
          isOpen={Boolean(pluginToDelete)}
          title={t("settings.plugins.deleteTitle", "Eliminar Complemento")}
          message={t(
            "settings.plugins.deleteConfirm",
            "¿Estás seguro de que deseas desinstalar el complemento \"{{name}}\" de tu equipo? Se eliminarán los archivos locales de tu disco.",
            { name: pluginToDelete.name }
          )}
          confirmLabel={t("common.delete", "Eliminar")}
          cancelLabel={t("common.cancel", "Cancelar")}
          onCancel={() => setPluginToDelete(null)}
          onConfirm={() => {
            handleUninstall(pluginToDelete, pluginToDelete.name);
            setPluginToDelete(null);
          }}
        />
      )}
    </div>
  );
}
