import { useEffect, useRef, useCallback } from "react";

const THEME_VARS_TO_SYNC = [
  "--onicord-text",
  "--onicord-subtext",
  "--onicord-muted",
  "--onicord-faded",
  "--onicord-text-dark",
  "--onicord-text-dark-sub",
  "--onicord-text-dark-muted",
  "--onicord-bg-base",
  "--onicord-bg-surface",
  "--onicord-bg-mantle",
  "--onicord-bg-overlay",
  "--onicord-lavender",
  "--onicord-accent",
  "--onicord-danger",
  "--onicord-success",
  "--onicord-sapphire",
  "--onicord-tint-rgb",
  "--onicord-border",
  "--onicord-on-accent",
  "--onicord-on-danger",
];

function getThemeSnapshot() {
  const root = document.documentElement;
  const computed = getComputedStyle(root);
  const isLight = root.classList.contains("light-mode");
  const get = (name) => computed.getPropertyValue(name).trim();
  return {
    mode: isLight ? "light" : "dark",
    accent: get("--onicord-accent"),
    text: get("--onicord-text"),
    subtext: get("--onicord-subtext"),
    muted: get("--onicord-muted"),
    base: `rgb(${get("--onicord-bg-base")})`,
    surface: `rgb(${get("--onicord-bg-surface")})`,
    mantle: `rgb(${get("--onicord-bg-mantle")})`,
    overlay: `rgb(${get("--onicord-bg-overlay")})`,
    border: get("--onicord-border"),
    onAccent: get("--onicord-on-accent"),
  };
}

/**
 * SandboxedPluginFrame: Unified, secure sandbox frame for Onicord plugins
 * (Bento Dashboard Widgets, Room Right-Sidebar Plugin Islands, and Stage Addons).
 */
