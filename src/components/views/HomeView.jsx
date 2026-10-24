import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import ServerRail from "../navigation/ServerRail";
import RoomView from "./RoomView";
import AddServerModal from "../modals/AddServerModal";
import ContextMenu from "../ui/ContextMenu";
import ServerSettingsModal from "../modals/ServerSettingsModal";
import DeleteServerModal from "../modals/DeleteServerModal";
import HomeDashboard from "../dashboard/HomeDashboard";
import AppSettingsModal from "../modals/AppSettingsModal";
import { IconSettings, Delete } from "../icons/StreamIcons";
import MaterialIcon from "../icons/MaterialIcon";
import { CONFIG_ISLAS, STORAGE_KEY, getCombinedConfigs } from "../dashboard/dashboardConfig";
import { useUnreadTracker } from "../../hooks/useUnreadTracker";
import { useAfkTracker } from "../../hooks/useAfkTracker";
import { useVoiceChannelInfo } from "../../context/VoiceContext";
import { useMusicSession } from "../../context/MusicContext";
import { isTypingInInput, isSingleKeyShortcut } from "../../lib/inputUtils";

export default function HomeView({
  profile,
  servers,
  activeServer,
  setActiveServer,
  enterServerProcess,
  refreshServers,
  onProfileChange,
  onServerUpdated,
  onDeleteAccount,
}) {
  const { t } = useTranslation();
  const { currentVoiceServerId } = useVoiceChannelInfo();
  const [showAddModal, setShowAddModal] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsServer, setSettingsServer] = useState(null);
  const [serverToDelete, setServerToDelete] = useState(null);
  const [isAppSettingsOpen, setIsAppSettingsOpen] = useState(false);
  const [appSettingsInitialSection, setAppSettingsInitialSection] = useState("general");
  const [activeChannelId, setActiveChannelId] = useState(null);

  useEffect(() => {
    const handleOpenAppSettings = (e) => {
      const targetSection = e.detail?.section || "general";
      setAppSettingsInitialSection(targetSection);
      setIsAppSettingsOpen(true);
    };
    window.addEventListener("onicord:open-app-settings", handleOpenAppSettings);
    return () => window.removeEventListener("onicord:open-app-settings", handleOpenAppSettings);
  }, []);
  const [activeView, setActiveView] = useState(() =>
    activeServer ? "server" : "home",
  );

  const [activeGame, setActiveGame] = useState({
    name: null,
    startTime: null,
    cover: null,
  });

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    if (api.getCurrentGame) {
      api.getCurrentGame().then((state) => {
        if (state) setActiveGame(state);
      });
    }

    const unsub = api.onGameActivityChanged?.((gameData) => {
      setActiveGame(gameData);
    });

    return () => unsub?.();
  }, []);

  const explicitStatus = localStorage.getItem("onicord_explicit_status") || profile?.status || "online";

  useAfkTracker(explicitStatus, async (newStatus) => {
    if (window.electronAPI?.saveProfile) {
      try {
        const saved = await window.electronAPI.saveProfile({
          ...profile,
          status: newStatus,
        });
        onProfileChange?.(saved);
      } catch (err) {
        console.error("Error setting AFK status:", err);
      }
    }
  });

  const canonicalizeShortcut = useCallback((str) => {
    if (!str) return "";
    const tokens = str
      .toLowerCase()
      .replace(/\s+/g, "")
      .split("+")
      .filter(Boolean)
      .map((token) => {
        if (token === "control") return "ctrl";
        const m = token.match(/^mouse(\d+)$/);
        if (m) return `mouse${m[1]}`;
        return token;
      });

    const modifierOrder = { ctrl: 1, alt: 2, shift: 3, meta: 4 };
    const modifiers = [];
    const keys = [];

    for (const token of tokens) {
      if (modifierOrder[token]) {
        modifiers.push(token);
      } else {
        keys.push(token);
      }
    }

    modifiers.sort((a, b) => modifierOrder[a] - modifierOrder[b]);
    keys.sort();

    return [...modifiers, ...keys].join("+");
  }, []);

  const lastActionTimeRef = useRef({});

  const executeKeybindingAction = useCallback((action) => {
    const now = Date.now();
    if (lastActionTimeRef.current[action] && now - lastActionTimeRef.current[action] < 120) {
      return;
    }
    lastActionTimeRef.current[action] = now;

    console.log("[Keybindings] Executing action:", action);
    if (action === "open_settings") {
      setIsAppSettingsOpen(true);
    } else if (action === "open_server_settings") {
      if (activeServer) {
        setSettingsServer(activeServer);
        setShowSettings(true);
      }
    } else if (action === "go_to_dashboard") {
      setActiveView("home");
    } else if (action === "switch_server_up") {
      if (servers.length > 0) {
        const currentIndex = servers.findIndex((s) => s.id === activeServer?.id);
        const prevIndex = currentIndex <= 0 ? servers.length - 1 : currentIndex - 1;
        const targetServer = servers[prevIndex];
        if (targetServer) {
          handleSelectServer(targetServer.id);
        }
      }
    } else if (action === "switch_server_down") {
      if (servers.length > 0) {
        const currentIndex = servers.findIndex((s) => s.id === activeServer?.id);
        const nextIndex = currentIndex === -1 || currentIndex === servers.length - 1 ? 0 : currentIndex + 1;
        const targetServer = servers[nextIndex];
        if (targetServer) {
          handleSelectServer(targetServer.id);
        }
      }
    } else if (action === "focus_search") {
      window.dispatchEvent(new CustomEvent("onicord:focus-search"));
    } else if (action === "open_pinned") {
      window.dispatchEvent(new CustomEvent("onicord:open-pinned"));
    } else {
      window.dispatchEvent(new CustomEvent(`onicord:keybind:${action}`));
    }
  }, [activeServer, servers, profile, enterServerProcess, setActiveServer]);

  // Sync keybindings with Main process global hook on mount or change
  useEffect(() => {
    if (Array.isArray(profile?.keybindings) && window.electronAPI?.updateGlobalKeybinds) {
      window.electronAPI.updateGlobalKeybinds(profile.keybindings);
    }
  }, [profile?.keybindings]);

  useEffect(() => {
    const unsubMcp = window.electronAPI?.on?.("onicord:mcp-trigger-action", (data) => {
      if (data?.action) {
        console.log(`[HomeView MCP] Ejecutando acción remota MCP: ${data.action}`);
        executeKeybindingAction(data.action);
      }
    });

    const handleGlobalKeybindData = (data) => {
      if (!data?.action) return;

      // Si el usuario está escribiendo activamente en un input, textarea o chat, bloquear atajos de una sola tecla
      if (isTypingInInput()) {
        const kb = profile?.keybindings?.find((k) => k.action === data.action);
        const shortcut = data.shortcut || kb?.shortcut;
        if (shortcut && isSingleKeyShortcut(shortcut)) {
          console.log(`[HomeView Global] Atajo bloqueado (${shortcut}) porque se está escribiendo en un input.`);
          return;
        }
      }

      console.log(`[HomeView Global] Ejecutando atajo global: ${data.action}`);
      executeKeybindingAction(data.action);
    };

    const unsubGlobal = window.electronAPI?.onGlobalKeybind
      ? window.electronAPI.onGlobalKeybind(handleGlobalKeybindData)
      : window.electronAPI?.on?.("onicord:global-keybind", handleGlobalKeybindData);

    return () => {
      unsubMcp?.();
      unsubGlobal?.();
    };
  }, [executeKeybindingAction, profile?.keybindings]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const isTyping = isTypingInInput(e);

      if (isTyping) {
        // En cualquier input/textarea/contenteditable, atajos de una sola tecla (sin Ctrl/Alt/Meta) quedan bloqueados
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
      if (!pressedShortcut) return;

      const pressedCanonical = canonicalizeShortcut(pressedShortcut);
      const userKb = profile?.keybindings || [];
      const match = userKb.find(
        (kb) => canonicalizeShortcut(kb.shortcut) === pressedCanonical
      );

      if (match) {
        if (isTyping && isSingleKeyShortcut(match.shortcut)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        executeKeybindingAction(match.action);
      }
    };

    const handleGlobalMouseDown = (e) => {
      if (e.button === 1 || e.button >= 3) {
        const parts = [];
        if (e.ctrlKey) parts.push("Ctrl");
        if (e.shiftKey) parts.push("Shift");
        if (e.altKey) parts.push("Alt");
        if (e.metaKey) parts.push("Meta");

        const mouseName = e.button === 1 ? "Mouse3" : `Mouse${e.button + 1}`;
        parts.push(mouseName);

        const pressedShortcut = parts.join(" + ");
        const pressedCanonical = canonicalizeShortcut(pressedShortcut);
        const userKb = profile?.keybindings || [];
        const match = userKb.find(
          (kb) => canonicalizeShortcut(kb.shortcut) === pressedCanonical
        );

        if (match) {
          e.preventDefault();
          e.stopPropagation();
          executeKeybindingAction(match.action);
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown, true);
    window.addEventListener("mousedown", handleGlobalMouseDown, true);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown, true);
      window.removeEventListener("mousedown", handleGlobalMouseDown, true);
    };
  }, [profile?.keybindings, executeKeybindingAction, canonicalizeShortcut]);

  const [mutedServers, setMutedServers] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("onicord_muted_servers") || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("onicord_muted_servers", JSON.stringify(mutedServers));
  }, [mutedServers]);

  const toggleMuteServer = (roomCode) => {
    setMutedServers((prev) => {
      if (prev.includes(roomCode)) {
        return prev.filter((code) => code !== roomCode);
      } else {
        return [...prev, roomCode];
      }
    });
  };

  const sharedMusicState = useMusicSession();

  const { getServerUnreadCount, getChannelUnreadCount, markChannelAsRead } =
    useUnreadTracker(activeServer?.roomCode, activeChannelId, profile?.id);

  const [islas, setIslas] = useState(() => {
    const baseGeometrias = getCombinedConfigs().reduce((acc, curr) => {
      acc[curr.id] = { ...curr.defaultGeo };
      return acc;
    }, {});

    const celdasSeTocan = (g1, g2) => {
      return (
        g1.x < g2.x + g2.w &&
        g1.x + g1.w > g2.x &&
        g1.y < g2.y + g2.h &&
        g1.y + g1.h > g2.y
      );
    };

    const reubicarEnEspacioVacio = (targetGeo, elLayout) => {
      for (let y = 1; y <= 6; y++) {
        for (let x = 1; x <= 12; x++) {
          if (x + targetGeo.w - 1 <= 12 && y + targetGeo.h - 1 <= 6) {
            const espacioOcupado = Object.values(elLayout).some(
              (o) =>
                x < o.x + o.w &&
                x + o.w > o.x &&
                y < o.y + o.h &&
                y + o.h > o.y,
            );
            if (!espacioOcupado)
              return { x, y, w: targetGeo.w, h: targetGeo.h };
          }
        }
      }
      return {
        x: 1,
        y: 1,
        w: Math.min(2, targetGeo.w),
        h: Math.min(2, targetGeo.h),
      };
    };

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsedSaved = JSON.parse(saved);
        let layoutSaneado = {};

        Object.keys(parsedSaved).forEach((key) => {
          const meta = getCombinedConfigs().find((m) => m.id === key) || (key.includes(":") ? { id: key, defaultGeo: { x: 1, y: 1, w: 2, h: 2 } } : null);
          if (!meta) return;

          let geoPropuesta = {
            x: Math.round(parsedSaved[key].x),
            y: Math.round(parsedSaved[key].y),
            w: Math.round(parsedSaved[key].w),
            h: Math.round(parsedSaved[key].h),
          };

          const choca = Object.keys(layoutSaneado).some((yaAceptadoKey) =>
            celdasSeTocan(geoPropuesta, layoutSaneado[yaAceptadoKey]),
          );

          if (choca)
            geoPropuesta = reubicarEnEspacioVacio(geoPropuesta, layoutSaneado);

          layoutSaneado[key] = geoPropuesta;
        });

        return layoutSaneado;
      } catch (e) {
        console.error("[Onicord] Error procesando JSON del Bento:", e);
      }
    }

    return baseGeometrias;
  });

  const [currentConnectedServerId, setCurrentConnectedServerId] = useState(
    activeServer ? activeServer.id : null,
  );

  const [onlinePeers, setOnlinePeers] = useState([]);

  useEffect(() => {
    if (!currentConnectedServerId) {
      setOnlinePeers([]);
      return;
    }

    const fetchSwarmState = () => {
      if (window.electronAPI?.getRoomState) {
        window.electronAPI
          .getRoomState()
          .then((state) => {
            if (state?.peers) {
              setOnlinePeers(state.peers);
            } else {
              setOnlinePeers([]);
            }
          })
          .catch(() => setOnlinePeers([]));
      }
    };

    fetchSwarmState();
    const interval = setInterval(fetchSwarmState, 3000);
    return () => clearInterval(interval);
  }, [currentConnectedServerId]);

  useEffect(() => {
    if (activeServer?.id) {
      setActiveView("server");
      setCurrentConnectedServerId(activeServer.id);
    } else {
      setActiveView("home");
      setCurrentConnectedServerId(null);
    }
  }, [activeServer?.id]);

  const handleSelectServer = async (serverId) => {
    if (!serverId) return;
    const rawId = typeof serverId === "object" ? (serverId.id || serverId.roomCode) : serverId;
    if (!rawId) return;

    const targetIdUpper = String(rawId).trim().toUpperCase();
    const activeIdUpper = String(activeServer?.id || "").trim().toUpperCase();
    const currentConnUpper = String(currentConnectedServerId || "").trim().toUpperCase();

    if (activeIdUpper === targetIdUpper || currentConnUpper === targetIdUpper) {
      const target = servers.find((s) => String(s.id).toUpperCase() === targetIdUpper);
      if (target) setActiveServer(target);
      setCurrentConnectedServerId(target ? target.id : rawId);
      setActiveView("server");
      return;
    }

    const target = servers.find((s) => String(s.id).toUpperCase() === targetIdUpper);
    if (target) {
      sharedMusicState?.setHasJoinedMusic?.(false);
      await enterServerProcess(target, profile);
      setCurrentConnectedServerId(target.id);
      setActiveView("server");
    }
  };

  useEffect(() => {
    const handleSelectServerEvent = (e) => {
      const codeOrId = String(e.detail || "").trim().toUpperCase();
      if (!codeOrId) return;
      const target = servers.find(
        (s) => s.id?.toUpperCase() === codeOrId || s.roomCode?.toUpperCase() === codeOrId
      );
      if (target) {
        handleSelectServer(target.id);
      } else {
        window.electronAPI?.listServers().then((list) => {
          if (Array.isArray(list)) {
            setServers(list);
            const found = list.find(
              (s) => s.id?.toUpperCase() === codeOrId || s.roomCode?.toUpperCase() === codeOrId
            );
            if (found) {
              handleSelectServer(found.id);
            }
          }
        }).catch(console.error);
      }
    };

    window.addEventListener("onicord:select-server", handleSelectServerEvent);
    return () => {
      window.removeEventListener("onicord:select-server", handleSelectServerEvent);
    };
  }, [servers, handleSelectServer]);

  const handleSelectHome = () => {
    if (
      document.activeElement &&
      typeof document.activeElement.blur === "function"
    ) {
      document.activeElement.blur();
    }
    setActiveView("home");
  };

  const handleServerContextMenu = (e, targetServer) => {
    if (e) e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      server: targetServer,
    });
  };

  const handleLeaveRoom = async () => {
    try {
      await window.electronAPI.leaveRoom();
    } catch (err) {}
    sharedMusicState?.setHasJoinedMusic?.(false);
    setCurrentConnectedServerId(null);
    setActiveServer(null);
    setActiveView("home");
  };


  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubBanned = window.electronAPI.on("server:banned", (data) => {
      alert(`Has sido baneado del servidor: ${data.name}`);
      setActiveServer(null);
      refreshServers?.();
    });

    const unsubKicked = window.electronAPI.on("server:kicked", (data) => {
      alert(`Has sido expulsado del servidor: ${data.name}`);
      setActiveServer(null);
      refreshServers?.();
    });

    return () => {
      unsubBanned();
      unsubKicked();
    };
  }, [refreshServers, setActiveServer]);



  const handleUpdateFolders = async (nextFolders) => {
    if (window.electronAPI?.saveProfile) {
      try {
        const saved = await window.electronAPI.saveProfile({
          ...profile,
          serverFolders: nextFolders,
        });
        onProfileChange?.(saved);
      } catch (err) {
        console.error("Error al actualizar carpetas de servidores:", err);
      }
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-onicord-mantle p-3 gap-onicord-gap flex-row font-sans box-border select-none">
      <div className="h-full shrink-0 flex flex-col bg-onicord-base rounded-onicord-outer-p4 border border-onicord-island overflow-hidden">
        <ServerRail
          servers={servers}
          folders={profile?.serverFolders || []}
          onUpdateFolders={handleUpdateFolders}
          activeServerId={activeView === "server" && activeServer ? activeServer.id : null}
          currentVoiceServerId={currentVoiceServerId}
          onSelectHome={handleSelectHome}
          onSelectServer={handleSelectServer}
          onAdd={() => setShowAddModal(true)}
          onServerContextMenu={handleServerContextMenu}
          onOpenAppSettings={() => setIsAppSettingsOpen(true)}
          getServerUnreadCount={getServerUnreadCount}
          mutedServers={mutedServers}
        />
      </div>

      <div className="flex-1 min-w-0 h-full relative flex-shrink overflow-hidden">
        <div
          className={`w-full h-full transition-opacity duration-200 ease-out ${
            activeView === "server" && activeServer
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none absolute inset-0 invisible"
          }`}
        >
          <RoomView
            key={activeServer?.id || "empty-server"}
            profile={profile}
            server={activeServer || servers[0] || {}}
            servers={servers}
            onLeave={handleLeaveRoom}
            onSwitchServer={handleSelectServer}
            onRefreshServers={refreshServers}
            onServerUpdated={onServerUpdated}
            onProfileChange={onProfileChange}
            onOpenAppSettings={() => setIsAppSettingsOpen(true)}
            getChannelUnreadCount={getChannelUnreadCount}
            markChannelAsRead={markChannelAsRead}
            musicState={sharedMusicState} 
            onChannelChange={setActiveChannelId}
          />
        </div>
        <div
          className={`w-full h-full pl-[var(--gap)] box-border overflow-hidden transition-opacity duration-200 ease-out ${
            activeView === "home" || !activeServer
              ? "opacity-100 pointer-events-auto"
              : "opacity-0 pointer-events-none absolute inset-0 invisible"
          }`}
        >
          <HomeDashboard
            profile={profile}
            servers={servers}
            peers={onlinePeers}
            currentConnectedServerId={currentConnectedServerId}
            onAddServer={() => setShowAddModal(true)}
            islas={islas}
            setIslas={setIslas}
            musicState={sharedMusicState}
            activeGame={activeGame}
          />
        </div>
      </div>



      {isAppSettingsOpen && (
        <AppSettingsModal
          profile={profile}
          currentLayout={islas}
          onUpdateLayout={setIslas}
          onSaved={onProfileChange}
          onClose={() => setIsAppSettingsOpen(false)}
          servers={servers}
          activeServerId={activeServer?.id}
          onDeleteAccount={onDeleteAccount}
          initialSection={appSettingsInitialSection}
        />
      )}

      {showAddModal && (
        <AddServerModal
          profile={profile}
          onClose={() => setShowAddModal(false)}
          onCreated={async (newServer) => {
            setShowAddModal(false);
            await refreshServers();
            await enterServerProcess(newServer, profile);
            setCurrentConnectedServerId(newServer.id);
            setActiveView("server");
          }}
        />
      )}
      {showSettings && settingsServer && (
        <ServerSettingsModal
          server={settingsServer}
          peers={onlinePeers} 
          profile={profile}     // CORREGIDO: Le pasamos tu perfil local
          onClose={() => {
            setShowSettings(false);
            setSettingsServer(null);
          }}
          onSaved={async (updatedServer) => {
            if (onServerUpdated) {
              onServerUpdated(updatedServer);
            }
            if (activeServer && activeServer.id === updatedServer.id) {
              setActiveServer(updatedServer);
            }
            await refreshServers();
            setShowSettings(false);
            setSettingsServer(null);
          }}
        />
      )}

      {contextMenu &&
        !showSettings &&
        (() => {
          const { server } = contextMenu;
          let menuItems = [];

          menuItems.push({
            label: t("contextMenu.serverSettings"),
            icon: <IconSettings size="base" />,
            onClick: () => {
              setSettingsServer(server);
              setShowSettings(true);
            },
          });

          const isMuted = mutedServers.includes(server.roomCode);

          menuItems.push({
            label: isMuted ? t("contextMenu.unmuteServer") : t("contextMenu.muteServer"),
            icon: <MaterialIcon name={isMuted ? "notifications_active" : "notifications_off"} size={18} />,
            onClick: () => {
              toggleMuteServer(server.roomCode);
            },
          });

          menuItems.push("SEPARATOR");

          menuItems.push({
            label: server.isOwner ? t("contextMenu.deleteServer") : t("contextMenu.leaveServer"),
            icon: <Delete size="base" />,
            variant: "danger",
            onClick: () => {
              setServerToDelete(server);
            },
          });

          return (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              title={server.name}
              items={menuItems}
              onClose={() => setContextMenu(null)}
            />
          );
        })()}

      {serverToDelete && (
        <DeleteServerModal
          server={serverToDelete}
          onClose={() => setServerToDelete(null)}
          onConfirm={async () => {
            const targetId = serverToDelete.id;
            setServerToDelete(null);

            if (
              document.activeElement &&
              typeof document.activeElement.blur === "function"
            ) {
              document.activeElement.blur();
            }

            const activeConnUpper = String(currentConnectedServerId || "").trim().toUpperCase();
            const targetUpper = String(targetId || "").trim().toUpperCase();

            if (activeConnUpper && targetUpper && activeConnUpper === targetUpper) {
              setCurrentConnectedServerId(null);
              setActiveServer(null);
              await new Promise((resolve) => requestAnimationFrame(resolve));
              await window.electronAPI.leaveRoom().catch(console.error);
            }

            try {
              await window.electronAPI.removeServer(targetId);
              await refreshServers();
            } catch (err) {
              console.error("Error al remover servidor del disco:", err);
            }
          }}
        />
      )}
    </div>
  );
}
