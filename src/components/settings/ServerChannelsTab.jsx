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
  afkSettings = { channelId: null, timeout: 300 },
  setAfkSettings,
  readOnly = false,
}) {
  const { t } = useTranslation();
  const isCategoryNode = (c) =>
    c.type === "category" || String(c.id).startsWith("cat-");
  const categories = channels.filter(isCategoryNode);
  const orphans = channels.filter((c) => !isCategoryNode(c) && !c.parentId);

  const afkTimeoutOptions = [
    { value: 60, label: t("serverSettings.channels.afkTimeout_1m", "1 minuto") },
    { value: 300, label: t("serverSettings.channels.afkTimeout_5m", "5 minutos") },
    { value: 900, label: t("serverSettings.channels.afkTimeout_15m", "15 minutos") },
    { value: 1800, label: t("serverSettings.channels.afkTimeout_30m", "30 minutos") },
    { value: 3600, label: t("serverSettings.channels.afkTimeout_1h", "1 hora") },
  ];

  return (
    <div className="onicord-settings-container">
      {/* TAB HEADER & CREATION BUTTONS */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="onicord-settings-section-title !mb-0.5">
              <span>{t("serverSettings.tabs.channels", "Estructura de Canales y Categorías")}</span>
            </h3>
            <p className="onicord-settings-row-desc !mb-0 text-xs">
              {t("serverSettings.channels.dragHelp", "Organiza y arrastra tus canales de texto y voz. Administra permisos de privacidad por rol.")}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 bg-onicord-base/40 p-1 rounded-2xl border border-white/5">
            <button
              type="button"
              onClick={() => addChannel("text")}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-onicord-surface hover:bg-white/10 text-onicord-muted hover:text-white transition-colors shrink-0 cursor-pointer"
              title={t("serverSettings.channels.addChannel", "Añadir canal de texto")}
            >
              <IconTag size="sm" />
            </button>
            <button
              type="button"
              onClick={() => addChannel("voice")}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-onicord-surface hover:bg-white/10 text-onicord-muted hover:text-white transition-colors shrink-0 cursor-pointer"
              title={t("serverSettings.channels.addVoiceChannel", "Añadir canal de voz")}
            >
              <IconVolumeUp size="sm" />
            </button>
            <button
              type="button"
              onClick={() => addChannel("forum")}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-onicord-surface hover:bg-white/10 text-onicord-muted hover:text-white transition-colors shrink-0 cursor-pointer"
              title={t("serverSettings.channels.addForumChannel", "Añadir canal de foro")}
            >
              <MaterialIcon name="forum" size={16} />
            </button>
            <button
              type="button"
              onClick={() => addChannel("afk")}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-onicord-surface hover:bg-white/10 text-onicord-muted hover:text-white transition-colors shrink-0 cursor-pointer"
              title={t("serverSettings.channels.addAfkBtn", "Añadir canal AFK")}
            >
              <MaterialIcon name="bedtime" size={16} />
            </button>
            <button
              type="button"
              onClick={() => addChannel("category")}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-onicord-surface hover:bg-white/10 text-onicord-muted hover:text-white transition-colors shrink-0 cursor-pointer"
              title={t("serverSettings.channels.addNewCategory", "Añadir nueva categoría")}
            >
              <MaterialIcon name="create_new_folder" size={16} />
            </button>
          </div>
        </div>
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
                maxLength={100}
                onChange={(e) =>
                  updateChannelById(cat.id, "name", e.target.value)
                }
                onMouseDown={(e) => e.stopPropagation()}
                placeholder={t("serverSettings.channels.categoryPlaceholder", "Categoría")}
                className="flex-1 min-w-[120px] max-w-xs sm:max-w-md py-1 text-xs bg-transparent border-none shadow-none focus:ring-0 px-1 cursor-text font-bold text-onicord-text"
              />
              <div className="flex-1" />

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
                afkChannelId={afkSettings?.channelId}
                afkSettings={afkSettings}
                setAfkSettings={setAfkSettings}
                afkTimeoutOptions={afkTimeoutOptions}
                onUpdate={updateChannelById}
                onRemove={removeChannelById}
                onDragStart={handleDragStart}
                onDropChannel={handleDropChannel}
                onDragOver={handleDragOver}
              />
            </div>
          </div>
        );
      })}

      {/* UNCATEGORIZED / ORPHAN CHANNELS (BELOW CATEGORIES) */}
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
            afkChannelId={afkSettings?.channelId}
            afkSettings={afkSettings}
            setAfkSettings={setAfkSettings}
            afkTimeoutOptions={afkTimeoutOptions}
            onUpdate={updateChannelById}
            onRemove={removeChannelById}
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
    </div>
  );
}

