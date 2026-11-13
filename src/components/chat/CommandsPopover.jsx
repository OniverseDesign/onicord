import React, {
  memo,
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import { ONICORD_COMMANDS } from "../../lib/commands";
import { getPluginLocalizedMeta } from "../../lib/profileUtils";
import MaterialIcon from "../icons/MaterialIcon";
import {
  setSelectionOffsets,
  renderHTMLForInput,
} from "../../lib/inputFormatter";

const CommandsPopover = memo(
  forwardRef(function CommandsPopover(
    {
      showCommandsPopup,
      input,
      setInput,
      setShowCommandsPopup,
      tyrannyInputRef,
      serverPlugins,
      profile,
      peers,
    },
    ref
  ) {
    const { t, i18n } = useTranslation();
    const [pluginCommands, setPluginCommands] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const hasNavigatedRef = useRef(false);
    const itemRefs = useRef([]);

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

    useEffect(() => {
      setSelectedIndex(0);
      hasNavigatedRef.current = false;
    }, [input]);

    const isPluginAllowed = useCallback(
      (pc) => {
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
      },
      [serverPlugins]
    );

    // Filter plugin commands registered via IPC that are authorized on this server
    const allowedPluginCommands = useMemo(
      () => (pluginCommands || []).filter(isPluginAllowed),
      [pluginCommands, isPluginAllowed]
    );

    // Map of plugin commands registered via IPC or in ONICORD_COMMANDS
    const pluginMap = useMemo(() => {
      const map = new Map();
      allowedPluginCommands.forEach((pc) => {
        const normalizedCmd = pc.command.startsWith("/")
          ? pc.command.toLowerCase()
          : `/${pc.command.toLowerCase()}`;
        map.set(normalizedCmd, pc);
      });
      return map;
    }, [allowedPluginCommands]);

    const systemEntries = useMemo(() => {
      return Object.entries(ONICORD_COMMANDS)
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
            description =
              meta.commands?.[cmdKey]?.description ||
              meta.commands?.[cmd]?.description ||
              pc.description ||
              description;
          }

          return {
            command: cmd,
            description,
            isPlugin,
            pluginName,
          };
        });
    }, [isPluginAllowed, pluginMap, t, i18n.language]);

    // Append external plugin commands not declared in base ONICORD_COMMANDS
    const extraPluginEntries = useMemo(() => {
      return allowedPluginCommands
        .filter((pc) => {
          const normalizedCmd = pc.command.startsWith("/")
            ? pc.command.toLowerCase()
            : `/${pc.command.toLowerCase()}`;
          return !ONICORD_COMMANDS[pc.command] && !ONICORD_COMMANDS[normalizedCmd];
        })
        .map((pc) => {
          const meta = getPluginLocalizedMeta(pc, i18n.language);
          const cmdKey = pc.command.startsWith("/") ? pc.command : `/${pc.command}`;
          const description =
            meta.commands?.[cmdKey]?.description ||
            meta.commands?.[pc.command]?.description ||
            pc.description ||
            t("chat.pluginCommandFallback", "Comando del complemento {{name}}", {
              name: meta.name || pc.pluginName,
            });

          return {
            command: cmdKey,
            description,
            isPlugin: true,
            pluginName: meta.name || pc.pluginName,
          };
        });
    }, [allowedPluginCommands, i18n.language, t]);

    const allCommands = useMemo(
      () => [...systemEntries, ...extraPluginEntries],
      [systemEntries, extraPluginEntries]
    );

    const filtered = useMemo(() => {
      if (!input) return [];
      return allCommands.filter((item) =>
        item.command.toLowerCase().startsWith(input.toLowerCase())
      );
    }, [allCommands, input]);

    const validIndex =
      filtered.length > 0
        ? Math.min(Math.max(0, selectedIndex), filtered.length - 1)
        : 0;

    useEffect(() => {
      if (itemRefs.current[validIndex]) {
        itemRefs.current[validIndex].scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
      }
    }, [validIndex]);

    const selectCommand = useCallback(
      (item) => {
        if (!item) return;
        const newText = item.command + " ";
        const newCursorPos = newText.length;

        setInput(newText);
        setShowCommandsPopup(false);

        const el = tyrannyInputRef?.current;
        if (el) {
          const allUsers = [
            { id: profile?.id, nickname: profile?.nickname || "Usuario" },
            ...Object.values(peers || {}).map((p) => ({
              id: p.id,
              nickname: p.nickname,
            })),
          ];
          el.innerHTML = renderHTMLForInput(newText, allUsers);
          el.focus();
          setSelectionOffsets(el, newCursorPos, newCursorPos);
          requestAnimationFrame(() => {
            el.focus();
            setSelectionOffsets(el, newCursorPos, newCursorPos);
          });
        }
      },
      [setInput, setShowCommandsPopup, tyrannyInputRef, profile, peers]
    );

    useImperativeHandle(
      ref,
      () => ({
        isOpen: Boolean(showCommandsPopup && filtered.length > 0),
        handleKeyDown: (e) => {
          if (!showCommandsPopup || filtered.length === 0) return false;

          if (
            e.key === "ArrowDown" &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey
          ) {
            e.preventDefault();
            e.stopPropagation();
            hasNavigatedRef.current = true;
            setSelectedIndex((prev) => (prev + 1) % filtered.length);
            return true;
          }

          if (
            e.key === "ArrowUp" &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey
          ) {
            e.preventDefault();
            e.stopPropagation();
            hasNavigatedRef.current = true;
            setSelectedIndex(
              (prev) => (prev - 1 + filtered.length) % filtered.length
            );
            return true;
          }

          if (e.key === "Tab" && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            selectCommand(filtered[validIndex]);
            return true;
          }

          if (e.key === "Enter" && !e.shiftKey && hasNavigatedRef.current) {
            e.preventDefault();
            e.stopPropagation();
            selectCommand(filtered[validIndex]);
            return true;
          }

          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setShowCommandsPopup(false);
            return true;
          }

          return false;
        },
      }),
      [showCommandsPopup, filtered, validIndex, selectCommand, setShowCommandsPopup]
    );

    if (!showCommandsPopup || filtered.length === 0) return null;

    return (
      <div
        onMouseDown={(e) => e.preventDefault()}
        className="onicord-floating-menu bottom-[calc(100%+8px)] left-2 w-[calc(100%-32px)] max-w-md"
      >
        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-onicord-muted border-b border-white/[0.02] mb-1">
          {t("chat.roomCommands", "Comandos de la sala")}
        </div>
        <div className="space-y-0.5 max-h-56 overflow-y-auto minimal-scrollbar">
          {filtered.map((item, index) => {
            const isSelected = index === validIndex;
            return (
              <div
                key={item.command}
                ref={(el) => (itemRefs.current[index] = el)}
                onClick={() => selectCommand(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors text-xs group ${
                  isSelected
                    ? "bg-onicord-accent text-onicord-surface"
                    : "hover:bg-onicord-accent/20 hover:text-white text-onicord-text"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-bold font-mono">{item.command}</span>
                  {item.isPlugin && (
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${
                        isSelected
                          ? "text-onicord-surface bg-onicord-surface/20 border border-onicord-surface/30"
                          : "text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 group-hover:text-onicord-surface group-hover:bg-onicord-surface/20"
                      }`}
                    >
                      <span>{item.pluginName}</span>
                      <MaterialIcon
                        name="smart_toy"
                        size={14}
                        fill={true}
                        weight={400}
                        className={`shrink-0 ${
                          isSelected
                            ? "text-onicord-surface"
                            : "text-indigo-400 group-hover:text-onicord-surface"
                        }`}
                      />
                    </span>
                  )}
                </div>
                <span
                  className={`text-[11px] truncate max-w-[200px] ${
                    isSelected
                      ? "opacity-90 text-inherit"
                      : "opacity-70 text-onicord-muted"
                  }`}
                >
                  {item.description}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  })
);

CommandsPopover.displayName = "CommandsPopover";
export default CommandsPopover;
