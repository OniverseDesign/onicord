import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import MaterialIcon from "../icons/MaterialIcon";
import Tooltip from "./Tooltip";
import { soundEngine } from "../../lib/soundEngine";
import {
  EMOJI_CATEGORIES,
  searchEmojis,
  getRecentEmojis,
  addRecentEmoji,
  getEmojiShortcode,
  getCustomEmojis,
  subscribeCustomEmojis,
  parseCustomEmojiToken,
  getCustomEmojiById,
} from "../../lib/emojiData";
import { getMediaUrl } from "../../lib/media";
import InlineCustomEmoji from "../chat/subcomponents/InlineCustomEmoji";

const calculateEmojiCoords = (targetRect, align = "right") => {
  if (!targetRect) return { top: 0, left: 0 };

  const popoverWidth = 320;
  const popoverHeight = 384;
  const windowHeight = window.innerHeight;
  const windowWidth = window.innerWidth;

  let left;
  let top;

  if (align === "right-side") {
    left = targetRect.right + 8;
    top = targetRect.bottom - popoverHeight;

    if (left + popoverWidth > windowWidth - 10) {
      left = targetRect.left - popoverWidth - 8;
    }
    if (top < 10) {
      top = targetRect.top;
    }
    if (top + popoverHeight > windowHeight - 10) {
      top = windowHeight - popoverHeight - 10;
    }
  } else {
    left = targetRect.right - popoverWidth + 8;
    top = targetRect.top - popoverHeight - 12;

    if (top < 10) {
      top = targetRect.bottom + 8;
    }
  }

  if (left < 10) left = 10;
  if (left + popoverWidth > windowWidth - 10) {
    left = windowWidth - popoverWidth - 10;
  }

  return { top, left };
};

