import { useTranslation } from "react-i18next";
import SmartAnimatedImage from "../ui/SmartAnimatedImage";
import { cn } from "../../lib/cn";
import { useInternalClose } from "../../hooks/useAnimatedMount";

/**
 * InviteModal — shown when the user opens an onicord://join/<code> deep link.
 * Displays server avatar, name, member count, and accept/cancel buttons.
 *
 * @param {object} props
 * @param {string}  props.serverName       - Display name of the server
 * @param {string}  [props.serverAvatar]   - Base64 or URL avatar for the server (optional)
 * @param {number}  [props.memberCount]    - Known saved member count (optional)
 * @param {string}  props.roomCode         - The 8-char invite code
 * @param {boolean} props.isAlreadyMember  - Whether the user is already a member
 * @param {boolean} props.busy             - Whether the join/connect is in progress
 * @param {function} props.onAccept        - Called when the user clicks Accept
 * @param {function} props.onClose         - Called when the user clicks Cancel
 */
export default function InviteModal({
  serverName,
  serverAvatar,
  memberCount,
  onlineCount,
  roomCode,
  isAlreadyMember,
  expiresAt = null,
  errorReason = null,
  busy,
  onAccept,
  onClose,
}) {
  const { t } = useTranslation();
  const { isClosing, triggerClose } = useInternalClose(onClose, 140);

  /* Derive a single letter as fallback avatar */
  const initial = serverName?.trim()?.[0]?.toUpperCase() || "?";

  const errorBannerText =
    errorReason === "EXPIRED"
      ? t("addServerModal.inviteExpired", "Esta invitación venció. Pedí una nueva invitación a un administrador.")
      : errorReason === "REVOKED"
        ? t("addServerModal.inviteRevoked", "Esta invitación fue revocada o reemplazada por una más reciente.")
        : errorReason === "BANNED"
          ? t("addServerModal.inviteBanned", "Tu cuenta está baneada en este servidor.")
          : errorReason === "NO_PEERS_ONLINE"
            ? t("addServerModal.inviteNoPeers", "No hay ningún miembro conectado en la sala ahora para validar tu invitación.")
            : errorReason === "INVALID"
              ? t("addServerModal.inviteInvalid", "La invitación no es válida o ya no está activa.")
              : null;

  const isHardBlocked = Boolean(
    !isAlreadyMember &&
    (errorReason === "EXPIRED" || errorReason === "REVOKED" || errorReason === "BANNED" || errorReason === "INVALID")
  );

  return (
    <div
      className={cn("onicord-modal-backdrop", isClosing && "onicord-animate-backdrop-out")}
      onClick={triggerClose}
    >
      <div
        className={cn(
          "relative w-full max-w-sm rounded-2xl bg-onicord-surface border border-onicord-tint/[0.06] shadow-2xl overflow-hidden onicord-animate-modal-in",
          isClosing && "onicord-animate-modal-out"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex flex-col items-center px-8 pt-10 pb-7 gap-0">
          {/* Server Avatar */}
          <div className="mb-5 relative">
            <div className="w-[88px] h-[88px] rounded-full ring-4 ring-onicord-surface overflow-hidden flex-shrink-0 shadow-lg">
              {serverAvatar ? (
                <SmartAnimatedImage
                  src={serverAvatar}
                  alt={serverName}
                  className="w-full h-full object-cover"
                  isAvatar
                />
              ) : null}
              {/* Fallback letter avatar */}
              <div
                className="w-full h-full flex items-center justify-center text-3xl font-black text-white select-none"
                style={{
                  display: serverAvatar ? "none" : "flex",
                  background:
                    "linear-gradient(135deg, rgba(var(--onicord-lavender)/0.9), rgba(var(--onicord-lavender)/0.5))",
                }}
              >
                {initial}
              </div>
            </div>
          </div>

          {/* Subtitle */}
          <p className="text-sm font-medium text-onicord-muted select-none mb-1">
            {t("inviteModal.invited")}
          </p>

          {/* Server Name */}
          <h2 className="text-2xl font-extrabold text-onicord-text text-center leading-tight mb-4 select-none">
            {serverName || roomCode}
          </h2>

          {/* Members / Online chips */}
          {(memberCount != null && memberCount > 0) || (onlineCount != null && onlineCount > 0) ? (
            <div className="flex items-center justify-center gap-2 mb-6 flex-wrap select-none">
              {onlineCount != null && onlineCount > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-onicord-success/10 border border-onicord-success/20 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-onicord-success flex-shrink-0 animate-pulse" />
                  <span className="text-xs font-semibold text-onicord-text leading-none">
                    {onlineCount.toLocaleString()} {t("inviteModal.online")}
                  </span>
                </div>
              )}
              {memberCount != null && memberCount > 0 && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-onicord-tint/10 border border-onicord-tint/60 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-onicord-tint/60 flex-shrink-0" />
                  <span className="text-xs font-semibold text-onicord-text leading-none">
                    {memberCount.toLocaleString()} {t("inviteModal.members")}
                  </span>
                </div>
              )}
            </div>
          ) : null}

          {expiresAt && !errorBannerText && (
            <p className="text-xs text-onicord-muted mb-4 select-none">
              {t("inviteModal.expiresAt", "Vence:")} {new Date(expiresAt).toLocaleString()}
            </p>
          )}

          {errorBannerText && (
            <div className="w-full mb-4 rounded-xl bg-onicord-danger/15 border border-onicord-danger/30 px-3 py-2 text-xs text-onicord-danger text-center">
              {errorBannerText}
            </div>
          )}

          <div className="w-full flex flex-col gap-2.5">
            <button
              disabled={busy || isHardBlocked}
              onClick={onAccept}
              className="w-full py-3 rounded-xl font-bold text-base transition-all duration-fast select-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: busy
                  ? "rgba(var(--onicord-lavender)/0.4)"
                  : "rgba(var(--onicord-lavender)/0.85)",
                color: "#fff",
                boxShadow: busy ? "none" : "none",
              }}
              onMouseEnter={(e) => {
                if (!busy)
                  e.currentTarget.style.background =
                    "rgba(var(--onicord-lavender)/1)";
              }}
              onMouseLeave={(e) => {
                if (!busy)
                  e.currentTarget.style.background =
                    "rgba(var(--onicord-lavender)/0.85)";
              }}
            >
              {busy
                ? t("inviteModal.connecting")
                : isAlreadyMember
                  ? t("inviteModal.alreadyMember")
                  : t("inviteModal.accept")}
            </button>

            <button
              disabled={busy}
              onClick={triggerClose}
              className="w-full py-2.5 rounded-xl font-semibold text-sm text-onicord-muted hover:text-onicord-subtext transition-colors duration-fast select-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("inviteModal.cancel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
