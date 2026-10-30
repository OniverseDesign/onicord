import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";
import { useGlobalVoice } from "./VoiceContext";
import { extractYouTubeId } from "../components/chat/subcomponents/MessageEmbedCard";

const WatchPartyContext = createContext(null);

export function WatchPartyProvider({ profile, activeServer, children }) {
  const globalVoice = useGlobalVoice();
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
  const [joinPrompt, setJoinPrompt] = useState(null);

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
      };

      window.electronAPI.broadcastWatchPartyState(currentChannelId, payload, currentRoomCode);
    },
    [currentChannelId, currentRoomCode, isHost]
  );

  // Start watch party (User becomes host)
  const startWatchParty = useCallback(
    (rawUrl, title = null) => {
      if (!inVoice) return;
      const videoId = extractYouTubeId(rawUrl);
      if (!videoId) return;

      const newSession = {
        type: "youtube",
        videoId,
        title: title || "Video de YouTube",
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
      setJoinPrompt(null);

      if (window.electronAPI?.broadcastWatchPartyState) {
        window.electronAPI.broadcastWatchPartyState(currentChannelId, newSession, currentRoomCode);
      }
    },
    [currentChannelId, currentRoomCode, localPeerId, profile?.nickname, inVoice]
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
      setJoinPrompt(null);

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
    setJoinPrompt(null);
  }, [currentChannelId, currentRoomCode]);

  // Host heartbeat (broadcast state every 3s while active)
  useEffect(() => {
    if (!isHost || !session?.videoId) return;
    const interval = setInterval(() => {
      if (sessionRef.current?.isPlaying) {
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

      // Closed session
      if (!remoteState.videoId) {
        window.electronAPI?.setFullscreen?.(false);
        setSession(null);
        setHasJoined(false);
        setIsFullscreen(false);
        setJoinPrompt(null);
        window.dispatchEvent(new CustomEvent("onicord:watch-party-ended"));
        return;
      }

      // If user is not in a voice channel, ignore incoming watch party state
      if (!inVoice) return;

      // If we are the host of this session, ignore IPC/network echo so host local state is authoritative
      if (remoteState.hostPeerId === localPeerId) {
        return;
      }

      // If we don't have this session, prompt user to join
      setSession((prev) => {
        const isNewVideo = !prev || prev.videoId !== remoteState.videoId;
        if (isNewVideo) {
          // If remote host started it and we are not host (cinema sessions join via interactive chat card)
          if (remoteState.hostPeerId !== localPeerId && remoteState.type !== "cinema") {
            setJoinPrompt({
              type: remoteState.type || "youtube",
              videoId: remoteState.videoId,
              title: remoteState.title,
              details: remoteState.details,
              hostNickname: remoteState.hostNickname,
            });
          }
        }
        return {
          ...prev,
          ...remoteState,
        };
      });
    });

    return () => unsubscribe();
  }, [localPeerId, inVoice]);

  // Automatically leave/close Watch Party if user disconnects from voice
  useEffect(() => {
    if (!inVoice) {
      if (joinPrompt) setJoinPrompt(null);
      if (session || hasJoined) {
        stopWatchParty();
      }
    }
  }, [inVoice, joinPrompt, session, hasJoined, stopWatchParty]);

  // Listen to incoming commands (Host processes them)
  useEffect(() => {
    if (!window.electronAPI?.onWatchPartyCommand) return;

    const unsubscribe = window.electronAPI.onWatchPartyCommand((data) => {
      if (!data || !data.command || !isHost || !inVoice) return;
      const { command } = data;

      if (command.type === "PLAY") {
        setSession((prev) => {
          if (!prev) return prev;
          const next = { ...prev, isPlaying: true, updatedAt: Date.now() };
          sessionRef.current = next;
          broadcastState(next);
          return next;
        });
        window.dispatchEvent(new CustomEvent("onicord:watch-party-host-command", { detail: command }));
      } else if (command.type === "PAUSE") {
        setSession((prev) => {
          if (!prev) return prev;
          const next = {
            ...prev,
            isPlaying: false,
            currentTime: typeof command.time === "number" ? command.time : prev.currentTime,
            updatedAt: Date.now(),
          };
          sessionRef.current = next;
          broadcastState(next);
          return next;
        });
        window.dispatchEvent(new CustomEvent("onicord:watch-party-host-command", { detail: command }));
      } else if (command.type === "SEEK") {
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

  // User controls (Seek, Play/Pause)
  const sendSeek = useCallback(
    (time) => {
      if (!inVoice) return;
      if (isHost) {
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

  const togglePlayPause = useCallback(() => {
    if (!session || !inVoice) return;
    const nextPlay = !session.isPlaying;
    if (isHost) {
      setSession((prev) => {
        if (!prev) return prev;
        const next = { ...prev, isPlaying: nextPlay, updatedAt: Date.now() };
        sessionRef.current = next;
        broadcastState(next);
        return next;
      });
    } else if (window.electronAPI?.sendWatchPartyCommand) {
      window.electronAPI.sendWatchPartyCommand(
        currentChannelId,
        { type: nextPlay ? "PLAY" : "PAUSE", time: session.currentTime },
        currentRoomCode
      );
    }
  }, [session, isHost, inVoice, currentChannelId, currentRoomCode, broadcastState]);

  const joinWatchParty = useCallback(() => {
    if (!inVoice) return;
    setHasJoined(true);
    setJoinPrompt(null);
  }, [inVoice]);

  const dismissPrompt = useCallback(() => {
    setJoinPrompt(null);
  }, []);

  const value = {
    session,
    hasJoined,
    isHost,
    isFloating,
    isFullscreen,
    joinPrompt,
    volume,
    isMuted,
    startWatchParty,
    startCinemaWatchParty,
    stopWatchParty,
    joinWatchParty,
    dismissPrompt,
    togglePlayPause,
    sendSeek,
    setIsFloating,
    setIsFullscreen,
    setVolume,
    setIsMuted,
    broadcastState,
    updateHostPlaybackTime,
  };

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
