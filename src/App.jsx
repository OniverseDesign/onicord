import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
const ProfileSetup = lazy(() => import("./components/views/ProfileSetup"));
import HomeView from "./components/views/HomeView";
import LoadingScreen from "./components/views/LoadingScreen";
import ToastContainer from "./components/ui/ToastContainer";
const InviteModal = lazy(() => import("./components/modals/InviteModal"));
import ConfirmDialogModal from "./components/modals/ConfirmDialogModal";
import { notificationManager } from "./lib/notificationManager";
import { soundEngine } from "./lib/soundEngine";
import { ACCENT_PALETTE, applyDynamicTheme } from "./lib/colors";
import { getCustomCSSState, applyCustomCSS, getWindowMicaEnabled, applyWindowMica } from "./lib/customCss";
import { VoiceProvider, useGlobalVoice } from "./context/VoiceContext";
import { MusicProvider, useMusicSession } from "./context/MusicContext";
import { WatchPartyProvider, useWatchParty } from "./context/WatchPartyContext";
import { StreamerModeProvider } from "./context/StreamerModeContext";
import { useAppUpdater } from "./hooks/useAppUpdater";
import { initGlobalPlaytimeTracker } from "./lib/playtimeTracker";
import { initCustomEmojisSync } from "./lib/emojiData";
import IconOnicord from "./components/icons/Onicord.svg?react";
import Tooltip from "./components/ui/Tooltip";

