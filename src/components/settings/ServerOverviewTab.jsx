import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { ModalInput } from "../ui/ModalShell";
import SmartAnimatedImage from "../ui/SmartAnimatedImage";
import MaterialIcon from "../icons/MaterialIcon";
import FlameBadge from "../ui/FlameBadge";
import { evaluateServerFlame } from "../../lib/flameService";

export default function ServerOverviewTab({
  name,
  setName,
  icon,
  setIcon,
  banner,
  setBanner,
  setError,
  disableFlameSystem = false,
  setDisableFlameSystem,
  groupByRoles = false,
  setGroupByRoles,
  allowExecutableFiles = false,
  setAllowExecutableFiles,
  readOnly = false,
  channels = [],
  server = null,
}) {
  const { t } = useTranslation();
  const iconInputRef = useRef(null);
  const bannerInputRef = useRef(null);

  const rawMembers = server?.savedMembers
    ? Object.values(server.savedMembers)
    : [];
  const serverFlame = evaluateServerFlame(server || {}, rawMembers);
  const realStreak = serverFlame?.serverStreak || 0;

  const handleIcon = (e) => {
    if (readOnly) return;
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    if (file.size > 512 * 1024) {
      setError(
        t(
          "serverSettings.overview.iconSizeError",
          "El icono no puede superar 512 KB",
        ),
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setIcon(reader.result);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleBanner = (e) => {
    if (readOnly) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const ALLOWED = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/svg+xml",
      "image/avif",
    ];
    if (!ALLOWED.includes(file.type) && !file.type.startsWith("image/")) {
      setError(
        t(
          "serverSettings.overview.bannerTypeError",
          "Formato no soportado. Usa JPG, PNG, GIF o WebP.",
        ),
      );
      e.target.value = "";
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(
        t(
          "serverSettings.overview.bannerSizeError",
          "La imagen de portada no puede superar 5 MB",
        ),
      );
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setBanner(reader.result);
      setError(null);
    };
    reader.onerror = () => {
      setError(
        t(
          "serverSettings.overview.fileReadError",
          "Error al leer el archivo.",
        ),
      );
    };
    reader.readAsDataURL(file);
    // Reset input so re-selecting the same file triggers onChange
    e.target.value = "";
  };

  const initial = name.trim()?.[0]?.toUpperCase() || "?";

  // Agrupamiento dinámico de categorías y canales reales
  const isCategoryNode = (c) =>
    c.type === "category" || String(c.id).startsWith("cat-");
  const categories = (channels || []).filter(isCategoryNode);
  const orphanChannels = (channels || []).filter(
    (c) => !isCategoryNode(c) && !c.parentId,
  );

  return (
    <div className="onicord-settings-container">
      {/* DISEÑO EN 2 COLUMNAS (6 y 6 DE ANCHO COMO INVITE TAB Y PROFILE TAB) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        {/* COLUMNA IZQUIERDA: CONFIGURACIONES DE EDICIÓN (6/12) */}
        <div className="md:col-span-6 space-y-4">
          {/* TARJETA 1: IDENTIDAD DEL SERVIDOR */}
          <div className="onicord-settings-card">
            <h3 className="onicord-settings-section-title">
              <span>
                {t(
                  "serverSettings.overview.title",
                  "Vista General del Servidor",
                )}
              </span>
            </h3>

            <div className="space-y-4 pt-1">
              {/* Nombre del Servidor */}
              <div>
                <label className="text-xs font-semibold text-onicord-text block mb-1.5">
                  {t(
                    "serverSettings.overview.serverName",
                    "Nombre del Servidor",
                  )}
                </label>
                <ModalInput
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={48}
                  disabled={readOnly}
                  className="h-10 text-xs"
                />
              </div>
            </div>
          </div>

          {/* TARJETA 2: COMPORTAMIENTO Y NAVEGACIÓN */}
          <div className="onicord-settings-card">
            <h3 className="onicord-settings-section-title">
              <span>
                {t(
                  "serverSettings.overview.behavior",
                  "Comportamiento del Servidor",
                )}
              </span>
            </h3>

            <div>
              {/* Deshabilitar Flamas */}
              <div className="onicord-settings-row">
                <div className="min-w-0 pr-4">
                  <p className="onicord-settings-row-title">
                    {t(
                      "serverSettings.overview.disableFlameSystem",
                      "Deshabilitar Sistema de Flamas",
                    )}
                  </p>
                  <p className="onicord-settings-row-desc">
                    {t(
                      "serverSettings.overview.disableFlameSystemHint",
                      "Oculta el contador de racha de actividad diaria en la cabecera.",
                    )}
                  </p>
                </div>
                <label
                  className={`relative inline-flex items-center select-none shrink-0 ${readOnly ? "cursor-default opacity-50" : "cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(disableFlameSystem)}
                    disabled={readOnly}
                    onChange={(e) => setDisableFlameSystem?.(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="onicord-toggle-slider" />
                </label>
              </div>

              {/* Agrupar por Roles */}
              <div className="onicord-settings-row">
                <div className="min-w-0 pr-4">
                  <p className="onicord-settings-row-title">
                    {t(
                      "serverSettings.overview.groupByRoles",
                      "Agrupar lista de miembros por roles",
                    )}
                  </p>
                  <p className="onicord-settings-row-desc">
                    {t(
                      "serverSettings.overview.groupByRolesHint",
                      "Divide a los participantes de la lista lateral según su jerarquía de rol.",
                    )}
                  </p>
                </div>
                <label
                  className={`relative inline-flex items-center select-none shrink-0 ${readOnly ? "cursor-default opacity-50" : "cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(groupByRoles)}
                    disabled={readOnly}
                    onChange={(e) => setGroupByRoles?.(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="onicord-toggle-slider" />
                </label>
              </div>

              {/* Permitir Archivos Ejecutables */}
              <div className="onicord-settings-row">
                <div className="min-w-0 pr-4">
                  <p className="onicord-settings-row-title">
                    {t(
                      "serverSettings.overview.allowExecutableFiles",
                      "Permitir archivos ejecutables (.exe, .bat, .js)",
                    )}
                  </p>
                  <p className="onicord-settings-row-desc">
                    {t(
                      "serverSettings.overview.allowExecutableFilesHint",
                      "Permite el envío y descarga de ejecutables. Se mostrarán advertencias de seguridad preventivas.",
                    )}
                  </p>
                </div>
                <label
                  className={`relative inline-flex items-center select-none shrink-0 ${readOnly ? "cursor-default opacity-50" : "cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(allowExecutableFiles)}
                    disabled={readOnly}
                    onChange={(e) => setAllowExecutableFiles?.(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="onicord-toggle-slider" />
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: VISTA PREVIA DEL SIDEBAR REAL (ROOMVIEW CHANNELS) (6/12) */}
        <div className="md:col-span-6">
          <div className="onicord-settings-card flex flex-col items-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-onicord-muted mb-3 flex items-center gap-1.5 self-start">
              <MaterialIcon name="visibility" size={14} />
              <span>
                {t("settings.theme.preview", "Vista Previa de la Sala")}
              </span>
            </span>

            {/* REPLICACIÓN FIEL DEL SIDEBAR DE ROOMVIEW */}
            <div className="w-full rounded-2xl bg-onicord-base/90 border border-white/5 overflow-hidden flex flex-col font-sans select-none shadow-xl min-h-[320px]">
              {/* Cabecera del Servidor - CONDICIONAL según banner */}
              {banner ? (
                /* === CON BANNER: Portada redondeada con padding + avatar grande solapando + nombre debajo === */
                <div>
                  {/* Banner con padding, bordes redondeados y overlay interactivo */}
                  <div className="px-2.5 pt-2.5 pb-0">
                    <div className="w-full h-[88px] rounded-xl overflow-hidden relative group">
                      <SmartAnimatedImage
                        src={banner}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                      {!readOnly && (
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => bannerInputRef.current?.click()}
                            className="px-3 py-1.5 rounded-xl bg-onicord-accent hover:bg-onicord-accent/80 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-transform hover:scale-105"
                            title={t(
                              "serverSettings.overview.changeBanner",
                              "Cambiar Portada",
                            )}
                          >
                            <MaterialIcon name="photo_camera" size={15} />
                            <span>
                              {t(
                                "serverSettings.overview.changeBanner",
                                "Cambiar Portada",
                              )}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setBanner(null)}
                            className="px-1.5 py-1.5 rounded-xl bg-onicord-danger hover:bg-onicord-danger/80 text-white text-xs font-bold flex items-center gap-1.5 shadow-md transition-transform hover:scale-105"
                            title={t(
                              "serverSettings.overview.removeBanner",
                              "Eliminar portada",
                            )}
                          >
                            <MaterialIcon name="delete" size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Avatar grande solapando el borde inferior del banner con overlay interactivo */}
                  <div className="px-5 -mt-7 relative z-10">
                    <div className="w-16 h-16 rounded-full border-[4px] border-onicord-base flex items-center justify-center bg-onicord-surface shadow-lg relative group">
                      <div
                        className="absolute inset-0 rounded-full overflow-hidden flex items-center justify-center cursor-pointer"
                        style={{ isolation: "isolate" }}
                        onClick={() => !readOnly && iconInputRef.current?.click()}
                        title={
                          !readOnly
                            ? t(
                                "serverSettings.overview.changeIcon",
                                "Cambiar Icono",
                              )
                            : undefined
                        }
                      >
                        {icon ? (
                          <SmartAnimatedImage
                            src={icon}
                            alt=""
                            className="w-full h-full object-cover group-hover:opacity-40 transition-opacity"
                            isAvatar
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-onicord-surface text-white font-bold text-base group-hover:opacity-40 transition-opacity">
                            {initial}
                          </div>
                        )}
                        {!readOnly && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                            <MaterialIcon
                              name="photo_camera"
                              size={20}
                              className="text-white"
                            />
                          </div>
                        )}
                      </div>

                      {/* Mini botón para eliminar icono si existe */}
                      {icon && !readOnly && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIcon(null);
                          }}
                          title={t("common.delete", "Eliminar icono")}
                          className="absolute -top-1 -right-1 z-20 w-6 h-6 rounded-full bg-onicord-danger hover:bg-onicord-danger/80 text-white flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MaterialIcon name="close" size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Nombre del servidor + Flama en la misma fila */}
                  <div className="flex items-center justify-between px-5 pt-2 pb-3">
                    <span
                      className="text-[15px] font-semibold text-white truncate max-w-[200px]"
                      title={name}
                    >
                      {name || "Servidor"}
                    </span>
                    {!disableFlameSystem && (
                      <FlameBadge days={realStreak} size="sm" isServer={true} />
                    )}
                  </div>
                </div>
              ) : (
                /* === SIN BANNER: Opción para subir portada + cabecera horizontal === */
                <div>
                  {/* Slot interactivo para añadir/subir portada directa si no tiene una */}
                  {!readOnly && (
                    <div className="px-2.5 pt-2.5 pb-0">
                      <div
                        onClick={() => bannerInputRef.current?.click()}
                        className="w-full h-[54px] rounded-xl border border-dashed border-white/15 hover:border-onicord-accent/50 bg-white/[0.02] hover:bg-white/[0.06] transition-all flex items-center justify-center gap-2 text-onicord-muted hover:text-white text-xs font-semibold cursor-pointer group"
                        title={t(
                          "serverSettings.overview.uploadBanner",
                          "Subir Portada",
                        )}
                      >
                        <MaterialIcon
                          name="wallpaper"
                          size={16}
                          className="text-onicord-accent group-hover:scale-110 transition-transform"
                        />
                        <span>
                          {t(
                            "serverSettings.overview.uploadBanner",
                            "Subir Portada",
                          )}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="h-[52px] border-b border-white/[0.04] px-3.5 flex items-center justify-between bg-black/10">
                    <div className="flex items-center min-w-0">
                      {/* Icono del Servidor REDONDEADO EN CÍRCULO con overlay interactivo */}
                      <div
                        className="relative w-8 h-8 rounded-full border border-white/10 overflow-hidden flex items-center justify-center shrink-0 bg-onicord-surface shadow-sm group cursor-pointer"
                        onClick={() => !readOnly && iconInputRef.current?.click()}
                        title={
                          !readOnly
                            ? t(
                                "serverSettings.overview.changeIcon",
                                "Cambiar Icono",
                              )
                            : undefined
                        }
                      >
                        {icon ? (
                          <SmartAnimatedImage
                            src={icon}
                            alt=""
                            className="w-full h-full object-cover group-hover:opacity-40 transition-opacity"
                            isAvatar
                          />
                        ) : (
                          <span className="text-white font-bold text-xs group-hover:opacity-40 transition-opacity">
                            {initial}
                          </span>
                        )}
                        {!readOnly && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/50">
                            <MaterialIcon
                              name="photo_camera"
                              size={14}
                              className="text-white"
                            />
                          </div>
                        )}
                        {icon && !readOnly && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIcon(null);
                            }}
                            title={t("common.delete", "Eliminar icono")}
                            className="absolute inset-0 z-20 opacity-0 group-hover:opacity-100 transition-opacity bg-onicord-danger hover:bg-onicord-danger/80 flex items-center justify-center text-white"
                          >
                            <MaterialIcon name="close" size={14} />
                          </button>
                        )}
                      </div>
                      {/* Nombre del Servidor */}
                      <span
                        className="text-[14px] font-bold text-white truncate ml-2.5 max-w-[130px]"
                        title={name}
                      >
                        {name || "Servidor"}
                      </span>
                    </div>

                    {/* Badge de Flamas Real */}
                    {!disableFlameSystem && (
                      <div className="shrink-0 flex items-center">
                        <FlameBadge days={realStreak} size="sm" isServer={true} />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Lista Dinámica de Categorías y Canales Reales */}
              <div className="flex-1 py-3 pl-1 pr-2 space-y-4 max-h-[260px] overflow-y-auto minimal-scrollbar">
                {/* Canales Huérfanos (sin categoría) */}
                {orphanChannels.length > 0 && (
                  <div className="space-y-0.5">
                    {orphanChannels.map((c, idx) => {
                      const isText = c.type === "text";
                      const isActive = idx === 0;
                      return (
                        <div
                          key={c.id}
                          className={`flex items-center gap-2 px-3 py-2 mx-2 rounded-xl text-xs font-medium cursor-default transition-colors ${
                            isActive
                              ? "bg-white/10 text-white font-semibold shadow-sm border border-white/5"
                              : "text-onicord-muted hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <MaterialIcon
                            name={isText ? "tag" : "volume_up"}
                            size={16}
                            className={
                              isActive ? "text-white/60" : "opacity-80"
                            }
                          />
                          <span className="truncate">{c.name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Categorías y sus Canales Reales */}
                {categories.length > 0 ? (
                  categories.map((cat) => {
                    const catChannels = (channels || []).filter(
                      (c) => c.parentId === cat.id,
                    );
                    return (
                      <div key={cat.id} className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold text-onicord-muted uppercase tracking-wider px-3 mb-1 cursor-pointer hover:text-white transition-colors duration-150">
                          <span className="truncate">{cat.name}</span>
                          <MaterialIcon
                            name="expand_more"
                            size={14}
                            className="opacity-80 shrink-0 ml-1"
                          />
                        </div>

                        <div className="space-y-0.5">
                          {catChannels.map((c, cIdx) => {
                            const isText = c.type === "text";
                            const isActive =
                              cIdx === 0 && orphanChannels.length === 0;
                            return (
                              <div
                                key={c.id}
                                className={`flex items-center gap-2 px-3 py-2 mx-2 rounded-xl text-xs font-medium cursor-default transition-colors ${
                                  isActive
                                    ? "bg-white/10 text-white font-semibold shadow-sm border border-white/5"
                                    : "text-onicord-muted hover:text-white hover:bg-white/5"
                                }`}
                              >
                                <MaterialIcon
                                  name={isText ? "tag" : "volume_up"}
                                  size={16}
                                  className={
                                    isActive ? "text-white/60" : "opacity-80"
                                  }
                                />
                                <span className="truncate">{c.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                ) : orphanChannels.length === 0 ? (
                  /* Canales de Muestra si no hay datos */
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-onicord-muted uppercase tracking-wider px-3 mb-1.5 cursor-pointer hover:text-white transition-colors duration-150">
                      <span>
                        {t("serverSettings.channels.textChannels", "Canales")}
                      </span>
                      <MaterialIcon
                        name="expand_more"
                        size={14}
                        className="opacity-80"
                      />
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 px-3 py-2 mx-2 rounded-xl bg-white/10 text-white font-semibold text-xs cursor-default shadow-sm border border-white/5">
                        <MaterialIcon
                          name="tag"
                          size={16}
                          className="text-white/60"
                        />
                        <span>
                          {t(
                            "serverSettings.channels.defaultTextChannelName",
                            "general",
                          )}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 px-3 py-2 mx-2 rounded-xl text-onicord-muted hover:text-white hover:bg-white/5 text-xs font-medium cursor-default transition-colors duration-100">
                        <MaterialIcon
                          name="volume_up"
                          size={16}
                          className="opacity-80"
                        />
                        <span>
                          {t(
                            "serverSettings.channels.defaultVoiceChannelName",
                            "Sala de voz",
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden file inputs for Icon and Banner */}
      {!readOnly && (
        <>
          <input
            ref={iconInputRef}
            type="file"
            accept="image/*"
            onChange={handleIcon}
            className="hidden"
          />
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/avif,image/*"
            onChange={handleBanner}
            className="hidden"
          />
        </>
      )}
    </div>
  );
}
