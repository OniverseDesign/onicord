import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  getSelectionCharacterOffsets,
  setSelectionOffsets,
  renderHTMLForInput,
  applyMarkdownFormat,
} from "../../../lib/inputFormatter";
import {
  getActiveEmojiQuery,
  replaceCompletedShortcodeAtCursor,
  searchEmojis,
  addRecentEmoji,
} from "../../../lib/emojiData";

export function useChatComposer({ profile, peers }) {
  const [input, setInput] = useState("");
  const [selection, setSelection] = useState(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showCommandsPopup, setShowCommandsPopup] = useState(false);
  const [showMentionsPopup, setShowMentionsPopup] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState(null);
  const [stickersTargetRect, setStickersTargetRect] = useState(null);
  const [emojisTargetRect, setEmojisTargetRect] = useState(null);

  const tyrannyInputRef = useRef(null);
  const isLocalTypingRef = useRef(false);
  const emojiQueryRef = useRef(null);

  useEffect(() => {
    emojiQueryRef.current = emojiQuery;
  }, [emojiQuery]);

  const allUsers = useMemo(
    () => [
      { id: profile?.id, nickname: profile?.nickname || "Usuario" },
      ...Object.values(peers || {}).map((p) => ({
        id: p.id,
        nickname: p.nickname,
      })),
    ],
    [profile, peers]
  );

  // Measure selection and popover position directly over highlighted text
  const handleInputSelection = useCallback(() => {
    const inputEl = tyrannyInputRef.current;
    if (!inputEl) return;

    const { start, end } = getSelectionCharacterOffsets(inputEl);

    if (start !== end) {
      const winSel = window.getSelection();
      if (!winSel || winSel.rangeCount === 0 || winSel.isCollapsed) {
        setSelection(null);
        return;
      }

      const range = winSel.getRangeAt(0);
      if (!inputEl.contains(range.startContainer) || !inputEl.contains(range.endContainer)) {
        setSelection(null);
        return;
      }

      const rects = range.getClientRects();
      const textRect = rects && rects.length > 0 ? rects[0] : range.getBoundingClientRect();

      if (!textRect || (textRect.width === 0 && textRect.height === 0)) {
        setSelection(null);
        return;
      }

      const inputRect = inputEl.getBoundingClientRect();
      // Hide if selection has scrolled out of inputEl's visible bounds
      if (textRect.bottom < inputRect.top || textRect.top > inputRect.bottom) {
        setSelection(null);
        return;
      }

      const chatPanelEl = inputEl.closest(".onicord-chat-input-bar") || inputEl;
      const containerRect = chatPanelEl.getBoundingClientRect();

      const centerX = textRect.left + textRect.width / 2;

      // Estimate toolbar width as ~270px (half is 135px) + padding
      const halfBarWidth = 135;
      const padding = 8;
      let clampedX = centerX;

      if (containerRect.width >= halfBarWidth * 2 + padding * 2) {
        const minX = containerRect.left + halfBarWidth + padding;
        const maxX = containerRect.right - halfBarWidth - padding;
        clampedX = Math.max(minX, Math.min(centerX, maxX));
      } else {
        const minX = halfBarWidth + padding;
        const maxX = window.innerWidth - halfBarWidth - padding;
        clampedX = Math.max(minX, Math.min(centerX, maxX));
      }

      // Vertical position: 8px above the top of the selected text line
      let topY = textRect.top - 8;
      let placement = "top";

      // If too close to the top of the screen (less than 48px), flip below
      if (topY < 48) {
        topY = textRect.bottom + 8;
        placement = "bottom";
      }

      setSelection({
        start,
        end,
        x: clampedX,
        y: topY,
        left: clampedX,
        top: topY,
        placement,
        containerBounds: {
          left: containerRect.left,
          right: containerRect.right,
          width: containerRect.width,
        },
      });
    } else {
      setSelection(null);
    }
  }, []);

  // Sync selection with document selection changes
  useEffect(() => {
    const handleDocSelectionChange = () => {
      const inputEl = tyrannyInputRef.current;
      if (!inputEl) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        setSelection((prev) => (prev ? null : prev));
        return;
      }

      if (!inputEl.contains(sel.anchorNode) || !inputEl.contains(sel.focusNode)) {
        setSelection((prev) => (prev ? null : prev));
        return;
      }

      if (sel.isCollapsed) {
        setSelection((prev) => (prev ? null : prev));
        const activeEmoji = emojiQueryRef.current;
        if (activeEmoji) {
          const offsets = getSelectionCharacterOffsets(inputEl);
          const currentActive = getActiveEmojiQuery(
            inputEl.textContent || "",
            offsets.start
          );
          if (
            !currentActive ||
            currentActive.startIndex !== activeEmoji.startIndex
          ) {
            setEmojiQuery(null);
          }
        }
        return;
      }

      handleInputSelection();
    };

    document.addEventListener("selectionchange", handleDocSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleDocSelectionChange);
    };
  }, [handleInputSelection]);

  // Update floating bar position if input scrolls or window resizes while text is selected
  useEffect(() => {
    const inputEl = tyrannyInputRef.current;
    if (!inputEl) return;

    const handleUpdate = () => {
      if (selection) {
        handleInputSelection();
      }
    };

    inputEl.addEventListener("scroll", handleUpdate, { passive: true });
    window.addEventListener("resize", handleUpdate, { passive: true });
    return () => {
      inputEl.removeEventListener("scroll", handleUpdate);
      window.removeEventListener("resize", handleUpdate);
    };
  }, [selection, handleInputSelection]);

  // Sync contenteditable HTML when input changes externally
  useEffect(() => {
    const el = tyrannyInputRef.current;
    if (!el) return;

    const isLocalTyping = isLocalTypingRef.current;
    isLocalTypingRef.current = false;

    if (isLocalTyping && el.textContent !== input) {
      return;
    }

    const targetHTML = renderHTMLForInput(input, allUsers);

    const hasFormattingSpans = targetHTML.includes("<span");
    if (!hasFormattingSpans && el.textContent === input) {
      return;
    }

    if (el.innerHTML !== targetHTML) {
      const offsets = getSelectionCharacterOffsets(el);
      el.innerHTML = targetHTML;
      setSelectionOffsets(el, offsets.start, offsets.end);
    }
  }, [input, allUsers]);

  // Track /commands and @mentions trigger
  useEffect(() => {
    if (!input) {
      setShowCommandsPopup(false);
      setShowMentionsPopup(false);
      setEmojiQuery(null);
      return;
    }

    const partes = input.split(" ");
    const ultimaPalabra = partes[partes.length - 1];

    const isCommand = partes.length === 1 && input.startsWith("/");
    const isMention = ultimaPalabra.startsWith("@");

    setShowCommandsPopup(isCommand);
    setShowMentionsPopup(isMention);
    if (isCommand || isMention) {
      setEmojiQuery(null);
    }
  }, [input]);

  // Process typed input for live :shortcode: replacement and :query autocomplete
  const processComposerInput = useCallback(
    (rawText) => {
      const el = tyrannyInputRef.current;
      let cursorPos = rawText.length;
      let isCollapsed = true;

      if (el) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (
            el.contains(range.startContainer) &&
            el.contains(range.endContainer)
          ) {
            const offsets = getSelectionCharacterOffsets(el);
            cursorPos = offsets.end;
            isCollapsed = offsets.start === offsets.end;
          }
        }
      }

      if (isCollapsed) {
        const replaced = replaceCompletedShortcodeAtCursor(rawText, cursorPos);
        if (replaced) {
          if (el) {
            el.innerHTML = renderHTMLForInput(replaced.newText, allUsers);
            setSelectionOffsets(el, replaced.newCursorPos, replaced.newCursorPos);
          }
          addRecentEmoji(replaced.emoji);
          isLocalTypingRef.current = false;
          setInput(replaced.newText);
          setEmojiQuery(null);
          setShowMentionsPopup(false);
          setShowCommandsPopup(false);
          return replaced.newText;
        }
      }

      isLocalTypingRef.current = true;
      setInput(rawText);

      const active = isCollapsed ? getActiveEmojiQuery(rawText, cursorPos) : null;
      if (active && searchEmojis(active.query, { limit: 1 }).length > 0) {
        setEmojiQuery(active);
      } else {
        setEmojiQuery(null);
      }

      return rawText;
    },
    [allUsers]
  );

  // Insert emoji at caret
  const handleSelectEmoji = useCallback((emoji) => {
    const el = tyrannyInputRef.current;
    if (!el) return;
    el.focus();

    const sel = window.getSelection();
    if (sel.getRangeAt && sel.rangeCount) {
      const range = sel.getRangeAt(0);
      if (el.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        const textNode = document.createTextNode(emoji);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        el.innerText += emoji;
      }
    } else {
      el.innerText += emoji;
    }

    setEmojiQuery(null);
    setInput(el.textContent || "");
  }, []);

  // Apply markdown formatting (bold, italic, strike, spoiler, etc.)
  const applyFormatting = useCallback((prefix, suffix = prefix) => {
    const inputEl = tyrannyInputRef.current;
    if (!inputEl) return;

    let start = 0;
    let end = 0;
    const offsets = getSelectionCharacterOffsets(inputEl);
    if (offsets.start !== offsets.end) {
      start = offsets.start;
      end = offsets.end;
    } else if (selection && selection.start !== selection.end) {
      start = selection.start;
      end = selection.end;
    } else {
      start = offsets.start;
      end = offsets.end;
    }

    const text = inputEl.textContent || input || "";
    const { newText, newStart, newEnd } = applyMarkdownFormat(
      text,
      { start, end },
      prefix,
      suffix
    );

    setInput(newText);
    setSelection(null);

    inputEl.innerHTML = renderHTMLForInput(newText, allUsers);

    requestAnimationFrame(() => {
      inputEl.focus();
      setSelectionOffsets(inputEl, newStart, newEnd);
    });
  }, [allUsers, input, selection]);

  return {
    input,
    setInput,
    selection,
    setSelection,
    isInputFocused,
    setIsInputFocused,
    showCommandsPopup,
    setShowCommandsPopup,
    showMentionsPopup,
    setShowMentionsPopup,
    emojiQuery,
    setEmojiQuery,
    stickersTargetRect,
    setStickersTargetRect,
    emojisTargetRect,
    setEmojisTargetRect,
    tyrannyInputRef,
    isLocalTypingRef,
    handleInputSelection,
    processComposerInput,
    handleSelectEmoji,
    applyFormatting,
  };
}
