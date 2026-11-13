import { useState, useRef, useEffect, useCallback } from "react";
import {
  getSelectionCharacterOffsets,
  setSelectionOffsets,
  renderHTMLForInput,
  applyMarkdownFormat,
} from "../../../lib/inputFormatter";

export function useChatComposer({ profile, peers }) {
  const [input, setInput] = useState("");
  const [selection, setSelection] = useState(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [showCommandsPopup, setShowCommandsPopup] = useState(false);
  const [showMentionsPopup, setShowMentionsPopup] = useState(false);
  const [stickersTargetRect, setStickersTargetRect] = useState(null);
  const [emojisTargetRect, setEmojisTargetRect] = useState(null);

  const tyrannyInputRef = useRef(null);
  const isLocalTypingRef = useRef(false);

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
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setSelection((prev) => (prev ? null : prev));
        return;
      }

      if (!inputEl.contains(sel.anchorNode) || !inputEl.contains(sel.focusNode)) {
        setSelection((prev) => (prev ? null : prev));
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

    const allUsers = [
      { id: profile?.id, nickname: profile?.nickname || "Usuario" },
      ...Object.values(peers || {}).map((p) => ({
        id: p.id,
        nickname: p.nickname,
      })),
    ];
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
  }, [input, profile, peers]);

  // Track /commands and @mentions trigger
  useEffect(() => {
    if (!input) {
      setShowCommandsPopup(false);
      setShowMentionsPopup(false);
      return;
    }

    const partes = input.split(" ");
    const ultimaPalabra = partes[partes.length - 1];

    setShowCommandsPopup(partes.length === 1 && input.startsWith("/"));
    setShowMentionsPopup(ultimaPalabra.startsWith("@"));
  }, [input]);

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

    const allUsers = [
      { id: profile?.id, nickname: profile?.nickname || "Usuario" },
      ...Object.values(peers || {}).map((p) => ({
        id: p.id,
        nickname: p.nickname,
      })),
    ];
    inputEl.innerHTML = renderHTMLForInput(newText, allUsers);

    requestAnimationFrame(() => {
      inputEl.focus();
      setSelectionOffsets(inputEl, newStart, newEnd);
    });
  }, [input, peers, profile, selection]);

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
    stickersTargetRect,
    setStickersTargetRect,
    emojisTargetRect,
    setEmojisTargetRect,
    tyrannyInputRef,
    isLocalTypingRef,
    handleInputSelection,
    handleSelectEmoji,
    applyFormatting,
  };
}
