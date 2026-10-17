import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import Select from "../ui/Select";

export default function KeybindingsTab({
  keybindings = [],
  setKeybindings,
}) {
  const { t } = useTranslation();
  const [recordingId, setRecordingId] = useState(null);

  const ACTIONS = [
    { value: "toggle_mute", label: t("keybindings.actions.toggleMute", "Alternar Silencio") },
    { value: "toggle_deafen", label: t("keybindings.actions.toggleDeafen", "Alternar Ensordecer") },
    { value: "focus_search", label: t("keybindings.actions.focusSearch", "Buscar en el chat") },
    { value: "push_to_talk", label: t("keybindings.actions.pushToTalk", "Apretar para Hablar (PTT)") },
    { value: "go_to_dashboard", label: t("keybindings.actions.goToDashboard", "Ir al Dashboard") },
    { value: "open_pinned", label: t("keybindings.actions.openPinned", "Ir a Mensajes Anclados") },
    { value: "open_settings", label: t("keybindings.actions.openSettings", "Configuración de la App") },
    { value: "open_server_settings", label: t("keybindings.actions.openServerSettings", "Configuración del Servidor") },
    { value: "switch_server_up", label: t("keybindings.actions.switchServerUp", "Servidor Anterior") },
    { value: "switch_server_down", label: t("keybindings.actions.switchServerDown", "Servidor Siguiente") },
  ];

  useEffect(() => {
    if (!recordingId) return;

    const handleKeyDown = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const parts = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      if (e.metaKey) parts.push("Meta");

      const modifierKeys = ["Control", "Shift", "Alt", "Meta"];
      const isModifier = modifierKeys.includes(e.key);

      if (!isModifier) {
        let mainKey = e.key;
        if (mainKey === " ") mainKey = "Space";
        if (mainKey.length === 1) mainKey = mainKey.toUpperCase();
        parts.push(mainKey);
      }

      let shortcutString = parts.join(" + ");
      if (isModifier && parts.length > 0) {
        shortcutString = `${shortcutString} + …`;
      }

      if (shortcutString) {
        setKeybindings((prev) =>
          prev.map((kb) =>
            kb.id === recordingId ? { ...kb, shortcut: shortcutString } : kb,
          ),
        );
      }

      if (!isModifier && parts.length > 0) {
        setRecordingId(null);
      }
    };

    const handleKeyUp = (e) => {
      const modifierKeys = ["Control", "Shift", "Alt", "Meta"];
      if (modifierKeys.includes(e.key)) {
        setKeybindings((prev) => {
          const currentKb = prev.find((kb) => kb.id === recordingId);
          if (currentKb && currentKb.shortcut.endsWith(" + …")) {
            const cleaned = currentKb.shortcut.replace(" + …", "");
            setTimeout(() => setRecordingId(null), 50);
            return prev.map((kb) =>
              kb.id === recordingId ? { ...kb, shortcut: cleaned } : kb,
            );
          }
          return prev;
        });
      }
    };

    const handleMouseDown = (e) => {
      if (e.button === 1 || e.button >= 3) {
        e.preventDefault();
        e.stopPropagation();

        const parts = [];
        if (e.ctrlKey) parts.push("Ctrl");
        if (e.shiftKey) parts.push("Shift");
        if (e.altKey) parts.push("Alt");
        if (e.metaKey) parts.push("Meta");

        const mouseName = e.button === 1 ? "Mouse3" : `Mouse${e.button + 1}`;
        parts.push(mouseName);

        const shortcutString = parts.join(" + ");

        setKeybindings((prev) =>
          prev.map((kb) =>
            kb.id === recordingId ? { ...kb, shortcut: shortcutString } : kb,
          ),
        );
        setRecordingId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("mousedown", handleMouseDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("mousedown", handleMouseDown, true);
    };
  }, [recordingId, setKeybindings]);

  const handleAddKeybinding = () => {
    const newId = crypto.randomUUID();
    setKeybindings((prev) => [
      ...prev,
      {
        id: newId,
        action: "toggle_mute",
        shortcut: "",
      },
    ]);
    setRecordingId(newId);
  };

  const handleActionChange = (id, action) => {
    setKeybindings((prev) =>
      prev.map((kb) => (kb.id === id ? { ...kb, action } : kb)),
    );
  };

  const handleDelete = (id) => {
    setKeybindings((prev) => prev.filter((kb) => kb.id !== id));
  };

  return (
    <div className="onicord-settings-container space-y-5 animate-fade-in">
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div>
            <h3 className="onicord-settings-section-title !m-0">
              <span>{t("settings.tabs.keybindings", "Atajos de Teclado")}</span>
            </h3>
            <p className="text-[11px] text-onicord-muted mt-1 leading-relaxed">
              {t("keybindings.description", "Configura combinaciones de teclas para realizar acciones rápidas en la aplicación.")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddKeybinding}
            className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-onicord-accent text-onicord-dark hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0"
          >
            <MaterialIcon name="add" size={14} weight={700} />
            <span>{t("keybindings.addShortcut", "Añadir atajo")}</span>
          </button>
        </div>

        {keybindings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-onicord-muted space-y-2">
            <MaterialIcon name="keyboard" size={36} className="opacity-45" />
            <p className="text-xs font-semibold">{t("keybindings.noShortcuts", "No tienes atajos de teclado configurados.")}</p>
            <p className="text-[10px] text-onicord-muted/70 max-w-xs">{t("keybindings.noShortcutsHint", "Haz clic en añadir atajo arriba para empezar.")}</p>
          </div>
        ) : (
          <div className="pt-2 divide-y divide-white/5">
            {keybindings.map((kb) => (
              <div key={kb.id} className="flex items-center justify-between py-3.5 gap-4">
                {/* Action Selector */}
                <div className="flex-1 min-w-0">
                  <Select
                    value={kb.action}
                    onChange={(e) => handleActionChange(kb.id, e.target.value)}
                    options={ACTIONS}
                    className="w-full"
                  />
                </div>

                {/* Key Combination Recorder */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setRecordingId(kb.id)}
                    className={`h-9 flex items-center justify-center px-3 rounded-lg border text-xs font-mono font-bold min-w-[120px] text-center select-none shadow-inner uppercase cursor-pointer transition-colors box-border ${
                      recordingId === kb.id
                        ? "bg-onicord-danger/10 border-onicord-danger/50 text-onicord-danger animate-pulse"
                        : "bg-onicord-base border-white/15 text-onicord-accent hover:border-white/25"
                    }`}
                  >
                    {recordingId === kb.id
                      ? t("keybindings.recordingKey", "Teclando…")
                      : (kb.shortcut || t("keybindings.noKey", "Ninguno"))}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(kb.id)}
                    className="h-9 w-9 flex items-center justify-center rounded-lg text-onicord-muted hover:text-onicord-danger hover:bg-onicord-danger/10 transition-colors shrink-0 cursor-pointer"
                    title={t("common.delete", "Eliminar")}
                  >
                    <MaterialIcon name="delete" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Info card sobre atajos de teclado vs mouse */}
        <div className="mt-4 p-3 rounded-xl bg-onicord-base/40 border border-white/5 flex items-start gap-2.5 text-[11px] text-onicord-muted leading-relaxed">
          <MaterialIcon name="info" size={16} className="text-onicord-accent shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-white/90 mb-0.5">
              {t("keybindings.infoTitle", "Atajos de Teclado y Botones del Mouse")}
            </p>
            <p>
              {t(
                "keybindings.infoDesc",
                "Los atajos que usan teclas del teclado (ej: Ctrl+Shift+M o F8) funcionan de forma global en todo el sistema operativo, incluso cuando estés jugando en pantalla completa o tengas Onicord en segundo plano. Los atajos que incluyen botones del mouse (ej: Mouse 4, Mouse 5) se activan cuando la aplicación está en uso."
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
