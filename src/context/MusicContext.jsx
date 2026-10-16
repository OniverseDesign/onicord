import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useGlobalVoice } from "./VoiceContext";
import { checkPermission } from "../lib/permissionsHelper";

const MusicContext = createContext(null);

export function MusicProvider({ profile, activeServer, children }) {
  const globalVoice = useGlobalVoice();
  const {
    currentVoiceServer,
    currentVoiceChannelId,
    currentVoiceRoomCode,
    inVoice,
    members: voiceMembers,
  } = globalVoice;

  const audioRef = useRef(null);

  // Playback state for active voice channel
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [repeatMode, setRepeatMode] = useState(0); // 0 = off, 1 = repeat queue, 2 = repeat one
  const [djUserId, setDjUserId] = useState(null);
  const [djPeerId, setDjPeerId] = useState(null);

  // Opt-in gate: user must accept before audio plays in their local client
  const [hasJoinedMusic, setHasJoinedMusic] = useState(false);

  // Volume: persisted locally per user
  const [volume, setVolumeState] = useState(() => {
    try {
      const saved = localStorage.getItem("onicord_music_volume");
      return saved !== null ? parseFloat(saved) : 0.5;
    } catch {
      return 0.5;
    }
  });

  const setVolume = useCallback((val) => {
    const num = Math.max(0, Math.min(1, Number(val)));
    setVolumeState(num);
    try {
      localStorage.setItem("onicord_music_volume", String(num));
    } catch {}
    if (audioRef.current) {
      audioRef.current.volume = num;
    }
  }, []);

  // History (persisted on disk per server, max 100 songs)
  const [playHistory, setPlayHistory] = useState([]);
  const activeServerId = activeServer?.id || currentVoiceServer?.id || null;

  // Track local audio stream source
  const [localAudioUrl, setLocalAudioUrl] = useState(null);
  const localAudioUrlRef = useRef(null);

  // Synchronization refs
  const channelStateRef = useRef({
    currentTrack: null,
    playlist: [],
    isPlaying: false,
    repeatMode: 0,
    currentTime: 0,
    updatedAt: 0,
    djUserId: null,
    djPeerId: null,
  });

  const isDJ = Boolean(
    djUserId && profile?.id && djUserId === profile.id
  );

  const canManageMusic = Boolean(
    isDJ ||
    checkPermission(activeServer || currentVoiceServer, profile?.id, "manage_music")
  );

  // Helper: Expected playback time calculation with clamp
  const getExpectedPlaybackTime = useCallback((state) => {
    if (!state || typeof state.currentTime !== "number" || state.currentTime < 0) {
      return 0;
    }
    if (!state.isPlaying) {
      return state.currentTime;
    }
    const elapsed = Math.max(0, (Date.now() - (state.updatedAt || Date.now())) / 1000);
    const expected = state.currentTime + elapsed;
    const maxDur = state.currentTrack?.durationSeconds || 0;
    if (maxDur > 0 && expected > maxDur) return maxDur;
    return expected;
  }, []);

  // 1. Cargar historial del servidor al cambiar de servidor activo
  useEffect(() => {
    if (!activeServerId || !window.electronAPI?.loadHistory) return;
    window.electronAPI.loadHistory(activeServerId).then((history) => {
      if (Array.isArray(history)) {
        setPlayHistory(history.slice(0, 100));
      }
    }).catch(console.error);
  }, [activeServerId]);

  // Guardar en historial cuando una canción comienza
  const recordToHistory = useCallback((track) => {
    if (!track || !track.trackId || !activeServerId) return;
    setPlayHistory((prev) => {
      const historyItem = {
        id: track.trackId,
        trackId: track.trackId,
        title: track.title || "Audio",
        author: track.author || "Unknown",
        duration: track.duration || "0:00",
        durationSeconds: track.durationSeconds || 0,
        thumbnail: track.thumbnail || "",
        source: track.source || "Audio",
        originalUrl: track.originalUrl || track.audioUrl || "",
        playedAt: Date.now(),
        playedBy: profile ? {
          id: profile.id,
          nickname: profile.nickname,
          avatar: profile.avatar,
        } : null,
      };

      const filtered = prev.filter((t) => t && t.trackId !== track.trackId);
      const updated = [historyItem, ...filtered].slice(0, 100);

      if (window.electronAPI?.saveHistory) {
        window.electronAPI.saveHistory(activeServerId, updated).catch(console.error);
      }
      return updated;
    });
  }, [activeServerId, profile]);

  // 2. Broadcast de estado autoritativo (Solo el DJ)
  const broadcastCurrentState = useCallback((overrides = {}) => {
    if (!currentVoiceChannelId || !window.electronAPI?.broadcastMusicState) return;

    const currentPos = typeof overrides.currentTime === "number"
      ? overrides.currentTime
      : (audioRef.current?.currentTime || 0);

    const now = Date.now();
    const statePayload = {
      channelId: currentVoiceChannelId,
      djUserId: overrides.djUserId !== undefined ? overrides.djUserId : (djUserId || profile?.id || null),
      djPeerId: overrides.djPeerId !== undefined ? overrides.djPeerId : djPeerId,
      currentTrack: overrides.currentTrack !== undefined ? overrides.currentTrack : currentTrack,
      playlist: overrides.playlist !== undefined ? overrides.playlist : playlist,
      isPlaying: overrides.isPlaying !== undefined ? overrides.isPlaying : isPlaying,
      repeatMode: overrides.repeatMode !== undefined ? overrides.repeatMode : repeatMode,
      currentTime: currentPos,
      updatedAt: now,
    };

    channelStateRef.current = statePayload;
    window.electronAPI.broadcastMusicState(
      currentVoiceChannelId,
      statePayload,
      currentVoiceRoomCode
    ).catch(console.error);
  }, [currentVoiceChannelId, currentVoiceRoomCode, djUserId, djPeerId, profile?.id, currentTrack, playlist, isPlaying, repeatMode]);

  // 3. Heartbeat del DJ para mantener sincronizados a los oyentes
  useEffect(() => {
    if (!isDJ || !isPlaying || !currentTrack || !currentVoiceChannelId) return;

    const heartbeat = setInterval(() => {
      if (audioRef.current && !audioRef.current.paused) {
        broadcastCurrentState({
          currentTime: audioRef.current.currentTime || 0,
          isPlaying: true,
        });
      }
    }, 4000);

    return () => clearInterval(heartbeat);
  }, [isDJ, isPlaying, currentTrack, currentVoiceChannelId, broadcastCurrentState]);

  // 4. Limpieza cuando el usuario sale del canal de voz
  useEffect(() => {
    if (!inVoice || !currentVoiceChannelId) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
      }
      setCurrentTrack(null);
      setPlaylist([]);
      setIsPlaying(false);
      setHasJoinedMusic(false);
      setLocalAudioUrl(null);
      setDjUserId(null);
      setDjPeerId(null);
    }
  }, [inVoice, currentVoiceChannelId]);

  // 5. Localización de audio de la pista (resuelve URL local o proxy seguro)
  useEffect(() => {
    if (!currentTrack) {
      setLocalAudioUrl(null);
      localAudioUrlRef.current = null;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
      }
      return;
    }

    let active = true;
    if (window.electronAPI?.localizeTrack) {
      window.electronAPI.localizeTrack(currentTrack).then((res) => {
        if (!active) return;
        if (res?.success && res.audioUrl) {
          setLocalAudioUrl(res.audioUrl);
          localAudioUrlRef.current = res.audioUrl;
        } else {
          console.warn("[MusicSession] Could not localize track:", res?.error);
        }
      }).catch((err) => {
        if (active) console.error("[MusicSession] Localize track error:", err);
      });
    } else if (currentTrack.audioUrl) {
      setLocalAudioUrl(currentTrack.audioUrl);
      localAudioUrlRef.current = currentTrack.audioUrl;
    }

    return () => {
      active = false;
    };
  }, [currentTrack?.trackId]);

  // 6. Control del elemento <audio> según hasJoinedMusic e isPlaying
  useEffect(() => {
    const audioNode = audioRef.current;
    if (!audioNode) return;

    audioNode.volume = volume;

    if (isPlaying && localAudioUrl && hasJoinedMusic === true) {
      if (audioNode.src !== localAudioUrl) {
        audioNode.src = localAudioUrl;
        const targetTime = getExpectedPlaybackTime(channelStateRef.current);
        if (targetTime > 0) {
          audioNode.currentTime = targetTime;
        }
      }

      const playPromise = audioNode.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name !== "AbortError") {
            console.warn("[MusicSession] Play rejected:", err.message);
          }
        });
      }
    } else {
      audioNode.pause();
    }
  }, [isPlaying, localAudioUrl, hasJoinedMusic, volume, getExpectedPlaybackTime]);

  // 7. Corrección suave de deriva (Drift correction) para oyentes remotos
  useEffect(() => {
    if (isDJ || hasJoinedMusic !== true || !isPlaying || !currentTrack) return;

    const driftInterval = setInterval(() => {
      const audioNode = audioRef.current;
      if (!audioNode || audioNode.readyState < 1) return;

      const targetTime = getExpectedPlaybackTime(channelStateRef.current);
      const diff = audioNode.currentTime - targetTime;
      const absDiff = Math.abs(diff);

      if (absDiff > 2.5) {
        // Deriva grande: corrección con seek
        console.log(`[MusicSync] Seek drift correction: local=${audioNode.currentTime.toFixed(2)}s target=${targetTime.toFixed(2)}s`);
        audioNode.currentTime = targetTime;
        audioNode.playbackRate = 1.0;
      } else if (absDiff > 0.4) {
        // Micro-ajuste suave en playbackRate
        audioNode.playbackRate = diff > 0 ? 0.96 : 1.04;
      } else {
        if (audioNode.playbackRate !== 1.0) {
          audioNode.playbackRate = 1.0;
        }
      }
    }, 2500);

    return () => clearInterval(driftInterval);
  }, [isDJ, hasJoinedMusic, isPlaying, currentTrack, getExpectedPlaybackTime]);

  // 8. Manejo de terminación de pista (<audio onEnded>) — Solo el DJ avanza
  const handleTrackEnded = useCallback(() => {
    if (!isDJ) return;

    if (repeatMode === 2 && currentTrack) {
      if (audioRef.current) audioRef.current.currentTime = 0;
      audioRef.current?.play().catch(console.error);
      broadcastCurrentState({ currentTime: 0, isPlaying: true });
      return;
    }

    if (playlist.length === 0) {
      if (repeatMode === 1 && currentTrack) {
        if (audioRef.current) audioRef.current.currentTime = 0;
        audioRef.current?.play().catch(console.error);
        broadcastCurrentState({ currentTime: 0, isPlaying: true });
        return;
      }
      // Sin más pistas: detener sesión
      setCurrentTrack(null);
      setIsPlaying(false);
      broadcastCurrentState({
        currentTrack: null,
        playlist: [],
        isPlaying: false,
        currentTime: 0,
      });
      return;
    }

    const nextTrack = playlist[0];
    const nextList = playlist.slice(1);
    if (repeatMode === 1 && currentTrack) {
      nextList.push(currentTrack);
    }

    setPlaylist(nextList);
    setCurrentTrack(nextTrack);
    setIsPlaying(true);
    if (audioRef.current) audioRef.current.currentTime = 0;

    recordToHistory(nextTrack);
    broadcastCurrentState({
      currentTrack: nextTrack,
      playlist: nextList,
      isPlaying: true,
      currentTime: 0,
    });
  }, [isDJ, repeatMode, currentTrack, playlist, broadcastCurrentState, recordToHistory]);

  // 9. Acciones Públicas / Comandos
  const playTrackNow = useCallback(async (trackOrUrl) => {
    if (!inVoice || !currentVoiceChannelId) {
      console.warn("[MusicSession] Debe unirse a un canal de voz para reproducir música.");
      return;
    }

    let track = trackOrUrl;
    if (typeof trackOrUrl === "string") {
      try {
        const res = await window.electronAPI?.extractMusicTrack(trackOrUrl);
        if (!res?.success || !res?.track) {
          console.error("Error al extraer pista:", res?.error);
          return;
        }
        track = res.track;
      } catch (err) {
        console.error("Error al extraer track:", err);
        return;
      }
    }

    if (!track) return;

    // Si somos el DJ o tenemos permisos para gestionar:
    if (canManageMusic || !djUserId) {
      setPlaylist([]);
      setCurrentTrack(track);
      setIsPlaying(true);
      setHasJoinedMusic(true);
      setDjUserId(profile?.id || null);

      if (audioRef.current) audioRef.current.currentTime = 0;
      recordToHistory(track);

      broadcastCurrentState({
        djUserId: profile?.id || null,
        currentTrack: track,
        playlist: [],
        isPlaying: true,
        currentTime: 0,
      });
    } else {
      // Enviar comando al DJ
      window.electronAPI?.sendMusicCommand(
        currentVoiceChannelId,
        { type: "PLAY_NOW", track },
        currentVoiceRoomCode
      );
    }
  }, [inVoice, currentVoiceChannelId, currentVoiceRoomCode, canManageMusic, djUserId, profile, broadcastCurrentState, recordToHistory]);

  const enqueueTrack = useCallback(async (trackOrUrl) => {
    if (!inVoice || !currentVoiceChannelId) return;

    let track = trackOrUrl;
    if (typeof trackOrUrl === "string") {
      try {
        const res = await window.electronAPI?.extractMusicTrack(trackOrUrl);
        if (!res?.success || !res?.track) return;
        track = res.track;
      } catch (err) {
        console.error("Error al encolar track:", err);
        return;
      }
    }

    if (!track) return;

    // Si no hay nada reproduciéndose, arranca de inmediato
    if (!currentTrack) {
      playTrackNow(track);
      return;
    }

    if (isDJ) {
      setPlaylist((prev) => {
        if (prev.some((t) => t.trackId === track.trackId)) return prev;
        const updated = [...prev, track];
        broadcastCurrentState({ playlist: updated });
        return updated;
      });
    } else {
      window.electronAPI?.sendMusicCommand(
        currentVoiceChannelId,
        { type: "ENQUEUE", track },
        currentVoiceRoomCode
      );
    }
  }, [inVoice, currentVoiceChannelId, currentVoiceRoomCode, currentTrack, isDJ, playTrackNow, broadcastCurrentState]);

  const pauseTrack = useCallback(() => {
    if (!canManageMusic) return;
    if (isDJ) {
      setIsPlaying(false);
      broadcastCurrentState({ isPlaying: false });
    } else {
      window.electronAPI?.sendMusicCommand(
        currentVoiceChannelId,
        { type: "PAUSE" },
        currentVoiceRoomCode
      );
    }
  }, [canManageMusic, isDJ, currentVoiceChannelId, currentVoiceRoomCode, broadcastCurrentState]);

  const resumeTrack = useCallback(() => {
    if (!canManageMusic) return;
    if (isDJ) {
      setIsPlaying(true);
      broadcastCurrentState({ isPlaying: true });
    } else {
      window.electronAPI?.sendMusicCommand(
        currentVoiceChannelId,
        { type: "RESUME" },
        currentVoiceRoomCode
      );
    }
  }, [canManageMusic, isDJ, currentVoiceChannelId, currentVoiceRoomCode, broadcastCurrentState]);

  const skipTrack = useCallback(() => {
    if (!canManageMusic) return;
    if (isDJ) {
      handleTrackEnded();
    } else {
      window.electronAPI?.sendMusicCommand(
        currentVoiceChannelId,
        { type: "SKIP" },
        currentVoiceRoomCode
      );
    }
  }, [canManageMusic, isDJ, handleTrackEnded, currentVoiceChannelId, currentVoiceRoomCode]);

  const stopTrack = useCallback(() => {
    if (!canManageMusic) return;
    if (isDJ) {
      setCurrentTrack(null);
      setPlaylist([]);
      setIsPlaying(false);
      setHasJoinedMusic(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute("src");
        audioRef.current.load();
      }
      broadcastCurrentState({
        currentTrack: null,
        playlist: [],
        isPlaying: false,
        currentTime: 0,
        djUserId: null,
      });
    } else {
      window.electronAPI?.sendMusicCommand(
        currentVoiceChannelId,
        { type: "STOP" },
        currentVoiceRoomCode
      );
    }
  }, [canManageMusic, isDJ, currentVoiceChannelId, currentVoiceRoomCode, broadcastCurrentState]);

  const toggleRepeat = useCallback(() => {
    if (!canManageMusic) return;
    const nextRepeat = (repeatMode + 1) % 3;
    setRepeatMode(nextRepeat);
    if (isDJ) {
      broadcastCurrentState({ repeatMode: nextRepeat });
    } else {
      window.electronAPI?.sendMusicCommand(
        currentVoiceChannelId,
        { type: "REPEAT", repeatMode: nextRepeat },
        currentVoiceRoomCode
      );
    }
  }, [canManageMusic, repeatMode, isDJ, currentVoiceChannelId, currentVoiceRoomCode, broadcastCurrentState]);

  const removeFromQueue = useCallback((trackId) => {
    if (!canManageMusic) return;
    if (isDJ) {
      setPlaylist((prev) => {
        const updated = prev.filter((t) => t.trackId !== trackId);
        broadcastCurrentState({ playlist: updated });
        return updated;
      });
    } else {
      window.electronAPI?.sendMusicCommand(
        currentVoiceChannelId,
        { type: "REMOVE_QUEUE", trackId },
        currentVoiceRoomCode
      );
    }
  }, [canManageMusic, isDJ, currentVoiceChannelId, currentVoiceRoomCode, broadcastCurrentState]);

  const reorderQueue = useCallback((fromIndex, toIndex) => {
    if (!canManageMusic) return;
    if (isDJ) {
      setPlaylist((prev) => {
        const copy = [...prev];
        const [moved] = copy.splice(fromIndex, 1);
        copy.splice(toIndex, 0, moved);
        broadcastCurrentState({ playlist: copy });
        return copy;
      });
    } else {
      window.electronAPI?.sendMusicCommand(
        currentVoiceChannelId,
        { type: "REORDER_QUEUE", fromIndex, toIndex },
        currentVoiceRoomCode
      );
    }
  }, [canManageMusic, isDJ, currentVoiceChannelId, currentVoiceRoomCode, broadcastCurrentState]);

  // 10. Escuchar eventos P2P de música (`music:channel-state` y `music:channel-cmd`)
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubState = window.electronAPI.onMusicChannelState?.((data) => {
      if (!data || data.channelId !== currentVoiceChannelId) return;

      const incoming = data.state;
      if (!incoming) return;

      // Si somos el DJ que emitió, ignoramos nuestro propio eco
      if (isDJ && incoming.djUserId === profile?.id) return;

      channelStateRef.current = incoming;

      setDjUserId(incoming.djUserId || null);
      setDjPeerId(incoming.djPeerId || data.peerId || null);
      setCurrentTrack(incoming.currentTrack || null);
      setPlaylist(Array.isArray(incoming.playlist) ? incoming.playlist : []);
      setIsPlaying(Boolean(incoming.isPlaying));
      setRepeatMode(incoming.repeatMode || 0);

      // Pre-resolver stream si somos oyente
      if (incoming.currentTrack && (incoming.currentTrack.originalUrl || incoming.currentTrack.audioUrl)) {
        const targetUrl = incoming.currentTrack.originalUrl || incoming.currentTrack.audioUrl;
        window.electronAPI?.resolveAndPrepareStream?.(targetUrl).catch(() => {});
      }
    });

    const unsubCmd = window.electronAPI.onMusicChannelCommand?.((data) => {
      if (!data || data.channelId !== currentVoiceChannelId) return;
      if (!isDJ) return; // Solo el DJ ejecuta los comandos de la sesión

      const cmd = data.command;
      if (!cmd || typeof cmd !== "object") return;

      switch (cmd.type) {
        case "PLAY_NOW":
          if (cmd.track) {
            setPlaylist([]);
            setCurrentTrack(cmd.track);
            setIsPlaying(true);
            if (audioRef.current) audioRef.current.currentTime = 0;
            recordToHistory(cmd.track);
            broadcastCurrentState({
              currentTrack: cmd.track,
              playlist: [],
              isPlaying: true,
              currentTime: 0,
            });
          }
          break;
        case "ENQUEUE":
          if (cmd.track) {
            setPlaylist((prev) => {
              if (prev.some((t) => t.trackId === cmd.track.trackId)) return prev;
              const updated = [...prev, cmd.track];
              broadcastCurrentState({ playlist: updated });
              return updated;
            });
          }
          break;
        case "PAUSE":
          setIsPlaying(false);
          broadcastCurrentState({ isPlaying: false });
          break;
        case "RESUME":
          setIsPlaying(true);
          broadcastCurrentState({ isPlaying: true });
          break;
        case "SKIP":
          handleTrackEnded();
          break;
        case "STOP":
          setCurrentTrack(null);
          setPlaylist([]);
          setIsPlaying(false);
          broadcastCurrentState({
            currentTrack: null,
            playlist: [],
            isPlaying: false,
            currentTime: 0,
          });
          break;
        case "REPEAT":
          if (typeof cmd.repeatMode === "number") {
            setRepeatMode(cmd.repeatMode);
            broadcastCurrentState({ repeatMode: cmd.repeatMode });
          }
          break;
        case "REMOVE_QUEUE":
          if (cmd.trackId) {
            setPlaylist((prev) => {
              const updated = prev.filter((t) => t.trackId !== cmd.trackId);
              broadcastCurrentState({ playlist: updated });
              return updated;
            });
          }
          break;
        case "REORDER_QUEUE":
          if (typeof cmd.fromIndex === "number" && typeof cmd.toIndex === "number") {
            setPlaylist((prev) => {
              const copy = [...prev];
              const [moved] = copy.splice(cmd.fromIndex, 1);
              copy.splice(cmd.toIndex, 0, moved);
              broadcastCurrentState({ playlist: copy });
              return copy;
            });
          }
          break;
        default:
          break;
      }
    });

    return () => {
      unsubState?.();
      unsubCmd?.();
    };
  }, [currentVoiceChannelId, isDJ, profile?.id, broadcastCurrentState, handleTrackEnded, recordToHistory]);

  // 11. Migración automática de DJ si el DJ sale de la llamada
  useEffect(() => {
    if (!inVoice || !currentVoiceChannelId || !currentTrack) return;
    if (isDJ) return; // Ya somos el DJ

    // Verificar si el DJ actual sigue conectado al canal de voz
    const djStillHere = voiceMembers?.some(
      (m) => (m.userId && m.userId === djUserId) || (m.peerId && m.peerId === djPeerId)
    );

    if (!djStillHere && voiceMembers?.length > 0) {
      // Ordenar miembros para elegir determinísticamente al nuevo líder
      const selfPeerId = profile?.id;
      const otherUserIds = voiceMembers.map((m) => m.userId || m.id).filter(Boolean).sort();

      if (otherUserIds[0] === selfPeerId) {
        console.log("👑 [MusicSession] Líder anterior desconectado. Asumiendo rol de DJ del canal.");
        setDjUserId(selfPeerId);
        broadcastCurrentState({ djUserId: selfPeerId });
      }
    }
  }, [inVoice, currentVoiceChannelId, currentTrack, isDJ, djUserId, djPeerId, voiceMembers, profile?.id, broadcastCurrentState]);

  // 12. Compatibilidad con CustomEvents de la UI (`onicord:broadcast-music`, etc.)
  useEffect(() => {
    const handleBroadcastMusic = (e) => {
      const action = e.detail;
      if (typeof action !== "string") return;

      if (action === "PAUSE") pauseTrack();
      else if (action === "RESUME") resumeTrack();
      else if (action === "SKIP") skipTrack();
      else if (action === "STOP" || action === "STOP_ALL") stopTrack();
      else if (action.startsWith("REPEAT:")) {
        const rep = parseInt(action.split(":")[1], 10);
        if (!isNaN(rep)) {
          setRepeatMode(rep);
          if (isDJ) broadcastCurrentState({ repeatMode: rep });
        }
      } else if (action.startsWith("PLAY_NOW:") || action.startsWith("PLAY_SHORTCUT:")) {
        const url = action.replace("PLAY_NOW:", "").replace("PLAY_SHORTCUT:", "");
        playTrackNow(url);
      } else if (action.startsWith("QUEUE_ADD:")) {
        const url = action.replace("QUEUE_ADD:", "");
        enqueueTrack(url);
      }
    };

    window.addEventListener("onicord:broadcast-music", handleBroadcastMusic);
    return () => {
      window.removeEventListener("onicord:broadcast-music", handleBroadcastMusic);
    };
  }, [pauseTrack, resumeTrack, skipTrack, stopTrack, isDJ, broadcastCurrentState, playTrackNow, enqueueTrack]);

  const value = useMemo(
    () => ({
      currentTrack,
      setCurrentTrack,
      playlist,
      setPlaylist,
      isPlaying,
      setIsPlaying,
      volume,
      setVolume,
      playHistory,
      setPlayHistory,
      repeatMode,
      setRepeatMode,
      hasJoinedMusic,
      setHasJoinedMusic,
      joinMusic: () => setHasJoinedMusic(true),
      ignoreMusic: () => setHasJoinedMusic("ignored"),
      audioRef,
      canManageMusic,
      isDJ,
      playTrackNow,
      enqueueTrack,
      pauseTrack,
      resumeTrack,
      skipTrack,
      stopTrack,
      toggleRepeat,
      removeFromQueue,
      reorderQueue,
    }),
    [
      currentTrack,
      playlist,
      isPlaying,
      volume,
      setVolume,
      playHistory,
      repeatMode,
      hasJoinedMusic,
      canManageMusic,
      isDJ,
      playTrackNow,
      enqueueTrack,
      pauseTrack,
      resumeTrack,
      skipTrack,
      stopTrack,
      toggleRepeat,
      removeFromQueue,
      reorderQueue,
    ]
  );

  return (
    <MusicContext.Provider value={value}>
      {children}
      {/* Elemento de audio global centralizado y aislado */}
      <audio
        id="onicord-music-audio"
        ref={audioRef}
        onEnded={handleTrackEnded}
        onError={(e) => {
          console.warn("[MusicSession Audio Error]:", e.target?.error?.message || e);
        }}
      />
    </MusicContext.Provider>
  );
}

export function useMusicSession() {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error("useMusicSession must be used within a MusicProvider");
  }
  return context;
}
