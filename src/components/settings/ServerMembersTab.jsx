import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ModalInput } from "../ui/ModalShell";
import { Delete, IconAdd } from "../icons/StreamIcons";
import { checkPermission } from "../../lib/permissionsHelper";
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

export default function ServerMembersTab({
  server,
  roles = [],
  todosLosMiembros = [],
  userRoles = {},
  handleAssignRole,
  handleRemoveUserRole,
  profile,
  bannedUsers = [],
  setBannedUsers,
  kickedUsers = {},
  setKickedUsers,
}) {
  const { t } = useTranslation();
  const [activeMemberMenuId, setActiveMemberMenuId] = useState(null);
  const [filtroText, setFiltroText] = useState("");
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

  const ownerId = server?.ownerId;
  const isLocalOwner = ownerId === profile?.id;
  const isLocalAdmin = checkPermission(server, profile?.id, "admin");

  const canModerate = (targetId) => {
    if (!targetId || targetId === profile?.id) return false;
    if (targetId === ownerId) return false;
    const targetIsAdmin = checkPermission(server, targetId, "admin");
    if (targetIsAdmin) {
      return isLocalOwner;
    }
    return isLocalAdmin;
  };

  const canEditRoles = (targetId) => {
    if (!targetId) return false;
    if (isLocalOwner) return true;
    if (targetId === ownerId) return false;
    const targetIsAdmin = checkPermission(server, targetId, "admin");
    if (targetIsAdmin) {
      return isLocalOwner;
    }
    return isLocalAdmin;
  };

  const canAssignRole = (role) => {
    if (isLocalOwner) return true;
    return !role.permissions?.admin;
  };

  const handleKick = (userId) => {
    if (!canModerate(userId)) return;
    setKickedUsers((prev) => ({
      ...prev,
      [userId]: Date.now(),
    }));
  };

  const handleBan = (userId) => {
    if (!canModerate(userId)) return;
    setBannedUsers((prev) => {
      if (prev.includes(userId)) return prev;
      return [...prev, userId];
    });
  };

  const handleUnban = (userId) => {
    setBannedUsers((prev) => prev.filter((id) => id !== userId));
  };

  const activeMembersFiltered = Array.from(
    new Map(
      todosLosMiembros
        .filter((m) => {
          if (!m || !m.id) return false;
          if (bannedUsers.includes(m.id)) return false;
          if (kickedUsers[m.id]) return false;
          if (filtroText.trim()) {
            const nick = (m.nickname || "").toLowerCase();
            return nick.includes(filtroText.toLowerCase().trim());
          }
          return true;
        })
        .map((m) => [m.id, m])
    ).values()
  );

  return (
    <div className="onicord-settings-container">
      {/* TARJETA 1: LISTA Y BUSCADOR DE MIEMBROS */}
      <div className="onicord-settings-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="onicord-settings-section-title !mb-0">
            <span>{t("serverSettings.tabs.members", "Miembros del Servidor")} ({activeMembersFiltered.length})</span>
          </h3>

          <div className="w-full sm:w-[220px]">
            <ModalInput
              value={filtroText}
              onChange={(e) => setFiltroText(e.target.value)}
              placeholder={t("common.search", "Buscar miembro...")}
              className="h-10 text-xs px-3"
            />
          </div>
        </div>

        <div className="space-y-2 pt-2">
          {activeMembersFiltered.map((m) => {
            const isOwner = m.id === ownerId;
            const isSelf = m.id === profile?.id;
            const userRoleIds = userRoles[m.id] || [];
            const userAssignedRoles = roles.filter((r) => userRoleIds.includes(r.id));
            const isAllowedToModerate = canModerate(m.id);
            const isAllowedToEditRoles = canEditRoles(m.id);

            return (
              <div
                key={m.id}
                className="flex items-center justify-between p-3 rounded-xl bg-onicord-base/40 border border-white/5 hover:border-white/10 transition-colors gap-3"
              >
                {/* Info del Miembro */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-9 h-9 rounded-full bg-onicord-accent overflow-hidden flex items-center justify-center shrink-0 border border-white/10 shadow-sm">
                    {m.avatar ? (
                      <img src={m.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-bold text-xs">
                        {(m.nickname || "U").charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold text-white truncate">
                        {m.nickname || t("common.user", "Usuario")}
                      </span>
                      {isSelf && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-onicord-accent/20 text-onicord-accent uppercase">
                          {t("common.you", "Tú")}
                        </span>
                      )}
                      {isOwner && (
                        <MaterialIcon
                          name="crown"
                          size={15}
                          fill={true}
                          className="text-[#FFD700] cursor-help shrink-0"
                          title={t("common.owner", "Propietario del Servidor")}
                        />
                      )}
                    </div>
                  </div>
                </div>

                {/* Roles e Insignias */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex flex-wrap items-center gap-1.5 max-w-[220px] justify-end">
                    {isOwner && (
                      <div
                        className="flex items-center justify-center w-6 h-6 rounded-full border border-amber-500/30 bg-amber-500/10 shrink-0"
                        title={t("common.owner", "Propietario del Servidor")}
                      >
                        <MaterialIcon name="crown" size={13} fill={true} className="text-[#FFD700]" />
                      </div>
                    )}
                    {userAssignedRoles.map((r) => (
                      <div
                        key={r.id}
                        onClick={() => {
                          if (isAllowedToEditRoles) handleRemoveUserRole(m.id, r.id);
                        }}
                        className={`relative flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border border-transparent transition-all ${
                          isAllowedToEditRoles
                            ? "cursor-pointer hover:!bg-onicord-danger hover:!border-onicord-danger group/badge"
                            : ""
                        }`}
                        style={{
                          backgroundColor: hexToRgba(r.color, 0.25),
                          borderColor: hexToRgba(r.color, 0.4),
                        }}
                        title={isAllowedToEditRoles ? t("settings.members.removeRoleHint", "Haz clic para quitar rol") : ""}
                      >
                        {/* Contenido por defecto (visible sin hover) */}
                        <div className="flex items-center gap-1.5 transition-opacity duration-150 group-hover/badge:opacity-0">
                          <div
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: r.color }}
                          />
                          <span className="text-[11px] font-semibold text-onicord-text">
                            {r.name}
                          </span>
                        </div>

                        {/* Icono de papelera al hacer hover */}
                        {isAllowedToEditRoles && (
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/badge:opacity-100 transition-opacity duration-150 text-white">
                            <Delete size="sm" />
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Botón Añadir Rol */}
                    {roles.length > 0 && isAllowedToEditRoles && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMemberMenuId(activeMemberMenuId === m.id ? null : m.id);
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-onicord-surface hover:bg-onicord-accent hover:text-onicord-dark text-onicord-muted transition-colors cursor-pointer"
                          title={t("serverSettings.roles.title", "Asignar rol")}
                        >
                          <IconAdd size="sm" />
                        </button>

                        {/* Desplegable de Roles */}
                        {activeMemberMenuId === m.id && (
                          <div
                            ref={menuRef}
                            className="onicord-floating-menu w-52 right-0 top-8 z-[100] shadow-2xl p-2 space-y-1 text-left bg-onicord-base border border-white/10 rounded-xl"
                          >
                            <p className="text-[10px] font-bold uppercase tracking-wider text-onicord-muted px-2 py-1 border-b border-white/5">
                              {t("serverSettings.members.assignRoleTitle", "Asignar Rol al Miembro")}
                            </p>
                            <div className="max-h-[160px] overflow-y-auto minimal-scrollbar space-y-1 pt-1">
                              {roles.map((r) => {
                                const hasRole = userRoleIds.includes(r.id);
                                const isEligible = canAssignRole(r);
                                return (
                                  <button
                                    key={r.id}
                                    type="button"
                                    disabled={!isEligible}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (hasRole) {
                                        handleRemoveUserRole(m.id, r.id);
                                      } else {
                                        handleAssignRole(m.id, r.id);
                                      }
                                    }}
                                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-all ${
                                      isEligible
                                        ? "hover:bg-white/10 cursor-pointer"
                                        : "opacity-40 cursor-not-allowed"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                                      <span className="font-semibold truncate" style={{ color: r.color }}>
                                        {r.name}
                                      </span>
                                    </div>
                                    {hasRole && <MaterialIcon name="check" size={14} className="text-onicord-accent" />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Acciones de Moderación (Kick / Ban) */}
                  {isAllowedToModerate && (
                    <div className="flex items-center gap-1 pl-2 border-l border-white/10 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleKick(m.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-onicord-surface hover:bg-amber-500/20 hover:text-amber-400 text-onicord-muted transition-colors cursor-pointer"
                        title={t("settings.members.kickButton", "Expulsar miembro")}
                      >
                        <MaterialIcon name="sports_martial_arts" size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBan(m.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-onicord-surface hover:bg-onicord-danger/20 hover:text-onicord-danger text-onicord-muted transition-colors cursor-pointer"
                        title={t("settings.members.banButton", "Banear miembro")}
                      >
                        <MaterialIcon name="gavel" size={16} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {activeMembersFiltered.length === 0 && (
            <p className="text-xs text-onicord-muted italic py-6 text-center">
              {t("settings.members.noMembersFound", "No se encontraron miembros.")}
            </p>
          )}
        </div>
      </div>

      {/* TARJETA 2: MIEMBROS BANEADOS */}
      {bannedUsers.length > 0 && (
        <div className="onicord-settings-card border-onicord-danger/20 bg-onicord-danger/[0.03]">
          <h3 className="onicord-settings-section-title text-onicord-danger">
            <span>{t("settings.members.bannedTitle", "Miembros Baneados")} ({bannedUsers.length})</span>
          </h3>

          <div className="space-y-2 pt-1">
            {bannedUsers.map((bannedId) => {
              const savedMember = server.savedMembers?.[bannedId];
              const nickname = savedMember?.nickname || bannedId;
              const avatar = savedMember?.avatar;

              return (
                <div
                  key={bannedId}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-onicord-base/40 border border-onicord-danger/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-onicord-danger/20 overflow-hidden flex items-center justify-center shrink-0 border border-onicord-danger/30">
                      {avatar ? (
                        <img src={avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-onicord-danger font-bold text-xs">
                          {nickname.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">{nickname}</p>
                      <p className="text-[10px] text-onicord-muted font-mono">ID: {bannedId}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUnban(bannedId)}
                    className="px-3 py-1 text-xs font-bold rounded-lg bg-onicord-surface hover:bg-white/10 text-white transition-colors cursor-pointer"
                  >
                    {t("settings.members.unbanButton", "Desbanear")}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
