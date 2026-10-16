import { useState, useRef, useEffect } from "react";

export function useRoomResizers({ activeThreadMessage, setActiveThreadMessage }) {
  const [leftWidth, setLeftWidth] = useState(365);
  const [rightWidth, setRightWidth] = useState(300);
  const [threadWidth, setThreadWidth] = useState(() => {
    try {
      const saved = localStorage.getItem("onicord_thread_panel_width");
      return saved ? Math.max(280, Math.min(700, Number(saved))) : 380;
    } catch {
      return 380;
    }
  });

  const isResizingLeft = useRef(false);
  const isResizingRight = useRef(false);
  const isResizingThread = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (isResizingLeft.current) {
        const deltaX = e.clientX - dragStartX.current;
        const newWidth = Math.max(
          265,
          Math.min(465, dragStartWidth.current + deltaX),
        );
        setLeftWidth(newWidth);
      }
      if (isResizingRight.current) {
        const deltaX = dragStartX.current - e.clientX;
        const newWidth = Math.max(
          265,
          Math.min(465, dragStartWidth.current + deltaX),
        );
        setRightWidth(newWidth);
      }
      if (isResizingThread.current) {
        const deltaX = dragStartX.current - e.clientX;
        const rawWidth = dragStartWidth.current + deltaX;

        // Auto-close thread panel if user drags handle below threshold (220px)
        if (rawWidth < 220) {
          setActiveThreadMessage?.(null);
          isResizingThread.current = false;
          document.body.style.cursor = "default";
          return;
        }

        const newWidth = Math.max(280, Math.min(700, rawWidth));
        setThreadWidth(newWidth);
        try {
          localStorage.setItem("onicord_thread_panel_width", String(newWidth));
        } catch {}
      }
    };

    const handlePointerUp = () => {
      if (isResizingLeft.current || isResizingRight.current || isResizingThread.current) {
        isResizingLeft.current = false;
        isResizingRight.current = false;
        isResizingThread.current = false;
        document.body.style.cursor = "default";
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [setActiveThreadMessage]);

  // Auto-close thread panel when app window is resized below 1450px
  useEffect(() => {
    const handleWindowResize = () => {
      if (window.innerWidth < 1450 && activeThreadMessage) {
        setActiveThreadMessage?.(null);
      }
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [activeThreadMessage, setActiveThreadMessage]);

  const startResizeLeft = (e) => {
    isResizingLeft.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = leftWidth;
    document.body.style.cursor = "col-resize";
  };

  const startResizeRight = (e) => {
    isResizingRight.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = rightWidth;
    document.body.style.cursor = "col-resize";
  };

  const startResizeThread = (e) => {
    isResizingThread.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = threadWidth;
    document.body.style.cursor = "col-resize";
  };

  return {
    leftWidth,
    setLeftWidth,
    rightWidth,
    setRightWidth,
    threadWidth,
    setThreadWidth,
    startResizeLeft,
    startResizeRight,
    startResizeThread,
  };
}
