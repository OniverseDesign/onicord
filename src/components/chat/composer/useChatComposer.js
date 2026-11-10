import { useState, useRef, useEffect, useCallback } from "react";
import {
  getSelectionCharacterOffsets,
  setSelectionOffsets,
  renderHTMLForInput,
  applyMarkdownFormat,
} from "../../../lib/inputFormatter";

const measureTextWidth = (text, font) => {
  const canvas =
    measureTextWidth.canvas ||
    (measureTextWidth.canvas = document.createElement("canvas"));
  const context = canvas.getContext("2d");
  context.font = font || '15px "Roboto", system-ui, -apple-system, sans-serif';
  return context.measureText(text).width;
};

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

  // Measure selection and popover position
  const handleInputSelection = useCallback(() => {
    const inputEl = tyrannyInputRef.current;
    if (!inputEl) return;

    const { start, end } = getSelectionCharacterOffsets(inputEl);

    if (start !== end) {
      const styles = window.getComputedStyle(inputEl);
      const font = `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`;

      const textVal = inputEl.textContent || "";
      const textBefore = textVal.substring(0, start);
      const textSelection = textVal.substring(start, end);

      const widthBefore = measureTextWidth(textBefore, font);
      const widthSelection = measureTextWidth(textSelection, font);

      const paddingLeft = parseFloat(styles.paddingLeft) || 0;
      const xPos = paddingLeft + widthBefore + widthSelection / 2 - inputEl.scrollLeft;

      const relativeLeft = inputEl.offsetLeft + xPos;

      const chatPanelEl =
        inputEl.closest(".onicord-chat-input-bar") || inputEl.parentElement;
      const containerWidth = chatPanelEl?.getBoundingClientRect().width || 400;
      const constrainedLeft = Math.max(130, Math.min(relativeLeft, containerWidth - 130));

      setSelection({
        start,
        end,
        left: constrainedLeft,
      });
    } else {
      setSelection(null);
    }
  }, []);

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
