import { useCallback, useLayoutEffect, useRef } from "react";

export function useBentoFlip(gridRef, layout, activeKey = null) {
  const prevRectsRef = useRef(new Map());
  const animationsRef = useRef(new Map());
  const pendingFlipRef = useRef(false);

  const captureRects = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const nextMap = new Map();
    const items = grid.querySelectorAll("[data-bento-key]");
    items.forEach((el) => {
      const key = el.getAttribute("data-bento-key");
      if (key) {
        nextMap.set(key, el.getBoundingClientRect());
      }
    });
    prevRectsRef.current = nextMap;
    pendingFlipRef.current = true;
  }, [gridRef]);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const items = grid.querySelectorAll("[data-bento-key]");
    const nextRects = new Map();

    items.forEach((el) => {
      const key = el.getAttribute("data-bento-key");
      if (!key) return;

      const nextRect = el.getBoundingClientRect();
      nextRects.set(key, nextRect);

      if (!pendingFlipRef.current || key === activeKey) return;

      const prevRect = prevRectsRef.current.get(key);
      if (!prevRect || prevRect.width === 0 || prevRect.height === 0 || nextRect.width === 0 || nextRect.height === 0) {
        return;
      }

      const dx = prevRect.left - nextRect.left;
      const dy = prevRect.top - nextRect.top;
      const sx = prevRect.width / nextRect.width;
      const sy = prevRect.height / nextRect.height;

      const moved =
        Math.abs(dx) > 0.5 ||
        Math.abs(dy) > 0.5 ||
        Math.abs(1 - sx) > 0.005 ||
        Math.abs(1 - sy) > 0.005;

      if (!moved) return;

      const existingAnim = animationsRef.current.get(key);
      if (existingAnim) {
        existingAnim.cancel();
      }

      const anim = el.animate(
        [
          {
            transformOrigin: "top left",
            transform: `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`,
          },
          {
            transformOrigin: "top left",
            transform: "translate3d(0px, 0px, 0) scale(1, 1)",
          },
        ],
        {
          duration: 240,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        }
      );

      animationsRef.current.set(key, anim);
      anim.onfinish = () => {
        if (animationsRef.current.get(key) === anim) {
          animationsRef.current.delete(key);
        }
      };
    });

    prevRectsRef.current = nextRects;
    pendingFlipRef.current = false;
  }, [gridRef, layout, activeKey]);

  return { captureRects };
}
