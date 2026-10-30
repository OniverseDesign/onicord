import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import SmartAnimatedImage from "../ui/SmartAnimatedImage";
import { copyTextToClipboard } from "../../lib/clipboard";
import { getWebInviteUrl, getNativeDeepLink } from "../../lib/inviteUtils";
import { useStreamerMode } from "../../context/StreamerModeContext";

export default function ServerInviteTab({ server, copyCode, copied }) {
  const { t } = useTranslation();
  const { isStreamerMode } = useStreamerMode();
  const [revealedInStream, setRevealedInStream] = useState(false);
  const [copiedCodeState, setCopiedCodeState] = useState(false);
  const [copiedLinkState, setCopiedLinkState] = useState(false);
  const [copiedRawLinkState, setCopiedRawLinkState] = useState(false);

  const roomCode = server?.roomCode || server?.code || server?.id || "";
  const serverName = server?.name || "Servidor Onicord";
  const webLink = getWebInviteUrl(roomCode, serverName);
  const deepLink = getNativeDeepLink(roomCode);
  const serverAvatar = server?.icon || null;
  const initial = serverName.trim()?.[0]?.toUpperCase() || "?";

  const shouldMask = isStreamerMode && !revealedInStream;
  const displayedRoomCode = shouldMask ? "••••••••" : roomCode;
  const displayedWebLink = shouldMask ? "https://onicord.com/join/••••••••" : webLink;
  const displayedDeepLink = shouldMask ? "onicord://join/••••••••" : deepLink;

  // Calculate member count and simulated online count
  const memberCount = server?.savedMembers
    ? Object.keys(server.savedMembers).length
    : server?.membersCount || server?.members?.length || 1;

  const onlineCount = Math.max(
    1,
    Math.min(memberCount, Math.ceil(memberCount * 0.7)),
  );

  const handleCopyCodeOnly = async () => {
    try {
      await copyTextToClipboard(roomCode);
      setCopiedCodeState(true);
      setTimeout(() => setCopiedCodeState(false), 2000);
    } catch (e) {
      console.error("Error al copiar código:", e);
    }
  };

  const handleCopyWebLink = async () => {
    if (copyCode) {
      copyCode();
    } else {
      try {
        await copyTextToClipboard(webLink);
        setCopiedLinkState(true);
        setTimeout(() => setCopiedLinkState(false), 2000);
      } catch (e) {
        console.error("Error al copiar enlace:", e);
      }
    }
  };

  const handleCopyRawProtocolLink = async () => {
    try {
      await copyTextToClipboard(deepLink);
      setCopiedRawLinkState(true);
      setTimeout(() => setCopiedRawLinkState(false), 2000);
    } catch (e) {
      console.error("Error al copiar enlace de protocolo:", e);
    }
  };

  const isLinkCopied = copied || copiedLinkState;

  return (
    <div className="onicord-settings-container">
      {/* 2-COLUMN STRUCTURE (5/12 and 7/12 layout) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: INVITATION METHODS (5/12) */}
        <div className="md:col-span-5 space-y-4">
          {/* CARD 1: SHORT ALPHANUMERIC CODE */}
          <div className="onicord-settings-card">
            <h3 className="onicord-settings-section-title">
              <span>
                {t(
                  "serverSettings.invites.codeTitle",
                  "Código de Invitación de Sala",
                )}
              </span>
            </h3>
            <p className="onicord-settings-row-desc -mt-2 mb-3">
              {t(
                "serverSettings.invites.codeHint",
                "Código único de 8 caracteres para unirse manualmente en la pantalla principal.",
              )}
            </p>

            <div className="space-y-3 pt-1">
              <div className="relative w-full bg-onicord-base/80 border border-white/10 rounded-xl p-3 flex items-center justify-center font-mono text-lg font-bold tracking-widest text-onicord-accent shadow-inner select-all">
                <span>{displayedRoomCode}</span>
                {isStreamerMode && (
                  <button
                    type="button"
                    onClick={() => setRevealedInStream((r) => !r)}
                    className="absolute right-3 text-onicord-muted hover:text-onicord-text p-1 text-xs transition-colors cursor-pointer"
                    title={revealedInStream
                      ? t("serverSettings.invites.hideCode", "Ocultar código")
                      : t("serverSettings.invites.revealCode", "Revelar código temporalmente")}
                  >
                    <MaterialIcon name={revealedInStream ? "visibility_off" : "visibility"} size={16} />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleCopyCodeOnly}
                className="w-full h-10 rounded-xl bg-onicord-accent hover:opacity-90 text-onicord-dark text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                <MaterialIcon
                  name={copiedCodeState ? "check" : "content_copy"}
                  size={16}
                  className={copiedCodeState ? "text-emerald-400" : ""}
                />
                <span>
                  {copiedCodeState
                    ? t("serverSettings.invites.codeCopied", "¡Código Copiado!")
                    : t("serverSettings.invites.copyCodeOnly", "Copiar código")}
                </span>
              </button>
            </div>
          </div>

          {/* Universal web HTTPS invite link */}
          <div className="onicord-settings-card">
            <h3 className="onicord-settings-section-title">
              <span>
                {t(
                  "serverSettings.invites.webLinkTitle",
                  "Enlace Universal Web",
                )}
              </span>
            </h3>
            <p className="onicord-settings-row-desc -mt-2 mb-3">
              {t(
                "serverSettings.invites.webLinkHint",
                "Abre Onicord automáticamente o guía a la descarga.",
              )}
            </p>

            <div className="space-y-3 pt-1">
              <div className="w-full bg-onicord-base/80 border border-white/10 rounded-xl p-3 flex items-center justify-center font-mono text-xs font-semibold text-onicord-accent shadow-inner truncate select-all">
                {displayedWebLink}
              </div>

              <button
                type="button"
                onClick={handleCopyWebLink}
                className="w-full h-10 rounded-xl bg-onicord-accent hover:opacity-90 text-onicord-dark text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
              >
                <MaterialIcon
                  name={isLinkCopied ? "check" : "link"}
                  size={16}
                />
                <span>
                  {isLinkCopied
                    ? t("serverSettings.invites.copied", "¡Enlace Copiado!")
                    : t(
                        "serverSettings.invites.copyInvite",
                        "Copiar Enlace Web",
                      )}
                </span>
              </button>

              <button
                type="button"
                onClick={handleCopyRawProtocolLink}
                className="w-full text-center text-xs text-white/50 hover:text-white/80 transition-colors pt-1 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>
                  {copiedRawLinkState
                    ? t(
                        "serverSettings.invites.rawCopied",
                        "¡Copiado!",
                      )
                    : t(
                        "serverSettings.invites.copyRawProtocol",
                        "Copiar enlace de protocolo nativo",
                      )}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: PREVIEW IDENTICAL TO ACTUAL INVITEMODAL CARD (7/12) */}
        <div className="md:col-span-7">
          <div className="onicord-settings-card flex flex-col items-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-onicord-muted mb-3 flex items-center gap-1.5 self-start">
              <MaterialIcon name="visibility" size={14} />
              <span>{t("settings.theme.preview", "Vista Previa en Vivo")}</span>
            </span>
            {/* Faithful 1:1 replication of InviteModal.jsx */}
            <div className="relative w-full max-w-sm rounded-2xl bg-onicord-base/90 border border-onicord-island overflow-hidden animate-fade-in">
              <div className="relative flex flex-col items-center px-8 pt-10 pb-7">
                {/* Rounded server avatar (88px x 88px with ring) */}
                <div className="mb-5 relative">
                  <div className="w-[88px] h-[88px] rounded-full ring-4 ring-onicord-surface overflow-hidden shrink-0 shadow-lg bg-onicord-base">
                    {serverAvatar ? (
                      <SmartAnimatedImage
                        src={serverAvatar}
                        alt={serverName}
                        className="w-full h-full object-cover"
                        isAvatar
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center text-3xl font-black text-white select-none"
                        style={{
                          background:
                            "linear-gradient(135deg, rgba(var(--onicord-lavender)/0.9), rgba(var(--onicord-lavender)/0.5))",
                        }}
                      >
                        {initial}
                      </div>
                    )}
                  </div>
                </div>

                {/* Subtitle */}
                <p className="text-sm font-medium text-onicord-muted select-none mb-1">
                  {t("inviteModal.invited", "Has sido invitado a unirte a")}
                </p>

                {/* Server Name */}
                <h2 className="text-2xl font-extrabold text-onicord-text text-center leading-tight mb-4 select-none truncate max-w-full">
                  {serverName}
                </h2>

                {/* Members / Online chips mirroring InviteModal */}
                <div className="flex items-center justify-center gap-2 mb-6 flex-wrap select-none">
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-onicord-success/10 border border-onicord-success/20 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-onicord-success shrink-0 animate-pulse" />
                    <span className="text-[11px] font-semibold text-onicord-text leading-none">
                      {onlineCount} {t("inviteModal.online", "En línea")}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/10 border border-white/60 shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-white/60 shrink-0" />
                    <span className="text-[11px] font-semibold text-onicord-text leading-none">
                      {memberCount}{" "}
                      {memberCount === 1
                        ? t("serverSettings.invites.member", "Miembro")
                        : t("serverSettings.invites.members", "Miembros")}
                    </span>
                  </div>
                </div>

                {/* Botones de Aceptar y Cancelar calcados */}
                <div className="w-full flex flex-col gap-2.5">
                  <button
                    type="button"
                    disabled
                    className="w-full py-3 rounded-xl font-bold text-base transition-all duration-150 select-none cursor-default shadow-md pointer-events-none"
                    style={{
                      background: "rgba(var(--onicord-lavender)/0.85)",
                      color: "#fff",
                    }}
                  >
                    {t("inviteModal.accept", "Aceptar Invitación")}
                  </button>

                  <button
                    type="button"
                    disabled
                    className="w-full py-2.5 rounded-xl font-semibold text-sm text-onicord-muted select-none cursor-default pointer-events-none"
                  >
                    {t("inviteModal.cancel", "Cancelar")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
