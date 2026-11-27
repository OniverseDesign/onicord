import { useWidgetLayout } from "../WidgetLayoutContext";

export default function LegacyWidgetBridge({ LegacyComponent, widgetProps }) {
  const { sizeMode } = useWidgetLayout();

  if (!LegacyComponent) return null;

  return (
    <div
      data-size-mode={sizeMode}
      className="w-full h-full min-h-0 min-w-0 overflow-hidden"
    >
      <LegacyComponent {...widgetProps} />
    </div>
  );
}