export default function SandboxedPluginFrame({
  widget,
  roomCode = "",
  peerId = "",
  profile = null,
  server = null,
  voice = null,
  activeGame = null,
  type = "widget",
  onActivity,
  onIframeClick,
  onSummaryChange,
  setCustomBackground,
  className = "w-full h-full border-none bg-transparent",
  style = {},
}) {
  const iframeRef = useRef(null);
  const p2pListenersRef = useRef(new Set());
  const themeListenersRef = useRef(new Set());
  const onActivityRef = useRef(onActivity);

  useEffect(() => {
    onActivityRef.current = onActivity;
  }, [onActivity]);

  const widgetId = widget?.widgetId || widget?.id || "plugin-widget";
  const pluginId = widget?.pluginId || "unknown-plugin";
  const fullId = widget?.fullId || `${pluginId}:${widgetId}`;
  const permissions = new Set(
    widget?.permissions || [
      "p2p.network",
      "storage",
      "user.profile",
      "server.info",
      "chat.send",
    ]
  );

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onWidgetP2PData) return;

    const handleP2PMessage = (eventData) => {
      const {
        pluginId: msgPluginId,
        widgetId: msgWidgetId,
        fullId: msgFullId,
        senderPeerId,
        data,
      } = eventData || {};

      const matches =
        (msgPluginId === pluginId && msgWidgetId === widgetId) ||
        msgFullId === fullId ||
        msgPluginId === pluginId;

      if (matches) {
        if (iframeRef.current?.contentWindow) {
          try {
            iframeRef.current.contentWindow.postMessage(
              { type: "ONICORD_P2P_RECEIVE", senderPeerId, data },
              "*"
            );
          } catch (_) {}
        }

        p2pListenersRef.current.forEach((cb) => {
          try {
            cb(data, senderPeerId);
          } catch (err) {
            console.error("[SandboxedPluginFrame] Error in p2p listener callback:", err);
          }
        });

        onActivityRef.current?.(data, senderPeerId);
      }
    };

    const unsub = api.onWidgetP2PData(handleP2PMessage);
    return unsub;
  }, [pluginId, widgetId, fullId]);

  const syncThemeToIframe = useCallback(() => {
    const iframeEl = iframeRef.current;
    const iframeWin = iframeEl?.contentWindow;
    if (!iframeWin) return getThemeSnapshot();

    const snapshot = getThemeSnapshot();
    const isLight = snapshot.mode === "light";

    try {
      const iframeDocEl = iframeWin.document?.documentElement;
      if (iframeDocEl) {
        const parentComputed = getComputedStyle(document.documentElement);
        for (const varName of THEME_VARS_TO_SYNC) {
          const val = parentComputed.getPropertyValue(varName).trim();
          if (val) iframeDocEl.style.setProperty(varName, val);
        }

        if (isLight) {
          iframeDocEl.classList.add("light-mode");
          iframeDocEl.setAttribute("data-theme", "light");
        } else {
          iframeDocEl.classList.remove("light-mode");
          iframeDocEl.removeAttribute("data-theme");
        }

        // Keep parent & iframe color-scheme aligned so Chromium preserves transparency
        iframeDocEl.style.colorScheme = snapshot.mode;
        iframeEl.style.colorScheme = snapshot.mode;
      }
    } catch (_) {}

    return snapshot;
  }, []);

  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      const snapshot = syncThemeToIframe();
      const iframeWin = iframeRef.current?.contentWindow;
      themeListenersRef.current.forEach((cb) => {
        try {
          cb(snapshot);
        } catch (_) {}
      });
      if (iframeWin) {
        try {
          iframeWin.postMessage({ type: "ONICORD_THEME_CHANGE", theme: snapshot }, "*");
          iframeWin.dispatchEvent(new CustomEvent("onicord:theme-change", { detail: snapshot }));
        } catch (_) {}
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    return () => observer.disconnect();
  }, [syncThemeToIframe]);

  const handleIframeLoad = useCallback(() => {
    const iframeEl = iframeRef.current;
    const iframeWin = iframeEl?.contentWindow;
    if (!iframeWin || !widget) return;

    syncThemeToIframe();

    if (onIframeClick) {
      try {
        iframeWin.addEventListener("click", () => onIframeClick());
        iframeWin.addEventListener("pointerdown", () => onIframeClick());
      } catch (_) {}
    }

    const effectiveRoomCode = roomCode || server?.roomCode || "";
    const effectivePeerId = peerId || profile?.id || "local";

    iframeWin.OnicordWidgetAPI = {
      meta: {
        roomCode: effectiveRoomCode,
        peerId: effectivePeerId,
        widgetId,
        pluginId,
        type,
      },

      user: {
        getProfile: () => {
          if (!permissions.has("user.profile")) {
            console.warn(`[Plugin Security] Permiso "user.profile" denegado para ${fullId}`);
            return null;
          }
          return {
            nickname: profile?.nickname || "Usuario",
            avatar: profile?.avatar || null,
            id: profile?.id || effectivePeerId,
          };
        },
      },

      server: {
        getInfo: () => {
          if (!permissions.has("server.info")) {
            console.warn(`[Plugin Security] Permiso "server.info" denegado para ${fullId}`);
            return null;
          }
          return {
            roomCode: effectiveRoomCode,
            serverName: server?.name || "Servidor Onicord",
            memberCount: server?.memberCount || 1,
          };
        },
      },

      gaming: {
        getActivity: () => {
          if (!permissions.has("gaming.activity")) {
            console.warn(`[Plugin Security] Permiso "gaming.activity" denegado para ${fullId}`);
            return null;
          }
          return activeGame || { name: null, startTime: null, cover: null };
        },
      },

      voice: {
        getState: () => {
          if (!permissions.has("audio.state")) {
            console.warn(`[Plugin Security] Permiso "audio.state" denegado para ${fullId}`);
            return null;
          }
          return voice || { isConnected: false, isMuted: false, isDeaf: false, peers: [] };
        },
      },

      chat: {
        send: (text) => {
          if (!permissions.has("chat.send")) {
            console.warn(`[Plugin Security] Permiso "chat.send" denegado para ${fullId}`);
            return;
          }
          if (window.electronAPI?.execPluginCommand) {
            window.electronAPI.execPluginCommand(text);
          }
        },
      },

      island: {
        setSummary: (text) => {
          if (typeof text === "string" && text.trim()) {
            onSummaryChange?.(text.trim());
          }
        },
      },

      ui: {
        setBackground: (bgData) => {
          if (typeof setCustomBackground === "function") {
            setCustomBackground(bgData);
          }
        },
        clearBackground: () => {
          if (typeof setCustomBackground === "function") {
            setCustomBackground(null);
          }
        },
      },

      p2p: {
        broadcast: (data) => {
          if (!permissions.has("p2p.network")) {
            console.warn(`[Plugin Security] Permiso "p2p.network" no otorgado para ${fullId}`);
            return;
          }
          onActivityRef.current?.(data, "local");
          if (window.electronAPI?.sendWidgetP2PData) {
            window.electronAPI.sendWidgetP2PData({
              pluginId,
              widgetId,
              data,
            });
          }
        },
        onMessage: (callback) => {
          if (typeof callback !== "function") return () => {};
          p2pListenersRef.current.add(callback);
          const handler = (e) => {
            if (e.data?.type === "ONICORD_P2P_RECEIVE") {
              callback(e.data.data, e.data.senderPeerId);
            }
          };
          iframeWin.addEventListener("message", handler);
          return () => {
            try {
              p2pListenersRef.current.delete(callback);
              iframeWin.removeEventListener("message", handler);
            } catch (_) {}
          };
        },
      },

      storage: {
        get: async (key) => {
          if (!permissions.has("storage")) return null;
          const storeKey = `widget_store_${fullId}_${key}`;
          return localStorage.getItem(storeKey);
        },
        set: async (key, value) => {
          if (!permissions.has("storage")) return;
          const storeKey = `widget_store_${fullId}_${key}`;
          localStorage.setItem(storeKey, value);
        },
      },

      theme: {
        getMode: () => getThemeSnapshot().mode,
        getTokens: () => getThemeSnapshot(),
        onChange: (callback) => {
          if (typeof callback !== "function") return () => {};
          themeListenersRef.current.add(callback);
          return () => themeListenersRef.current.delete(callback);
        },
      },
    };

    iframeWin.dispatchEvent(new CustomEvent("onicord:widget-ready"));
  }, [
    widget,
    onIframeClick,
    roomCode,
    server,
    peerId,
    profile,
    widgetId,
    pluginId,
    type,
    permissions,
    fullId,
    activeGame,
    voice,
    onSummaryChange,
    setCustomBackground,
    syncThemeToIframe,
  ]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={widget?.htmlContent || undefined}
      src={!widget?.htmlContent ? (widget?.entryUrl || widget?.url) : undefined}
      onLoad={handleIframeLoad}
      sandbox="allow-scripts allow-same-origin"
      className={className}
      style={{ colorScheme: "normal", ...style }}
    />
  );
}
