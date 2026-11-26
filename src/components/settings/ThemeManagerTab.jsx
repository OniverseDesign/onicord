import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import ColorPicker from "../ui/ColorPicker";
import CustomCssEditorModal, { handleCssTextareaKeyDown } from "../modals/CustomCssEditorModal";
import { APP_COLORS, applyDynamicTheme } from "../../lib/colors";
import {
  applyCustomCSS,
  getCustomCSSState,
  saveCustomCSSState,
  validateCssBraces,
  isSafeCssMode,
  getWindowMicaEnabled,
  applyWindowMica,
  CUSTOM_CSS_QUICK_REFERENCE,
  MAX_CUSTOM_CSS_BYTES,
} from "../../lib/customCss";
import { cn } from "../../lib/cn";

const STORAGE_THEME_KEY = "onicord_active_accent";
const STORAGE_BG_SATURATION_KEY = "onicord_bg_saturation";
const STORAGE_BG_LIGHTNESS_KEY = "onicord_bg_lightness";
const STORAGE_THEME_MODE_KEY = "onicord_theme_mode";

export default function ThemeManagerTab({ profile }) {
  const { t } = useTranslation();
  const [activeAccent, setActiveAccent] = useState("lavender");
  const [customCSS, setCustomCSS] = useState("");
  const [cssEnabled, setCssEnabled] = useState(true);
  const [isCssModalOpen, setIsCssModalOpen] = useState(false);
  const [showTokensGuide, setShowTokensGuide] = useState(false);
  const [copiedToken, setCopiedToken] = useState(null);
  const [cssImportError, setCssImportError] = useState(null);
  const [bgSaturation, setBgSaturation] = useState(50);
  const [bgLightness, setBgLightness] = useState(0);
  const [themeMode, setThemeMode] = useState("dark");
  const [windowMica, setWindowMica] = useState(() => getWindowMicaEnabled());
  const [previewSliderVal, setPreviewSliderVal] = useState(75);
  const [previewToggle, setPreviewToggle] = useState(true);

  const fileInputRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const safeMode = useMemo(() => isSafeCssMode(), []);
  const braceStatus = useMemo(() => validateCssBraces(customCSS), [customCSS]);

  const SAMPLE_CSS_TEMPLATE = `/* Ejemplo 1: Borde de la barra de chat con brillo de acento */
.onicord-chat-input-bar {
  border-color: var(--onicord-accent) !important;
  box-shadow: 0 0 12px rgba(168, 85, 247, 0.25) !important;
}

/* Ejemplo 2: Personalización de la barra de desplazamiento */
::-webkit-scrollbar-thumb {
  background-color: var(--onicord-accent) !important;
  border-radius: 6px !important;
}`;

  useEffect(() => {
    const savedAccent = localStorage.getItem(STORAGE_THEME_KEY) || "lavender";
    const { css: savedCSS, enabled: savedCssEnabled } = getCustomCSSState();
    const savedSat = localStorage.getItem(STORAGE_BG_SATURATION_KEY);
    const savedLight = localStorage.getItem(STORAGE_BG_LIGHTNESS_KEY);
    const savedMode = localStorage.getItem(STORAGE_THEME_MODE_KEY) || "dark";

    const satVal = savedSat !== null ? Number(savedSat) : 50;
    const lightVal = savedLight !== null ? Number(savedLight) : 0;

    setActiveAccent(savedAccent);
    setCustomCSS(savedCSS);
    setCssEnabled(savedCssEnabled);
    setBgSaturation(satVal);
    setBgLightness(lightVal);
    setThemeMode(savedMode);

    applyDynamicTheme({
      accentKeyOrHex: savedAccent,
      saturationPercentage: satVal,
      lightnessOffset: lightVal,
      mode: savedMode,
    });

    if (savedCSS) {
      applyCustomCSS(savedCSS, savedCssEnabled);
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleModeSelect = (newMode) => {
    setThemeMode(newMode);
    localStorage.setItem(STORAGE_THEME_MODE_KEY, newMode);

    applyDynamicTheme({
      accentKeyOrHex: activeAccent,
      saturationPercentage: bgSaturation,
      lightnessOffset: bgLightness,
      mode: newMode,
    });
  };

  const handleAccentSelect = (key, info) => {
    const newAccent = key === "custom" ? info.colorVar : key;
    setActiveAccent(newAccent);
    localStorage.setItem(STORAGE_THEME_KEY, newAccent);

    applyDynamicTheme({
      accentKeyOrHex: newAccent,
      saturationPercentage: bgSaturation,
      lightnessOffset: bgLightness,
      mode: themeMode,
    });
  };

  const handleSaturationChange = (e) => {
    const val = Number(e.target.value);
    setBgSaturation(val);
    localStorage.setItem(STORAGE_BG_SATURATION_KEY, val);

    applyDynamicTheme({
      accentKeyOrHex: activeAccent,
      saturationPercentage: val,
      lightnessOffset: bgLightness,
      mode: themeMode,
    });
  };

  const handleLightnessChange = (e) => {
    const val = Number(e.target.value);
    setBgLightness(val);
    localStorage.setItem(STORAGE_BG_LIGHTNESS_KEY, val);

    applyDynamicTheme({
      accentKeyOrHex: activeAccent,
      saturationPercentage: bgSaturation,
      lightnessOffset: val,
      mode: themeMode,
    });
  };

  const handleResetBgDefaults = () => {
    setBgSaturation(50);
    setBgLightness(0);
    localStorage.setItem(STORAGE_BG_SATURATION_KEY, 50);
    localStorage.setItem(STORAGE_BG_LIGHTNESS_KEY, 0);

    applyDynamicTheme({
      accentKeyOrHex: activeAccent,
      saturationPercentage: 50,
      lightnessOffset: 0,
      mode: themeMode,
    });
  };

  const handleToggleMica = async (e) => {
    const next = e.target.checked;
    setWindowMica(next);
    await applyWindowMica(next);
  };

  const handleCSSValueChange = (code) => {
    setCustomCSS(code);
    setCssImportError(null);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      saveCustomCSSState(code, cssEnabled);
      debounceTimerRef.current = null;
    }, 250);
  };

  const handleCSSChange = (e) => {
    handleCSSValueChange(e.target.value);
  };

  const handleCSSBlur = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      saveCustomCSSState(customCSS, cssEnabled);
    }
  };

  const handleToggleCSS = () => {
    const nextEnabled = !cssEnabled;
    setCssEnabled(nextEnabled);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    saveCustomCSSState(customCSS, nextEnabled);
  };

  const handleClearCSS = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setCustomCSS("");
    setCssImportError(null);
    saveCustomCSSState("", cssEnabled);
  };

  const handleInsertTemplate = () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const newCode = customCSS ? `${customCSS}\n\n${SAMPLE_CSS_TEMPLATE}` : SAMPLE_CSS_TEMPLATE;
    setCustomCSS(newCode);
    setCssImportError(null);
    saveCustomCSSState(newCode, cssEnabled);
  };

  const handleImportCSSClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_CUSTOM_CSS_BYTES) {
      setCssImportError(
        t("settings.theme.cssFileTooLarge", "El archivo .css supera el límite de 512 KB.")
      );
      return;
    }

    try {
      const content = await file.text();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setCustomCSS(content);
      setCssEnabled(true);
      setCssImportError(null);
      saveCustomCSSState(content, true);
    } catch {
      setCssImportError(
        t("settings.theme.cssImportError", "No se pudo leer el archivo .css seleccionado.")
      );
    }
  };

  const handleExportCSS = () => {
    if (!customCSS) return;
    const blob = new Blob([customCSS], { type: "text/css;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "onicord-custom-theme.css";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyToken = async (token) => {
    try {
      await navigator.clipboard.writeText(token);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken((prev) => (prev === token ? null : prev)), 1400);
    } catch {
      // Clipboard may be unavailable
    }
  };

  return (
    <div className="onicord-settings-container">
      {/* Theme mode selector */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.theme.themeMode", "Modo de Tema")}</span>
        </h3>
        <p className="onicord-settings-row-desc -mt-2 mb-2">
          {t("settings.theme.themeModeDesc", "Selecciona el esquema de contraste primario.")}
        </p>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={() => handleModeSelect("dark")}
            className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
              themeMode === "dark"
                ? "border-onicord-accent bg-onicord-surface ring-1 ring-onicord-accent/30"
                : "border-onicord-border bg-onicord-base/40 hover:border-onicord-border-strong"
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${themeMode === "dark" ? "bg-onicord-accent text-onicord-on-accent font-bold" : "bg-onicord-tint/5 text-onicord-muted"}`}>
              <MaterialIcon name="dark_mode" size={18} />
            </div>
            <div className="text-left min-w-0">
              <div className="text-xs font-bold text-onicord-text truncate">
                {t("settings.theme.modeDark", "Oscuro")}
              </div>
              <div className="text-2xs text-onicord-muted truncate">
                {t("settings.theme.modeDarkSub", "Catppuccin Mocha")}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleModeSelect("light")}
            className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
              themeMode === "light"
                ? "border-onicord-accent bg-onicord-surface ring-1 ring-onicord-accent/30"
                : "border-onicord-border bg-onicord-base/40 hover:border-onicord-border-strong"
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${themeMode === "light" ? "bg-onicord-accent text-onicord-on-accent font-bold" : "bg-onicord-tint/5 text-onicord-muted"}`}>
              <MaterialIcon name="light_mode" size={18} />
            </div>
            <div className="text-left min-w-0">
              <div className="text-xs font-bold text-onicord-text truncate">
                {t("settings.theme.modeLight", "Claro")}
              </div>
              <div className="text-2xs text-onicord-muted truncate">
                {t("settings.theme.modeLightSub", "Catppuccin Latte")}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* CARD 2: ACCENT COLOR AND REALISTIC PREVIEW */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.theme.accentColor", "Color de Acento Primario")}</span>
        </h3>
        <p className="onicord-settings-row-desc -mt-2">
          {t("settings.theme.accentDesc", "Elige el tono pastel para destacar botones, selecciones y menciones.")}
        </p>

        <div className="py-2">
          <ColorPicker
            selectedColor={activeAccent}
            onSelectColor={handleAccentSelect}
            showStructures={false}
          />
        </div>

        {/* REALISTIC REAL-TIME PREVIEW */}
        <div className="pt-4 border-t border-onicord-border space-y-3.5">
          <div className="text-xs font-bold uppercase tracking-wider text-onicord-muted flex items-center gap-2">
            <MaterialIcon name="visibility" size={16} />
            <span>{t("settings.theme.preview", "Vista previa en tiempo real")}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch pt-0.5">
            {/* LEFT COLUMN: CHAT PREVIEW (# general) */}
            <div className="lg:col-span-7 bg-onicord-base/70 border border-onicord-border rounded-2xl overflow-hidden flex flex-col shadow-inner min-h-[250px]">
              {/* Channel Header */}
              <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-onicord-border select-none bg-onicord-base/30">
                <span className="text-onicord-muted font-bold text-base leading-none">#</span>
                <span className="text-onicord-text font-bold text-sm tracking-normal">general</span>
              </div>

              {/* Chat messages */}
              <div className="p-4 space-y-4 text-left flex-1 font-sans">
                {/* Message 1 (Main author + grouped second message) */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-onicord-accent shadow-sm flex items-center justify-center">
                    {profile?.avatar ? (
                      <img src={profile.avatar} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <span className="text-onicord-on-accent font-bold text-base">
                        {(profile?.nickname || "O").charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm text-onicord-text leading-tight cursor-default">
                      {profile?.nickname || "Oniverse"}
                    </div>
                    <div
                      className="whitespace-pre-wrap break-words text-sm text-onicord-subtext select-text mt-1"
                      style={{ lineHeight: "var(--onicord-chat-line-height, 1.45)" }}
                    >
                      {t("settings.theme.previewMsg1Before", "¡Hola a todos! Este es un mensaje de prueba con una mención a ")}
                      <span className="inline-flex items-center font-semibold text-onicord-accent bg-onicord-accent/15 px-1.5 py-0.5 rounded-md cursor-pointer hover:underline">
                        @Admin
                      </span>
                      {t("settings.theme.previewMsg1After", " usando la nueva paleta.")}
                    </div>
                    <div
                      className="whitespace-pre-wrap break-words text-sm text-onicord-subtext select-text mt-3"
                      style={{ lineHeight: "var(--onicord-chat-line-height, 1.45)" }}
                    >
                      {t("settings.theme.previewMsgGrouped", "Este segundo mensaje está agrupado sin repetir la foto ni el nombre de usuario.")}
                    </div>
                  </div>
                </div>

                {/* Message 2 (Second author: Alex) */}
                <div className="flex items-start gap-3 pt-1">
                  <div className="w-10 h-10 rounded-full shrink-0 bg-[#8c74bd] text-white shadow-sm flex items-center justify-center font-bold text-base">
                    A
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm text-onicord-mauve leading-tight cursor-default">
                      Alex ({t("settings.theme.previewModerator", "Moderador")})
                    </div>
                    <div
                      className="whitespace-pre-wrap break-words text-sm text-onicord-subtext select-text mt-1 min-h-[38px]"
                      style={{ lineHeight: "var(--onicord-chat-line-height, 1.45)" }}
                    >
                      {t("settings.theme.previewMsg2Before", "¡Quedó excelente el acento de color ")}
                      <span className="inline-flex items-center font-medium text-onicord-accent bg-onicord-accent/15 px-1.5 py-0.5 rounded-md cursor-pointer hover:underline">
                        @{activeAccent.startsWith("#") ? t("settings.theme.customColor", "Personalizado") : (APP_COLORS[activeAccent]?.name || "Lavender")}
                      </span>
                      {t("settings.theme.previewMsg2After", "!")}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column: Controls and status */}
            <div className="lg:col-span-5 bg-onicord-base/70 border border-onicord-border rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-inner min-h-[250px]">
              <div className="text-xs font-bold uppercase tracking-wider text-onicord-muted text-left">
                {t("settings.theme.controlsTitle", "Controles y Estado")}
              </div>

              {/* Fila de 2 Botones */}
              <div className="grid grid-cols-2 gap-2.5 w-full">
                <button
                  type="button"
                  className="h-10 px-3 rounded-xl bg-onicord-accent text-onicord-on-accent font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer truncate"
                >
                  <MaterialIcon name="check" size={16} />
                  <span>{t("common.save", "Guardar")}</span>
                </button>
                <button
                  type="button"
                  className="h-10 px-3 rounded-xl bg-onicord-danger/15 hover:bg-onicord-danger/25 text-onicord-danger font-medium text-xs border border-onicord-danger/30 flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer truncate"
                >
                  <MaterialIcon name="delete" size={16} />
                  <span>{t("common.delete", "Eliminar")}</span>
                </button>
              </div>

              {/* Fila: Interruptor de Estado */}
              <div className="bg-onicord-surface/40 border border-onicord-border rounded-xl px-4 py-3.5 flex items-center justify-between">
                <span className="text-sm font-medium text-onicord-text select-none">
                  {t("settings.theme.previewToggle", "Interruptor de Estado")}
                </span>
                <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={previewToggle}
                    onChange={(e) => setPreviewToggle(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="onicord-toggle-slider" />
                </label>
              </div>

              {/* Fila: Nivel de Desplazamiento */}
              <div className="bg-onicord-surface/40 border border-onicord-border rounded-xl px-4 py-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-sm font-medium select-none">
                  <span className="text-onicord-text">{t("settings.theme.scrollLevel", "Nivel de Desplazamiento")}</span>
                  <span className="font-mono text-xs font-bold text-onicord-muted">{previewSliderVal}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={previewSliderVal}
                  onChange={(e) => setPreviewSliderVal(Number(e.target.value))}
                  className="onicord-range-input"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CARD 3: DYNAMIC BACKGROUND SETTINGS */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between">
          <h3 className="onicord-settings-section-title !mb-0">
            <span>{t("settings.theme.dynamicColorsTitle", "Estructura y Tono del Fondo")}</span>
          </h3>
          {(bgSaturation !== 50 || bgLightness !== 0) && (
            <button
              type="button"
              onClick={handleResetBgDefaults}
              className="text-2xs font-bold text-onicord-accent bg-onicord-tint/5 hover:bg-onicord-hover px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            >
              {t("settings.theme.resetThemeDefaults", "Restablecer Fondo")}
            </button>
          )}
        </div>
        <p className="onicord-settings-row-desc">
          {t("settings.theme.dynamicColorsDesc", "Ajusta la intensidad del color de fondo y la profundidad del contraste.")}
        </p>

        <div>
          {/* Saturation */}
          <div className="onicord-settings-slider-row">
            <div className="flex justify-between items-center text-xs font-semibold text-onicord-text">
              <span>{t("settings.theme.bgSaturation", "Saturación del Fondo")}</span>
              <span className="font-mono text-onicord-accent font-bold">{bgSaturation}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="150"
              step="5"
              value={bgSaturation}
              onChange={handleSaturationChange}
              className="onicord-range-input"
            />
          </div>

          {/* Lightness */}
          <div className="onicord-settings-slider-row">
            <div className="flex justify-between items-center text-xs font-semibold text-onicord-text">
              <span>{t("settings.theme.bgLightness", "Luminosidad del Fondo")}</span>
              <span className="font-mono text-onicord-accent font-bold">
                {bgLightness > 0 ? `+${bgLightness}%` : `${bgLightness}%`}
              </span>
            </div>
            <input
              type="range"
              min="-20"
              max="20"
              step="1"
              value={bgLightness}
              onChange={handleLightnessChange}
              className="onicord-range-input"
            />
          </div>

          <div className="onicord-settings-divider" />

          {/* Windows 11 Mica translucency */}
          <div className="onicord-settings-row !pt-1">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.theme.windowMicaTitle", "Ventana Translúcida (Mica)")}
              </p>
              <p className="onicord-settings-row-desc">
                {t(
                  "settings.theme.windowMicaDesc",
                  "Aplica el material Mica de Windows 11 para reflejar sutilmente el fondo de tu escritorio detrás de la aplicación."
                )}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={windowMica}
                onChange={handleToggleMica}
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>
        </div>
      </div>

      {/* Custom CSS stylesheet editor */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="onicord-settings-section-title !mb-0">
              <span>{t("settings.theme.customCSS", "Estilos CSS Personalizados")}</span>
            </h3>
            {safeMode && (
              <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-onicord-danger/15 border border-onicord-danger/30 text-onicord-danger shrink-0">
                {t("settings.theme.cssSafeModeBadge", "Modo seguro")}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <label
              className="relative inline-flex items-center cursor-pointer select-none shrink-0 mr-1"
              title={
                cssEnabled
                  ? t("settings.theme.disableCSS", "Desactivar CSS personalizado")
                  : t("settings.theme.enableCSS", "Activar CSS personalizado")
              }
            >
              <input
                type="checkbox"
                checked={cssEnabled}
                onChange={handleToggleCSS}
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>

            <button
              type="button"
              onClick={() => setShowTokensGuide((prev) => !prev)}
              title={t("settings.theme.cssTokensGuide", "Guía de variables CSS")}
              className={cn(
                "w-8 h-8 rounded-lg border transition active:scale-95 cursor-pointer flex items-center justify-center",
                showTokensGuide
                  ? "bg-onicord-accent text-onicord-on-accent border-onicord-accent"
                  : "bg-onicord-base hover:bg-onicord-overlay border-onicord-border-strong text-onicord-text"
              )}
            >
              <MaterialIcon name="data_object" size={16} />
            </button>

            <button
              type="button"
              onClick={handleImportCSSClick}
              title={t("settings.theme.importCSS", "Importar archivo .css")}
              className="w-8 h-8 rounded-lg bg-onicord-base hover:bg-onicord-overlay border border-onicord-border-strong text-onicord-text transition active:scale-95 cursor-pointer flex items-center justify-center"
            >
              <MaterialIcon name="upload_file" size={16} />
            </button>

            {customCSS && (
              <button
                type="button"
                onClick={handleExportCSS}
                title={t("settings.theme.exportCSS", "Exportar archivo .css")}
                className="w-8 h-8 rounded-lg bg-onicord-base hover:bg-onicord-overlay border border-onicord-border-strong text-onicord-text transition active:scale-95 cursor-pointer flex items-center justify-center"
              >
                <MaterialIcon name="download" size={16} />
              </button>
            )}

            <button
              type="button"
              onClick={handleInsertTemplate}
              title={t("settings.theme.insertTemplate", "Plantilla de ejemplo")}
              className="w-8 h-8 rounded-lg bg-onicord-base hover:bg-onicord-overlay border border-onicord-border-strong text-onicord-text transition active:scale-95 cursor-pointer flex items-center justify-center"
            >
              <MaterialIcon name="code" size={16} />
            </button>

            <button
              type="button"
              onClick={() => setIsCssModalOpen(true)}
              title={t("settings.theme.expandEditor", "Expandir editor")}
              className="w-8 h-8 rounded-lg bg-onicord-base hover:bg-onicord-overlay border border-onicord-border-strong text-onicord-text transition active:scale-95 cursor-pointer flex items-center justify-center"
            >
              <MaterialIcon name="open_in_full" size={16} />
            </button>

            {customCSS && (
              <button
                type="button"
                onClick={handleClearCSS}
                title={t("settings.theme.clearCSS", "Limpiar CSS")}
                className="w-8 h-8 rounded-lg bg-onicord-danger/15 hover:bg-onicord-danger/25 border border-onicord-danger/30 text-onicord-danger transition active:scale-95 cursor-pointer flex items-center justify-center"
              >
                <MaterialIcon name="delete" size={16} />
              </button>
            )}
          </div>
        </div>

        <p className="onicord-settings-row-desc pb-2">
          {t("settings.theme.customCSSDesc", "Escribe tus propios selectores para inyectar anulaciones globales en tiempo real.")}
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".css,text/css"
          onChange={handleImportFileChange}
          className="hidden"
        />

        {safeMode && (
          <div className="rounded-xl border border-onicord-danger/30 bg-onicord-danger/10 px-3.5 py-2.5 text-xs text-onicord-text flex items-center gap-2.5 !mb-2">
            <MaterialIcon name="shield" size={16} className="text-onicord-danger shrink-0" />
            <span>
              {t(
                "settings.theme.cssSafeModeWarning",
                "Modo seguro activo (?safecss=1): el CSS personalizado no se está aplicando en esta sesión para que puedas editarlo o limpiarlo."
              )}
            </span>
          </div>
        )}

        {cssImportError && (
          <div className="rounded-xl border border-onicord-danger/30 bg-onicord-danger/10 px-3.5 py-2 text-xs text-onicord-danger flex items-center gap-2 !mb-2">
            <MaterialIcon name="error_outline" size={15} className="shrink-0" />
            <span>{cssImportError}</span>
          </div>
        )}

        {showTokensGuide && (
          <div className="rounded-xl border border-onicord-border bg-onicord-base/60 p-3 space-y-2 !mb-2">
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
                  className="px-2 py-1 rounded-lg bg-onicord-surface border border-onicord-border hover:border-onicord-accent/50 text-xs font-mono text-onicord-accent transition cursor-pointer"
                >
                  {item.token}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={cn("relative font-mono transition-opacity", !cssEnabled && "opacity-60")}>
          <textarea
            value={customCSS}
            onChange={handleCSSChange}
            onBlur={handleCSSBlur}
            onKeyDown={(e) => handleCssTextareaKeyDown(e, customCSS, handleCSSValueChange)}
            placeholder={t("settings.theme.customCSSPlaceholder", "/* Escribe reglas CSS personalizadas aquí */\n.onicord-chat-input-bar {\n  border-color: var(--onicord-accent) !important;\n}")}
            className="w-full h-36 min-h-[144px] bg-onicord-base/80 border border-onicord-border-strong rounded-xl p-3.5 text-xs text-onicord-accent placeholder-onicord-muted/30 focus:outline-none focus:border-onicord-accent transition-colors resize-y font-mono leading-relaxed shadow-inner minimal-scrollbar select-text"
            spellCheck="false"
          />
          <div className="flex flex-wrap justify-between items-center gap-2 mt-1.5 px-1 text-2xs text-onicord-muted">
            <div className="flex items-center gap-2">
              <span>
                {!cssEnabled
                  ? t("settings.theme.cssDisabledHint", "El CSS personalizado está desactivado temporalmente.")
                  : t("settings.theme.cssHint", "Las reglas CSS escritas aquí se aplican instantáneamente en toda la aplicación.")}
              </span>
              {!braceStatus.valid && (
                <span className="text-onicord-danger font-semibold flex items-center gap-1">
                  <MaterialIcon name="warning" size={12} />
                  {t("settings.theme.cssBraceWarning", {
                    unclosed: braceStatus.unclosedCount,
                    extra: braceStatus.extraClosingCount,
                    defaultValue: "Llaves desbalanceadas",
                  })}
                </span>
              )}
            </div>
            <span className="font-mono">{t("settings.theme.charCount", { count: customCSS.length, defaultValue: `${customCSS.length} caracteres` })}</span>
          </div>
        </div>
      </div>

      <CustomCssEditorModal
        isOpen={isCssModalOpen}
        onClose={() => setIsCssModalOpen(false)}
        value={customCSS}
        onChange={handleCSSValueChange}
        enabled={cssEnabled}
        onToggleEnabled={handleToggleCSS}
        onImportClick={handleImportCSSClick}
        onExportClick={handleExportCSS}
        onInsertTemplate={handleInsertTemplate}
        onClear={handleClearCSS}
        braceStatus={braceStatus}
        safeMode={safeMode}
      />
    </div>
  );
}
