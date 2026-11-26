import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_GENERAL } from "../../lib/generalSettings";
import { soundEngine, SFX_LEVEL } from "../../lib/soundEngine";
import { SUPPORTED_LANGUAGES } from "../../i18n/languages";
import Select from "../ui/Select";
import SegmentedControl from "../ui/SegmentedControl";
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
  const [webCacheBytes, setWebCacheBytes] = useState(0);
  const [clearingWebCache, setClearingWebCache] = useState(false);
  const [webCacheClearedMsg, setWebCacheClearedMsg] = useState(false);
  const [chatLineHeight, setChatLineHeight] = useState("1.5");
  const [defaultDownloadDir, setDefaultDownloadDir] = useState("");
  const [suggestionsHiddenCleared, setSuggestionsHiddenCleared] = useState(false);
  const [suggestionsReindexing, setSuggestionsReindexing] = useState(false);
  const [suggestionsReindexed, setSuggestionsReindexed] = useState(false);

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
    window.electronAPI?.getWebCacheSize?.().then((bytes) => {
      if (typeof bytes === "number") setWebCacheBytes(bytes);
    });
    const savedLineHeight = localStorage.getItem(STORAGE_LINE_HEIGHT_KEY) || "1.5";
    setChatLineHeight(savedLineHeight);
    if (window.electronAPI?.getDefaultDownloadDirectory) {
      window.electronAPI.getDefaultDownloadDirectory().then((dir) => {
        if (dir) setDefaultDownloadDir(dir);
      });
    }
  }, []);

  const formatWebCacheBytes = (bytes) => {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleClearWebCache = async () => {
    if (clearingWebCache || !window.electronAPI?.clearWebCache) return;
    setClearingWebCache(true);
    try {
      await window.electronAPI.clearWebCache();
      const updated = await window.electronAPI.getWebCacheSize?.();
      setWebCacheBytes(typeof updated === "number" ? updated : 0);
      setWebCacheClearedMsg(true);
      setTimeout(() => setWebCacheClearedMsg(false), 2500);
    } finally {
      setClearingWebCache(false);
    }
  };

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

  const currentDownloadSizeStep = AUTO_DOWNLOAD_SIZE_STEPS[currentDownloadSizeIndex];
  const currentDownloadSizeLabel =
    currentDownloadSizeStep?.value === -1
      ? t("settings.general.unlimited", "Sin límite")
      : currentDownloadSizeStep?.label || "500 MB";

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

    if (key === "enableOpenGraph" || key === "alwaysRelayVoice") {
      try {
        const raw = localStorage.getItem("onicord_general_settings");
        const parsed = raw ? JSON.parse(raw) : {};
        parsed[key] = value;
        localStorage.setItem("onicord_general_settings", JSON.stringify(parsed));
        window.dispatchEvent(
          new CustomEvent("onicord:general-settings-updated", {
            detail: { [key]: value },
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
      {/* 1. Interfaz y Apariencia */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.general.interface", "Interfaz y Apariencia")}</span>
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
            <div className="flex items-center gap-3 bg-onicord-base/40 p-2.5 rounded-xl border border-onicord-border mt-1">
              <span className="text-xs text-onicord-muted font-mono font-bold select-none min-w-[32px]">
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
              <span className="text-xs text-onicord-accent font-mono font-bold select-none min-w-[36px] text-right">
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
            <div className="flex items-center gap-3 bg-onicord-base/40 p-2.5 rounded-xl border border-onicord-border mt-1">
              <span className="text-xs text-onicord-muted font-mono font-bold select-none min-w-[32px]">
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
              <span className="text-xs text-onicord-accent font-mono font-bold select-none min-w-[36px] text-right">
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
        </div>
      </div>

      {/* 2. Chat y Privacidad */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.general.chatAndPrivacy", "Chat y Privacidad")}</span>
        </h3>

        <div>
          {/* Quick message suggestions */}
          <div className="onicord-settings-row">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.enableQuickSuggestions", "Sugerencias de mensajes rápidos")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.enableQuickSuggestionsDesc", "Muestra accesos rápidos para reescribir tus frases más frecuentes sobre el input de chat.")}
              </p>
              {(general.enableQuickSuggestions ?? true) && window.electronAPI?.clearDismissedQuickSuggestions && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await window.electronAPI?.clearDismissedQuickSuggestions?.();
                        setSuggestionsHiddenCleared(true);
                        setTimeout(() => setSuggestionsHiddenCleared(false), 2000);
                      } catch {}
                    }}
                    className="text-xs px-2.5 py-1 rounded-onicord-inner bg-onicord-mantle border border-onicord-island text-onicord-subtext hover:text-onicord-text hover:border-onicord-accent/50 transition-colors cursor-pointer"
                  >
                    {suggestionsHiddenCleared
                      ? t("settings.general.hiddenSuggestionsReset", "Ocultas restablecidas")
                      : t("settings.general.resetHiddenSuggestions", "Restablecer sugerencias ocultas")}
                  </button>
                  <button
                    type="button"
                    disabled={suggestionsReindexing}
                    onClick={async () => {
                      if (suggestionsReindexing) return;
                      setSuggestionsReindexing(true);
                      try {
                        await window.electronAPI?.reindexQuickSuggestions?.();
                        setSuggestionsReindexed(true);
                        setTimeout(() => setSuggestionsReindexed(false), 2500);
                      } catch {
                      } finally {
                        setSuggestionsReindexing(false);
                      }
                    }}
                    className="text-xs px-2.5 py-1 rounded-onicord-inner bg-onicord-mantle border border-onicord-island text-onicord-subtext hover:text-onicord-text hover:border-onicord-accent/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                  >
                    {suggestionsReindexing
                      ? t("settings.general.reindexingSuggestions", "Indexando...")
                      : suggestionsReindexed
                        ? t("settings.general.suggestionsReindexed", "Historial indexado")
                        : t("settings.general.reindexSuggestions", "Reindexar historial")}
                  </button>
                </div>
              )}
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

          {/* Auto-blur NSFW media */}
          <div data-setting-id="blurNsfw" className="onicord-settings-row transition-all">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t(
                  "settings.general.blurNsfwTitle",
                  "Desenfocar automáticamente contenido NSFW",
                )}
              </p>
              <p className="onicord-settings-row-desc">
                {t(
                  "settings.general.blurNsfwDesc",
                  "Muestra desenfocados los archivos multimedia marcados como NSFW (+18) hasta que hagas clic para revelarlos.",
                )}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={general?.blurNsfwContent ?? true}
                onChange={(e) =>
                  setGeneral((prev) => ({
                    ...(prev || {}),
                    blurNsfwContent: e.target.checked,
                  }))
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>

          {/* Always Relay (TURN-only WebRTC calls) */}
          <div data-setting-id="alwaysRelayVoice" className="onicord-settings-row transition-all">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t(
                  "settings.general.alwaysRelayVoiceTitle",
                  "Forzar Relay TURN en llamadas (Always Relay)",
                )}
              </p>
              <p className="onicord-settings-row-desc">
                {t(
                  "settings.general.alwaysRelayVoiceDesc",
                  "Enruta el audio y video de WebRTC exclusivamente por servidores TURN para ocultar tu IP en llamadas a cambio de mayor latencia. El chat P2P (Hyperswarm) sigue siendo directo; para ocultar tu IP por completo usa una VPN.",
                )}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={general?.alwaysRelayVoice ?? false}
                onChange={(e) =>
                  handleChange("alwaysRelayVoice", e.target.checked)
                }
                className="sr-only peer"
              />
              <div className="onicord-toggle-slider" />
            </label>
          </div>
        </div>
      </div>

      {/* 3. Notificaciones y Sonidos */}
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

            <SegmentedControl
              options={soundLevels.map((lvl) => ({ value: lvl.level, label: lvl.label }))}
              value={sfxLevel}
              onChange={handleSfxLevelChange}
              ariaLabel={t("settings.sfx.levelTitle", "Nivel de Efectos de Sonido")}
            />
          </div>

          {/* Sound pack select row */}
          <div className={`onicord-settings-input-row transition-opacity duration-normal ${sfxLevel === 0 ? "opacity-40 pointer-events-none" : ""}`}>
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
          <div className={`onicord-settings-slider-row transition-opacity duration-normal ${sfxLevel === 0 ? "opacity-40 pointer-events-none" : ""}`}>
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
            <div className="flex items-center gap-3 bg-onicord-base/40 p-2.5 rounded-xl border border-onicord-border mt-1">
              <span className="text-xs text-onicord-muted font-mono font-bold select-none min-w-[32px]">
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
              <span className="text-xs text-onicord-accent font-mono font-bold select-none min-w-[36px] text-right">
                {sfxVolume}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Descargas y Almacenamiento */}
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
                <div className="flex items-center gap-3 bg-onicord-base/40 p-2.5 rounded-xl border border-onicord-border mt-1">
                  <span className="text-xs text-onicord-muted font-mono font-bold select-none min-w-[38px]">
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
                  <span className={`text-xs font-mono font-bold select-none px-2 py-0.5 rounded-md min-w-[68px] text-center ${
                    AUTO_DOWNLOAD_SIZE_STEPS[currentDownloadSizeIndex]?.value === -1
                      ? "bg-onicord-warning/15 text-onicord-warning border border-onicord-warning/30"
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
                      className="text-xs text-onicord-accent hover:underline hover:text-onicord-accent-hover transition-colors shrink-0 ml-2 cursor-pointer"
                    >
                      {t("settings.general.resetDownloadDir", "Restablecer por defecto")}
                    </button>
                  )}
                </div>
                <div className="w-full flex items-center gap-2 mt-1">
                  <div className="flex-1 min-w-0 bg-onicord-base/60 px-3 py-2 rounded-xl border border-onicord-border text-xs text-onicord-text font-mono truncate select-all flex items-center gap-2">
                    <MaterialIcon name="folder" size={16} className="text-onicord-muted shrink-0" />
                    <span className="truncate" title={general.downloadDirectory || defaultDownloadDir || t("settings.general.downloadsFolderShort", "Descargas")}>
                      {general.downloadDirectory || defaultDownloadDir || t("settings.general.defaultDownloadsFolder", "Carpeta de Descargas del sistema")}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSelectDirectory}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-onicord-base/80 hover:bg-onicord-hover text-onicord-text border border-onicord-border-strong hover:border-onicord-border-strong transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <MaterialIcon name="folder_open" size={16} />
                    <span>{t("settings.general.chooseFolder", "Cambiar")}</span>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Chromium Web Cache */}
          <div className="onicord-settings-row">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.webCacheTitle", "Caché web de Chromium")}{" "}
                <span className="text-xs font-mono text-onicord-accent ml-1">
                  ({formatWebCacheBytes(webCacheBytes)})
                </span>
              </p>
              <p className="onicord-settings-row-desc">
                {t(
                  "settings.general.webCacheDesc",
                  "Archivos temporales de imágenes remotas, avatares y vistas embebidas (límite máximo de 100 MB en disco)."
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClearWebCache}
              disabled={clearingWebCache}
              className="px-3 py-2 rounded-xl text-xs font-semibold bg-onicord-base/80 hover:bg-onicord-hover text-onicord-text border border-onicord-border-strong hover:border-onicord-border-strong transition-all cursor-pointer flex items-center gap-1.5 shrink-0 disabled:opacity-50"
            >
              <MaterialIcon name={clearingWebCache ? "sync" : webCacheClearedMsg ? "check_circle" : "cleaning_services"} size={15} className={clearingWebCache ? "animate-spin" : ""} />
              <span>
                {clearingWebCache
                  ? t("settings.general.clearingWebCache", "Limpiando...")
                  : webCacheClearedMsg
                    ? t("settings.general.webCacheCleared", "Caché web limpiado")
                    : t("settings.general.clearWebCache", "Limpiar caché web")}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 5. Sistema y Rendimiento */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.general.systemAndPerformance", "Sistema y Rendimiento")}</span>
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

          <div className={`onicord-settings-row transition-opacity duration-normal ${!general.openAtLogin ? "opacity-40" : ""}`}>
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

          <div data-setting-id="minimizeTray" className="onicord-settings-row flex-col items-stretch gap-2.5 transition-all">
            {(() => {
              const currentCloseBehavior =
                general.closeBehavior || (general.minimizeToTray === false ? "quit" : "tray");
              const closeOptions = [
                {
                  id: "quit",
                  label: t("settings.general.closeBehaviorQuit", "Cerrar app"),
                  desc: t(
                    "settings.general.closeBehaviorQuitDesc",
                    "Al cerrar la ventana, la aplicación se cierra por completo y se desconecta de los servidores."
                  ),
                },
                {
                  id: "tray",
                  label: t("settings.general.closeBehaviorTray", "Minimizar"),
                  desc: t(
                    "settings.general.closeBehaviorTrayDesc",
                    "Oculta la ventana en la bandeja del sistema manteniendo la interfaz y llamadas de voz activas."
                  ),
                },
                {
                  id: "headless",
                  label: t("settings.general.closeBehaviorHeadless", "Modo Nodo"),
                  desc: t(
                    "settings.general.closeBehaviorHeadlessDesc",
                    "Cierra la interfaz para ahorrar recursos, te marca como invisible y mantiene servidores, Discover, webhooks y recepción de mensajes activos."
                  ),
                },
              ];
              const currentMeta =
                closeOptions.find((o) => o.id === currentCloseBehavior) || closeOptions[1];
              return (
                <>
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 pr-2">
                      <p className="onicord-settings-row-title">
                        {t("settings.general.closeBehaviorTitle", "Al cerrar la ventana")}
                      </p>
                      <p className="onicord-settings-row-desc">{currentMeta.desc}</p>
                    </div>
                  </div>
                  <SegmentedControl
                    options={closeOptions.map((opt) => ({ value: opt.id, label: opt.label }))}
                    value={currentCloseBehavior}
                    onChange={(val) => {
                      handleChange("closeBehavior", val);
                      handleChange("minimizeToTray", val !== "quit");
                    }}
                    ariaLabel={t("settings.general.closeBehaviorTitle", "Al cerrar la ventana")}
                  />
                </>
              );
            })()}
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

          {/* Disable hardware acceleration */}
          <div className="onicord-settings-row">
            <div className="min-w-0 pr-4">
              <p className="onicord-settings-row-title">
                {t("settings.general.disableHardwareAccel", "Desactivar aceleración por hardware")}
              </p>
              <p className="onicord-settings-row-desc">
                {t("settings.general.disableHardwareAccelDesc", "Desactiva la renderización mediante GPU.")}
              </p>
              <p className="text-2xs text-onicord-danger font-medium mt-1">
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

          {/* Streamer Mode */}
          <div data-setting-id="streamerMode" className="transition-all">
            <div className="onicord-settings-row">
              <div className="min-w-0 pr-4">
                <p className="onicord-settings-row-title">
                  {t("settings.general.streamerModeManualActivate", "Activar Modo Streamer manualmente")}
                </p>
                <p className="onicord-settings-row-desc">
                  {t("settings.general.streamerModeSubtitle", "Oculta datos sensibles y enlaces de invitación durante tus transmisiones.")}
                </p>
                {isStreamerMode && (
                  <p className="text-2xs text-onicord-accent font-semibold mt-1">
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
