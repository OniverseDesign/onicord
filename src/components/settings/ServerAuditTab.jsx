import React from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";

export default function ServerAuditTab({ server }) {
  const { t } = useTranslation();
  const auditLog = Array.isArray(server?.auditLog) ? server.auditLog : [];

  const getActionBadgeStyle = (action) => {
    switch (action) {
      case "create_channel":
        return {
          bg: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
          icon: "add_circle_outline"
        };
      case "delete_channel":
        return {
          bg: "bg-rose-500/10 text-rose-400 border border-rose-500/20",
          icon: "remove_circle_outline"
        };
      case "update_channel":
      case "update_settings":
        return {
          bg: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
          icon: "edit"
        };
      case "update_role":
      case "assign_role":
        return {
          bg: "bg-purple-500/10 text-purple-400 border border-purple-500/20",
          icon: "shield"
        };
      case "update_plugin":
        return {
          bg: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
          icon: "extension"
        };
      default:
        return {
          bg: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20",
          icon: "info"
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
        <div>
          <h3 className="onicord-settings-section-title !mb-1">
            <span>{t("serverSettings.audit.title", "Registro de Auditoría")}</span>
          </h3>
          <p className="onicord-settings-row-desc">
            {t("serverSettings.audit.subtitle", "Historial de los cambios de canales, roles y configuraciones del servidor.")}
          </p>
        </div>

        <div>
          {auditLog.length === 0 ? (
            <div className="p-8 rounded-xl bg-onicord-base/30 border border-white/5 flex flex-col items-center justify-center text-center space-y-2">
              <MaterialIcon name="history" size={36} className="text-onicord-muted opacity-40" />
              <h4 className="text-xs font-bold text-white">
                {t("serverSettings.audit.noLogs", "No hay registros disponibles")}
              </h4>
              <p className="text-[11px] text-onicord-muted max-w-sm leading-relaxed">
                {t("serverSettings.audit.noLogsHelp", "Los cambios que realicen los administradores en el servidor aparecerán en esta lista.")}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto minimal-scrollbar pr-1">
              {auditLog.map((log) => {
                const badge = getActionBadgeStyle(log.action);
                const firstChar = String(log.nickname || "U").charAt(0).toUpperCase();

                // Dynamic avatar resolution (checks log record first, then member database)
                const avatarUrl = log.avatar || server?.savedMembers?.[log.userId]?.avatar;

                return (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-onicord-base/40 border border-white/5 hover:border-white/10 transition-colors gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar circular */}
                      <div className="relative w-8 h-8 rounded-full bg-onicord-accent overflow-hidden flex items-center justify-center shrink-0 border border-white/10 shadow-sm">
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-white font-bold text-xs">
                            {firstChar}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-white truncate">
                            {log.nickname}
                          </span>
                          
                          <div className={`flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${badge.bg}`}>
                            <MaterialIcon name={badge.icon} size={10} />
                            <span>{formatActionName(log.action)}</span>
                          </div>

                          {log.target && (
                            <span className="text-[9px] bg-white/5 text-onicord-text/80 px-1.5 py-0.5 rounded border border-white/5 font-mono max-w-[120px] truncate">
                              {log.target}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-onicord-muted mt-0.5 leading-snug">
                          {log.details}
                        </span>
                      </div>
                    </div>

                    <div className="text-[10px] text-onicord-muted/60 whitespace-nowrap shrink-0 font-mono self-center">
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
