import { useState, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ModalShell, {
  ModalButton,
} from "../ui/ModalShell";
import MaterialIcon from "../icons/MaterialIcon";
import { normalizeAudioSettings, DEFAULT_AUDIO } from "../../lib/audioSettings";
import StickerManagerTab from "../settings/StickerManagerTab";
import ThemeManagerTab from "../settings/ThemeManagerTab";
import ConfirmDialogModal from "./ConfirmDialogModal";
import { CONFIG_ISLAS, STORAGE_KEY, WIDGET_COMPONENTS, getCombinedConfigs, getWidgetComponent } from "../dashboard/dashboardConfig";
import { useMicTest } from "../../hooks/useMicTest";
import { useAudioDevices } from "../../hooks/useAudioDevices";

// IMPORTAMOS NUESTROS NUEVOS COMPONENTES MODULARES
import ProfileTab from "../settings/ProfileTab";
import AudioTab from "../settings/AudioTab";
import WidgetsTab from "../settings/WidgetsTab";
import GeneralTab from "../settings/GeneralTab";
import DevSandboxTab from "../settings/DevSandboxTab";
import AboutTab from "../settings/AboutTab";
import PluginsTab from "../settings/PluginsTab";
import KeybindingsTab from "../settings/KeybindingsTab";
import { normalizeGeneralSettings, DEFAULT_GENERAL } from "../../lib/generalSettings";
import CloudBackupTab from "../settings/CloudBackupTab";
import OverlayTab from "../settings/OverlayTab";
import GamesActivityTab from "../settings/GamesActivityTab";
import { soundEngine } from "../../lib/soundEngine";

export default function AppSettingsModal({
  profile,
  onClose,
  onSaved,
  currentLayout,
  onUpdateLayout,
  servers = [],
  activeServerId = null,
  onDeleteAccount,
  initialSection = "general",
}) {
  const { t, i18n } = useTranslation();
  const initialLanguageRef = useRef(i18n.language || "es");

  const sections = useMemo(() => {
    const list = [
      {
        id: "general",
        label: t("settings.tabs.general"),
        icon: "settings",
        keywords: ["general", "opciones", "sistema", "configuracion"],
        features: [
          { id: "language", label: t("settings.general.language", "Idioma de la Aplicación"), keywords: ["idioma", "lenguaje", "language", "español", "ingles", "portugues"] },
          { id: "zoomLevel", label: t("settings.general.zoom", "Escala de la Interfaz (Zoom)"), keywords: ["zoom", "tamaño", "fuente", "escala", "interfaz"] },
          { id: "lineSpacing", label: t("settings.theme.lineSpacing", "Interlineado del Chat"), keywords: ["espacio", "lineas", "chat", "interlineado", "texto"] },
          { id: "startup", label: t("settings.general.openAtLogin", "Iniciar al encender el sistema"), keywords: ["inicio", "arrancar", "windows", "sistema", "autostart", "login"] },
          { id: "minimizeTray", label: t("settings.general.minimizeToTray", "Minimizar a la bandeja del sistema"), keywords: ["tray", "bandeja", "segundo plano", "cerrar", "minimizar"] },
          { id: "confirmExit", label: t("settings.general.confirmOnExit", "Confirmar antes de salir"), keywords: ["confirmar", "salir", "cerrar", "pregunta"] },
          { id: "openGraph", label: t("settings.general.enableOpenGraph", "Vistas previas de enlaces (OpenGraph)"), keywords: ["og", "embeds", "enlaces", "links", "videos", "spotify", "tarjetas"] },
          { id: "clearCache", label: t("settings.general.clearCache", "Limpiar caché de medios y archivos"), keywords: ["cache", "espacio", "limpiar", "disco", "memoria"] },
          { id: "streamerMode", label: t("settings.general.streamerMode", "Modo Streamer (Protección OBS)"), keywords: ["stream", "streamer", "obs", "ocultar", "directo", "twitch", "privacidad"] },
        ],
      },
      {
        id: "profile",
        label: t("settings.tabs.profile"),
        icon: "person",
        keywords: ["perfil", "usuario", "cuenta", "avatar", "apodo"],
        features: [
          { id: "nickname", label: t("settings.profile.nickname", "Nombre de usuario y apodo"), keywords: ["apodo", "nombre", "nickname", "usuario", "identidad"] },
          { id: "avatar", label: t("settings.profile.avatar", "Foto de perfil / Avatar"), keywords: ["avatar", "foto", "imagen", "icono", "perfil"] },
          { id: "customStatus", label: t("settings.profile.customStatus", "Mensaje de estado personalizado"), keywords: ["estado", "status", "frase", "custom status"] },
          { id: "profileColor", label: t("settings.profile.profileColor", "Color de acento del perfil"), keywords: ["color", "tarjeta", "banner", "perfil", "acento"] },
          { id: "customLink", label: t("settings.profile.customLink", "Red social o enlace personalizado"), keywords: ["link", "web", "twitter", "enlace", "redes"] },
          { id: "accountDanger", label: t("settings.profile.deleteAccount", "Eliminar o resetear cuenta local"), keywords: ["cuenta", "borrar", "eliminar", "resetear", "cerrar"] },
        ],
      },
      {
        id: "audio",
        label: t("settings.tabs.voiceVideo"),
        icon: "mic",
        keywords: ["audio", "voz", "video", "microfono", "sonido", "ducking", "sfx"],
        features: [
          { id: "inputDevice", label: t("settings.voiceVideo.inputDevice", "Dispositivo de entrada (Micrófono)"), keywords: ["micro", "microfono", "input", "grabar", "dispositivo"] },
          { id: "outputDevice", label: t("settings.voiceVideo.outputDevice", "Dispositivo de salida (Altavoces)"), keywords: ["auriculares", "altavoz", "auricular", "parlante", "sonido", "output"] },
          { id: "inputVolume", label: t("settings.voiceVideo.inputVolume", "Volumen del micrófono"), keywords: ["volumen", "ganancia", "nivel", "micro"] },
          { id: "outputVolume", label: t("settings.voiceVideo.outputVolume", "Volumen de salida"), keywords: ["volumen", "master", "altavoces", "auriculares"] },
          { id: "micTest", label: t("settings.voiceVideo.micTest", "Prueba de micrófono"), keywords: ["test", "probar", "barra", "onda", "microfono", "escuchar"] },
          { id: "vadSensitivity", label: t("settings.voiceVideo.vadSensitivity", "Sensibilidad de entrada y VAD"), keywords: ["sensibilidad", "umbral", "ruido ambiental", "activacion", "vad"] },
          { id: "noiseSuppression", label: t("settings.voiceVideo.noiseSuppression", "Supresión de Ruido"), keywords: ["ruido", "filtrar", "teclado", "fondo", "noise"] },
          { id: "echoCancellation", label: t("settings.voiceVideo.echoCancellation", "Cancelación de Eco"), keywords: ["eco", "acople", "altavoces", "retroalimentacion"] },
          { id: "autoGainControl", label: t("settings.voiceVideo.autoGainControl", "Control Automático de Ganancia"), keywords: ["ganancia", "nivelar", "volumen automatico", "gain"] },
          { id: "dynamicsCompression", label: t("settings.voiceVideo.dynamicsCompression", "Limitador Master Anti-Clipping"), keywords: ["limitador", "compresor", "clipping", "distorsion", "master", "gritos"] },
          { id: "autoDucking", label: t("settings.voiceVideo.autoDucking", "Atenuación inteligente (Auto-Ducking)"), keywords: ["ducking", "atenuacion", "bajar volumen al hablar", "pantalla compartida", "juego"] },
          { id: "sfxSettings", label: t("settings.voiceVideo.sfxSettings", "Efectos de sonido de la interfaz (SFX)"), keywords: ["sfx", "sonidos", "clicks", "notificaciones", "tonos", "uisfx", "pack"] },
        ],
      },
      {
        id: "keybindings",
        label: t("settings.tabs.keybindings", "Atajos de Teclado"),
        icon: "keyboard",
        keywords: ["teclado", "atajos", "shortcuts", "hotkeys", "teclas"],
        features: [
          { id: "toggleMute", label: t("settings.keybindings.mute", "Atajo: Silenciar micrófono (Toggle Mute)"), keywords: ["mute", "silenciar", "micro", "tecla", "shortcut"] },
          { id: "toggleDeafen", label: t("settings.keybindings.deafen", "Atajo: Ensordecer audio (Toggle Deafen)"), keywords: ["deafen", "ensordecer", "auriculares", "callar", "tecla"] },
          { id: "disconnectVoice", label: t("settings.keybindings.disconnect", "Atajo: Desconectar de la llamada"), keywords: ["desconectar", "salir", "colgar", "llamada"] },
          { id: "toggleOverlay", label: t("settings.keybindings.overlay", "Atajo: Abrir / Cerrar In-Game Overlay"), keywords: ["overlay", "juego", "hud", "abrir"] },
        ],
      },
      {
        id: "overlay",
        label: t("settings.tabs.overlay", "Overlay"),
        icon: "layers",
        keywords: ["overlay", "juegos", "pantalla", "hud", "en juego", "gaming"],
        features: [
          { id: "overlayEnable", label: t("settings.overlay.enable", "Activar Overlay en juegos"), keywords: ["overlay", "juegos", "pantalla", "hud", "en juego"] },
          { id: "overlayPosition", label: t("settings.overlay.position", "Posición del Overlay en pantalla"), keywords: ["posicion", "esquina", "arriba", "abajo", "derecha", "izquierda"] },
          { id: "overlayOpacity", label: t("settings.overlay.opacity", "Opacidad del Overlay"), keywords: ["opacidad", "transparencia", "fondo", "alfa"] },
          { id: "overlayAutoHide", label: t("settings.overlay.autoHide", "Ocultar automáticamente si no hablan"), keywords: ["ocultar", "auto", "hablar", "silencio", "avatares"] },
          { id: "overlayAvatarOnly", label: t("settings.overlay.avatarOnly", "Mostrar solo avatares sin apodos"), keywords: ["solo avatares", "nombres", "compacto"] },
        ],
      },
      {
        id: "games",
        label: t("settings.tabs.games", "Actividad"),
        icon: "sports_esports",
        keywords: ["juegos", "actividad", "rpc", "discord", "ejecutables", "jugando"],
        features: [
          { id: "gameDetection", label: t("settings.games.detection", "Detección de videojuegos y programas"), keywords: ["juegos", "programas", "actividad", "jugando", "detectar", "exe"] },
          { id: "richPresence", label: t("settings.games.rpc", "Servidor local Discord RPC"), keywords: ["rpc", "discord", "rich presence", "emuladores", "port"] },
          { id: "customGames", label: t("settings.games.custom", "Añadir programa o juego personalizado"), keywords: ["añadir juego", "personalizado", "ejecutable", "whitelist"] },
          { id: "playtime", label: t("settings.games.playtime", "Horas y estadísticas de juego"), keywords: ["tiempo", "horas", "playtime", "tracker", "estadisticas"] },
        ],
      },
      {
        id: "appearance",
        label: t("settings.tabs.appearance"),
        icon: "palette",
        keywords: ["temas", "apariencia", "diseño", "colores", "dark", "interfaz"],
        features: [
          { id: "themeSelect", label: t("settings.theme.select", "Temas visuales instalados (.onipkg)"), keywords: ["temas", "skins", "apariencia", "diseño", "onipkg"] },
          { id: "accentColor", label: t("settings.theme.accent", "Color de acento de la aplicación"), keywords: ["color", "acento", "cyan", "magenta", "azul", "verde", "paleta"] },
          { id: "themePreview", label: t("settings.theme.preview", "Previsualización interactiva en vivo"), keywords: ["preview", "vista previa", "mockup", "chat"] },
        ],
      },
      {
        id: "widgets",
        label: t("settings.tabs.widgets", "Dashboard"),
        icon: "dashboard",
        keywords: ["dashboard", "widgets", "inicio", "panel", "cuadricula"],
        features: [
          { id: "widgetLayout", label: t("settings.widgets.layout", "Organización de la cuadrícula del Dashboard"), keywords: ["grid", "cuadricula", "dashboard", "widgets", "inicio"] },
          { id: "musicWidget", label: t("settings.widgets.music", "Widget de Música P2P"), keywords: ["musica", "reproductor", "cancion", "yt-dlp", "dj"] },
          { id: "sketchpadWidget", label: t("settings.widgets.sketchpad", "Widget de Pizarra / Sketchpad"), keywords: ["dibujo", "pizarra", "sketchpad", "notas", "lienzo"] },
        ],
      },
      {
        id: "stickers",
        label: t("settings.tabs.stickers", "Stickers"),
        icon: "sticky_note_2",
        keywords: ["stickers", "emojis", "pegatinas", "paquetes"],
        features: [
          { id: "stickerPacks", label: t("settings.stickers.packs", "Colección de packs de stickers"), keywords: ["stickers", "packs", "emojis", "pegatinas", "onipkg"] },
          { id: "importStickers", label: t("settings.stickers.import", "Importar paquete de stickers (.onipkg)"), keywords: ["importar", "cargar", "instalar", "subir"] },
        ],
      },
      {
        id: "plugins",
        label: t("settings.tabs.plugins", "Complementos"),
        icon: "extension",
        keywords: ["plugins", "complementos", "addons", "comunidad", "extensiones"],
        features: [
          { id: "installedPlugins", label: t("settings.plugins.installed", "Complementos y Addons instalados"), keywords: ["addons", "complementos", "plugins", "extensiones"] },
          { id: "pluginCommunity", label: t("settings.plugins.community", "Explorar catálogo de la comunidad"), keywords: ["catalogo", "descargar", "comunidad", "buscar"] },
        ],
      },
      {
        id: "about",
        label: t("settings.tabs.about", "Acerca de"),
        icon: "info",
        keywords: ["acerca de", "version", "actualizaciones", "diagnostico", "info"],
        features: [
          { id: "appVersion", label: t("settings.about.version", "Versión de Onicord y Actualizaciones"), keywords: ["version", "actualizar", "update", "github", "releases"] },
          { id: "oniDiag", label: t("settings.about.diag", "Diagnósticos de red P2P y WebRTC"), keywords: ["diagnostico", "onidiag", "red", "hyperswarm", "webrtc"] },
          { id: "credits", label: t("settings.about.credits", "Créditos y licencias de código abierto"), keywords: ["creditos", "licencias", "github", "autores"] },
        ],
      },
    ];
    if (import.meta.env.DEV) {
      list.push({
        id: "dev",
        label: t("settings.tabs.developer"),
        icon: "developer_mode",
        keywords: ["dev", "desarrollo", "sandbox", "debug"],
        features: [
          { id: "sandboxDev", label: "Sandbox de desarrollo de complementos", keywords: ["sandbox", "devtools", "test"] },
        ],
      });
    }
    return list;
  }, [t]);

  const [section, setSection] = useState(initialSection || "general");

  useEffect(() => {
    if (initialSection) {
      setSection(initialSection);
    }
  }, [initialSection]);
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [avatar, setAvatar] = useState(profile?.avatar ?? null);
  const [audio, setAudio] = useState(() =>
    normalizeAudioSettings(profile?.audio),
  );
  const [general, setGeneral] = useState(() =>
    normalizeGeneralSettings(profile?.general),
  );
  const [keybindings, setKeybindings] = useState(() =>
    Array.isArray(profile?.keybindings) ? profile.keybindings : []
  );
  const [overlay, setOverlay] = useState(() => ({
    enabled: profile?.overlay?.enabled ?? true,
    position: profile?.overlay?.position ?? "top-left",
    opacity: profile?.overlay?.opacity ?? 0.6,
    autoHideWhenQuiet: profile?.overlay?.autoHideWhenQuiet ?? false,
    avatarOnly: profile?.overlay?.avatarOnly ?? false,
    showNameOnlyWhenSpeaking: profile?.overlay?.showNameOnlyWhenSpeaking ?? false,
  }));

  const [customLink, setCustomLink] = useState(profile?.customLink ?? "");
  const [profileColor, setProfileColor] = useState(profile?.profileColor ?? "");
  const [showRichPresence, setShowRichPresence] = useState(
    profile?.showRichPresence ?? true,
  );
  const [customStatus, setCustomStatus] = useState(profile?.customStatus ?? "");
  const [customGames, setCustomGames] = useState(() =>
    Array.isArray(profile?.customGames) ? profile.customGames : []
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // INTEGRATING REUSABLE CUSTOM HOOKS
  const { isTestingMic, micLevel, toggleMicTest } = useMicTest(audio.inputDeviceId);
  const { inputs, outputs, devicesLoading } = useAudioDevices(section === "audio");

  const [visibilidadWidgets, setVisibilidadWidgets] = useState(() => {
    const layoutActual = currentLayout || {};
    return getCombinedConfigs().reduce((acc, curr) => {
      acc[curr.id] = Object.prototype.hasOwnProperty.call(
        layoutActual,
        curr.id,
      );
      return acc;
    }, {});
  });

  const profileReady = nickname.trim().length >= 2;
  const userId = profile?.id;

  const handleToggleWidget = (widgetId) => {
    setVisibilidadWidgets((prev) => {
      const nuevoEstado = { ...prev, [widgetId]: !prev[widgetId] };
      let nuevoLayout = {};

      const celdaEstaOcupada = (x, y, w, h, elLayout) => {
        return Object.values(elLayout).some(
          (o) =>
            x < o.x + o.w &&
            x + w > o.x &&
            y < o.y + o.h &&
            y + h > o.y
        );
      };

      const reubicarEnEspacioVacio = (targetGeo, elLayout) => {
        for (let y = 1; y <= 6; y++) {
          for (let x = 1; x <= 12; x++) {
            if (x + targetGeo.w - 1 <= 12 && y + targetGeo.h - 1 <= 6) {
              if (!celdaEstaOcupada(x, y, targetGeo.w, targetGeo.h, elLayout)) {
                return { x, y, w: targetGeo.w, h: targetGeo.h };
              }
            }
          }
        }
        return null;
      };

      const packLayout = (estadoDeVisibilidad) => {
        let packed = {};
        getCombinedConfigs().forEach((meta) => {
          if (estadoDeVisibilidad[meta.id]) {
            const Comp = getWidgetComponent(meta.id);
            const w = Comp?.minW || meta.defaultGeo?.w || 1;
            const h = Comp?.minH || meta.defaultGeo?.h || 1;
            let targetGeo = { w, h };
            let slot = reubicarEnEspacioVacio(targetGeo, packed);
            if (!slot) {
              slot = { x: 1, y: 1, w, h };
            }
            packed[meta.id] = slot;
          }
        });
        return packed;
      };

      // 1. Poblamos con las posiciones actuales de los widgets activos
      getCombinedConfigs().forEach((meta) => {
        if (nuevoEstado[meta.id]) {
          if (currentLayout[meta.id]) {
            nuevoLayout[meta.id] = { ...currentLayout[meta.id] };
          }
        }
      });

      // 2. Si es activación de un widget nuevo, buscar ubicación libre garantizando que quepa
      if (nuevoEstado[widgetId] && !currentLayout[widgetId]) {
        const meta = getCombinedConfigs().find((m) => m.id === widgetId);
        if (meta) {
          const Comp = getWidgetComponent(widgetId);
          const minW = Comp?.minW || meta.defaultGeo?.w || 1;
          const minH = Comp?.minH || meta.defaultGeo?.h || 1;

          // Intentar colocarlo en su tamaño por defecto
          let slot = reubicarEnEspacioVacio(meta.defaultGeo || { w: 2, h: 2 }, nuevoLayout);
          if (slot) {
            nuevoLayout[widgetId] = slot;
          } else {
            // Intentar colocarlo en su tamaño mínimo
            slot = reubicarEnEspacioVacio({ w: minW, h: minH }, nuevoLayout);
            if (slot) {
              nuevoLayout[widgetId] = slot;
            } else {
              // Si no cabe en tamaño mínimo, achicar el widget más grande activo progresivamente
              let conseguido = false;

              while (true) {
                const shrinkable = Object.keys(nuevoLayout).map((k) => {
                  const C = getWidgetComponent(k);
                  const mW = C?.minW || 1;
                  const mH = C?.minH || 1;
                  const geo = nuevoLayout[k];
                  return {
                    key: k,
                    w: geo.w,
                    h: geo.h,
                    minW: mW,
                    minH: mH,
                    area: geo.w * geo.h,
                    excessW: geo.w - mW,
                    excessH: geo.h - mH,
                  };
                }).filter((item) => item.excessW > 0 || item.excessH > 0);

                if (shrinkable.length === 0) {
                  break;
                }

                shrinkable.sort((a, b) => b.area - a.area);
                const target = shrinkable[0];

                if (target.excessW > target.excessH) {
                  nuevoLayout[target.key].w -= 1;
                } else {
                  nuevoLayout[target.key].h -= 1;
                }

                slot = reubicarEnEspacioVacio({ w: minW, h: minH }, nuevoLayout);
                if (slot) {
                  nuevoLayout[widgetId] = slot;
                  conseguido = true;
                  break;
                }
              }

              if (!conseguido) {
                nuevoLayout = packLayout(nuevoEstado);
              }
            }
          }
        }
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(nuevoLayout));
      if (onUpdateLayout) onUpdateLayout(nuevoLayout);

      return nuevoEstado;
    });
  };

  const handleResetBento = () => {
    setShowResetConfirm(true);
  };

  const hasUnsavedChanges = (() => {
    const origNickname = profile?.nickname ?? "";
    const origAvatar = profile?.avatar ?? null;
    const origCustomLink = profile?.customLink ?? "";
    const origProfileColor = profile?.profileColor ?? "";
    const origShowRichPresence = profile?.showRichPresence ?? true;
    const origCustomStatus = profile?.customStatus ?? "";

    if (nickname.trim() !== origNickname) return true;
    if (avatar !== origAvatar) return true;
    if (customLink.trim() !== origCustomLink) return true;
    if (profileColor !== origProfileColor) return true;
    if (showRichPresence !== origShowRichPresence) return true;
    if (customStatus.trim() !== origCustomStatus) return true;

    const currentAudio = normalizeAudioSettings(audio);
    const originalAudio = normalizeAudioSettings(profile?.audio);

    if (currentAudio.inputDeviceId !== originalAudio.inputDeviceId) return true;
    if (currentAudio.outputDeviceId !== originalAudio.outputDeviceId) return true;
    if (currentAudio.inputDeviceLabel !== originalAudio.inputDeviceLabel) return true;
    if (currentAudio.outputDeviceLabel !== originalAudio.outputDeviceLabel) return true;
    if (currentAudio.inputVolume !== originalAudio.inputVolume) return true;
    if (currentAudio.outputVolume !== originalAudio.outputVolume) return true;
    if (currentAudio.autoVad !== originalAudio.autoVad) return true;
    if (currentAudio.vadThreshold !== originalAudio.vadThreshold) return true;
    if (currentAudio.noiseSuppression !== originalAudio.noiseSuppression) return true;
    if (currentAudio.echoCancellation !== originalAudio.echoCancellation) return true;
    if (currentAudio.autoGainControl !== originalAudio.autoGainControl) return true;
    if (currentAudio.inputMode !== originalAudio.inputMode) return true;
    if (currentAudio.pttHotkey !== originalAudio.pttHotkey) return true;
    if (currentAudio.dynamicsCompression !== originalAudio.dynamicsCompression) return true;
    if (currentAudio.autoDucking !== originalAudio.autoDucking) return true;
    if (currentAudio.autoDuckingAmount !== originalAudio.autoDuckingAmount) return true;

    const currentGeneral = normalizeGeneralSettings(general);
    const originalGeneral = normalizeGeneralSettings(profile?.general);

    if (currentGeneral.openAtLogin !== originalGeneral.openAtLogin) return true;
    if (currentGeneral.minimizeToTray !== originalGeneral.minimizeToTray) return true;
    if (currentGeneral.startMinimized !== originalGeneral.startMinimized) return true;
    if (currentGeneral.enableNotifications !== originalGeneral.enableNotifications) return true;
    if (currentGeneral.enableSoundEffects !== originalGeneral.enableSoundEffects) return true;
    if (currentGeneral.sfxLevel !== originalGeneral.sfxLevel) return true;
    if (currentGeneral.disableHardwareAcceleration !== originalGeneral.disableHardwareAcceleration) return true;
    if (currentGeneral.language !== originalGeneral.language) return true;
    if (currentGeneral.zoomLevel !== originalGeneral.zoomLevel) return true;
    if (currentGeneral.enableQuickSuggestions !== originalGeneral.enableQuickSuggestions) return true;
    if (currentGeneral.enableContinuousAnimations !== originalGeneral.enableContinuousAnimations) return true;
    if (currentGeneral.enableOpenGraph !== originalGeneral.enableOpenGraph) return true;

    const originalKeybindings = Array.isArray(profile?.keybindings) ? profile.keybindings : [];
    if (keybindings.length !== originalKeybindings.length) return true;
    for (let i = 0; i < keybindings.length; i++) {
      const kb = keybindings[i];
      const orig = originalKeybindings.find((o) => o.id === kb.id);
      if (!orig) return true;
      if (kb.action !== orig.action) return true;
      if (kb.shortcut !== orig.shortcut) return true;
    }

    const origOverlay = {
      enabled: profile?.overlay?.enabled ?? true,
      position: profile?.overlay?.position ?? "top-left",
      opacity: profile?.overlay?.opacity ?? 0.6,
      autoHideWhenQuiet: profile?.overlay?.autoHideWhenQuiet ?? false,
      avatarOnly: profile?.overlay?.avatarOnly ?? false,
      showNameOnlyWhenSpeaking: profile?.overlay?.showNameOnlyWhenSpeaking ?? false,
    };
    if (overlay.enabled !== origOverlay.enabled) return true;
    if (overlay.position !== origOverlay.position) return true;
    if (overlay.opacity !== origOverlay.opacity) return true;
    if (overlay.autoHideWhenQuiet !== origOverlay.autoHideWhenQuiet) return true;
    if (overlay.avatarOnly !== origOverlay.avatarOnly) return true;
    if (overlay.showNameOnlyWhenSpeaking !== origOverlay.showNameOnlyWhenSpeaking) return true;

    const origCustomGames = Array.isArray(profile?.customGames) ? profile.customGames : [];
    if (customGames.length !== origCustomGames.length) return true;
    for (let i = 0; i < customGames.length; i++) {
      const cg = customGames[i];
      const orig = origCustomGames.find((o) => (o.id && o.id === cg.id) || o.exe === cg.exe);
      if (!orig) return true;
      if (
        cg.title !== orig.title ||
        cg.enabled !== orig.enabled ||
        cg.type !== orig.type ||
        cg.cover !== orig.cover
      )
        return true;
    }

    return false;
  })();

  const handleRevertLanguage = () => {
    if (i18n.language !== initialLanguageRef.current) {
      i18n.changeLanguage(initialLanguageRef.current);
      localStorage.setItem("onicord_language", initialLanguageRef.current);
    }
  };

  const handleCloseAttempt = () => {
    if (hasUnsavedChanges) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };

  const handleSubmitProfile = async () => {
    if (!profileReady || busy) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await window.electronAPI.saveProfile({
        id: userId,
        nickname: nickname.trim(),
        avatar,
        audio: normalizeAudioSettings(audio),
        general: normalizeGeneralSettings(general),
        customLink: customLink.trim(),
        profileColor,
        showRichPresence,
        customStatus: customStatus.trim(),
        keybindings,
        overlay,
        customGames,
      });
      if (window.electronAPI?.setOverlaySettings) {
        await window.electronAPI.setOverlaySettings(overlay);
      }
      onSaved(saved);
      if (saved?.general) {
        localStorage.setItem("onicord_general_settings", JSON.stringify(saved.general));
        window.dispatchEvent(
          new CustomEvent("onicord:general-settings-updated", { detail: saved.general })
        );
      }
      soundEngine.playCue("success");
      onClose();
    } catch (err) {
      setError(err.message || "No se pudo guardar el perfil.");
    } finally {
      setBusy(false);
    }
  };

  const renderFooter = () => {
    if (hasUnsavedChanges) {
      return (
        <>
          <ModalButton key="btn-cancel" variant="secondary" onClick={handleCloseAttempt} disabled={busy}>
            {t("common.cancel")}
          </ModalButton>
          <ModalButton
            key="btn-save"
            variant="primary"
            disabled={!profileReady || busy}
            onClick={handleSubmitProfile}
          >
            {busy ? t("common.saving") || "Guardando…" : t("common.save")}
          </ModalButton>
        </>
      );
    }
    return (
      <ModalButton key="btn-ready" variant="primary" onClick={onClose}>
        {t("common.confirm")}
      </ModalButton>
    );
  };

  return (
    <ModalShell
      title="Onicord"
      subtitle={t("settings.title")}
      sections={sections}
      activeSection={section}
      onSectionChange={setSection}
      onClose={handleCloseAttempt}
      footer={renderFooter()}
      sidebarFooter={
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="onicord-modal-nav-item flex items-center gap-2.5 w-full !text-onicord-danger hover:!bg-onicord-danger/10 font-semibold cursor-pointer border border-transparent"
        >
          <MaterialIcon
            name="delete_forever"
            size="sm"
            className="shrink-0 opacity-80"
          />
          <span>{t("settings.deleteAccount", "Eliminar cuenta")}</span>
        </button>
      }
    >
      {section === "general" && (
        <GeneralTab general={general} setGeneral={setGeneral} />
      )}

      {section === "profile" && (
        <ProfileTab
          nickname={nickname}
          setNickname={setNickname}
          avatar={avatar}
          setAvatar={setAvatar}
          customLink={customLink}
          setCustomLink={setCustomLink}
          profileColor={profileColor}
          setProfileColor={setProfileColor}
          showRichPresence={showRichPresence}
          setShowRichPresence={setShowRichPresence}
          customStatus={customStatus}
          setCustomStatus={setCustomStatus}
          setError={setError}
        />
      )}

      {section === "audio" && (
        <AudioTab
          audio={audio}
          setAudio={setAudio}
          inputs={inputs}
          outputs={outputs}
          isTestingMic={isTestingMic}
          micLevel={micLevel}
          toggleMicTest={toggleMicTest}
        />
      )}

      {section === "keybindings" && (
        <KeybindingsTab keybindings={keybindings} setKeybindings={setKeybindings} />
      )}

      {section === "overlay" && (
        <OverlayTab overlay={overlay} setOverlay={setOverlay} />
      )}

      {section === "games" && (
        <GamesActivityTab
          showRichPresence={showRichPresence}
          setShowRichPresence={setShowRichPresence}
          customGames={customGames}
          setCustomGames={setCustomGames}
        />
      )}

      {section === "appearance" && <ThemeManagerTab profile={profile} />}

      {section === "widgets" && (
        <WidgetsTab
          visibilidadWidgets={visibilidadWidgets}
          handleToggleWidget={handleToggleWidget}
          handleResetBento={handleResetBento}
        />
      )}

      {section === "stickers" && (
        <StickerManagerTab
          profile={profile}
          currentLayout={currentLayout}
          onUpdateLayout={onUpdateLayout}
        />
      )}

      {section === "plugins" && <PluginsTab />}

      {section === "cloud" && <CloudBackupTab />}

      {section === "about" && <AboutTab />}

      {section === "dev" && (
        <DevSandboxTab profile={profile} onProfileChange={onSaved} servers={servers} activeServerId={activeServerId} />
      )}

      {error && (
        <p className="onicord-error-banner mt-4 animate-fade-in">{error}</p>
      )}

      {showResetConfirm && (
        <ConfirmDialogModal
          isOpen={showResetConfirm}
          title={t("settings.resetBento")}
          message={t("settings.resetBento")}
          confirmLabel={t("common.confirm")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => {
            localStorage.removeItem(STORAGE_KEY);
            const baseGeometrias = getCombinedConfigs().reduce((acc, curr) => {
              acc[curr.id] = { ...curr.defaultGeo };
              return acc;
            }, {});
            onUpdateLayout(baseGeometrias);
            soundEngine.playCue("undo");
            setShowResetConfirm(false);
          }}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}

      {showCloseConfirm && (
        <ConfirmDialogModal
          isOpen={showCloseConfirm}
          title={t("settings.unsavedChangesTitle", "Unsaved Changes")}
          message={t("settings.unsavedChangesPrompt", "You have unsaved changes. Are you sure you want to discard them?")}
          confirmLabel={t("settings.discardChanges", "Discard Changes")}
          cancelLabel={t("settings.keepEditing", "Keep Editing")}
          onConfirm={() => {
            setShowCloseConfirm(false);
            handleRevertLanguage();
            onClose();
          }}
          onCancel={() => setShowCloseConfirm(false)}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialogModal
          isOpen={showDeleteConfirm}
          title={t("profileTab.deleteAccount", "Eliminar Cuenta")}
          message={t("settings.deleteAccountConfirmMessage", "¿Estás seguro de que deseas eliminar tu cuenta? Esto borrará tu perfil, servidores y chats de forma permanente.")}
          confirmLabel={t("common.confirm")}
          cancelLabel={t("common.cancel")}
          onConfirm={() => {
            setShowDeleteConfirm(false);
            onDeleteAccount();
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </ModalShell>
  );
}
