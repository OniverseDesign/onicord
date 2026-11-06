import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useVoiceConnection } from "../hooks/useVoiceConnection";
import { checkPermission, canSpeakInChannel } from "../lib/permissionsHelper";
import { notificationManager } from "../lib/notificationManager";

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

  const canSpeak = useMemo(() => {
    if (!currentVoiceServer || !currentVoiceChannelId) return true;
    const ch = currentVoiceServer.channels?.find((c) => c.id === currentVoiceChannelId);
    return canSpeakInChannel(currentVoiceServer, ch, profile?.id);
  }, [currentVoiceServer, currentVoiceChannelId, profile?.id]);

  const safeToggleMute = useCallback(() => {
    if (!canSpeak) {
      notificationManager.showToast(
        "Modo solo escucha",
        "No tienes permisos para hablar en este canal de voz.",
        "warning"
      );
      return;
    }
    voiceToggleMuteRef.current?.();
  }, [canSpeak]);

  useEffect(() => {
    if (voice.inVoice && !canSpeak && !voice.muted) {
      voice.toggleMute?.();
      notificationManager.showToast(
        "Modo solo escucha",
        "Este canal de voz está restringido para tu rol. Tu micrófono se mantendrá silenciado.",
        "info"
      );
    }
  }, [voice.inVoice, canSpeak, voice.muted, voice.toggleMute]);

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

