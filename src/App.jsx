import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import ProfileSetup from "./components/views/ProfileSetup";
import HomeView from "./components/views/HomeView";
import LoadingScreen from "./components/views/LoadingScreen";
import ToastContainer from "./components/ui/ToastContainer";
import InviteModal from "./components/modals/InviteModal";
import { notificationManager } from "./lib/notificationManager";
import { soundEngine } from "./lib/soundEngine";
import { ACCENT_PALETTE, applyDynamicTheme } from "./lib/colors";
import { VoiceProvider } from "./context/VoiceContext";
import { MusicProvider } from "./context/MusicContext";
import IconOnicord from "./components/icons/Onicord.svg?react";

// Hook renderer console logs and redirect to OniDiag backend
if (window.electronAPI?.diagLog) {
  const safeSerialize = (val) => {
    if (val === null) return "null";
    if (val === undefined) return "undefined";
    if (val instanceof Error) {
      return `${val.name}: ${val.message}\nStack: ${val.stack}`;
    }
    if (typeof val === "object") {
      try {
        const seen = new WeakSet();
        return JSON.stringify(val, (key, value) => {
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) {
              return "[Circular]";
            }
            seen.add(value);
          }
          return value;
        });
      } catch (e) {
        return `[Serialization Error: ${e.message}]`;
      }
    }
    return String(val);
  };

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args) => {
    originalLog(...args);
    const msg = args.map(safeSerialize).join(" ");
    window.electronAPI.diagLog("info", "UI-Console", msg);
  };

  console.warn = (...args) => {
    originalWarn(...args);
    const msg = args.map(safeSerialize).join(" ");
    window.electronAPI.diagLog("warn", "UI-Console", msg);
  };

  console.error = (...args) => {
    originalError(...args);
    const msg = args.map(safeSerialize).join(" ");
    window.electronAPI.diagLog("error", "UI-Console", msg);
  };

  window.addEventListener("error", (e) => {
    window.electronAPI.diagLog("error", "UI-Crash", `${e.message} at ${e.filename}:${e.lineno}`);
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    const msg = reason instanceof Error ? `${reason.message}\nStack: ${reason.stack}` : String(reason);
    window.electronAPI.diagLog("error", "UI-Crash", `Unhandled Rejection: ${msg}`);
  });
}

