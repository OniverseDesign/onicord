import SandboxedPluginFrame from "../../plugins/SandboxedPluginFrame";

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

      {/* Contenido del Widget */}
      <div className="flex-1 w-full min-h-0 relative overflow-hidden mt-1">
        <SandboxedPluginFrame
          widget={widgetMeta}
          roomCode={roomCode}
          peerId={peerId}
          profile={profile}
          server={serverDetails}
          voice={voiceState}
          activeGame={activeGame}
          type="dashboard"
          setCustomBackground={setCustomBackground}
        />
      </div>
    </div>
  );
}

PluginWidgetAdapter.widgetId = "plugin_widget_adapter";
PluginWidgetAdapter.badgeText = "Addon Widget";
PluginWidgetAdapter.bgVariant = "dark";
