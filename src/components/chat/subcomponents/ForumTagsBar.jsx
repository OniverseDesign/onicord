import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";

export default function ForumTagsBar({
  messages = [],
  activeTag = null,
  onSelectTag = () => {},
}) {
  const { t } = useTranslation();

  // Extract all hashtags used in main-stream post messages
  const tagsList = useMemo(() => {
    if (!Array.isArray(messages) || messages.length === 0) return [];

    const map = new Map();

    messages.forEach((msg) => {
      if (!msg) return;
      // Skip thread replies if any slipped in
      if (msg.threadParentId) return;

      const foundTagsInThisMsg = new Set();

      // 1. Explicit tags array
      if (Array.isArray(msg.tags)) {
        msg.tags.forEach((rawTag) => {
          const clean = String(rawTag).replace(/^#/, "").trim().toLowerCase();
          if (clean) foundTagsInThisMsg.add(clean);
        });
      }

      // 2. Hashtags extracted from post text or rawText
      const textToScan = `${msg.title || ""} ${msg.text || ""} ${msg.rawText || ""}`;
      if (textToScan.includes("#")) {
        const matches = textToScan.matchAll(/#([a-zA-Z0-9_\u00C0-\u017F]+)/g);
        for (const m of matches) {
          const clean = m[1].toLowerCase().trim();
          if (clean) foundTagsInThisMsg.add(clean);
        }
      }

      // Increment counts
      foundTagsInThisMsg.forEach((tag) => {
        map.set(tag, (map.get(tag) || 0) + 1);
      });
    });

    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [messages]);

  if (tagsList.length === 0) {
    return null;
  }

  return (
    <div className="w-full shrink-0 select-none py-1.5 px-1 animate-fade-in">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {/* Reset / All posts button */}
        <button
          type="button"
          onClick={() => onSelectTag(null)}
          className={`text-xs px-3 py-1 rounded-full border transition-all cursor-pointer truncate shrink-0 flex items-center gap-1 ${
            !activeTag
              ? "bg-onicord-accent/20 border-onicord-accent text-onicord-accent font-bold shadow-xs"
              : "bg-onicord-surface/80 border-white/10 text-onicord-muted hover:text-onicord-text hover:border-white/20 hover:bg-onicord-surface"
          }`}
          title={t("chat.forumAllPosts", "Ver todas las publicaciones")}
        >
          <MaterialIcon name="apps" size={14} />
          <span>{t("chat.forumAll", "Todos")}</span>
        </button>

        {/* Tag Badges */}
        {tagsList.map(({ name, count }) => {
          const isActive = activeTag?.toLowerCase() === name.toLowerCase();

          return (
            <button
              key={name}
              type="button"
              onClick={() => onSelectTag(isActive ? null : name)}
              className={`text-xs px-3 py-1 rounded-full border transition-all cursor-pointer truncate max-w-[200px] shrink-0 flex items-center gap-1 ${
                isActive
                  ? "bg-onicord-accent/20 border-onicord-accent text-onicord-accent font-bold shadow-xs scale-[1.02]"
                  : "bg-onicord-surface/80 border-white/10 text-onicord-text hover:text-onicord-accent hover:border-onicord-accent/50 hover:bg-onicord-surface"
              }`}
              title={`#${name}`}
            >
              <span className={`font-semibold ${isActive ? "text-onicord-accent" : "text-onicord-muted"}`}>
                #
              </span>
              <span>{name}</span>
              <span className="text-2xs opacity-40 ml-0.5 font-mono">
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
