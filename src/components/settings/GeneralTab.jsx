import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_GENERAL } from "../../lib/generalSettings";
import { soundEngine, SFX_LEVEL } from "../../lib/soundEngine";
import { SUPPORTED_LANGUAGES } from "../../i18n/languages";
import Select from "../ui/Select";
import MaterialIcon from "../icons/MaterialIcon";
import { useStreamerMode } from "../../context/StreamerModeContext";

const STORAGE_LINE_HEIGHT_KEY = "onicord_chat_line_height";

export const AUTO_DOWNLOAD_SIZE_STEPS = [
  { value: 10, label: "10 MB" },
  { value: 25, label: "25 MB" },
  { value: 50, label: "50 MB" },
  { value: 100, label: "100 MB" },
  { value: 250, label: "250 MB" },
  { value: 500, label: "500 MB" },
  { value: 1024, label: "1 GB" },
  { value: 2048, label: "2 GB" },
  { value: 5120, label: "5 GB" },
  { value: 10240, label: "10 GB" },
  { value: -1, label: "Sin límite" },
];

export default function GeneralTab({ general, setGeneral }) {
  const { t, i18n } = useTranslation();
  const [cacheStats, setCacheStats] = useState({ count: 0, sizeFormatted: "0 B" });
  const [chatLineHeight, setChatLineHeight] = useState("1.5");
  const [defaultDownloadDir, setDefaultDownloadDir] = useState("");

  const {
    isStreamerMode,
    detectedApp,
    autoEnabled,
    manualActive,
    setAutoEnabled,
    toggleManual,
  } = useStreamerMode();

  const [sfxLevel, setSfxLevel] = useState(() => {
    if (general?.sfxLevel !== undefined) return Number(general.sfxLevel);
    return soundEngine.getLevel();
  });

  useEffect(() => {
    if (general?.sfxLevel !== undefined) {
      setSfxLevel(Number(general.sfxLevel));
    }
  }, [general?.sfxLevel]);

  const [sfxVolume, setSfxVolume] = useState(() =>
    Math.round(soundEngine.getVolume() * 100)
  );
  const [sfxPack, setSfxPack] = useState(() => soundEngine.getPack());

  const handleSfxLevelChange = (newLevel) => {
    const lvl = Math.max(0, Math.min(3, parseInt(newLevel, 10) || 0));
    setSfxLevel(lvl);
    soundEngine.setLevel(lvl, true);
    setGeneral((prev) => ({
      ...prev,
      sfxLevel: lvl,
      enableSoundEffects: lvl > 0,
    }));
  };

  const soundLevels = useMemo(
    () => [
      {
        level: 0,
        label: t("settings.sfx.level0", "Silencioso"),
        desc: t(
          "settings.sfx.level0Desc",
          "Todos los sonidos desactivados."
        ),
      },
      {
        level: 1,
        label: t("settings.sfx.level1", "Esencial"),
        desc: t(
          "settings.sfx.level1Desc",
          "Solo voz, silenciarse, ensordecerse, transmisiones y avisos."
        ),
      },
      {
        level: 2,
        label: t("settings.sfx.level2", "Voz y Chat"),
        desc: t(
          "settings.sfx.level2Desc",
          "Esencial más envío y recepción de mensajes y escritura."
        ),
      },
      {
        level: 3,
        label: t("settings.sfx.level3", "Completo"),
        desc: t(
          "settings.sfx.level3Desc",
          "Todos los sonidos de la aplicación e interfaz."
        ),
      },
    ],
    [t]
  );

  const currentLevelMeta = soundLevels[sfxLevel] || soundLevels[2];

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
    if (window.electronAPI?.getDefaultDownloadDirectory) {
      window.electronAPI.getDefaultDownloadDirectory().then((dir) => {
        if (dir) setDefaultDownloadDir(dir);
      });
    }
  }, []);

  const currentDownloadSizeIndex = useMemo(() => {
    const currentVal = general?.autoDownloadMaxSizeMB;
    if (currentVal === -1) return AUTO_DOWNLOAD_SIZE_STEPS.length - 1;
    const exact = AUTO_DOWNLOAD_SIZE_STEPS.findIndex((s) => s.value === currentVal);
    if (exact !== -1) return exact;
    let closestIdx = 5;
    let minDiff = Infinity;
    AUTO_DOWNLOAD_SIZE_STEPS.forEach((step, i) => {
      if (step.value === -1) return;
      const diff = Math.abs(step.value - (currentVal ?? 500));
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });
    return closestIdx;
  }, [general?.autoDownloadMaxSizeMB]);

  const currentDownloadSizeLabel =
    AUTO_DOWNLOAD_SIZE_STEPS[currentDownloadSizeIndex]?.label || "500 MB";

  const handleDownloadSizeIndexChange = (e) => {
    const idx = parseInt(e.target.value, 10);
    const step = AUTO_DOWNLOAD_SIZE_STEPS[idx];
    if (step) {
      handleChange("autoDownloadMaxSizeMB", step.value);
    }
  };

  const handleSelectDirectory = async () => {
    if (!window.electronAPI?.selectDownloadDirectory) return;
    const selected = await window.electronAPI.selectDownloadDirectory();
    if (selected) {
      handleChange("downloadDirectory", selected);
    }
  };

  const handleResetDirectory = () => {
    handleChange("downloadDirectory", "");
  };

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
      document.documentElement.style.zoom = Number(value) / 100;
      document.body.style.zoom = "";
      localStorage.setItem("onicord_zoom_level", String(value));
    }

    if (key === "enableSoundEffects") {
      soundEngine.setEnabled(value);
    }

    if (key === "sfxLevel") {
      soundEngine.setLevel(value, true);
    }

    if (key === "enableContinuousAnimations") {
      try {
        const raw = localStorage.getItem("onicord_general_settings");
        const parsed = raw ? JSON.parse(raw) : {};
        parsed.enableContinuousAnimations = value;
        localStorage.setItem("onicord_general_settings", JSON.stringify(parsed));
        document.documentElement.setAttribute("data-continuous-animations", value ? "true" : "false");
        window.dispatchEvent(
          new CustomEvent("onicord:general-settings-updated", {
            detail: { enableContinuousAnimations: value },
          })
        );
      } catch {}
    }

    if (key === "enableOpenGraph") {
      try {
        const raw = localStorage.getItem("onicord_general_settings");
        const parsed = raw ? JSON.parse(raw) : {};
        parsed.enableOpenGraph = value;
        localStorage.setItem("onicord_general_settings", JSON.stringify(parsed));
        window.dispatchEvent(
          new CustomEvent("onicord:general-settings-updated", {
            detail: { enableOpenGraph: value },
          })
        );
      } catch {}
    }

    if (key === "autoDownloadFiles" || key === "autoDownloadMaxSizeMB" || key === "downloadDirectory") {
      try {
        const raw = localStorage.getItem("onicord_general_settings");
        const parsed = raw ? JSON.parse(raw) : {};
        parsed[key] = value;
        localStorage.setItem("onicord_general_settings", JSON.stringify(parsed));
        window.dispatchEvent(
          new CustomEvent("onicord:general-settings-updated", {
            detail: { [key]: value, ...parsed },
          })
        );
      } catch {}
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
      {/* Interface and language settings */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.general.interface", "Interfaz de Usuario e Idioma")}</span>
        </h3>

        <div>
          {/* Idioma (Fila con select) */}
          <div data-setting-id="language" className="onicord-settings-input-row transition-all">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.language", "Idioma de la Aplicación")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.languageDesc", "Selecciona el idioma principal de la interfaz.")}
              </p>
            </div>
            <Select
              value={general.language || "es"}
              onChange={(e) => handleChange("language", e.target.value)}
              options={SUPPORTED_LANGUAGES.map((lang) => ({
                value: lang.code,
                label: lang.nativeName,
              }))}
              align="right"
              className="w-[170px] shrink-0"
            />
          </div>

          {/* Zoom Level (Fila con slider) */}
          <div data-setting-id="zoomLevel" className="onicord-settings-slider-row transition-all">
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

          {/* Chat line height slider row */}
          <div data-setting-id="lineSpacing" className="onicord-settings-slider-row transition-all">
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
                {t("settings.general.continuousAnimations", "Animaciones continuas")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.continuousAnimationsDesc", "Mantener animados en bucle continuo las imágenes de perfil y los stickers (.webp).")}
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

          {/* Quick message suggestions */}
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

      {/* CARD 2: SYSTEM INTEGRATION */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.general.systemIntegration", "Integración con el Sistema")}</span>
        </h3>

        <div>
          <div data-setting-id="startup" className="onicord-settings-row transition-all">
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

          <div data-setting-id="autoDownloadUpdates" className="onicord-settings-row transition-all">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.autoDownloadUpdates", "Descarga automática de actualizaciones")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.autoDownloadUpdatesDesc", "Descarga las nuevas versiones de Onicord en segundo plano y las instala al reiniciar.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={general.autoDownloadAppUpdates ?? true}
                onChange={(e) =>
                  handleChange("autoDownloadAppUpdates", e.target.checked)
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          <div data-setting-id="minimizeTray" className="onicord-settings-row transition-all">
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

      {/* Notifications and audio settings */}
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

          {/* Sound effects level (segmented button selector) */}
          <div data-setting-id="sfxSettings" className="onicord-settings-row flex-col items-stretch gap-2.5 transition-all">
            <div className="flex justify-between items-start">
              <div className="min-w-0 pr-2">
                <p className="onicord-settings-row-title">
                  {t("settings.sfx.levelTitle", "Nivel de Efectos de Sonido")}
                </p>
                <p className="onicord-settings-row-desc">
                  {currentLevelMeta.desc}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 p-1 bg-onicord-base/40 rounded-xl border border-white/5">
              {soundLevels.map((lvl) => {
                const isActive = lvl.level === sfxLevel;
                return (
                  <button
                    key={lvl.level}
                    type="button"
                    onClick={() => handleSfxLevelChange(lvl.level)}
                    className={`py-2 px-2 rounded-lg border text-center transition-all cursor-pointer ${
                      isActive
                        ? "bg-onicord-accent/15 border-onicord-accent/40 text-onicord-accent font-semibold text-xs shadow-sm"
                        : "border-transparent text-onicord-muted hover:text-onicord-text hover:bg-white/5 font-medium text-xs"
                    }`}
                  >
                    <span className="truncate block">{lvl.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sound pack select row */}
          <div className={`onicord-settings-input-row transition-opacity duration-200 ${sfxLevel === 0 ? "opacity-40 pointer-events-none" : ""}`}>
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.sfx.pack", "Paquete de Sonidos")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.sfx.packDesc", "Estilo acústico para las interacciones y respuestas del sistema.")}
              </p>
            </div>
            <Select
              value={sfxPack}
              disabled={sfxLevel === 0}
              onChange={handleSfxPackChange}
              align="right"
              className="w-[170px] shrink-0"
              options={[
                { value: "minimal", label: t("settings.sfxPacks.minimal", "Minimal") },
                { value: "zen", label: t("settings.sfxPacks.zen", "Zen") },
                { value: "soft", label: t("settings.sfxPacks.soft", "Soft") },
                { value: "glass", label: t("settings.sfxPacks.glass", "Glass") },
                { value: "arcade", label: t("settings.sfxPacks.arcade", "Arcade") },
                { value: "mechanical", label: t("settings.sfxPacks.mechanical", "Mechanical") },
                { value: "organic", label: t("settings.sfxPacks.organic", "Organic") },
                { value: "dreamy", label: t("settings.sfxPacks.dreamy", "Dreamy") },
                { value: "scifi", label: t("settings.sfxPacks.scifi", "Sci-Fi") },
                { value: "rubber", label: t("settings.sfxPacks.rubber", "Rubber") },
                { value: "cinematic", label: t("settings.sfxPacks.cinematic", "Cinematic") },
                { value: "studio", label: t("settings.sfxPacks.studio", "Studio") },
              ]}
            />
          </div>

          {/* Sound effects volume slider row */}
          <div className={`onicord-settings-slider-row transition-opacity duration-200 ${sfxLevel === 0 ? "opacity-40 pointer-events-none" : ""}`}>
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
                disabled={sfxLevel === 0}
                value={sfxVolume}
                onChange={handleSfxVolumeChange}
                className="onicord-range-input flex-1"
              />
              <span className="text-[11px] text-onicord-accent font-mono font-bold select-none min-w-[36px] text-right">
                {sfxVolume}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance and hardware acceleration */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.general.performance", "Rendimiento y Hardware")}</span>
        </h3>

        <div>
          {/* Open Graph Preview */}
          <div data-setting-id="openGraph" className="onicord-settings-row transition-all">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.enableOpenGraph", "Previsualización de enlaces (Open Graph)")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.enableOpenGraphDesc", "Genera tarjetas interactivas con miniaturas e información al compartir enlaces en el chat. Desactívalo para mejorar el rendimiento y ahorrar recursos.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={general.enableOpenGraph ?? true}
                onChange={(e) =>
                  handleChange(
                    "enableOpenGraph",
                    e.target.checked,
                  )
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          {/* Disable hardware acceleration */}
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
      </div>

      {/* Descargas y Almacenamiento */}
      <div data-setting-id="downloads" className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.general.downloadsTitle", "Descargas y Almacenamiento")}</span>
        </h3>

        <div>
          {/* Switch principal autodescarga */}
          <div className="onicord-settings-row">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.autoDownloadFiles", "Autodescarga de archivos y multimedia")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.autoDownloadFilesDesc", "Descarga automáticamente en segundo plano imágenes y archivos adjuntos para visualizarlos de inmediato en canales y foros.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={general.autoDownloadFiles ?? true}
                onChange={(e) => handleChange("autoDownloadFiles", e.target.checked)}
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          {/* Dependent options when auto-download is enabled */}
          {(general.autoDownloadFiles ?? true) && (
            <>
              {/* Max auto-download file size slider */}
              <div className="onicord-settings-slider-row">
                <div className="flex justify-between items-center">
                  <div className="min-w-0 pr-2">
                    <p className="onicord-settings-row-title">
                      {t("settings.general.autoDownloadMaxSize", "Tamaño máximo para autodescarga")}
                    </p>
                    <p className="onicord-settings-row-desc">
                      {t("settings.general.autoDownloadMaxSizeDesc", "Los archivos que superen este peso requerirán confirmación manual para descargarse.")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-onicord-base/40 p-2.5 rounded-xl border border-white/5 mt-1">
                  <span className="text-[11px] text-onicord-muted font-mono font-bold select-none min-w-[38px]">
                    {AUTO_DOWNLOAD_SIZE_STEPS[0].label}
                  </span>
                  <input
                    type="range"
                    min="0"
                    max={AUTO_DOWNLOAD_SIZE_STEPS.length - 1}
                    step="1"
                    value={currentDownloadSizeIndex}
                    onChange={handleDownloadSizeIndexChange}
                    className="onicord-range-input flex-1"
                  />
                  <span className={`text-[11px] font-mono font-bold select-none px-2 py-0.5 rounded-md min-w-[68px] text-center ${
                    AUTO_DOWNLOAD_SIZE_STEPS[currentDownloadSizeIndex]?.value === -1
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      : "bg-onicord-accent/15 text-onicord-accent border border-onicord-accent/30"
                  }`}>
                    {currentDownloadSizeLabel}
                  </span>
                </div>
              </div>

              {/* Download directory selector */}
              <div className="onicord-settings-input-row flex-col items-start gap-2">
                <div className="w-full flex justify-between items-start">
                  <div className="min-w-0 pr-2">
                    <p className="onicord-settings-row-title">
                      {t("settings.general.downloadDirectory", "Carpeta de descargas")}
                    </p>
                    <p className="onicord-settings-row-desc">
                      {t("settings.general.downloadDirectoryDesc", "Ubicación en tu equipo donde se guardarán las imágenes y archivos descargados.")}
                    </p>
                  </div>
                  {Boolean(general.downloadDirectory) && (
                    <button
                      type="button"
                      onClick={handleResetDirectory}
                      className="text-[11px] text-onicord-accent hover:underline hover:text-onicord-accent-hover transition-colors shrink-0 ml-2 cursor-pointer"
                    >
                      {t("settings.general.resetDownloadDir", "Restablecer por defecto")}
                    </button>
                  )}
                </div>
                <div className="w-full flex items-center gap-2 mt-1">
                  <div className="flex-1 min-w-0 bg-onicord-base/60 px-3 py-2 rounded-xl border border-white/5 text-xs text-onicord-text font-mono truncate select-all flex items-center gap-2">
                    <MaterialIcon name="folder" size={16} className="text-onicord-muted shrink-0" />
                    <span className="truncate" title={general.downloadDirectory || defaultDownloadDir || "Descargas"}>
                      {general.downloadDirectory || defaultDownloadDir || t("settings.general.defaultDownloadsFolder", "Carpeta de Descargas del sistema")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectDirectory}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-onicord-base/80 hover:bg-white/10 text-onicord-text border border-white/10 hover:border-white/20 transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <MaterialIcon name="folder_open" size={16} />
                    <span>{t("settings.general.chooseFolder", "Cambiar")}</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Streamer mode and privacy */}
      <div data-setting-id="streamerMode" className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.general.streamerModeTitle", "Modo Streamer y Privacidad")}</span>
        </h3>

        <div>
          {/* Manual Streamer Mode activation */}
          <div className="onicord-settings-row">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.streamerModeManualActivate", "Activar Modo Streamer manualmente")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.streamerModeSubtitle", "Oculta datos sensibles y enlaces de invitación durante tus transmisiones.")}
              </p>
              {isStreamerMode && (
                <p className="text-[10px] text-purple-400 font-semibold mt-1">
                  {detectedApp
                    ? t("settings.general.streamerModeStreaming", { app: detectedApp, defaultValue: `Transmitiendo (${detectedApp})` })
                    : t("settings.general.streamerModeActive", "Modo Streamer activo")}
                </p>
              )}
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={manualActive}
                onChange={toggleManual}
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          {/* Automatic activation */}
          <div className="onicord-settings-row">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.streamerModeAuto", "Activar automáticamente al detectar OBS / Streaming")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.streamerModeAutoDesc", "Detecta en segundo plano software como OBS Studio, Streamlabs o XSplit y activa la protección de forma silenciosa sin preguntar.")}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={autoEnabled}
                onChange={(e) => setAutoEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>
        </div>
      </div>

      {/* RESET BUTTON */}
      <div className="pt-2">
        <button
          type="button"
          onClick={() => {
            setGeneral({ ...DEFAULT_GENERAL });
            soundEngine.setLevel(DEFAULT_GENERAL.sfxLevel, false);
          }}
          className="onicord-btn-danger-soft w-full text-center"
        >
          {t("settings.general.resetGeneral", "Restablecer ajustes generales por defecto")}
        </button>
      </div>
    </div>
  );
}
