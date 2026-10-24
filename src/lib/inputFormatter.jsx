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

export function applyMarkdownFormat(text = "", offsets = { start: 0, end: 0 }, prefix = "", suffix = prefix) {
  const actualText = typeof text === "string" ? text : "";
  const actualPrefix = typeof prefix === "string" ? prefix : "";
  const actualSuffix = typeof suffix === "string" ? suffix : actualPrefix;

  let s = Math.max(0, Math.min(offsets?.start ?? 0, actualText.length));
  let e = Math.max(0, Math.min(offsets?.end ?? 0, actualText.length));
  if (s > e) {
    const tmp = s;
    s = e;
    e = tmp;
  }

  // Helper for checking if a string starts and ends with delimiters, avoiding confusion between * and **
  const isMatchingDelimiter = (str, pfx, sfx) => {
    if (!str.startsWith(pfx) || !str.endsWith(sfx)) return false;
    if (str.length < pfx.length + sfx.length) return false;
    if (pfx === "*" && sfx === "*") {
      if (str.startsWith("**") && !str.startsWith("***")) return false;
      if (str.endsWith("**") && !str.endsWith("***")) return false;
    }
    return true;
  };

  // Block format: Quotes (> )
  if (actualPrefix === "> ") {
    if (s === e) {
      const lineStart = actualText.lastIndexOf("\n", s - 1) + 1;
      if (actualText.substring(lineStart, lineStart + 2) === "> ") {
        const newText = actualText.substring(0, lineStart) + actualText.substring(lineStart + 2);
        const newPos = Math.max(lineStart, s - 2);
        return { newText, newStart: newPos, newEnd: newPos };
      } else {
        const newText = actualText.substring(0, lineStart) + "> " + actualText.substring(lineStart);
        const newPos = s + 2;
        return { newText, newStart: newPos, newEnd: newPos };
      }
    }

    const selected = actualText.substring(s, e);
    const lines = selected.split("\n");
    const allHaveQuote = lines.every((l) => l.startsWith("> ") || l.startsWith(">"));
    let replacement;
    if (allHaveQuote) {
      replacement = lines.map((l) => (l.startsWith("> ") ? l.substring(2) : l.substring(1))).join("\n");
    } else {
      replacement = lines.map((l) => (l.startsWith("> ") ? l : (l.startsWith(">") ? `> ${l.substring(1)}` : `> ${l}`))).join("\n");
    }
    const newText = actualText.substring(0, s) + replacement + actualText.substring(e);
    return { newText, newStart: s, newEnd: s + replacement.length };
  }

  // Block format: Headings (### )
  if (actualPrefix === "### ") {
    if (s === e) {
      const lineStart = actualText.lastIndexOf("\n", s - 1) + 1;
      if (actualText.substring(lineStart, lineStart + 4) === "### ") {
        const newText = actualText.substring(0, lineStart) + actualText.substring(lineStart + 4);
        const newPos = Math.max(lineStart, s - 4);
        return { newText, newStart: newPos, newEnd: newPos };
      } else {
        const newText = actualText.substring(0, lineStart) + "### " + actualText.substring(lineStart);
        const newPos = s + 4;
        return { newText, newStart: newPos, newEnd: newPos };
      }
    }

    const selected = actualText.substring(s, e);
    const lines = selected.split("\n");
    const allHaveHeading = lines.every((l) => l.startsWith("### "));
    let replacement;
    if (allHaveHeading) {
      replacement = lines.map((l) => l.substring(4)).join("\n");
    } else {
      replacement = lines.map((l) => (l.startsWith("### ") ? l : `### ${l}`)).join("\n");
    }
    const newText = actualText.substring(0, s) + replacement + actualText.substring(e);
    return { newText, newStart: s, newEnd: s + replacement.length };
  }

  // Block format: Code block (```\n ... \n```)
  if (actualPrefix === "```\n" && actualSuffix === "\n```") {
    if (s === e) {
      const replacement = "```\n\n```";
      const newText = actualText.substring(0, s) + replacement + actualText.substring(e);
      const caretPos = s + 4;
      return { newText, newStart: caretPos, newEnd: caretPos };
    }

    const selected = actualText.substring(s, e);
    if (selected.startsWith("```\n") && selected.endsWith("\n```")) {
      const replacement = selected.substring(4, selected.length - 4);
      const newText = actualText.substring(0, s) + replacement + actualText.substring(e);
      return { newText, newStart: s, newEnd: s + replacement.length };
    }

    if (
      s >= 4 &&
      e + 4 <= actualText.length &&
      actualText.substring(s - 4, s) === "```\n" &&
      actualText.substring(e, e + 4) === "\n```"
    ) {
      const newText = actualText.substring(0, s - 4) + selected + actualText.substring(e + 4);
      return { newText, newStart: s - 4, newEnd: s - 4 + selected.length };
    }

    const replacement = `\`\`\`\n${selected}\n\`\`\``;
    const newText = actualText.substring(0, s) + replacement + actualText.substring(e);
    return { newText, newStart: s, newEnd: s + replacement.length };
  }

  // Inline formatting: Bold, Italic, Strike, Code, etc.
  if (s === e) {
    const replacement = actualPrefix + actualSuffix;
    const newText = actualText.substring(0, s) + replacement + actualText.substring(e);
    const caretPos = s + actualPrefix.length;
    return { newText, newStart: caretPos, newEnd: caretPos };
  }

  const selected = actualText.substring(s, e);

  // 1. If selection itself starts & ends with delimiters, unwrap it
  if (isMatchingDelimiter(selected, actualPrefix, actualSuffix)) {
    const replacement = selected.substring(actualPrefix.length, selected.length - actualSuffix.length);
    const newText = actualText.substring(0, s) + replacement + actualText.substring(e);
    return { newText, newStart: s, newEnd: s + replacement.length };
  }

  // 2. If delimiters surround the selection immediately on the outside, unwrap them
  const hasOuterDelimiters =
    s >= actualPrefix.length &&
    e + actualSuffix.length <= actualText.length &&
    actualText.substring(s - actualPrefix.length, s) === actualPrefix &&
    actualText.substring(e, e + actualSuffix.length) === actualSuffix &&
    (actualPrefix !== "*" || (
      (s < 2 || actualText.substring(s - 2, s) !== "**" || (s >= 3 && actualText.substring(s - 3, s) === "***")) &&
      (e + 2 > actualText.length || actualText.substring(e, e + 2) !== "**" || (e + 3 <= actualText.length && actualText.substring(e, e + 3) === "***"))
    ));

  if (hasOuterDelimiters) {
    const newText = actualText.substring(0, s - actualPrefix.length) + selected + actualText.substring(e + actualSuffix.length);
    const newStart = s - actualPrefix.length;
    const newEnd = newStart + selected.length;
    return { newText, newStart, newEnd };
  }

  // 3. Otherwise wrap selection
  const replacement = actualPrefix + selected + actualSuffix;
  const newText = actualText.substring(0, s) + replacement + actualText.substring(e);
  return { newText, newStart: s, newEnd: s + replacement.length };
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

  tokens = parseRegexToken(tokens, /\*\*\*([^*]+)\*\*\*/g, (match) => ({
    type: "bold_italic",
    raw: match[0],
    content: match[1],
  }));
  tokens = parseRegexToken(tokens, /___([^_]+)___/g, (match) => ({
    type: "bold_italic",
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
    const userMatch = (allUsers || []).find(
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
          case "bold_italic":
            return `<span class="font-bold italic text-white underline decoration-onicord-accent/40 decoration-1 underline-offset-2"><span class="opacity-30">***</span>${escapeHTML(token.content)}<span class="opacity-30">***</span></span>`;
          case "bold":
            return `<span class="font-bold text-white underline decoration-onicord-accent/40 decoration-1 underline-offset-2"><span class="opacity-30">**</span>${renderTokens([{ type: "text", content: token.content }])}<span class="opacity-30">**</span></span>`;
          case "italic":
            return `<span class="italic text-[var(--onicord-lavender)]"><span class="opacity-30">*</span>${escapeHTML(token.content)}<span class="opacity-30">*</span></span>`;
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
