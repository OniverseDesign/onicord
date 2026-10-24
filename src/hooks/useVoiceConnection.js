import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { VoicePeerManager } from "../lib/voice/VoicePeerManager";
import {
  normalizeAudioSettings,
  getPeerVolumePercent,
} from "../lib/audioSettings";
import { notificationManager } from "../lib/notificationManager";
import { soundEngine } from "../lib/soundEngine";
import { recordUserInteraction } from "../lib/flameService";
import { isTypingInInput } from "../lib/inputUtils";

/**
 * Custom React hook that orchestrates the local WebRTC voice session.
 * Coordinates native WebRTC (RTCPeerConnection) peer creation, P2P/SFU signaling channels, mute/deafen options,
 * dynamic membership synchronization, and unmount cleanups to prevent resource leaks.
 * 
 * @param {string|null} activeVoiceChannelId - The ID of the targeted voice channel or null.
 * @param {Object} profile - The current user profile credentials.
 * @returns {Object} The voice connection state values, member lists, and handlers.
 */
export function useVoiceConnection(activeVoiceChannelId, profile, serverIceServers, serverId = "") {
  const { t } = useTranslation();
  const [inVoice, setInVoice] = useState(false);
  const [voiceChannelId, setVoiceChannelId] = useState(null);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [members, setMembers] = useState([]);
  const [localPeerId, setLocalPeerId] = useState(null);
  const [error, setError] = useState(null);
  const [micHardwareError, setMicHardwareError] = useState(false);
  const [micErrorMessage, setMicErrorMessage] = useState(null);
  const managerRef = useRef(null);
  const pendingSignalsRef = useRef([]);
  const inVoiceRef = useRef(inVoice);
  useEffect(() => {
    inVoiceRef.current = inVoice;
  }, [inVoice]);
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);
  const deafenedRef = useRef(deafened);
  useEffect(() => {
    deafenedRef.current = deafened;
  }, [deafened]);
  const [isStreaming, setIsStreaming] = useState(false);

  const iceServersRef = useRef(serverIceServers);
  useEffect(() => {
    iceServersRef.current = serverIceServers;
    if (managerRef.current) {
      managerRef.current.options.iceServers = serverIceServers;
    }
  }, [serverIceServers]);

  const [networkTopology, setNetworkTopology] = useState("mesh"); // 'mesh' | 'sfu'
  const [sfuHostId, setSfuHostId] = useState(null);
  const [isLocalHost, setIsLocalHost] = useState(false);
  // Map of peerId -> string[] of LAN IPs, used for WebRTC LAN audio optimization
  const lanPeerIPsRef = useRef(new Map());


  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const unsubSfu = api.onVoiceSfuMigrated?.(({ newHostId, topology }) => {
      console.log(`[useVoiceConnection] SFU Migrated event: topology=${topology}, newHostId=${newHostId}`);
      setNetworkTopology(topology);
      setSfuHostId(newHostId);
      setIsLocalHost(newHostId === localPeerId);

      if (managerRef.current) {
        managerRef.current.setTopology(topology, newHostId);
      }
    });

    return () => {
      unsubSfu?.();
    };
  }, [localPeerId]);

  const isJoiningChannelRef = useRef(null);

  const profileRef = useRef(profile);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const hardwareRef = useRef({ inputDeviceId: "", outputDeviceId: "" });
  const audioSettings = normalizeAudioSettings(profile?.audio);

  const refreshState = useCallback(async () => {
    const state = await window.electronAPI?.getVoiceState?.(); 
    if (!state) return; 

    setLocalPeerId(state.localPeerId); 

    const uniqueMembersMap = new Map();
    if (state.members && Array.isArray(state.members)) {
      state.members.forEach((member) => {
        if (member && member.peerId) {
          uniqueMembersMap.set(member.peerId, member);
        }
      });
    }
    const cleanMembers = Array.from(uniqueMembersMap.values());

    // Build LAN peer IP map for WebRTC audio optimization
    const newLanMap = new Map();
    cleanMembers.forEach((m) => {
      if (
        !m.isSelf &&
        m.localIPs &&
        Array.isArray(m.localIPs) &&
        m.localIPs.length > 0
      ) {
        newLanMap.set(m.peerId, m.localIPs);
      }
    });
    lanPeerIPsRef.current = newLanMap;
    if (managerRef.current?.setLanPeerIPs) {
      managerRef.current.setLanPeerIPs(newLanMap);
    }

    setMembers((prevMembers) => {
      if (prevMembers.length === cleanMembers.length) {
        const isSame = prevMembers.every((pm, idx) => {
          const cm = cleanMembers[idx];
          return (
            pm.peerId === cm.peerId &&
            pm.channelId === cm.channelId &&
            pm.muted === cm.muted &&
            pm.deafened === cm.deafened &&
            pm.isSelf === cm.isSelf &&
            pm.isStreaming === cm.isStreaming &&
            pm.nickname === cm.nickname &&
            pm.avatar === cm.avatar
          );
        });
        if (isSame) return prevMembers;
      }
      return cleanMembers;
    });

    const self = cleanMembers.find((m) => m.isSelf);
    setInVoice(Boolean(self?.channelId));
    setVoiceChannelId(self?.channelId ?? null);
    if (self) {
      setMuted(Boolean(self.muted));
      setDeafened(Boolean(self.deafened));
    } else if (state.selfMuted !== undefined) {
      setMuted(Boolean(state.selfMuted));
      setDeafened(Boolean(state.selfDeafened));
    }
    setIsStreaming(self ? Boolean(self.isStreaming) : false);

    const topology = state.networkTopology || "mesh";
    const hostId = state.sfuHostId || null;
    setNetworkTopology(topology);
    setSfuHostId(hostId);
    setIsLocalHost(hostId === state.localPeerId);

    if (managerRef.current) {
      managerRef.current.setTopology(topology, hostId);
    }

    if (Boolean(self?.channelId) && !state.localPeerId) {
      console.log(
        "[useVoiceConnection] ID de red ausente en el primer frame. Re-intentando sincronización...",
      );
      setTimeout(() => {
        refreshState();
      }, 150);
    }

    return state;
  }, []);

  const syncPeerConnections = useCallback(async (manager, channelId) => {
    if (!manager || !channelId) return;
    const voiceState = await window.electronAPI.getVoiceState();
    if (!voiceState?.members) return;

    const list = voiceState.members.filter((m) => m.channelId === channelId);

    const isSfu = (manager.networkTopology === "sfu");
    const isHost = manager.isLocalHost;
    const sfuHostId = manager.sfuHostId;

    for (const m of list) {
      if (!m.isSelf && manager?.onRemoteJoinedVoice) {
        if (isSfu) {
          if (isHost) {
            await manager.onRemoteJoinedVoice(m.peerId);
          } else {
            if (m.peerId === sfuHostId) {
              await manager.onRemoteJoinedVoice(m.peerId);
            }
          }
        } else {
          await manager.onRemoteJoinedVoice(m.peerId);
        }
      }
    }

    if (manager?.peers) {
      const activeIds = new Set();
      list.filter((m) => !m.isSelf).forEach((m) => {
        if (isSfu) {
          if (isHost) {
            activeIds.add(m.peerId);
          } else {
            if (m.peerId === sfuHostId) {
              activeIds.add(m.peerId);
            }
          }
        } else {
          activeIds.add(m.peerId);
        }
      });
      for (const peerId of [...manager.peers.keys()]) {
        if (!activeIds.has(peerId)) manager.onRemoteLeftVoice(peerId);
      }
    }
  }, []);

  const createManager = useCallback((localId, channelId) => {
    const audio = normalizeAudioSettings(profileRef.current?.audio);

    hardwareRef.current = {
      inputDeviceId: audio.inputDeviceId,
      outputDeviceId: audio.outputDeviceId,
    };

    return new VoicePeerManager({
      localPeerId: localId,
      channelId,
      audioSettings: audio,
      inputDeviceId: audio.inputDeviceId,
      outputDeviceId: audio.outputDeviceId,
      peerVolumes: audio.peerVolumes,
      peers: profileRef.current?.peers || {},
      iceServers: iceServersRef.current || [],
      lanPeerIPs: lanPeerIPsRef.current,
      initialMuted: mutedRef.current,
      initialDeafened: deafenedRef.current,
      onSignalOut: (toPeerId, channelId, signal) => {
        window.electronAPI.sendVoiceSignal(toPeerId, channelId, signal);
      },
      onError: (err) => {
        let errorMsg = err?.message || t("voice.micErrorFallback", "Microphone error");
        if (errorMsg.startsWith("WebRTC connection failed with ")) {
          const suffix = errorMsg.replace("WebRTC connection failed with ", "");
          errorMsg = t("voice.webrtcConnectionFailed", { peer: suffix });
        }
        setError(errorMsg);
        notificationManager.showToast(
          t("voice.errorTitle", "Voice/Video Error"),
          errorMsg,
          "danger"
        );
      },
    });
  }, []);

  const voiceChannelRef = useRef(voiceChannelId);
  useEffect(() => {
    voiceChannelRef.current = voiceChannelId;
  }, [voiceChannelId]);

  useEffect(() => {
    refreshState();
    const api = window.electronAPI;
    if (!api) return;

    // Debounce: the backend can emit voice:state in rapid bursts (e.g. during join).
    // Collapse those into a single refreshState call to prevent redundant IPC round-trips.
    let debounceTimer = null;
    const debouncedRefresh = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => refreshState(), 50);
    };

    const unsubState = api.onVoiceState?.(debouncedRefresh);

    const unsubSpeaking = api.onSpeakingUpdated?.(
      ({ peerId, isSpeaking }) => {
        const boolSpeaking = Boolean(isSpeaking);
        window.dispatchEvent(
          new CustomEvent("peer-speaking-change", {
            detail: { peerId, isSpeaking: boolSpeaking },
          }),
        );

        setMembers((prevMembers) => {
          const target = prevMembers.find((m) => m.peerId === peerId || m.id === peerId);
          if (!target || Boolean(target.isSpeaking) === boolSpeaking) {
            return prevMembers;
          }
          return prevMembers.map((member) =>
            member.peerId === peerId || member.id === peerId
              ? {
                  ...member,
                  isSpeaking: boolSpeaking,
                }
              : member,
          );
        });
      },
    );

    const unsubSignal = api.onVoiceSignal?.(
      ({ fromPeerId, signal }) => {
        if (!managerRef.current) {
          if (inVoiceRef.current) {
            console.log(`[voice] Senal encolada de ${fromPeerId} (motivo: sin manager)`);
            const now = Date.now();
            const queue = pendingSignalsRef.current.filter((item) => now - item.at < 15000);
            if (queue.length < 100) {
              queue.push({ fromPeerId, signal, at: now });
            }
            pendingSignalsRef.current = queue;
          }
          return;
        }
        if (typeof managerRef.current.handleSignal === "function") {
          managerRef.current
            .handleSignal(fromPeerId, signal)
            .catch(console.error);
        }
      },
    );

    return () => {
      clearTimeout(debounceTimer);
      unsubState?.();
      unsubSpeaking?.();
      unsubSignal?.();
    };
  }, [refreshState]);

  // Cleanup voice manager on unmount to prevent resource and microphone leaks
  useEffect(() => {
    return () => {
      pendingSignalsRef.current = [];
      if (managerRef.current) {
        console.log("[useVoiceConnection] Unmount detected. Purging voice session...");
        managerRef.current.destroy();
        managerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const api = window.electronAPI;

    if (!api || !activeVoiceChannelId) {
      pendingSignalsRef.current = [];
      if (managerRef.current) {
        console.log(
          "[voice] Desconexión solicitada por el usuario. Destruyendo manager...",
        );
        managerRef.current.destroy();
        managerRef.current = null;
      }
      return;
    }

    if (!inVoice || !voiceChannelId || !localPeerId) return;

    // Atomic token guard: each effect invocation gets a unique token.
    // If the effect is cancelled (cleanup runs) while startMicrophone() is in-flight,
    // the token will be invalidated and the new manager will be destroyed immediately,
    // ensuring the microphone hardware is always released.
    const effectToken = crypto.randomUUID();
    const activeTokenRef = { current: effectToken };

    const setup = async () => {
      try {
        if (managerRef.current) {
          if (managerRef.current.channelId !== voiceChannelId) {
            console.log(
              `[voice] Logical hardware transition to channel: ${voiceChannelId}`,
            );
            managerRef.current.channelId = voiceChannelId;
            for (const peerId of [...managerRef.current.peers.keys()]) {
              managerRef.current.disconnectPeer(peerId);
            }
          }
          managerRef.current.setMuted(muted);
          managerRef.current.setDeafened(deafened);
          return;
        }

        console.log(
          "[voice] Creando manager por primera vez y encendiendo hardware...",
        );
        const manager = createManager(localPeerId, voiceChannelId);

        // Apply current topology to the newly created manager!
        manager.setTopology(networkTopology, sfuHostId);

        const localStream = await manager.startMicrophone();

        if (manager.micHardwareError) {
          setMicHardwareError(true);
          setMicErrorMessage(manager.micErrorMessage);
          notificationManager.showToast(
            t("voice.listenOnlyNotice", "Solo escuchar (Mic ocupado)"),
            manager.micErrorMessage || t("voice.micErrorFallback", "Error en el micrófono"),
            "warning"
          );
        } else {
          setMicHardwareError(false);
          setMicErrorMessage(null);
        }

        // Atomic check: was this effect cancelled while the mic was being acquired?
        if (activeTokenRef.current !== effectToken) {
          console.warn("[voice] Effect was cancelled during mic acquisition. Releasing hardware immediately.");
          manager.destroy();
          return;
        }

        // Publish stream IDs to backend
        let downlinkSpeed = 10;
        if (navigator.connection && typeof navigator.connection.downlink === "number") {
          downlinkSpeed = navigator.connection.downlink;
        }
        await api.updateVoiceStreamIds(localStream.id, null, downlinkSpeed);

        // Final check after the async IPC call
        if (activeTokenRef.current !== effectToken) {
          console.warn("[voice] Effect cancelled during IPC call. Destroying manager.");
          manager.destroy();
          return;
        }

        manager.setMuted(muted);
        manager.setDeafened(deafened);
        managerRef.current = manager;
        window.voiceManager = manager;

        if (pendingSignalsRef.current.length > 0) {
          const signalsToProcess = [...pendingSignalsRef.current];
          pendingSignalsRef.current = [];
          console.log(`[voice] ${signalsToProcess.length} senales encoladas procesadas`);
          for (const item of signalsToProcess) {
            manager.handleSignal(item.fromPeerId, item.signal).catch(console.error);
          }
        }

        if (profileRef.current) {
          const updatedFlame = recordUserInteraction(profileRef.current, serverId);
          if (updatedFlame && window.electronAPI?.saveProfile) {
            profileRef.current.flame = updatedFlame;
            window.electronAPI.saveProfile(profileRef.current);
          }
        }
      } catch (err) {
        if (activeTokenRef.current === effectToken) {
          console.error("[voice] Error fatal de hardware multimedia:", err);
          let friendlyMsg = err?.message || "Could not access microphone";
          if (err?.name === "NotReadableError") {
            friendlyMsg = "El micrófono está siendo ocupado en modo exclusivo por otra aplicación (ej. Discord, OBS, Zoom) o el sistema de audio de Windows no permite acceder a él. Por favor cierra otras apps o verifica tus dispositivos de audio.";
          } else if (err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError") {
            friendlyMsg = "Se denegó el permiso de acceso al micrófono en el sistema o en la aplicación.";
          } else if (err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError") {
            friendlyMsg = "No se encontró ningún micrófono conectado en tu equipo.";
          }
          setError(friendlyMsg);
          await api.leaveVoice();
          setInVoice(false);
        }
      }
    };

    setup();

    return () => {
      // Invalidate the token so any in-flight async operations are cancelled
      activeTokenRef.current = null;
    };
  }, [
    inVoice,
    localPeerId,
    voiceChannelId,
    activeVoiceChannelId,
    serverId,
    createManager,
  ]);

  const membersSignature = useMemo(() => {
    return members
      .map((m) => `${m.peerId}:${m.channelId}`)
      .sort()
      .join("|");
  }, [members]);

  useEffect(() => {
    if (managerRef.current && inVoice) {
      managerRef.current.updatePeerIdentities(members);
    }
  }, [members, inVoice]);

  useEffect(() => {
    if (managerRef.current && inVoice && voiceChannelId) {
      syncPeerConnections(managerRef.current, voiceChannelId).catch(
        console.error,
      );
    }
  }, [membersSignature, inVoice, voiceChannelId, syncPeerConnections, networkTopology]);

  useEffect(() => {
    const inputMode = audioSettings.inputMode || "vad";
    const customPttKb = profile?.keybindings?.find((kb) => kb.action === "push_to_talk");
    const pttHotkey = customPttKb?.shortcut || audioSettings.pttHotkey || "Control";

    if (!inVoice || inputMode !== "ptt" || !managerRef.current) {
      return;
    }

    let isPttActive = false;
    managerRef.current.setMuted(true);

    const handleKeyDown = (e) => {
      if (isTypingInInput(e)) {
        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
          return;
        }
      }

      const parts = [];
      if (e.ctrlKey) parts.push("Ctrl");
      if (e.shiftKey) parts.push("Shift");
      if (e.altKey) parts.push("Alt");
      if (e.metaKey) parts.push("Meta");

      const modifierKeys = ["Control", "Shift", "Alt", "Meta"];
      if (!modifierKeys.includes(e.key)) {
        let mainKey = e.key;
        if (mainKey === " ") mainKey = "Space";
        if (mainKey.length === 1) mainKey = mainKey.toUpperCase();
        parts.push(mainKey);
      }

      const pressedShortcut = parts.join(" + ");

      if (pressedShortcut.toLowerCase() === pttHotkey.toLowerCase()) {
        if (!isPttActive) {
          isPttActive = true;
          managerRef.current?.setMuted(false);
          window.electronAPI?.setVoiceMuted?.(false);
        }
      }
    };

    const handleKeyUp = (e) => {
      const releasedKey = e.key === " " ? "Space" : e.key;
      const checkKey = releasedKey.toLowerCase() === "control" ? "ctrl" : releasedKey.toLowerCase();

      if (pttHotkey.toLowerCase().includes(checkKey)) {
        if (isPttActive) {
          isPttActive = false;
          managerRef.current?.setMuted(true);
          window.electronAPI?.setVoiceMuted?.(true);
        }
      }
    };

    const handleMouseDown = (e) => {
      if (e.button === 1 || e.button >= 3) {
        const parts = [];
        if (e.ctrlKey) parts.push("Ctrl");
        if (e.shiftKey) parts.push("Shift");
        if (e.altKey) parts.push("Alt");
        if (e.metaKey) parts.push("Meta");

        const mouseName = e.button === 1 ? "Mouse3" : `Mouse${e.button + 1}`;
        parts.push(mouseName);

        const pressedShortcut = parts.join(" + ");

        if (pressedShortcut.toLowerCase() === pttHotkey.toLowerCase()) {
          if (!isPttActive) {
            isPttActive = true;
            managerRef.current?.setMuted(false);
            window.electronAPI?.setVoiceMuted?.(false);
          }
        }
      }
    };

    const handleMouseUp = (e) => {
      if (e.button === 1 || e.button >= 3) {
        const mouseName = e.button === 1 ? "mouse3" : `mouse${e.button + 1}`;
        if (pttHotkey.toLowerCase().includes(mouseName)) {
          if (isPttActive) {
            isPttActive = false;
            managerRef.current?.setMuted(true);
            window.electronAPI?.setVoiceMuted?.(true);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mouseup", handleMouseUp);
      if (managerRef.current) {
        managerRef.current.setMuted(muted);
      }
    };
  }, [inVoice, audioSettings.inputMode, audioSettings.pttHotkey, profile?.keybindings, muted]);

  useEffect(() => {
    const manager = managerRef.current;
    if (!manager || !inVoice || !voiceChannelId) return;

    const audio = normalizeAudioSettings(profile?.audio);

    if (typeof manager.applyDeviceSettings === "function") {
      manager.applyDeviceSettings(audio);
    } else if (typeof manager.setPeerVolumes === "function") {
      manager.setPeerVolumes(audio.peerVolumes);
    }

    hardwareRef.current = {
      inputDeviceId: audio.inputDeviceId,
      outputDeviceId: audio.outputDeviceId,
    };
  }, [profile?.audio, inVoice, voiceChannelId]);

  const getPeerVolume = useCallback(
    (peerId) => {
      if (managerRef.current?.getPeerVolume)
        return managerRef.current.getPeerVolume(peerId);
      return getPeerVolumePercent(audioSettings.peerVolumes, peerId);
    },
    [audioSettings.peerVolumes],
  );

  const setPeerVolume = useCallback((peerId, percent) => {
    managerRef.current?.setPeerVolume?.(peerId, percent);
  }, []);

  const getRemoteStream = useCallback((peerId) => {
    return managerRef.current?.getRemoteStream?.(peerId) || null;
  }, []);

  const setLocalVideoStream = useCallback((stream, streamOptions = {}) => {
    if (stream) {
      soundEngine.playCue("start");
    } else if (managerRef.current?.localVideoStream) {
      soundEngine.playCue("stop");
    }
    managerRef.current?.setLocalVideoStream?.(stream, streamOptions);
  }, []);

  const leaveVoice = useCallback(async () => {
    isJoiningChannelRef.current = null;

    notificationManager.trigger("LOCAL_LEFT_VOICE");

    if (managerRef.current) {
      console.log("[voice hook] Purgando hardware multimedia local...");
      managerRef.current.destroy();
      managerRef.current = null;
      window.voiceManager = null;
    }

    await window.electronAPI?.leaveVoice?.();

    setInVoice(false);
    setVoiceChannelId(null);
    setIsStreaming(false);
    await refreshState();
  }, [refreshState]);

  const toggleMute = useCallback(async () => {
    if (micHardwareError && muted) {
      const success = await managerRef.current?.reclaimMicrophone();
      if (success) {
        setMicHardwareError(false);
        setMicErrorMessage(null);
        notificationManager.showToast(
          t("voice.micReclaimedTitle", "Micrófono Restablecido"),
          t("voice.micReclaimedDesc", "Se ha reactivado la captura de micrófono."),
          "success"
        );
      } else {
        const errDesc = managerRef.current?.micErrorMessage || t("voice.micRetryFailed", "No se pudo acceder al micrófono aún.");
        setMicHardwareError(true);
        setMicErrorMessage(errDesc);
        notificationManager.showToast(
          t("voice.listenOnlyNotice", "Solo escuchar (Mic ocupado)"),
          errDesc,
          "warning"
        );
        return;
      }
    }

    const next = !muted;

    setMuted(next);
    managerRef.current?.setMuted(next);

    notificationManager.trigger("LOCAL_MUTE", { isMuted: next });

    let nextDeafened = deafened;
    if (!next && deafened) {
      nextDeafened = false;
      setDeafened(false);
      managerRef.current?.setDeafened(false);
      await window.electronAPI?.setVoiceDeafened?.(false);
    }

    await window.electronAPI?.setVoiceMuted?.(next);
    // NOTE: setVoiceMuted on the backend already emits voice:state -> onVoiceState -> refreshState().
    // Manual getVoiceState() call removed to prevent double render.
  }, [muted, deafened, micHardwareError, t]);

  const toggleDeafen = useCallback(async () => {
    const next = !deafened;

    setDeafened(next);
    managerRef.current?.setDeafened(next);

    notificationManager.trigger("LOCAL_DEAFEN", { isDeafened: next });

    // Deafening always forces mute; undeafening releases the mute lock.
    const nextMute = next; // 'next' is already boolean (result of !deafened)
    setMuted(nextMute);
    managerRef.current?.setMuted(nextMute);

    await window.electronAPI?.setVoiceMuted?.(nextMute);
    await window.electronAPI?.setVoiceDeafened?.(next);
    // NOTE: setVoiceDeafened on the backend already emits voice:state -> onVoiceState -> refreshState().
    // Manual getVoiceState() call removed to prevent double render.
  }, [muted, deafened]);

  const currentSessionKeyRef = useRef(null);

  useEffect(() => {
    if (!activeVoiceChannelId) {
      currentSessionKeyRef.current = null;
      isJoiningChannelRef.current = null;
      return;
    }
    const api = window.electronAPI;
    if (!api) return;

    const sessionKey = `${serverId || ""}:${activeVoiceChannelId}`;
    if (isJoiningChannelRef.current === sessionKey) return;

    let cancelled = false;

    (async () => {
      try {
        isJoiningChannelRef.current = sessionKey;

        if (
          inVoice ||
          managerRef.current ||
          (currentSessionKeyRef.current && currentSessionKeyRef.current !== sessionKey)
        ) {
          managerRef.current?.destroy();
          managerRef.current = null;
          await api.leaveVoice();
        }

        if (!cancelled) {
          const res = await api.joinVoice(activeVoiceChannelId, {
            muted: mutedRef.current,
            deafened: deafenedRef.current,
          });
          if (res?.error) {
            console.warn("[Voice Connection] Could not join voice:", res.error);
            setError(res.error);
            isJoiningChannelRef.current = null;
            return;
          }

          currentSessionKeyRef.current = sessionKey;
          notificationManager.trigger("LOCAL_JOIN_VOICE");

          await refreshState();
        }
      } catch (err) {
        isJoiningChannelRef.current = null;
        if (!cancelled) setError(err.message);
      } finally {
        isJoiningChannelRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeVoiceChannelId, serverId]);

  useEffect(() => {
    const handleSpeakingChange = (e) => {
      const { peerId, isSpeaking, volumeLevel } = e.detail;

      if (peerId === "self" || peerId === localPeerId) {
        window.electronAPI?.sendSpeakingState?.(
          isSpeaking,
          Math.round(volumeLevel || 0),
        );

        const boolSpeaking = Boolean(isSpeaking);
        setMembers((prev) => {
          const selfMember = prev.find((m) => m.isSelf);
          if (!selfMember || Boolean(selfMember.isSpeaking) === boolSpeaking) {
            return prev;
          }
          return prev.map((m) =>
            m.isSelf ? { ...m, isSpeaking: boolSpeaking } : m,
          );
        });
      }
    };

    window.addEventListener("peer-speaking-change", handleSpeakingChange);
    return () => {
      window.removeEventListener("peer-speaking-change", handleSpeakingChange);
    };
  }, [localPeerId]);

  useEffect(() => {
    const handleVideoReady = (e) => {
      const { peerId } = e.detail;
      console.log(
        `[WebRTC] Video track detected and ready for peer: ${peerId}`,
      );

      setMembers((prev) =>
        prev.map((m) =>
          m.peerId === peerId || m.id === peerId
            ? { ...m, _videoTrigger: Date.now() } 
            : m,
        ),
      );
    };

    window.addEventListener("peer-video-update", handleVideoReady);

    return () => {
      window.removeEventListener("peer-video-update", handleVideoReady);
    };
  }, []);

  const reclaimMicrophoneAccess = useCallback(async () => {
    if (!managerRef.current || !inVoice) return;
    console.log("[Voice Hardware] Forzando re-adquisición y reclamo de micrófono...");

    try {
      const success = await managerRef.current.reclaimMicrophone();
      if (success) {
        setMicHardwareError(false);
        setMicErrorMessage(null);
        notificationManager.showToast(
          t("voice.micReclaimedTitle", "Micrófono Restablecido"),
          t("voice.micReclaimedDesc", "Se ha reactivado la captura de micrófono."),
          "success"
        );
      } else {
        const errDesc = managerRef.current.micErrorMessage || t("voice.micRetryFailed", "No se pudo acceder al micrófono aún.");
        setMicHardwareError(true);
        setMicErrorMessage(errDesc);
        notificationManager.showToast(
          t("voice.listenOnlyNotice", "Solo escuchar (Mic ocupado)"),
          errDesc,
          "warning"
        );
      }
    } catch (err) {
      console.error("[Voice Hardware] Error al reclamar micrófono:", err);
    }
  }, [inVoice, t]);

  return useMemo(
    () => ({
      inVoice,
      voiceChannelId,
      muted,
      deafened,
      isStreaming,
      members,
      error,
      micHardwareError,
      micErrorMessage,
      leaveVoice,
      toggleMute,
      toggleDeafen,
      getPeerVolume,
      setPeerVolume,
      getRemoteStream,
      setLocalVideoStream,
      setIsStreaming,
      reclaimMicrophoneAccess,
      managerRef,
      networkTopology,
      sfuHostId,
      localPeerId,
    }),
    [
      inVoice,
      voiceChannelId,
      muted,
      deafened,
      isStreaming,
      members,
      error,
      micHardwareError,
      micErrorMessage,
      leaveVoice,
      toggleMute,
      toggleDeafen,
      getPeerVolume,
      setPeerVolume,
      getRemoteStream,
      setLocalVideoStream,
      setIsStreaming,
      reclaimMicrophoneAccess,
      networkTopology,
      sfuHostId,
      localPeerId,
    ]
  );
}
