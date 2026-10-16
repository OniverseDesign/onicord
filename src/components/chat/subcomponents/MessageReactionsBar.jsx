import React from "react";
import { useTranslation } from "react-i18next";
import { resolveAuthorDisplay } from "../../../lib/profileUtils";
import MaterialIcon from "../../icons/MaterialIcon";

export default function MessageReactionsBar({
  reactions,
  msgId,
  profile,
  peers,
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
          );
          return display.nickname || t("common.user");
        });
        const tooltipText = `${emoji} ${t("chat.reactedBy")}: ${userNames.join(", ")}`;
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggleReaction?.(msgId, emoji)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all duration-150 cursor-pointer active:scale-95 ${
              hasMyReaction
                ? "bg-onicord-accent/20 text-onicord-accent border-onicord-accent/40"
                : "bg-white/5 text-onicord-subtext border-white/10 hover:bg-white/10 hover:text-white"
            }`}
            title={tooltipText}
          >
            <span className="text-sm leading-none">{emoji}</span>
            <span className="text-[11px] font-mono leading-none">
              {users.length}
            </span>
          </button>
        );
      })}

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
        className="inline-flex items-center justify-center w-7 h-[26px] rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-onicord-muted hover:text-white transition-all duration-150 cursor-pointer active:scale-95"
        title={t("chat.addReaction")}
      >
        <MaterialIcon name="add_reaction" size={15} />
      </button>
    </div>
  );
}
