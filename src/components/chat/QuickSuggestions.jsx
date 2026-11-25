import React, { memo, useEffect, useRef } from "react";
import { CUSTOM_EMOJI_TOKEN_SOURCE } from "../../lib/emojiData";
import { parseRegexToken } from "../../lib/inputFormatter";
import InlineCustomEmoji from "./subcomponents/InlineCustomEmoji";
import MaterialIcon from "../icons/MaterialIcon";
import { getReadableSuggestionText } from "./composer/useQuickSuggestions";

function renderSuggestionContent(text, keyPrefix = "root") {
  if (!text) return null;

  let tokens = [{ type: "text", content: text }];

  tokens = parseRegexToken(tokens, /`([^`]+)`/g, (match) => ({
    type: "code",
    content: match[1],
  }));

  tokens = parseRegexToken(
    tokens,
    new RegExp(CUSTOM_EMOJI_TOKEN_SOURCE, "gi"),
    (match) => ({
      type: "custom_emoji",
      animated: match[1].toLowerCase() === "a",
      shortcode: match[2],
      id: match[3],
      ext: match[4].toLowerCase(),
    })
  );

  tokens = parseRegexToken(tokens, /\*\*\*([^*]+)\*\*\*/g, (match) => ({
    type: "bold_italic",
    content: match[1],
  }));
  tokens = parseRegexToken(tokens, /___([^_]+)___/g, (match) => ({
    type: "bold_italic",
    content: match[1],
  }));
  tokens = parseRegexToken(tokens, /\*\*([^*]+)\*\*/g, (match) => ({
    type: "bold",
    content: match[1],
  }));
  tokens = parseRegexToken(tokens, /__([^_]+)__/g, (match) => ({
    type: "bold",
    content: match[1],
  }));
  tokens = parseRegexToken(tokens, /\*([^*]+)\*/g, (match) => ({
    type: "italic",
    content: match[1],
  }));
  tokens = parseRegexToken(tokens, /_([^_]+)_/g, (match) => ({
    type: "italic",
    content: match[1],
  }));
  tokens = parseRegexToken(tokens, /~~([^~]+)~~/g, (match) => ({
    type: "strike",
    content: match[1],
  }));

  return tokens.map((token, idx) => {
    const key = `${keyPrefix}-${idx}`;
    switch (token.type) {
      case "code":
        return (
          <code
            key={key}
            className="bg-onicord-base/70 border border-onicord-island rounded px-1 font-mono text-xs text-onicord-accent"
          >
            {token.content}
          </code>
        );
      case "custom_emoji":
        return (
          <InlineCustomEmoji
            key={key}
            animated={token.animated}
            shortcode={token.shortcode}
            id={token.id}
            ext={token.ext}
            sizeClass="w-4 h-4"
            className="mx-0.5"
            showTooltip={false}
          />
        );
      case "bold_italic":
        return (
          <strong key={key} className="font-bold italic">
            {renderSuggestionContent(token.content, key)}
          </strong>
        );
      case "bold":
        return (
          <strong key={key} className="font-bold">
            {renderSuggestionContent(token.content, key)}
          </strong>
        );
      case "italic":
        return (
          <em key={key} className="italic">
            {renderSuggestionContent(token.content, key)}
          </em>
        );
      case "strike":
        return (
          <span key={key} className="line-through opacity-70">
            {renderSuggestionContent(token.content, key)}
          </span>
        );
      case "text":
      default:
        return token.content;
    }
  });
}

const QuickSuggestions = memo(
  ({
    visibleSuggestions = [],
    selection,
    isHidden = false,
    hasPartialInput = false,
    selectedIndex = 0,
    onSelectSuggestion,
    onContextMenuSuggestion,
  }) => {
    const show = visibleSuggestions.length > 0 && !selection && !isHidden;
    const activePillRef = useRef(null);

    useEffect(() => {
      if (show && hasPartialInput && activePillRef.current) {
        activePillRef.current.scrollIntoView({
          inline: "nearest",
          block: "nearest",
        });
      }
    }, [show, hasPartialInput, selectedIndex, visibleSuggestions.length]);

    return (
      <div
        className="w-full overflow-hidden transition-all duration-relaxed ease-in-out px-1 shrink-0"
        style={{
          height: show ? "36px" : "0px",
          marginBottom: show ? "6px" : "0px",
          opacity: show ? 1 : 0,
        }}
      >
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar select-none py-0.5">
          {visibleSuggestions.map((item, idx) => {
            const isTabTarget = idx === selectedIndex && hasPartialInput;
            const readable = getReadableSuggestionText(item.displayText);
            return (
              <button
                key={item.id}
                ref={isTabTarget ? activePillRef : null}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onSelectSuggestion?.(item)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onContextMenuSuggestion?.(e, item);
                }}
                className={`inline-flex items-center gap-1.5 text-sm px-3.5 py-1 rounded-full bg-onicord-mantle border text-onicord-text hover:text-onicord-accent hover:border-onicord-accent hover:bg-onicord-mantle transition-all cursor-pointer max-w-[240px] shrink-0 ${
                  isTabTarget
                    ? "border-onicord-accent/60"
                    : "border-onicord-island"
                }`}
                title={readable}
              >
                {item.isPinned && (
                  <MaterialIcon
                    name="push_pin"
                    size={12}
                    className="text-onicord-accent/80 shrink-0"
                  />
                )}
                <span className="truncate">
                  {item.kind === "word" && (
                    <span className="text-onicord-muted/70 mr-0.5">…</span>
                  )}
                  {renderSuggestionContent(item.displayText)}
                </span>
                {isTabTarget && (
                  <kbd className="text-2xs leading-none font-mono px-1.5 py-0.5 rounded bg-onicord-base/80 text-onicord-muted border border-onicord-island shrink-0">
                    Tab
                  </kbd>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);

QuickSuggestions.displayName = "QuickSuggestions";
export default QuickSuggestions;
