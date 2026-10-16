import React from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";

export default function MessageThreadBadge({
  threadRepliesCount,
  threadParticipants = [],
  isReplyPreview,
  disableThreadAction,
  onOpenThread,
}) {
  const { t } = useTranslation();

  if (threadRepliesCount <= 0 || isReplyPreview || disableThreadAction) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={onOpenThread}
      className="mt-2 inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-onicord-accent/10 hover:bg-onicord-accent/20 border border-onicord-accent/30 text-onicord-accent text-xs font-bold transition-all cursor-pointer group/thread select-none shadow-xs"
    >
      <div className="flex items-center -space-x-2 overflow-hidden">
        {threadParticipants.slice(0, 4).map((p, idx) => (
          <div
            key={idx}
            className="w-5 h-5 rounded-full overflow-hidden bg-onicord-accent flex items-center justify-center text-[9px] font-bold text-white shrink-0"
          >
            {p.avatar ? (
              <img src={p.avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span>{(p.nickname || "?").charAt(0).toUpperCase()}</span>
            )}
          </div>
        ))}
      </div>

      <span>
        {t("chat.viewRepliesCount", {
          count: threadRepliesCount,
          defaultValue: `Ver ${threadRepliesCount} ${threadRepliesCount === 1 ? "respuesta" : "respuestas"}`,
        })}
      </span>
      <MaterialIcon name="chevron_right" size={16} />
    </button>
  );
}
