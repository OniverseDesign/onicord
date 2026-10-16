import { useEffect, useRef } from "react";

export default function PluginWidgetAdapter({
  widgetMeta,
  roomCode,
  peerId,
  profile,
  activeGame,
  voiceState,
  serverDetails,
  setCustomBackground,
}) {
  const iframeRef = useRef(null);
  const permissions = new Set(widgetMeta?.permissions || []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onWidgetP2PData) return;

    const handleP2PMessage = (eventData) => {
      const { fullId, senderPeerId, data } = eventData || {};
      if (fullId === widgetMeta?.fullId && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: "ONICORD_P2P_RECEIVE", senderPeerId, data },
          "*"
        );
      }
    };

    const unsub = api.onWidgetP2PData(handleP2PMessage);
    return unsub;
  }, [widgetMeta?.fullId]);

  const handleIframeLoad = () => {
    const iframeWin = iframeRef.current?.contentWindow;
    if (!iframeWin || !widgetMeta) return;

    iframeWin.OnicordWidgetAPI = {
      meta: {
        roomCode,
        peerId,
        widgetId: widgetMeta.widgetId,
        pluginId: widgetMeta.pluginId,
        type: widgetMeta.type,
      },

      // Permiso: user.profile
      user: {
        getProfile: () => {
          if (!permissions.has("user.profile")) {
            console.warn(`[Widget Security] Permiso "user.profile" denegado para ${widgetMeta.fullId}`);
            return null;
          }
          return {
            nickname: profile?.nickname,
            avatar: profile?.avatar,
            id: profile?.id,
          };
        },
      },

      // Permiso: server.info
      server: {
        getInfo: () => {
          if (!permissions.has("server.info")) {
            console.warn(`[Widget Security] Permiso "server.info" denegado para ${widgetMeta.fullId}`);
            return null;
          }
          return {
            roomCode,
            serverName: serverDetails?.name || "Servidor Onicord",
            memberCount: serverDetails?.memberCount || 1,
          };
        },
      },

      // Permiso: gaming.activity
      gaming: {
        getActivity: () => {
          if (!permissions.has("gaming.activity")) {
            console.warn(`[Widget Security] Permiso "gaming.activity" denegado para ${widgetMeta.fullId}`);
            return null;
          }
          return activeGame || { name: null, startTime: null, cover: null };
        },
      },

      // Permiso: audio.state
      voice: {
        getState: () => {
          if (!permissions.has("audio.state")) {
            console.warn(`[Widget Security] Permiso "audio.state" denegado para ${widgetMeta.fullId}`);
            return null;
          }
          return voiceState || { isConnected: false, isMuted: false, isDeaf: false, peers: [] };
        },
      },

      // Permiso: chat.send
      chat: {
        send: (text) => {
          if (!permissions.has("chat.send")) {
            throw new Error(`[Widget Security] Permiso "chat.send" no declarado en manifest.json`);
          }
          if (window.electronAPI?.execPluginCommand) {
            window.electronAPI.execPluginCommand(text);
          }
        },
      },

      // API de Apariencia y Fondos Dinámicos (Imagen Blureada / Color)
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

      // Permiso: p2p.network (Sincronización P2P en tiempo real)
      p2p: {
        broadcast: (data) => {
          if (widgetMeta.type !== "collaborative" || !permissions.has("p2p.network")) {
            console.warn(`[Widget Security] Transmisión P2P deshabilitada o permiso "p2p.network" no otorgado.`);
            return;
          }
          if (window.electronAPI?.sendWidgetP2PData) {
            window.electronAPI.sendWidgetP2PData({
              pluginId: widgetMeta.pluginId,
              widgetId: widgetMeta.widgetId,
              data,
            });
          }
        },
        onMessage: (callback) => {
          window.addEventListener("message", (e) => {
            if (e.data?.type === "ONICORD_P2P_RECEIVE") {
              callback(e.data.data, e.data.senderPeerId);
            }
          });
        },
      },

      // Permiso: storage
      storage: {
        get: async (key) => {
          if (!permissions.has("storage")) return null;
          const storeKey = `widget_store_${widgetMeta.fullId}_${key}`;
          return localStorage.getItem(storeKey);
        },
        set: async (key, value) => {
          if (!permissions.has("storage")) return;
          const storeKey = `widget_store_${widgetMeta.fullId}_${key}`;
          localStorage.setItem(storeKey, value);
        },
      },
    };

    iframeWin.dispatchEvent(new CustomEvent("onicord:widget-ready"));
  };

  return (
    <div
      style={{ containerType: "inline-size" }}
      className="onicord-widget-shell w-full h-full p-6 flex flex-col justify-between select-none relative z-10"
    >
      {/* Header estandarizado de Onicord */}
      <div className="onicord-widget-header flex justify-between items-center w-full gap-2 mb-2 shrink-0">
        <h3
          style={{ fontSize: "clamp(0.6rem, 3.5cqi, 0.8rem)" }}
          className="onicord-widget-title font-bold text-onicord-text truncate drop-shadow-sm"
        >
          {widgetMeta?.title || "Widget"}
        </h3>
        <span
          style={{ fontSize: "clamp(0.6rem, 3cqi, 0.5rem)" }}
          className="onicord-widget-badge-dynamic shrink-0 px-2 py-0.5 font-medium"
        >
          {widgetMeta?.badgeText || "Addon"}
        </span>
      </div>

      {/* Contenido del Widget (Iframe directo sin contenedor anidado) */}
      <div className="flex-1 w-full min-h-0 relative overflow-hidden mt-1">
        <iframe
          ref={iframeRef}
          srcDoc={widgetMeta?.htmlContent || undefined}
          src={!widgetMeta?.htmlContent ? widgetMeta?.entryUrl : undefined}
          onLoad={handleIframeLoad}
          sandbox="allow-scripts allow-same-origin"
          className="w-full h-full border-none bg-transparent"
        />
      </div>
    </div>
  );
}

PluginWidgetAdapter.widgetId = "plugin_widget_adapter";
PluginWidgetAdapter.badgeText = "Addon Widget";
PluginWidgetAdapter.bgVariant = "dark";
