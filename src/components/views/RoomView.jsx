import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ChatPanel from "../chat/ChatPanel";
import MembersSidebar from "../navigation/MembersSidebar";
import RichPresenceCard from "../ui/RichPresenceCard";
import AddServerModal from "../modals/AddServerModal";
import ServerSettingsModal from "../modals/ServerSettingsModal";
import AppSettingsModal from "../modals/AppSettingsModal";
import VoiceUserVolumeMenu from "../voice/VoiceUserVolumeMenu";
import { useGlobalVoice } from "../../context/VoiceContext";
import PluginIsland from "../plugins/PluginIsland";
import PluginBannerNotice from "../plugins/PluginBannerNotice";
import MaterialIcon from "../icons/MaterialIcon";
import ThreadSidePanel from "../chat/subcomponents/ThreadSidePanel";
import ContextMenu from "../ui/ContextMenu";
import { notificationManager } from "../../lib/notificationManager";
import { evaluateServerFlame } from "../../lib/flameService";
import { checkPermission, hasChannelAccess } from "../../lib/permissionsHelper";
import UserProfilePopout from "../ui/UserProfilePopout";
import { IconSearch, IconClose, IconTag } from "../icons/StreamIcons";
import { buildPeerLookup } from "../../lib/profileUtils";

import { useRoomResizers } from "../../hooks/useRoomResizers";
import ChannelsSidebar from "../navigation/ChannelsSidebar";
import RoomStreamStage from "../voice/RoomStreamStage";
import AddonStageHost from "../voice/AddonStageHost";
import WatchPartyStage from "../voice/WatchPartyStage";
import { useWatchParty } from "../../context/WatchPartyContext";
import { soundEngine } from "../../lib/soundEngine";
import { normalizeChatMessage } from "../../hooks/useChatMessages";
import { useAnimatedMount } from "../../hooks/useAnimatedMount";
import { cn } from "../../lib/cn";

