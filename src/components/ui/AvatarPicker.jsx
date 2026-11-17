import React, { useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import SmartAnimatedImage from "./SmartAnimatedImage";
import { cn } from "../../lib/cn";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

const SIZE_PRESETS = {
  sm: {
    circle: "w-8 h-8",
    text: "text-xs font-bold",
    fallbackIcon: 16,
    cameraIcon: 14,
    removeBtn: "w-4 h-4 -top-1 -right-1",
    removeIcon: 10,
  },
  md: {
    circle: "w-16 h-16",
    text: "text-base font-bold",
    fallbackIcon: 28,
    cameraIcon: 20,
    removeBtn: "w-6 h-6 -top-1 -right-1",
    removeIcon: 14,
  },
  lg: {
    circle: "w-20 h-20",
    text: "text-2xl font-bold",
    fallbackIcon: 36,
    cameraIcon: 24,
    removeBtn: "w-6 h-6 top-0 right-0",
    removeIcon: 14,
  },
  xl: {
    circle: "w-28 h-28",
    text: "text-4xl font-semibold",
    fallbackIcon: 56,
    cameraIcon: 28,
    removeBtn: "w-6 h-6 top-0 right-0",
    removeIcon: 14,
  },
};

const AvatarPicker = React.forwardRef(function AvatarPicker(
  {
    src = null,
    onChange,
    onError,
    onClick,
    onRemove,
    initial = "",
    fallbackIcon = "person",
    size = "lg",
    readOnly = false,
    disabled = false,
    removeOnHoverOnly = false,
    title,
    removeTitle,
    className = "",
    circleClassName = "",
    emptyClassName = "bg-onicord-overlay/60 hover:bg-onicord-overlay text-onicord-text",
    circleStyle,
    children,
  },
  ref,
) {
  const { t } = useTranslation();
  const internalInputRef = useRef(null);

  const setInputRef = useCallback(
    (node) => {
      internalInputRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  const cfg = SIZE_PRESETS[size] || SIZE_PRESETS.lg;
  const isInteractive = !readOnly && !disabled;
  const canRemove = isInteractive && Boolean(src) && Boolean(onRemove || onChange);

  const hasBorderClass =
    typeof circleClassName === "string" && /\bborder\b|\bborder-/.test(circleClassName);

  const resolvedCircleStyle =
    circleStyle !== undefined
      ? circleStyle
      : hasBorderClass
        ? undefined
        : {
            border: "4px solid var(--onicord-surface, #181825)",
            boxShadow: "0 0 0 2px rgba(255, 255, 255, 0.08)",
          };

  const handleCircleClick = () => {
    if (!isInteractive) return;
    if (onClick) {
      onClick();
    } else {
      internalInputRef.current?.click();
    }
  };

  const handleCircleKeyDown = (e) => {
    if (!isInteractive) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCircleClick();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !isInteractive) return;

    if (!file.type.startsWith("image/")) {
      onError?.(
        t(
          "addServerModal.iconTypeError",
          "Selecciona una imagen válida (PNG, JPG, GIF, WebP).",
        ),
      );
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      onError?.(
        t("addServerModal.iconSizeError", "El icono no puede superar 8 MB."),
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      onChange?.(reader.result);
      onError?.(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveClick = (e) => {
    e.stopPropagation();
    if (!canRemove) return;
    if (onRemove) {
      onRemove();
    } else {
      onChange?.(null);
    }
  };

  return (
    <div className={cn("relative group inline-flex shrink-0", className)}>
      <div
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onClick={isInteractive ? handleCircleClick : undefined}
        onKeyDown={isInteractive ? handleCircleKeyDown : undefined}
        style={resolvedCircleStyle}
        title={title}
        className={cn(
          "rounded-full overflow-hidden flex items-center justify-center relative select-none transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-onicord-accent",
          cfg.circle,
          src ? "bg-onicord-base" : emptyClassName,
          isInteractive ? "cursor-pointer" : "cursor-default",
          disabled && "opacity-60 pointer-events-none",
          circleClassName,
        )}
      >
        {src ? (
          <SmartAnimatedImage
            src={src}
            alt=""
            className={cn(
              "h-full w-full object-cover rounded-full transition-opacity",
              isInteractive && "group-hover:opacity-40",
            )}
            isAvatar={true}
          />
        ) : initial ? (
          <span
            className={cn(
              "leading-none transition-opacity",
              cfg.text,
              isInteractive && "group-hover:opacity-40",
            )}
          >
            {initial}
          </span>
        ) : (
          <MaterialIcon
            name={fallbackIcon}
            size={cfg.fallbackIcon}
            className={cn(
              "opacity-40 transition-opacity",
              isInteractive && "group-hover:opacity-20",
            )}
          />
        )}

        {isInteractive && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-full pointer-events-none">
            <MaterialIcon
              name="photo_camera"
              size={cfg.cameraIcon}
              className="text-white"
            />
          </div>
        )}
      </div>

      {canRemove && (
        <button
          type="button"
          onClick={handleRemoveClick}
          title={removeTitle || t("common.delete", "Eliminar")}
          className={cn(
            "absolute z-20 rounded-full bg-onicord-danger hover:bg-onicord-danger/80 text-white flex items-center justify-center shadow-md transition-opacity cursor-pointer",
            cfg.removeBtn,
            removeOnHoverOnly
              ? "opacity-0 group-hover:opacity-100"
              : "opacity-100",
          )}
        >
          <MaterialIcon name="close" size={cfg.removeIcon} />
        </button>
      )}

      {children}

      {!readOnly && !onClick && (
        <input
          ref={setInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      )}
    </div>
  );
});

export default AvatarPicker;
