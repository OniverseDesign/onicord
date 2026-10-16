import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import { Delete } from "../icons/StreamIcons";
import ConfirmDialogModal from "../modals/ConfirmDialogModal";
import {
  getPluginLocalizedMeta,
  getPluginScope,
  getScopeBadgeInfo,
} from "../../lib/pluginUtils";

export default function ServerPluginsTab({ server, onUpdateServer, onCloseSettings }) {
  const { t, i18n } = useTranslation();
  const [installedPlugins, setInstalledPlugins] = useState([]);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [expandedPluginId, setExpandedPluginId] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [pluginToUnlink, setPluginToUnlink] = useState(null);

  const refreshInstalledPlugins = async () => {
    setLoadingLocal(true);
    try {
      if (window.electronAPI?.listPlugins) {
        const list = await window.electronAPI.listPlugins();
        setInstalledPlugins(list || []);
      }
    } catch (e) {
      console.error("Error cargando complementos locales:", e);
    } finally {
      setLoadingLocal(false);
    }
  };

  useEffect(() => {
    refreshInstalledPlugins();
  }, []);

  const serverPlugins = server?.plugins || [];
  const availableLocalPlugins = installedPlugins.filter(
    (lp) => !serverPlugins.some((sp) => sp.id === lp.id || sp.id === lp.dirName)
  );

  const saveAndSyncPlugins = async (newPlugins) => {
    onUpdateServer({ ...server, plugins: newPlugins });
    const targetId = server.roomCode || server.id;
    if (window.electronAPI?.updateServerSettings && targetId) {
      try {
        await window.electronAPI.updateServerSettings(targetId, {
          plugins: newPlugins,
        });
      } catch (e) {
        console.error("Error al persistir complementos del servidor en Electron:", e);
      }
    }
  };

  const handleAddLocalPluginToServer = async (plugin) => {
    const pluginId = plugin.id || plugin.dirName;
    if (serverPlugins.some((sp) => sp.id === pluginId)) return;

    const updatedPlugins = [
      ...serverPlugins,
      {
        id: pluginId,
        name: plugin.name,
        description: plugin.description || "",
        version: plugin.version || "1.0",
        enabled: true,
        config: plugin.defaultConfig || {},
      },
    ];
    await saveAndSyncPlugins(updatedPlugins);
    setStatusMessage({
      type: "success",
      text: t(
        "serverSettings.plugins.pluginLinkedSuccess",
        "Complemento '{{name}}' vinculado al servidor con éxito.",
        { name: plugin.name }
      ),
    });
  };

  const handleToggleServerPlugin = (pluginId, currentEnabled) => {
    const updatedPlugins = serverPlugins.map((sp) =>
      sp.id === pluginId ? { ...sp, enabled: !currentEnabled } : sp
    );
    saveAndSyncPlugins(updatedPlugins);
  };

  const handleUnlinkServerPlugin = (pluginId, pluginName) => {
    const updatedPlugins = serverPlugins.filter((sp) => sp.id !== pluginId);
    saveAndSyncPlugins(updatedPlugins);
    setStatusMessage({
      type: "info",
      text: t(
        "serverSettings.plugins.pluginUnlinkedNotice",
        "Complemento '{{name}}' desvinculado de este servidor.",
        { name: pluginName }
      ),
    });
  };

  const handleUpdatePluginConfig = (pluginId, key, value) => {
    const updatedPlugins = serverPlugins.map((sp) => {
      if (sp.id === pluginId) {
        return {
          ...sp,
          config: {
            ...(sp.config || {}),
            [key]: value,
          },
        };
      }
      return sp;
    });
    saveAndSyncPlugins(updatedPlugins);
  };

  const handleNavigateToGlobalStore = () => {
    if (typeof onCloseSettings === "function") {
      onCloseSettings();
    }
    window.dispatchEvent(
      new CustomEvent("onicord:open-app-settings", { detail: { section: "plugins" } })
    );
  };

  return (
    <div className="onicord-settings-container space-y-3">
      {/* MENSAJE DE ESTADO */}
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
              name={statusMessage.type === "success" ? "check_circle" : "info"}
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

      {/* TARJETA 1: COMPLEMENTOS ACTIVOS EN ESTE SERVIDOR */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="onicord-settings-section-title mb-0 flex items-center gap-2">
            <span>
              {t("serverSettings.plugins.title", "Complementos del Servidor ({{count}})", {
                count: serverPlugins.length,
              })}
            </span>
          </h3>
          {serverPlugins.length > 3 && (
            <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
              <MaterialIcon name="warning" size={14} />
              <span>{t("serverSettings.plugins.warningMany", "Muchos complementos pueden afectar el rendimiento.")}</span>
            </span>
          )}
        </div>

        {serverPlugins.length === 0 ? (
          <div className="py-8 text-center border border-white/5 rounded-2xl p-4 bg-onicord-base/20">
            <MaterialIcon
              name="extension"
              size={32}
              className="mx-auto text-onicord-muted/40 mb-2"
            />
            <p className="text-xs text-onicord-muted italic">
              {t("serverSettings.plugins.noServerPlugins", "No hay complementos agregados a este servidor.")}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {serverPlugins.map((sp) => {
              const installedMeta = installedPlugins.find((p) => p.id === sp.id) || {};
              const pluginObj = { ...installedMeta, ...sp };
              const meta = getPluginLocalizedMeta(pluginObj, i18n.language);
              const name = meta.name || sp.id;
              const description =
                meta.description || t("common.noDescription", "Sin descripción disponible.");
              const isExpanded = expandedPluginId === sp.id;

              const scope = getPluginScope(pluginObj);
              const scopeInfo = getScopeBadgeInfo(scope, t);
              const customSchema = installedMeta.configSchema || [];

              return (
                <li
                  key={sp.id}
                  className="flex flex-col bg-onicord-base/60 border border-white/5 p-3 rounded-2xl hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3 w-full">
                    {/* Icono Principal */}
                    <div className="w-8 h-8 rounded-full bg-onicord-accent/10 text-onicord-accent flex items-center justify-center shrink-0 overflow-hidden">
                      {sp.icon || installedMeta.icon ? (
                        <img
                          src={sp.icon || installedMeta.icon}
                          alt=""
                          className="w-full h-full object-cover rounded-xl"
                        />
                      ) : (
                        <MaterialIcon name="extension" size={16} />
                      )}
                    </div>

                    {/* Nombre, Ámbito y Descripción */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-xs text-onicord-text truncate">
                          {name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/5 text-onicord-muted font-mono">
                          v{sp.version || installedMeta.version || "1.0"}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-md border flex items-center gap-1 font-semibold ${scopeInfo.badgeClass}`}
                          title={scopeInfo.description}
                        >
                          <MaterialIcon name={scopeInfo.icon} size={12} />
                          <span>{scopeInfo.label}</span>
                        </span>
                      </div>
                      <p className="text-[11px] text-onicord-muted truncate mt-0.5">
                        {description}
                      </p>
                    </div>

                    {/* Botón Engranaje de Configuración de la Sala */}
                    <button
                      type="button"
                      onClick={() => setExpandedPluginId(isExpanded ? null : sp.id)}
                      className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors shrink-0 cursor-pointer ${
                        isExpanded
                          ? "bg-onicord-accent/20 text-onicord-accent"
                          : "hover:bg-white/10 text-onicord-muted hover:text-onicord-accent"
                      }`}
                      title={t("serverSettings.plugins.configTitle", "Configuración del complemento")}
                    >
                      <MaterialIcon name="tune" size={16} />
                    </button>

                    {/* Botón Desvincular del Servidor */}
                    <button
                      type="button"
                      onClick={() => setPluginToUnlink({ id: sp.id, name })}
                      className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-onicord-danger/20 text-onicord-muted hover:text-onicord-danger transition-colors shrink-0 cursor-pointer"
                      title={t("serverSettings.plugins.unlinkFromServer", "Desvincular del servidor")}
                    >
                      <MaterialIcon name="link_off" size={18} />
                    </button>

                    {/* Interruptor Habilitar / Deshabilitar en esta sala */}
                    <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                      <input
                        type="checkbox"
                        checked={sp.enabled !== false}
                        onChange={() =>
                          handleToggleServerPlugin(sp.id, sp.enabled !== false)
                        }
                        className="sr-only peer"
                      />
                      <div className="onicord-toggle-slider" />
                    </label>
                  </div>

                  {/* SECCIÓN DESPLEGABLE DE CONFIGURACIÓN DEL COMPLEMENTO EN ESTA SALA */}
                  {isExpanded && (
                    <div className="w-full mt-3 p-3.5 bg-onicord-surface/80 border border-white/5 rounded-xl animate-fade-in space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-white/5">
                        <p className="font-bold text-onicord-accent uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                          <MaterialIcon name="tune" size={14} />
                          <span>{t("serverSettings.plugins.settingsFor", "Ajustes: {{name}}", { name })}</span>
                        </p>
                        <span className="text-[10px] text-onicord-muted font-mono">
                          ID: {sp.id}
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {/* Configuración Estándar: Prefijo */}
                        <div className="onicord-settings-row">
                          <div className="min-w-0 pr-4 text-left">
                            <p className="onicord-settings-row-title">
                              {t("serverSettings.plugins.prefixTitle", "Comando Prefijo / Alias")}
                            </p>
                            <p className="onicord-settings-row-desc">
                              {t("serverSettings.plugins.prefixDesc", "Prefijo para comandos de este complemento.")}
                            </p>
                          </div>
                          <input
                            type="text"
                            value={sp.config?.prefix || ""}
                            onChange={(e) =>
                              handleUpdatePluginConfig(sp.id, "prefix", e.target.value)
                            }
                            placeholder={t("serverSettings.plugins.prefixPlaceholder", "Ej. /g o /")}
                            className="w-32 h-8 px-2.5 text-xs bg-onicord-base/60 border border-white/10 rounded-xl text-onicord-text focus:outline-none focus:border-onicord-accent shrink-0"
                          />
                        </div>

                        {/* Configuración Estándar: Mostrar en Isla */}
                        <div className="onicord-settings-row">
                          <div className="min-w-0 pr-4 text-left">
                            <p className="onicord-settings-row-title">
                              {t("serverSettings.plugins.showInIslandTitle", "Mostrar en Isla de Complementos")}
                            </p>
                            <p className="onicord-settings-row-desc">
                              {t("serverSettings.plugins.showInIslandDesc", "Renderizar widget en el panel derecho de la sala.")}
                            </p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                            <input
                              type="checkbox"
                              checked={sp.config?.showInIsland !== false}
                              onChange={(e) =>
                                handleUpdatePluginConfig(
                                  sp.id,
                                  "showInIsland",
                                  e.target.checked
                                )
                              }
                              className="sr-only peer"
                            />
                            <div className="onicord-toggle-slider" />
                          </label>
                        </div>

                        {/* Campos de Configuración Personalizados declarados por el complemento */}
                        {customSchema.map((field) => {
                          const val = sp.config?.[field.key] ?? field.default ?? "";

                          if (field.type === "boolean") {
                            return (
                              <div key={field.key} className="onicord-settings-row">
                                <div className="min-w-0 pr-4 text-left">
                                  <p className="onicord-settings-row-title">{field.label}</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(val)}
                                    onChange={(e) =>
                                      handleUpdatePluginConfig(
                                        sp.id,
                                        field.key,
                                        e.target.checked
                                      )
                                    }
                                    className="sr-only peer"
                                  />
                                  <div className="onicord-toggle-slider" />
                                </label>
                              </div>
                            );
                          }

                          return (
                            <div key={field.key} className="onicord-settings-row">
                              <div className="min-w-0 pr-4 text-left">
                                <p className="onicord-settings-row-title">{field.label}</p>
                              </div>
                              <input
                                type={field.type === "number" ? "number" : "text"}
                                value={val}
                                onChange={(e) =>
                                  handleUpdatePluginConfig(
                                    sp.id,
                                    field.key,
                                    field.type === "number"
                                      ? Number(e.target.value)
                                      : e.target.value
                                  )
                                }
                                className="w-32 h-8 px-2.5 text-xs bg-onicord-base/60 border border-white/10 rounded-xl text-onicord-text focus:outline-none focus:border-onicord-accent shrink-0"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* TARJETA 2: COMPLEMENTOS DISPONIBLES EN TU BIBLIOTECA PARA VINCULAR */}
      {availableLocalPlugins.length > 0 && (
        <div className="onicord-settings-card">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="onicord-settings-section-title mb-0 flex items-center gap-2">
                <span>{t("serverSettings.plugins.localAvailableTitle", "Complementos en tu equipo")}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-onicord-accent/15 text-onicord-accent font-semibold">
                  {availableLocalPlugins.length}
                </span>
              </h3>
              <p className="text-xs text-onicord-muted mt-0.5">
                {t(
                  "serverSettings.plugins.localAvailableSubtitle",
                  "Estos complementos ya están descargados en tu equipo y puedes activarlos en este servidor con un solo clic."
                )}
              </p>
            </div>
          </div>

          <ul className="space-y-2">
            {availableLocalPlugins.map((plugin) => {
              const meta = getPluginLocalizedMeta(plugin, i18n.language);
              const scope = getPluginScope(plugin);
              const scopeInfo = getScopeBadgeInfo(scope, t);

              return (
                <li
                  key={plugin.id}
                  className="flex items-center justify-between gap-3 bg-onicord-base/60 border border-white/5 p-3 rounded-2xl hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
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
                    <div className="min-w-0 text-left">
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
                      </div>
                      <p className="text-[11px] text-onicord-muted truncate mt-0.5">
                        {meta.description || t("common.noDescription", "Sin descripción disponible.")}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleAddLocalPluginToServer(plugin)}
                    className="px-3.5 py-1.5 rounded-onicord-button bg-onicord-accent/15 border border-onicord-accent/30 text-onicord-accent hover:bg-onicord-accent hover:text-onicord-mantle text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm active:scale-95"
                  >
                    <MaterialIcon name="add_link" size={16} />
                    <span>{t("serverSettings.plugins.linkToServer", "Vincular a este servidor")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* TARJETA 3: ACCESO DIRECTO AL CATÁLOGO DE LA APP */}
      <div className="onicord-settings-card p-4 border border-dashed border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 bg-gradient-to-r from-onicord-base/60 to-onicord-surface/40">
        <div className="flex items-center gap-3 min-w-0 text-left">
          <div className="w-9 h-9 rounded-2xl bg-onicord-accent/10 border border-onicord-accent/20 text-onicord-accent flex items-center justify-center shrink-0">
            <MaterialIcon name="storefront" size={20} />
          </div>
          <div>
            <p className="text-xs font-bold text-onicord-text">
              {t("serverSettings.plugins.browseCatalogTitle", "¿Buscas más complementos?")}
            </p>
            <p className="text-[11px] text-onicord-muted mt-0.5">
              {t(
                "serverSettings.plugins.browseCatalogHint",
                "Explora, descarga e instala nuevos complementos desde el catálogo oficial en los Ajustes de la App."
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleNavigateToGlobalStore}
          className="onicord-btn-secondary px-4 py-2 text-xs font-bold flex items-center gap-1.5 rounded-xl border border-white/10 hover:border-onicord-accent/40 hover:text-onicord-accent transition cursor-pointer shrink-0"
        >
          <MaterialIcon name="open_in_new" size={15} />
          <span>{t("serverSettings.plugins.browseStore", "Abrir Catálogo en Ajustes")}</span>
        </button>
      </div>

      {/* MODAL DE CONFIRMACIÓN DE DESVINCULACIÓN (NO BORRA ARCHIVOS DE LA PC) */}
      {pluginToUnlink && (
        <ConfirmDialogModal
          isOpen={Boolean(pluginToUnlink)}
          title={t("serverSettings.plugins.unlinkTitle", "Desvincular Complemento")}
          message={t(
            "serverSettings.plugins.unlinkConfirm",
            "¿Estás seguro de que deseas desvincular el complemento \"{{name}}\" de este servidor? Permanecerá intacto en tu equipo para su uso en otros servidores o de forma personal.",
            { name: pluginToUnlink.name }
          )}
          confirmLabel={t("serverSettings.plugins.unlinkAction", "Desvincular")}
          cancelLabel={t("common.cancel", "Cancelar")}
          onCancel={() => setPluginToUnlink(null)}
          onConfirm={() => {
            handleUnlinkServerPlugin(pluginToUnlink.id, pluginToUnlink.name);
            setPluginToUnlink(null);
          }}
        />
      )}
    </div>
  );
}
