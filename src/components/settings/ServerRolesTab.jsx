import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ModalInput, ModalButton } from "../ui/ModalShell";
import { Delete } from "../icons/StreamIcons";
import MaterialIcon from "../icons/MaterialIcon";

export default function ServerRolesTab({
  nuevoRoleName,
  setNuevoRoleName,
  handleAddRole,
  roles,
  handleRoleDragStart,
  handleDragOver,
  handleRoleDrop,
  handleUpdateRole,
  handleRemoveRole,
  todosLosMiembros,
  userRoles,
  handleAssignRole,
  handleRemoveUserRole,
  profile,
  ownerId = null,
}) {
  const { t } = useTranslation();
  const [activeMemberMenuId, setActiveMemberMenuId] = useState(null);
  const [expandedRoleId, setExpandedRoleId] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (activeMemberMenuId === null) return;
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMemberMenuId(null);
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [activeMemberMenuId]);

  return (
    <div className="onicord-settings-container">
      {/* TARJETA 1: CREAR ROL */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("serverSettings.roles.createRoleLabel", "Crear Nuevo Rol de Servidor")}</span>
        </h3>

        <div className="flex gap-2 pt-1">
          <ModalInput
            value={nuevoRoleName}
            onChange={(e) => setNuevoRoleName(e.target.value)}
            placeholder={t("settings.roles.placeholder", "Ej. Moderador, VIP, Miembro...")}
            className="flex-1 h-9 text-xs"
          />
          <ModalButton
            variant="primary"
            onClick={handleAddRole}
            disabled={!nuevoRoleName.trim()}
            className="shrink-0 h-9 px-4 text-xs font-bold"
          >
            {t("common.add", "Añadir Rol")}
          </ModalButton>
        </div>
      </div>

      {/* TARJETA 2: LISTA Y PERMISOS DE ROLES */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("serverSettings.roles.rolesCount", { count: roles.length + (ownerId ? 1 : 0) })}</span>
        </h3>

        <ul
          className="space-y-2.5 pt-1"
          onDragOver={handleDragOver}
          onDrop={(e) => handleRoleDrop(e, null)}
        >
          {roles.map((role) => (
            <li
              key={role.id}
              draggable
              onDragStart={(e) => handleRoleDragStart(e, "role", role.id)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleRoleDrop(e, role.id)}
              className="flex flex-col bg-onicord-base/40 border border-white/5 p-3 rounded-2xl cursor-grab active:cursor-grabbing hover:border-white/10 transition-colors group"
            >
              <div className="flex gap-3 items-center w-full">
                <div className="text-onicord-muted opacity-40 group-hover:opacity-80 px-1 py-1 select-none flex flex-col gap-[3px] shrink-0">
                  <div className="w-1 h-1 bg-current rounded-full" />
                  <div className="w-1 h-1 bg-current rounded-full" />
                  <div className="w-1 h-1 bg-current rounded-full" />
                </div>

                <input
                  type="color"
                  value={role.color}
                  onChange={(e) =>
                    handleUpdateRole(role.id, "color", e.target.value)
                  }
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-7 h-7 rounded-full bg-transparent border-none cursor-pointer shrink-0 p-0 overflow-hidden [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full"
                  title={t("serverSettings.roles.roleColorTitle", "Color del rol")}
                />

                <ModalInput
                  value={role.name}
                  onChange={(e) =>
                    handleUpdateRole(role.id, "name", e.target.value)
                  }
                  onMouseDown={(e) => e.stopPropagation()}
                  className="max-w-[160px] py-1 text-xs bg-transparent border-none shadow-none focus:ring-0 font-bold cursor-text"
                  style={{ color: role.color }}
                />

                <div className="flex-1" />

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedRoleId(expandedRoleId === role.id ? null : role.id);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`w-8 h-8 flex items-center justify-center rounded-xl transition-colors shrink-0 cursor-pointer ${
                    expandedRoleId === role.id ? "bg-onicord-accent/20 text-onicord-accent" : "hover:bg-white/10 text-onicord-muted"
                  }`}
                  title={t("settings.roles.permissions", "Permisos del Rol")}
                >
                  <MaterialIcon name="shield" size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => handleRemoveRole(role.id)}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-onicord-danger/20 text-onicord-muted hover:text-onicord-danger transition-colors shrink-0 cursor-pointer"
                  title={t("common.delete", "Eliminar rol")}
                >
                  <Delete size="base" />
                </button>
              </div>

              {/* PANEL DE PERMISOS DESPLEGABLE */}
              {expandedRoleId === role.id && (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  className="w-full mt-3 p-4 bg-onicord-surface/80 border border-white/5 rounded-xl animate-fade-in cursor-default space-y-3"
                >
                  <p className="font-bold text-onicord-accent uppercase tracking-wider text-[10px] select-none text-left flex items-center gap-1.5">
                    <MaterialIcon name="lock_person" size={14} />
                    <span>{t("settings.roles.permissionsTitle", "Matriz de Permisos del Rol")}</span>
                  </p>
                  <div className="space-y-2">
                    {[
                      { key: "admin", label: t("settings.roles.admin", "Administrador"), desc: t("settings.roles.adminDesc", "Acceso total y edición de ajustes.") },
                      { key: "send_messages", label: t("settings.roles.sendMessages", "Enviar mensajes"), desc: t("settings.roles.sendMessagesDesc", "Permite escribir en canales de texto.") },
                      { key: "connect_voice", label: t("settings.roles.connectVoice", "Conectar a voz"), desc: t("settings.roles.connectVoiceDesc", "Permite hablar en salas de voz.") },
                      { key: "share_video", label: t("settings.roles.shareVideo", "Compartir vídeo"), desc: t("settings.roles.shareVideoDesc", "Permite transmitir pantalla o cámara.") },
                      { key: "manage_music", label: t("settings.roles.manageMusic", "Controlar música"), desc: t("settings.roles.manageMusicDesc", "Permite pausar, saltar pistas y gestionar la cola de música en canales de voz.") },
                      { key: "view_advanced_settings", label: t("settings.roles.viewAdvancedSettings", "Ver ajustes avanzados"), desc: t("settings.roles.viewAdvancedSettingsDesc", "Ver y editar canales, roles y red del servidor.") },
                    ].map((perm) => {
                      const val = role.permissions?.[perm.key] ?? (perm.key !== "admin" && perm.key !== "view_advanced_settings");
                      return (
                        <div key={perm.key} className="onicord-settings-row">
                          <div className="min-w-0 pr-4 text-left">
                            <p className="onicord-settings-row-title">{perm.label}</p>
                            <p className="onicord-settings-row-desc">{perm.desc}</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                            <input
                              type="checkbox"
                              checked={val}
                              onChange={(e) => {
                                const nextPerms = {
                                  ...(role.permissions || {}),
                                  [perm.key]: e.target.checked
                                };
                                handleUpdateRole(role.id, "permissions", nextPerms);
                              }}
                              className="sr-only peer"
                            />
                            <div className="onicord-toggle-slider" />
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </li>
          ))}

          {roles.length === 0 && (
            <p className="text-xs text-onicord-muted italic py-6 text-center">
              {t("serverSettings.roles.noRoles", "No hay roles personalizados aún. Crea el primero arriba.")}
            </p>
          )}
        </ul>
      </div>
    </div>
  );
}
