import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useVoiceConnection } from "../hooks/useVoiceConnection";
import { checkPermission } from "../lib/permissionsHelper";

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
  useEffect(() => {
    leaveVoiceRef.current = voice.leaveVoice;
  }, [voice.leaveVoice]);

  const toggleMuteRef = useRef(voice.toggleMute);
  const toggleDeafenRef = useRef(voice.toggleDeafen);
  useEffect(() => {
    toggleMuteRef.current = voice.toggleMute;
    toggleDeafenRef.current = voice.toggleDeafen;
  }, [voice.toggleMute, voice.toggleDeafen]);

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
      toggleMuteRef.current?.();
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
    }),
    [voice, channelInfoValue]
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

