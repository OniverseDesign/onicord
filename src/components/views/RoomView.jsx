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

import { useRoomResizers } from "../../hooks/useRoomResizers";
import ChannelsSidebar from "../navigation/ChannelsSidebar";
import RoomStreamStage from "../voice/RoomStreamStage";
import { soundEngine } from "../../lib/soundEngine";
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
  const [roomMessages, setRoomMessages] = useState([]);

  const handleMessagesUpdate = useCallback((msgs) => {
    setRoomMessages(msgs);
  }, []);

  const handleOpenThread = useCallback((msg) => {
    soundEngine.playNav("open");
    setActiveThreadMessage(msg);
  }, []);

  useEffect(() => {
    if (!textChannelId?.startsWith("dm_")) {
      setActiveDmUser(null);
    }
    setActiveThreadMessage(null);
  }, [server.roomCode, textChannelId]);

  const handleSendThreadReply = useCallback(
    async (parentMsgId, replyText) => {
      if (
        !parentMsgId ||
        !replyText.trim() ||
        !window.electronAPI?.sendChatMessage
      )
        return;
      try {
        const threadPayload = JSON.stringify({
          body: replyText.trim(),
          threadParentId: parentMsgId,
        });
        await window.electronAPI.sendChatMessage(
          server.roomCode,
          textChannelId,
          threadPayload,
        );
      } catch (err) {
        console.error("Error sending thread reply:", err);
      }
    },
    [server.roomCode, textChannelId],
  );

  useEffect(() => {
    onChannelChange?.(textChannelId);
    setInputValue("");
    setSearchQuery("");
    return () => onChannelChange?.(null);
  }, [textChannelId, onChannelChange]);

  const [volumeMenu, setVolumeMenu] = useState(null);
  const [userPopout, setUserPopout] = useState(null);

  const [activeGame, setActiveGame] = useState({
    name: null,
    startTime: null,
    cover: null,
  });

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
        const peerProfile = (peers || []).find(
          (p) =>
            (p.peerId && p.peerId === m.peerId) ||
            (remoteUserId &&
              (p.id === remoteUserId || p.userId === remoteUserId)) ||
            (m.id && (p.id === m.id || p.userId === m.id)) ||
            (m.userId && (p.id === m.userId || p.userId === m.userId)),
        );
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
    peers,
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

    return () => {
      unsubPeerUpdated?.();
      unsubJoin?.();
      unsubLeave?.();
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
    await window.electronAPI?.setServerChannel?.(server.id, channelId);
  };

  const prevVoiceChannelRef = useRef(selectedVoiceChannelId);
  useEffect(() => {
    if (prevVoiceChannelRef.current !== selectedVoiceChannelId) {
      prevVoiceChannelRef.current = selectedVoiceChannelId;
      if (localStream || remoteStream) {
        handleStopScreenShare();
        setRemoteStream(null);
        setActiveStreamUserId(null);
        activeStreamUserIdRef.current = null;
      }
    }
  }, [selectedVoiceChannelId]);

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

          <div className="h-12 flex-1 min-w-0 flex items-center gap-4 px-4 bg-onicord-base rounded-full border border-onicord-island">
            <IconSearch size="lg" />
            <input
              ref={searchInputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={t("chat.searchPlaceholder", "Buscar mensajes o archivos...")}
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
        <div className="flex-1 min-h-0 flex gap-1 overflow-hidden">
          <div className="flex-1 min-w-0 h-full flex flex-col relative overflow-hidden bg-onicord-base rounded-onicord-outer-p4 border border-onicord-island">
            <div
              className={`flex-1 h-full min-h-0 flex flex-col ${(localStream || remoteStream) && !isStreamFloating ? "hidden" : "flex"}`}
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
                messages={roomMessages}
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
        {activeGame && activeGame.name && (
          <RichPresenceCard
            gameName={activeGame.name}
            cover={activeGame.cover}
            startTime={activeGame.startTime}
            details={
              activeGame.type === "music"
                ? t("userPanel.listeningTo")
                : activeGame.type === "client"
                  ? t("userPopout.inMenus")
                  : t("userPanel.playing")
            }
          />
        )}

        <PluginIsland
          roomCode={server?.roomCode}
          profile={profile}
          server={server}
        />

        <MembersSidebar
          members={sanitizedMembersList}
          voiceMembers={voiceMembersDisplay}
          onVoiceUserContextMenu={
            voice.inVoice ? handleVoiceUserContextMenu : undefined
          }
          onUserClick={(e, member) => {
            setUserPopout({ x: e.clientX, y: e.clientY, member });
          }}
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
          x={userPopout.x}
          y={userPopout.y}
          member={userPopout.member}
          onClose={() => setUserPopout(null)}
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
