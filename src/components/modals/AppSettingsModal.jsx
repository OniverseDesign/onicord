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
      { id: "general", label: t("settings.tabs.general"), icon: "settings" },
      { id: "profile", label: t("settings.tabs.profile"), icon: "person" },
      { id: "audio", label: t("settings.tabs.voiceVideo"), icon: "mic" },
      { id: "keybindings", label: t("settings.tabs.keybindings", "Atajos de Teclado"), icon: "keyboard" },
      { id: "overlay", label: t("settings.tabs.overlay", "Overlay"), icon: "layers" },
      { id: "games", label: t("settings.tabs.games", "Actividad"), icon: "sports_esports" },
      { id: "appearance", label: t("settings.tabs.appearance"), icon: "palette" },
      { id: "widgets", label: t("settings.tabs.widgets", "Dashboard"), icon: "dashboard" },
      { id: "stickers", label: t("settings.tabs.stickers", "Stickers"), icon: "sticky_note_2" },
      { id: "plugins", label: t("settings.tabs.plugins", "Complementos"), icon: "extension" },
      // { id: "cloud", label: t("settings.tabs.cloud", "Copia en la Nube"), icon: "cloud_upload" },
      { id: "about", label: t("settings.tabs.about", "Acerca de"), icon: "info" },
    ];
    if (import.meta.env.DEV) {
      list.push({ id: "dev", label: t("settings.tabs.developer"), icon: "developer_mode" });
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
    if (currentAudio.inputVolume !== originalAudio.inputVolume) return true;
    if (currentAudio.outputVolume !== originalAudio.outputVolume) return true;
    if (currentAudio.autoVad !== originalAudio.autoVad) return true;
    if (currentAudio.vadThreshold !== originalAudio.vadThreshold) return true;
    if (currentAudio.noiseSuppression !== originalAudio.noiseSuppression) return true;
    if (currentAudio.echoCancellation !== originalAudio.echoCancellation) return true;
    if (currentAudio.autoGainControl !== originalAudio.autoGainControl) return true;
    if (currentAudio.inputMode !== originalAudio.inputMode) return true;
    if (currentAudio.pttHotkey !== originalAudio.pttHotkey) return true;

    const currentGeneral = normalizeGeneralSettings(general);
    const originalGeneral = normalizeGeneralSettings(profile?.general);

    if (currentGeneral.openAtLogin !== originalGeneral.openAtLogin) return true;
    if (currentGeneral.minimizeToTray !== originalGeneral.minimizeToTray) return true;
    if (currentGeneral.startMinimized !== originalGeneral.startMinimized) return true;
    if (currentGeneral.enableNotifications !== originalGeneral.enableNotifications) return true;
    if (currentGeneral.enableSoundEffects !== originalGeneral.enableSoundEffects) return true;
    if (currentGeneral.disableHardwareAcceleration !== originalGeneral.disableHardwareAcceleration) return true;
    if (currentGeneral.language !== originalGeneral.language) return true;
    if (currentGeneral.zoomLevel !== originalGeneral.zoomLevel) return true;
    if (currentGeneral.enableQuickSuggestions !== originalGeneral.enableQuickSuggestions) return true;
    if (currentGeneral.enableContinuousAnimations !== originalGeneral.enableContinuousAnimations) return true;

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
