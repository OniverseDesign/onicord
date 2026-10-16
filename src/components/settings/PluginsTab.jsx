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

export default function PluginsTab() {
  const { t, i18n } = useTranslation();
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedPluginId, setExpandedPluginId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [pluginToDelete, setPluginToDelete] = useState(null);

  const [catalogPlugins, setCatalogPlugins] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
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
    setStatusMessage(null);
    let remoteFailed = false;

    try {
      if (window.electronAPI?.downloadAndInstallPlugin) {
        await window.electronAPI.downloadAndInstallPlugin(pluginId);
      }
    } catch (err) {
      console.warn("Descarga desde GitHub fallo. Probando selector local...", err);
      remoteFailed = true;
    }

    if (remoteFailed) {
      try {
        if (window.electronAPI?.installPluginDialog) {
          await window.electronAPI.installPluginDialog();
        }
      } catch (dialogErr) {
        console.error("Error al instalar complemento:", dialogErr);
      }
    }

    try {
      await loadPlugins();
      setStatusMessage({
        type: "success",
        text: t("settings.plugins.installSuccess", "Complemento instalado correctamente."),
      });
    } catch (e) {
      console.error("Error al recargar complementos:", e);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleImportPackage = async () => {
    setIsImporting(true);
    setStatusMessage(null);
    try {
      if (window.electronAPI?.installPluginDialog) {
        const res = await window.electronAPI.installPluginDialog();
        if (res?.success && res.manifest) {
          await loadPlugins();
          setStatusMessage({
            type: "success",
            text: t("settings.plugins.importSuccess", "Complemento '{{name}}' importado con éxito.", {
              name: res.manifest.name,
            }),
          });
        }
      }
    } catch (err) {
      console.error("Error importando paquete:", err);
      setStatusMessage({
        type: "error",
        text: err.message || t("settings.plugins.importError", "Error al importar el paquete."),
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handlePackFolder = async () => {
    try {
      if (window.electronAPI?.packPluginDialog) {
        const res = await window.electronAPI.packPluginDialog();
        if (res?.success) {
          setStatusMessage({
            type: "success",
            text: t("settings.plugins.packSuccess", "Complemento empaquetado con éxito."),
          });
        } else if (res?.error) {
          setStatusMessage({ type: "error", text: res.error });
        }
      }
    } catch (err) {
      setStatusMessage({ type: "error", text: err.message });
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
        const idToUse = typeof pluginTarget === "object" ? pluginTarget.id || pluginTarget.dirName : pluginTarget;
        const res = await window.electronAPI.uninstallPlugin(idToUse);
        if (res && res.error && typeof pluginTarget === "object" && pluginTarget.dirName && pluginTarget.dirName !== idToUse) {
          await window.electronAPI.uninstallPlugin(pluginTarget.dirName);
        }
        setStatusMessage({
          type: "info",
          text: t("settings.plugins.uninstallSuccess", "Complemento '{{name}}' eliminado de tu equipo.", {
            name: pluginName,
          }),
        });
        loadPlugins();
      }
    } catch (err) {
      console.error("Error eliminando complemento:", err);
    }
  };

  const filteredLocalPlugins = useMemo(() => {
    return plugins.filter((plugin) => {
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
        if (!matchesName && !matchesDesc && !matchesId) return false;
      }
      return true;
    });
  }, [plugins, scopeFilter, searchQuery, i18n.language]);

  const filteredCatalogPlugins = useMemo(() => {
    return catalogPlugins.filter((plugin) => {
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
        if (!matchesName && !matchesDesc && !matchesId) return false;
      }
      return true;
    });
  }, [catalogPlugins, scopeFilter, searchQuery, i18n.language]);

  return (
    <div className="onicord-settings-container space-y-4">
      {/* MENSAJE DE ESTADO GLOBAL */}
      {statusMessage && (
        <div
          className={`p-3 rounded-2xl text-xs flex items-center justify-between border ${
            statusMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
              : statusMessage.type === "error"
              ? "bg-rose-500/10 border-rose-500/25 text-rose-300"
              : "bg-sky-500/10 border-sky-500/25 text-sky-300"
          }`}
        >
          <div className="flex items-center gap-2">
            <MaterialIcon
              name={
                statusMessage.type === "success"
                  ? "check_circle"
                  : statusMessage.type === "error"
                  ? "error"
                  : "info"
              }
              size={16}
            />
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-white/40 hover:text-white transition cursor-pointer p-1"
          >
            <MaterialIcon name="close" size={14} />
          </button>
        </div>
      )}

      {/* BARRA SUPERIOR: FILTRO DE ÁMBITO Y BÚSQUEDA */}
      <div className="onicord-settings-card space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Pills de Ámbito */}
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
              <span className="text-[10px] opacity-75">({plugins.length})</span>
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

          {/* Campo de búsqueda */}
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
              className="w-full h-9 pl-9 pr-8 text-xs bg-onicord-base/60 border border-white/5 rounded-xl text-onicord-text placeholder:text-onicord-muted/60 focus:outline-none focus:border-onicord-accent transition"
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

      {/* TARJETA 1: BIBLIOTECA LOCAL EN TU EQUIPO */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="onicord-settings-section-title mb-0 flex items-center gap-2">
            <span>{t("settings.plugins.installedPlugins", "Complementos Instalados")}</span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/5 text-onicord-muted font-semibold">
              {filteredLocalPlugins.length}
            </span>
          </h3>
          <p className="text-xs text-onicord-muted hidden sm:block">
            {t("settings.plugins.localSubtitle", "Archivos instalados en tu computadora")}
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-center text-onicord-muted text-xs flex items-center justify-center gap-2">
            <span className="loading loading-spinner loading-sm"></span>
            <span>{t("settings.plugins.loadingLocal", "Cargando complementos locales...")}</span>
          </div>
        ) : filteredLocalPlugins.length === 0 ? (
          <div className="py-8 text-center border-2 border-dashed border-white/5 rounded-2xl p-4">
            <MaterialIcon
              name="extension"
              size={36}
              className="mx-auto text-onicord-muted/30 mb-2"
            />
            <p className="text-xs text-onicord-muted italic">
              {plugins.length === 0
                ? t("settings.plugins.noLocalPlugins", "No tienes complementos instalados en tu equipo. Descarga uno desde el catálogo oficial abajo o importa un paquete .onimod.")
                : t("settings.plugins.noMatchingPlugins", "No se encontraron complementos con el filtro seleccionado.")}
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5 pt-1">
            {filteredLocalPlugins.map((plugin) => {
              const isExpanded = expandedPluginId === plugin.id;
              const meta = getPluginLocalizedMeta(plugin, i18n.language);
              const name = meta.name;
              const description =
                meta.description || t("common.noDescription", "Sin descripción disponible.");

              const scope = getPluginScope(plugin);
              const scopeInfo = getScopeBadgeInfo(scope, t);

              // Comprobar si hay una actualización disponible en el catálogo de GitHub
              const catalogEntry = catalogPlugins.find((cp) => cp.id === plugin.id);
              const hasUpdate =
                catalogEntry && isNewerVersion(catalogEntry.version, plugin.version);
              const isUpdating = downloadingId === plugin.id;

              return (
                <li
                  key={plugin.id}
                  className={`flex flex-col bg-onicord-base/40 border border-white/5 p-3.5 rounded-2xl transition-colors hover:border-white/10 ${
                    plugin.enabled === false ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-center gap-3 w-full">
                    {/* Icono Principal */}
                    <div className="w-8 h-8 rounded-full bg-onicord-accent/10 text-onicord-accent flex items-center justify-center shrink-0 overflow-hidden">
                      {plugin.icon ? (
                        <img
                          src={plugin.icon}
                          alt=""
                          className="w-full h-full object-cover rounded-xl"
                        />
                      ) : (
                        <MaterialIcon name="extension" size={18} />
                      )}
                    </div>

                    {/* Nombre, Ámbito y Versión */}
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

                    {/* Botón Actualizar si hay nueva versión */}
                    {hasUpdate && (
                      <button
                        type="button"
                        onClick={() => handleInstallFromCatalog(catalogEntry)}
                        disabled={isUpdating}
                        className="px-3 py-1.5 rounded-onicord-button bg-amber-500 text-black text-xs font-bold hover:opacity-90 transition flex items-center gap-1 shrink-0 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                        title={t("settings.plugins.updateAvailableTooltip", "Actualizar de v{{current}} a v{{latest}}", {
                          current: plugin.version || "1.0",
                          latest: catalogEntry.version,
                        })}
                      >
                        <MaterialIcon
                          name={isUpdating ? "sync" : "update"}
                          size={14}
                          className={isUpdating ? "animate-spin" : ""}
                        />
                        <span>{isUpdating ? t("common.updating", "Actualizando...") : t("common.update", "Actualizar")}</span>
                      </button>
                    )}

                    {/* Botón Seguridad / Permisos */}
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

                    {/* Botón Desinstalar de la PC */}
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

                    {/* Interruptor Habilitar / Deshabilitar Globalmente */}
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
                  </div>

                  {/* INSPECTOR DESPLEGABLE DE SEGURIDAD Y PERMISOS */}
                  {isExpanded && (
                    <div className="w-full mt-3 p-4 bg-onicord-surface/80 border border-white/5 rounded-xl animate-fade-in space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-white/5">
                        <p className="font-bold text-onicord-accent uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                          <MaterialIcon name="verified_user" size={14} />
                          <span>{t("settings.plugins.securityInfo", "Información y Permisos de Seguridad")}</span>
                        </p>
                        <span className="text-[10px] text-onicord-muted font-mono">
                          ID: {plugin.id}
                        </span>
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

      {/* TARJETA 2: CATÁLOGO OFICIAL DE COMPLEMENTOS DESDE GITHUB */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="onicord-settings-section-title mb-0 flex items-center gap-2">
              <span>{t("settings.plugins.catalogTitle", "Catálogo Oficial de Complementos")}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-onicord-accent/15 text-onicord-accent font-semibold">
                {filteredCatalogPlugins.length}
              </span>
            </h3>
            <p className="text-xs text-onicord-muted mt-0.5">
              {t("settings.plugins.catalogSubtitle", "Descarga e instala nuevos complementos directamente a tu equipo desde el repositorio oficial de Onicord.")}
            </p>
          </div>
        </div>

        {loadingCatalog ? (
          <div className="py-8 text-center text-onicord-muted text-xs flex items-center justify-center gap-2">
            <span className="loading loading-spinner loading-xs"></span>
            <span>{t("settings.plugins.loadingCatalog", "Cargando catálogo oficial de complementos...")}</span>
          </div>
        ) : filteredCatalogPlugins.length === 0 ? (
          <div className="py-6 text-center border border-white/5 rounded-2xl p-4 bg-onicord-base/20">
            <p className="text-xs text-onicord-muted italic">
              {catalogPlugins.length === 0
                ? t("settings.plugins.noCatalogPlugins", "No hay complementos disponibles en el catálogo remoto.")
                : t("settings.plugins.noMatchingPlugins", "No se encontraron complementos con el filtro seleccionado.")}
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5 pt-1">
            {filteredCatalogPlugins.map((plugin) => {
              const localPlugin = plugins.find(
                (p) => p.id === plugin.id || p.dirName === plugin.id
              );
              const isLocallyInstalled = Boolean(localPlugin);
              const hasUpdate =
                isLocallyInstalled && isNewerVersion(plugin.version, localPlugin?.version);
              const isDownloading = downloadingId === plugin.id;

              const meta = getPluginLocalizedMeta(plugin, i18n.language);
              const scope = getPluginScope(plugin);
              const scopeInfo = getScopeBadgeInfo(scope, t);

              return (
                <li
                  key={plugin.id}
                  className="flex items-center gap-3 bg-onicord-base/40 border border-white/5 p-3 rounded-2xl hover:border-white/10 transition-colors"
                >
                  {/* Icono del complemento */}
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

                  {/* Detalles */}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-xs text-onicord-text truncate">
                        {meta.name}
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
                      {meta.description || t("common.noDescription", "Sin descripción disponible.")}
                    </p>
                  </div>

                  {/* Acciones del Catálogo */}
                  {hasUpdate ? (
                    <button
                      type="button"
                      onClick={() => handleInstallFromCatalog(plugin)}
                      disabled={isDownloading}
                      className="px-3.5 py-1.5 rounded-onicord-button bg-amber-500 text-black text-xs font-bold hover:opacity-90 transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                      title={t("settings.plugins.updateAvailableTooltip", "Actualizar de v{{current}} a v{{latest}}", {
                        current: localPlugin?.version || "1.0",
                        latest: plugin.version,
                      })}
                    >
                      <MaterialIcon
                        name={isDownloading ? "sync" : "update"}
                        size={15}
                        className={isDownloading ? "animate-spin" : ""}
                      />
                      <span>{isDownloading ? t("common.updating", "Actualizando...") : t("common.update", "Actualizar")}</span>
                    </button>
                  ) : isLocallyInstalled ? (
                    <div className="px-3 py-1.5 rounded-onicord-button bg-onicord-accent/10 border border-onicord-accent/20 text-onicord-accent text-xs font-semibold flex items-center gap-1.5 shrink-0 select-none">
                      <MaterialIcon name="check_circle" size={15} />
                      <span>{t("settings.plugins.alreadyInstalled", "Instalado")}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleInstallFromCatalog(plugin)}
                      disabled={isDownloading}
                      className="px-3.5 py-1.5 rounded-onicord-button bg-onicord-accent text-onicord-dark text-xs font-semibold hover:opacity-90 transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      <MaterialIcon
                        name={isDownloading ? "sync" : "download"}
                        size={15}
                        className={isDownloading ? "animate-spin" : ""}
                      />
                      <span>{isDownloading ? t("common.installing", "Instalando...") : t("common.install", "Instalar")}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* TARJETA 3: ACCIONES AVANZADAS / IMPORTAR Y EMPAQUETAR */}
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
              : t("settings.plugins.loadLocalPackage", "Cargar paquete local (.onimod)")}
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

      {/* MODAL DE CONFIRMACIÓN DE DESINSTALACIÓN FÍSICA EN DISCO */}
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
