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

export default function SmartAnimatedImage({
  src,
  alt = "",
  className = "",
  style = {},
  timestamp = null,
  isAvatar = false,
}) {
  const [enableContinuousAnimations, setEnableContinuousAnimations] = useState(getContinuousAnimationsSetting());
  const [isHovered, setIsHovered] = useState(false);
  const [isPlayingMinTime, setIsPlayingMinTime] = useState(false);
  const [isJustArrived, setIsJustArrived] = useState(() => {
    if (!timestamp) return false;
    return Date.now() - timestamp < 4000;
  });
  const [showCanvas, setShowCanvas] = useState(false);
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  // Listen to storage changes or custom settings event without aggressive polling
  useEffect(() => {
    const handleSettingsUpdate = (e) => {
      if (e?.detail?.enableContinuousAnimations !== undefined) {
        setEnableContinuousAnimations(Boolean(e.detail.enableContinuousAnimations));
      } else {
        setEnableContinuousAnimations(getContinuousAnimationsSetting());
      }
    };
    window.addEventListener("storage", handleSettingsUpdate);
    window.addEventListener("onicord:general-settings-updated", handleSettingsUpdate);
    window.addEventListener("onicord:settings-changed", handleSettingsUpdate);

    return () => {
      window.removeEventListener("storage", handleSettingsUpdate);
      window.removeEventListener("onicord:general-settings-updated", handleSettingsUpdate);
      window.removeEventListener("onicord:settings-changed", handleSettingsUpdate);
    };
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
    drawStaticFrame();
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
  }, [src]);

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
      {/* Static frame canvas always rendered below */}
      <canvas
        ref={canvasRef}
        className={className}
        style={{
          ...style,
          display: showCanvas ? "block" : "none",
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      {/* Actual image, transitions opacity on top of the canvas */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className={`${className} absolute inset-0 w-full h-full object-cover`}
        style={{
          ...style,
          opacity: shouldAnimate || !showCanvas ? 1 : 0,
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
