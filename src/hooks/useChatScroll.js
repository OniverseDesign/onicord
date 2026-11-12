import { useRef, useEffect, useState, useCallback } from "react";

export function useChatScroll({
  messages = [],
  loading = false,
  visibleCount = 40,
  setVisibleCount,
  chatContainerRef: externalContainerRef,
  bottomRef: externalBottomRef,
  messagesCountRef: externalMessagesCountRef,
  virtualizerRef,
  isForum = false,
}) {
  const internalContainerRef = useRef(null);
  const internalBottomRef = useRef(null);
  const internalMessagesCountRef = useRef(0);

  const chatContainerRef = externalContainerRef || internalContainerRef;
  const bottomRef = externalBottomRef || internalBottomRef;
  const messagesCountRef = externalMessagesCountRef || internalMessagesCountRef;

  const isAtBottomRef = useRef(true);
  const isAtTopRef = useRef(true);
  const isProgrammaticScrollingRef = useRef(false);
  const scrollProgrammaticTimeoutRef = useRef(null);
  const [isScrollingUpLoading, setIsScrollingUpLoading] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    const cleanBehavior = (typeof behavior === "string" && ["auto", "smooth", "instant"].includes(behavior)) ? behavior : "smooth";
    const container = chatContainerRef.current;
    if (!container) return;

    isAtBottomRef.current = true;
    setShowScrollBottom(false);
    isProgrammaticScrollingRef.current = cleanBehavior === "smooth";

    if (scrollProgrammaticTimeoutRef.current) {
      clearTimeout(scrollProgrammaticTimeoutRef.current);
    }
    if (cleanBehavior === "smooth") {
      scrollProgrammaticTimeoutRef.current = setTimeout(() => {
        isProgrammaticScrollingRef.current = false;
      }, 800);
    }

    if (virtualizerRef?.current && messages.length > 0) {
      virtualizerRef.current.scrollToEnd({ behavior: cleanBehavior });
    } else {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: cleanBehavior,
      });
    }

    // Settling passes to guarantee landing at the absolute bottom even with late-mounting items
    const settle = () => {
      if (!isAtBottomRef.current || !chatContainerRef.current) return;
      if (virtualizerRef?.current && messages.length > 0) {
        virtualizerRef.current.scrollToEnd({ behavior: "auto" });
      } else {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    };

    if (cleanBehavior === "smooth") {
      setTimeout(settle, 150);
      setTimeout(settle, 350);
      setTimeout(settle, 600);
      setTimeout(settle, 900);
    }
  }, [chatContainerRef, virtualizerRef, messages.length]);

  const scrollToTop = useCallback((behavior = "smooth") => {
    const cleanBehavior = (typeof behavior === "string" && ["auto", "smooth", "instant"].includes(behavior)) ? behavior : "smooth";
    const container = chatContainerRef.current;
    if (!container) return;

    isAtTopRef.current = true;
    setShowScrollBottom(false);
    isProgrammaticScrollingRef.current = cleanBehavior === "smooth";

    if (scrollProgrammaticTimeoutRef.current) {
      clearTimeout(scrollProgrammaticTimeoutRef.current);
    }
    if (cleanBehavior === "smooth") {
      scrollProgrammaticTimeoutRef.current = setTimeout(() => {
        isProgrammaticScrollingRef.current = false;
      }, 800);
    }

    if (virtualizerRef?.current && messages.length > 0) {
      virtualizerRef.current.scrollToOffset(0, { behavior: cleanBehavior });
    } else {
      container.scrollTo({ top: 0, behavior: cleanBehavior });
    }

    const settle = () => {
      if (!isAtTopRef.current || !chatContainerRef.current) return;
      if (virtualizerRef?.current && messages.length > 0) {
        virtualizerRef.current.scrollToOffset(0, { behavior: "auto" });
      } else {
        chatContainerRef.current.scrollTop = 0;
      }
    };

    if (cleanBehavior === "smooth") {
      setTimeout(settle, 150);
      setTimeout(settle, 350);
      setTimeout(settle, 600);
      setTimeout(settle, 900);
    }
  }, [chatContainerRef, virtualizerRef, messages.length]);

  // Cancel programmatic scroll guard on user manual wheel or touch interaction
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleWheel = (e) => {
      if (e.deltaY < -2) {
        isProgrammaticScrollingRef.current = false;
      }
    };

    const handleTouchStart = () => {
      isProgrammaticScrollingRef.current = false;
    };

    container.addEventListener("wheel", handleWheel, { passive: true });
    container.addEventListener("touchstart", handleTouchStart, { passive: true });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("touchstart", handleTouchStart);
    };
  }, [chatContainerRef]);

  // Keep pinned to anchor (bottom for chat, top for forum) when content/images resize
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    let rafId = null;
    const handleContentResize = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (isForum) {
          if (isAtTopRef.current) {
            container.scrollTop = 0;
          }
        } else {
          if (isAtBottomRef.current) {
            if (virtualizerRef?.current && messages.length > 0) {
              virtualizerRef.current.scrollToEnd({ behavior: "auto" });
            } else {
              container.scrollTop = container.scrollHeight;
            }
          }
        }
      });
    };

    const ro = new ResizeObserver(handleContentResize);
    ro.observe(container);

    const mo = new MutationObserver(handleContentResize);
    mo.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      mo.disconnect();
    };
  }, [isForum, chatContainerRef, virtualizerRef, messages.length]);

  // Sticky-bottom: re-anchor to bottom when an embed finishes loading,
  // but ONLY if the user was already at the bottom (like Discord/Slack) and not in forum mode.
  useEffect(() => {
    const handleEmbedLoaded = () => {
      if (!isForum && isAtBottomRef.current) {
        requestAnimationFrame(() => {
          const container = chatContainerRef.current;
          if (!container) return;
          if (virtualizerRef?.current && messages.length > 0) {
            virtualizerRef.current.scrollToEnd({ behavior: "auto" });
          } else {
            container.scrollTop = container.scrollHeight;
          }
        });
      }
    };

    window.addEventListener("onicord:embed-loaded", handleEmbedLoaded);
    return () => window.removeEventListener("onicord:embed-loaded", handleEmbedLoaded);
  }, [isForum, chatContainerRef, virtualizerRef, messages.length]);

  // Initial load / new message scroll
  useEffect(() => {
    if (loading || !messages || messages.length === 0) return;

    const esHidratacionInicial = messagesCountRef.current === 0;
    const nuevoMensajeAgregado = messages.length > messagesCountRef.current;

    if (esHidratacionInicial || (nuevoMensajeAgregado && isAtBottomRef.current)) {
      const performScroll = (behavior = "auto") => {
        const container = chatContainerRef.current;
        if (!container) return;

        if (isForum) {
          if (virtualizerRef?.current && messages.length > 0) {
            virtualizerRef.current.scrollToOffset(0, { behavior });
          } else {
            container.scrollTop = 0;
          }
          isAtTopRef.current = true;
        } else {
          if (virtualizerRef?.current && messages.length > 0) {
            virtualizerRef.current.scrollToEnd({ behavior });
          } else {
            container.scrollTop = container.scrollHeight;
          }
          isAtBottomRef.current = true;
        }
        setShowScrollBottom(false);
      };

      // Multi-frame settling to ensure absolute top/bottom even while markdown,
      // avatars, and attachments compute layout
      performScroll("auto");
      const rafId = requestAnimationFrame(() => performScroll("auto"));
      const t1 = setTimeout(() => performScroll("auto"), 50);
      const t2 = setTimeout(() => performScroll("auto"), 150);
      const t3 = setTimeout(() => performScroll("auto"), 300);
      const t4 = setTimeout(() => performScroll("auto"), 600);

      messagesCountRef.current = messages.length;
      return () => {
        cancelAnimationFrame(rafId);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
        clearTimeout(t4);
      };
    } else if (nuevoMensajeAgregado && !isAtBottomRef.current && !isForum) {
      setShowScrollBottom(true);
    }

    messagesCountRef.current = messages.length;
  }, [messages, loading, isForum, chatContainerRef, virtualizerRef, messagesCountRef]);

  const handleChatScroll = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    if (isForum) {
      // In forum channels, newest posts are at the top (scrollTop: 0)
      const atTop = container.scrollTop <= 40;
      isAtTopRef.current = atTop;

      if (atTop) {
        setShowScrollBottom(false);
        isProgrammaticScrollingRef.current = false;
      } else if (!isProgrammaticScrollingRef.current && container.scrollTop > 120) {
        setShowScrollBottom(true);
      }

      if (messages.length <= visibleCount) return;

      // Infinite scroll downwards for older posts
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (distanceFromBottom <= 120 && !isScrollingUpLoading) {
        setIsScrollingUpLoading(true);
        setTimeout(() => {
          setVisibleCount?.((prev) => Math.min(prev + 30, messages.length));
          setIsScrollingUpLoading(false);
        }, 200);
      }
      return;
    }

    // Normal chat channel: track if user is at the bottom (within 60px threshold)
    const distanceFromBottom = Math.max(0, container.scrollHeight - container.scrollTop - container.clientHeight);
    const atBottom = distanceFromBottom <= 60;
    isAtBottomRef.current = atBottom;

    if (atBottom) {
      setShowScrollBottom(false);
      isProgrammaticScrollingRef.current = false;
    } else if (!isProgrammaticScrollingRef.current && distanceFromBottom > 120) {
      setShowScrollBottom(true);
    }

    if (messages.length <= visibleCount) return;

    if (
      container.scrollHeight > container.clientHeight + 40 &&
      container.scrollTop <= 40 &&
      !isScrollingUpLoading
    ) {
      setIsScrollingUpLoading(true);

      const previousScrollHeight = container.scrollHeight;

      setTimeout(() => {
        setVisibleCount?.((prev) => {
          const nextCount = Math.min(prev + 30, messages.length);

          requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight - previousScrollHeight;
          });

          return nextCount;
        });
        setIsScrollingUpLoading(false);
      }, 400);
    }
  }, [isForum, messages.length, visibleCount, isScrollingUpLoading, setVisibleCount, chatContainerRef]);

  return {
    chatContainerRef,
    bottomRef,
    isAtBottomRef,
    isScrollingUpLoading,
    showScrollBottom,
    scrollToBottom,
    scrollToTop,
    scrollToTarget: isForum ? scrollToTop : scrollToBottom,
    handleChatScroll,
    messagesCountRef,
  };
}
