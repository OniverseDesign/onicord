import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";

export default function PluginBannerNotice({ serverPlugins = [] }) {
  const { t } = useTranslation();
  const [missingPlugins, setMissingPlugins] = useState([]);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!serverPlugins || serverPlugins.length === 0 || dismissed) return;

    if (window.electronAPI?.listPlugins) {
      window.electronAPI.listPlugins().then((localPlugins) => {
        const localIds = new Set((localPlugins || []).map((p) => p.id));
        const missing = serverPlugins.filter((sp) => !localIds.has(sp.id || sp));
        setMissingPlugins(missing);
      });
    }
  }, [serverPlugins, dismissed]);

  if (dismissed || missingPlugins.length === 0) {
    return null;
  }

  const handleInstallClick = async () => {
    setInstalling(true);
    let remoteFailed = false;

    try {
      // 1. Intentar descargar e instalar desatendidamente desde GitHub con timeout de 5s
      for (const plugin of missingPlugins) {
        const pluginId = typeof plugin === "string" ? plugin : plugin?.id;
        if (pluginId && window.electronAPI?.downloadAndInstallPlugin) {
          await window.electronAPI.downloadAndInstallPlugin(pluginId);
        }
      }
    } catch (err) {
      console.warn("⚠️ Descarga remota desde GitHub falló o expiró el tiempo límite. Activando selector local...", err);
      remoteFailed = true;
    }

    // 2. Seguro: Si falló la descarga remota/timeout, abrir diálogo de instalación local
    if (remoteFailed) {
      try {
        if (window.electronAPI?.installPluginDialog) {
          await window.electronAPI.installPluginDialog();
        }
      } catch (dialogErr) {
        console.error("Error abriendo diálogo de instalación local:", dialogErr);
      }
    }

    // 3. Recargar lista local tras la instalación
    try {
      if (window.electronAPI?.listPlugins) {
        const localPlugins = await window.electronAPI.listPlugins();
        const localIds = new Set((localPlugins || []).map((p) => p.id));
        const missing = serverPlugins.filter((sp) => !localIds.has(sp.id || sp));
        setMissingPlugins(missing);
      }
    } catch (reloadErr) {
      console.error("Error recargando complementos locales:", reloadErr);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="mx-4 my-2.5 p-3.5 rounded-onicord-button bg-onicord-mantle/80 backdrop-blur-md border border-onicord-accent/30 shadow-onicord-elevated flex items-center justify-between gap-4 text-xs animate-fade-in select-none">
      <div className="flex items-center gap-3.5 min-w-0">
        {/* Badge de icono de complemento */}
        <div className="w-10 h-10 rounded-xl bg-onicord-accent/15 border border-onicord-accent/25 text-onicord-accent flex items-center justify-center shrink-0 shadow-inner">
          <MaterialIcon name="extension" size={22} className="animate-pulse" />
        </div>

        {/* Detalles del texto */}
        <div className="flex flex-col min-w-0">
          <h4 className="font-bold text-[13px] text-onicord-text flex items-center gap-1.5 truncate leading-snug">
            Este servidor sugiere {missingPlugins.length} complemento{missingPlugins.length > 1 ? "s" : ""}
          </h4>
          <p className="text-onicord-subtext text-[11px] leading-relaxed truncate">
            Puedes ingresar libremente. Instálalos si deseas acceder a sus funciones y widgets especiales.
          </p>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleInstallClick}
          disabled={installing}
          className="px-3.5 py-1.5 rounded-onicord-button bg-onicord-accent text-onicord-dark font-semibold text-[12px] hover:opacity-90 transition-all flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
        >
          <MaterialIcon name={installing ? "sync" : "download"} size={16} className={installing ? "animate-spin" : ""} />
          <span>{installing ? t("plugins.installing", "Instalando...") : t("plugins.installPlugin", "Instalar complemento")}</span>
        </button>

        <button
          onClick={() => setDismissed(true)}
          className="w-7 h-7 rounded-full flex items-center justify-center text-onicord-muted hover:text-onicord-text hover:bg-white/10 transition-colors cursor-pointer"
          title={t("common.dismissNotice", "Descartar aviso")}
        >
          <MaterialIcon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}
