import { useEffect, useRef, useState } from "react";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes AFK threshold

export function useAfkTracker(explicitStatusMode = "online", onStatusChange) {
  const [isAfk, setIsAfk] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    // Only auto-idle if explicit status is "online" (do not override explicit "dnd" or "invisible")
    if (explicitStatusMode !== "online") {
      setIsAfk(false);
      return;
    }

    const resetTimer = () => {
      if (isAfk) {
        setIsAfk(false);
        onStatusChange?.("online");
      }

      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      timeoutRef.current = setTimeout(() => {
        setIsAfk(true);
        onStatusChange?.("idle");
      }, IDLE_TIMEOUT_MS);
    };

    resetTimer();

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      events.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [explicitStatusMode, isAfk, onStatusChange]);

  return isAfk;
}
