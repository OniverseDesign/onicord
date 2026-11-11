import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import Heading from "../../ui/Heading";
import Text from "../../ui/Text";
import { useVoiceChannelInfo } from "../../../context/VoiceContext";
import { checkPermission } from "../../../lib/permissionsHelper";
import { notificationManager } from "../../../lib/notificationManager";

/**
 * Componente unificado de tarjeta de invitación interactiva para actividades (Arcade, Cinema, Watch Party, etc.).
 * Cumple con el diseño horizontal de dos columnas, escala tipográfica estandarizada y conexión obligatoria a voz.
 * Cero emojis: todo elemento gráfico es MaterialIcon.
 */
export default function ActivityInviteCard({
  data,
  pluginId,
  profile,
  server,
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);

  const { currentVoiceChannelId, inVoice, joinVoiceChannel } = useVoiceChannelInfo();

  if (!data) return null;

  const {
    title,
    subtitle,
    details,
    providerName,
    icon,
    coverUrl,
    roomCode,
    voiceChannelId,
    voiceChannelName,
    actionType,
    actionPayload,
  } = data;

  const isInTargetVoice = Boolean(
    voiceChannelId && inVoice && currentVoiceChannelId === voiceChannelId
  );

  const handleCopyCode = (e) => {
    e.stopPropagation();
    if (!roomCode) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(roomCode);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoin = () => {
    // 1. Verificación y conexión obligatoria al canal de voz
    if (voiceChannelId) {
      if (!isInTargetVoice) {
        if (server && profile?.id && !checkPermission(server, profile.id, "connect_voice")) {
          notificationManager.showToast(
            t("activityInvite.accessDenied", "Acceso denegado"),
            t("activityInvite.noVoicePermission", "No tienes permisos para unirte al canal de voz requerido por esta actividad."),
            "warning"
          );
          return;
        }

        if (joinVoiceChannel && server) {
          joinVoiceChannel(server, voiceChannelId);
        }
      }
    }

    // 2. Despliegue de la actividad según el tipo de acción
    if (actionType === "watchparty") {
      window.dispatchEvent(
        new CustomEvent("onicord:start-watch-party", {
          detail: actionPayload || {},
        })
      );
    } else {
      const userNick = profile?.nickname || profile?.username || "Jugador";
      window.dispatchEvent(
        new CustomEvent("onicord:open-stage", {
          detail: {
            ...actionPayload,
            userNick,
            authorName: userNick,
          },
        })
      );
    }
  };

  const buttonText = useMemo(() => {
    if (voiceChannelId && !isInTargetVoice) {
      return t("activityInvite.connectVoiceAndJoin", "Conectar a voz y unirse");
    }
    if (actionType === "watchparty" || providerName === "Cinema") {
      return t("activityInvite.joinWatch", "Unirse a ver");
    }
    return t("activityInvite.joinGame", "Unirse a la partida");
  }, [voiceChannelId, isInTargetVoice, actionType, providerName, t]);

  const defaultIcon = actionType === "watchparty"
    ? "smart_display"
    : providerName === "Cinema"
    ? "movie"
    : "sports_esports";

  const effectiveIcon = icon || defaultIcon;

  return (
    <div className="w-full max-w-md my-2 p-3 rounded-2xl bg-onicord-mantle border border-onicord-island select-none text-onicord-text font-sans flex items-stretch gap-3.5 shadow-sm transition-all duration-200 hover:border-onicord-accent/30">
      {/* Columna Izquierda: Imagen / Carátula de ancho fijo y altura completa */}
      <div className="w-28 sm:w-32 self-stretch min-h-[108px] rounded-xl overflow-hidden shrink-0 bg-onicord-surface/40 border border-white/5 relative flex items-center justify-center">
        {coverUrl && !imgError ? (
          <img
            src={coverUrl}
            alt={title || "Activity Cover"}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-onicord-accent/20 via-onicord-surface to-onicord-mantle flex items-center justify-center text-onicord-accent">
            <MaterialIcon name={effectiveIcon} size={32} />
          </div>
        )}
      </div>

      {/* Columna Derecha: Información y Acción */}
      <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5 gap-2">
        {/* Cabecera: Proveedor y Canal de Voz */}
        <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-onicord-muted truncate">
          <MaterialIcon name={effectiveIcon} size={13} className="text-onicord-accent shrink-0" />
          <span className="truncate">{providerName || "Actividad"}</span>

          {voiceChannelName && (
            <>
              <span className="opacity-40">•</span>
              <span className="flex items-center gap-1 truncate text-onicord-subtext font-semibold">
                <MaterialIcon name="volume_up" size={13} className="shrink-0 text-onicord-success" />
                <span className="truncate">{voiceChannelName}</span>
              </span>
            </>
          )}
        </div>

        {/* Bloque Central: Título, Subtítulo y Código */}
        <div className="min-w-0 space-y-1">
          <Heading level={4} size="sm" truncate className="font-bold text-onicord-text leading-snug">
            {title || "Actividad Interactiva"}
          </Heading>

          <Text variant="xs" color="muted" truncate className="leading-tight">
            {subtitle || details || t("activityInvite.availableSession", "Sesión disponible")}
          </Text>

          {roomCode && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <div className="flex items-center gap-1 bg-onicord-base/70 px-2 py-0.5 rounded border border-white/5 text-2xs font-mono font-bold text-onicord-accent tracking-wider">
                <span>#{roomCode}</span>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="p-0.5 rounded hover:bg-white/10 text-onicord-muted hover:text-white transition-all cursor-pointer flex items-center justify-center"
                  title={copied ? t("activityInvite.copied", "Copiado") : t("activityInvite.copyCode", "Copiar código")}
                >
                  <MaterialIcon
                    name={copied ? "check" : "content_copy"}
                    size={11}
                    className={copied ? "text-onicord-success" : ""}
                  />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Botón CTA Píldora inferior */}
        <button
          type="button"
          onClick={handleJoin}
          className="w-full py-2 px-4 bg-onicord-accent hover:bg-onicord-accent/90 text-onicord-dark rounded-full font-bold text-xs transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-[0.98] cursor-pointer shadow-sm"
        >
          <MaterialIcon name="play_arrow" size={15} />
          <span>{buttonText}</span>
        </button>
      </div>
    </div>
  );
}
