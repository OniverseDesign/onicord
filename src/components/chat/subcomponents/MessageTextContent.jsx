import React from "react";
import { parseInlineStyles } from "../../../lib/messageParser";

export function parseBlocks(text, allUsers, searchQuery, roles = []) {
  if (!text) return [];

  const codeBlockRegex = /```([\s\S]*?)```/g;
  const blocks = [];
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const matchIndex = match.index;

    if (matchIndex > lastIndex) {
      blocks.push({
        type: "content",
        content: text.substring(lastIndex, matchIndex),
      });
    }

    blocks.push({
      type: "code_block",
      content: match[1].trim(),
    });

    lastIndex = codeBlockRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    blocks.push({
      type: "content",
      content: text.substring(lastIndex),
    });
  }

  // Parse blockquotes and line breaks
  const finalBlocks = [];
  for (const block of blocks) {
    if (block.type === "code_block") {
      finalBlocks.push(block);
      continue;
    }

    const lines = block.content.split("\n");
    let currentQuoteLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith("> ") || line.startsWith(">")) {
        const quoteContent = line.startsWith("> ")
          ? line.substring(2)
          : line.substring(1);
        currentQuoteLines.push(quoteContent);
      } else {
        if (currentQuoteLines.length > 0) {
          finalBlocks.push({
            type: "blockquote",
            content: currentQuoteLines.join("\n"),
          });
          currentQuoteLines = [];
        }

        if (line.startsWith("# ")) {
          finalBlocks.push({
            type: "heading1",
            content: line.substring(2),
          });
        } else if (line.startsWith("## ")) {
          finalBlocks.push({
            type: "heading2",
            content: line.substring(3),
          });
        } else if (line.startsWith("### ")) {
          finalBlocks.push({
            type: "heading3",
            content: line.substring(4),
          });
        } else {
          finalBlocks.push({
            type: "line",
            content: line,
          });
        }
      }
    }

    if (currentQuoteLines.length > 0) {
      finalBlocks.push({
        type: "blockquote",
        content: currentQuoteLines.join("\n"),
      });
    }
  }

  return finalBlocks.map((block, i) => {
    switch (block.type) {
      case "code_block":
        return (
          <pre
            key={i}
            className="bg-onicord-mantle/80 border border-onicord-island rounded-md p-3.5 font-mono text-xs my-2 overflow-x-auto whitespace-pre-wrap select-text text-left max-w-fit leading-relaxed"
          >
            <code className="text-onicord-text">{block.content}</code>
          </pre>
        );
      case "blockquote":
        return (
          <blockquote
            key={i}
            className="border-l-4 border-onicord-accent/50 bg-white/5 pl-3 py-1.5 my-1.5 rounded-r-md text-onicord-muted italic text-left select-text leading-relaxed"
          >
            {parseInlineStyles(block.content, allUsers, searchQuery, roles)}
          </blockquote>
        );
      case "heading1":
        return (
          <h1
            key={i}
            className="text-xl font-black text-white mt-4 mb-2 text-left select-text leading-snug border-b border-white/5 pb-1"
          >
            {parseInlineStyles(block.content, allUsers, searchQuery, roles)}
          </h1>
        );
      case "heading2":
        return (
          <h2
            key={i}
            className="text-lg font-black text-white mt-3.5 mb-1.5 text-left select-text leading-snug"
          >
            {parseInlineStyles(block.content, allUsers, searchQuery, roles)}
          </h2>
        );
      case "heading3":
        return (
          <h3
            key={i}
            className="text-base font-extrabold text-white mt-3 mb-1 text-left select-text leading-snug"
          >
            {parseInlineStyles(block.content, allUsers, searchQuery, roles)}
          </h3>
        );
      case "line":
      default:
        return (
          <div
            key={i}
            className="min-h-[1.2em] text-left"
            style={{ lineHeight: "var(--onicord-chat-line-height, 1.5)" }}
          >
            {parseInlineStyles(block.content, allUsers, searchQuery, roles)}
          </div>
        );
    }
  });
}

export function parseMessageText(
  text,
  peers,
  profile,
  searchQuery = "",
  isReplyPreview = false,
  roles = [],
) {
  if (!text) return "";

  if (text.startsWith('{"type":"sticker"')) {
    try {
      const parsed = JSON.parse(text);
      return `[Sticker: ${parsed.stickerName || parsed.stickerId}]`;
    } catch (e) {
      return "[Sticker]";
    }
  }

  const allUsers = [
    { id: profile?.id, nickname: profile?.nickname || "Usuario" },
    ...Object.values(peers || {}).map((p) => ({
      id: p.id,
      nickname: p.nickname,
    })),
  ];

  if (isReplyPreview) {
    let cleanText = text;
    cleanText = cleanText.replace(/```/g, "").replace(/^>\s?/gm, "");
    cleanText = cleanText.replace(/^#{1,3}\s?/gm, "");
    cleanText = cleanText.replace(/\n+/g, " ");
    return parseInlineStyles(cleanText, allUsers, searchQuery, roles);
  }

  return parseBlocks(text, allUsers, searchQuery, roles);
}

export default function MessageTextContent({
  textContent,
  peers,
  profile,
  searchQuery = "",
  roles = [],
}) {
  if (!textContent || textContent.length === 0) return null;

  return (
    <div
      className="whitespace-pre-wrap break-words text-[15px] text-onicord-subtext select-text cursor-text"
      style={{ lineHeight: "var(--onicord-chat-line-height, 1.5)" }}
    >
      {parseMessageText(textContent, peers, profile, searchQuery, false, roles)}
    </div>
  );
}
