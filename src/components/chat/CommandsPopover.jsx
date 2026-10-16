import React, { memo, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ONICORD_COMMANDS } from "../../lib/commands";
import { getPluginLocalizedMeta } from "../../lib/profileUtils";
import MaterialIcon from "../icons/MaterialIcon";

const CommandsPopover = memo(
  ({
    showCommandsPopup,
    input,
    setInput,
    setShowCommandsPopup,
    tyrannyInputRef,
    serverPlugins,
  }) => {
    const { t, i18n } = useTranslation();
    const [pluginCommands, setPluginCommands] = useState([]);

    useEffect(() => {
      if (window.electronAPI?.getPluginCommands) {
        window.electronAPI.getPluginCommands().then((cmds) => {
          if (Array.isArray(cmds)) setPluginCommands(cmds);
        });
      }

      if (window.electronAPI?.onPluginCommandsUpdated) {
        const cleanup = window.electronAPI.onPluginCommandsUpdated((cmds) => {
          if (Array.isArray(cmds)) setPluginCommands(cmds);
        });
        return cleanup;
      }
    }, []);

    if (!showCommandsPopup) return null;

    const isPluginAllowed = (pc) => {
      if (!Array.isArray(serverPlugins) || serverPlugins.length === 0) return false;
      const pid = pc.pluginId || pc.id;
      if (!pid) return false;
      return serverPlugins.some(
        (sp) =>
          (sp.id === pid ||
            (sp.id && (sp.id.includes(pid) || pid.includes(sp.id))) ||
            (sp.name && pc.pluginName && sp.name.toLowerCase() === pc.pluginName.toLowerCase())) &&
          sp.enabled !== false
      );
    };

    // Filtrar comandos de plugins registrados por IPC que estén autorizados en este servidor
    const allowedPluginCommands = (pluginCommands || []).filter(isPluginAllowed);

    // Mapa de comandos de plugins registrados por IPC o en ONICORD_COMMANDS
    const pluginMap = new Map();
    allowedPluginCommands.forEach((pc) => {
      const normalizedCmd = pc.command.startsWith("/")
        ? pc.command.toLowerCase()
        : `/${pc.command.toLowerCase()}`;
      pluginMap.set(normalizedCmd, pc);
    });

    const systemEntries = Object.entries(ONICORD_COMMANDS)
      .filter(([, info]) => {
        if (info.isPlugin) {
          return isPluginAllowed(info);
        }
        return true;
      })
      .map(([cmd, info]) => {
        const pc = pluginMap.get(cmd.toLowerCase());
        const isPlugin = info.isPlugin || !!pc;

        let pluginName = info.pluginName || t("common.complement", "Complemento");
        let description = t ? t(`commands.${info.name}.desc`, info.description) : info.description;

        if (pc) {
          const meta = getPluginLocalizedMeta(pc, i18n.language);
          pluginName = meta.name || pc.pluginName || pluginName;
          const cmdKey = cmd.startsWith("/") ? cmd : `/${cmd}`;
          description = meta.commands?.[cmdKey]?.description || meta.commands?.[cmd]?.description || pc.description || description;
        }

        return {
          command: cmd,
          description,
          isPlugin,
          pluginName,
        };
      });

    // Agregar comandos de complementos externos no declarados en ONICORD_COMMANDS
    const extraPluginEntries = allowedPluginCommands
      .filter((pc) => {
        const normalizedCmd = pc.command.startsWith("/")
          ? pc.command.toLowerCase()
          : `/${pc.command.toLowerCase()}`;
        return !ONICORD_COMMANDS[pc.command] && !ONICORD_COMMANDS[normalizedCmd];
      })
      .map((pc) => {
        const meta = getPluginLocalizedMeta(pc, i18n.language);
        const cmdKey = pc.command.startsWith("/") ? pc.command : `/${pc.command}`;
        const description = meta.commands?.[cmdKey]?.description || meta.commands?.[pc.command]?.description || pc.description || t("chat.pluginCommandFallback", "Comando del complemento {{name}}", { name: meta.name || pc.pluginName });

        return {
          command: cmdKey,
          description,
          isPlugin: true,
          pluginName: meta.name || pc.pluginName,
        };
      });

    const allCommands = [...systemEntries, ...extraPluginEntries];
    const filtered = allCommands.filter((item) =>
      item.command.toLowerCase().startsWith(input.toLowerCase())
    );

    if (filtered.length === 0) return null;

    return (
      <div className="onicord-floating-menu bottom-[calc(100%+8px)] left-2 w-[calc(100%-32px)] max-w-md">
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-onicord-muted border-b border-white/[0.02] mb-1">
          {t("chat.roomCommands", "Comandos de la sala")}
        </div>
        {filtered.map((item) => (
          <div
            key={item.command}
            onClick={() => {
              setInput(item.command + " ");
              setShowCommandsPopup(false);
              tyrannyInputRef.current?.focus();
            }}
            className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-onicord-accent hover:text-onicord-surface cursor-pointer transition-colors text-xs group"
          >
            <div className="flex items-center gap-2">
              <span className="font-bold font-mono">{item.command}</span>
              {item.isPlugin && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 rounded-md group-hover:text-onicord-surface group-hover:bg-onicord-surface/20 group-hover:border-onicord-surface/30">
                  <span>{item.pluginName}</span>
                  <MaterialIcon
                    name="smart_toy"
                    size={14}
                    fill={true}
                    weight={400}
                    className="text-indigo-400 group-hover:text-onicord-surface shrink-0"
                  />
                </span>
              )}
            </div>
            <span className="opacity-70 text-[11px] truncate max-w-[200px]">
              {item.description}
            </span>
          </div>
        ))}
      </div>
    );
  }
);

CommandsPopover.displayName = "CommandsPopover";
export default CommandsPopover;