function TitleBar() {
  const { t } = useTranslation();
  const api = window.electronAPI;
  if (!api) return null;
  return (
    <div className="titlebar-drag flex h-[22px] w-full items-center justify-between bg-onicord-mantle px-2 text-[12px] font-medium text-onicord-text select-none z-50">
      <div className="flex items-center gap-2 p-3 mt-4 pointer-events-none">
        <IconOnicord className="w-16 text-onicord-accent" />
      </div>
      <div className="titlebar-nodrag flex h-full mt-3 pr-2 items-center">
        <button
          onClick={() => api.minimizeWindow()}
          className="onicord-titlebar-btn"
          title={t("common.minimize")}
        >
          <svg className="w-3 h-3" viewBox="0 0 10 10">
            <path
              d="M1 5H9"
              stroke="currentColor"
              strokeWidth="0.6"
              fill="none"
            />
          </svg>
        </button>
        <button
          onClick={() => api.maximizeWindow()}
          className="onicord-titlebar-btn"
          title={t("common.maximize")}
        >
          <svg className="w-3 h-3" viewBox="0 0 10 10">
            <rect
              x="1.5"
              y="1.5"
              width="7"
              height="7"
              stroke="currentColor"
              strokeWidth="0.6"
              fill="none"
            />
          </svg>
        </button>
        <button
          onClick={() => api.closeWindow()}
          className="onicord-titlebar-btn onicord-titlebar-btn-close"
          title={t("common.close")}
        >
          <svg className="w-3 h-3" viewBox="0 0 10 10">
            <path
              d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"
              stroke="currentColor"
              strokeWidth="0.6"
              fill="none"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [profile, setProfile] = useState(null);
  const [servers, setServers] = useState([]);
  const [activeServer, setActiveServer] = useState(null);
  const [screen, setScreen] = useState("loading");
  const [loading, setLoading] = useState(true);
  const hasInitialized = useRef(false);

  // Invite modal state: set when a deep link arrives
  const [inviteData, setInviteData] = useState(null); // { code, serverName, memberCount, isAlreadyMember, serverObj }
  const [inviteBusy, setInviteBusy] = useState(false);

  const hasPlayedWakeRef = useRef(false);
  useEffect(() => {
    if (!loading && screen !== "loading" && !hasPlayedWakeRef.current) {
      hasPlayedWakeRef.current = true;
      soundEngine.playCue("wake");
    }
  }, [loading, screen]);

  const refreshServers = useCallback(async () => {
    try {
      const list = await window.electronAPI.listServers();
      setServers(list || []);
    } catch (err) {
      console.error("Error al listar servidores:", err);
    }
  }, []);

  const handleServerUpdated = useCallback((updatedServer) => {
    if (!updatedServer || !updatedServer.id) return;
    setServers((prev) =>
      prev.map((s) => (s.id === updatedServer.id ? updatedServer : s))
    );
    setActiveServer((prev) =>
      prev && prev.id === updatedServer.id ? updatedServer : prev
    );
  }, []);

  const enterServerProcess = useCallback(async (serverObj, currentProfile, isInitialBoot = false) => {
    if (isInitialBoot) {
      setLoading(true);
    }
    if (
      document.activeElement &&
      typeof document.activeElement.blur === "function"
    ) {
      document.activeElement.blur();
    }

    try {
      const entered = await window.electronAPI.enterServer(
        serverObj.id,
        currentProfile,
      );

      await window.electronAPI.setLastServer?.(serverObj.id);

      setActiveServer(entered);
      setScreen("home");
    } catch (err) {
      console.error("Error al conectar al servidor:", err.message);
      setActiveServer(null);
      setScreen("home");
    } finally {
      if (isInitialBoot) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    async function init() {
      const api = window.electronAPI;
      if (!api) {
        setScreen("home");
        setLoading(false);
        return;
      }
      try {
        const storedProfile = await api.getProfile();
        const list = await api.listServers();

        setServers(list || []);

        if (!storedProfile?.nickname) {
          setScreen("profile");
          setLoading(false);
          return;
        }
        setProfile(storedProfile);
        if (storedProfile?.general) {
          localStorage.setItem("onicord_general_settings", JSON.stringify(storedProfile.general));
        }

        await new Promise((resolve) => setTimeout(resolve, 50));

        const lastActive = await api.getLastServer?.();
        const lastActiveId = typeof lastActive === "object" ? lastActive?.id : lastActive;
        let matched = null;
        if (lastActiveId && list.some((s) => s.id === lastActiveId)) {
          matched = list.find((s) => s.id === lastActiveId);
          console.log(
            `[App Init] Triggering primary boot connection for: ${matched.name}`,
          );
          await enterServerProcess(matched, storedProfile, true);
        } else {
          setScreen("home");
          setLoading(false);
        }

        // Paso 2: Conectar el resto de servidores en segundo plano de forma no bloqueante
        if (api.bootBackgroundServers) {
          api.bootBackgroundServers(storedProfile, matched?.id).catch((err) => {
            console.error("[App Init] Error in bootBackgroundServers:", err);
          });
        }
      } catch (err) {
        console.error("Error en init:", err);
        setScreen("home");
        setLoading(false);
      }
    }
    init();

    try {
      const savedAccent = localStorage.getItem("onicord_active_accent") || "lavender";
      const savedSat = localStorage.getItem("onicord_bg_saturation");
      const savedLight = localStorage.getItem("onicord_bg_lightness");
      const savedMode = localStorage.getItem("onicord_theme_mode") || "dark";

      applyDynamicTheme({
        accentKeyOrHex: savedAccent,
        saturationPercentage: savedSat !== null ? Number(savedSat) : 50,
        lightnessOffset: savedLight !== null ? Number(savedLight) : 0,
        mode: savedMode,
      });

      const savedCSS = localStorage.getItem("onicord_theme_custom_css") || "";
      if (savedCSS) {
        let styleTag = document.getElementById("onicord-runtime-styles");
        if (!styleTag) {
          styleTag = document.createElement("style");
          styleTag.id = "onicord-runtime-styles";
          document.head.appendChild(styleTag);
        }
        styleTag.innerHTML = savedCSS;
      }

      const savedLineHeight = localStorage.getItem("onicord_chat_line_height") || "1.5";
      document.documentElement.style.setProperty(
        "--onicord-chat-line-height",
        savedLineHeight
      );

      const savedZoom = localStorage.getItem("onicord_zoom_level");
      if (savedZoom) {
        document.documentElement.style.zoom = Number(savedZoom) / 100;
      }
    } catch (err) {
      console.error(
        "[Onicord Theme Initializer] Error hidratando estilos:",
        err,
      );
    }
  }, []);

  useEffect(() => {
    if (profile?.general) {
      const zoom = profile.general.zoomLevel ?? 100;
      document.body.style.zoom = `${zoom}%`;
      notificationManager.setSettings(profile.general);
    } else {
      document.body.style.zoom = "100%";
      notificationManager.setSettings(null);
    }
  }, [profile?.general]);

  // handleDeepLinkJoin: show the InviteModal instead of joining directly
  const handleDeepLinkJoin = useCallback(
    async (code) => {
      if (!profile) return;
      const normalized = code.replace(/[^a-fA-F0-9]/g, "").toUpperCase().slice(0, 8);
      if (normalized.length !== 8) return;

      const alreadyMember = servers.find((s) => s.roomCode === normalized);

      // 1. Fetch initial details (cached/fallback) from main process
      try {
        const initialDetails = await window.electronAPI.resolveInvite(normalized, profile);
        
        setInviteData({
          code: normalized,
          serverName: initialDetails.name || alreadyMember?.name || `Servidor ${normalized}`,
          serverAvatar: initialDetails.icon || alreadyMember?.icon || null,
          memberCount: initialDetails.memberCount || 0,
          onlineCount: 0,
          isAlreadyMember: Boolean(alreadyMember),
          serverObj: alreadyMember || null,
        });
      } catch (err) {
        console.error("Error resolving invite initially:", err);
        setInviteData({
          code: normalized,
          serverName: alreadyMember?.name || `Servidor ${normalized}`,
          serverAvatar: alreadyMember?.icon || null,
          memberCount: 0,
          onlineCount: 0,
          isAlreadyMember: Boolean(alreadyMember),
          serverObj: alreadyMember || null,
        });
      }
    },
    [profile, servers]
  );

  // handleAcceptInvite: actual join/navigate logic triggered by the modal Accept button
  const handleAcceptInvite = useCallback(async () => {
    if (!inviteData || !profile) return;
    setInviteBusy(true);
    try {
      if (window.electronAPI.cancelInviteResolve) {
        window.electronAPI.cancelInviteResolve(inviteData.code);
      }
      if (inviteData.isAlreadyMember && inviteData.serverObj) {
        // Already a member — just connect
        setInviteData(null);
        await enterServerProcess(inviteData.serverObj, profile);
      } else {
        // New server — join then navigate
        const server = await window.electronAPI.joinServer(
          inviteData.code,
          inviteData.serverName,
          profile
        );
        setInviteData(null);
        await refreshServers();
        await enterServerProcess(server, profile);
        notificationManager.showToast(
          "Join completed",
          `Successfully joined ${server.name}`,
          "info"
        );
      }
    } catch (err) {
      console.error("Error joining via invite modal:", err);
      notificationManager.showToast(
        "Error joining",
        err.message || "Invalid invitation code",
        "warning"
      );
      setInviteData(null);
    } finally {
      setInviteBusy(false);
    }
  }, [inviteData, profile, enterServerProcess, refreshServers]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api || !profile) return;

    api.checkPendingDeepLink?.().then((code) => {
      if (code) {
        handleDeepLinkJoin(code);
      }
    });

    const unsubscribe = api.onDeepLink?.((code) => {
      if (code) {
        handleDeepLinkJoin(code);
      }
    });

    // Handle direct TCP connection links: onicord://direct:IP:PORT/ROOMCODE
    const unsubDirectLink = api.onDirectLink?.(async ({ ip, port, code }) => {
      if (!code || !ip || !port) return;
      console.log(`[Direct Link] Recibido enlace directo: ${ip}:${port} / ${code}`);
      try {
        // First join or find the server normally via DHT
        const existingServers = await api.listServers();
        let serverObj = existingServers.find(
          (s) => s.roomCode?.toUpperCase() === code.toUpperCase()
        );
        if (!serverObj) {
          // Not yet a member — join first (DHT will discover it)
          serverObj = await api.joinServer(code, `Servidor ${code}`, profile);
          await refreshServers();
        }
        if (!serverObj) return;

        // Save the direct connection settings so p2pService picks them up
        await api.updateServerSettings(serverObj.id, {
          directConnectionEnabled: true,
          directIP: ip,
          directPort: port,
        });

        notificationManager.showToast(
          "🔗 Conexión Directa",
          `Conectando a ${ip}:${port} via TCP directo...`,
          "info"
        );

        await enterServerProcess(serverObj, profile);
      } catch (err) {
        console.error("[Direct Link] Error al conectar:", err.message);
        notificationManager.showToast("Error", err.message, "warning");
      }
    });

    const unsubDetails = api.onInviteDetailsUpdated?.((details) => {
      setInviteData((prev) => {
        if (!prev || prev.code !== details.roomCode) return prev;
        return {
          ...prev,
          serverName: details.name !== undefined ? details.name : prev.serverName,
          serverAvatar: details.icon !== undefined ? details.icon : prev.serverAvatar,
          memberCount: details.memberCount !== undefined ? details.memberCount : prev.memberCount,
          onlineCount: details.onlineCount !== undefined ? details.onlineCount : prev.onlineCount,
        };
      });
    });

    const unsubServerUpdated = api.on?.("server:updated", handleServerUpdated);

    return () => {
      if (unsubscribe) unsubscribe();
      if (unsubDirectLink) unsubDirectLink();
      if (unsubDetails) unsubDetails();
      if (unsubServerUpdated) unsubServerUpdated();
    };
  }, [profile, handleDeepLinkJoin, enterServerProcess, refreshServers, handleServerUpdated]);

  const handleDeleteAccount = async () => {
    if (window.electronAPI?.deleteAccount) {
      const res = await window.electronAPI.deleteAccount();
      if (res?.success) {
        setProfile(null);
        setServers([]);
        setActiveServer(null);
        setScreen("profile");
      } else {
        console.error("Error al eliminar la cuenta:", res?.error);
      }
    }
  };

  const handleProfileComplete = useCallback(async (savedProfile) => {
    const completeProfile = {
      ...savedProfile,
      id: savedProfile?.id || profile?.id || crypto.randomUUID(),
    };
    setProfile(completeProfile);
    await refreshServers();
    setScreen("home");
  }, [profile?.id, refreshServers]);

  const handleRestoreComplete = useCallback(async () => {
    setLoading(true);
    try {
      const storedProfile = await window.electronAPI.getProfile();
      const list = await window.electronAPI.listServers();
      setProfile(storedProfile);
      setServers(list || []);
      setScreen("home");
    } catch (err) {
      console.error("[Drive Restore] Error reinicializando app:", err);
      setScreen("home");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <VoiceProvider profile={profile}>
      <MusicProvider profile={profile} activeServer={activeServer}>
        {loading || screen === "loading" ? (
          <LoadingScreen />
        ) : (
          <div className="flex h-full w-full flex-col overflow-hidden bg-onicord-base text-onicord-text">
            <TitleBar />
            <div className="flex-1 min-h-0 w-full relative">
              {screen === "profile" ? (
                <ProfileSetup
                  initialProfile={profile}
                  onComplete={handleProfileComplete}
                  onRestoreComplete={handleRestoreComplete}
                />
              ) : (
                <HomeView
                  profile={profile}
                  servers={servers}
                  activeServer={activeServer}
                  setActiveServer={setActiveServer}
                  enterServerProcess={enterServerProcess}
                  refreshServers={refreshServers}
                  onProfileChange={setProfile}
                  onServerUpdated={handleServerUpdated}
                  onDeleteAccount={handleDeleteAccount}
                />
              )}
            </div>
            <ToastContainer />
            {/* Invite modal — shown when a deep link is received */}
            {inviteData && (
              <InviteModal
                serverName={inviteData.serverName}
                serverAvatar={inviteData.serverAvatar}
                memberCount={inviteData.memberCount}
                onlineCount={inviteData.onlineCount}
                roomCode={inviteData.code}
                isAlreadyMember={inviteData.isAlreadyMember}
                busy={inviteBusy}
                onAccept={handleAcceptInvite}
                onClose={() => {
                  if (!inviteBusy) {
                    if (window.electronAPI.cancelInviteResolve) {
                      window.electronAPI.cancelInviteResolve(inviteData.code);
                    }
                    setInviteData(null);
                  }
                }}
              />
            )}
          </div>
        )}
      </MusicProvider>
    </VoiceProvider>
  );
}
