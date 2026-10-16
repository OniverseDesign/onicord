import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_GENERAL } from "../../lib/generalSettings";
import { soundEngine } from "../../lib/soundEngine";
import { SUPPORTED_LANGUAGES } from "../../i18n/languages";

const STORAGE_LINE_HEIGHT_KEY = "onicord_chat_line_height";

export default function GeneralTab({ general, setGeneral }) {
  const { t, i18n } = useTranslation();
  const [cacheStats, setCacheStats] = useState({ count: 0, sizeFormatted: "0 B" });
  const [chatLineHeight, setChatLineHeight] = useState("1.5");

  const [sfxVolume, setSfxVolume] = useState(() =>
    Math.round(soundEngine.getVolume() * 100)
  );
  const [sfxPack, setSfxPack] = useState(() => soundEngine.getPack());
  const [typingSfxEnabled, setTypingSfxEnabled] = useState(() =>
    soundEngine.isTypingEnabled()
  );
  const [widgetSfxEnabled, setWidgetSfxEnabled] = useState(() =>
    soundEngine.isWidgetSoundsEnabled()
  );
  const [navSfxEnabled, setNavSfxEnabled] = useState(() =>
    soundEngine.isNavSoundsEnabled()
  );

  const handleSfxVolumeChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setSfxVolume(val);
    soundEngine.setVolume(val / 100);
    soundEngine.playVolumeChange();
  };

  const handleSfxPackChange = (e) => {
    const newPack = e.target.value;
    setSfxPack(newPack);
    soundEngine.setPack(newPack);
    soundEngine.playCue("success");
  };

  useEffect(() => {
    window.electronAPI?.getTotalCacheStats?.().then(setCacheStats);
    const savedLineHeight = localStorage.getItem(STORAGE_LINE_HEIGHT_KEY) || "1.5";
    setChatLineHeight(savedLineHeight);
  }, []);

  const handleChange = (key, value) => {
    setGeneral((prev) => ({
      ...prev,
      [key]: value,
    }));

    if (key === "language") {
      i18n.changeLanguage(value);
      localStorage.setItem("onicord_language", value);
    }

    if (key === "zoomLevel") {
      document.documentElement.style.zoom = value / 100;
      localStorage.setItem("onicord_zoom_level", value);
    }

    if (key === "enableSoundEffects") {
      soundEngine.setEnabled(value);
    }
  };

  const handleLineHeightChange = (e) => {
    const val = e.target.value;
    setChatLineHeight(val);
    localStorage.setItem(STORAGE_LINE_HEIGHT_KEY, val);
    document.documentElement.style.setProperty("--onicord-chat-line-height", val);
  };

  return (
    <div className="onicord-settings-container">
      {/* TARJETA 1: INTERFAZ E IDIOMA */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.general.interface", "Interfaz de Usuario e Idioma")}</span>
        </h3>

        <div>
          {/* Idioma (Fila con select) */}
          <div className="onicord-settings-input-row">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.language", "Idioma de la Aplicación")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.languageDesc", "Selecciona el idioma principal de la interfaz.")}
              </p>
            </div>
            <select
              value={general.language || "es"}
              onChange={(e) => handleChange("language", e.target.value)}
              className="onicord-select w-[150px] shrink-0 h-9 text-xs"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.nativeName}
                </option>
              ))}
            </select>
          </div>

          {/* Zoom Level (Fila con slider) */}
          <div className="onicord-settings-slider-row">
            <div className="flex justify-between items-center">
              <div className="min-w-0 pr-2">
                <p className="onicord-settings-row-title">
                  {t("settings.general.zoom", "Escala de la Interfaz")}
                </p>
                <p className="onicord-settings-row-desc">
                  {t("settings.general.zoomDesc", "Ajusta el tamaño global de los elementos visuales.")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-onicord-base/40 p-2.5 rounded-xl border border-white/5 mt-1">
              <span className="text-[11px] text-onicord-muted font-mono font-bold select-none min-w-[32px]">
                80%
              </span>
              <input
                type="range"
                min="80"
                max="120"
                step="5"
                value={general.zoomLevel || 100}
                onChange={(e) =>
                  handleChange("zoomLevel", Number(e.target.value))
                }
                className="onicord-range-input flex-1"
              />
              <span className="text-[11px] text-onicord-accent font-mono font-bold select-none min-w-[36px] text-right">
                {general.zoomLevel || 100}%
              </span>
            </div>
          </div>

          {/* Interlineado del Chat (Fila con slider) */}
          <div className="onicord-settings-slider-row">
            <div className="flex justify-between items-center">
              <div className="min-w-0 pr-2">
                <p className="onicord-settings-row-title">
                  {t("settings.theme.lineSpacing", "Interlineado del Chat")}
                </p>
                <p className="onicord-settings-row-desc">
                  {t("settings.theme.lineSpacingDesc", "Ajusta la altura de línea de los mensajes para mayor legibilidad.")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-onicord-base/40 p-2.5 rounded-xl border border-white/5 mt-1">
              <span className="text-[11px] text-onicord-muted font-mono font-bold select-none min-w-[32px]">
                1.2x
              </span>
              <input
                type="range"
                min="1.2"
                max="2.0"
                step="0.1"
                value={chatLineHeight}
                onChange={handleLineHeightChange}
                className="onicord-range-input flex-1"
              />
              <span className="text-[11px] text-onicord-accent font-mono font-bold select-none min-w-[36px] text-right">
                {chatLineHeight}x
              </span>
            </div>
          </div>

          {/* Continuous Animations (Fila con switch) */}
          <div className="onicord-settings-row">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.continuousAnimations", "Animaciones de Fondo Continuas")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.continuousAnimationsDesc", "Permite efectos visuales y marquesinas fluidas.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={general.enableContinuousAnimations ?? true}
                onChange={(e) =>
                  handleChange("enableContinuousAnimations", e.target.checked)
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          {/* Sugerencias de mensajes rápidos */}
          <div className="onicord-settings-row">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.enableQuickSuggestions", "Sugerencias de mensajes rápidos")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.enableQuickSuggestionsDesc", "Muestra comandos rápidos e historial sugerido.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={general.enableQuickSuggestions ?? true}
                onChange={(e) =>
                  handleChange("enableQuickSuggestions", e.target.checked)
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>
        </div>
      </div>

      {/* TARJETA 2: INTEGRACIÓN CON EL SISTEMA */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.general.systemIntegration", "Integración con el Sistema")}</span>
        </h3>

        <div>
          <div className="onicord-settings-row">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.openAtLogin", "Abrir Onicord al iniciar el sistema")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.openAtLoginDesc", "Ejecuta Onicord automáticamente cuando enciendes tu equipo.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={general.openAtLogin ?? false}
                onChange={(e) =>
                  handleChange("openAtLogin", e.target.checked)
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          <div className="onicord-settings-row">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.minimizeToTray", "Minimizar a la bandeja del sistema")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.minimizeToTrayDesc", "Al cerrar la ventana, la aplicación seguirá en segundo plano.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={general.minimizeToTray ?? true}
                onChange={(e) =>
                  handleChange("minimizeToTray", e.target.checked)
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          <div className={`onicord-settings-row transition-opacity duration-200 ${!general.openAtLogin ? "opacity-40" : ""}`}>
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.startMinimized", "Iniciar minimizado")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.startMinimizedDesc", "Inicia silenciosamente en la bandeja sin abrir la ventana.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                disabled={!general.openAtLogin}
                checked={general.startMinimized ?? false}
                onChange={(e) =>
                  handleChange("startMinimized", e.target.checked)
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>
        </div>
      </div>

      {/* TARJETA 3: NOTIFICACIONES Y SONIDOS */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.general.notificationsAndSounds", "Notificaciones y Sonidos")}</span>
        </h3>

        <div>
          <div className="onicord-settings-row">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.desktopNotifications", "Notificaciones de escritorio")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.desktopNotificationsDesc", "Avisos visuales cuando recibes mensajes o menciones.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={general.enableNotifications ?? true}
                onChange={(e) =>
                  handleChange("enableNotifications", e.target.checked)
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          <div className="onicord-settings-row">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.soundEffects", "Efectos de sonido de la interfaz")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.soundEffectsDesc", "Sonidos interactivos al conectar, mutear o recibir llamados.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={general.enableSoundEffects ?? true}
                onChange={(e) =>
                  handleChange("enableSoundEffects", e.target.checked)
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          {/* Paquete de Sonidos (Fila con select - estilo idéntico a Idioma) */}
          <div className={`onicord-settings-input-row transition-opacity duration-200 ${general.enableSoundEffects === false ? "opacity-40" : ""}`}>
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.sfx.pack", "Paquete de Sonidos")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.sfx.packDesc", "Estilo acústico para las interacciones y respuestas del sistema.")}
              </p>
            </div>
            <select
              value={sfxPack}
              disabled={general.enableSoundEffects === false}
              onChange={handleSfxPackChange}
              className="onicord-select w-[150px] shrink-0 h-9 text-xs"
            >
              <option value="minimal">{t("settings.sfxPacks.minimal", "Minimal")}</option>
              <option value="zen">{t("settings.sfxPacks.zen", "Zen")}</option>
              <option value="soft">{t("settings.sfxPacks.soft", "Soft")}</option>
              <option value="glass">{t("settings.sfxPacks.glass", "Glass")}</option>
              <option value="arcade">{t("settings.sfxPacks.arcade", "Arcade")}</option>
              <option value="mechanical">{t("settings.sfxPacks.mechanical", "Mechanical")}</option>
              <option value="organic">{t("settings.sfxPacks.organic", "Organic")}</option>
              <option value="dreamy">{t("settings.sfxPacks.dreamy", "Dreamy")}</option>
              <option value="scifi">{t("settings.sfxPacks.scifi", "Sci-Fi")}</option>
              <option value="rubber">{t("settings.sfxPacks.rubber", "Rubber")}</option>
              <option value="cinematic">{t("settings.sfxPacks.cinematic", "Cinematic")}</option>
              <option value="studio">{t("settings.sfxPacks.studio", "Studio")}</option>
            </select>
          </div>

          {/* Volumen de Efectos (Fila con slider - estilo idéntico a Escala) */}
          <div className={`onicord-settings-slider-row transition-opacity duration-200 ${general.enableSoundEffects === false ? "opacity-40" : ""}`}>
            <div className="flex justify-between items-center">
              <div className="min-w-0 pr-2">
                <p className="onicord-settings-row-title">
                  {t("settings.sfx.volume", "Volumen de Efectos")}
                </p>
                <p className="onicord-settings-row-desc">
                  {t("settings.sfx.volumeDesc", "Nivel de volumen general para los efectos y avisos acústicos.")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-onicord-base/40 p-2.5 rounded-xl border border-white/5 mt-1">
              <span className="text-[11px] text-onicord-muted font-mono font-bold select-none min-w-[32px]">
                0%
              </span>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                disabled={general.enableSoundEffects === false}
                value={sfxVolume}
                onChange={handleSfxVolumeChange}
                className="onicord-range-input flex-1"
              />
              <span className="text-[11px] text-onicord-accent font-mono font-bold select-none min-w-[36px] text-right">
                {sfxVolume}%
              </span>
            </div>
          </div>

          {/* Sonido de Escritura */}
          <div className={`onicord-settings-row transition-opacity duration-200 ${general.enableSoundEffects === false ? "opacity-40" : ""}`}>
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.sfx.typing", "Sonido de escritura de otros usuarios")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.sfx.typingDesc", "Reproduce un pulso sutil cuando otros usuarios escriben en el canal activo.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                disabled={general.enableSoundEffects === false}
                checked={typingSfxEnabled}
                onChange={(e) => {
                  const val = e.target.checked;
                  setTypingSfxEnabled(val);
                  soundEngine.setTypingEnabled(val);
                }}
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          {/* Sonidos Hápticos de Widgets */}
          <div className={`onicord-settings-row transition-opacity duration-200 ${general.enableSoundEffects === false ? "opacity-40" : ""}`}>
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.sfx.widgets", "Sonidos hápticos de widgets")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.sfx.widgetsDesc", "Efectos acústicos al arrastrar, encajar y redimensionar widgets en el dashboard.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                disabled={general.enableSoundEffects === false}
                checked={widgetSfxEnabled}
                onChange={(e) => {
                  const val = e.target.checked;
                  setWidgetSfxEnabled(val);
                  soundEngine.setWidgetSoundsEnabled(val);
                }}
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          {/* Sonidos de Navegación */}
          <div className={`onicord-settings-row transition-opacity duration-200 ${general.enableSoundEffects === false ? "opacity-40" : ""}`}>
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.sfx.navigation", "Sonidos de navegación")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.sfx.navigationDesc", "Cues acústicos al cambiar canales y desplegar o colapsar categorías.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                disabled={general.enableSoundEffects === false}
                checked={navSfxEnabled}
                onChange={(e) => {
                  const val = e.target.checked;
                  setNavSfxEnabled(val);
                  soundEngine.setNavSoundsEnabled(val);
                }}
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>
        </div>
      </div>

      {/* TARJETA 4: RENDIMIENTO */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.general.performance", "Rendimiento y Hardware")}</span>
        </h3>

        <div className="onicord-settings-row">
          <div className="min-w-0 pr-4">
            <p className="onicord-settings-row-title">
              {t("settings.general.disableHardwareAccel", "Desactivar aceleración por hardware")}
            </p>
            <p className="onicord-settings-row-desc">
              {t("settings.general.disableHardwareAccelDesc", "Desactiva la renderización mediante GPU.")}
            </p>
            <p className="text-[10px] text-onicord-danger font-medium mt-1">
              {t("settings.general.restartWarning", "Requiere reiniciar la aplicación.")}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={general.disableHardwareAcceleration ?? false}
              onChange={(e) =>
                handleChange(
                  "disableHardwareAcceleration",
                  e.target.checked,
                )
              }
              className="sr-only peer"
            />
            <div className="onicord-toggle-slider" />
          </label>
        </div>
      </div>

      {/* BOTÓN RESTABLECER */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => setGeneral({ ...DEFAULT_GENERAL })}
          className="onicord-btn-danger-soft block w-full text-center py-2.5"
        >
          {t("settings.general.resetGeneral", "Restablecer ajustes generales por defecto")}
        </button>
      </div>
    </div>
  );
}
