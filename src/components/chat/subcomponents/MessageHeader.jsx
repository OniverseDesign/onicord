import React from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";

export function formatFriendlyDate(ts, t, locale = "es") {
  const date = new Date(ts);
  const now = new Date();

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const targetDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  const timeStr = date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });

  const diffTime = today.getTime() - targetDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (targetDate.getTime() === today.getTime()) {
    return t("chat.timestamp.today", {
      defaultValue: "Hoy a la(s) {{time}}",
      time: timeStr,
    });
  } else if (targetDate.getTime() === yesterday.getTime()) {
    return t("chat.timestamp.yesterday", {
      defaultValue: "Ayer a la(s) {{time}}",
      time: timeStr,
    });
  } else if (diffDays > 1 && diffDays < 7) {
    const weekday = date.toLocaleDateString(locale, { weekday: "long" });
    const formattedWeekday = locale.startsWith("es")
      ? `el ${weekday.toLowerCase()}`
      : weekday;
    return t("chat.timestamp.weekday", {
      defaultValue: "{{weekday}} a la(s) {{time}}",
      weekday: formattedWeekday,
      time: timeStr,
    });
  } else {
    const dateStr = date.toLocaleDateString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    return `${dateStr} ${timeStr}`;
  }
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("es", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MessageHeader({
  nickname,
  nameColor,
  isComplement,
  timestamp,
  edited,
  isForwarded,
}) {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex items-center gap-1.5">
      <span
        className="cursor-default text-[15px] font-semibold text-onicord-text hover:underline"
        style={nameColor ? { color: nameColor } : {}}
      >
        {nickname}
      </span>
      {isComplement && (
        <MaterialIcon
          name="smart_toy"
          size={15}
          fill={true}
          weight={400}
          className="text-indigo-400 shrink-0"
          title={t("chat.complementBadge", "Complemento")}
        />
      )}
      <time className="text-[11px] text-onicord-muted opacity-60 font-medium ml-1">
        {formatFriendlyDate(timestamp, t, i18n.language || "es")}
        {edited && (
          <span className="ml-1.5 italic text-[10px] text-onicord-muted">
            ({t("chat.edited", "editado")})
          </span>
        )}
        {isForwarded && (
          <span className="ml-1.5 text-[10px] text-onicord-accent font-semibold flex-inline items-center gap-0.5">
            <MaterialIcon name="shortcut" size={12} className="inline mr-0.5" />
            {t("chat.forwarded", "Reenviado")}
          </span>
        )}
      </time>
    </div>
  );
}