// Hook renderer console logs and redirect to OniDiag backend
if (window.electronAPI?.diagLog) {
  const MAX_DIAG_DEPTH = 3;
  const MAX_DIAG_ARRAY_ITEMS = 25;
  const MAX_DIAG_CHARS = 4096;

  const sanitizeForDiag = (val, depth, seen) => {
    if (val === null || val === undefined) return val;
    if (typeof val !== "object") {
      return typeof val === "string" && val.length > MAX_DIAG_CHARS
        ? `${val.slice(0, MAX_DIAG_CHARS)}…`
        : val;
    }
    if (val instanceof Error) {
      return `${val.name}: ${val.message}\nStack: ${val.stack || ""}`.slice(0, MAX_DIAG_CHARS);
    }
    if (typeof HTMLElement !== "undefined" && val instanceof HTMLElement) {
      return `[HTMLElement:${val.tagName}]`;
    }
    if (typeof Event !== "undefined" && val instanceof Event) {
      return `[Event:${val.type}]`;
    }
    if (typeof MediaStream !== "undefined" && val instanceof MediaStream) {
      return `[MediaStream:${val.id}]`;
    }
    if (typeof RTCPeerConnection !== "undefined" && val instanceof RTCPeerConnection) {
      return `[RTCPeerConnection:${val.connectionState}]`;
    }
    if (val instanceof ArrayBuffer || ArrayBuffer.isView(val)) {
      return `[Binary:${val.byteLength}B]`;
    }
    if (seen.has(val)) return "[Circular]";
    if (depth >= MAX_DIAG_DEPTH) {
      return Array.isArray(val) ? `[Array(${val.length})]` : "[Object]";
    }
    seen.add(val);
    if (Array.isArray(val)) {
      const limit = Math.min(val.length, MAX_DIAG_ARRAY_ITEMS);
      const out = new Array(limit);
      for (let i = 0; i < limit; i++) {
        out[i] = sanitizeForDiag(val[i], depth + 1, seen);
      }
      if (val.length > limit) out.push(`… (+${val.length - limit} items)`);
      return out;
    }
    const out = {};
    const keys = Object.keys(val);
    const keyLimit = Math.min(keys.length, 30);
    for (let i = 0; i < keyLimit; i++) {
      const k = keys[i];
      out[k] = sanitizeForDiag(val[k], depth + 1, seen);
    }
    if (keys.length > keyLimit) out.__truncatedKeys = keys.length - keyLimit;
    return out;
  };

  const safeSerialize = (val) => {
    if (val === null) return "null";
    if (val === undefined) return "undefined";
    if (val instanceof Error) {
      const text = `${val.name}: ${val.message}\nStack: ${val.stack || ""}`;
      return text.length > MAX_DIAG_CHARS ? `${text.slice(0, MAX_DIAG_CHARS)}… [truncated]` : text;
    }
    if (typeof val === "object") {
      try {
        const sanitized = sanitizeForDiag(val, 0, new WeakSet());
        if (typeof sanitized === "string") return sanitized;
        const json = JSON.stringify(sanitized);
        return json.length > MAX_DIAG_CHARS ? `${json.slice(0, MAX_DIAG_CHARS)}… [truncated]` : json;
      } catch (e) {
        return `[Serialization Error: ${e.message}]`;
      }
    }
    const str = String(val);
    return str.length > MAX_DIAG_CHARS ? `${str.slice(0, MAX_DIAG_CHARS)}… [truncated]` : str;
  };

  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  let lastDiagKey = "";
  let lastDiagAt = 0;

  const sendDiagLog = (level, args) => {
    if (!import.meta.env.DEV && level === "info") return;
    let msg = args.map(safeSerialize).join(" ");
    if (msg.length > MAX_DIAG_CHARS) {
      msg = `${msg.slice(0, MAX_DIAG_CHARS)}… [truncated]`;
    }
    const now = Date.now();
    const key = `${level}:${msg}`;
    if (key === lastDiagKey && now - lastDiagAt < 1000) {
      return;
    }
    lastDiagKey = key;
    lastDiagAt = now;
    window.electronAPI.diagLog(level, "UI-Console", msg);
  };

  console.log = (...args) => {
    originalLog(...args);
    sendDiagLog("info", args);
  };

  console.warn = (...args) => {
    originalWarn(...args);
    sendDiagLog("warn", args);
  };

  console.error = (...args) => {
    originalError(...args);
    sendDiagLog("error", args);
  };

  window.addEventListener("error", (e) => {
    const msg = e?.message || "";
    if (msg.includes("ResizeObserver loop")) {
      return;
    }
    window.electronAPI.diagLog("error", "UI-Crash", `${msg} at ${e.filename}:${e.lineno}`);
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
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!api?.onFullscreenChange) return;
    return api.onFullscreenChange((full) => setIsFullscreen(Boolean(full)));
  }, [api]);

  useEffect(() => {
    const handleStageFs = (e) => {
      setIsFullscreen(Boolean(e.detail?.isFullscreen));
    };
    const handleDomFs = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    window.addEventListener("onicord:stage-fullscreen-change", handleStageFs);
    document.addEventListener("fullscreenchange", handleDomFs);
    return () => {
      window.removeEventListener("onicord:stage-fullscreen-change", handleStageFs);
      document.removeEventListener("fullscreenchange", handleDomFs);
    };
  }, []);

  if (!api || isFullscreen) return null;
  return (
    <div className="titlebar-drag flex h-[22px] w-full items-center justify-between bg-onicord-mantle px-2 text-xs font-medium text-onicord-text select-none z-titlebar">
      <div className="flex items-center gap-2 p-3 mt-4 pointer-events-none">
        <IconOnicord className="w-16 text-onicord-accent" />
      </div>
      <div className="titlebar-nodrag flex h-full mt-3 pr-2 items-center">
        <Tooltip content={t("common.minimize")} side="bottom">
          <button
            onClick={() => api.minimizeWindow()}
            className="onicord-titlebar-btn"
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
        </Tooltip>
        <Tooltip content={t("common.maximize")} side="bottom">
          <button
            onClick={() => api.maximizeWindow()}
            className="onicord-titlebar-btn"
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
        </Tooltip>
        <Tooltip content={t("common.close")} side="bottom">
          <button
            onClick={() => api.closeWindow()}
            className="onicord-titlebar-btn onicord-titlebar-btn-close"
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
        </Tooltip>
      </div>
    </div>
  );
}

function MediaActivityThrottlingSync() {
  const { inVoice, isStreaming } = useGlobalVoice();
  const { isPlaying: musicPlaying } = useMusicSession();
  const { session: watchPartySession, hasJoined: watchPartyJoined } = useWatchParty();

  useEffect(() => {
    window.electronAPI?.setMediaActivity?.({
      inVoice: Boolean(inVoice),
      isStreaming: Boolean(isStreaming),
      musicPlaying: Boolean(musicPlaying),
      watchPartyActive: Boolean(watchPartySession && watchPartyJoined),
    });
  }, [inVoice, isStreaming, musicPlaying, watchPartySession, watchPartyJoined]);

  return null;
}

