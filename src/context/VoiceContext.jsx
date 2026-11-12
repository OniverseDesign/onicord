import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useVoiceConnection } from "../hooks/useVoiceConnection";
import { useVoiceAfkTracker } from "../hooks/useVoiceAfkTracker";
import { checkPermission, canSpeakInChannel } from "../lib/permissionsHelper";
import { notificationManager } from "../lib/notificationManager";
import { soundEngine } from "../lib/soundEngine";

const VoiceContext = createContext(null);
const VoiceChannelContext = createContext(null);

export function VoiceProvider({ profile, children }) {
  const [currentVoiceServer, setCurrentVoiceServer] = useState(null);
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);

  const voice = useVoiceConnection(
    currentVoiceChannelId,
    profile,
    currentVoiceServer?.iceServers,
    currentVoiceServer?.roomCode || currentVoiceServer?.id || ""
  );

  const leaveVoiceRef = useRef(voice.leaveVoice);
  const voiceToggleMuteRef = useRef(voice.toggleMute);
  useEffect(() => {
    leaveVoiceRef.current = voice.leaveVoice;
    voiceToggleMuteRef.current = voice.toggleMute;
  }, [voice.leaveVoice, voice.toggleMute]);

  const { t } = useTranslation();

  const isCurrentChannelAfk = useMemo(() => {
    return Boolean(
      currentVoiceServer?.afkSettings?.channelId &&
      currentVoiceServer.afkSettings.channelId === currentVoiceChannelId
    );
  }, [currentVoiceServer, currentVoiceChannelId]);

  const canSpeak = useMemo(() => {
    if (!currentVoiceServer || !currentVoiceChannelId) return true;
    const ch = currentVoiceServer.channels?.find((c) => c.id === currentVoiceChannelId);
    return canSpeakInChannel(currentVoiceServer, ch, profile?.id);
  }, [currentVoiceServer, currentVoiceChannelId, profile?.id]);

  const safeToggleMute = useCallback(() => {
    if (isCurrentChannelAfk) {
      notificationManager.showToast(
        t("voice.afkMuteLockedTitle", "Canal AFK"),
        t("voice.afkMuteLockedDesc", "En el canal AFK solo se puede estar silenciado."),
        "warning"
      );
      return;
    }
    if (!canSpeak) {
      notificationManager.showToast(
        "Modo solo escucha",
        "No tienes permisos para hablar en este canal de voz.",
        "warning"
      );
      return;
    }
    voiceToggleMuteRef.current?.();
  }, [canSpeak, isCurrentChannelAfk, t]);

  useEffect(() => {
    if (voice.inVoice && !canSpeak && !voice.muted) {
      voice.toggleMute?.();
      if (isCurrentChannelAfk) {
        notificationManager.showToast(
          t("voice.afkMuteLockedTitle", "Canal AFK"),
          t("voice.afkMuteLockedDesc", "Has entrado al canal AFK. Tu micrófono se mantendrá silenciado."),
          "info"
        );
      } else {
        notificationManager.showToast(
          "Modo solo escucha",
          "Este canal de voz está restringido para tu rol. Tu micrófono se mantendrá silenciado.",
          "info"
        );
      }
    }
  }, [voice.inVoice, canSpeak, voice.muted, voice.toggleMute, isCurrentChannelAfk, t]);

  const safeToggleMuteRef = useRef(safeToggleMute);
  const toggleDeafenRef = useRef(voice.toggleDeafen);
  useEffect(() => {
    safeToggleMuteRef.current = safeToggleMute;
    toggleDeafenRef.current = voice.toggleDeafen;
  }, [safeToggleMute, voice.toggleDeafen]);

  const joinVoiceChannel = useCallback((server, channelId) => {
    if (!server || !channelId) return;
    if (profile?.id && !checkPermission(server, profile.id, "connect_voice")) {
      console.warn("[VoiceContext] Permiso connect_voice denegado para el usuario en este servidor.");
      return;
    }
    setCurrentVoiceServer(server);
    setCurrentVoiceChannelId(channelId);
  }, [profile?.id]);

  const leaveVoiceChannel = useCallback(() => {
    leaveVoiceRef.current?.();
    setCurrentVoiceServer(null);
    setCurrentVoiceChannelId(null);
  }, []);

  useEffect(() => {
    const handleToggleMute = () => {
      console.log("[VoiceContext 🎙️] Ejecutando atajo: Alternar Silencio");
      safeToggleMuteRef.current?.();
    };

    const handleToggleDeafen = () => {
      console.log("[VoiceContext 🎧] Ejecutando atajo: Alternar Ensordecer");
      toggleDeafenRef.current?.();
    };

    const handleDisconnectVoice = () => {
      console.log("[VoiceContext 🔌] Ejecutando atajo: Desconectar Voz");
      leaveVoiceChannel();
    };

    window.addEventListener("onicord:keybind:toggle_mute", handleToggleMute);
    window.addEventListener("onicord:keybind:toggle_deafen", handleToggleDeafen);
    window.addEventListener("onicord:keybind:disconnect_voice", handleDisconnectVoice);

    return () => {
      window.removeEventListener("onicord:keybind:toggle_mute", handleToggleMute);
      window.removeEventListener("onicord:keybind:toggle_deafen", handleToggleDeafen);
      window.removeEventListener("onicord:keybind:disconnect_voice", handleDisconnectVoice);
    };
  }, [leaveVoiceChannel]);

  // AFK Inactivity tracker
  useVoiceAfkTracker({
    server: currentVoiceServer,
    channelId: currentVoiceChannelId,
    voice,
    onMoveToAfk: (targetAfkId) => {
      if (currentVoiceServer) {
        joinVoiceChannel(currentVoiceServer, targetAfkId);
      }
    },
  });

  // Remote Move Listener (Drag & Drop admin moderation)
  useEffect(() => {
    if (!window.electronAPI?.onVoiceForceMove) return;
    const unsub = window.electronAPI.onVoiceForceMove((data) => {
      const { roomCode, channelId, movedBy, channelName } = data || {};
      if (currentVoiceServer && (!roomCode || roomCode === (currentVoiceServer.roomCode || currentVoiceServer.id))) {
        joinVoiceChannel(currentVoiceServer, channelId);
        soundEngine.playNav("select");
        notificationManager.showToast(
          t("voice.movedTitle", "Canal de voz"),
          t(
            "voice.movedByAdmin",
            `Fuiste movido a #${channelName || "canal"} por ${movedBy || "un administrador"}.`
          ),
          "info"
        );
      }
    });
    return () => unsub?.();
  }, [currentVoiceServer, joinVoiceChannel, t]);

  // Keep Voice Overlay synced globally even if RoomView is unmounted
  useEffect(() => {
    if (window.electronAPI?.updateOverlayMembers) {
      if (!currentVoiceChannelId || !voice.inVoice) {
        window.electronAPI.updateOverlayMembers([]);
      } else if (Array.isArray(voice.members) && voice.members.length > 0) {
        const serialized = voice.members.map((m) => ({
          peerId: m.peerId || m.id,
          nickname: m.nickname || (m.isSelf ? profile?.nickname : "User"),
          avatar: m.avatar || (m.isSelf ? profile?.avatar : null),
          isSpeaking: Boolean(m.isSpeaking),
          muted: Boolean(m.muted || m.isMuted),
          deafened: Boolean(m.deafened || m.isDeafened),
        }));
        window.electronAPI.updateOverlayMembers(serialized);
      }
    }
  }, [currentVoiceChannelId, voice.inVoice, voice.members, profile?.nickname, profile?.avatar]);

  // Decoupled voice channel connection context (stable across speaking & volume events)
  const channelInfoValue = useMemo(
    () => ({
      currentVoiceServer,
      currentVoiceChannelId,
      currentVoiceServerId: currentVoiceServer?.id || null,
      currentVoiceRoomCode: currentVoiceServer?.roomCode || null,
      joinVoiceChannel,
      leaveVoiceChannel,
      inVoice: Boolean(voice.inVoice),
    }),
    [currentVoiceServer, currentVoiceChannelId, joinVoiceChannel, leaveVoiceChannel, voice.inVoice]
  );

  const value = useMemo(
    () => ({
      ...voice,
      ...channelInfoValue,
      toggleMute: safeToggleMute,
      canSpeak,
    }),
    [voice, channelInfoValue, safeToggleMute, canSpeak]
  );

  return (
    <VoiceChannelContext.Provider value={channelInfoValue}>
      <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>
    </VoiceChannelContext.Provider>
  );
}

export function useGlobalVoice() {
  const context = useContext(VoiceContext);
  return context || {};
}

export function useVoiceChannelInfo() {
  const context = useContext(VoiceChannelContext);
  return context || {};
}