function ChannelGroupEditor({
  title,
  channels,
  parentCategoryId,
  roles = [],
  afkChannelId = null,
  afkSettings = null,
  setAfkSettings = null,
  afkTimeoutOptions = [],
  onUpdate,
  onRemove,
  onDragStart,
  onDropChannel,
  onDragOver,
}) {
  const { t } = useTranslation();
  const [activeRoleMenuId, setActiveRoleMenuId] = useState(null);
  const [activeSpeakMenuId, setActiveSpeakMenuId] = useState(null);
  const [openAfkChannelId, setOpenAfkChannelId] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (activeRoleMenuId === null && activeSpeakMenuId === null) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveRoleMenuId(null);
        setActiveSpeakMenuId(null);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activeRoleMenuId, activeSpeakMenuId]);

  return (
    <div>
      {title && (
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-bold text-onicord-muted uppercase tracking-wider">
            {title}
          </span>
        </div>
      )}

      <ul className="space-y-2 min-h-[5px]">
        {channels.map((ch) => {
          const isPrivate = ch.isPrivate || false;
          const allowedRoles = ch.allowedRoles || [];
          const hasSpeakRestrictions = ch.hasSpeakRestrictions || false;
          const disallowedSpeakRoles = ch.disallowedSpeakRoles || [];
          const isAfk = ch.id === afkChannelId;

          return (
            <li
              key={ch.id}
              draggable
              onDragStart={(e) => {
                if (
                  e.target.closest("input, button, select, .onicord-range-input") ||
                  e.target.tagName === "INPUT"
                ) {
                  e.preventDefault();
                  return;
                }
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

                <button
                  type="button"
                  onClick={() => {
                    if (ch.type === "text") onUpdate(ch.id, "type", "forum");
                    else if (ch.type === "forum") onUpdate(ch.id, "type", "text");
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`flex shrink-0 items-center p-1 rounded-lg transition-colors ${
                    ch.type !== "voice" ? "hover:bg-white/10 cursor-pointer" : "cursor-default opacity-80"
                  }`}
                  title={
                    ch.type === "text"
                      ? t("serverSettings.channels.changeToForum", "Canal de texto (haz clic para cambiar a foro)")
                      : ch.type === "forum"
                        ? t("serverSettings.channels.changeToText", "Canal de foro (haz clic para cambiar a texto)")
                        : isAfk
                          ? t("serverSettings.channels.afkBadge", "Canal AFK")
                          : t("serverSettings.channels.voice", "Canal de voz")
                  }
                >
                  {ch.type === "text" ? (
                    <IconTag size="lg" className="text-onicord-muted hover:text-onicord-accent transition-colors" />
                  ) : ch.type === "forum" ? (
                    <MaterialIcon name="forum" size={18} className="text-onicord-accent" />
                  ) : isAfk ? (
                    <MaterialIcon name="bedtime" size="lg" className="text-onicord-muted" />
                  ) : (
                    <IconVolumeUp size="lg" className="text-onicord-muted" />
                  )}
                </button>

                <ModalInput
                  value={ch.name}
                  maxLength={100}
                  onChange={(e) => onUpdate(ch.id, "name", e.target.value)}
                  onMouseDown={(e) => e.stopPropagation()}
                  placeholder={t("serverSettings.channels.channelPlaceholder", "nombre-del-canal")}
                  className="flex-1 min-w-[120px] max-w-xs sm:max-w-md py-1 text-xs bg-transparent border-none shadow-none focus:ring-0 px-1 cursor-text font-semibold text-onicord-text"
                />

                <div className="flex-1" />

                {isAfk ? (
                  <button
                    type="button"
                    onClick={() =>
                      setOpenAfkChannelId((prev) => (prev === ch.id ? null : ch.id))
                    }
                    onMouseDown={(e) => e.stopPropagation()}
                    className={`w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors shrink-0 cursor-pointer ${
                      openAfkChannelId === ch.id
                        ? "text-amber-400 bg-white/10"
                        : "text-onicord-muted hover:text-white"
                    }`}
                    title={t("serverSettings.channels.afkTimeoutLabel", "Tiempo límite de inactividad")}
                  >
                    <MaterialIcon name="schedule" size={16} />
                  </button>
                ) : (
                  <>
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
                      onClick={() => onUpdate(ch.id, "hasSpeakRestrictions", !hasSpeakRestrictions)}
                      onMouseDown={(e) => e.stopPropagation()}
                      className={`w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors shrink-0 cursor-pointer ${
                        hasSpeakRestrictions ? "text-amber-400" : "text-onicord-muted"
                      }`}
                      title={
                        hasSpeakRestrictions
                          ? t("serverSettings.channels.disableSpeakRestrictions", "Desactivar restricciones de habla (Permitir a todos)")
                          : ch.type === "voice"
                            ? t("serverSettings.channels.enableVoiceRestrictions", "Restringir quiénes pueden hablar (Modo solo oyentes)")
                            : t("serverSettings.channels.enableTextRestrictions", "Restringir quiénes pueden escribir (Modo solo lectura)")
                      }
                    >
                      <MaterialIcon
                        name={
                          ch.type === "voice"
                            ? hasSpeakRestrictions
                              ? "mic_off"
                              : "mic"
                            : hasSpeakRestrictions
                              ? "speaker_notes_off"
                              : "speaker_notes"
                        }
                        size={16}
                      />
                    </button>
                  </>
                )}

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

              {isAfk && openAfkChannelId === ch.id && (() => {
                const currentStepIdx = afkTimeoutOptions.findIndex(
                  (s) => s.value === (Number(afkSettings?.timeout) || 300)
                );
                const sliderIdx = currentStepIdx !== -1 ? currentStepIdx : 1;

                return (
                  <div
                    draggable={false}
                    onDragStart={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="w-full mt-2.5 pt-2 border-t border-white/5 space-y-2.5 animate-fade-in text-[11px] bg-black/20 p-2.5 rounded-lg cursor-default text-left select-none"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-onicord-muted uppercase tracking-wider text-[9px]">
                        {t("serverSettings.channels.afkTimeoutLabel", "Tiempo límite de inactividad")}
                      </p>
                      <span className="text-xs font-bold text-onicord-accent">
                        {afkTimeoutOptions[sliderIdx]?.label}
                      </span>
                    </div>

                    <div className="px-1 py-1">
                      <input
                        type="range"
                        draggable={false}
                        onDragStart={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        min={0}
                        max={afkTimeoutOptions.length - 1}
                        step={1}
                        value={sliderIdx}
                        onChange={(e) => {
                          const step = afkTimeoutOptions[Number(e.target.value)];
                          if (step) {
                            setAfkSettings?.((prev) => ({
                              ...(prev || {}),
                              channelId: ch.id,
                              timeout: step.value,
                            }));
                          }
                        }}
                        className="onicord-range-input w-full cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-onicord-muted font-medium pt-1.5 select-none">
                        {afkTimeoutOptions.map((s, idx) => (
                          <span
                            key={s.value}
                            onClick={() =>
                              setAfkSettings?.((prev) => ({
                                ...(prev || {}),
                                channelId: ch.id,
                                timeout: s.value,
                              }))
                            }
                            className={`cursor-pointer transition-colors ${
                              idx === sliderIdx
                                ? "text-onicord-accent font-bold"
                                : "hover:text-white"
                            }`}
                          >
                            {s.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {!isAfk && isPrivate && (
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

              {!isAfk && hasSpeakRestrictions && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-full mt-2.5 pt-2 border-t border-white/5 space-y-1.5 animate-fade-in text-[11px] bg-black/20 p-2.5 rounded-lg cursor-default text-left"
                >
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-onicord-muted uppercase tracking-wider text-[9px]">
                      {ch.type === "voice"
                        ? t("serverSettings.channels.restrictedSpeakVoiceTitle", "Roles Sin Permiso de Hablar (Solo Oyentes)")
                        : t("serverSettings.channels.restrictedSpeakTextTitle", "Roles Sin Permiso de Escribir (Solo Lectura)")}
                    </p>
                    <span className="text-[9px] text-onicord-muted">
                      {disallowedSpeakRoles.length === 0
                        ? t("serverSettings.channels.allCanSpeak", "Todos autorizados actualmente")
                        : t("serverSettings.channels.rolesCountRestricted", { count: disallowedSpeakRoles.length, defaultValue: `${disallowedSpeakRoles.length} restringido(s)` })}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {/* Role Badges for Disallowed Roles */}
                    {disallowedSpeakRoles.map((roleId) => {
                      if (roleId === "@everyone") {
                        return (
                          <div
                            key="@everyone"
                            onClick={() => {
                              const nextRoles = disallowedSpeakRoles.filter((id) => id !== "@everyone");
                              onUpdate(ch.id, "disallowedSpeakRoles", nextRoles);
                            }}
                            className="relative flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-white/20 transition-all cursor-pointer hover:!bg-onicord-danger hover:!border-onicord-danger group/badge bg-white/10"
                            title={t("serverSettings.channels.allowRoleHint", "Haz clic para autorizar a hablar")}
                          >
                            <div className="flex items-center gap-1.5 transition-opacity duration-150 group-hover/badge:opacity-0">
                              <MaterialIcon name="public" size={13} className="text-onicord-muted" />
                              <span className="text-[11px] font-semibold text-onicord-text">
                                {t("serverSettings.channels.everyoneRole", "@everyone (Sin rol)")}
                              </span>
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/badge:opacity-100 transition-opacity duration-150 text-white">
                              <Delete size="sm" />
                            </div>
                          </div>
                        );
                      }
                      const r = roles.find((role) => role.id === roleId);
                      if (!r) return null;
                      return (
                        <div
                          key={r.id}
                          onClick={() => {
                            const nextRoles = disallowedSpeakRoles.filter((id) => id !== r.id);
                            onUpdate(ch.id, "disallowedSpeakRoles", nextRoles);
                          }}
                          className="relative flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-transparent transition-all cursor-pointer hover:!bg-onicord-danger hover:!border-onicord-danger group/badge"
                          style={{
                            backgroundColor: hexToRgba(r.color, 0.25),
                            borderColor: hexToRgba(r.color, 0.4),
                          }}
                          title={t("serverSettings.channels.allowRoleHint", "Haz clic para autorizar a hablar")}
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

                    {/* Add Role Button for Speak Restrictions */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveSpeakMenuId(activeSpeakMenuId === ch.id ? null : ch.id);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-onicord-surface hover:bg-onicord-accent hover:text-onicord-dark text-onicord-muted transition-colors cursor-pointer"
                        title={t("serverSettings.channels.addSpeakRestriction", "Destildar / Restringir rol")}
                      >
                        <IconAdd size="sm" />
                      </button>

                      {/* Role restriction dropdown menu */}
                      {activeSpeakMenuId === ch.id && (
                        <div
                          ref={menuRef}
                          className="onicord-floating-menu w-56 left-0 top-8 z-[100] shadow-2xl p-2 space-y-1 text-left bg-onicord-base border border-white/10 rounded-xl"
                        >
                          <p className="text-[10px] font-bold uppercase tracking-wider text-onicord-muted px-2 py-1 border-b border-white/5">
                            {t("serverSettings.channels.selectRolesToMute", "Destildar / Restringir Roles")}
                          </p>
                          <div className="max-h-[180px] overflow-y-auto minimal-scrollbar space-y-1 pt-1">
                            {/* Option for @everyone */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const isRestricted = disallowedSpeakRoles.includes("@everyone");
                                const nextRoles = isRestricted
                                  ? disallowedSpeakRoles.filter((id) => id !== "@everyone")
                                  : [...disallowedSpeakRoles, "@everyone"];
                                onUpdate(ch.id, "disallowedSpeakRoles", nextRoles);
                              }}
                              className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all hover:bg-white/10 cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <MaterialIcon name="public" size={14} className="text-onicord-muted shrink-0" />
                                <span className="font-semibold truncate text-onicord-text">
                                  {t("serverSettings.channels.everyoneRole", "@everyone (Sin rol)")}
                                </span>
                              </div>
                              {disallowedSpeakRoles.includes("@everyone") ? (
                                <span className="text-[10px] text-onicord-danger font-bold flex items-center gap-1">
                                  <MaterialIcon name="block" size={13} /> {t("serverSettings.channels.readOnlyBadge", "Solo lectura")}
                                </span>
                              ) : (
                                <MaterialIcon
                                  name="check"
                                  size={14}
                                  className="text-onicord-accent"
                                />
                              )}
                            </button>

                            {roles.map((r) => {
                              const isRestricted = disallowedSpeakRoles.includes(r.id);
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const nextRoles = isRestricted
                                      ? disallowedSpeakRoles.filter((id) => id !== r.id)
                                      : [...disallowedSpeakRoles, r.id];
                                    onUpdate(ch.id, "disallowedSpeakRoles", nextRoles);
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
                                  {isRestricted ? (
                                    <span className="text-[10px] text-onicord-danger font-bold flex items-center gap-1">
                                      <MaterialIcon name="block" size={13} /> {t("serverSettings.channels.readOnlyBadge", "Solo lectura")}
                                    </span>
                                  ) : (
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