export default function RoomView({
  profile,
  server,
  servers,
  onLeave,
  onSwitchServer,
  onRefreshServers,
  onServerUpdated,
  onProfileChange,
  musicState,
  onOpenAppSettings,
  getChannelUnreadCount,
  markChannelAsRead,
  onChannelChange,
}) {
  const { t } = useTranslation();
  const [peers, setPeers] = useState([]);
  const peersLookup = useMemo(() => buildPeerLookup(peers), [peers]);
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [textChannelId, setTextChannelId] = useState(() => {
    const ch = server.channels?.find(
      (c) => c.id === server.lastChannelId && c.type === "text",
    );
    return (
      ch?.id ?? server.channels?.find((c) => c.type === "text")?.id ?? "general"
    );
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef(null);

  // Debounce input value to search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(inputValue);
    }, 200);
    return () => clearTimeout(timer);
  }, [inputValue]);

  // Keyboard shortcut Ctrl+F to focus search input
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const [activeDmUser, setActiveDmUser] = useState(null);
  const [activeThreadMessage, setActiveThreadMessage] = useState(null);
  const activeThreadRef = useRef(null);
  if (activeThreadMessage) {
    activeThreadRef.current = activeThreadMessage;
  }
  const { shouldRender: shouldRenderThread, isAnimatingOut: isThreadClosing } = useAnimatedMount(Boolean(activeThreadMessage), 160);
  const displayedThreadMsg = activeThreadMessage || activeThreadRef.current;
  const roomMessagesRef = useRef([]);
  const [threadMessages, setThreadMessages] = useState([]);
  const toggleReactionRef = useRef(null);
  const centralContainerRef = useRef(null);

  useEffect(() => {
    if (!shouldRenderThread) {
      activeThreadRef.current = null;
      setThreadMessages([]);
    }
  }, [shouldRenderThread]);

  useEffect(() => {
    if (centralContainerRef.current) {
      centralContainerRef.current.scrollLeft = 0;
    }
  }, [shouldRenderThread]);

  const handleMessagesUpdate = useCallback((msgs) => {
    roomMessagesRef.current = msgs;
    if (activeThreadRef.current) {
      setThreadMessages(msgs);
    }
  }, []);

  const handleToggleReactionFromAnywhere = useCallback((messageId, emoji, targetChannelId) => {
    if (toggleReactionRef.current) {
      toggleReactionRef.current(messageId, emoji, targetChannelId);
    }
  }, []);

  const handleOpenThread = useCallback((msg) => {
    soundEngine.playNav("open");
    activeThreadRef.current = msg;
    setThreadMessages(roomMessagesRef.current);
    setActiveThreadMessage(msg);
  }, []);

  const watchParty = useWatchParty();
  const hasActiveWatchParty = Boolean(watchParty?.session?.videoId && watchParty?.hasJoined);
  const isWatchPartyFloating = Boolean(watchParty?.isFloating);
  const isWatchPartyFullscreen = Boolean(watchParty?.isFullscreen);

  const [activeAddonStage, setActiveAddonStage] = useState(null);
  const [isStageFloating, setIsStageFloating] = useState(false);
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);

  const activeAddonStageRef = useRef(activeAddonStage);
  activeAddonStageRef.current = activeAddonStage;

  const handleCloseStage = useCallback((fromIpc = false) => {
    soundEngine.playNav("close");
    setActiveAddonStage(null);
    setIsStageFloating(false);
    setIsStageFullscreen(false);
    window.electronAPI?.setFullscreen?.(false);
    setActiveGame((prev) => (prev?.source?.startsWith("addon:") ? { name: null, cover: null, type: "game", startTime: null } : prev));
    if (!fromIpc) {
      window.electronAPI?.closeStageView?.();
    }
  }, []);

  const handleOpenStage = useCallback((stageDef, fromIpc = false) => {
    if (!stageDef) return;
    const userNick = profile?.nickname || profile?.username || "Jugador";
    window._onicordUserNick = userNick;
    const enrichedStageDef = {
      ...stageDef,
      userNick: stageDef.userNick || userNick,
      authorName: stageDef.authorName || userNick,
    };

    const currentStage = activeAddonStageRef.current;
    if (currentStage && currentStage.pluginId === enrichedStageDef.pluginId) {
      // Si se abre un juego con URL diferente al actual, cargar el nuevo juego
      const isDifferentTarget = (enrichedStageDef.url && enrichedStageDef.url !== currentStage.url) ||
        (enrichedStageDef.activity?.name && enrichedStageDef.activity.name !== currentStage.activity?.name);
      if (!isDifferentTarget) {
        // Solo alternar PiP sin recargar si es exactamente la misma vista
        setIsStageFloating((prevFloating) => !prevFloating);
        return;
      }
    }

    soundEngine.playNav("open");
    setActiveAddonStage(enrichedStageDef);
    setIsStageFloating(Boolean(enrichedStageDef.isFloating));

    // Si viene de un evento DOM local (como clic en invitación del chat), sincronizar con Electron
    if (!fromIpc) {
      window.electronAPI?.openStageView?.(enrichedStageDef);
    }
  }, [profile?.nickname, profile?.username]);

  useEffect(() => {
    const unsubOpen = window.electronAPI?.onOpenStageView?.((stageDef) => handleOpenStage(stageDef, true));
    const unsubClose = window.electronAPI?.onCloseStageView?.(() => handleCloseStage(true));

    const onCustomOpen = (e) => handleOpenStage(e.detail, false);
    const onCustomClose = () => handleCloseStage(false);

    window.addEventListener("onicord:open-stage", onCustomOpen);
    window.addEventListener("onicord:close-stage", onCustomClose);

    return () => {
      unsubOpen?.();
      unsubClose?.();
      window.removeEventListener("onicord:open-stage", onCustomOpen);
      window.removeEventListener("onicord:close-stage", onCustomClose);
    };
  }, [handleOpenStage, handleCloseStage]);

  useEffect(() => {
    if (!textChannelId?.startsWith("dm_")) {
      setActiveDmUser(null);
    }
    setActiveThreadMessage(null);
  }, [server.roomCode, textChannelId]);

  const handleSendThreadReply = useCallback(
    async (parentMsgId, replyText, replyData = null) => {
      if (
        !parentMsgId ||
        !replyText.trim() ||
        !window.electronAPI?.sendChatMessage
      )
        return;
      try {
        let payloadObj;
        if (replyText.trim().startsWith("{")) {
          try {
            const parsed = JSON.parse(replyText.trim());
            payloadObj = {
              ...parsed,
              threadParentId: parentMsgId,
            };
          } catch {
            payloadObj = {
              body: replyText.trim(),
              threadParentId: parentMsgId,
            };
          }
        } else {
          payloadObj = {
            body: replyText.trim(),
            threadParentId: parentMsgId,
          };
        }

        if (replyData) {
          payloadObj.replyTo = replyData;
        }

        const threadPayload = JSON.stringify(payloadObj);

        const optimisticReply = normalizeChatMessage({
          id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          roomCode: server.roomCode,
          channelId: textChannelId,
          authorId: profile?.id || "self",
          authorNickname: profile?.nickname || "Yo",
          authorAvatar: profile?.avatar || null,
          text: threadPayload,
          rawText: threadPayload,
          replyTo: replyData,
          timestamp: Date.now(),
          threadParentId: parentMsgId,
          isOptimistic: true,
        });
        roomMessagesRef.current = [...roomMessagesRef.current, optimisticReply];
        setThreadMessages((prev) => [...prev, optimisticReply]);

        await window.electronAPI.sendChatMessage(
          server.roomCode,
          textChannelId,
          threadPayload,
        );
      } catch (err) {
        console.error("Error sending thread reply:", err);
      }
    },
    [server.roomCode, textChannelId, profile],
  );

  useEffect(() => {
    onChannelChange?.(textChannelId);
    setInputValue("");
    setSearchQuery("");
    return () => onChannelChange?.(null);
  }, [textChannelId, onChannelChange]);

  const [volumeMenu, setVolumeMenu] = useState(null);
  const [userPopout, setUserPopout] = useState(null);
  const closingPopoutTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (closingPopoutTimerRef.current) {
        clearTimeout(closingPopoutTimerRef.current);
      }
    };
  }, []);

  const handleCloseUserPopout = useCallback(() => {
    if (closingPopoutTimerRef.current) {
      clearTimeout(closingPopoutTimerRef.current);
    }
    setUserPopout(null);
  }, []);

  const handleUserClick = useCallback((e, member) => {
    const getMemberId = (m) => (m ? (m.id || m.userId || m.peerId) : null);
    const clickedId = getMemberId(member);

    setUserPopout((prev) => {
      const prevId = getMemberId(prev?.member);
      // Si ya está abierto para este usuario y no está en proceso de salida: cerrar con animación
      if (prev && prevId === clickedId && !prev.isClosing) {
        if (closingPopoutTimerRef.current) clearTimeout(closingPopoutTimerRef.current);
        closingPopoutTimerRef.current = setTimeout(() => {
          setUserPopout(null);
        }, 110);
        return { ...prev, isClosing: true };
      }
      // Si estaba cerrándose o es un usuario distinto: abrirlo fresco
      if (closingPopoutTimerRef.current) clearTimeout(closingPopoutTimerRef.current);
      return { x: e.clientX, y: e.clientY, member, isClosing: false };
    });
  }, []);

  const [activeGame, setActiveGame] = useState({
    name: null,
    startTime: null,
    cover: null,
  });

  const [cachedActiveGame, setCachedActiveGame] = useState(activeGame);
  useEffect(() => {
    if (activeGame?.name) {
      setCachedActiveGame(activeGame);
    }
  }, [activeGame]);
  const hasActiveGame = Boolean(activeGame && activeGame.name);
  const displayGame = activeGame?.name ? activeGame : cachedActiveGame;

  const [collapsedCategories, setCollapsedCategories] = useState(() => {
    try {
      const saved = localStorage.getItem(
        `onicord_collapsed_cats_${server.roomCode}`,
      );
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleCategory = (catId) => {
    setCollapsedCategories((prev) => {
      const willBeCollapsed = !prev[catId];
      soundEngine.playNav(willBeCollapsed ? "collapse" : "expand");
      const next = { ...prev, [catId]: willBeCollapsed };
      localStorage.setItem(
        `onicord_collapsed_cats_${server.roomCode}`,
        JSON.stringify(next),
      );
      return next;
    });
  };

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    if (api.getCurrentGame) {
      api.getCurrentGame().then((state) => {
        if (state) setActiveGame(state);
      });
    }

    const unsub = api.onGameActivityChanged((gameData) => {
      setActiveGame(gameData);
    });

    return () => unsub?.();
  }, []);

  const [localStream, setLocalStream] = useState(null);
  const [isStreamFloating, setIsStreamFloating] = useState(false);
  const [isStreamFullscreen, setIsStreamFullscreen] = useState(false);
  const [activeStreamUserId, setActiveStreamUserId] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const activeStreamUserIdRef = useRef(null);

  useEffect(() => {
    if (!isStreamFullscreen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsStreamFullscreen(false);
        window.electronAPI?.setFullscreen?.(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isStreamFullscreen]);

  useEffect(() => {
    const handleVideoUpdate = (e) => {
      const { peerId, stream } = e.detail || {};
      if (peerId && stream && peerId === activeStreamUserIdRef.current) {
        setRemoteStream(stream);
      }
    };
    window.addEventListener("peer-video-update", handleVideoUpdate);
    return () => window.removeEventListener("peer-video-update", handleVideoUpdate);
  }, []);

  const [speakingPeers, setSpeakingPeers] = useState(new Set());

  // Panel resizers hook
  const {
    leftWidth,
    rightWidth,
    threadWidth,
    startResizeLeft,
    startResizeRight,
    startResizeThread,
  } = useRoomResizers({
    activeThreadMessage,
    setActiveThreadMessage,
  });

  const isCategoryNode = (c) =>
    c.type === "category" || String(c.id).startsWith("cat-");

  const textChannels =
    server.channels?.filter(
      (c) =>
        (c.type === "text" || !c.type) &&
        !isCategoryNode(c) &&
        hasChannelAccess(server, c, profile?.id),
    ) ?? [];

  const activeTextChannel =
    textChannels.find((c) => c.id === textChannelId) ?? textChannels[0];
  const globalVoice = useGlobalVoice();
  const isCurrentServerVoice =
    (globalVoice.currentVoiceServerId && globalVoice.currentVoiceServerId === server.id) ||
    (globalVoice.currentVoiceRoomCode && globalVoice.currentVoiceRoomCode === server.roomCode);
  const selectedVoiceChannelId = isCurrentServerVoice ? globalVoice.currentVoiceChannelId : null;

  const activeVoiceChannel = useMemo(() => {
    if (!globalVoice.currentVoiceChannelId) return null;
    const channelsToSearch = globalVoice.currentVoiceServer?.channels || server.channels || [];
    return channelsToSearch.find((c) => c.id === globalVoice.currentVoiceChannelId) || null;
  }, [globalVoice.currentVoiceChannelId, globalVoice.currentVoiceServer?.channels, server.channels]);

  const resolvedVoiceChannelName = useMemo(() => {
    if (!activeVoiceChannel) {
      return globalVoice.currentVoiceChannelId || "";
    }
    if (activeVoiceChannel.name === "Voice Lounge" || activeVoiceChannel.name === "voice-lounge") {
      return t("serverSettings.channels.defaultVoiceChannelName", "Voice Lounge");
    }
    return activeVoiceChannel.name || "";
  }, [activeVoiceChannel, globalVoice.currentVoiceChannelId, t]);

  const voice = globalVoice;
  const { localPeerId } = voice;

  useEffect(() => {
    if (voice.error) {
      notificationManager.showToast(
        t("voice.errorTitle", "Error de Voz"),
        voice.error,
        "danger"
      );
    }
  }, [voice.error, t]);

  useEffect(() => {
    const handleSpeakingChange = (e) => {
      const { peerId, isSpeaking } = e.detail;
      setSpeakingPeers((prev) => {
        const has = prev.has(peerId);
        if (Boolean(isSpeaking) === has) return prev;
        const next = new Set(prev);
        if (isSpeaking) {
          next.add(peerId);
        } else {
          next.delete(peerId);
        }
        return next;
      });
    };

    window.addEventListener("peer-speaking-change", handleSpeakingChange);
    return () => {
      window.removeEventListener("peer-speaking-change", handleSpeakingChange);
    };
  }, []);

  const getHighestRoleForUser = useCallback(
    (uid) => {
      const roles = server.roles || [];
      const userRoles = server.userRoles || {};
      const uRoles = Array.isArray(userRoles[uid])
        ? userRoles[uid]
        : userRoles[uid]
          ? [userRoles[uid]]
          : [];
      if (uRoles.length === 0) return null;
      const activeRoles = uRoles
        .map((id) => roles.find((r) => String(r.id) === String(id)))
        .filter(Boolean);
      activeRoles.sort(
        (a, b) =>
          roles.findIndex((r) => String(r.id) === String(a.id)) -
          roles.findIndex((r) => String(r.id) === String(b.id)),
      );
      return activeRoles[0] || null;
    },
    [server.roles, server.userRoles],
  );

  const sanitizedMembersList = useMemo(() => {
    const seen = new Set();
    const localUser = {
      id: profile?.id || "self",
      peerId: null,
      nickname: profile?.nickname ?? t("common.you"),
      avatar: profile?.avatar,
      isSelf: true,
      online: true,
      customLink: profile?.customLink,
      profileColor: profile?.profileColor,
      customStatus: profile?.customStatus,
      flame: profile?.flame,
      activity:
        profile?.showRichPresence !== false && activeGame?.name
          ? activeGame
          : null,
      role: getHighestRoleForUser(profile?.id),
    };
    seen.add(localUser.id);

    const list = [localUser];

    (peers || []).forEach((p) => {
      const actualId = p.id || p.peerId || p.userId;
      if (!actualId) return;
      if (
        seen.has(actualId) ||
        (p.userId && seen.has(p.userId)) ||
        (p.peerId && seen.has(p.peerId))
      )
        return;

      seen.add(actualId);
      if (p.userId) seen.add(p.userId);
      if (p.peerId) seen.add(p.peerId);

      list.push({
        ...p,
        id: actualId,
        online: p.online !== false,
        role: getHighestRoleForUser(actualId),
        activity: p.showRichPresence !== false ? p.activity || null : null,
      });
    });

    if (server?.savedMembers) {
      const savedList = Array.isArray(server.savedMembers)
        ? server.savedMembers
        : Object.values(server.savedMembers);

      savedList.forEach((m) => {
        const actualId = m?.id || m?.userId;
        if (!actualId || seen.has(actualId)) return;
        seen.add(actualId);
        list.push({
          ...m,
          id: actualId,
          online: false,
          role: getHighestRoleForUser(actualId),
          activity: null,
        });
      });
    }

    return list.sort((a, b) => {
      if (a.role && !b.role) return -1;
      if (!a.role && b.role) return 1;
      if (a.role && b.role) {
        const roles = server.roles || [];
        const idxA = roles.findIndex((r) => String(r.id) === String(a.role.id));
        const idxB = roles.findIndex((r) => String(r.id) === String(b.role.id));
        return idxA - idxB;
      }
      return 0;
    });
  }, [
    profile,
    peers,
    activeGame,
    server.roles,
    server.userRoles,
    server.savedMembers,
    getHighestRoleForUser,
    t,
  ]);

  const resolvedDmUser = useMemo(() => {
    if (!textChannelId || !textChannelId.startsWith("dm_")) return null;

    const raw = textChannelId.slice(3);
    const myId = profile?.id;
    let otherUserId = null;

    if (myId && raw.includes(myId)) {
      if (raw.startsWith(myId + "_")) {
        otherUserId = raw.slice(myId.length + 1);
      } else if (raw.endsWith("_" + myId)) {
        otherUserId = raw.slice(0, raw.length - myId.length - 1);
      }
    }

    if (!otherUserId) {
      const parts = raw.split("_");
      otherUserId = parts.find((id) => id !== myId) || parts[0];
    }

    if (
      activeDmUser &&
      (activeDmUser.id === otherUserId ||
        activeDmUser.userId === otherUserId ||
        activeDmUser.peerId === otherUserId)
    ) {
      return activeDmUser;
    }

    if (!otherUserId) return null;

    if (Array.isArray(peers)) {
      const foundInPeers = peers.find(
        (p) => p.id === otherUserId || p.userId === otherUserId || p.peerId === otherUserId
      );
      if (foundInPeers) return foundInPeers;
    }

    if (Array.isArray(sanitizedMembersList)) {
      const foundInMembers = sanitizedMembersList.find(
        (m) => m.id === otherUserId || m.userId === otherUserId || m.peerId === otherUserId
      );
      if (foundInMembers) return foundInMembers;
    }

    if (server?.savedMembers && server.savedMembers[otherUserId]) {
      return server.savedMembers[otherUserId];
    }

    return { id: otherUserId, nickname: "Usuario" };
  }, [textChannelId, activeDmUser, profile?.id, peers, server?.savedMembers, sanitizedMembersList]);

  const voiceMembersDisplay = useMemo(() => {
    const serverChannelIds = new Set((server.channels || []).map((c) => c.id));

    return (voice.members || [])
      .filter((m) => {
        if (m.isSelf) {
          return isCurrentServerVoice && serverChannelIds.has(m.channelId);
        }
        return serverChannelIds.has(m.channelId);
      })
      .map((m) => {
        if (m.isSelf) {
          const amISpeaking =
            speakingPeers.has(localPeerId) ||
            speakingPeers.has(profile?.id) ||
            Boolean(m.isSpeaking);
          return {
            ...m,
            id: profile?.id,
            nickname: profile?.nickname ?? m.nickname,
            avatar: profile?.avatar ?? m.avatar,
            isSpeaking: amISpeaking,
            isStreaming: Boolean(voice.isStreaming),
            customLink: profile?.customLink,
            profileColor: profile?.profileColor,
            customStatus: profile?.customStatus,
            flame: profile?.flame,
            activity:
              profile?.showRichPresence !== false && activeGame?.name
                ? activeGame
                : null,
            role: getHighestRoleForUser(profile?.id),
          };
        }

        const remoteUserId = m.id || m.userId;
        const peerProfile =
          (m.peerId && peersLookup.get(m.peerId)) ||
          (remoteUserId && peersLookup.get(remoteUserId)) ||
          (m.id && peersLookup.get(m.id)) ||
          null;
        const finalUserId = peerProfile?.id || remoteUserId || m.peerId;
        const isPeerSpeaking =
          Boolean(m.isSpeaking) ||
          speakingPeers.has(m.peerId) ||
          speakingPeers.has(finalUserId);

        return {
          ...m,
          id: finalUserId,
          peerId: m.peerId,
          nickname: m.nickname || peerProfile?.nickname || "User",
          avatar: m.avatar ?? peerProfile?.avatar ?? null,
          isSpeaking: isPeerSpeaking,
          isStreaming: Boolean(m.isStreaming),
          activity:
            peerProfile?.showRichPresence !== false
              ? peerProfile?.activity || null
              : null,
          customLink: peerProfile?.customLink || "",
          profileColor: peerProfile?.profileColor || "",
          customStatus: peerProfile?.customStatus || "",
          flame: peerProfile?.flame || m.flame || null,
          role: getHighestRoleForUser(finalUserId),
        };
      });
  }, [
    voice.members,
    peersLookup,
    profile,
    localPeerId,
    speakingPeers,
    voice.isStreaming,
    activeGame,
    server.channels,
    isCurrentServerVoice,
    getHighestRoleForUser,
  ]);

  useEffect(() => {
    if (activeStreamUserId) {
      const activeMember = voiceMembersDisplay.find(
        (m) => m.peerId === activeStreamUserId || m.id === activeStreamUserId,
      );
      if (!activeMember || !activeMember.isStreaming) {
        setActiveStreamUserId(null);
        activeStreamUserIdRef.current = null;
        setRemoteStream(null);
        setIsStreamFloating(false);
      }
    }
  }, [activeStreamUserId, voiceMembersDisplay]);

  useEffect(() => {
    if (window.electronAPI?.updateOverlayMembers) {
      const serialized = (voiceMembersDisplay || []).map((m) => ({
        peerId: m.peerId || m.id,
        nickname: m.nickname,
        avatar: m.avatar,
        isSpeaking: Boolean(m.isSpeaking),
        muted: Boolean(m.muted || m.isMuted),
        deafened: Boolean(m.deafened || m.isDeafened),
      }));
      window.electronAPI.updateOverlayMembers(serialized);
    }
  }, [voiceMembersDisplay]);

  const serverFlame = useMemo(() => {
    return evaluateServerFlame(server || {}, sanitizedMembersList);
  }, [server, sanitizedMembersList]);

  const voiceStartTimesRef = useRef({});

  useEffect(() => {
    const currentStartTimes = voiceStartTimesRef.current;
    const activeChannelsMap = new Map();

    (voiceMembersDisplay || []).forEach((m) => {
      if (m.channelId) {
        const existing = activeChannelsMap.get(m.channelId) || [];
        existing.push(m);
        activeChannelsMap.set(m.channelId, existing);
      }
    });

    activeChannelsMap.forEach((membersInCh, channelId) => {
      const timestamps = membersInCh
        .map((m) => m.joinedAt)
        .filter((t) => typeof t === "number" && t > 0);

      if (timestamps.length > 0) {
        currentStartTimes[channelId] = Math.min(...timestamps);
      } else if (!currentStartTimes[channelId]) {
        currentStartTimes[channelId] = Date.now();
      }
    });

    Object.keys(currentStartTimes).forEach((channelId) => {
      if (!activeChannelsMap.has(channelId)) {
        delete currentStartTimes[channelId];
      }
    });
  }, [voiceMembersDisplay]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    setPeers([]);

    api.getRoomState().then((state) => {
      if (state?.peers?.length) {
        const initialNormalized = state.peers.map((p) => ({
          ...p,
          id: p.id || p.peerId || p.userId,
        }));
        setPeers(initialNormalized);
      }
    });

    const unsubPeerUpdated = window.electronAPI.on?.(
      "peer:updated",
      (updatedPeer) => {
        setPeers((prev) => {
          const updated = prev.map((p) => {
            const isMatch =
              p.id === updatedPeer.id ||
              (p.peerId && p.peerId === updatedPeer.peerId) ||
              (p.userId && p.userId === updatedPeer.userId) ||
              p.id === updatedPeer.peerId ||
              p.peerId === updatedPeer.id;

            if (isMatch) return { ...p, ...updatedPeer };
            return p;
          });

          const uniqueMap = new Map();
          updated.forEach((p) => {
            const uid = p.id || p.peerId || p.userId;
            if (!uid) return;
            if (uniqueMap.has(uid)) {
              uniqueMap.set(uid, { ...uniqueMap.get(uid), ...p });
            } else {
              uniqueMap.set(uid, p);
            }
          });
          return Array.from(uniqueMap.values());
        });
      },
    );

    const unsubJoin = api.onPeerJoined((peer) => {
      setPeers((prev) => {
        const uid = peer.id || peer.peerId || peer.userId;
        const index = prev.findIndex(
          (p) =>
            p.id === uid ||
            (p.peerId && p.peerId === uid) ||
            (p.userId && p.userId === uid),
        );
        if (index >= 0) {
          const next = [...prev];
          next[index] = { ...next[index], ...peer, id: uid, online: true };
          return next;
        }
        return [...prev, { ...peer, id: uid, online: true }];
      });
    });

    const unsubLeave = api.onPeerLeft((peerId) => {
      setPeers((prev) =>
        prev.map((p) =>
          p.id === peerId || p.peerId === peerId || p.userId === peerId
            ? { ...p, online: false }
            : p,
        ),
      );
    });

    const unsubActivity = window.electronAPI?.on?.(
      "peer:activity",
      ({ peerId, userId, activity }) => {
        setPeers((prev) =>
          prev.map((p) => {
            const isMatch =
              (userId && (p.id === userId || p.userId === userId)) ||
              (peerId && (p.id === peerId || p.peerId === peerId));
            if (isMatch) {
              return { ...p, activity };
            }
            return p;
          })
        );
      }
    );

    return () => {
      unsubPeerUpdated?.();
      unsubJoin?.();
      unsubLeave?.();
      unsubActivity?.();
    };
  }, [server.roomCode]);

  const selectTextChannel = async (channelId) => {
    if (channelId !== textChannelId) {
      soundEngine.playNav("select");
    }
    if (!channelId?.startsWith("dm_")) {
      setActiveDmUser(null);
    } else {
      const raw = channelId.slice(3);
      const myId = profile?.id;
      let otherUserId = null;
      if (myId && raw.includes(myId)) {
        if (raw.startsWith(myId + "_")) otherUserId = raw.slice(myId.length + 1);
        else if (raw.endsWith("_" + myId)) otherUserId = raw.slice(0, raw.length - myId.length - 1);
      }
      if (!otherUserId) {
        otherUserId = raw.split("_").find((id) => id !== myId) || raw.split("_")[0];
      }
      const found =
        (Array.isArray(sanitizedMembersList)
          ? sanitizedMembersList.find(
              (m) =>
                m.id === otherUserId ||
                m.userId === otherUserId ||
                m.peerId === otherUserId
            )
          : null) ||
        (Array.isArray(peers)
          ? peers.find(
              (p) =>
                p.id === otherUserId ||
                p.userId === otherUserId ||
                p.peerId === otherUserId
            )
          : null) ||
        server?.savedMembers?.[otherUserId] ||
        null;
      if (found) {
        setActiveDmUser(found);
      }
    }
    setTextChannelId(channelId);
    markChannelAsRead?.(server.roomCode, channelId);
    if (localStream) {
      setIsStreamFloating(true);
    }
    if (activeAddonStage) {
      setIsStageFloating(true);
    }
    await window.electronAPI?.setServerChannel?.(server.id, channelId);
  };

  useEffect(() => {
    const handleSelectChannel = (e) => {
      const targetChannelId = e.detail?.channelId || e.detail;
      const targetRoom = e.detail?.roomCode;
      if (
        targetRoom &&
        server?.roomCode &&
        String(targetRoom).toUpperCase() !== String(server.roomCode).toUpperCase()
      ) {
        return;
      }
      if (targetChannelId && typeof targetChannelId === "string") {
        selectTextChannel(targetChannelId);
      }
    };

    window.addEventListener("onicord:select-channel", handleSelectChannel);
    return () => window.removeEventListener("onicord:select-channel", handleSelectChannel);
  }, [selectTextChannel, server?.roomCode]);

  const prevVoiceChannelRef = useRef(selectedVoiceChannelId);
  useEffect(() => {
    if (prevVoiceChannelRef.current !== selectedVoiceChannelId) {
      const wasInVoice = Boolean(prevVoiceChannelRef.current);
      prevVoiceChannelRef.current = selectedVoiceChannelId;
      if (localStream || remoteStream) {
        handleStopScreenShare();
        setRemoteStream(null);
        setActiveStreamUserId(null);
        activeStreamUserIdRef.current = null;
      }
      // Si el usuario sale del chat de voz, cerrar automáticamente cualquier escenario de addon abierto
      if (wasInVoice && !selectedVoiceChannelId && activeAddonStageRef.current) {
        handleCloseStage(false);
      }
    }
  }, [selectedVoiceChannelId, handleCloseStage]);

  const selectVoiceChannel = async (channelId) => {
    if (channelId && channelId === selectedVoiceChannelId) {
      return;
    }
    if (channelId) {
      const canConnect = checkPermission(server, profile?.id, "connect_voice");
      if (!canConnect) {
        console.warn("[RoomView] Permiso connect_voice denegado.");
        return;
      }
    }
    if (localStream || remoteStream) {
      await handleStopScreenShare();
      setRemoteStream(null);
      setActiveStreamUserId(null);
      activeStreamUserIdRef.current = null;
    }
    if (channelId) {
      globalVoice.joinVoiceChannel(server, channelId);
    } else {
      if (activeAddonStageRef.current) {
        handleCloseStage(false);
      }
      globalVoice.leaveVoiceChannel();
    }
  };

  // Expulsión automática de voz si se revoca el permiso connect_voice en tiempo real
  useEffect(() => {
    if (selectedVoiceChannelId && profile?.id && server) {
      const canConnect = checkPermission(server, profile.id, "connect_voice");
      if (!canConnect) {
        selectVoiceChannel(null);
      }
    }
  }, [server?.roles, server?.userRoles, selectedVoiceChannelId, profile?.id]);

  // Detención automática de transmisión de pantalla si se revoca el permiso share_video en tiempo real
  useEffect(() => {
    if (localStream && profile?.id && server) {
      const canShare = checkPermission(server, profile.id, "share_video");
      if (!canShare) {
        handleStopScreenShare();
      }
    }
  }, [server?.roles, server?.userRoles, localStream, profile?.id]);

  const handleStopScreenShare = async () => {
    voice.setIsStreaming?.(false);
    voice.setLocalVideoStream?.(null);
    await window.electronAPI?.setStreaming?.(false);

    if (localStream) {
      try {
        localStream.getTracks().forEach((track) => {
          track.enabled = false;
          track.stop();
        });
      } catch (err) {
        console.error("Error stopping local stream tracks:", err);
      }
      setLocalStream(null);
    }

    setIsStreamFloating(false);
    setIsStreamFullscreen(false);
    window.electronAPI?.setFullscreen?.(false);
  };

  const handleDisconnectVoice = async () => {
    if (activeAddonStageRef.current) {
      handleCloseStage(false);
    }
    await handleStopScreenShare();
    globalVoice.leaveVoiceChannel();
  };

  const handleSwitchServer = async (targetId) => {
    onSwitchServer(targetId);
  };

  const handleMessageUser = (target) => {
    soundEngine.playNav("select");
    const targetId =
      typeof target === "object" && target !== null
        ? target.id || target.userId || target.peerId
        : target;

    if (!targetId || !profile?.id) return;

    const sorted = [String(profile.id), String(targetId)].sort();
    const dmChannelId = `dm_${sorted[0]}_${sorted[1]}`;

    const targetUser =
      typeof target === "object" && target !== null && target.nickname
        ? target
        : (sanitizedMembersList?.find(
            (m) =>
              m.id === targetId || m.userId === targetId || m.peerId === targetId
          ) ||
          (Array.isArray(peers)
            ? peers.find(
                (p) =>
                  p.id === targetId ||
                  p.userId === targetId ||
                  p.peerId === targetId
              )
            : null) ||
          server?.savedMembers?.[targetId] ||
          null);

    if (targetUser) {
      setActiveDmUser(targetUser);
    }

    setTextChannelId(dmChannelId);
  };

  const handleChannelContextMenu = (e, channel) => {
    e.preventDefault();
    setContextMenu({
      type: "channel",
      x: e.clientX,
      y: e.clientY,
      title: channel.name,
      channel,
    });
  };

  const handleVoiceUserContextMenu = (e, targetUser) => {
    e.preventDefault();
    setContextMenu({
      type: "voice_user",
      x: e.clientX,
      y: e.clientY,
      title: targetUser.nickname,
      targetUser,
    });
  };

  return (
    <div className="flex-1 min-w-0 h-full flex relative flex-row gap-onicord-gap pl-[var(--gap)] box-border">
      <ChannelsSidebar
        server={server}
        profile={profile}
        leftWidth={leftWidth}
        textChannelId={textChannelId}
        selectTextChannel={selectTextChannel}
        selectedVoiceChannelId={selectedVoiceChannelId}
        selectVoiceChannel={selectVoiceChannel}
        collapsedCategories={collapsedCategories}
        toggleCategory={toggleCategory}
        voiceMembersDisplay={voiceMembersDisplay}
        voiceStartTimesRef={voiceStartTimesRef}
        serverFlame={serverFlame}
        getChannelUnreadCount={getChannelUnreadCount}
        handleChannelContextMenu={handleChannelContextMenu}
        handleVoiceUserContextMenu={handleVoiceUserContextMenu}
        setShowSettings={setShowSettings}
        activeStreamUserIdRef={activeStreamUserIdRef}
        setActiveStreamUserId={setActiveStreamUserId}
        setRemoteStream={setRemoteStream}
        setIsStreamFloating={setIsStreamFloating}
        voice={voice}
        musicState={musicState}
        activeGame={activeGame}
        globalVoice={globalVoice}
        resolvedVoiceChannelName={resolvedVoiceChannelName}
        handleDisconnectVoice={handleDisconnectVoice}
        onOpenAppSettings={onOpenAppSettings}
        localStream={localStream}
        setLocalStream={setLocalStream}
        onProfileChange={onProfileChange}
        handleStopScreenShare={handleStopScreenShare}
      />

      {/* Resizer Handle Izquierda */}
      <div
        onPointerDown={startResizeLeft}
        className="onicord-resizer-handle"
      />

      {/* Columna Central: Header + Main Stage + Thread Panel */}
      <div
        className="flex-1 min-w-0 h-full flex flex-col relative"
        style={{ gap: "calc(var(--gap) + 3px)" }}
      >
        <div
          className="flex min-w-0"
          style={{ gap: "calc(var(--gap) + 3px)" }}
        >
          <header className="h-12 shrink-0 flex items-center justify-between gap-2 pl-3 pr-4 bg-onicord-base rounded-full border border-onicord-island select-none">
            <div className="flex items-center gap-2 min-w-0">
              {resolvedDmUser ? (
                <>
                  <div className="h-6 w-6 rounded-full overflow-hidden bg-onicord-accent flex items-center justify-center shrink-0">
                    {resolvedDmUser.avatar ? (
                      <img
                        src={resolvedDmUser.avatar}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-[10px] font-bold text-white uppercase select-none">
                        {(resolvedDmUser.nickname || "?").charAt(0)}
                      </span>
                    )}
                  </div>
                  <h2 className="font-semibold text-onicord-text truncate max-w-[150px]">
                    {resolvedDmUser.nickname}
                  </h2>
                </>
              ) : (
                <>
                  <IconTag size="lg" className="text-onicord-accent" />
                  <h2 className="font-semibold text-onicord-text">
                    {activeTextChannel?.name === "general"
                      ? t("serverSettings.channels.defaultTextChannelName", "general")
                      : activeTextChannel?.name || "general"}
                  </h2>
                </>
              )}
            </div>
          </header>

          {activeAddonStage && isStageFloating && (
            <button
              type="button"
              onClick={() => {
                soundEngine.playNav("open");
                setIsStageFloating(false);
              }}
              className="h-12 px-3.5 rounded-full bg-onicord-accent/15 hover:bg-onicord-accent/25 text-onicord-accent border border-onicord-accent/30 flex items-center gap-2 text-xs font-semibold shadow-sm transition-all cursor-pointer shrink-0 animate-fade-in"
              title="Volver a la vista del juego"
            >
              <MaterialIcon name={activeAddonStage.icon || "sports_esports"} size={18} />
              <span className="truncate max-w-[130px]">{activeAddonStage.title || "Juego"}</span>
              <MaterialIcon name="open_in_full" size={14} />
            </button>
          )}

          <div className="h-12 flex-1 min-w-0 flex items-center gap-4 px-4 bg-onicord-base rounded-full border border-onicord-island relative">
            <IconSearch size="lg" />
            <input
              ref={searchInputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              placeholder={
                isSearchFocused
                  ? t("chat.searchPlaceholderActive", "Prueba: from:usuario, has:file, has:image, in:canal...")
                  : t("chat.searchPlaceholder", "Buscar mensajes o archivos...")
              }
              className="flex-1 min-w-0 bg-transparent text-sm text-onicord-text placeholder:text-onicord-muted outline-none border-none"
            />
            {inputValue && (
              <button
                type="button"
                onClick={() => {
                  setInputValue("");
                  setSearchQuery("");
                }}
                className="flex items-center justify-center text-onicord-muted hover:text-onicord-text transition-colors cursor-pointer"
              >
                <IconClose size="lg" />
              </button>
            )}

            {isSearchFocused && !inputValue && (
              <div
                onMouseDown={(e) => e.preventDefault()}
                className="absolute top-full left-0 right-0 mt-2 p-3 bg-onicord-base/95 backdrop-blur-md rounded-2xl border border-onicord-island shadow-2xl z-50 onicord-animate-popup-in origin-top"
              >
                <div className="text-[11px] font-semibold text-onicord-muted uppercase tracking-wider px-2 mb-2">
                  {t("chat.searchFilterOptions", "Filtros de búsqueda disponibles")}
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setInputValue("from:");
                      searchInputRef.current?.focus();
                    }}
                    className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-colors text-left group cursor-pointer"
                  >
                    <code className="text-onicord-accent font-semibold bg-onicord-accent/10 px-1.5 py-0.5 rounded text-[11px]">from:</code>
                    <span className="text-onicord-text text-[11px] group-hover:text-white truncate">{t("chat.searchFilterFrom", "Filtrar por autor o apodo")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInputValue("has:image ");
                      searchInputRef.current?.focus();
                    }}
                    className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-colors text-left group cursor-pointer"
                  >
                    <code className="text-onicord-accent font-semibold bg-onicord-accent/10 px-1.5 py-0.5 rounded text-[11px]">has:image</code>
                    <span className="text-onicord-text text-[11px] group-hover:text-white truncate">{t("chat.searchFilterImage", "Solo fotos e imágenes")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInputValue("has:file ");
                      searchInputRef.current?.focus();
                    }}
                    className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-colors text-left group cursor-pointer"
                  >
                    <code className="text-onicord-accent font-semibold bg-onicord-accent/10 px-1.5 py-0.5 rounded text-[11px]">has:file</code>
                    <span className="text-onicord-text text-[11px] group-hover:text-white truncate">{t("chat.searchFilterFile", "Archivos y documentos")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInputValue("has:link ");
                      searchInputRef.current?.focus();
                    }}
                    className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-colors text-left group cursor-pointer"
                  >
                    <code className="text-onicord-accent font-semibold bg-onicord-accent/10 px-1.5 py-0.5 rounded text-[11px]">has:link</code>
                    <span className="text-onicord-text text-[11px] group-hover:text-white truncate">{t("chat.searchFilterLink", "Mensajes con enlaces web")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInputValue("in:");
                      searchInputRef.current?.focus();
                    }}
                    className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-colors text-left group cursor-pointer"
                  >
                    <code className="text-onicord-accent font-semibold bg-onicord-accent/10 px-1.5 py-0.5 rounded text-[11px]">in:</code>
                    <span className="text-onicord-text text-[11px] group-hover:text-white truncate">{t("chat.searchFilterIn", "Buscar en canal específico")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setInputValue('""');
                      searchInputRef.current?.focus();
                    }}
                    className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-colors text-left group cursor-pointer"
                  >
                    <code className="text-onicord-accent font-semibold bg-onicord-accent/10 px-1.5 py-0.5 rounded text-[11px]">"frase"</code>
                    <span className="text-onicord-text text-[11px] group-hover:text-white truncate">{t("chat.searchFilterPhrase", "Coincidencia exacta")}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("onicord:open-pinned-modal"))}
            className="h-12 w-12 rounded-full bg-onicord-base border border-onicord-island hover:bg-white/10 text-onicord-muted hover:text-onicord-accent transition-colors cursor-pointer shrink-0 flex items-center justify-center"
            title={t("chat.pinnedMessages", "Mensajes Fijados")}
          >
            <MaterialIcon name="push_pin" size="lg" />
          </button>
        </div>

        {/* Contenedor Central: ChatPanel + StreamStage + ThreadSidePanel */}
        <div ref={centralContainerRef} className="flex-1 min-h-0 flex gap-1 overflow-x-clip overflow-y-hidden">
          <div className="flex-1 min-w-0 h-full flex flex-col relative overflow-hidden bg-onicord-base rounded-onicord-outer-p4 border border-onicord-island">
            <div
              className={`flex-1 h-full min-h-0 flex flex-col ${
                ((localStream || remoteStream) && !isStreamFloating) ||
                (activeAddonStage && !isStageFloating) ||
                (hasActiveWatchParty && !isWatchPartyFloating)
                  ? "hidden"
                  : "flex"
              }`}
            >
              <PluginBannerNotice serverPlugins={server?.plugins} />
              <ChatPanel
                roomCode={server.roomCode}
                channelId={textChannelId}
                channelName={
                  resolvedDmUser
                    ? resolvedDmUser.nickname
                    : activeTextChannel?.name === "general"
                      ? t("serverSettings.channels.defaultTextChannelName", "general")
                      : activeTextChannel?.name || "general"
                }
                profile={profile}
                peers={peers}
                server={server}
                onProfileChange={onProfileChange}
                searchQuery={searchQuery}
                onOpenThread={handleOpenThread}
                onMessagesUpdate={handleMessagesUpdate}
                onSelectChannel={selectTextChannel}
                onToggleReactionReady={(fn) => {
                  toggleReactionRef.current = fn;
                }}
              />
            </div>

            <RoomStreamStage
              localStream={localStream}
              remoteStream={remoteStream}
              activeStreamUserId={activeStreamUserId}
              isStreamFloating={isStreamFloating}
              isStreamFullscreen={isStreamFullscreen}
              setIsStreamFloating={setIsStreamFloating}
              setIsStreamFullscreen={setIsStreamFullscreen}
              voiceMembersDisplay={voiceMembersDisplay}
              onStopScreenShare={handleStopScreenShare}
              onResetRemoteStream={() => {
                setRemoteStream(null);
                setActiveStreamUserId(null);
                activeStreamUserIdRef.current = null;
              }}
            />

            <AddonStageHost
              activeStage={activeAddonStage}
              onCloseStage={() => handleCloseStage(false)}
              isStageFloating={isStageFloating}
              isStageFullscreen={isStageFullscreen}
              setIsStageFloating={setIsStageFloating}
              setIsStageFullscreen={setIsStageFullscreen}
              onShareToChat={(customUrl, gameContext) => {
                const effectiveStage = gameContext || activeAddonStage;
                if (!effectiveStage || !window.electronAPI?.sendChatMessage) return;
                const joinUrl =
                  typeof customUrl === "string" && customUrl.startsWith("http")
                    ? customUrl
                    : effectiveStage.url;

                const queryParam = effectiveStage.shareCapture?.queryParam || "sala";
                let roomCode = effectiveStage.roomCode || server?.roomCode?.slice(0, 6) || "P2P";
                try {
                  const parsed = new URL(joinUrl);
                  const cleanParam = queryParam.replace("=", "").replace("?", "");
                  const roomValue =
                    (cleanParam ? parsed.searchParams.get(cleanParam) : null) ||
                    parsed.searchParams.get("sala") ||
                    parsed.searchParams.get("c") ||
                    parsed.searchParams.get("room") ||
                    parsed.searchParams.get("code");

                  if (roomValue) {
                    roomCode = roomValue;
                  } else if (parsed.search && parsed.search.length > 1) {
                    const rawSearch = parsed.search.slice(1);
                    if (!rawSearch.includes("=")) {
                      roomCode = rawSearch;
                    }
                  } else if (parsed.pathname && parsed.pathname.length > 1) {
                    const pathParts = parsed.pathname.split("/").filter(Boolean);
                    const lastPart = pathParts[pathParts.length - 1];
                    if (lastPart && /^[a-zA-Z0-9]{6,12}$/.test(lastPart)) {
                      roomCode = lastPart;
                    }
                  }
                } catch (_) {}

                const embedPayload = {
                  pluginId: effectiveStage.pluginId,
                  type: effectiveStage.embedType || "game_lobby",
                  data: {
                    gameTitle: effectiveStage.title || "Partida Multijugador",
                    gameIcon: effectiveStage.icon || "sports_esports",
                    roomCode,
                    authorName: profile?.nickname || profile?.username || "Jugador",
                    joinUrl,
                    coverUrl: effectiveStage.cover || null,
                    shareCapture: effectiveStage.shareCapture,
                    frameScripts: effectiveStage.frameScripts,
                  },
                };
                window.electronAPI.sendChatMessage(
                  server.roomCode,
                  textChannelId,
                  `[PLUGIN_EMBED]:${JSON.stringify(embedPayload)}`
                );
              }}
            />

            <WatchPartyStage />
          </div>

          {/* Isla del Panel de Hilos */}
          {shouldRenderThread && displayedThreadMsg && (
            <div
              onPointerDown={startResizeThread}
              className={cn(
                "onicord-resizer-handle cursor-col-resize shrink-0 z-10 transition-opacity duration-150",
                isThreadClosing && "opacity-0 pointer-events-none"
              )}
            />
          )}

          {shouldRenderThread && displayedThreadMsg && (
            <div
              style={{
                width: `${threadWidth}px`,
                minWidth: `${threadWidth}px`,
                maxWidth: `${threadWidth}px`,
              }}
              className={cn(
                "h-full shrink-0 flex flex-col relative overflow-hidden bg-onicord-base rounded-onicord-outer-p4 border border-onicord-island shadow-xl",
                isThreadClosing ? "onicord-animate-thread-out" : "onicord-animate-thread-in"
              )}
            >
              <ThreadSidePanel
                parentMessage={displayedThreadMsg}
                messages={threadMessages}
                currentUserId={profile?.id}
                profile={profile}
                peers={peers}
                server={server}
                searchQuery={searchQuery}
                onClose={() => {
                  soundEngine.playNav("close");
                  setActiveThreadMessage(null);
                }}
                onSendThreadReply={handleSendThreadReply}
                onToggleReaction={(msgId, emoji) =>
                  handleToggleReactionFromAnywhere(msgId, emoji, displayedThreadMsg?.channelId || textChannelId)
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Resizer Handle Derecha */}
      <div
        onPointerDown={startResizeRight}
        className="onicord-resizer-handle"
      />

      {/* Barra Derecha: Rich Presence + Plugins + Miembros */}
      <div
        style={{
          width: `${rightWidth}px`,
          minWidth: `${rightWidth}px`,
          maxWidth: `${rightWidth}px`,
          gap: "calc(var(--gap) + 3px)",
        }}
        className="h-full shrink-0 flex-shrink-0 flex flex-col"
      >
        {/* Isla de Rich Presence con animación de arrastre */}
        <div
          className={`w-full overflow-hidden transition-all duration-300 ease-in-out shrink-0 flex flex-col ${
            hasActiveGame
              ? "max-h-48 opacity-100 scale-100 pointer-events-auto"
              : "max-h-0 opacity-0 scale-95 pointer-events-none -mb-[calc(var(--gap)+3px)]"
          }`}
        >
          {displayGame && displayGame.name && (
            <RichPresenceCard
              gameName={displayGame.name}
              cover={displayGame.cover}
              smallCover={displayGame.smallCover}
              startTime={displayGame.startTime}
              type={displayGame.type || "game"}
              state={displayGame.state}
              party={displayGame.party}
              details={
                displayGame.details ||
                (displayGame.type === "music"
                  ? t("userPanel.listeningTo", "Escuchando a")
                  : displayGame.type === "app"
                    ? t("gamesTab.usingNow", "Usando ahora")
                    : displayGame.type === "client"
                      ? t("userPopout.inMenus", "En los menús")
                      : t("userPanel.playing", "Jugando a"))
              }
            />
          )}
        </div>

        <PluginIsland
          roomCode={server?.roomCode}
          profile={profile}
          server={server}
          voice={voice}
        />

        <MembersSidebar
          members={sanitizedMembersList}
          voiceMembers={voiceMembersDisplay}
          onVoiceUserContextMenu={
            voice.inVoice ? handleVoiceUserContextMenu : undefined
          }
          onUserClick={handleUserClick}
          profile={profile}
          roomCode={server.roomCode}
          serverId={server.roomCode || server.id}
          getChannelUnreadCount={getChannelUnreadCount}
          onMessageUser={handleMessageUser}
          disableFlameSystem={server?.disableFlameSystem}
          ownerId={server?.ownerId}
          server={server}
        />
      </div>

      {/* Modales y Popouts */}
      {volumeMenu && (
        <VoiceUserVolumeMenu
          x={volumeMenu.x}
          y={volumeMenu.y}
          nickname={volumeMenu.nickname}
          volume={volumeMenu.volume}
          onVolumeChange={(v) => {
            setVolumeMenu((prev) => (prev ? { ...prev, volume: v } : null));
            voice.setPeerVolume?.(volumeMenu.peerId, v);
          }}
          onClose={() => setVolumeMenu(null)}
        />
      )}

      {userPopout && (
        <UserProfilePopout
          key={
            userPopout.member.id ||
            userPopout.member.userId ||
            userPopout.member.peerId
          }
          x={userPopout.x}
          y={userPopout.y}
          member={userPopout.member}
          isClosing={userPopout.isClosing}
          onClose={handleCloseUserPopout}
          disableFlameSystem={server?.disableFlameSystem}
          serverId={server.roomCode || server.id}
          userRolesList={(() => {
            const mId =
              userPopout.member.id ||
              userPopout.member.userId ||
              userPopout.member.peerId;

            const list = (() => {
              if (!server?.roles || !server?.userRoles) return [];
              const uRoles = server.userRoles[mId];
              if (!uRoles) return [];

              const roleIds = Array.isArray(uRoles) ? uRoles : [uRoles];
              return roleIds
                .map((id) => server.roles.find((r) => r.id === id))
                .filter(Boolean)
                .sort(
                  (a, b) =>
                    server.roles.findIndex((r) => r.id === a.id) -
                    server.roles.findIndex((r) => r.id === b.id),
                );
            })();

            if (server?.ownerId && mId === server.ownerId) {
              list.unshift({ id: "owner", name: "crown", color: "#FFD700" });
            }
            return list;
          })()}
        />
      )}

      {showAdd && (
        <AddServerModal
          profile={profile}
          onClose={() => setShowAdd(false)}
          onCreated={async (newServer) => {
            setShowAdd(false);
            onRefreshServers();
            await handleSwitchServer(newServer.id);
          }}
        />
      )}

      {showSettings && (
        <ServerSettingsModal
          server={server}
          peers={peers}
          profile={profile}
          servers={servers}
          onClose={() => setShowSettings(false)}
          onSave={onServerUpdated}
          onSaved={onServerUpdated}
          onLeave={onLeave}
          onRefreshServers={onRefreshServers}
          onProfileChange={onProfileChange}
          sanitizedMembersList={sanitizedMembersList}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={contextMenu.title}
          onClose={() => setContextMenu(null)}
          items={(() => {
            if (contextMenu.type === "voice_user") {
              const { targetUser } = contextMenu;
              return [
                {
                  label: t("voice.userVolume", "Volumen de usuario"),
                  icon: <MaterialIcon name="volume_up" size={16} />,
                  onClick: () => {
                    const currentVol = voice.getPeerVolume?.(targetUser.peerId) ?? 100;
                    setVolumeMenu({
                      x: contextMenu.x,
                      y: contextMenu.y,
                      peerId: targetUser.peerId,
                      nickname: targetUser.nickname,
                      volume: currentVol,
                    });
                    setContextMenu(null);
                  },
                },
              ];
            }
            if (contextMenu.type === "channel") {
              const { channel } = contextMenu;
              const isChMuted = localStorage.getItem(`channel_notif_mode_${channel.id}`) === "nothing";
              return [
                {
                  label: isChMuted
                    ? t("contextMenu.unmuteChannel", "Desilenciar canal")
                    : t("contextMenu.muteChannel", "Silenciar canal"),
                  icon: <MaterialIcon name={isChMuted ? "notifications" : "notifications_off"} size={16} />,
                  onClick: () => {
                    if (isChMuted) {
                      localStorage.removeItem(`channel_notif_mode_${channel.id}`);
                    } else {
                      localStorage.setItem(`channel_notif_mode_${channel.id}`, "nothing");
                    }
                    window.dispatchEvent(new CustomEvent("onicord:channel-mute-changed", { detail: { channelId: channel.id } }));
                    setContextMenu(null);
                  },
                },
              ];
            }
            return [];
          })()}
        />
      )}
    </div>
  );
}
