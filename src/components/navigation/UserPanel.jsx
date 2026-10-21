import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  IconMicOn,
  IconMicOff,
  IconDeafenOn,
  IconDeafenOff,
  IconCallEnd,
  IconScreenShare,
  IconPodcast,
} from "../icons/StreamIcons";

import ScreenShareModal from "../modals/ScreenShareModal";
import UserListItem from "../ui/UserListItem";
import NetworkPopover from "../ui/NetworkPopover";
import ContextMenu from "../ui/ContextMenu";
import MaterialIcon from "../icons/MaterialIcon";

export default function UserPanel({
  profile,
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
  const { t } = useTranslation();
  const [targetRect, setTargetRect] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [voiceButtons, setVoiceButtons] = useState([]);

  useEffect(() => {
    let isMounted = true;
    if (window.electronAPI?.getVoiceControlButtons) {
      window.electronAPI.getVoiceControlButtons().then((buttons) => {
        if (isMounted && Array.isArray(buttons)) {
          setVoiceButtons(buttons);
        }
      });
    }

    const unsub = window.electronAPI?.onVoiceControlButtonsUpdated?.((buttons) => {
      if (isMounted && Array.isArray(buttons)) {
        setVoiceButtons(buttons);
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

  const handleSelectSource = async (source, resolution) => {
    setIsModalOpen(false);
    if (!canShareVideo) return;
    let videoConstraints = {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: source.id,
      minFrameRate: 15,
    };

    if (resolution === "1080") {
      videoConstraints.maxWidth = 1920;
      videoConstraints.maxHeight = 1080;
      videoConstraints.maxFrameRate = 30;
    } else if (resolution === "720") {
      videoConstraints.maxWidth = 1280;
      videoConstraints.maxHeight = 720;
      videoConstraints.maxFrameRate = 30;
    } else if (resolution === "480") {
      videoConstraints.maxWidth = 854;
      videoConstraints.maxHeight = 480;
      videoConstraints.maxFrameRate = 30;
    } else {
      videoConstraints.maxFrameRate = 60;
    }

    try {
      // Intentar primero capturar pantalla con audio de escritorio (mandatory: chromeMediaSource: "desktop")
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "desktop",
          },
        },
        video: { mandatory: videoConstraints },
      });
      if (stream && onStreamStarted) onStreamStarted(stream);
    } catch (err) {
      console.warn("[Screen Share] Captura con audio no disponible en esta fuente, intentando sin audio:", err.message);
      if (err.name !== "NotAllowedError") {
        try {
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { mandatory: videoConstraints },
          });
          if (fallbackStream && onStreamStarted) onStreamStarted(fallbackStream);
        } catch (fallbackErr) {
          console.error("Error al capturar pantalla (fallback sin audio):", fallbackErr);
        }
      }
    }
  };

  const avatarStatus = !connected
    ? "offline"
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
  } else if (!activeGame?.name) {
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
    if (!inVoice) return null;
    return (
      <div className="flex shrink-0 items-center gap-1.5 ml-2">
        {/* Slots dinámicos para botones de complementos en canal de voz */}
        {uniqueVoiceButtons.map((btn) => {
          const isImage = typeof btn.icon === "string" && (
            btn.icon.startsWith("http://") ||
            btn.icon.startsWith("https://") ||
            btn.icon.startsWith("data:") ||
            btn.icon.startsWith("onicord-media://") ||
            btn.icon.endsWith(".svg") ||
            btn.icon.endsWith(".png")
          );

          return (
            <button
              key={`${btn.pluginId}-${btn.id}`}
              type="button"
              title={btn.tooltip || btn.pluginName || t("common.plugin", "Complemento")}
              onClick={(e) => {
                e.stopPropagation();
                window.electronAPI?.triggerVoiceControlButton?.(btn.pluginId, btn.id);
              }}
              className="onicord-icon-btn text-onicord-text hover:text-onicord-accent transition-colors flex items-center justify-center relative group"
            >
              {isImage ? (
                <img
                  src={btn.icon}
                  alt={btn.tooltip || "icon"}
                  className="w-5 h-5 object-contain"
                />
              ) : (
                <MaterialIcon name={btn.icon || "extension"} size="lg" />
              )}
              {btn.badge && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-onicord-accent" />
              )}
            </button>
          );
        })}

        {inVoice && (
          <>
            <button
              type="button"
              disabled={!canShareVideo}
              title={
                canShareVideo
                  ? t("userPanel.shareScreen")
                  : t("userPanel.noShareVideoPermission", "Sin permisos para transmitir pantalla en este servidor")
              }
              onClick={(e) => {
                e.stopPropagation();
                if (!canShareVideo) return;
                setIsModalOpen(true);
              }}
              className={`onicord-icon-btn ${!canShareVideo ? "opacity-35 !cursor-not-allowed pointer-events-none" : ""}`}
            >
              <IconScreenShare size="lg" />
            </button>
            <button
              type="button"
              title={muted ? t("userPanel.unmute") : t("userPanel.mute")}
              onClick={(e) => {
                e.stopPropagation();
                onToggleMute();
              }}
              className={`onicord-icon-btn ${muted ? "onicord-icon-btn-active text-onicord-danger" : ""}`}
            >
              {muted ? <IconMicOff size="lg" /> : <IconMicOn size="lg" />}
            </button>
            <button
              type="button"
              title={deafened ? t("userPanel.undeafen") : t("userPanel.deafen")}
              onClick={(e) => {
                e.stopPropagation();
                onToggleDeafen();
              }}
              className={`onicord-icon-btn ${deafened ? "onicord-icon-btn-active text-onicord-danger" : ""}`}
            >
              {deafened ? <IconDeafenOff size="lg" /> : <IconDeafenOn size="lg" />}
            </button>
            <button
              type="button"
              title={t("userPanel.disconnect")}
              onClick={(e) => {
                e.stopPropagation();
                onDisconnect();
              }}
              className="onicord-icon-btn onicord-icon-btn-danger"
            >
              <IconCallEnd size="lg" />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="w-full shrink-0 bg-onicord-base rounded-onicord-outer-p4 p-2 border border-onicord-island box-border flex flex-col overflow-hidden select-none">
      {inVoice && (
        <div>
          <div className="onicord-user-panel-profile-btn">
            <div
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
              className="onicord-btn-success cursor-help"
            >
              <IconPodcast size="xl" />
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
          <hr className="my-2 border-onicord-dark-muted border-t-1" />
        </div>
      )}
      <div className="flex items-center justify-between w-full min-w-0">
        <div className="flex-1 min-w-0">
          <UserListItem
            as="button"
            type="button"
            className="onicord-user-panel-profile-btn w-full min-w-0 text-left cursor-pointer"
            nickname={profile?.nickname ?? t("common.user")}
            avatar={profile?.avatar}
            status={avatarStatus}
            isSelf={true}
            activity={activeGame}
            customStatus={customStatus ? undefined : null}
            fallbackSubtitle={subtitleText}
            avatarSize="md"
            showStatusDot={true}
            showFlame={false}
            onClick={onOpenAppSettings}
            onContextMenu={handleUserPanelContextMenu}
          />
        </div>
        {renderVoiceControls()}
      </div>

      <ScreenShareModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSelectSource={handleSelectSource}
      />

      {targetRect && (
        <NetworkPopover
          rect={targetRect}
          networkTopology={networkTopology}
          localPeerId={localPeerId}
          voiceMembers={voiceMembers}
          managerRef={managerRef}
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
              icon: <span className="w-2.5 h-2.5 rounded-full bg-onicord-success shrink-0" />,
              onClick: () => handleStatusSelect("online"),
            },
            {
              label: t("status.idle", "Ausente"),
              icon: <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />,
              onClick: () => handleStatusSelect("idle"),
            },
            {
              label: t("status.dnd", "No molestar"),
              icon: <span className="w-2.5 h-2.5 rounded-full bg-onicord-danger shrink-0" />,
              onClick: () => handleStatusSelect("dnd"),
            },
            {
              label: t("status.invisible", "Invisible"),
              icon: <span className="w-2.5 h-2.5 rounded-full bg-onicord-overlay shrink-0" />,
              onClick: () => handleStatusSelect("invisible"),
            },
          ]}
        />
      )}
    </div>
  );
}
