import React from "react";
import { useTranslation } from "react-i18next";
import { resolveAuthorDisplay } from "../../../lib/profileUtils";
import { parseCustomEmojiToken, getEmojiShortcode } from "../../../lib/emojiData";
import InlineCustomEmoji from "./InlineCustomEmoji";
import MaterialIcon from "../../icons/MaterialIcon";
import Tooltip from "../../ui/Tooltip";

export default function MessageReactionsBar({
  reactions,
  msgId,
  profile,
  peers,
  server,
  onToggleReaction,
  pickerTargetRect,
  setPickerTargetRect,
}) {
  const { t } = useTranslation();

  if (!reactions || Object.keys(reactions).length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2 select-none">
      {Object.entries(reactions).map(([emoji, users]) => {
        if (!users || !Array.isArray(users) || users.length === 0)
          return null;
        const myId = profile?.id || "self";
        const hasMyReaction =
          users.includes(myId) ||
          users.includes("self") ||
          (profile?.id && users.includes(profile.id));
        const userNames = users.map((uid) => {
          if (uid === myId || uid === "self" || uid === profile?.id)
            return t("common.you");
          const display = resolveAuthorDisplay(
            uid,
            profile,
            peers,
            {},
            server
          );
          return display.nickname || t("common.user");
        });
        const customEmoji = parseCustomEmojiToken(emoji);
        const unicodeShortcode = customEmoji ? null : getEmojiShortcode(emoji);
        const shortcodeLabel = customEmoji
          ? `:${customEmoji.shortcode}:`
          : unicodeShortcode
            ? `:${unicodeShortcode}:`
            : emoji;
        return (
          <Tooltip
            key={emoji}
            side="top"
            content={
              <div className="flex items-center gap-2 py-0.5">
                {customEmoji ? (
                  <InlineCustomEmoji
                    id={customEmoji.id}
                    shortcode={customEmoji.shortcode}
                    ext={customEmoji.ext}
                    animated={customEmoji.animated}
                    sizeClass="w-5 h-5 shrink-0"
                    showTooltip={false}
                  />
                ) : (
                  <span className="text-base leading-none shrink-0">{emoji}</span>
                )}
                <div className="flex flex-col min-w-0">
                  <span className="font-mono text-xs text-onicord-text font-semibold">
                    {shortcodeLabel}
                  </span>
                  <span className="text-[11px] font-normal text-onicord-muted truncate max-w-[200px]">
                    {t("chat.reactedBy")}: {userNames.join(", ")}
                  </span>
                </div>
              </div>
            }
          >
            <button
              type="button"
              onClick={() => onToggleReaction?.(msgId, emoji)}
              className={`onicord-reaction-badge inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all duration-150 cursor-pointer active:scale-95 hover:scale-105 ${
                hasMyReaction
                  ? "bg-onicord-accent/20 text-onicord-accent border-onicord-accent/40"
                  : "bg-onicord-tint/5 text-onicord-subtext border-onicord-tint/10 hover:bg-onicord-tint/10 hover:text-white"
              }`}
            >
              {customEmoji ? (
                <InlineCustomEmoji
                  id={customEmoji.id}
                  shortcode={customEmoji.shortcode}
                  ext={customEmoji.ext}
                  animated={customEmoji.animated}
                  sizeClass="w-4 h-4"
                  showTooltip={false}
                />
              ) : (
                <span className="text-sm leading-none transition-transform duration-150">{emoji}</span>
              )}
              <span className="text-[11px] font-mono leading-none">
                {users.length}
              </span>
            </button>
          </Tooltip>
        );
      })}

      <Tooltip side="top" content={t("chat.addReaction")}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (pickerTargetRect) {
              setPickerTargetRect(null);
            } else {
              setPickerTargetRect(e.currentTarget.getBoundingClientRect());
            }
          }}
          className="inline-flex items-center justify-center w-7 h-[26px] rounded-xl bg-onicord-tint/5 border border-onicord-tint/10 hover:bg-onicord-tint/10 hover:border-onicord-tint/20 text-onicord-muted hover:text-white transition-all duration-150 cursor-pointer active:scale-95"
        >
          <MaterialIcon name="add_reaction" size={15} />
        </button>
      </Tooltip>
    </div>
  );
}