export default function App() {
  const { t } = useTranslation();
  useAppUpdater();

  useEffect(() => {
    const cleanup = initGlobalPlaytimeTracker();
    const cleanupEmojis = initCustomEmojisSync();
    return () => {
      cleanup?.();
      cleanupEmojis?.();
    };
  }, []);

  const [profile, setProfile] = useState(null);
  const [servers, setServers] = useState([]);
  const [activeServer, setActiveServer] = useState(null);
  const [screen, setScreen] = useState("home");
  const [readyToMountApp, setReadyToMountApp] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const hasInitialized = useRef(false);

  // Invite modal state: set when a deep link arrives
  const [inviteData, setInviteData] = useState(null); // { code, serverName, memberCount, isAlreadyMember, serverObj }
  const [inviteBusy, setInviteBusy] = useState(false);
  const [diagConsentQueue, setDiagConsentQueue] = useState([]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onDiagConsentRequest) return;
    return api.onDiagConsentRequest((req) => {
      if (!req?.requestId) return;
      setDiagConsentQueue((prev) => [...prev.filter((r) => r.requestId !== req.requestId), req]);
    });
  }, []);

  const activeDiagConsent = diagConsentQueue[0] || null;
  const handleRespondDiagConsent = useCallback(async (approved) => {
    if (!activeDiagConsent?.requestId) return;
    const reqId = activeDiagConsent.requestId;
    setDiagConsentQueue((prev) => prev.filter((r) => r.requestId !== reqId));
    try {
      await window.electronAPI?.respondDiagConsent?.(reqId, Boolean(approved));
    } catch (err) {
      console.error("[DiagConsent] Error responding:", err.message);
    }
  }, [activeDiagConsent]);

  const hasPlayedWakeRef = useRef(false);
  useEffect(() => {
    if (isFadingOut && !hasPlayedWakeRef.current) {
      hasPlayedWakeRef.current = true;
      soundEngine.playCue("wake");
    }
  }, [isFadingOut]);

  const refreshServers = useCallback(async () => {
    try {
      const list = await window.electronAPI.listServers();
      setServers(list || []);
      return list || [];
    } catch (err) {
      console.error("Error al listar servidores:", err);
      return [];
    }
  }, []);

  useEffect(() => {
    const handleRefresh = () => {
      refreshServers();
    };
    window.addEventListener("onicord:refresh-servers", handleRefresh);
    return () => window.removeEventListener("onicord:refresh-servers", handleRefresh);
  }, [refreshServers]);

  useEffect(() => {
    const handleProfileUpdated = (e) => {
      if (!e?.detail) return;
      setProfile((prev) => ({ ...(prev || {}), ...e.detail }));
    };
    window.addEventListener("onicord:profile-updated", handleProfileUpdated);
    const unsubIpcProfile = window.electronAPI?.onProfileUpdated?.((updated) => {
      if (!updated) return;
      const { _isAutoAfk, ...cleanProfile } = updated;
      if (cleanProfile.status && !_isAutoAfk) {
        try {
          localStorage.setItem("onicord_explicit_status", cleanProfile.status);
        } catch (_) {}
      }
      setProfile((prev) => ({ ...(prev || {}), ...cleanProfile }));
    });
    return () => {
      window.removeEventListener("onicord:profile-updated", handleProfileUpdated);
      if (typeof unsubIpcProfile === "function") unsubIpcProfile();
    };
  }, []);

  const handleServerUpdated = useCallback((updatedServer) => {
    if (!updatedServer || !updatedServer.id) return;
    setServers((prev) =>
      prev.map((s) =>
        s.id === updatedServer.id
          ? { ...s, ...updatedServer, savedMembers: updatedServer.savedMembers ?? s.savedMembers }
          : s
      )
    );
    setActiveServer((prev) =>
      prev && prev.id === updatedServer.id
        ? { ...prev, ...updatedServer, savedMembers: updatedServer.savedMembers ?? prev.savedMembers }
        : prev
    );
  }, []);

  const enterServerProcess = useCallback(async (serverObj, currentProfile, isInitialBoot = false) => {
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

      window.electronAPI.setLastServer?.(serverObj.id)?.catch?.(() => {});

      setActiveServer(entered);
      if (!isInitialBoot) {
        setScreen("home");
      }
    } catch (err) {
      console.error("Error al conectar al servidor:", err.message);
      setActiveServer(null);
      if (!isInitialBoot) {
        setScreen("home");
      }
    }
  }, []);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    async function init() {
      const bootStartTime = Date.now();
      const MIN_SPLASH_TIME = window.__ONICORD_DEMO__ ? 300 : 2800; // Duration for wordmark animation to play its entrance and shine cycle once
      const FADE_OUT_DURATION = window.__ONICORD_DEMO__ ? 200 : 400;

      const finishSplash = async () => {
        const elapsed = Date.now() - bootStartTime;
        const remaining = MIN_SPLASH_TIME - elapsed;
        if (remaining > 0) {
          await new Promise((resolve) => setTimeout(resolve, remaining));
        }
        setIsFadingOut(true);
        await new Promise((resolve) => setTimeout(resolve, FADE_OUT_DURATION));
        setShowSplash(false);
      };

      const api = window.electronAPI;
      if (!api) {
        setReadyToMountApp(true);
        await finishSplash();
        return;
      }
      try {
        const [storedProfile, list, lastActive] = await Promise.all([
          api.getProfile(),
          api.listServers(),
          api.getLastServer?.(),
        ]);

        setServers(list || []);

        if (!storedProfile?.nickname) {
          setScreen("profile");
          setReadyToMountApp(true);
          await finishSplash();
          return;
        }
        setProfile(storedProfile);
        if (storedProfile?.general) {
          localStorage.setItem("onicord_general_settings", JSON.stringify(storedProfile.general));
          const isContinuous = storedProfile.general.enableContinuousAnimations !== false;
          document.documentElement.setAttribute("data-continuous-animations", isContinuous ? "true" : "false");
          window.dispatchEvent(
            new CustomEvent("onicord:general-settings-updated", { detail: storedProfile.general })
          );
        }

        const lastActiveId = typeof lastActive === "object" ? lastActive?.id : lastActive;
        let matched = null;
        if (lastActiveId && list && list.some((s) => s.id === lastActiveId)) {
          matched = list.find((s) => s.id === lastActiveId);
          console.log(
            `[App Init] Triggering primary boot connection for: ${matched.name}`,
          );
          await enterServerProcess(matched, storedProfile, true);
        } else {
          setActiveServer(null);
        }

        // Mount the app view and chat directly behind the splash overlay
        setScreen("home");
        setReadyToMountApp(true);

        await finishSplash();

        // Step 2: Connect remaining servers in the background without blocking UI
        if (api.bootBackgroundServers) {
          api.bootBackgroundServers(storedProfile, matched?.id).catch((err) => {
            console.error("[App Init] Error in bootBackgroundServers:", err);
          });
        }
      } catch (err) {
        console.error("Error en init:", err);
        setReadyToMountApp(true);
        await finishSplash();
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

      const { css: savedCSS, enabled: cssEnabled } = getCustomCSSState();
      if (savedCSS) {
        applyCustomCSS(savedCSS, cssEnabled);
      }

      if (getWindowMicaEnabled()) {
        applyWindowMica(true);
      }

      const savedLineHeight = localStorage.getItem("onicord_chat_line_height") || "1.5";
      document.documentElement.style.setProperty(
        "--onicord-chat-line-height",
        savedLineHeight
      );

      const savedZoom = localStorage.getItem("onicord_zoom_level");
      if (savedZoom) {
        document.documentElement.style.zoom = Number(savedZoom) / 100;
        document.body.style.zoom = "";
      }

      try {
        const genRaw = localStorage.getItem("onicord_general_settings");
        if (genRaw) {
          const gen = JSON.parse(genRaw);
          const isContinuous = gen.enableContinuousAnimations !== false;
          document.documentElement.setAttribute("data-continuous-animations", isContinuous ? "true" : "false");
        }
      } catch (_) {
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
      document.documentElement.style.zoom = Number(zoom) / 100;
      document.body.style.zoom = "";
      localStorage.setItem("onicord_zoom_level", String(zoom));
      notificationManager.setSettings(profile.general);
    } else {
      document.documentElement.style.zoom = "1";
      document.body.style.zoom = "";
      notificationManager.setSettings(null);
    }
  }, [profile?.general]);

  // handleDeepLinkJoin: show the InviteModal instead of joining directly
  const handleDeepLinkJoin = useCallback(
    async (rawCodeOrToken) => {
      if (!profile) return;
      const str = String(rawCodeOrToken || "").trim();
      const hashIdx = str.indexOf("#");
      const codePart = hashIdx >= 0 ? str.slice(0, hashIdx) : str;
      const rawSecret = hashIdx >= 0 ? str.slice(hashIdx + 1).trim() : null;
      const isManagedInvite = Boolean(rawSecret && rawSecret.startsWith("I:"));
      const inviteSecret = isManagedInvite ? rawSecret.slice(2).trim() : null;
      const roomSecret = !isManagedInvite && rawSecret ? rawSecret : null;
      const normalized = codePart.replace(/[^a-fA-F0-9]/g, "").toUpperCase().slice(0, 8);
      if (normalized.length !== 8) return;

      const alreadyMember = servers.find((s) => s.roomCode === normalized);

      // 1. Fetch initial details (cached/fallback) from main process
      try {
        const initialDetails = await window.electronAPI.resolveInvite(normalized, profile, inviteSecret);

        setInviteData({
          code: normalized,
          roomSecret: roomSecret || null,
          inviteSecret: inviteSecret || null,
          serverName: initialDetails.name || alreadyMember?.name || `Servidor ${normalized}`,
          serverAvatar: initialDetails.icon || alreadyMember?.icon || null,
          memberCount: initialDetails.memberCount || 0,
          onlineCount: 0,
          expiresAt: initialDetails.expiresAt || null,
          errorReason: initialDetails.errorReason || null,
          isAlreadyMember: Boolean(alreadyMember),
          serverObj: alreadyMember || null,
        });
      } catch (err) {
        console.error("Error resolving invite initially:", err);
        setInviteData({
          code: normalized,
          roomSecret: roomSecret || null,
          inviteSecret: inviteSecret || null,
          serverName: alreadyMember?.name || `Servidor ${normalized}`,
          serverAvatar: alreadyMember?.icon || null,
          memberCount: 0,
          onlineCount: 0,
          expiresAt: null,
          errorReason: null,
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
      } else if (inviteData.inviteSecret && window.electronAPI.redeemServerInvite) {
        const res = await window.electronAPI.redeemServerInvite(
          inviteData.code,
          inviteData.inviteSecret,
          profile
        );
        if (!res?.ok || !res.server) {
          setInviteData((prev) => (prev ? { ...prev, errorReason: res?.reason || "INVALID" } : null));
          return;
        }
        const server = res.server;
        setInviteData(null);
        await refreshServers();
        await enterServerProcess(server, profile);
        notificationManager.showToast(
          t("common.done", "Listo"),
          t("inviteModal.joinedSuccess", { name: server.name, defaultValue: `Te has unido a ${server.name}` }),
          "info"
        );
      } else {
        // New server — join then navigate
        const server = await window.electronAPI.joinServer(
          inviteData.code,
          inviteData.serverName,
          profile,
          inviteData.roomSecret || null
        );
        setInviteData(null);
        await refreshServers();
        await enterServerProcess(server, profile);
        notificationManager.showToast(
          t("common.done", "Listo"),
          t("inviteModal.joinedSuccess", { name: server.name, defaultValue: `Te has unido a ${server.name}` }),
          "info"
        );
      }
    } catch (err) {
      console.error("Error joining via invite modal:", err);
      notificationManager.showToast(
        t("common.error", "Error"),
        err.message || "Invalid invitation code",
        "warning"
      );
      setInviteData(null);
    } finally {
      setInviteBusy(false);
    }
  }, [inviteData, profile, enterServerProcess, refreshServers, t]);

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

    // Handle direct TCP connection links: onicord://direct:IP:PORT/ROOMCODE(#SECRET)?
    const unsubDirectLink = api.onDirectLink?.(async ({ ip, port, code, roomSecret }) => {
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
          serverObj = await api.joinServer(code, `Servidor ${code}`, profile, roomSecret || null);
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
          expiresAt: details.expiresAt !== undefined ? details.expiresAt : prev.expiresAt,
          errorReason: details.errorReason !== undefined ? details.errorReason : prev.errorReason,
        };
      });
    });

    const unsubServerUpdated = api.on?.("server:updated", handleServerUpdated);

    const unsubPluginToast = api.onPluginShowToast?.((data) => {
      if (!data) return;
      let title = data.title;
      let message = data.message;
      if (data.titleKey) {
        title = t(data.titleKey, data.messageParams || {}, data.title || "Notificación");
      }
      if (data.messageKey) {
        message = t(data.messageKey, data.messageParams || {}, data.message || "");
      }
      notificationManager.showToast(title || "Complemento", message || "", data.type || "info");
    });

    return () => {
      if (unsubscribe) unsubscribe();
      if (unsubDirectLink) unsubDirectLink();
      if (unsubDetails) unsubDetails();
      if (unsubServerUpdated) unsubServerUpdated();
      if (unsubPluginToast) unsubPluginToast();
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
    try {
      const storedProfile = await window.electronAPI.getProfile();
      const list = await window.electronAPI.listServers();
      setProfile(storedProfile);
      setServers(list || []);
      setScreen("home");
    } catch (err) {
      console.error("[Drive Restore] Error reinicializando app:", err);
      setScreen("home");
    }
  }, []);

  return (
    <StreamerModeProvider>
      <VoiceProvider profile={profile}>
        <MusicProvider profile={profile} activeServer={activeServer}>
          <WatchPartyProvider profile={profile} activeServer={activeServer}>
            <MediaActivityThrottlingSync />
            <div className="flex h-full w-full flex-col overflow-hidden bg-onicord-base text-onicord-text relative">
              <TitleBar />
              <div className="flex-1 min-h-0 w-full relative">
                {screen === "profile" ? (
                  <Suspense fallback={<LoadingScreen />}>
                    <ProfileSetup
                      initialProfile={profile}
                      onComplete={handleProfileComplete}
                      onRestoreComplete={handleRestoreComplete}
                    />
                  </Suspense>
                ) : (
                  readyToMountApp && (
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
                  )
                )}
              </div>

              {/* Startup splash overlay: smoothly dissolves over pre-mounted app */}
              {showSplash && (
                <div
                  className={`fixed inset-0 z-overlay-top bg-onicord-base flex items-center justify-center transition-opacity duration-400 ease-out ${
                    isFadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
                  }`}
                >
                  <div className="titlebar-drag absolute top-0 left-0 right-0 h-[22px]" />
                  <LoadingScreen />
                </div>
              )}
            </div>
            <ToastContainer />
            {/* Invite modal — shown when a deep link is received */}
            {inviteData && (
              <Suspense fallback={null}>
                <InviteModal
                  serverName={inviteData.serverName}
                  serverAvatar={inviteData.serverAvatar}
                  memberCount={inviteData.memberCount}
                  onlineCount={inviteData.onlineCount}
                  roomCode={inviteData.code}
                  isAlreadyMember={inviteData.isAlreadyMember}
                  expiresAt={inviteData.expiresAt}
                  errorReason={inviteData.errorReason}
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
              </Suspense>
            )}
            {activeDiagConsent && (
              <ConfirmDialogModal
                isOpen={Boolean(activeDiagConsent)}
                title={t("security.diagConsentTitle", "Solicitud de diagnóstico remoto")}
                message={t(
                  "security.diagConsentMessage",
                  "{{name}} solicita recibir tus registros locales de diagnóstico (OniDiag). Aunque los datos sensibles se sanitizan automáticamente, contienen información técnica de red y errores recientes.",
                  { name: activeDiagConsent.nickname || "Un compañero" }
                )}
                confirmLabel={t("security.diagConsentApprove", "Compartir logs")}
                cancelLabel={t("security.diagConsentReject", "Rechazar")}
                onConfirm={() => handleRespondDiagConsent(true)}
                onCancel={() => handleRespondDiagConsent(false)}
              />
            )}
          </WatchPartyProvider>
        </MusicProvider>
      </VoiceProvider>
    </StreamerModeProvider>
  );
}
