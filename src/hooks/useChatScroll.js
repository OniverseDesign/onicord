import { useRef, useEffect, useState, useCallback } from "react";

export function useChatScroll({
  messages = [],
  loading = false,
  visibleCount = 40,
  setVisibleCount,
  chatContainerRef: externalContainerRef,
  bottomRef: externalBottomRef,
  messagesCountRef: externalMessagesCountRef,
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
  const [isScrollingUpLoading, setIsScrollingUpLoading] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    const cleanBehavior = (typeof behavior === "string" && ["auto", "smooth", "instant"].includes(behavior)) ? behavior : "smooth";
    const container = chatContainerRef.current;
    if (container) {
      isAtBottomRef.current = true;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: cleanBehavior,
      });
      setShowScrollBottom(false);
    } else if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: cleanBehavior });
      setShowScrollBottom(false);
    }
  }, [chatContainerRef, bottomRef]);

  const scrollToTop = useCallback((behavior = "smooth") => {
    const cleanBehavior = (typeof behavior === "string" && ["auto", "smooth", "instant"].includes(behavior)) ? behavior : "smooth";
    const container = chatContainerRef.current;
    if (container) {
      isAtTopRef.current = true;
      container.scrollTo({ top: 0, behavior: cleanBehavior });
      setShowScrollBottom(false);
    }
  }, [chatContainerRef]);

  // Keep pinned to anchor (bottom for chat, top for forum) when content/images resize
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      if (isForum) {
        if (isAtTopRef.current) {
          container.scrollTop = 0;
        }
      } else {
        if (isAtBottomRef.current) {
          container.scrollTop = container.scrollHeight;
        }
      }
    });

    ro.observe(container);
    if (container.firstElementChild) {
      ro.observe(container.firstElementChild);
    }

    return () => ro.disconnect();
  }, [isForum, chatContainerRef]);

  // Sticky-bottom: re-anchor to bottom when an embed finishes loading,
  // but ONLY if the user was already at the bottom (like Discord/Slack) and not in forum mode.
  useEffect(() => {
    const handleEmbedLoaded = () => {
      if (!isForum && isAtBottomRef.current) {
        requestAnimationFrame(() => {
          const container = chatContainerRef.current;
          if (container) {
            container.scrollTop = container.scrollHeight;
          } else {
            bottomRef.current?.scrollIntoView({ behavior: "instant" });
          }
        });
      }
    };

    window.addEventListener("onicord:embed-loaded", handleEmbedLoaded);
    return () => window.removeEventListener("onicord:embed-loaded", handleEmbedLoaded);
  }, [isForum, chatContainerRef, bottomRef]);

  // Initial load / new message scroll
  useEffect(() => {
    if (loading || !messages || messages.length === 0) return;

    const esHidratacionInicial = messagesCountRef.current === 0;
    const nuevoMensajeAgregado = messages.length > messagesCountRef.current;

    if (esHidratacionInicial || nuevoMensajeAgregado) {
      const performScroll = () => {
        const container = chatContainerRef.current;
        if (!container) return;

        if (isForum) {
          container.scrollTop = 0;
          isAtTopRef.current = true;
        } else {
          container.scrollTop = container.scrollHeight;
          isAtBottomRef.current = true;
        }
        setShowScrollBottom(false);
      };

      // Multi-frame settling to ensure absolute top/bottom even while markdown,
      // avatars, and attachments compute layout
      performScroll();
      const rafId = requestAnimationFrame(performScroll);
      const t1 = setTimeout(performScroll, 50);
      const t2 = setTimeout(performScroll, 150);
      const t3 = setTimeout(performScroll, 300);

      messagesCountRef.current = messages.length;
      return () => {
        cancelAnimationFrame(rafId);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }

    messagesCountRef.current = messages.length;
  }, [messages, loading, isForum, chatContainerRef, bottomRef, messagesCountRef]);

  const handleChatScroll = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    if (isForum) {
      // In forum channels, newest posts are at the top (scrollTop: 0)
      const atTop = container.scrollTop <= 20;
      isAtTopRef.current = atTop;

      if (container.scrollTop > 150) {
        setShowScrollBottom(true);
      } else if (atTop) {
        setShowScrollBottom(false);
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

    // Normal chat channel: track if user is at the bottom (within 20px threshold)
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom <= 20;
    isAtBottomRef.current = atBottom;

    if (distanceFromBottom > 150) {
      setShowScrollBottom(true);
    } else if (atBottom) {
      setShowScrollBottom(false);
    }

    if (messages.length <= visibleCount) return;

    if (container.scrollTop <= 40 && !isScrollingUpLoading) {
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
