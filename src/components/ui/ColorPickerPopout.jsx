import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import Tooltip from "./Tooltip";
import { cn } from "../../lib/cn";
import { soundEngine } from "../../lib/soundEngine";

const DEFAULT_HEX = "#7f849c";

const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

/**
 * Normalizes a CSS hex or rgb(...) string into a lowercase #rrggbb string.
 */
function normalizeHex(value, fallback = DEFAULT_HEX) {
  if (!value || typeof value !== "string") return fallback;
  const trimmed = value.trim().toLowerCase();

  const hex6 = /^#([0-9a-f]{6})$/.exec(trimmed);
  if (hex6) return `#${hex6[1]}`;

  const hex3 = /^#([0-9a-f]{3})$/.exec(trimmed);
  if (hex3) {
    const [r, g, b] = hex3[1];
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  const rgbMatch = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/.exec(
    trimmed
  );
  if (rgbMatch) {
    return rgbToHex(
      clamp(Number(rgbMatch[1]), 0, 255),
      clamp(Number(rgbMatch[2]), 0, 255),
      clamp(Number(rgbMatch[3]), 0, 255)
    );
  }

  return fallback;
}

function hexToRgb(hex) {
  const clean = normalizeHex(hex).slice(1);
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function rgbToHex(r, g, b) {
  const toHex = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsv(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let rn = 0;
  let gn = 0;
  let bn = 0;

  if (h < 60) {
    rn = c;
    gn = x;
  } else if (h < 120) {
    rn = x;
    gn = c;
  } else if (h < 180) {
    gn = c;
    bn = x;
  } else if (h < 240) {
    gn = x;
    bn = c;
  } else if (h < 300) {
    rn = x;
    bn = c;
  } else {
    rn = c;
    bn = x;
  }

  return [
    Math.round((rn + m) * 255),
    Math.round((gn + m) * 255),
    Math.round((bn + m) * 255),
  ];
}

function hsvToHex(h, s, v) {
  const [r, g, b] = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

/**
 * Returns true when a hex color is perceptually light (for contrasting icon/text color).
 */
export function isLightHex(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

/**
 * Converts a space-separated RGB string (e.g. "180 190 254") to lowercase #rrggbb.
 */
export function rgbStringToHex(rawRgb) {
  if (!rawRgb || typeof rawRgb !== "string") return DEFAULT_HEX;
  const parts = rawRgb.trim().split(/[\s,]+/).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) {
    return DEFAULT_HEX;
  }
  return rgbToHex(parts[0], parts[1], parts[2]);
}

/**
 * Custom Onicord Color Picker Popout component.
 * Replaces native <input type="color"> with a portal-rendered HSV + HEX + EyeDropper popout.
 */
export default function ColorPickerPopout({
  value = DEFAULT_HEX,
  onChange,
  children,
  side = "bottom",
  align = "start",
  presets = null,
  disabled = false,
  className = "",
  stopDragPropagation = false,
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [hsv, setHsv] = useState(() => {
    const [r, g, b] = hexToRgb(normalizeHex(value));
    return rgbToHsv(r, g, b);
  });
  const [hexInput, setHexInput] = useState(() => normalizeHex(value).toUpperCase());
  const [isInputFocused, setIsInputFocused] = useState(false);

  const triggerRef = useRef(null);
  const popoutRef = useRef(null);
  const svAreaRef = useRef(null);
  const hueBarRef = useRef(null);

  const currentHex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const supportsEyeDropper =
    typeof window !== "undefined" && typeof window.EyeDropper === "function";

  // Sync internal HSV when external value changes meaningfully (preserving hue at s=0 or v=0)
  useEffect(() => {
    const normalized = normalizeHex(value);
    setHsv((prev) => {
      if (hsvToHex(prev.h, prev.s, prev.v) === normalized) return prev;
      const [r, g, b] = hexToRgb(normalized);
      return rgbToHsv(r, g, b);
    });
  }, [value]);

  // Keep HEX input synced with active color while not actively typing
  useEffect(() => {
    if (!isInputFocused) {
      setHexInput(currentHex.toUpperCase());
    }
  }, [currentHex, isInputFocused]);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !popoutRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popoutRect = popoutRef.current.getBoundingClientRect();
    const offset = 8;
    const margin = 24;
    const flipMargin = 56;

    let effectiveSide = side;
    if (
      side === "bottom" &&
      triggerRect.bottom + offset + popoutRect.height + flipMargin >
        window.innerHeight &&
      triggerRect.top - offset - popoutRect.height >= margin
    ) {
      effectiveSide = "top";
    } else if (
      side === "top" &&
      triggerRect.top - offset - popoutRect.height - flipMargin < 0 &&
      triggerRect.bottom + offset + popoutRect.height + margin <=
        window.innerHeight
    ) {
      effectiveSide = "bottom";
    } else if (
      side === "right" &&
      triggerRect.right + offset + popoutRect.width + flipMargin >
        window.innerWidth &&
      triggerRect.left - offset - popoutRect.width >= margin
    ) {
      effectiveSide = "left";
    } else if (
      side === "left" &&
      triggerRect.left - offset - popoutRect.width - flipMargin < 0 &&
      triggerRect.right + offset + popoutRect.width + margin <=
        window.innerWidth
    ) {
      effectiveSide = "right";
    }

    let top = 0;
    let left = 0;

    const alignHorizontal = () => {
      if (align === "start") return triggerRect.left;
      if (align === "end") return triggerRect.right - popoutRect.width;
      return triggerRect.left + (triggerRect.width - popoutRect.width) / 2;
    };

    const alignVertical = () => {
      if (align === "start") return triggerRect.top;
      if (align === "end") return triggerRect.bottom - popoutRect.height;
      return triggerRect.top + (triggerRect.height - popoutRect.height) / 2;
    };

    switch (effectiveSide) {
      case "top":
        top = triggerRect.top - popoutRect.height - offset;
        left = alignHorizontal();
        break;
      case "left":
        left = triggerRect.left - popoutRect.width - offset;
        top = alignVertical();
        break;
      case "right":
        left = triggerRect.right + offset;
        top = alignVertical();
        break;
      case "bottom":
      default:
        top = triggerRect.bottom + offset;
        left = alignHorizontal();
        break;
    }

    const maxLeft = Math.max(margin, window.innerWidth - popoutRect.width - margin);
    const maxTop = Math.max(margin, window.innerHeight - popoutRect.height - margin);

    setCoords({
      top: clamp(top, margin, maxTop),
      left: clamp(left, margin, maxLeft),
    });
  }, [side, align]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    calculatePosition();
  }, [isOpen, calculatePosition, presets]);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsidePointerDown = (e) => {
      if (
        popoutRef.current?.contains(e.target) ||
        triggerRef.current?.contains(e.target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    };

    window.addEventListener("resize", calculatePosition);
    window.addEventListener("scroll", calculatePosition, true);
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("resize", calculatePosition);
      window.removeEventListener("scroll", calculatePosition, true);
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen, calculatePosition]);

  useEffect(() => {
    if (disabled && isOpen) {
      setIsOpen(false);
    }
  }, [disabled, isOpen]);

  const commitHsv = useCallback(
    (nextHsv) => {
      setHsv(nextHsv);
      const nextHex = hsvToHex(nextHsv.h, nextHsv.s, nextHsv.v);
      onChange?.(nextHex);
    },
    [onChange]
  );

  const commitHex = useCallback(
    (hex) => {
      const normalized = normalizeHex(hex, currentHex);
      const [r, g, b] = hexToRgb(normalized);
      setHsv(rgbToHsv(r, g, b));
      onChange?.(normalized);
      return normalized;
    },
    [currentHex, onChange]
  );

  const updateSvFromPointer = useCallback(
    (clientX, clientY) => {
      if (!svAreaRef.current) return;
      const rect = svAreaRef.current.getBoundingClientRect();
      const s = clamp((clientX - rect.left) / rect.width, 0, 1);
      const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
      setHsv((prev) => {
        const next = { ...prev, s, v };
        onChange?.(hsvToHex(next.h, next.s, next.v));
        return next;
      });
    },
    [onChange]
  );

  const updateHueFromPointer = useCallback(
    (clientX) => {
      if (!hueBarRef.current) return;
      const rect = hueBarRef.current.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      const h = Math.min(359.99, ratio * 360);
      setHsv((prev) => {
        const next = { ...prev, h };
        onChange?.(hsvToHex(next.h, next.s, next.v));
        return next;
      });
    },
    [onChange]
  );

  const handleSvPointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    updateSvFromPointer(e.clientX, e.clientY);
  };

  const handleSvPointerMove = (e) => {
    if (e.buttons === 0 && !e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      return;
    }
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      updateSvFromPointer(e.clientX, e.clientY);
    }
  };

  const handleHuePointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    updateHueFromPointer(e.clientX);
  };

  const handleHuePointerMove = (e) => {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      updateHueFromPointer(e.clientX);
    }
  };

  const handleHexChange = (e) => {
    const raw = e.target.value;
    setHexInput(raw);
    const cleaned = raw.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
      commitHex(`#${cleaned}`);
    }
  };

  const handleHexCommit = () => {
    const cleaned = hexInput.trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{3}$/.test(cleaned) || /^[0-9a-fA-F]{6}$/.test(cleaned)) {
      const normalized = commitHex(`#${cleaned}`);
      setHexInput(normalized.toUpperCase());
    } else {
      setHexInput(currentHex.toUpperCase());
    }
  };

  const handleEyeDropper = async () => {
    if (!supportsEyeDropper) return;
    try {
      const dropper = new window.EyeDropper();
      const result = await dropper.open();
      if (result?.sRGBHex) {
        const normalized = commitHex(result.sRGBHex);
        setHexInput(normalized.toUpperCase());
      }
    } catch {
      // User cancelled EyeDropper
    }
  };

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        soundEngine.playNav?.("open");
      }
      return next;
    });
  };

  const normalizedPresets = Array.isArray(presets)
    ? presets.map((item) =>
        typeof item === "string"
          ? { hex: normalizeHex(item), name: null }
          : { hex: normalizeHex(item.hex), name: item.name || null }
      )
    : null;

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex shrink-0"
        onClick={handleToggle}
        onMouseDown={stopDragPropagation ? (e) => e.stopPropagation() : undefined}
        onDragStart={
          stopDragPropagation
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
              }
            : undefined
        }
      >
        {children}
      </span>

      {isOpen &&
        !disabled &&
        createPortal(
          <div
            ref={popoutRef}
            role="dialog"
            aria-label={t("colorPicker.hexLabel", "Código HEX")}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: "calc(var(--z-tooltip, 80) - 1)",
            }}
            className={cn(
              "w-[236px] p-3 bg-onicord-mantle/95 backdrop-blur-onicord-popover border border-onicord-island",
              "rounded-2xl shadow-2xl onicord-animate-popup-in select-none space-y-3",
              className
            )}
          >
            {/* 2D Saturation / Brightness Area */}
            <div
              ref={svAreaRef}
              role="slider"
              tabIndex={0}
              aria-label={t("colorPicker.saturationArea", "Saturación y brillo")}
              aria-valuetext={currentHex.toUpperCase()}
              onPointerDown={handleSvPointerDown}
              onPointerMove={handleSvPointerMove}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 0.1 : 0.03;
                if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  commitHsv({ ...hsv, s: clamp(hsv.s - step, 0, 1) });
                } else if (e.key === "ArrowRight") {
                  e.preventDefault();
                  commitHsv({ ...hsv, s: clamp(hsv.s + step, 0, 1) });
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  commitHsv({ ...hsv, v: clamp(hsv.v + step, 0, 1) });
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  commitHsv({ ...hsv, v: clamp(hsv.v - step, 0, 1) });
                }
              }}
              className="h-36 w-full rounded-xl relative cursor-crosshair touch-none overflow-hidden border border-onicord-tint/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-onicord-accent/60"
              style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
            >
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(to right, #fff, transparent)",
                }}
              />
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "linear-gradient(to top, #000, transparent)",
                }}
              />
              <div
                className="w-3.5 h-3.5 rounded-full border-2 border-white absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  left: `${hsv.s * 100}%`,
                  top: `${(1 - hsv.v) * 100}%`,
                  backgroundColor: currentHex,
                }}
              />
            </div>

            {/* Hue Slider */}
            <div
              ref={hueBarRef}
              role="slider"
              tabIndex={0}
              aria-label={t("colorPicker.hueSlider", "Tono")}
              aria-valuemin={0}
              aria-valuemax={360}
              aria-valuenow={Math.round(hsv.h)}
              onPointerDown={handleHuePointerDown}
              onPointerMove={handleHuePointerMove}
              onKeyDown={(e) => {
                const step = e.shiftKey ? 15 : 5;
                if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                  e.preventDefault();
                  commitHsv({ ...hsv, h: (hsv.h - step + 360) % 360 });
                } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                  e.preventDefault();
                  commitHsv({ ...hsv, h: (hsv.h + step) % 360 });
                }
              }}
              className="h-3.5 w-full rounded-full relative cursor-pointer touch-none border border-onicord-tint/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-onicord-accent/60"
              style={{
                background:
                  "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
              }}
            >
              <div
                className="w-4 h-4 rounded-full border-2 border-white absolute top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  left: `${(hsv.h / 360) * 100}%`,
                  backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
                }}
              />
            </div>

            {/* Controls Row: Preview swatch + HEX input + EyeDropper */}
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg border border-onicord-border-strong shrink-0"
                style={{ backgroundColor: currentHex }}
              />

              <input
                type="text"
                value={hexInput}
                onChange={handleHexChange}
                onFocus={() => setIsInputFocused(true)}
                onBlur={() => {
                  setIsInputFocused(false);
                  handleHexCommit();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleHexCommit();
                    e.currentTarget.blur();
                  }
                }}
                maxLength={7}
                spellCheck={false}
                aria-label={t("colorPicker.hexLabel", "Código HEX")}
                className="flex-1 min-w-0 h-7 px-2 rounded-lg bg-onicord-base/80 border border-onicord-border text-xs font-mono uppercase text-onicord-text focus:outline-none focus:border-onicord-accent/60 focus:ring-1 focus:ring-onicord-accent/30"
              />

              {supportsEyeDropper && (
                <Tooltip
                  content={t("colorPicker.eyedropper", "Cuentagotas")}
                  side="top"
                >
                  <button
                    type="button"
                    onClick={handleEyeDropper}
                    aria-label={t("colorPicker.eyedropper", "Cuentagotas")}
                    className="w-7 h-7 rounded-lg bg-onicord-base/70 hover:bg-onicord-base border border-onicord-border flex items-center justify-center text-onicord-muted hover:text-onicord-text transition-colors shrink-0 cursor-pointer"
                  >
                    <MaterialIcon name="colorize" size={16} />
                  </button>
                </Tooltip>
              )}
            </div>

            {/* Optional Quick Presets */}
            {normalizedPresets && normalizedPresets.length > 0 && (
              <div className="pt-2 border-t border-onicord-border space-y-1.5">
                <div className="text-2xs font-bold uppercase tracking-wider text-onicord-muted">
                  {t("colorPicker.presets", "Colores rápidos")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {normalizedPresets.map((preset, idx) => {
                    const isSelected = preset.hex === currentHex;
                    const swatchButton = (
                      <button
                        key={`${preset.hex}-${idx}`}
                        type="button"
                        onClick={() => {
                          const normalized = commitHex(preset.hex);
                          setHexInput(normalized.toUpperCase());
                        }}
                        aria-label={preset.name || preset.hex.toUpperCase()}
                        aria-pressed={isSelected}
                        className={cn(
                          "w-5 h-5 rounded-full flex items-center justify-center cursor-pointer transition-transform border duration-instant hover:scale-110 active:scale-95",
                          isSelected
                            ? "border-onicord-text ring-2 ring-onicord-tint/20 scale-110"
                            : "border-onicord-border-strong hover:border-onicord-tint/40"
                        )}
                        style={{ backgroundColor: preset.hex }}
                      >
                        {isSelected && (
                          <MaterialIcon
                            name="check"
                            size={12}
                            className={
                              isLightHex(preset.hex)
                                ? "text-onicord-dark"
                                : "text-white"
                            }
                          />
                        )}
                      </button>
                    );

                    return preset.name ? (
                      <Tooltip
                        key={`${preset.hex}-${idx}`}
                        content={preset.name}
                        side="top"
                      >
                        {swatchButton}
                      </Tooltip>
                    ) : (
                      swatchButton
                    );
                  })}
                </div>
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
