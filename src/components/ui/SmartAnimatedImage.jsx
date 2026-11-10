import React, { useState, useRef, useEffect, useCallback } from "react";

const getContinuousAnimationsSetting = () => {
  try {
    const raw = localStorage.getItem("onicord_general_settings");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.enableContinuousAnimations !== undefined) {
        return parsed.enableContinuousAnimations;
      }
    }
  } catch (e) {
    console.error(e);
  }
  return true; // default
};

const settingsSubscribers = new Set();
let globalListenersAttached = false;

function handleGlobalSettingsUpdate(e) {
  const nextVal =
    e?.detail?.enableContinuousAnimations !== undefined
      ? Boolean(e.detail.enableContinuousAnimations)
      : getContinuousAnimationsSetting();
  for (const listener of settingsSubscribers) {
    listener(nextVal);
  }
}

function subscribeContinuousAnimations(listener) {
  settingsSubscribers.add(listener);
  if (!globalListenersAttached && typeof window !== "undefined") {
    globalListenersAttached = true;
    window.addEventListener("storage", handleGlobalSettingsUpdate);
    window.addEventListener("onicord:general-settings-updated", handleGlobalSettingsUpdate);
    window.addEventListener("onicord:settings-changed", handleGlobalSettingsUpdate);
  }
  return () => {
    settingsSubscribers.delete(listener);
    if (settingsSubscribers.size === 0 && globalListenersAttached && typeof window !== "undefined") {
      globalListenersAttached = false;
      window.removeEventListener("storage", handleGlobalSettingsUpdate);
      window.removeEventListener("onicord:general-settings-updated", handleGlobalSettingsUpdate);
      window.removeEventListener("onicord:settings-changed", handleGlobalSettingsUpdate);
    }
  };
}

export default function SmartAnimatedImage({
  src,
  alt = "",
  className = "",
  style = {},
  timestamp = null,
  isAvatar = false,
}) {
  const [enableContinuousAnimations, setEnableContinuousAnimations] = useState(getContinuousAnimationsSetting);
  const [isHovered, setIsHovered] = useState(false);
  const [isPlayingMinTime, setIsPlayingMinTime] = useState(false);
  const [isJustArrived, setIsJustArrived] = useState(() => {
    if (!timestamp) return false;
    return Date.now() - timestamp < 4000;
  });
  const [showCanvas, setShowCanvas] = useState(false);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  // Listen to storage changes or custom settings event via shared module-level listener
  useEffect(() => {
    return subscribeContinuousAnimations(setEnableContinuousAnimations);
  }, []);

  // Handle just arrived timer
  useEffect(() => {
    if (isJustArrived && timestamp) {
      const elapsed = Date.now() - timestamp;
      const remaining = Math.max(0, 4000 - elapsed);
      if (remaining > 0) {
        const timer = setTimeout(() => {
          setIsJustArrived(false);
        }, remaining);
        return () => clearTimeout(timer);
      } else {
        setIsJustArrived(false);
      }
    }
  }, [isJustArrived, timestamp]);

  const timerRef = useRef(null);

  // Enforce a minimum play duration of 1.5 seconds on hover start
  useEffect(() => {
    if (isHovered) {
      setIsPlayingMinTime(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setIsPlayingMinTime(false);
      }, 1500);
    }
  }, [isHovered]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const shouldAnimate = enableContinuousAnimations || isHovered || isJustArrived || isPlayingMinTime;

  const drawStaticFrame = useCallback(() => {
    if (canvasRef.current && imgRef.current) {
      const canvas = canvasRef.current;
      const img = imgRef.current;
      
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
        
        const ctx = canvas.getContext("2d");
        try {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          setShowCanvas(true);
          return true;
        } catch (err) {
          console.error("Error drawing animated frame to canvas:", err);
        }
      }
    }
    return false;
  }, []);

  const handleImageLoad = () => {
    if (!enableContinuousAnimations) {
      drawStaticFrame();
    }
  };

  // When continuous animations are disabled, ensure we have drawn the static canvas frame
  useEffect(() => {
    if (!enableContinuousAnimations && !showCanvas) {
      drawStaticFrame();
    }
  }, [enableContinuousAnimations, showCanvas, drawStaticFrame]);

  // Re-draw when src changes, and retry to catch race conditions (cached images/ref mount timing)
  useEffect(() => {
    setShowCanvas(false);
    if (enableContinuousAnimations) return;

    let active = true;
    let attempts = 0;

    // Try immediately
    if (drawStaticFrame()) return;

    // Retry if refs/dimensions take a moment to load
    const interval = setInterval(() => {
      if (!active) return;
      attempts++;
      const success = drawStaticFrame();
      if (success || attempts >= 30) {
        clearInterval(interval);
      }
    }, 100);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [src, enableContinuousAnimations, drawStaticFrame]);

  const isContain = className.includes("object-contain");
  const fitClass = isContain ? "object-contain" : "object-cover";
  const cleanClassName = className
    .replace(/\bobject-cover\b/g, "")
    .replace(/\bobject-contain\b/g, "")
    .trim();

  return (
    <div
      className="relative w-full h-full flex items-center justify-center overflow-hidden rounded-[inherit]"
      style={{
        borderRadius: "inherit",
        isolation: "isolate",
        transform: "translateZ(0)",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Static frame canvas rendered below when continuous animations are disabled */}
      {!enableContinuousAnimations && (
        <canvas
          ref={canvasRef}
          className={`${cleanClassName} ${fitClass}`}
          style={{
            ...style,
            display: showCanvas ? "block" : "none",
            width: "100%",
            height: "100%",
            objectFit: isContain ? "contain" : "cover",
          }}
        />
      )}

      {/* Actual image, transitions opacity on top of the canvas */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={`${cleanClassName} absolute inset-0 w-full h-full ${fitClass}`}
        style={{
          ...style,
          opacity: shouldAnimate || !showCanvas ? 1 : 0,
          zIndex: shouldAnimate || !showCanvas ? 1 : 0,
          transition: "opacity 0.25s ease-in-out",
          pointerEvents: "none",
        }}
        onLoad={handleImageLoad}
      />

      {/* Anti-aliasing edge-smoothing overlay to hide pixelated/jagged edges on avatars */}
      {isAvatar && (
        <div 
          className="absolute inset-0 rounded-[inherit] border border-black/15 pointer-events-none z-10" 
          style={{ boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.05)" }}
        />
      )}
    </div>
  );
}
