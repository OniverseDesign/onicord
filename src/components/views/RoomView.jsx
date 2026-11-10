import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ChatPanel from "../chat/ChatPanel";
import RoomHeader from "./room/RoomHeader";
import RoomRightSidebar from "./room/RoomRightSidebar";
import RoomOverlays from "./room/RoomOverlays";
import { useGlobalVoice } from "../../context/VoiceContext";
import PluginBannerNotice from "../plugins/PluginBannerNotice";
import MaterialIcon from "../icons/MaterialIcon";
import ThreadSidePanel from "../chat/subcomponents/ThreadSidePanel";
import ForumTagsBar from "../chat/subcomponents/ForumTagsBar";
import { notificationManager } from "../../lib/notificationManager";
import { evaluateServerFlame } from "../../lib/flameService";
import { checkPermission, hasChannelAccess } from "../../lib/permissionsHelper";
import { buildPeerLookup, getEffectiveProfile } from "../../lib/profileUtils";

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
  const [showSettings, setShowSettings] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [moderationConfirm, setModerationConfirm] = useState(null);
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

  // Focus search input on onicord:focus-search custom event
  useEffect(() => {
    const handleFocusSearch = () => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select?.();
      }
    };
    window.addEventListener("onicord:focus-search", handleFocusSearch);
    return () => window.removeEventListener("onicord:focus-search", handleFocusSearch);
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

  const [channelMessages, setChannelMessages] = useState([]);
  const [selectedTagFilter, setSelectedTagFilter] = useState(null);
  const isForumChannelRef = useRef(false);

  useEffect(() => {
    setSelectedTagFilter(null);
    setChannelMessages([]);
  }, [textChannelId]);

  const handleMessagesUpdate = useCallback((msgs) => {
    roomMessagesRef.current = msgs;
    if (isForumChannelRef.current) {
      setChannelMessages(msgs);
    }
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
  const hasActiveWatchParty = Boolean(
    watchParty?.session?.videoId &&
    watchParty?.hasJoined &&
    watchParty?.session?.type !== "cinema"
  );
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
      // If opening a game stage with a different URL, load the new stage
      const isDifferentTarget = (enrichedStageDef.url && enrichedStageDef.url !== currentStage.url) ||
        (enrichedStageDef.activity?.name && enrichedStageDef.activity.name !== currentStage.activity?.name);
      if (!isDifferentTarget) {
        // Only toggle PiP without reloading if targeting exact same stage
        setIsStageFloating((prevFloating) => !prevFloating);
        return;
      }
    }

    soundEngine.playNav("open");
    setActiveAddonStage(enrichedStageDef);
    setIsStageFloating(Boolean(enrichedStageDef.isFloating));

    if (enrichedStageDef.isChannel) {
      watchParty?.joinWatchParty?.();
    }

    // If triggered by a local DOM event (such as chat invite click), sync with Electron
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
    const clientX = e?.clientX ?? Math.round(window.innerWidth / 2);
    const clientY = e?.clientY ?? Math.round(window.innerHeight / 3);
    e?.stopPropagation?.();
    const getMemberId = (m) => (m ? (m.id || m.userId || m.peerId) : null);
    const clickedId = getMemberId(member);

    setUserPopout((prev) => {
      const prevId = getMemberId(prev?.member);
      // If menu is open for this user and not animating out, trigger exit animation
      if (prev && prevId === clickedId && !prev.isClosing) {
        if (closingPopoutTimerRef.current) clearTimeout(closingPopoutTimerRef.current);
        closingPopoutTimerRef.current = setTimeout(() => {
          setUserPopout(null);
        }, 110);
        return { ...prev, isClosing: true };
      }
      // If menu was closing or targeting a different user, open fresh popout
      if (closingPopoutTimerRef.current) clearTimeout(closingPopoutTimerRef.current);
      return { x: clientX, y: clientY, member, isClosing: false };
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
        (c.type === "text" || c.type === "forum" || !c.type) &&
        !isCategoryNode(c) &&
        hasChannelAccess(server, c, profile?.id),
    ) ?? [];

  const activeTextChannel =
    textChannels.find((c) => c.id === textChannelId) ?? textChannels[0];
  isForumChannelRef.current = activeTextChannel?.type === "forum";
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

  const serverKey = server?.roomCode || server?.id;
  const localEffective = useMemo(() => {
    return getEffectiveProfile(profile, serverKey, servers) || profile;
  }, [profile, serverKey, servers]);

  const sanitizedMembersList = useMemo(() => {
    const seen = new Set();
    const bannedSet = new Set(Array.isArray(server?.bannedUsers) ? server.bannedUsers : []);
    const kickedUsers = server?.kickedUsers || {};

    const localUser = {
      id: profile?.id || "self",
      peerId: null,
      nickname: localEffective?.nickname ?? profile?.nickname ?? t("common.you"),
      avatar: localEffective?.avatar ?? profile?.avatar,
      isSelf: true,
      online: true,
      customLink: localEffective?.customLink ?? profile?.customLink,
      profileColor: localEffective?.profileColor ?? profile?.profileColor,
      customStatus: localEffective?.customStatus ?? profile?.customStatus,
      globalNickname: profile?.nickname || null,
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
      const actualId = p.userId || p.id || p.peerId;
      if (!actualId) return;
      // Filter out connecting or unauthenticated sockets
      if (!p.userId || p.nickname === "Conectando…" || p.nickname === "Conectando...") return;
      // Filter out banned users
      if (bannedSet.has(actualId) || (p.userId && bannedSet.has(p.userId))) return;

      if (
        seen.has(actualId) ||
        (p.userId && seen.has(p.userId)) ||
        (p.id && seen.has(p.id)) ||
        (p.peerId && seen.has(p.peerId))
      )
        return;

      seen.add(actualId);
      if (p.userId) seen.add(p.userId);
      if (p.id) seen.add(p.id);
      if (p.peerId) seen.add(p.peerId);

      const savedInfo = (p.userId && server?.savedMembers?.[p.userId]) || server?.savedMembers?.[actualId] || (p.peerId && server?.savedMembers?.[p.peerId]);

      const serverScopeKey = server?.roomCode ? String(server.roomCode).trim().toUpperCase() : null;
      const peerServerOverride = (serverScopeKey && p.serverProfiles)
        ? (p.serverProfiles[serverScopeKey] || p.serverProfiles[server?.roomCode] || p.serverProfiles[server?.id])
        : null;

      const effNickname = savedInfo?.nickname || peerServerOverride?.nickname || p.nickname;
      const effAvatar = savedInfo?.avatar !== undefined ? savedInfo.avatar : (peerServerOverride?.avatar !== undefined && peerServerOverride?.avatar !== null && peerServerOverride?.avatar !== "" ? peerServerOverride.avatar : p.avatar);
      const effLink = savedInfo?.customLink !== undefined ? savedInfo.customLink : (peerServerOverride?.customLink !== undefined ? peerServerOverride.customLink : (p.customLink || ""));
      const effColor = savedInfo?.profileColor || peerServerOverride?.profileColor || p.profileColor;
      const effStatus = savedInfo?.customStatus !== undefined ? savedInfo.customStatus : (peerServerOverride?.customStatus !== undefined ? peerServerOverride.customStatus : (p.customStatus || ""));
      const effGlobal = savedInfo?.globalNickname || peerServerOverride?.globalNickname || p.globalNickname || (effNickname !== p.nickname ? p.nickname : null);

      list.push({
        ...p,
        id: actualId,
        nickname: effNickname,
        avatar: effAvatar,
        customLink: effLink,
        profileColor: effColor,
        customStatus: effStatus,
        globalNickname: effGlobal,
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
        // Filter out banned users from historical saved members list
        if (bannedSet.has(actualId) || (m.userId && bannedSet.has(m.userId))) return;

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
    server.bannedUsers,
    server.kickedUsers,
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
            nickname: localEffective?.nickname ?? profile?.nickname ?? m.nickname,
            avatar: localEffective?.avatar ?? profile?.avatar ?? m.avatar,
            isSpeaking: amISpeaking,
            isStreaming: Boolean(voice.isStreaming),
            customLink: localEffective?.customLink ?? profile?.customLink,
            profileColor: localEffective?.profileColor ?? profile?.profileColor,
            customStatus: localEffective?.customStatus ?? profile?.customStatus,
            globalNickname: profile?.nickname || null,
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
        const savedInfo = server?.savedMembers?.[finalUserId];
        const serverScopeKey = server?.roomCode ? String(server.roomCode).trim().toUpperCase() : null;
        const peerServerOverride = (serverScopeKey && peerProfile?.serverProfiles)
          ? (peerProfile.serverProfiles[serverScopeKey] || peerProfile.serverProfiles[server?.roomCode] || peerProfile.serverProfiles[server?.id])
          : null;

        const effNickname = savedInfo?.nickname || peerServerOverride?.nickname || m.nickname || peerProfile?.nickname || "User";
        const effAvatar = savedInfo?.avatar !== undefined ? savedInfo.avatar : (peerServerOverride?.avatar !== undefined && peerServerOverride?.avatar !== null && peerServerOverride?.avatar !== "" ? peerServerOverride.avatar : (m.avatar ?? peerProfile?.avatar ?? null));
        const effLink = savedInfo?.customLink !== undefined ? savedInfo.customLink : (peerServerOverride?.customLink !== undefined ? peerServerOverride.customLink : (peerProfile?.customLink || ""));
        const effColor = savedInfo?.profileColor || peerServerOverride?.profileColor || peerProfile?.profileColor || "";
        const effStatus = savedInfo?.customStatus !== undefined ? savedInfo.customStatus : (peerServerOverride?.customStatus !== undefined ? peerServerOverride.customStatus : (peerProfile?.customStatus || ""));
        const effGlobal = savedInfo?.globalNickname || peerServerOverride?.globalNickname || peerProfile?.nickname || null;

        return {
          ...m,
          id: finalUserId,
          peerId: m.peerId,
          nickname: effNickname,
          avatar: effAvatar,
          isSpeaking: isPeerSpeaking,
          isStreaming: Boolean(m.isStreaming),
          activity:
            peerProfile?.showRichPresence !== false
              ? peerProfile?.activity || null
              : null,
          customLink: effLink,
          profileColor: effColor,
          customStatus: effStatus,
          globalNickname: effGlobal,
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
            const uid = p.userId || p.id || p.peerId;
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
      if (!peer || (!peer.userId && (peer.nickname === "Conectando…" || peer.nickname === "Conectando..."))) {
        return;
      }
      setPeers((prev) => {
        const uid = peer.userId || peer.id || peer.peerId;
        const index = prev.findIndex(
          (p) =>
            (peer.userId && (p.userId === peer.userId || p.id === peer.userId)) ||
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

    const unsubMemberFirstJoined = api.onMemberFirstJoined?.((member) => {
      const uid = member?.id || member?.userId;
      if (uid && profile?.id && uid !== profile.id && member?.roomCode === server?.roomCode) {
        const nick = member.nickname || "Un usuario";
        notificationManager.showToast(
          t("server.newMemberJoined", "Nuevo Miembro"),
          t("server.memberJoinedText", { name: nick, defaultValue: `${nick} se ha unido al servidor.` }),
          "info",
          7500,
          null,
          member.avatar || null,
          nick
        );
      }
    });

    const unsubLeave = api.onPeerLeft((peerData) => {
      if (
        typeof peerData === "object" &&
        peerData?.roomCode &&
        server?.roomCode &&
        String(peerData.roomCode).trim().toUpperCase() !== String(server.roomCode).trim().toUpperCase()
      ) {
        return;
      }
      const leftPeerId = typeof peerData === "string" ? peerData : (peerData?.peerId || peerData?.id);
      if (!leftPeerId) return;
      setPeers((prev) =>
        prev.filter(
          (p) =>
            p.id !== leftPeerId &&
            p.peerId !== leftPeerId &&
            p.userId !== leftPeerId &&
            p.userId !== null &&
            p.nickname !== "Conectando…" &&
            p.nickname !== "Conectando..."
        )
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
      unsubMemberFirstJoined?.();
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
      // If user leaves voice chat, automatically dismiss active addon stage
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

  // Force voice disconnect if connect_voice permission is revoked in real time
  useEffect(() => {
    if (selectedVoiceChannelId && profile?.id && server) {
      const canConnect = checkPermission(server, profile.id, "connect_voice");
      if (!canConnect) {
        selectVoiceChannel(null);
      }
    }
  }, [server?.roles, server?.userRoles, selectedVoiceChannelId, profile?.id]);

  // Stop screen share if share_video permission is revoked in real time
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

  const handleMemberContextMenu = (e, targetUser) => {
    e.preventDefault();
    setContextMenu({
      type: "member",
      x: e.clientX,
      y: e.clientY,
      title: targetUser.nickname || t("common.user", "Usuario"),
      targetUser,
    });
  };

  return (
    <div className="flex-1 min-w-0 h-full flex relative flex-row gap-onicord-gap pl-[var(--gap)] box-border">
      <ChannelsSidebar
        server={server}
        profile={profile}
        effectiveProfile={localEffective}
        servers={servers}
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
        <RoomHeader
          resolvedDmUser={resolvedDmUser}
          activeTextChannel={activeTextChannel}
          inputValue={inputValue}
          setInputValue={setInputValue}
          setSearchQuery={setSearchQuery}
          isSearchFocused={isSearchFocused}
          setIsSearchFocused={setIsSearchFocused}
          searchInputRef={searchInputRef}
        />

        {/* Forum Channel Hashtag Filters Bar */}
        {activeTextChannel?.type === "forum" && (
          <div className="w-full px-1">
            <ForumTagsBar
              messages={channelMessages}
              activeTag={selectedTagFilter}
              onSelectTag={(tag) => setSelectedTagFilter((prev) => (prev === tag ? null : tag))}
            />
          </div>
        )}

        {/* Central Container: ChatPanel + StreamStage + ThreadSidePanel */}
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
                peers={sanitizedMembersList}
                server={server}
                onProfileChange={onProfileChange}
                searchQuery={searchQuery}
                tagFilter={selectedTagFilter}
                onSelectTag={(tag) => setSelectedTagFilter((prev) => (prev === tag ? null : tag))}
                onOpenThread={handleOpenThread}
                onMessagesUpdate={handleMessagesUpdate}
                onSelectChannel={selectTextChannel}
                onToggleReactionReady={(fn) => {
                  toggleReactionRef.current = fn;
                }}
                isForum={activeTextChannel?.type === "forum"}
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

                const isCinema = effectiveStage.pluginId === "onicord-cinema" || effectiveStage.type === "movie";
                const embedPayload = {
                  pluginId: effectiveStage.pluginId || "onicord-cinema",
                  type: isCinema ? "cinema_watch_party" : (effectiveStage.embedType || "game_lobby"),
                  data: isCinema
                    ? {
                        title: effectiveStage.title || "Cinema",
                        details: effectiveStage.details || "",
                        cover: effectiveStage.cover || effectiveStage.activity?.cover || null,
                        logo: effectiveStage.logo || null,
                        banner: effectiveStage.banner || null,
                        streamUrl: effectiveStage.streamUrl || effectiveStage.url,
                        infoHash: effectiveStage.infoHash || null,
                        fileIdx: effectiveStage.fileIdx ?? 0,
                        trackers: effectiveStage.trackers || [],
                        authorName: profile?.nickname || profile?.username || "Anfitrión",
                        duration: effectiveStage.duration || 0,
                        subtitles: effectiveStage.subtitles || [],
                      }
                    : {
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

          {/* Thread Panel Island */}
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
                peers={sanitizedMembersList}
                server={server}
                searchQuery={searchQuery}
                isForum={activeTextChannel?.type === "forum"}
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
      <RoomRightSidebar
        rightWidth={rightWidth}
        hasActiveGame={hasActiveGame}
        displayGame={displayGame}
        sanitizedMembersList={sanitizedMembersList}
        voiceMembersDisplay={voiceMembersDisplay}
        voice={voice}
        handleVoiceUserContextMenu={handleVoiceUserContextMenu}
        handleMemberContextMenu={handleMemberContextMenu}
        handleUserClick={handleUserClick}
        profile={profile}
        server={server}
        onOpenAppSettings={onOpenAppSettings}
        getChannelUnreadCount={getChannelUnreadCount}
        handleMessageUser={handleMessageUser}
      />

      {/* Modales, Menús Contextuales y Popouts */}
      <RoomOverlays
        volumeMenu={volumeMenu}
        setVolumeMenu={setVolumeMenu}
        voice={voice}
        userPopout={userPopout}
        handleCloseUserPopout={handleCloseUserPopout}
        server={server}
        onOpenAppSettings={onOpenAppSettings}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        peers={peers}
        setPeers={setPeers}
        profile={profile}
        servers={servers}
        onServerUpdated={onServerUpdated}
        onLeave={onLeave}
        onRefreshServers={onRefreshServers}
        onProfileChange={onProfileChange}
        sanitizedMembersList={sanitizedMembersList}
        contextMenu={contextMenu}
        setContextMenu={setContextMenu}
        handleUserClick={handleUserClick}
        handleMessageUser={handleMessageUser}
        markChannelAsRead={markChannelAsRead}
        moderationConfirm={moderationConfirm}
        setModerationConfirm={setModerationConfirm}
      />
    </div>
  );
}
