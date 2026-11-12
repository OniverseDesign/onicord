import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useVoiceChannelInfo } from "./VoiceContext";
import { extractYouTubeId, clientOgCache } from "../components/chat/subcomponents/MessageEmbedCard";
import { notificationManager } from "../lib/notificationManager";

const WatchPartyContext = createContext(null);

export function WatchPartyProvider({ profile, activeServer, children }) {
  const globalVoice = useVoiceChannelInfo();
  const {
    currentVoiceChannelId,
    currentVoiceRoomCode,
    inVoice,
  } = globalVoice || {};

  // Active session
  const [session, setSession] = useState(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [isFloating, setIsFloating] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Volume
  const [volume, setVolumeState] = useState(() => {
    try {
      const v = localStorage.getItem("onicord_watchparty_volume");
      return v !== null ? parseFloat(v) : 0.8;
    } catch {
      return 0.8;
    }
  });
  const [isMuted, setIsMuted] = useState(false);

  const sessionRef = useRef(session);
  sessionRef.current = session;
  const hostPlaybackTimeRef = useRef(0);

  const currentChannelId = currentVoiceChannelId || activeServer?.id || "global";
  const currentRoomCode = currentVoiceRoomCode || activeServer?.roomCode || null;

  const localPeerId = globalVoice?.localPeerId || profile?.id || null;
  const isHost = Boolean(session && localPeerId && session.hostPeerId === localPeerId);

  const updateHostPlaybackTime = useCallback((time) => {
    if (typeof time === "number" && !isNaN(time)) {
      hostPlaybackTimeRef.current = time;
    }
  }, []);

  const setVolume = useCallback((val) => {
    const v = Math.max(0, Math.min(1, Number(val)));
    setVolumeState(v);
    try {
      localStorage.setItem("onicord_watchparty_volume", String(v));
    } catch {}
  }, []);

  // Broadcast state helper
  const broadcastState = useCallback(
    (overrides = {}) => {
      if (!window.electronAPI?.broadcastWatchPartyState || !sessionRef.current) return;
      const current = sessionRef.current;
      const effectiveTime =
        overrides.currentTime !== undefined
          ? overrides.currentTime
          : (isHost && typeof hostPlaybackTimeRef.current === "number" ? hostPlaybackTimeRef.current : current.currentTime);

      const payload = {
        type: overrides.type !== undefined ? overrides.type : (current.type || "youtube"),
        videoId: overrides.videoId !== undefined ? overrides.videoId : current.videoId,
        title: overrides.title !== undefined ? overrides.title : current.title,
        details: overrides.details !== undefined ? overrides.details : current.details,
        url: overrides.url !== undefined ? overrides.url : current.url,
        isPlaying: overrides.isPlaying !== undefined ? overrides.isPlaying : current.isPlaying,
        currentTime: effectiveTime,
        updatedAt: Date.now(),
        hostPeerId: overrides.hostPeerId !== undefined ? overrides.hostPeerId : current.hostPeerId,
        hostNickname: overrides.hostNickname !== undefined ? overrides.hostNickname : current.hostNickname,
        duration: overrides.duration !== undefined ? overrides.duration : current.duration,
        streamUrl: overrides.streamUrl !== undefined ? overrides.streamUrl : current.streamUrl,
        infoHash: overrides.infoHash !== undefined ? overrides.infoHash : current.infoHash,
        fileIdx: overrides.fileIdx !== undefined ? overrides.fileIdx : current.fileIdx,
        trackers: overrides.trackers !== undefined ? overrides.trackers : current.trackers,
        cover: overrides.cover !== undefined ? overrides.cover : current.cover,
        logo: overrides.logo !== undefined ? overrides.logo : current.logo,
        banner: overrides.banner !== undefined ? overrides.banner : current.banner,
        subtitles: overrides.subtitles !== undefined ? overrides.subtitles : current.subtitles,
        selectedSubtitle: overrides.selectedSubtitle !== undefined ? overrides.selectedSubtitle : current.selectedSubtitle,
        selectedAudioTrack: overrides.selectedAudioTrack !== undefined ? overrides.selectedAudioTrack : current.selectedAudioTrack,
      };

      window.electronAPI.broadcastWatchPartyState(currentChannelId, payload, currentRoomCode);
    },
    [currentChannelId, currentRoomCode, isHost]
  );

  // Share active watch party to chat as an interactive card
  const shareWatchPartyToChat = useCallback(
    (targetTextChannelId = null, sessionOverride = null) => {
      const s = sessionOverride || sessionRef.current;
      if (!s || !window.electronAPI?.sendChatMessage) return;
      const serverRoomCode = currentRoomCode || activeServer?.roomCode;
      if (!serverRoomCode) return;

      const voiceCh = activeServer?.channels?.find((c) => c.id === currentVoiceChannelId);
      const voiceChannelName = voiceCh?.name || "Lounge de Voz";

      const textChannel =
        targetTextChannelId ||
        activeServer?.channels?.find((c) => c.type === "text")?.id ||
        "general";

      const ytThumb = s.videoId
        ? `https://i.ytimg.com/vi/${s.videoId}/hqdefault.jpg`
        : s.cover || null;

      const embedPayload = {
        pluginId: "onicord-watchparty",
        type: "activity_invite",
        data: {
          title: s.title || "Watch Party de YouTube",
          subtitle: `${s.hostNickname || profile?.nickname || "Anfitrión"} te invita a ver`,
          details: "YouTube • En sincronía",
          providerName: "Watch Party",
          icon: "smart_display",
          coverUrl: ytThumb,
          voiceChannelId: currentVoiceChannelId,
          voiceChannelName: voiceChannelName,
          actionType: "watchparty",
          actionPayload: {
            url: s.url,
            title: s.title,
            videoId: s.videoId,
            type: s.type || "youtube",
          },
        },
      };

      window.electronAPI.sendChatMessage(
        serverRoomCode,
        textChannel,
        `[PLUGIN_EMBED]:${JSON.stringify(embedPayload)}`
      );

      notificationManager.showToast(
        "Invitación compartida",
        "Se ha enviado la invitación de Watch Party al chat.",
        "success"
      );
    },
    [currentRoomCode, activeServer, currentVoiceChannelId, profile?.nickname]
  );

  // Start watch party (User becomes host)
  const startWatchParty = useCallback(
    async (rawUrl, title = null, autoShare = true) => {
      if (!inVoice) return;
      const videoId = extractYouTubeId(rawUrl);
      if (!videoId) return;

      // Resolver el título real del video de YouTube
      let resolvedTitle = (typeof title === "string" && title.trim() && title !== "Video de YouTube") ? title.trim() : null;

      if (!resolvedTitle) {
        const cached = clientOgCache.get(rawUrl);
        if (cached?.title && cached.title !== "Video de YouTube") {
          resolvedTitle = cached.title;
        }
      }

      if (!resolvedTitle) {
        try {
          if (window.electronAPI?.fetchOpenGraph) {
            const og = await window.electronAPI.fetchOpenGraph(rawUrl);
            if (og?.title && og.title !== "Video de YouTube") {
              resolvedTitle = og.title;
            }
          }
        } catch (_) {}
      }

      if (!resolvedTitle) {
        try {
          const resp = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
          if (resp.ok) {
            const data = await resp.json();
            if (data?.title) {
              resolvedTitle = data.title;
            }
          }
        } catch (_) {}
      }

      const finalTitle = resolvedTitle || "Video de YouTube";

      const newSession = {
        type: "youtube",
        videoId,
        title: finalTitle,
        url: rawUrl,
        isPlaying: true,
        currentTime: 0,
        updatedAt: Date.now(),
        hostPeerId: localPeerId,
        hostNickname: profile?.nickname || "Anfitrión",
        duration: 0,
      };

      setSession(newSession);
      sessionRef.current = newSession;
      setHasJoined(true);

      if (window.electronAPI?.broadcastWatchPartyState) {
        window.electronAPI.broadcastWatchPartyState(currentChannelId, newSession, currentRoomCode);
      }

      // Enviar automáticamente la tarjeta de invitación interactiva al chat
      if (autoShare) {
        shareWatchPartyToChat(null, newSession);
      }
    },
    [currentChannelId, currentRoomCode, localPeerId, profile?.nickname, inVoice, shareWatchPartyToChat]
  );

  // Start Cinema watch party (P2P Movie/Series stream)
  const startCinemaWatchParty = useCallback(
    (cinemaData) => {
      if (!inVoice || !cinemaData) return;

      const videoId = cinemaData.infoHash || cinemaData.streamUrl || cinemaData.id || "cinema-stream";
      const newSession = {
        type: "cinema",
        videoId,
        title: cinemaData.title || "Cinema",
        details: cinemaData.details || "",
        url: cinemaData.streamUrl || cinemaData.url || "",
        streamUrl: cinemaData.streamUrl || cinemaData.url || "",
        infoHash: cinemaData.infoHash || null,
        fileIdx: cinemaData.fileIdx ?? 0,
        trackers: cinemaData.trackers || [],
        cover: cinemaData.cover || null,
        logo: cinemaData.logo || null,
        banner: cinemaData.banner || null,
        subtitles: cinemaData.subtitles || [],
        isPlaying: true,
        currentTime: 0,
        updatedAt: Date.now(),
        hostPeerId: localPeerId,
        hostNickname: profile?.nickname || profile?.username || "Anfitrión",
        duration: cinemaData.duration || 0,
      };

      setSession(newSession);
      sessionRef.current = newSession;
      setHasJoined(true);

      if (window.electronAPI?.broadcastWatchPartyState) {
        window.electronAPI.broadcastWatchPartyState(currentChannelId, newSession, currentRoomCode);
      }
    },
    [currentChannelId, currentRoomCode, localPeerId, profile?.nickname, profile?.username, inVoice]
  );

  // End watch party
  const stopWatchParty = useCallback(() => {
    if (sessionRef.current && window.electronAPI?.broadcastWatchPartyState) {
      window.electronAPI.broadcastWatchPartyState(
        currentChannelId,
        { videoId: null, isPlaying: false },
        currentRoomCode
      );
    }
    window.electronAPI?.setFullscreen?.(false);
    setSession(null);
    setHasJoined(false);
    setIsFloating(false);
    setIsFullscreen(false);
    window.dispatchEvent(new CustomEvent("onicord:watch-party-ended"));
  }, [currentChannelId, currentRoomCode]);

  // Host heartbeat (broadcast state every 3s while active)
  useEffect(() => {
    if (!isHost || !session?.videoId) return;
    const interval = setInterval(() => {
      if (sessionRef.current?.videoId) {
        broadcastState();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [isHost, session?.videoId, broadcastState]);

  // Listen to incoming state from peers
  useEffect(() => {
    if (!window.electronAPI?.onWatchPartyState) return;

    const unsubscribe = window.electronAPI.onWatchPartyState((data) => {
      if (!data || !data.state) return;
      const remoteState = data.state;
      const senderPeerId = data.peerId || data.senderPeerId || remoteState.hostPeerId;

      // Closed session
      if (!remoteState.videoId) {
        if (
          sessionRef.current?.hostPeerId &&
          senderPeerId &&
          senderPeerId !== sessionRef.current.hostPeerId
        ) {
          return;
        }
        window.electronAPI?.setFullscreen?.(false);
        setSession(null);
        setHasJoined(false);
        setIsFullscreen(false);
        window.dispatchEvent(new CustomEvent("onicord:watch-party-ended"));
        return;
      }

      // If user is not in a voice channel, ignore incoming watch party state
      if (!inVoice) return;

      // If we are the host of this session, ignore IPC/network echo so host local state is authoritative
      if (remoteState.hostPeerId === localPeerId) {
        return;
      }

      setSession((prev) => {
        const merged = {
          ...prev,
          ...remoteState,
        };
        sessionRef.current = merged;
        return merged;
      });
    });

    return () => unsubscribe();
  }, [localPeerId, inVoice]);

  // Automatically leave/close Watch Party if user disconnects from voice
  useEffect(() => {
    if (!inVoice) {
      if (session || hasJoined) {
        if (sessionRef.current?.hostPeerId && sessionRef.current.hostPeerId === localPeerId) {
          stopWatchParty();
        } else {
          window.electronAPI?.setFullscreen?.(false);
          setSession(null);
          setHasJoined(false);
          setIsFloating(false);
          setIsFullscreen(false);
        }
      }
    }
  }, [inVoice, session, hasJoined, localPeerId, stopWatchParty]);

  // Listen to incoming commands (Host processes them and broadcasts to all peers)
  useEffect(() => {
    if (!window.electronAPI?.onWatchPartyCommand) return;

    const unsubscribe = window.electronAPI.onWatchPartyCommand((data) => {
      if (!data || !data.command || !isHost || !inVoice) return;
      const { command } = data;

      if (command.type === "PLAY") {
        const effectiveTime = typeof command.time === "number" ? command.time : hostPlaybackTimeRef.current;
        if (typeof effectiveTime === "number") hostPlaybackTimeRef.current = effectiveTime;
        setSession((prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            isPlaying: true,
            currentTime: typeof effectiveTime === "number" ? effectiveTime : prev.currentTime,
            updatedAt: Date.now(),
          };
          sessionRef.current = next;
          broadcastState(next);
          return next;
        });
        window.dispatchEvent(new CustomEvent("onicord:watch-party-host-command", { detail: command }));
      } else if (command.type === "PAUSE") {
        const effectiveTime = typeof command.time === "number" ? command.time : hostPlaybackTimeRef.current;
        if (typeof effectiveTime === "number") hostPlaybackTimeRef.current = effectiveTime;
        setSession((prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            isPlaying: false,
            currentTime: typeof effectiveTime === "number" ? effectiveTime : prev.currentTime,
            updatedAt: Date.now(),
          };
          sessionRef.current = next;
          broadcastState(next);
          return next;
        });
        window.dispatchEvent(new CustomEvent("onicord:watch-party-host-command", { detail: command }));
      } else if (command.type === "SEEK") {
        if (typeof command.time === "number") {
          hostPlaybackTimeRef.current = command.time;
        }
        setSession((prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            currentTime: command.time,
            updatedAt: Date.now(),
          };
          sessionRef.current = next;
          broadcastState(next);
          return next;
        });
        window.dispatchEvent(new CustomEvent("onicord:watch-party-host-command", { detail: command }));
      } else if (command.type === "SET_AUDIO_TRACK") {
        setSession((prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            selectedAudioTrack: command.trackId,
            updatedAt: Date.now(),
          };
          sessionRef.current = next;
          broadcastState(next);
          return next;
        });
        window.dispatchEvent(new CustomEvent("onicord:watch-party-host-command", { detail: command }));
      } else if (command.type === "SET_SUBTITLE") {
        setSession((prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            selectedSubtitle: command.subtitleId,
            updatedAt: Date.now(),
          };
          sessionRef.current = next;
          broadcastState(next);
          return next;
        });
        window.dispatchEvent(new CustomEvent("onicord:watch-party-host-command", { detail: command }));
      }
    });

    return () => unsubscribe();
  }, [isHost, inVoice, broadcastState]);

  // Listen to custom DOM event "onicord:start-watch-party"
  useEffect(() => {
    const handleStartEvent = (e) => {
      if (!inVoice) return;
      const url = e.detail?.url;
      const title = e.detail?.title;
      if (url) {
        startWatchParty(url, title);
      }
    };
    window.addEventListener("onicord:start-watch-party", handleStartEvent);
    return () => window.removeEventListener("onicord:start-watch-party", handleStartEvent);
  }, [inVoice, startWatchParty]);

  // User controls (Seek, Play/Pause, Audio Track, Subtitles)
  const sendSeek = useCallback(
    (time) => {
      if (!inVoice || typeof time !== "number" || isNaN(time)) return;
      if (isHost) {
        hostPlaybackTimeRef.current = time;
        setSession((prev) => {
          if (!prev) return prev;
          const next = { ...prev, currentTime: time, updatedAt: Date.now() };
          sessionRef.current = next;
          broadcastState(next);
          return next;
        });
      } else if (window.electronAPI?.sendWatchPartyCommand) {
        window.electronAPI.sendWatchPartyCommand(
          currentChannelId,
          { type: "SEEK", time },
          currentRoomCode
        );
      }
    },
    [isHost, inVoice, currentChannelId, currentRoomCode, broadcastState]
  );

  const togglePlayPause = useCallback(
    (exactTime = null) => {
      if (!sessionRef.current || !inVoice) return;
      const current = sessionRef.current;
      const nextPlay = !current.isPlaying;
      const effectiveTime =
        typeof exactTime === "number" && !isNaN(exactTime)
          ? exactTime
          : (typeof hostPlaybackTimeRef.current === "number" && isHost
              ? hostPlaybackTimeRef.current
              : (typeof current.currentTime === "number" ? current.currentTime : 0));

      if (isHost) {
        hostPlaybackTimeRef.current = effectiveTime;
        setSession((prev) => {
          if (!prev) return prev;
          const next = { ...prev, isPlaying: nextPlay, currentTime: effectiveTime, updatedAt: Date.now() };
          sessionRef.current = next;
          broadcastState(next);
          return next;
        });
      } else {
        // Optimistic local update on guest so the UI button icon reflects immediately on 1st click
        setSession((prev) => {
          if (!prev) return prev;
          const next = { ...prev, isPlaying: nextPlay, currentTime: effectiveTime, updatedAt: Date.now() };
          sessionRef.current = next;
          return next;
        });
        if (window.electronAPI?.sendWatchPartyCommand) {
          window.electronAPI.sendWatchPartyCommand(
            currentChannelId,
            { type: nextPlay ? "PLAY" : "PAUSE", time: effectiveTime },
            currentRoomCode
          );
        }
      }
    },
    [isHost, inVoice, currentChannelId, currentRoomCode, broadcastState]
  );

  const sendAudioTrack = useCallback(
    (trackId) => {
      if (!inVoice) return;
      if (isHost) {
        setSession((prev) => {
          if (!prev) return prev;
          const next = { ...prev, selectedAudioTrack: trackId, updatedAt: Date.now() };
          sessionRef.current = next;
          broadcastState(next);
          return next;
        });
      } else if (window.electronAPI?.sendWatchPartyCommand) {
        window.electronAPI.sendWatchPartyCommand(
          currentChannelId,
          { type: "SET_AUDIO_TRACK", trackId },
          currentRoomCode
        );
      }
    },
    [isHost, inVoice, currentChannelId, currentRoomCode, broadcastState]
  );

  const sendSubtitle = useCallback(
    (subtitleId) => {
      if (!inVoice) return;
      if (isHost) {
        setSession((prev) => {
          if (!prev) return prev;
          const next = { ...prev, selectedSubtitle: subtitleId, updatedAt: Date.now() };
          sessionRef.current = next;
          broadcastState(next);
          return next;
        });
      } else if (window.electronAPI?.sendWatchPartyCommand) {
        window.electronAPI.sendWatchPartyCommand(
          currentChannelId,
          { type: "SET_SUBTITLE", subtitleId },
          currentRoomCode
        );
      }
    },
    [isHost, inVoice, currentChannelId, currentRoomCode, broadcastState]
  );

  const joinWatchParty = useCallback(() => {
    if (!inVoice) return;
    setHasJoined(true);
  }, [inVoice]);

  const dismissPrompt = useCallback(() => {}, []);

  const value = useMemo(
    () => ({
      session,
      hasJoined,
      isHost,
      isFloating,
      isFullscreen,
      joinPrompt: null,
      volume,
      isMuted,
      startWatchParty,
      startCinemaWatchParty,
      stopWatchParty,
      joinWatchParty,
      dismissPrompt,
      shareWatchPartyToChat,
      togglePlayPause,
      sendSeek,
      sendAudioTrack,
      sendSubtitle,
      setIsFloating,
      setIsFullscreen,
      setVolume,
      setIsMuted,
      broadcastState,
      updateHostPlaybackTime,
    }),
    [
      session,
      hasJoined,
      isHost,
      isFloating,
      isFullscreen,
      volume,
      isMuted,
      startWatchParty,
      startCinemaWatchParty,
      stopWatchParty,
      joinWatchParty,
      dismissPrompt,
      shareWatchPartyToChat,
      togglePlayPause,
      sendSeek,
      sendAudioTrack,
      sendSubtitle,
      setVolume,
      broadcastState,
      updateHostPlaybackTime,
    ],
  );

  return (
    <WatchPartyContext.Provider value={value}>
      {children}
    </WatchPartyContext.Provider>
  );
}

export function useWatchParty() {
  const context = useContext(WatchPartyContext);
  if (!context) {
    throw new Error("useWatchParty must be used within a WatchPartyProvider");
  }
  return context;
}
