import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { useVoiceConnection } from "../hooks/useVoiceConnection";
import { checkPermission } from "../lib/permissionsHelper";

const VoiceContext = createContext(null);

export function VoiceProvider({ profile, children }) {
  const [currentVoiceServer, setCurrentVoiceServer] = useState(null);
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState(null);

  const voice = useVoiceConnection(
    currentVoiceChannelId,
    profile,
    currentVoiceServer?.iceServers,
    currentVoiceServer?.roomCode || currentVoiceServer?.id || ""
  );

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
    voice.leaveVoice?.();
    setCurrentVoiceServer(null);
    setCurrentVoiceChannelId(null);
  }, [voice]);

  useEffect(() => {
    const handleToggleMute = () => {
      console.log("[VoiceContext 🎙️] Ejecutando atajo: Alternar Silencio");
      voice.toggleMute?.();
    };

    const handleToggleDeafen = () => {
      console.log("[VoiceContext 🎧] Ejecutando atajo: Alternar Ensordecer");
      voice.toggleDeafen?.();
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
  }, [voice.toggleMute, voice.toggleDeafen, leaveVoiceChannel]);

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

  const value = useMemo(
    () => ({
      ...voice,
      currentVoiceServer,
      currentVoiceChannelId,
      currentVoiceServerId: currentVoiceServer?.id || null,
      currentVoiceRoomCode: currentVoiceServer?.roomCode || null,
      joinVoiceChannel,
      leaveVoiceChannel,
    }),
    [voice, currentVoiceServer, currentVoiceChannelId, joinVoiceChannel, leaveVoiceChannel]
  );

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useGlobalVoice() {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error("useGlobalVoice must be used within a VoiceProvider");
  }
  return context;
}
