import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";

export function EphemeralCountdownBadge({ expiresAt, compact = false }) {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState(() =>
    expiresAt ? Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)) : 0,
  );

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      setRemaining(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  if (!expiresAt) return null;
  const isUrgent = remaining <= 10;

  return (
    <span
      title={t("chat.ephemeralRemaining", {
        seconds: remaining,
        defaultValue: `Se eliminará en ${remaining}s`,
      })}
      className={`inline-flex items-center gap-0.5 rounded-md font-semibold tabular-nums border transition-colors shrink-0 select-none ${
        compact ? "px-1 py-0 text-[9px]" : "px-1.5 py-0.5 text-[10px] ml-1"
      } ${
        isUrgent
          ? "bg-onicord-danger/20 text-onicord-danger border-onicord-danger/40 animate-pulse"
          : "bg-amber-500/15 text-amber-400 border-amber-500/30"
      }`}
    >
      <MaterialIcon name="timer" size={compact ? 10 : 11} />
      <span>{`${remaining}s`}</span>
    </span>
  );
}

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
  isWebhook,
  timestamp,
  edited,
  isForwarded,
  isEphemeral,
  expiresAt,
}) {
  const { t, i18n } = useTranslation();

  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className="cursor-default text-base font-semibold text-onicord-text hover:underline"
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
      {isWebhook && (
        <MaterialIcon
          name="hub"
          size={15}
          fill={true}
          weight={400}
          className="text-indigo-400 shrink-0 inline"
          title="Webhook P2P"
        />
      )}
      <time className="text-xs text-onicord-muted opacity-60 font-medium ml-1">
        {formatFriendlyDate(timestamp, t, i18n.language || "es")}
        {edited && (
          <span className="ml-1.5 italic text-2xs text-onicord-muted">
            ({t("chat.edited", "editado")})
          </span>
        )}
        {isForwarded && (
          <span className="ml-1.5 text-2xs text-onicord-accent font-semibold flex-inline items-center gap-0.5">
            <MaterialIcon name="shortcut" size={12} className="inline mr-0.5" />
            {t("chat.forwarded", "Reenviado")}
          </span>
        )}
      </time>
      {isEphemeral && expiresAt && (
        <EphemeralCountdownBadge expiresAt={expiresAt} />
      )}
    </div>
  );
}
