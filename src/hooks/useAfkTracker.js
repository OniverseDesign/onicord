import { useEffect, useRef, useState } from "react";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes AFK threshold

export function useAfkTracker(explicitStatusMode = "online", onStatusChange) {
  const [isAfk, setIsAfk] = useState(false);
  const timeoutRef = useRef(null);
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  useEffect(() => {
    // Only auto-idle if explicit status is "online" (do not override explicit "dnd" or "invisible")
    if (explicitStatusMode !== "online") {
      setIsAfk(false);
      return;
    }

    const resetTimer = () => {
      if (isAfk) {
        setIsAfk(false);
        onStatusChangeRef.current?.("online");
      }

      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      timeoutRef.current = setTimeout(() => {
        setIsAfk(true);
        onStatusChangeRef.current?.("idle");
      }, IDLE_TIMEOUT_MS);
    };

    resetTimer();

    let lastMove = 0;
    const handleMouseMove = () => {
      const now = Date.now();
      if (now - lastMove > 2000) {
        lastMove = now;
        resetTimer();
      }
    };

    const otherEvents = ["keydown", "click", "scroll", "touchstart"];
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    otherEvents.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      window.removeEventListener("mousemove", handleMouseMove);
      otherEvents.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [explicitStatusMode, isAfk]);

  return isAfk;
}
