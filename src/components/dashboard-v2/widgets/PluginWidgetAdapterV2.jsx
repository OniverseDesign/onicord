import { useEffect, useRef } from "react";
import SandboxedPluginFrame from "../../plugins/SandboxedPluginFrame";
import { useWidgetLayout } from "../WidgetLayoutContext";
import WidgetShell from "../primitives/WidgetShell";

export default function PluginWidgetAdapterV2({
  widgetMeta,
  roomCode,
  peerId,
  profile,
  activeGame,
  voiceState,
  serverDetails,
  setCustomBackground,
}) {
  const { cols, rows, widthPx, heightPx, sizeMode, isCustomizing, customizeButtons } =
    useWidgetLayout();
  const frameHostRef = useRef(null);
  const isFrameless = Boolean(widgetMeta?.frameless);

  useEffect(() => {
    const iframe = frameHostRef.current?.querySelector("iframe");
    if (!iframe?.contentWindow) return;
    try {
      iframe.contentWindow.postMessage(
        {
          type: "onicord:widget-layout",
          sizeMode,
          cols,
          rows,
          widthPx,
          heightPx,
        },
        "*"
      );
    } catch {}
  }, [sizeMode, cols, rows, widthPx, heightPx]);

  const frameContent = (
    <div ref={frameHostRef} className="w-full h-full min-h-0 relative overflow-hidden">
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
  );

  if (isFrameless) {
    return (
      <div className="relative w-full h-full min-h-0">
        {isCustomizing && customizeButtons && (
          <div className="absolute top-3 right-3 z-30">{customizeButtons}</div>
        )}
        {frameContent}
      </div>
    );
  }

  return (
    <WidgetShell
      title={widgetMeta?.title || "Widget"}
      headerRight={
        <span className="bento-v2-pill font-mono">
          {widgetMeta?.badgeText || "Addon"}
        </span>
      }
    >
      {frameContent}
    </WidgetShell>
  );
}
