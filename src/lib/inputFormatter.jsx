import React from "react";

export function parseRegexToken(tokens, regex, factory) {
  const result = [];
  for (const token of tokens) {
    if (token.type !== "text") {
      result.push(token);
      continue;
    }

    let lastIndex = 0;
    let match;
    regex.lastIndex = 0;

    const text = token.content;
    let hasMatch = false;

    while ((match = regex.exec(text)) !== null) {
      hasMatch = true;
      const matchIndex = match.index;

      if (matchIndex > lastIndex) {
        result.push({ type: "text", content: text.substring(lastIndex, matchIndex) });
      }

      const newToken = factory(match);
      if (newToken) {
        result.push(newToken);
      } else {
        result.push({ type: "text", content: match[0] });
      }

      lastIndex = regex.lastIndex;
    }

    if (hasMatch) {
      if (lastIndex < text.length) {
        result.push({ type: "text", content: text.substring(lastIndex) });
      }
    } else {
      result.push(token);
    }
  }
  return result;
}

export function getSelectionCharacterOffsets(element) {
  let start = 0;
  let end = 0;
  const doc = element.ownerDocument || element.document;
  const win = doc.defaultView || doc.parentWindow;
  const sel = win.getSelection();
  if (sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.startContainer, range.startOffset);
    start = preCaretRange.toString().length;
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    end = preCaretRange.toString().length;
  }
  return { start, end };
}

export function setSelectionOffsets(element, start, end) {
  const range = document.createRange();
  const sel = window.getSelection();
  
  let currentOffset = 0;
  let startNode = null;
  let startOffset = 0;
  let endNode = null;
  let endOffset = 0;
  
  function traverse(el) {
    for (let i = 0; i < el.childNodes.length; i++) {
      const child = el.childNodes[i];
      if (child.nodeType === Node.TEXT_NODE) {
        const len = child.textContent.length;
        if (!startNode && currentOffset + len >= start) {
          startNode = child;
          startOffset = start - currentOffset;
        }
        if (!endNode && currentOffset + len >= end) {
          endNode = child;
          endOffset = end - currentOffset;
        }
        currentOffset += len;
      } else {
        traverse(child);
      }
    }
  }
  
  traverse(element);
  
  // Fallbacks if node is not found (e.g. empty content)
  if (!startNode) {
    startNode = element;
    startOffset = 0;
  }
  if (!endNode) {
    endNode = element;
    endOffset = 0;
  }
  
  try {
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (e) {
    console.error("Error setting selection offsets:", e);
  }
}

export function renderHTMLForInput(text, allUsers) {
  if (!text) return "";

  const escapeHTML = (str) =>
    str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  let tokens = [{ type: "text", content: text }];

  tokens = parseRegexToken(tokens, /`([^`]+)`/g, (match) => ({
    type: "code",
    raw: match[0],
    content: match[1],
  }));

  tokens = parseRegexToken(tokens, /\*\*([^*]+)\*\*/g, (match) => ({
    type: "bold",
    raw: match[0],
    content: match[1],
  }));
  tokens = parseRegexToken(tokens, /__([^_]+)__/g, (match) => ({
    type: "bold",
    raw: match[0],
    content: match[1],
  }));

  tokens = parseRegexToken(tokens, /\*([^*]+)\*/g, (match) => ({
    type: "italic",
    raw: match[0],
    content: match[1],
  }));
  tokens = parseRegexToken(tokens, /_([^_]+)_/g, (match) => ({
    type: "italic",
    raw: match[0],
    content: match[1],
  }));

  tokens = parseRegexToken(tokens, /~~([^~]+)~~/g, (match) => ({
    type: "strike",
    raw: match[0],
    content: match[1],
  }));

  const mentionRegex = /@([a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_.-]+)/g;
  tokens = parseRegexToken(tokens, mentionRegex, (match) => {
    const handle = match[1].toLowerCase();
    const userMatch = allUsers.find(
      (u) => u.nickname?.toLowerCase() === handle
    );
    if (userMatch) {
      return {
        type: "mention",
        raw: match[0],
        content: userMatch.nickname,
      };
    }
    return null;
  });

  const renderTokens = (tkns) => {
    return tkns
      .map((token) => {
        switch (token.type) {
          case "code":
            return `<span class="bg-black/35 border border-white/10 rounded px-1 text-[14px] text-onicord-accent font-semibold mx-0.5"><span class="opacity-30">\`</span>${escapeHTML(token.content)}<span class="opacity-30">\`</span></span>`;
          case "bold":
            return `<span class="text-white underline decoration-onicord-accent/40 decoration-1 underline-offset-2"><span class="opacity-30">**</span>${renderTokens([{ type: "text", content: token.content }])}<span class="opacity-30">**</span></span>`;
          case "italic":
            return `<span class="text-[var(--onicord-lavender)]"><span class="opacity-30">*</span>${escapeHTML(token.content)}<span class="opacity-30">*</span></span>`;
          case "strike":
            return `<span class="line-through text-onicord-muted/70"><span class="opacity-30">~~</span>${escapeHTML(token.content)}<span class="opacity-30">~~</span></span>`;
          case "mention":
            return `<span class="bg-onicord-accent/10 border border-onicord-accent/20 text-onicord-accent rounded px-1 text-[14px] font-semibold">${escapeHTML(token.raw)}</span>`;
          case "text":
          default:
            return escapeHTML(token.content);
        }
      })
      .join("");
  };

  return renderTokens(tokens);
}

// Deprecated, replaced by contenteditable renderHTMLForInput but kept for compatibility checks
export function parseInputFormatting(text, allUsers) {
  return renderHTMLForInput(text, allUsers);
}
