import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import { useInternalClose } from "../../hooks/useAnimatedMount";
import { cn } from "../../lib/cn";
import { CUSTOM_CSS_QUICK_REFERENCE } from "../../lib/customCss";

/**
 * Handles Tab key indentation inside a CSS textarea, inserting two spaces
 * and preserving the cursor position.
 */
export function handleCssTextareaKeyDown(e, currentValue, onUpdateValue) {
  if (e.key !== "Tab") return;
  e.preventDefault();

  const target = e.target;
  const start = target.selectionStart;
  const end = target.selectionEnd;
  const indent = "  ";

  const nextValue =
    currentValue.slice(0, start) + indent + currentValue.slice(end);
  onUpdateValue(nextValue);

  requestAnimationFrame(() => {
    target.selectionStart = start + indent.length;
    target.selectionEnd = start + indent.length;
  });
}

export default function CustomCssEditorModal({
  isOpen,
  onClose,
  value,
  onChange,
  enabled,
  onToggleEnabled,
  onImportClick,
  onExportClick,
  onInsertTemplate,
  onClear,
  braceStatus,
  safeMode,
}) {
  const { t } = useTranslation();
  const { isClosing, triggerClose } = useInternalClose(onClose, 140);
  const [showTokens, setShowTokens] = useState(false);
  const [copiedToken, setCopiedToken] = useState(null);
  const gutterRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        triggerClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, triggerClose]);

  if (!isOpen) return null;

  const lineCount = Math.max(1, value.split("\n").length);
  const lines = Array.from({ length: lineCount }, (_, idx) => idx + 1);

  const handleSyncScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleCopyToken = async (token) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((prev) => (prev === token ? null : prev)), 1400);
    } catch {
      // Clipboard may be unavailable in some restricted contexts
    }
  };

  return createPortal(
    <div
      className={cn(
        "onicord-modal-backdrop fixed inset-0 !z-modal-nested select-none pointer-events-auto bg-onicord-mantle/85 backdrop-blur-onicord-popover flex items-center justify-center p-4",
        isClosing && "onicord-animate-backdrop-out"
      )}
      onClick={triggerClose}
    >
      <div
        className={cn(
          "w-full max-w-4xl h-[85vh] bg-onicord-surface border border-onicord-island rounded-2xl shadow-2xl flex flex-col overflow-hidden",
          isClosing && "onicord-animate-modal-out"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-onicord-border flex items-center justify-between gap-3 bg-onicord-base/40">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <h3 className="onicord-settings-section-title !mb-0">
                <span>{t("settings.theme.customCSS", "CSS personalizado")}</span>
              </h3>
              <span
                className={cn(
                  "text-2xs font-bold px-2 py-0.5 rounded-full border",
                  safeMode
                    ? "bg-onicord-danger/15 border-onicord-danger/30 text-onicord-danger"
                    : enabled
                    ? "bg-onicord-accent/15 border-onicord-accent/30 text-onicord-accent"
                    : "bg-onicord-tint/5 border-onicord-border text-onicord-muted"
                )}
              >
                {safeMode
                  ? t("settings.theme.cssSafeModeBadge", "Modo seguro")
                  : enabled
                  ? t("settings.theme.cssActiveBadge", "Activo")
                  : t("settings.theme.cssDisabledBadge", "Desactivado")}
              </span>
            </div>
            <p className="onicord-settings-row-desc !mt-0.5 truncate">
              {t("settings.theme.customCSSDesc", "Escribe tus propios selectores para inyectar anulaciones globales en tiempo real.")}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label
              className="relative inline-flex items-center cursor-pointer select-none shrink-0 mr-1"
              title={
                enabled
                  ? t("settings.theme.disableCSS", "Desactivar CSS personalizado")
                  : t("settings.theme.enableCSS", "Activar CSS personalizado")
              }
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={onToggleEnabled}
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>

            <button
              type="button"
              onClick={() => setShowTokens((prev) => !prev)}
              title={t("settings.theme.cssTokensGuide", "Guía de variables CSS")}
              className={cn(
                "w-8 h-8 rounded-lg border transition active:scale-95 cursor-pointer flex items-center justify-center",
                showTokens
                  ? "bg-onicord-accent text-onicord-on-accent border-onicord-accent"
                  : "bg-onicord-base hover:bg-onicord-overlay border-onicord-border-strong text-onicord-text"
              )}
            >
              <MaterialIcon name="data_object" size={16} />
            </button>

            <button
              type="button"
              onClick={onImportClick}
              title={t("settings.theme.importCSS", "Importar archivo .css")}
              className="w-8 h-8 rounded-lg bg-onicord-base hover:bg-onicord-overlay border border-onicord-border-strong text-onicord-text transition active:scale-95 cursor-pointer flex items-center justify-center"
            >
              <MaterialIcon name="upload_file" size={16} />
            </button>

            {value && (
              <button
                type="button"
                onClick={onExportClick}
                title={t("settings.theme.exportCSS", "Exportar archivo .css")}
                className="w-8 h-8 rounded-lg bg-onicord-base hover:bg-onicord-overlay border border-onicord-border-strong text-onicord-text transition active:scale-95 cursor-pointer flex items-center justify-center"
              >
                <MaterialIcon name="download" size={16} />
              </button>
            )}

            <button
              type="button"
              onClick={onInsertTemplate}
              title={t("settings.theme.insertTemplate", "Plantilla de ejemplo")}
              className="w-8 h-8 rounded-lg bg-onicord-base hover:bg-onicord-overlay border border-onicord-border-strong text-onicord-text transition active:scale-95 cursor-pointer flex items-center justify-center"
            >
              <MaterialIcon name="code" size={16} />
            </button>

            {value && (
              <button
                type="button"
                onClick={onClear}
                title={t("settings.theme.clearCSS", "Limpiar CSS")}
                className="w-8 h-8 rounded-lg bg-onicord-danger/15 hover:bg-onicord-danger/25 border border-onicord-danger/30 text-onicord-danger transition active:scale-95 cursor-pointer flex items-center justify-center"
              >
                <MaterialIcon name="delete" size={16} />
              </button>
            )}

            <button
              type="button"
              onClick={triggerClose}
              title={t("common.close", "Cerrar")}
              className="w-8 h-8 rounded-lg bg-onicord-base hover:bg-onicord-overlay border border-onicord-border-strong text-onicord-muted hover:text-onicord-text transition active:scale-95 cursor-pointer flex items-center justify-center ml-1"
            >
              <MaterialIcon name="close" size={16} />
            </button>
          </div>
        </div>

        {/* Collapsible Tokens Quick Reference */}
        {showTokens && (
          <div className="px-5 py-3 border-b border-onicord-border bg-onicord-base/60 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-onicord-muted">
              <span>{t("settings.theme.cssTokensGuideTitle", "Variables y selectores útiles (clic para copiar)")}</span>
              {copiedToken && (
                <span className="text-onicord-accent font-mono lowercase">
                  {t("common.copied", "¡Copiado!")}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {CUSTOM_CSS_QUICK_REFERENCE.map((item) => (
                <button
                  key={item.token}
                  type="button"
                  onClick={() => handleCopyToken(item.token)}
                  className="px-2 py-1 rounded-lg bg-onicord-surface border border-onicord-border hover:border-onicord-accent/50 text-xs font-mono text-onicord-text transition cursor-pointer flex items-center gap-1.5"
                >
                  <span className="text-onicord-accent">{item.token}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Safe mode warning */}
        {safeMode && (
          <div className="mx-5 mt-4 rounded-xl border border-onicord-danger/30 bg-onicord-danger/10 px-3.5 py-2.5 text-xs text-onicord-text flex items-center gap-2.5">
            <MaterialIcon name="shield" size={16} className="text-onicord-danger shrink-0" />
            <span>
              {t(
                "settings.theme.cssSafeModeWarning",
                "Modo seguro activo (?safecss=1): el CSS personalizado no se está aplicando en esta sesión para que puedas editarlo o limpiarlo."
              )}
            </span>
          </div>
        )}

        {/* Editor body with line numbers */}
        <div
          className={cn(
            "flex-1 min-h-0 m-5 rounded-xl bg-onicord-base/80 border border-onicord-border-strong shadow-inner flex overflow-hidden font-mono transition-opacity",
            !enabled && "opacity-60"
          )}
        >
          <div
            ref={gutterRef}
            aria-hidden="true"
            className="w-11 py-3.5 px-2 bg-onicord-mantle/50 border-r border-onicord-border text-xs leading-relaxed text-onicord-muted/60 text-right select-none overflow-hidden shrink-0"
          >
            {lines.map((num) => (
              <div key={num}>{num}</div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onScroll={handleSyncScroll}
            onKeyDown={(e) => handleCssTextareaKeyDown(e, value, onChange)}
            placeholder={t(
              "settings.theme.customCSSPlaceholder",
              "/* Escribe reglas CSS personalizadas aquí */\n.onicord-chat-input-bar {\n  border-color: var(--onicord-accent) !important;\n}"
            )}
            className="flex-1 h-full bg-transparent p-3.5 text-xs text-onicord-accent placeholder-onicord-muted/30 focus:outline-none resize-none font-mono leading-relaxed minimal-scrollbar select-text"
            spellCheck="false"
          />
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-onicord-border bg-onicord-base/40 flex flex-wrap items-center justify-between gap-2 text-xs text-onicord-muted">
          <div className="flex items-center gap-3">
            <span>
              {t("settings.theme.cssTabHint", "Pulsa Tab para indentar (2 espacios).")}
            </span>
            {!braceStatus.valid && (
              <span className="text-onicord-danger font-medium flex items-center gap-1">
                <MaterialIcon name="warning" size={14} />
                {t("settings.theme.cssBraceWarning", {
                  unclosed: braceStatus.unclosedCount,
                  extra: braceStatus.extraClosingCount,
                  defaultValue: "Llaves desbalanceadas en el CSS.",
                })}
              </span>
            )}
          </div>
          <span className="font-mono">
            {t("settings.theme.lineAndCharCount", {
              lines: lineCount,
              count: value.length,
              defaultValue: `${lineCount} líneas · ${value.length} caracteres`,
            })}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
}
