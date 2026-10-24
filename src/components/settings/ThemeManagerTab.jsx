import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import ColorPicker from "../ui/ColorPicker";
import { APP_COLORS, applyDynamicTheme } from "../../lib/colors";

const STORAGE_THEME_KEY = "onicord_active_accent";
const STORAGE_CUSTOM_CSS_KEY = "onicord_theme_custom_css";
const STORAGE_BG_SATURATION_KEY = "onicord_bg_saturation";
const STORAGE_BG_LIGHTNESS_KEY = "onicord_bg_lightness";
const STORAGE_THEME_MODE_KEY = "onicord_theme_mode";

export default function ThemeManagerTab({ profile }) {
  const { t } = useTranslation();
  const [activeAccent, setActiveAccent] = useState("lavender");
  const [customCSS, setCustomCSS] = useState("");
  const [bgSaturation, setBgSaturation] = useState(50);
  const [bgLightness, setBgLightness] = useState(0);
  const [themeMode, setThemeMode] = useState("dark");
  const [previewSliderVal, setPreviewSliderVal] = useState(75);
  const [previewToggle, setPreviewToggle] = useState(true);

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
    const savedCSS = localStorage.getItem(STORAGE_CUSTOM_CSS_KEY) || "";
    const savedSat = localStorage.getItem(STORAGE_BG_SATURATION_KEY);
    const savedLight = localStorage.getItem(STORAGE_BG_LIGHTNESS_KEY);
    const savedMode = localStorage.getItem(STORAGE_THEME_MODE_KEY) || "dark";

    const satVal = savedSat !== null ? Number(savedSat) : 50;
    const lightVal = savedLight !== null ? Number(savedLight) : 0;

    setActiveAccent(savedAccent);
    setCustomCSS(savedCSS);
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
      let styleTag = document.getElementById("onicord-runtime-styles");
      if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = "onicord-runtime-styles";
        document.head.appendChild(styleTag);
      }
      styleTag.innerHTML = savedCSS;
    }
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

  const handleCSSChange = (e) => {
    const code = e.target.value;
    setCustomCSS(code);
    localStorage.setItem(STORAGE_CUSTOM_CSS_KEY, code);

    let styleTag = document.getElementById("onicord-runtime-styles");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "onicord-runtime-styles";
      document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = code;
  };

  const handleClearCSS = () => {
    setCustomCSS("");
    localStorage.removeItem(STORAGE_CUSTOM_CSS_KEY);
    const styleTag = document.getElementById("onicord-runtime-styles");
    if (styleTag) {
      styleTag.innerHTML = "";
    }
  };

  const handleInsertTemplate = () => {
    const newCode = customCSS ? `${customCSS}\n\n${SAMPLE_CSS_TEMPLATE}` : SAMPLE_CSS_TEMPLATE;
    setCustomCSS(newCode);
    localStorage.setItem(STORAGE_CUSTOM_CSS_KEY, newCode);

    let styleTag = document.getElementById("onicord-runtime-styles");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "onicord-runtime-styles";
      document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = newCode;
  };

  return (
    <div className="onicord-settings-container">
      {/* TARJETA 1: MODO DE TEMA */}
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
                ? "border-onicord-accent bg-onicord-surface shadow-md ring-1 ring-onicord-accent/30"
                : "border-white/5 bg-onicord-base/40 hover:border-white/20"
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${themeMode === "dark" ? "bg-onicord-accent text-onicord-dark font-bold" : "bg-white/5 text-onicord-muted"}`}>
              <MaterialIcon name="dark_mode" size={18} />
            </div>
            <div className="text-left min-w-0">
              <div className="text-xs font-bold text-onicord-text truncate">
                {t("settings.theme.modeDark", "Oscuro")}
              </div>
              <div className="text-[10px] text-onicord-muted truncate">
                {t("settings.theme.modeDarkSub", "Catppuccin Mocha")}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleModeSelect("light")}
            className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
              themeMode === "light"
                ? "border-onicord-accent bg-onicord-surface shadow-md ring-1 ring-onicord-accent/30"
                : "border-white/5 bg-onicord-base/40 hover:border-white/20"
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${themeMode === "light" ? "bg-onicord-accent text-onicord-dark font-bold" : "bg-white/5 text-onicord-muted"}`}>
              <MaterialIcon name="light_mode" size={18} />
            </div>
            <div className="text-left min-w-0">
              <div className="text-xs font-bold text-onicord-text truncate">
                {t("settings.theme.modeLight", "Claro")}
              </div>
              <div className="text-[10px] text-onicord-muted truncate">
                {t("settings.theme.modeLightSub", "Catppuccin Latte")}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* TARJETA 2: COLOR DE ACENTO Y PREVISUALIZACIÓN REALISTA */}
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

        {/* PREVISUALIZACIÓN REALISTA EN TIEMPO REAL */}
        <div className="pt-4 border-t border-white/5 space-y-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-onicord-muted flex items-center gap-2">
            <MaterialIcon name="visibility" size={16} />
            <span>{t("settings.theme.preview", "Vista previa en tiempo real")}</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch pt-0.5">
            {/* COLUMNA IZQUIERDA: VISTA PREVIA DEL CHAT (# GENERAL) */}
            <div className="lg:col-span-7 bg-onicord-base/70 border border-white/5 rounded-2xl overflow-hidden flex flex-col shadow-inner min-h-[250px]">
              {/* Encabezado del canal */}
              <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-white/5 select-none bg-onicord-base/30">
                <span className="text-onicord-muted font-bold text-base leading-none">#</span>
                <span className="text-onicord-text font-bold text-sm tracking-normal">general</span>
              </div>

              {/* Mensajes del chat */}
              <div className="p-4 space-y-4 text-left flex-1 font-sans">
                {/* Mensaje 1 (Autor principal + segundo mensaje agrupado) */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-onicord-accent shadow-sm flex items-center justify-center">
                    {profile?.avatar ? (
                      <img src={profile.avatar} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <span className="text-onicord-dark font-bold text-base">
                        {(profile?.nickname || "O").charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm text-onicord-text leading-tight cursor-default">
                      {profile?.nickname || "Oniverse"}
                    </div>
                    <div
                      className="whitespace-pre-wrap break-words text-[13px] text-onicord-subtext select-text mt-1"
                      style={{ lineHeight: "var(--onicord-chat-line-height, 1.45)" }}
                    >
                      ¡Hola a todos! Este es un mensaje de prueba con una mención a{" "}
                      <span className="inline-flex items-center font-semibold text-onicord-accent bg-onicord-accent/15 px-1.5 py-0.5 rounded-md cursor-pointer hover:underline">
                        @Admin
                      </span>{" "}
                      usando la nueva paleta.
                    </div>
                    <div
                      className="whitespace-pre-wrap break-words text-[13px] text-onicord-subtext select-text mt-3"
                      style={{ lineHeight: "var(--onicord-chat-line-height, 1.45)" }}
                    >
                      Este segundo mensaje está agrupado sin repetir la foto ni el nombre de usuario.
                    </div>
                  </div>
                </div>

                {/* Mensaje 2 (Segundo autor: Alex) */}
                <div className="flex items-start gap-3 pt-1">
                  <div className="w-10 h-10 rounded-full shrink-0 bg-[#8c74bd] text-white shadow-sm flex items-center justify-center font-bold text-base">
                    A
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm text-purple-300 leading-tight cursor-default">
                      Alex (Moderador)
                    </div>
                    <div
                      className="whitespace-pre-wrap break-words text-[13px] text-onicord-subtext select-text mt-1 min-h-[38px]"
                      style={{ lineHeight: "var(--onicord-chat-line-height, 1.45)" }}
                    >
                      ¡Quedó excelente el acento de color{" "}
                      <span className="inline-flex items-center font-medium text-onicord-accent bg-onicord-accent/15 px-1.5 py-0.5 rounded-md cursor-pointer hover:underline">
                        @{activeAccent.startsWith("#") ? t("settings.theme.customColor", "Personalizado") : (APP_COLORS[activeAccent]?.name || "Lavender")}
                      </span>!
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* COLUMNA DERECHA: CONTROLES Y ESTADO */}
            <div className="lg:col-span-5 bg-onicord-base/70 border border-white/5 rounded-2xl p-4 flex flex-col justify-between gap-3 shadow-inner min-h-[250px]">
              <div className="text-[11px] font-bold uppercase tracking-wider text-onicord-muted text-left">
                {t("settings.theme.controlsTitle", "Controles y Estado")}
              </div>

              {/* Fila de 2 Botones */}
              <div className="grid grid-cols-2 gap-2.5 w-full">
                <button
                  type="button"
                  className="h-10 px-3 rounded-xl bg-onicord-accent text-onicord-dark font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer truncate"
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
              <div className="bg-onicord-surface/40 border border-white/5 rounded-xl px-4 py-3.5 flex items-center justify-between">
                <span className="text-[13px] font-medium text-onicord-text select-none">
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
              <div className="bg-onicord-surface/40 border border-white/5 rounded-xl px-4 py-3.5 space-y-2.5">
                <div className="flex items-center justify-between text-[13px] font-medium select-none">
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

      {/* TARJETA 3: AJUSTES DINÁMICOS DE FONDO */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between">
          <h3 className="onicord-settings-section-title !mb-0">
            <span>{t("settings.theme.dynamicColorsTitle", "Estructura y Tono del Fondo")}</span>
          </h3>
          {(bgSaturation !== 50 || bgLightness !== 0) && (
            <button
              type="button"
              onClick={handleResetBgDefaults}
              className="text-[10px] font-bold text-onicord-accent hover:underline bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
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
        </div>
      </div>

      {/* TARJETA 4: EDITOR CSS PERSONALIZADO */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="onicord-settings-section-title !mb-0">
            <span>{t("settings.theme.customCSS", "Estilos CSS Personalizados")}</span>
          </h3>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleInsertTemplate}
              title={t("settings.theme.insertTemplate", "Plantilla de ejemplo")}
              className="w-8 h-8 rounded-lg bg-onicord-base hover:bg-onicord-overlay border border-white/10 text-onicord-text transition active:scale-95 cursor-pointer flex items-center justify-center"
            >
              <MaterialIcon name="code" size={16} />
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

        <p className="onicord-settings-row-desc mb-3">
          {t("settings.theme.customCSSDesc", "Escribe tus propios selectores para inyectar anulaciones globales en tiempo real.")}
        </p>

        <div className="relative font-mono">
          <textarea
            value={customCSS}
            onChange={handleCSSChange}
            placeholder={`/* Escribe reglas CSS personalizadas aquí */\n.onicord-chat-input-bar {\n  border-color: var(--onicord-accent) !important;\n}`}
            className="w-full h-36 bg-onicord-base/80 border border-white/10 rounded-xl p-3.5 text-xs text-onicord-accent placeholder-onicord-muted/30 focus:outline-none focus:border-onicord-accent transition-colors resize-none font-mono leading-relaxed shadow-inner minimal-scrollbar"
            spellCheck="false"
          />
          <div className="flex justify-between items-center mt-1.5 px-1 text-[10px] text-onicord-muted">
            <span>{t("settings.theme.cssHint", "Las reglas CSS escritas aquí se aplican instantáneamente en toda la aplicación.")}</span>
            <span className="font-mono">{customCSS.length} caracteres</span>
          </div>
        </div>
      </div>
    </div>
  );
}