export default function EmojiPickerPopover({
  targetRect,
  onSelectEmoji,
  onClose,
  triggerRef,
  align = "right",
  allowCustom = true,
}) {
  const { t } = useTranslation();
  const popoverRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const sectionRefs = useRef({});
  const isClickScrolling = useRef(false);
  const scrollTimeoutRef = useRef(null);

  const [coords, setCoords] = useState(() => calculateEmojiCoords(targetRect, align));
  const [activeTab, setActiveTab] = useState("faces");
  const [searchTerm, setSearchTerm] = useState("");
  const [recentEmojis, setRecentEmojis] = useState([]);
  const [customEmojis, setCustomEmojis] = useState(() =>
    allowCustom ? getCustomEmojis() : []
  );
  const [emojiPacks, setEmojiPacks] = useState({});
  const [hoveredEmoji, setHoveredEmoji] = useState(null);

  // Load recent emojis and custom emojis on mount and play open sound
  useEffect(() => {
    soundEngine.playNav("open");
    setRecentEmojis(getRecentEmojis());
    if (!allowCustom) {
      setCustomEmojis([]);
      return undefined;
    }
    setCustomEmojis(getCustomEmojis());
    try {
      setEmojiPacks(JSON.parse(localStorage.getItem("onicord_emoji_packs") || "{}"));
    } catch {
      setEmojiPacks({});
    }
    return subscribeCustomEmojis((list) => {
      setCustomEmojis(list);
      try {
        setEmojiPacks(JSON.parse(localStorage.getItem("onicord_emoji_packs") || "{}"));
      } catch {}
    });
  }, [allowCustom]);

  // Track coordinates for absolute positioning
  useLayoutEffect(() => {
    if (!targetRect) return;
    setCoords(calculateEmojiCoords(targetRect, align));
  }, [targetRect, align]);

  // Click outside to close
  useEffect(() => {
    const handleMouseDownOutside = (e) => {
      if (triggerRef?.current && triggerRef.current.contains(e.target)) {
        return; // Ignore click on trigger button to avoid double toggle race condition
      }
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose?.();
      }
    };

    document.addEventListener("mousedown", handleMouseDownOutside);
    return () => {
      document.removeEventListener("mousedown", handleMouseDownOutside);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [onClose, triggerRef]);


  if (!targetRect) return null;

  const visibleRecents = allowCustom
    ? recentEmojis
    : recentEmojis.filter((e) => !parseCustomEmojiToken(e));
  const hasCustom = allowCustom && customEmojis.length > 0;

  // Add an emoji to recent list (max 14)
  const handleSelectEmojiLocal = (emoji) => {
    onSelectEmoji?.(emoji);
    const updated = addRecentEmoji(emoji, 14);
    setRecentEmojis(updated);
    onClose?.();
  };

  // Perform search based on characters, shortcodes, aliases, category name or keywords
  const getFilteredSearchResults = () => {
    return searchEmojis(searchTerm, {
      recentEmojis: visibleRecents,
      includeCustom: allowCustom,
    }).map((item) => item.emoji);
  };

  const renderEmojiGlyph = (val, sizeClass = "w-6 h-6", textClass = "") => {
    const parsed = parseCustomEmojiToken(val);
    if (parsed) {
      const local = getCustomEmojiById(parsed.id);
      const customAlt = `:${parsed.shortcode}:`;
      if (local?.localPath) {
        return (
          <img
            src={getMediaUrl(local.localPath)}
            alt={customAlt}
            loading="lazy"
            decoding="async"
            className={`${sizeClass} object-contain pointer-events-none`}
          />
        );
      }
      return (
        <InlineCustomEmoji
          id={parsed.id}
          shortcode={parsed.shortcode}
          ext={parsed.ext}
          animated={parsed.animated}
          sizeClass={sizeClass}
          showTooltip={false}
        />
      );
    }
    return <span className={textClass}>{val}</span>;
  };

  const renderEmojiButton = (emoji, key) => {
    const code = getEmojiShortcode(emoji);
    return (
      <Tooltip
        key={key}
        side="top"
        delay={180}
        content={
          code ? (
            <span className="font-mono text-xs">{`:${code}:`}</span>
          ) : null
        }
      >
        <button
          type="button"
          onClick={() => handleSelectEmojiLocal(emoji)}
          onMouseEnter={() => setHoveredEmoji(emoji)}
          className="w-9 h-9 flex items-center justify-center text-xl hover:bg-onicord-tint/10 rounded-xl transition-transform duration-100 active:scale-125 hover:scale-110 cursor-pointer"
        >
          {renderEmojiGlyph(emoji)}
        </button>
      </Tooltip>
    );
  };

  // Scroll Sync: Track container scroll and highlight active category tab
  const handleScroll = (e) => {
    if (isClickScrolling.current) return;
    const container = e.currentTarget;
    const scrollTop = container.scrollTop;

    const categoriesToCheck = [
      ...(visibleRecents.length > 0 ? [{ id: "recent" }] : []),
      ...(hasCustom ? [{ id: "custom" }] : []),
      ...EMOJI_CATEGORIES
    ];

    // 1. Detect if we reached the absolute bottom of the container
    const isAtBottom = container.scrollHeight - scrollTop <= container.clientHeight + 12;
    if (isAtBottom && categoriesToCheck.length > 0) {
      const lastCat = categoriesToCheck[categoriesToCheck.length - 1].id;
      if (lastCat !== activeTab) {
        setActiveTab(lastCat);
      }
      return;
    }

    // 2. Standard offset evaluation
    let currentActive = categoriesToCheck[0]?.id || "faces";

    for (let i = 0; i < categoriesToCheck.length; i++) {
      const cat = categoriesToCheck[i];
      const el = sectionRefs.current[cat.id];
      if (el) {
        // offsetTop is relative to scroll container
        const relativeTop = el.offsetTop - container.offsetTop;
        // Check if container has scrolled past the section start (with 20px margin threshold)
        if (scrollTop >= relativeTop - 20) {
          currentActive = cat.id;
        }
      }
    }

    if (currentActive !== activeTab) {
      setActiveTab(currentActive);
    }
  };

  // Click on a Tab: smoothly scroll scrollContainer to target category section
  const handleTabClick = (catId) => {
    soundEngine.playNav("select");
    setActiveTab(catId);
    const container = scrollContainerRef.current;
    const el = sectionRefs.current[catId];
    if (container && el) {
      isClickScrolling.current = true;
      const targetScrollTop = el.offsetTop - container.offsetTop;
      
      container.scrollTo({ top: targetScrollTop, behavior: "smooth" });

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isClickScrolling.current = false;
      }, 500);
    }
  };

  const filteredSearchResults = getFilteredSearchResults();

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
      }}
      className="onicord-floating-menu w-80 h-96 flex flex-col !p-0 overflow-hidden z-popover"
    >
      {/* Search Header */}
      <div className="p-2.5 border-b border-onicord-tint/10 bg-onicord-mantle/50 flex items-center gap-2">
        <MaterialIcon name="search" size="lg" className="text-onicord-muted pl-1" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t("chat.searchEmojisPlaceholder", "Buscar emojis...")}
          className="w-full bg-transparent text-xs text-onicord-text placeholder-onicord-muted outline-none"
          autoFocus
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="text-onicord-muted hover:text-onicord-text text-xs pr-1"
          >
            ✕
          </button>
        )}
      </div>

      {/* Tabs Navigation (only when not searching) */}
      {!searchTerm && (
        <div className="flex items-center justify-around px-2 py-1.5 border-b border-onicord-border bg-onicord-tint/[0.02] shrink-0">
          {/* Clock icon for Recents if populated */}
          {visibleRecents.length > 0 && (
            <Tooltip content={t("chat.emojis.recent", "Recientes")} side="top">
              <button
                onClick={() => handleTabClick("recent")}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150 cursor-pointer ${
                  activeTab === "recent"
                    ? "bg-onicord-accent text-onicord-on-accent scale-110 font-bold"
                    : "hover:bg-onicord-accent/50 text-onicord-text hover:text-onicord-on-accent"
                }`}
              >
                <MaterialIcon name="schedule" size={16} />
              </button>
            </Tooltip>
          )}

          {/* Custom Emojis Tab */}
          {hasCustom && (
            <Tooltip content={t("chat.emojis.custom", "Personalizados")} side="top">
              <button
                onClick={() => handleTabClick("custom")}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150 cursor-pointer ${
                  activeTab === "custom"
                    ? "bg-onicord-accent text-onicord-on-accent scale-110 font-bold"
                    : "hover:bg-onicord-accent/50 text-onicord-text hover:text-onicord-on-accent"
                }`}
              >
                <MaterialIcon name="auto_awesome" size={16} />
              </button>
            </Tooltip>
          )}

          {/* Standard Categories */}
          {EMOJI_CATEGORIES.map((cat) => (
            <Tooltip key={cat.id} content={t(`chat.emojis.${cat.id}`, cat.name)} side="top">
              <button
                onClick={() => handleTabClick(cat.id)}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150 cursor-pointer ${
                  activeTab === cat.id
                    ? "bg-onicord-accent text-onicord-on-accent scale-110 font-bold"
                    : "hover:bg-onicord-accent/50 text-onicord-text hover:text-onicord-on-accent"
                }`}
              >
                <MaterialIcon name={cat.icon} size={16} />
              </button>
            </Tooltip>
          ))}
        </div>
      )}

      {/* Emoji Scroll Area */}
      {searchTerm ? (
        // Search Results Mode (Single Grid)
        <div
          onMouseLeave={() => setHoveredEmoji(null)}
          className="flex-1 overflow-y-auto p-2.5 custom-scrollbar"
        >
          <h4 className="text-[10px] font-bold text-onicord-muted uppercase tracking-wider pl-1 mb-1.5">
            {t("chat.searchResults", "Resultados de búsqueda")}
          </h4>
          <div className="grid grid-cols-7 gap-1 content-start">
            {filteredSearchResults.map((emoji, idx) =>
              renderEmojiButton(emoji, `${emoji}-${idx}`)
            )}
          </div>
          {filteredSearchResults.length === 0 && (
            <div className="py-8 text-center text-xs text-onicord-faded italic">
              {t("chat.noSearchResults", "No results found")}
            </div>
          )}
        </div>
      ) : (
        // Unified Scrollable Categories List
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          onMouseLeave={() => setHoveredEmoji(null)}
          className="flex-1 overflow-y-auto p-2.5 space-y-4 custom-scrollbar pb-36"
        >
          {/* Recents list if available */}
          {visibleRecents.length > 0 && (
            <div
              key="recent"
              ref={(el) => (sectionRefs.current["recent"] = el)}
              className="space-y-1.5"
            >
              <h4 className="text-[10px] font-bold text-onicord-muted uppercase tracking-wider pl-1 border-b border-onicord-border pb-1">
                {t("chat.emojis.recent", "Recientes")}
              </h4>
              <div className="grid grid-cols-7 gap-1 pt-1">
                {visibleRecents.map((emoji, idx) =>
                  renderEmojiButton(emoji, `recent-${emoji}-${idx}`)
                )}
              </div>
            </div>
          )}

          {/* Custom Emojis (grouped by packs + ungrouped) */}
          {hasCustom && (() => {
            const assignedIds = new Set();
            const packSections = Object.keys(emojiPacks)
              .map((packTitle) => {
                const ids = Array.isArray(emojiPacks[packTitle])
                  ? emojiPacks[packTitle]
                  : [];
                const items = ids
                  .map((id) => customEmojis.find((em) => em.id === id))
                  .filter(Boolean);
                items.forEach((em) => assignedIds.add(em.id));
                return { title: packTitle, items };
              })
              .filter((group) => group.items.length > 0);
            const looseCustom = customEmojis.filter(
              (em) => !assignedIds.has(em.id)
            );

            return (
              <div
                key="custom"
                ref={(el) => (sectionRefs.current["custom"] = el)}
                className="space-y-3"
              >
                {packSections.map((group) => (
                  <div key={`custom-pack-${group.title}`} className="space-y-1.5">
                    <h4 className="text-[10px] font-bold text-onicord-muted uppercase tracking-wider pl-1 border-b border-onicord-border pb-1 truncate">
                      {group.title}
                    </h4>
                    <div className="grid grid-cols-7 gap-1 pt-1">
                      {group.items.map((em) =>
                        renderEmojiButton(em.token, `custom-${group.title}-${em.id}`)
                      )}
                    </div>
                  </div>
                ))}

                {looseCustom.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[10px] font-bold text-onicord-muted uppercase tracking-wider pl-1 border-b border-onicord-border pb-1">
                      {t("chat.emojis.custom", "Personalizados")}
                    </h4>
                    <div className="grid grid-cols-7 gap-1 pt-1">
                      {looseCustom.map((em) =>
                        renderEmojiButton(em.token, `custom-loose-${em.id}`)
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Standard Categories list */}
          {EMOJI_CATEGORIES.map((cat) => (
            <div
              key={cat.id}
              ref={(el) => (sectionRefs.current[cat.id] = el)}
              className="space-y-1.5 animate-fade-in"
            >
              <h4 className="text-[10px] font-bold text-onicord-muted uppercase tracking-wider pl-1 border-b border-onicord-border pb-1">
                {t(`chat.emojis.${cat.id}`, cat.name)}
              </h4>
              <div className="grid grid-cols-7 gap-1 pt-1">
                {cat.emojis.map((emoji, idx) =>
                  renderEmojiButton(emoji, `${cat.id}-${emoji}-${idx}`)
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Shortcode preview footer */}
      <div className="shrink-0 h-7 px-3 border-t border-onicord-border bg-onicord-mantle/60 flex items-center gap-2 text-[11px] text-onicord-muted">
        {hoveredEmoji ? (
          <>
            {renderEmojiGlyph(hoveredEmoji, "w-4 h-4 shrink-0", "text-base leading-none")}
            <span className="font-mono text-onicord-text truncate">
              :{getEmojiShortcode(hoveredEmoji)}:
            </span>
          </>
        ) : (
          <span className="truncate">
            {t("chat.emojiShortcodeHint", "Escribe :sad: para insertar emojis")}
          </span>
        )}
      </div>
    </div>,
    document.body
  );
}
