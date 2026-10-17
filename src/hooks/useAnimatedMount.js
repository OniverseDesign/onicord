import { useState, useEffect, useRef, useCallback } from "react";

/**
 * Hook para coordinar animaciones de montaje y desmontaje fluido en componentes de UI.
 *
 * @param {boolean} isOpen - Estado de visibilidad deseado.
 * @param {number} durationMs - Duracion en ms de la animacion de salida.
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
 * Hook para componentes que se cierran internamente antes de notificar al padre.
 * Permite reproducir la animacion de salida antes de llamar al callback onClose.
 *
 * @param {Function} onCloseCallback - Callback invocado al terminar la animacion.
 * @param {number} durationMs - Duracion de la animacion de salida.
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
