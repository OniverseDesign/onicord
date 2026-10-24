import { useRef, useEffect, useState, useCallback } from "react";

export function useChatScroll({
  messages = [],
  loading = false,
  visibleCount = 40,
  setVisibleCount,
  chatContainerRef: externalContainerRef,
  bottomRef: externalBottomRef,
  messagesCountRef: externalMessagesCountRef,
}) {
  const internalContainerRef = useRef(null);
  const internalBottomRef = useRef(null);
  const internalMessagesCountRef = useRef(0);

  const chatContainerRef = externalContainerRef || internalContainerRef;
  const bottomRef = externalBottomRef || internalBottomRef;
  const messagesCountRef = externalMessagesCountRef || internalMessagesCountRef;

  const isAtBottomRef = useRef(true);
  const [isScrollingUpLoading, setIsScrollingUpLoading] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior });
      setShowScrollBottom(false);
    }
  }, []);

  // Sticky-bottom: re-anchor to bottom when an embed finishes loading,
  // but ONLY if the user was already at the bottom (like Discord/Slack).
  useEffect(() => {
    const handleEmbedLoaded = () => {
      if (isAtBottomRef.current) {
        requestAnimationFrame(() => {
          bottomRef.current?.scrollIntoView({ behavior: "instant" });
        });
      }
    };

    window.addEventListener("onicord:embed-loaded", handleEmbedLoaded);
    return () => window.removeEventListener("onicord:embed-loaded", handleEmbedLoaded);
  }, []);

  // Initial load / new message scroll
  useEffect(() => {
    if (loading || !messages || messages.length === 0) return;

    const esHidratacionInicial = messagesCountRef.current === 0;
    const nuevoMensajeAgregado = messages.length > messagesCountRef.current;

    if (esHidratacionInicial || nuevoMensajeAgregado) {
      const timerScroll = setTimeout(() => {
        if (bottomRef.current) {
          bottomRef.current.scrollIntoView({
            behavior: "smooth",
          });
          setShowScrollBottom(false);
        }
      }, 50);

      messagesCountRef.current = messages.length;
      return () => clearTimeout(timerScroll);
    }

    messagesCountRef.current = messages.length;
  }, [messages, loading]);

  const handleChatScroll = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    // Track if user is at the bottom (within 80px threshold)
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const atBottom = distanceFromBottom <= 80;
    isAtBottomRef.current = atBottom;

    if (distanceFromBottom > 200) {
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
  }, [messages.length, visibleCount, isScrollingUpLoading, setVisibleCount]);

  return {
    chatContainerRef,
    bottomRef,
    isAtBottomRef,
    isScrollingUpLoading,
    showScrollBottom,
    scrollToBottom,
    handleChatScroll,
    messagesCountRef,
  };
}
