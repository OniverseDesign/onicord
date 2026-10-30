import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Hook to coordinate smooth mount and unmount exit animations in UI components.
 *
 * @param {boolean} isOpen - Desired visibility state.
 * @param {number} durationMs - Exit animation duration in milliseconds.
 * @returns {{ shouldRender: boolean, isAnimatingOut: boolean }}
 */
export function useAnimatedMount(isOpen, durationMs = 150) {
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);
  const timeoutRef = useRef(null);

  // Synchronous state adjustment when isOpen transitions to true
  if (isOpen && !shouldRender) {
    setShouldRender(true);
    setIsAnimatingOut(false);
  }

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (isOpen) {
      setShouldRender(true);
      setIsAnimatingOut(false);
    } else if (shouldRender) {
      setIsAnimatingOut(true);
      timeoutRef.current = setTimeout(() => {
        setShouldRender(false);
        setIsAnimatingOut(false);
      }, durationMs);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isOpen, durationMs, shouldRender]);

  return { shouldRender, isAnimatingOut };
}

/**
 * Hook for components that initiate internal closing prior to notifying parent state.
 * Plays the exit animation before invoking the onClose callback.
 *
 * @param {Function} onCloseCallback - Callback invoked upon animation completion.
 * @param {number} durationMs - Exit animation duration in milliseconds.
 * @returns {{ isClosing: boolean, triggerClose: () => void }}
 */
export function useInternalClose(onCloseCallback, durationMs = 150) {
  const [isClosing, setIsClosing] = useState(false);
  const closingRef = useRef(false);

  const triggerClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);

    setTimeout(() => {
      onCloseCallback?.();
      closingRef.current = false;
      setIsClosing(false);
    }, durationMs);
  }, [onCloseCallback, durationMs]);

  useEffect(() => {
    return () => {
      closingRef.current = false;
      setIsClosing(false);
    };
  }, []);

  return { isClosing, triggerClose };
}
