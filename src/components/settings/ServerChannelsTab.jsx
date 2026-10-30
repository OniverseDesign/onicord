import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ModalInput } from "../ui/ModalShell";
import { IconTag, IconVolumeUp, Delete, IconAdd } from "../icons/StreamIcons";
import MaterialIcon from "../icons/MaterialIcon";

function hexToRgba(hex, alpha = 0.25) {
  if (!hex) return `rgba(255, 255, 255, ${alpha})`;
  if (hex.startsWith("rgba") || hex.startsWith("rgb")) return hex;
  let c = hex.replace("#", "");
  if (c.length === 3) {
    c = c.split("").map((x) => x + x).join("");
  }
  const num = parseInt(c, 16);
  if (isNaN(num)) return `rgba(255, 255, 255, ${alpha})`;
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

export default function ServerChannelsTab({
  channels,
  roles = [],
  updateChannelById,
  removeChannelById,
  addChannel,
  handleDragStart,
  handleDragOver,
  handleDropChannel,
  handleDropCategory,
}) {
  const { t } = useTranslation();
  const isCategoryNode = (c) =>
    c.type === "category" || String(c.id).startsWith("cat-");
  const categories = channels.filter(isCategoryNode);
  const orphans = channels.filter((c) => !isCategoryNode(c) && !c.parentId);

  return (
    <div className="onicord-settings-container">
      {/* TAB HEADER */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title !mb-0">
          <span>{t("serverSettings.tabs.channels", "Estructura de Canales y Categorías")}</span>
        </h3>
        <p className="onicord-settings-row-desc">
          {t("serverSettings.channels.dragHelp", "Organiza y arrastra tus canales de texto y voz. Administra permisos de privacidad por rol.")}
        </p>
      </div>

      {/* UNCATEGORIZED / ORPHAN CHANNELS */}
      <div
        onDragOver={handleDragOver}
        onDrop={(e) => handleDropChannel(e, null, null)}
        className={`transition-all ${
          orphans.length === 0
            ? "min-h-[50px] border-2 border-dashed border-white/10 hover:border-onicord-accent/40 rounded-2xl flex items-center justify-center bg-onicord-base/30 p-4"
            : "onicord-settings-card"
        }`}
      >
        {orphans.length > 0 ? (
          <ChannelGroupEditor
            title={t("serverSettings.channels.orphanChannels", "Canales Sin Categoría")}
            parentCategoryId={null}
            channels={orphans}
            roles={roles}
            onUpdate={updateChannelById}
            onRemove={removeChannelById}
            onAddText={() => addChannel("text")}
            onAddVoice={() => addChannel("voice")}
            onDragStart={handleDragStart}
            onDropChannel={handleDropChannel}
            onDragOver={handleDragOver}
          />
        ) : (
          <span className="text-xs text-onicord-muted font-medium pointer-events-none">
            {t("serverSettings.channels.dragToOrphan", "Arrastra un canal aquí para quitarlo de su categoría")}
          </span>
        )}
      </div>

      {/* CATEGORIES */}
      {categories.map((cat) => {
        const catChannels = channels.filter((c) => c.parentId === cat.id);
        return (
          <div
            key={cat.id}
            draggable
            onDragStart={(e) => handleDragStart(e, "category", cat.id)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDropCategory(e, cat.id)}
            className="onicord-settings-card hover:border-white/10 transition-colors"
          >
            {/* Category Header */}
            <div className="flex items-center gap-2 bg-onicord-base/60 border border-white/5 p-2.5 rounded-xl cursor-grab active:cursor-grabbing group">
              <div className="text-onicord-muted opacity-40 group-hover:opacity-80 px-1 py-1 select-none flex flex-col gap-[3px] shrink-0">
                <div className="w-1 h-1 bg-current rounded-full" />
                <div className="w-1 h-1 bg-current rounded-full" />
                <div className="w-1 h-1 bg-current rounded-full" />
              </div>
              <span className="text-[10px] font-bold text-onicord-muted uppercase tracking-wider shrink-0 select-none">
                {t("serverSettings.channels.categoryLabel", "Categoría")}
              </span>
              <ModalInput
                value={cat.name}
                onChange={(e) =>
                  updateChannelById(cat.id, "name", e.target.value)
                }
                onMouseDown={(e) => e.stopPropagation()}
                className="max-w-[160px] py-1 text-xs bg-transparent border-none shadow-none focus:ring-0 px-1 cursor-text font-bold text-onicord-text"
              />
              <div className="flex-1" />
              
              <button
                type="button"
                onClick={() => addChannel("text", cat.id)}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-onicord-surface hover:bg-white/10 text-onicord-muted hover:text-white transition-colors shrink-0 cursor-pointer"
                title={t("serverSettings.channels.addChannel", "Añadir canal de texto")}
              >
                <IconTag size="sm" />
              </button>
              <button
                type="button"
                onClick={() => addChannel("voice", cat.id)}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-onicord-surface hover:bg-white/10 text-onicord-muted hover:text-white transition-colors shrink-0 cursor-pointer"
                title={t("serverSettings.channels.addVoiceChannel", "Añadir canal de voz")}
              >
                <IconVolumeUp size="sm" />
              </button>
              <button
                type="button"
                onClick={() => removeChannelById(cat.id)}
                onMouseDown={(e) => e.stopPropagation()}
                className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-onicord-danger/20 text-onicord-muted hover:text-onicord-danger transition-colors shrink-0 cursor-pointer"
                title={t("serverSettings.channels.deleteCategory", "Eliminar categoría")}
              >
                <Delete size="base" />
              </button>
            </div>

            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="cursor-default"
            >
              <ChannelGroupEditor
                parentCategoryId={cat.id}
                channels={catChannels}
                roles={roles}
                onUpdate={updateChannelById}
                onRemove={removeChannelById}
                onAddText={() => addChannel("text", cat.id)}
                onAddVoice={() => addChannel("voice", cat.id)}
                onDragStart={handleDragStart}
                onDropChannel={handleDropChannel}
                onDragOver={handleDragOver}
              />
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => addChannel("category")}
        className="onicord-btn-secondary w-full py-3 text-xs font-bold flex items-center justify-center gap-2 mt-2 rounded-2xl border border-white/10 hover:bg-onicord-surface transition cursor-pointer"
      >
        <IconAdd size="sm" /> {t("serverSettings.channels.addNewCategory", "Añadir nueva categoría")}
      </button>
    </div>
  );
}

function ChannelGroupEditor({
  title,
  channels,
  parentCategoryId,
  roles = [],
  onUpdate,
  onRemove,
  onAddText,
  onAddVoice,
  onDragStart,
  onDropChannel,
  onDragOver,
}) {
  const { t } = useTranslation();
  const [activeRoleMenuId, setActiveRoleMenuId] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (activeRoleMenuId === null) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveRoleMenuId(null);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activeRoleMenuId]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        {title && (
          <span className="text-xs font-bold text-onicord-muted uppercase tracking-wider">
            {title}
          </span>
        )}
        {!parentCategoryId && (
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onAddText}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-onicord-base hover:bg-onicord-overlay text-onicord-text border border-white/5 transition flex items-center gap-1 cursor-pointer"
            >
              <IconTag size="base" /> {t("serverSettings.channels.text", "Texto")}
            </button>
            <button
              type="button"
              onClick={onAddVoice}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-onicord-base hover:bg-onicord-overlay text-onicord-text border border-white/5 transition flex items-center gap-1 cursor-pointer"
            >
              <IconVolumeUp size="base" /> {t("serverSettings.channels.voice", "Voz")}
            </button>
          </div>
        )}
      </div>

      <ul className="space-y-2 min-h-[5px]">
        {channels.map((ch) => {
          const isPrivate = ch.isPrivate || false;
          const allowedRoles = ch.allowedRoles || [];

          return (
            <li
              key={ch.id}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                onDragStart(e, "channel", ch.id);
              }}
              onDragOver={onDragOver}
              onDrop={(e) => onDropChannel(e, parentCategoryId, ch.id)}
              className="flex flex-col bg-onicord-base/40 border border-white/5 p-2.5 rounded-xl cursor-grab active:cursor-grabbing hover:border-white/10 transition-colors group"
            >
              <div className="flex gap-3 items-center w-full">
                <div className="text-onicord-muted opacity-40 group-hover:opacity-80 px-1 py-1 select-none flex flex-col gap-[3px] shrink-0">
                  <div className="w-1 h-1 bg-current rounded-full" />
                  <div className="w-1 h-1 bg-current rounded-full" />
                  <div className="w-1 h-1 bg-current rounded-full" />
                </div>

                <span className="flex text-onicord-muted shrink-0 items-center">
                  {ch.type === "text" ? (
                    <IconTag size="lg" />
                  ) : (
                    <IconVolumeUp size="lg" />
                  )}
                </span>

                <ModalInput
                  value={ch.name}
                  onChange={(e) => onUpdate(ch.id, "name", e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="max-w-[150px] py-1 text-xs bg-transparent border-none shadow-none focus:ring-0 px-1 cursor-text font-semibold text-onicord-text"
                />

                <div className="flex-1" />

                <button
                  type="button"
                  onClick={() => onUpdate(ch.id, "isPrivate", !isPrivate)}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors shrink-0 cursor-pointer ${
                    isPrivate ? "text-amber-400" : "text-onicord-muted"
                  }`}
                  title={isPrivate ? t("serverSettings.channels.makePublic", "Hacer canal público") : t("serverSettings.channels.makePrivate", "Hacer canal privado")}
                >
                  <MaterialIcon name={isPrivate ? "lock" : "lock_open"} size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => onRemove(ch.id)}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-onicord-danger/20 text-onicord-muted hover:text-onicord-danger transition-colors shrink-0 cursor-pointer"
                  title={t("common.delete", "Eliminar canal")}
                >
                  <Delete size="base" />
                </button>
              </div>

              {isPrivate && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-full mt-2.5 pt-2 border-t border-white/5 space-y-1.5 animate-fade-in text-[11px] bg-black/20 p-2.5 rounded-lg cursor-default text-left"
                >
                  <p className="font-bold text-onicord-muted uppercase tracking-wider text-[9px]">
                    {t("serverSettings.channels.allowedRolesTitle", "Roles con Acceso Privado")}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {/* Role Badges */}
                    {allowedRoles.map((roleId) => {
                      const r = roles.find((role) => role.id === roleId);
                      if (!r) return null;
                      return (
                        <div
                          key={r.id}
                          onClick={() => {
                            const nextRoles = allowedRoles.filter((id) => id !== r.id);
                            onUpdate(ch.id, "allowedRoles", nextRoles);
                          }}
                          className="relative flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-transparent transition-all cursor-pointer hover:!bg-onicord-danger hover:!border-onicord-danger group/badge"
                          style={{
                            backgroundColor: hexToRgba(r.color, 0.25),
                            borderColor: hexToRgba(r.color, 0.4),
                          }}
                          title={t("serverSettings.channels.removeRoleHint", "Haz clic para quitar rol")}
                        >
                          <div className="flex items-center gap-1.5 transition-opacity duration-150 group-hover/badge:opacity-0">
                            <div
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: r.color }}
                            />
                            <span className="text-[11px] font-semibold text-onicord-text">
                              {r.name}
                            </span>
                          </div>

                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/badge:opacity-100 transition-opacity duration-150 text-white">
                            <Delete size="sm" />
                          </div>
                        </div>
                      );
                    })}

                    {/* Add Role Button */}
                    {roles.length > 0 && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveRoleMenuId(activeRoleMenuId === ch.id ? null : ch.id);
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-onicord-surface hover:bg-onicord-accent hover:text-onicord-dark text-onicord-muted transition-colors cursor-pointer"
                          title={t("serverSettings.roles.title", "Asignar rol")}
                        >
                          <IconAdd size="sm" />
                        </button>

                        {/* Desplegable de Roles */}
                        {activeRoleMenuId === ch.id && (
                          <div
                            ref={menuRef}
                            className="onicord-floating-menu w-52 left-0 top-8 z-[100] shadow-2xl p-2 space-y-1 text-left bg-onicord-base border border-white/10 rounded-xl"
                          >
                            <p className="text-[10px] font-bold uppercase tracking-wider text-onicord-muted px-2 py-1 border-b border-white/5">
                              {t("serverSettings.members.assignRoleTitle", "Asignar Rol al Canal")}
                            </p>
                            <div className="max-h-[160px] overflow-y-auto minimal-scrollbar space-y-1 pt-1">
                              {roles.map((r) => {
                                const hasRole = allowedRoles.includes(r.id);
                                return (
                                  <button
                                    key={r.id}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const nextRoles = hasRole
                                        ? allowedRoles.filter((id) => id !== r.id)
                                        : [...allowedRoles, r.id];
                                      onUpdate(ch.id, "allowedRoles", nextRoles);
                                    }}
                                    className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all hover:bg-white/10 cursor-pointer"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div
                                        className="w-2.5 h-2.5 rounded-full shrink-0"
                                        style={{ backgroundColor: r.color }}
                                      />
                                      <span
                                        className="font-semibold truncate"
                                        style={{ color: r.color }}
                                      >
                                        {r.name}
                                      </span>
                                    </div>
                                    {hasRole && (
                                      <MaterialIcon
                                        name="check"
                                        size={14}
                                        className="text-onicord-accent"
                                      />
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {roles.length === 0 && (
                      <p className="text-[10px] text-onicord-muted italic">
                        {t(
                          "serverSettings.channels.noRolesForPrivate",
                          "Sin roles creados. Solo administradores pueden ver este canal."
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
