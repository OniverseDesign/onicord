import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";

const ScreenShareModal = lazy(() => import("../modals/ScreenShareModal"));
import UserListItem from "../ui/UserListItem";
import NetworkPopover from "../ui/NetworkPopover";
import ContextMenu from "../ui/ContextMenu";
import Tooltip from "../ui/Tooltip";
import MaterialIcon from "../icons/MaterialIcon";
import { useStreamerMode } from "../../context/StreamerModeContext";
import { notificationManager } from "../../lib/notificationManager";
import {
  WebcamStreamCompositor,
  DESKTOP_AUDIO_CONSTRAINTS,
  acquireWebcamStream,
  acquireSystemAudioOnlyStream,
} from "../../lib/voice/webcamCompositor";

export default function UserPanel({
  profile,
  effectiveProfile = null,
  inVoice,
  muted,
  deafened,
  voiceServerName,
  voiceChannelName,
  onToggleMute,
  onToggleDeafen,
  onDisconnect,
  onOpenAppSettings,
  onOpenServerSettings,
  onStreamStarted,
  activeGame,
  customStatus,
  connected = true,
  networkTopology = "mesh",
  sfuHostId = null,
  localPeerId = null,
  voiceMembers = [],
  managerRef = null,
  micHardwareError = false,
  micErrorMessage = null,
  onRetryMicrophone = null,
  onProfileChange,
  canShareVideo = true,
}) {
  const { t, i18n } = useTranslation();
  const { isStreamerMode, detectedApp } = useStreamerMode();
  const [targetRect, setTargetRect] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [voiceButtons, setVoiceButtons] = useState([]);

  useEffect(() => {
    let isMounted = true;
    const enrichButtonsWithLocales = (btns, installedList) => {
      if (!Array.isArray(btns)) return [];
      const byId = new Map((installedList || []).map((p) => [p.id, p]));
      return btns.map((b) => {
        const p = byId.get(b.pluginId);
        const manifestBtn = p?.voiceControlButtons?.find((mb) => mb.id === b.id);
        return {
          ...b,
          tooltips: b.tooltips || manifestBtn?.tooltips || null,
          locales: b.locales || p?.locales || null,
        };
      });
    };

    let cachedInstalled = [];
    const syncVoiceButtons = async () => {
      if (!window.electronAPI?.getVoiceControlButtons) return;
      try {
        let buttons = await window.electronAPI.getVoiceControlButtons();
        if (window.electronAPI?.listPlugins) {
          cachedInstalled = (await window.electronAPI.listPlugins()) || [];
          if (window.electronAPI?.reloadPlugin) {
            const activePluginIds = new Set((buttons || []).map((b) => b.pluginId));
            let reloadedAny = false;
            for (const p of cachedInstalled) {
              if (
                p.enabled !== false &&
                Array.isArray(p.voiceControlButtons) &&
                p.voiceControlButtons.length > 0 &&
                !activePluginIds.has(p.id)
              ) {
                await window.electronAPI.reloadPlugin(p.id);
                reloadedAny = true;
              }
            }
            if (reloadedAny) {
              buttons = await window.electronAPI.getVoiceControlButtons();
            }
          }
        }
        if (isMounted && Array.isArray(buttons)) {
          setVoiceButtons(enrichButtonsWithLocales(buttons, cachedInstalled));
        }
      } catch (err) {
        console.error("[UserPanel] Error sincronizando botones de voz:", err);
      }
    };

    syncVoiceButtons();

    const unsub = window.electronAPI?.onVoiceControlButtonsUpdated?.((buttons) => {
      if (isMounted && Array.isArray(buttons)) {
        setVoiceButtons(enrichButtonsWithLocales(buttons, cachedInstalled));
      }
    });

    return () => {
      isMounted = false;
      unsub?.();
    };
  }, []);

  useEffect(() => {
    if (!inVoice && isModalOpen) {
      setIsModalOpen(false);
    }
  }, [inVoice, isModalOpen]);

  useEffect(() => {
    if (!canShareVideo && isModalOpen) {
      setIsModalOpen(false);
    }
  }, [canShareVideo, isModalOpen]);

  const handleStatusSelect = async (status) => {
    localStorage.setItem("onicord_explicit_status", status);
    if (window.electronAPI?.saveProfile) {
      try {
        const saved = await window.electronAPI.saveProfile({
          ...profile,
          status,
        });
        onProfileChange?.(saved);
      } catch (err) {
        console.error("Error al actualizar estado del perfil:", err);
      }
    }
    setContextMenu(null);
  };

  const handleUserPanelContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
    });
  };

  const handleMouseEnter = (e) => {
    setTargetRect(e.currentTarget.getBoundingClientRect());
  };

  const handleMouseLeave = () => {
    setTargetRect(null);
  };

  const handleSelectSource = async (source, resolution, streamOptions = {}) => {
    setIsModalOpen(false);
    if (!canShareVideo) return;

    const isGameMode = Boolean(streamOptions.gameMode);
    const includeAudio = streamOptions?.includeAudio !== false;
    const mode = streamOptions?.mode === "camera" ? "camera" : "screen";
    const includeWebcam = mode === "camera" ? true : Boolean(streamOptions?.includeWebcam);
    const webcamDeviceId =
      streamOptions?.webcamDeviceId ||
      profile?.audio?.videoDeviceId ||
      localStorage.getItem("onicord_preferred_webcam") ||
      "";
    const webcamPosition = streamOptions?.webcamPosition || "bottom-right";
    const webcamMirror = streamOptions?.webcamMirror !== false;

    const fullOptions = {
      ...streamOptions,
      mode,
      resolution,
      gameMode: isGameMode,
      includeAudio,
      includeWebcam,
      webcamDeviceId,
      webcamPosition,
      webcamMirror,
    };

    // Mode 1: Camera-only stream (uses voice channel mic + optional system audio)
    if (mode === "camera") {
      let camStream = null;
      let sysAudioStream = null;
      try {
        camStream = await acquireWebcamStream({
          deviceId: webcamDeviceId,
          resolution,
          gameMode: isGameMode,
          isPipOverlay: false,
        });

        if (includeAudio) {
          sysAudioStream = await acquireSystemAudioOnlyStream();
        }

        const compositor = new WebcamStreamCompositor(sysAudioStream, camStream, {
          mode: "camera",
          position: webcamPosition,
          mirror: webcamMirror,
          gameMode: isGameMode,
        });

        onStreamStarted?.(compositor.outputStream, fullOptions, compositor);
      } catch (err) {
        console.error("[Camera Stream] Error al iniciar transmisión con cámara:", err);
        camStream?.getTracks().forEach((tr) => tr.stop());
        sysAudioStream?.getTracks().forEach((tr) => tr.stop());
        notificationManager.showToast(
          t("voice.errorTitle", "Error de Video"),
          err?.message ||
            t("screenShare.cameraPermissionError", "No se pudo acceder a la cámara web."),
          "danger"
        );
      }
      return;
    }

    // Mode 2: Screen / Window capture (with optional webcam PiP overlay & system audio)
    let videoConstraints = {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: source.id,
      minFrameRate: isGameMode ? 30 : 15,
    };

    if (resolution === "1080") {
      videoConstraints.maxWidth = 1920;
      videoConstraints.maxHeight = 1080;
      videoConstraints.maxFrameRate = isGameMode ? 60 : 30;
    } else if (resolution === "720") {
      videoConstraints.maxWidth = 1280;
      videoConstraints.maxHeight = 720;
      videoConstraints.maxFrameRate = isGameMode ? 60 : 30;
    } else if (resolution === "480") {
      videoConstraints.maxWidth = 854;
      videoConstraints.maxHeight = 480;
      videoConstraints.maxFrameRate = isGameMode ? 60 : 30;
    } else {
      videoConstraints.maxFrameRate = isGameMode ? 60 : 30;
    }

    let screenStream = null;
    if (includeAudio) {
      try {
        // Attempt desktop capture with audio first (mandatory: chromeMediaSource: "desktop")
        screenStream = await navigator.mediaDevices.getUserMedia({
          audio: DESKTOP_AUDIO_CONSTRAINTS,
          video: { mandatory: videoConstraints },
        });
      } catch (err) {
        console.warn("[Screen Share] Captura con audio no disponible en esta fuente, intentando sin audio:", err.message);
        if (err.name === "NotAllowedError") return;
      }
    }

    if (!screenStream) {
      try {
        screenStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { mandatory: videoConstraints },
        });
      } catch (fallbackErr) {
        console.error("Error al capturar pantalla (fallback sin audio):", fallbackErr);
        return;
      }
    }

    if (includeWebcam) {
      try {
        const camStream = await acquireWebcamStream({
          deviceId: webcamDeviceId,
          resolution,
          gameMode: isGameMode,
          isPipOverlay: true,
        });
        const compositor = new WebcamStreamCompositor(screenStream, camStream, {
          mode: "screen",
          position: webcamPosition,
          mirror: webcamMirror,
          gameMode: isGameMode,
        });
        onStreamStarted?.(compositor.outputStream, fullOptions, compositor);
        return;
      } catch (camErr) {
        console.warn("[Screen Share] No se pudo activar webcam superpuesta:", camErr?.message);
        notificationManager.showToast(
          t("screenShare.webcamOverlay", "Webcam"),
          camErr?.message ||
            t("screenShare.cameraPermissionError", "No se pudo acceder a la cámara web."),
          "warning"
        );
        onStreamStarted?.(screenStream, { ...fullOptions, includeWebcam: false }, null);
        return;
      }
    }

    onStreamStarted?.(screenStream, { ...fullOptions, includeWebcam: false }, null);
  };

  const displayProfile = effectiveProfile || profile;
  const displayActivity =
    (displayProfile?.showRichPresence ?? profile?.showRichPresence) !== false
      ? activeGame
      : null;

  const avatarStatus = !connected
    ? "offline"
    : isStreamerMode
      ? inVoice && (muted || deafened)
        ? "muted"
        : "streamer"
      : inVoice
        ? muted || deafened
          ? "muted"
          : "voice"
        : (profile?.status || "online");

  let subtitleText = null;
  if (customStatus) {
    subtitleText = customStatus;
  } else if (inVoice && deafened) {
    subtitleText = t("userPanel.deafened");
  } else if (inVoice && muted) {
    subtitleText = t("userPanel.muted");
  } else if (inVoice) {
    subtitleText = t("userPanel.inVoiceChannel");
  } else if (isStreamerMode) {
    subtitleText = detectedApp
      ? t("settings.general.streamerModeStreaming", "Transmitiendo ({{app}})", { app: detectedApp })
      : t("settings.general.streamerMode", "Modo Streamer");
  } else if (!displayActivity?.name) {
    subtitleText = t("userPanel.online");
  }

  const uniqueVoiceButtons = useMemo(() => {
    const seen = new Set();
    return voiceButtons.filter((btn) => {
      const key = `${btn.pluginId}-${btn.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [voiceButtons]);

  const renderVoiceControls = () => {
    return (
      <div className="flex shrink-0 items-center gap-1.5 ml-2">
        {/* Dynamic addon control buttons for voice channels */}
        {uniqueVoiceButtons.map((btn) => {
          const isImage = typeof btn.icon === "string" && (
            btn.icon.startsWith("http://") ||
            btn.icon.startsWith("https://") ||
            btn.icon.startsWith("data:") ||
            btn.icon.startsWith("onicord-media://") ||
            btn.icon.endsWith(".svg") ||
            btn.icon.endsWith(".png")
          );

          const currentLang = (i18n.language || "es").split("-")[0].toLowerCase();
          const resolvedTooltip =
            btn.tooltips?.[currentLang] ||
            btn.locales?.[currentLang]?.voiceTooltip ||
            btn.tooltip ||
            btn.locales?.[currentLang]?.name ||
            btn.pluginName ||
            t("common.plugin", "Complemento");

          return (
            <div
              key={`${btn.pluginId}-${btn.id}`}
              className={`overflow-hidden transition-all duration-relaxed ease-in-out flex items-center justify-center shrink-0 ${
                inVoice
                  ? "w-8 opacity-100 scale-100 pointer-events-auto"
                  : "w-0 opacity-0 scale-75 pointer-events-none -mr-1.5"
              }`}
            >
              <Tooltip content={resolvedTooltip} side="top">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    window.electronAPI?.triggerVoiceControlButton?.(btn.pluginId, btn.id, {
                      language: currentLang,
                    });
                  }}
                  className="onicord-icon-btn text-onicord-text hover:text-onicord-accent transition-colors flex items-center justify-center relative group shrink-0"
                >
                  {isImage ? (
                    <img
                      src={btn.icon}
                      alt={resolvedTooltip}
                      className="w-5 h-5 object-contain"
                    />
                  ) : (
                    <MaterialIcon name={btn.icon || "extension"} size="lg" />
                  )}
                  {btn.badge && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-onicord-accent" />
                  )}
                </button>
              </Tooltip>
            </div>
          );
        })}

        {/* Screen share button */}
        <div
          className={`overflow-hidden transition-all duration-relaxed ease-in-out flex items-center justify-center shrink-0 ${
            inVoice
              ? "w-8 opacity-100 scale-100 pointer-events-auto"
              : "w-0 opacity-0 scale-75 pointer-events-none -mr-1.5"
          }`}
        >
          <Tooltip
            content={
              canShareVideo
                ? t("userPanel.shareScreen")
                : t("userPanel.noShareVideoPermission", "Sin permisos para transmitir pantalla en este servidor")
            }
            side="top"
          >
            <button
              type="button"
              disabled={!canShareVideo}
              onClick={(e) => {
                e.stopPropagation();
                if (!canShareVideo) return;
                setIsModalOpen(true);
              }}
              className={`onicord-icon-btn shrink-0 ${!canShareVideo ? "opacity-35 !cursor-not-allowed pointer-events-none" : ""}`}
            >
              <MaterialIcon name="screen_share" size="lg" />
            </button>
          </Tooltip>
        </div>

        {/* Mute toggle button */}
        <Tooltip content={muted ? t("userPanel.unmute") : t("userPanel.mute")} side="top">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute?.();
            }}
            className={`onicord-icon-btn shrink-0 ${muted ? "onicord-icon-btn-active text-onicord-danger" : ""}`}
          >
            {muted ? <MaterialIcon name="mic_off" size="lg" /> : <MaterialIcon name="mic" size="lg" />}
          </button>
        </Tooltip>

        {/* Deafen toggle button */}
        <Tooltip content={deafened ? t("userPanel.undeafen") : t("userPanel.deafen")} side="top">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDeafen?.();
            }}
            className={`onicord-icon-btn shrink-0 ${deafened ? "onicord-icon-btn-active text-onicord-danger" : ""}`}
          >
            {deafened ? <MaterialIcon name="headset_off" size="lg" /> : <MaterialIcon name="headset_mic" size="lg" />}
          </button>
        </Tooltip>

        {/* Voice disconnect button */}
        <div
          className={`overflow-hidden transition-all duration-relaxed ease-in-out flex items-center justify-center shrink-0 ${
            inVoice
              ? "w-8 opacity-100 scale-100 pointer-events-auto"
              : "w-0 opacity-0 scale-75 pointer-events-none -ml-1.5"
          }`}
        >
          <Tooltip content={t("userPanel.disconnect")} side="top">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDisconnect?.();
              }}
              className="onicord-icon-btn onicord-icon-btn-danger shrink-0"
            >
              <MaterialIcon name="call_end" size="lg" />
            </button>
          </Tooltip>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full shrink-0 bg-onicord-base rounded-onicord-outer-p4 p-2 border border-onicord-island box-border flex flex-col overflow-hidden select-none">
      <div
        className={`overflow-hidden transition-all duration-relaxed ease-in-out ${
          inVoice
            ? "max-h-24 opacity-100 mb-0"
            : "max-h-0 opacity-0 pointer-events-none"
        }`}
      >
        <div className="onicord-user-panel-profile-btn">
          <div
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className="onicord-btn-success cursor-help"
          >
            <MaterialIcon name="podcasts" size="xl" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-onicord-success">
              {voiceServerName || t("userPanel.voiceConnected")}
            </p>
            <p className="truncate text-xs font-medium text-onicord-muted">
              {voiceChannelName}
            </p>
          </div>
        </div>
        <hr className="my-2 border-onicord-border border-t-1" />
      </div>

      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex-1 min-w-0">
          <UserListItem
            as="button"
            type="button"
            className="onicord-user-panel-profile-btn w-full min-w-0 text-left cursor-pointer"
            nickname={displayProfile?.nickname ?? t("common.user")}
            avatar={displayProfile?.avatar}
            status={avatarStatus}
            isSelf={true}
            activity={displayActivity}
            customStatus={customStatus || null}
            fallbackSubtitle={subtitleText}
            avatarSize="md"
            showStatusDot={true}
            showFlame={false}
            onClick={() => onOpenAppSettings?.("profile")}
            onContextMenu={handleUserPanelContextMenu}
          />
        </div>
        {renderVoiceControls()}
      </div>

      {isModalOpen && (
        <Suspense fallback={null}>
          <ScreenShareModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSelectSource={handleSelectSource}
            preferredWebcamId={profile?.audio?.videoDeviceId || ""}
          />
        </Suspense>
      )}

      {targetRect && (
        <NetworkPopover
          rect={targetRect}
          networkTopology={networkTopology}
          localPeerId={localPeerId}
          voiceMembers={voiceMembers}
          managerRef={managerRef}
          alwaysRelay={Boolean(profile?.general?.alwaysRelayVoice)}
        />
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={t("userPanel.setStatus", "Cambiar Estado")}
          onClose={() => setContextMenu(null)}
          items={[
            {
              label: t("status.online", "Conectado"),
              icon: <span className="w-2.5 h-2.5 rounded-full bg-onicord-status-online shrink-0" />,
              onClick: () => handleStatusSelect("online"),
            },
            {
              label: t("status.idle", "Ausente"),
              icon: <span className="w-2.5 h-2.5 rounded-full bg-onicord-status-idle shrink-0" />,
              onClick: () => handleStatusSelect("idle"),
            },
            {
              label: t("status.dnd", "No molestar"),
              icon: <span className="w-2.5 h-2.5 rounded-full bg-onicord-status-dnd shrink-0" />,
              onClick: () => handleStatusSelect("dnd"),
            },
            {
              label: t("status.invisible", "Invisible"),
              icon: <span className="w-2.5 h-2.5 rounded-full bg-onicord-status-offline shrink-0" />,
              onClick: () => handleStatusSelect("invisible"),
            },
          ]}
        />
      )}
    </div>
  );
}
