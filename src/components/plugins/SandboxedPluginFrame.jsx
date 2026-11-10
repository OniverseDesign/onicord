import { useEffect, useRef, useCallback } from "react";

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

  const handleIframeLoad = useCallback(() => {
    const iframeWin = iframeRef.current?.contentWindow;
    if (!iframeWin || !widget) return;

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
  ]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={widget?.htmlContent || undefined}
      src={!widget?.htmlContent ? (widget?.entryUrl || widget?.url) : undefined}
      onLoad={handleIframeLoad}
      sandbox="allow-scripts allow-same-origin"
      className={className}
      style={style}
    />
  );
}
