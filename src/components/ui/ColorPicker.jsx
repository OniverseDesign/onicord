import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { APP_COLORS } from "../../lib/colors";
import MaterialIcon from "../icons/MaterialIcon";

// Static style block to prevent re-processing styles on render iterations
const RainbowStyles = () => (
  <style>{`
    @keyframes color-picker-rainbow {
      0% { filter: hue-rotate(0deg); }
      100% { filter: hue-rotate(360deg); }
    }
    .color-picker-cycle {
      animation: color-picker-rainbow 8s linear infinite;
    }
  `}</style>
);

export default function ColorPicker({
  selectedColor,
  onSelectColor,
  showStructures = false,
}) {
  const { t } = useTranslation();
  const customColorInputRef = useRef(null);

  // Helper to normalize strings for robust comparison (e.g. ignoring space differences in rgb values)
  const cleanStr = (str) => str?.replace(/\s+/g, "") || "";

  // Check if selected color is one of our predefined colors
  const isPredefined = Object.values(APP_COLORS).some(
    (info) =>
      selectedColor === info.key ||
      selectedColor === info.colorVar ||
      selectedColor === info.rgbVar ||
      cleanStr(selectedColor) === cleanStr(info.colorVar) ||
      cleanStr(selectedColor) === cleanStr(`rgb(${info.rawRgb})`)
  );

  const isCustomColor = selectedColor && !isPredefined;

  const handleCustomColorClick = () => {
    if (customColorInputRef.current) {
      customColorInputRef.current.click();
    }
  };

  const handleCustomColorChange = (e) => {
    const val = e.target.value;
    onSelectColor("custom", {
      key: "custom",
      name: t("settings.theme.customColor", "Personalizado"),
      colorVar: val,
      rgbVar: val,
      isLight: true,
    });
  };

  return (
    <div className="flex flex-wrap gap-2.5">
      <RainbowStyles />

      {Object.entries(APP_COLORS).map(([key, info]) => {
        // Skip structural theme layers if requested
        if (info.isStructure && !showStructures) {
          return null;
        }

        // Determine if this swatch is selected
        const isSelected =
          !isCustomColor &&
          (selectedColor === key ||
            selectedColor === info.colorVar ||
            selectedColor === info.rgbVar ||
            cleanStr(selectedColor) === cleanStr(info.colorVar) ||
            cleanStr(selectedColor) === cleanStr(`rgb(${info.rawRgb})`));

        // Determine background display style
        const bgStyle = info.isStructure
          ? info.colorVar
          : `rgb(${info.rawRgb})`;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onSelectColor(key, info)}
            className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all border duration-100 hover:scale-105 active:scale-95 ${
              isSelected
                ? "border-white scale-105 ring-2 ring-white/10"
                : "border-white/10 hover:border-white/30"
            }`}
            style={{ backgroundColor: bgStyle }}
            title={info.name}
            aria-label={info.name}
            aria-pressed={isSelected}
          >
            {isSelected && (
              <MaterialIcon
                name="check"
                size={14}
                className={info.isLight ? "text-onicord-dark" : "text-white"}
              />
            )}
          </button>
        );
      })}

      {/* Invisible custom input */}
      <input
        ref={customColorInputRef}
        type="color"
        value={isCustomColor ? selectedColor : "#7f849c"}
        onChange={handleCustomColorChange}
        className="sr-only"
        id="custom-color-picker"
      />

      {/* Color wheel swatch for custom hex */}
      <button
        type="button"
        onClick={handleCustomColorClick}
        className={`w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-all border duration-100 hover:scale-105 active:scale-95 relative overflow-hidden ${
          isCustomColor
            ? "border-white scale-105 ring-2 ring-white/10"
            : "border-white/10 hover:border-white/30 color-picker-cycle"
        }`}
        style={{
          backgroundColor: isCustomColor ? selectedColor : "#ff0055",
        }}
        title={t("settings.theme.customColor", "Color personalizado")}
        aria-label={t("settings.theme.customColor", "Color personalizado")}
        aria-pressed={isCustomColor}
      >
        <MaterialIcon
          name={isCustomColor ? "check" : "palette"}
          size={14}
          className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
        />
      </button>
    </div>
  );
}
