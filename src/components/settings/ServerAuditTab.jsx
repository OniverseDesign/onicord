import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import { getEffectiveProfile } from "../../lib/profileUtils";

export default function ServerAuditTab({ server, profile = null }) {
  const { t } = useTranslation();
  const [auditLog, setAuditLog] = useState(
    Array.isArray(server?.auditLog) ? server.auditLog : []
  );
  const [loading, setLoading] = useState(false);

  const effectiveSelfProfile = useMemo(
    () => (profile ? getEffectiveProfile(profile, server?.roomCode || server?.id) : null),
    [profile, server?.roomCode, server?.id]
  );

  const fetchAuditLogs = useCallback(async () => {
    const codeOrId = server?.roomCode || server?.id;
    if (!codeOrId || !window.electronAPI?.getServerAuditLog) return;
    try {
      setLoading(true);
      const logs = await window.electronAPI.getServerAuditLog(codeOrId);
      if (Array.isArray(logs)) {
        setAuditLog(logs);
      }
    } catch (err) {
      console.error("[ServerAuditTab] Error fetching audit log:", err);
    } finally {
      setLoading(false);
    }
  }, [server?.roomCode, server?.id]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  useEffect(() => {
    if (Array.isArray(server?.auditLog) && server.auditLog.length > 0) {
      setAuditLog(server.auditLog);
    }
  }, [server?.auditLog]);

  useEffect(() => {
    if (!window.electronAPI?.onServerUpdated) return;
    const unsub = window.electronAPI.onServerUpdated((updatedServer) => {
      const codeOrId = server?.roomCode || server?.id;
      if (
        updatedServer &&
        (updatedServer.id === codeOrId || updatedServer.roomCode === codeOrId)
      ) {
        fetchAuditLogs();
      }
    });
    return () => unsub?.();
  }, [fetchAuditLogs, server?.id, server?.roomCode]);

  const getActionBadgeStyle = (action) => {
    switch (action) {
      case "create_channel":
        return {
          bg: "bg-onicord-success/10 text-onicord-success border border-onicord-success/20",
          icon: "add_circle_outline",
        };
      case "delete_channel":
        return {
          bg: "bg-onicord-danger/10 text-onicord-danger border border-onicord-danger/20",
          icon: "remove_circle_outline",
        };
      case "update_channel":
      case "update_settings":
        return {
          bg: "bg-onicord-info/10 text-onicord-info border border-onicord-info/20",
          icon: "edit",
        };
      case "create_role":
      case "delete_role":
      case "update_role":
      case "assign_role":
        return {
          bg: "bg-onicord-accent/10 text-onicord-accent border border-onicord-accent/20",
          icon: "shield",
        };
      case "update_plugin":
        return {
          bg: "bg-onicord-accent/10 text-onicord-accent border border-onicord-accent/20",
          icon: "extension",
        };
      default:
        return {
          bg: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20",
          icon: "info",
        };
    }
  };

  const formatActionName = (action) => {
    switch (action) {
      case "create_channel":
        return t("serverSettings.audit.action.createChannel", "Canal Creado");
      case "delete_channel":
        return t("serverSettings.audit.action.deleteChannel", "Canal Eliminado");
      case "update_channel":
        return t("serverSettings.audit.action.updateChannel", "Canal Editado");
      case "update_settings":
        return t("serverSettings.audit.action.updateSettings", "Ajuste Modificado");
      case "create_role":
        return t("serverSettings.audit.action.createRole", "Rol Creado");
      case "delete_role":
        return t("serverSettings.audit.action.deleteRole", "Rol Eliminado");
      case "update_role":
        return t("serverSettings.audit.action.updateRole", "Rol Modificado");
      case "assign_role":
        return t("serverSettings.audit.action.assignRole", "Miembro Rol");
      case "update_plugin":
        return t("serverSettings.audit.action.updatePlugin", "Complemento");
      default:
        return t("serverSettings.audit.action.default", "Acción");
    }
  };

  return (
    <div className="onicord-settings-container">
      {/* Audit log records container */}
      <div className="onicord-settings-card space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="onicord-settings-section-title !mb-1">
              <span>{t("serverSettings.audit.title", "Registro de Auditoría")}</span>
            </h3>
            <p className="onicord-settings-row-desc">
              {t(
                "serverSettings.audit.subtitle",
                "Historial de los cambios de canales, roles y configuraciones del servidor."
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={fetchAuditLogs}
            disabled={loading}
            className="p-1.5 rounded-lg bg-onicord-tint/5 hover:bg-onicord-hover text-onicord-muted hover:text-onicord-text transition-colors flex items-center gap-1.5 text-xs border border-onicord-border disabled:opacity-50 shrink-0"
            title={t("common.refresh", "Actualizar")}
          >
            <MaterialIcon
              name="refresh"
              size={16}
              className={loading ? "animate-spin" : ""}
            />
            <span className="text-xs font-medium hidden sm:inline">
              {t("common.refresh", "Actualizar")}
            </span>
          </button>
        </div>

        <div>
          {loading && auditLog.length === 0 ? (
            <div className="p-8 rounded-xl bg-onicord-base/30 border border-onicord-border flex flex-col items-center justify-center text-center space-y-2">
              <MaterialIcon
                name="sync"
                size={32}
                className="text-onicord-accent animate-spin opacity-80"
              />
              <h4 className="text-xs font-bold text-onicord-text">
                {t("serverSettings.audit.loading", "Cargando registros...")}
              </h4>
              <p className="text-xs text-onicord-muted max-w-sm leading-relaxed">
                {t(
                  "serverSettings.audit.loadingHelp",
                  "Obteniendo el historial de eventos del servidor..."
                )}
              </p>
            </div>
          ) : auditLog.length === 0 ? (
            <div className="p-8 rounded-xl bg-onicord-base/30 border border-onicord-border flex flex-col items-center justify-center text-center space-y-2">
              <MaterialIcon
                name="history"
                size={36}
                className="text-onicord-muted opacity-40"
              />
              <h4 className="text-xs font-bold text-onicord-text">
                {t("serverSettings.audit.noLogs", "No hay registros disponibles")}
              </h4>
              <p className="text-xs text-onicord-muted max-w-sm leading-relaxed">
                {t(
                  "serverSettings.audit.noLogsHelp",
                  "Los cambios que realicen los administradores en el servidor aparecerán en esta lista."
                )}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto minimal-scrollbar pr-1">
              {auditLog.map((log) => {
                const badge = getActionBadgeStyle(log.action);
                const isSelf = Boolean(profile?.id && log.userId === profile.id);
                const savedMember = log.userId ? server?.savedMembers?.[log.userId] : null;
                const displayName =
                  (isSelf ? effectiveSelfProfile?.nickname : null) ||
                  savedMember?.nickname ||
                  log.nickname ||
                  log.userName ||
                  t("common.user", "Usuario");
                const avatarUrl =
                  (isSelf ? effectiveSelfProfile?.avatar : null) ||
                  savedMember?.avatar ||
                  log.avatar ||
                  null;
                const firstChar = String(displayName || "U").charAt(0).toUpperCase();

                return (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-onicord-base/40 border border-onicord-border hover:border-onicord-border-strong transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar circular */}
                      <div className="relative w-8 h-8 rounded-full bg-onicord-accent overflow-hidden flex items-center justify-center shrink-0 border border-onicord-border-strong shadow-sm">
                        {avatarUrl ? (
                          <img
                            src={avatarUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-onicord-text font-bold text-xs">
                            {firstChar}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-onicord-text truncate">
                            {displayName}
                          </span>

                          <div
                            className={`flex items-center gap-1 text-2xs px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${badge.bg}`}
                          >
                            <MaterialIcon name={badge.icon} size={10} />
                            <span>{formatActionName(log.action)}</span>
                          </div>

                          {log.target && (
                            <span className="text-2xs bg-onicord-tint/5 text-onicord-text/80 px-1.5 py-0.5 rounded border border-onicord-border font-mono max-w-[120px] truncate">
                              {log.target}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-onicord-muted mt-0.5 leading-snug">
                          {log.details}
                        </span>
                      </div>
                    </div>

                    <div className="text-2xs text-onicord-muted/60 whitespace-nowrap shrink-0 font-mono self-center">
                      {new Date(log.timestamp).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
