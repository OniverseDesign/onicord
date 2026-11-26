import { useEffect, useRef, useState } from "react";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes AFK threshold

export function useAfkTracker(explicitStatusMode = "online", onStatusChange, isInVoice = false, currentStatus = "online") {
  const [isAfk, setIsAfk] = useState(explicitStatusMode === "online" && currentStatus === "idle");
  const isAfkRef = useRef(explicitStatusMode === "online" && currentStatus === "idle");
  const timeoutRef = useRef(null);
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  useEffect(() => {
    // Only auto-idle if explicit status is "online" (do not override explicit "dnd" or "invisible")
    // and the user is NOT currently connected to a voice channel.
    if (explicitStatusMode !== "online") {
      isAfkRef.current = false;
      setIsAfk(false);
      return;
    }

    if (currentStatus === "idle" && !isAfkRef.current) {
      isAfkRef.current = true;
      setIsAfk(true);
    }

    if (isInVoice) {
      if (isAfkRef.current) {
        isAfkRef.current = false;
        setIsAfk(false);
        onStatusChangeRef.current?.("online");
      }
      return;
    }

    const scheduleTimer = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      timeoutRef.current = setTimeout(() => {
        if (!isAfkRef.current) {
          isAfkRef.current = true;
          setIsAfk(true);
          onStatusChangeRef.current?.("idle");
        }
      }, IDLE_TIMEOUT_MS);
    };

    const handleUserActivity = () => {
      if (isAfkRef.current) {
        isAfkRef.current = false;
        setIsAfk(false);
        onStatusChangeRef.current?.("online");
      }
      scheduleTimer();
    };

    scheduleTimer();

    let lastMove = 0;
    const handleMouseMove = () => {
      const now = Date.now();
      if (now - lastMove > 2000) {
        lastMove = now;
        handleUserActivity();
      }
    };

    const otherEvents = ["keydown", "click", "scroll", "touchstart"];
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    otherEvents.forEach((evt) => window.addEventListener(evt, handleUserActivity, { passive: true }));

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      window.removeEventListener("mousemove", handleMouseMove);
      otherEvents.forEach((evt) => window.removeEventListener(evt, handleUserActivity));
    };
  }, [explicitStatusMode, isInVoice]);

  return isAfk;
}
