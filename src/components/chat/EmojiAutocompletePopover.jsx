import React, {
  memo,
  useState,
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
  useMemo,
} from "react";
import {
  setSelectionOffsets,
  renderHTMLForInput,
  extractTextFromInput,
} from "../../lib/inputFormatter";
import {
  searchEmojis,
  getRecentEmojis,
  addRecentEmoji,
  subscribeCustomEmojis,
} from "../../lib/emojiData";
import { getMediaUrl } from "../../lib/media";

const EmojiAutocompletePopover = memo(
  forwardRef(function EmojiAutocompletePopover(
    {
      emojiQuery,
      input,
      setInput,
      setEmojiQuery,
      tyrannyInputRef,
      profile,
      peers,
      t,
    },
    ref
  ) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [customVersion, setCustomVersion] = useState(0);
    const itemRefs = useRef([]);

    useEffect(() => {
      return subscribeCustomEmojis(() => setCustomVersion((v) => v + 1));
    }, []);

    useEffect(() => {
      setSelectedIndex(0);
    }, [emojiQuery?.query]);

    const suggestions = useMemo(() => {
      if (!emojiQuery?.query) return [];
      return searchEmojis(emojiQuery.query, {
        recentEmojis: getRecentEmojis(),
        limit: 10,
      });
    }, [emojiQuery?.query, customVersion]);

    const validIndex =
      suggestions.length > 0
        ? Math.min(Math.max(0, selectedIndex), suggestions.length - 1)
        : 0;

    useEffect(() => {
      if (itemRefs.current[validIndex]) {
        itemRefs.current[validIndex].scrollIntoView({
          block: "nearest",
          inline: "nearest",
        });
      }
    }, [validIndex]);

    const allUsers = useMemo(
      () => [
        { id: profile?.id, nickname: profile?.nickname || "Usuario" },
        ...Object.values(peers || {}).map((p) => ({
          id: p.id,
          nickname: p.nickname,
        })),
      ],
      [profile?.id, profile?.nickname, peers]
    );

    const selectEmoji = useCallback(
      (item) => {
        if (!item || !emojiQuery) return;

        const el = tyrannyInputRef?.current;
        const currentText = el ? extractTextFromInput(el) : input ?? "";
        const start = Math.max(
          0,
          Math.min(emojiQuery.startIndex, currentText.length)
        );
        const end = Math.max(
          start,
          Math.min(emojiQuery.endIndex, currentText.length)
        );

        const prefix = currentText.slice(0, start);
        const after = currentText.slice(end);
        const value = item.isCustom ? item.token : item.emoji;
        const inserted = after.startsWith(" ") ? value : `${value} `;
        const newText = prefix + inserted + after;
        const newCursorPos = prefix.length + inserted.length;

        addRecentEmoji(value);
        setInput(newText);
        setEmojiQuery(null);

        if (el) {
          el.innerHTML = renderHTMLForInput(newText, allUsers);
          el.focus();
          setSelectionOffsets(el, newCursorPos, newCursorPos);
          requestAnimationFrame(() => {
            el.focus();
            setSelectionOffsets(el, newCursorPos, newCursorPos);
          });
        }
      },
      [emojiQuery, input, tyrannyInputRef, setInput, setEmojiQuery, allUsers]
    );

    useImperativeHandle(
      ref,
      () => ({
        isOpen: Boolean(emojiQuery && suggestions.length > 0),
        handleKeyDown: (e) => {
          if (!emojiQuery || suggestions.length === 0) return false;

          if (
            e.key === "ArrowDown" &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey
          ) {
            e.preventDefault();
            e.stopPropagation();
            setSelectedIndex((prev) => (prev + 1) % suggestions.length);
            return true;
          }

          if (
            e.key === "ArrowUp" &&
            !e.ctrlKey &&
            !e.altKey &&
            !e.metaKey
          ) {
            e.preventDefault();
            e.stopPropagation();
            setSelectedIndex(
              (prev) => (prev - 1 + suggestions.length) % suggestions.length
            );
            return true;
          }

          if ((e.key === "Tab" || e.key === "Enter") && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            selectEmoji(suggestions[validIndex]);
            return true;
          }

          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setEmojiQuery(null);
            return true;
          }

          return false;
        },
      }),
      [emojiQuery, suggestions, validIndex, selectEmoji, setEmojiQuery]
    );

    if (!emojiQuery || suggestions.length === 0) return null;

    return (
      <div
        onMouseDown={(e) => e.preventDefault()}
        className="onicord-floating-menu bottom-[calc(100%+8px)] left-2 w-[calc(100%-32px)] max-w-md"
      >
        <div className="onicord-context-menu-title border-b border-onicord-tint/[0.02] pb-1 mb-1 flex items-center justify-between text-xs text-onicord-muted">
          <span>
            {t ? t("chat.emojiAutocompleteTitle", "Emojis") : "Emojis"}
          </span>
          <span className="text-2xs opacity-60 font-mono truncate max-w-[160px]">
            :{emojiQuery.query}
          </span>
        </div>
        <div className="space-y-0.5 max-h-48 overflow-y-auto minimal-scrollbar">
          {suggestions.map((item, index) => {
            const isSelected = index === validIndex;
            const itemLabel = `:${item.shortcode}:`;
            return (
              <div
                key={item.emoji}
                ref={(el) => (itemRefs.current[index] = el)}
                onClick={() => selectEmoji(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors text-xs group ${
                  isSelected
                    ? "bg-onicord-accent text-onicord-on-accent"
                    : "hover:bg-onicord-accent/20 text-onicord-text"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {item.isCustom && item.localPath ? (
                    <img
                      src={getMediaUrl(item.localPath)}
                      alt={itemLabel}
                      className="w-5 h-5 object-contain shrink-0"
                    />
                  ) : (
                    <span className="text-lg leading-none shrink-0">
                      {item.emoji}
                    </span>
                  )}
                  <span className="font-mono font-semibold truncate">
                    {itemLabel}
                  </span>
                </div>
                <span
                  className={`text-2xs shrink-0 ml-2 ${
                    isSelected
                      ? "text-inherit opacity-85"
                      : "text-onicord-muted opacity-70"
                  }`}
                >
                  {item.isCustom
                    ? t
                      ? t("chat.emojis.custom", "Personalizados")
                      : "Personalizados"
                    : t
                      ? t(`chat.emojis.${item.categoryId}`, item.categoryName)
                      : item.categoryName}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  })
);

EmojiAutocompletePopover.displayName = "EmojiAutocompletePopover";
export default EmojiAutocompletePopover;
