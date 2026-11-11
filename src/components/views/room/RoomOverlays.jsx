import React, { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import VoiceUserVolumeMenu from "../../voice/VoiceUserVolumeMenu";
import UserProfilePopout from "../../ui/UserProfilePopout";
import ContextMenu from "../../ui/ContextMenu";
import ConfirmDialogModal from "../../modals/ConfirmDialogModal";
import MaterialIcon from "../../icons/MaterialIcon";
import { checkPermission } from "../../../lib/permissionsHelper";
import { soundEngine } from "../../../lib/soundEngine";

const ServerSettingsModal = lazy(() => import("../../modals/ServerSettingsModal"));

export default function RoomOverlays({
  volumeMenu,
  setVolumeMenu,
  voice,
  userPopout,
  handleCloseUserPopout,
  server,
  onOpenAppSettings,
  showSettings,
  setShowSettings,
  peers,
  setPeers,
  profile,
  servers,
  onServerUpdated,
  onLeave,
  onRefreshServers,
  onProfileChange,
  sanitizedMembersList,
  contextMenu,
  setContextMenu,
  handleUserClick,
  handleMessageUser,
  markChannelAsRead,
  moderationConfirm,
  setModerationConfirm,
}) {
  const { t } = useTranslation();

  return (
    <>
      {/* 1. Voice User Volume Menu */}
      {volumeMenu && (
        <VoiceUserVolumeMenu
          x={volumeMenu.x}
          y={volumeMenu.y}
          nickname={volumeMenu.nickname}
          volume={volumeMenu.volume}
          onVolumeChange={(v) => {
            setVolumeMenu((prev) => (prev ? { ...prev, volume: v } : null));
            voice.setPeerVolume?.(volumeMenu.peerId, v);
          }}
          onClose={() => setVolumeMenu(null)}
        />
      )}

      {/* 2. User Profile Popout */}
      {userPopout && (
        <UserProfilePopout
          key={
            userPopout.member.id ||
            userPopout.member.userId ||
            userPopout.member.peerId
          }
          x={userPopout.x}
          y={userPopout.y}
          member={userPopout.member}
          isClosing={userPopout.isClosing}
          onClose={handleCloseUserPopout}
          disableFlameSystem={server?.disableFlameSystem}
          serverId={server.roomCode || server.id}
          onEditProfile={() => {
            onOpenAppSettings?.("profile", { serverId: server.roomCode || server.id });
          }}
          userRolesList={(() => {
            const mId =
              userPopout.member.id ||
              userPopout.member.userId ||
              userPopout.member.peerId;

            const list = (() => {
              if (!server?.roles || !server?.userRoles) return [];
              const uRoles = server.userRoles[mId];
              if (!uRoles) return [];

              const roleIds = Array.isArray(uRoles) ? uRoles : [uRoles];
              return roleIds
                .map((id) => server.roles.find((r) => r.id === id))
                .filter(Boolean)
                .sort(
                  (a, b) =>
                    server.roles.findIndex((r) => r.id === a.id) -
                    server.roles.findIndex((r) => r.id === b.id),
                );
            })();

            if (server?.ownerId && mId === server.ownerId) {
              list.unshift({ id: "owner", name: "crown", color: "#FFD700" });
            }
            return list;
          })()}
        />
      )}

      {/* 3. Server Settings Modal */}
      {showSettings && (
        <Suspense fallback={null}>
          <ServerSettingsModal
            server={server}
            peers={peers}
            profile={profile}
            servers={servers}
            onClose={() => setShowSettings(false)}
            onSave={onServerUpdated}
            onSaved={onServerUpdated}
            onLeave={onLeave}
            onRefreshServers={onRefreshServers}
            onProfileChange={onProfileChange}
            sanitizedMembersList={sanitizedMembersList}
          />
        </Suspense>
      )}

      {/* 4. Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={contextMenu.title}
          onClose={() => setContextMenu(null)}
          items={(() => {
            if (contextMenu.type === "member") {
              const { targetUser } = contextMenu;
              const targetId = targetUser.id || targetUser.userId;
              const isSelf = targetId === profile?.id;
              const ownerId = server?.ownerId;
              const isLocalOwner = Boolean(server?.isOwner || (ownerId && ownerId === profile?.id));
              const isLocalAdmin = isLocalOwner || checkPermission(server, profile?.id, "admin");
              const targetIsOwner = Boolean(ownerId && targetId === ownerId);
              const targetIsAdmin = checkPermission(server, targetId, "admin");
              const canModerate = !isSelf && !targetIsOwner && (isLocalOwner || (isLocalAdmin && !targetIsAdmin));

              const menuItems = [
                {
                  label: t("contextMenu.viewProfile", "Ver perfil"),
                  icon: <MaterialIcon name="person" size={16} />,
                  onClick: () => {
                    handleUserClick(null, targetUser);
                    setContextMenu(null);
                  },
                },
              ];

              if (!isSelf) {
                menuItems.push({
                  label: t("contextMenu.sendDirectMessage", "Mensaje directo"),
                  icon: <MaterialIcon name="chat" size={16} />,
                  onClick: () => {
                    handleMessageUser(targetUser);
                    setContextMenu(null);
                  },
                });
              }

              if (canModerate) {
                menuItems.push(
                  {
                    label: t("settings.members.kickButton", "Expulsar miembro"),
                    icon: <MaterialIcon name="person_remove" size={16} />,
                    danger: true,
                    onClick: () => {
                      setContextMenu(null);
                      setModerationConfirm({
                        type: "kick",
                        targetId,
                        nickname: targetUser.nickname || "este usuario",
                      });
                    },
                  },
                  {
                    label: t("settings.members.banButton", "Banear miembro"),
                    icon: <MaterialIcon name="block" size={16} />,
                    danger: true,
                    onClick: () => {
                      setContextMenu(null);
                      setModerationConfirm({
                        type: "ban",
                        targetId,
                        nickname: targetUser.nickname || "este usuario",
                      });
                    },
                  }
                );
              }

              return menuItems;
            }
            if (contextMenu.type === "voice_user") {
              const { targetUser } = contextMenu;
              return [
                {
                  label: t("voice.userVolume", "Volumen de usuario"),
                  icon: <MaterialIcon name="volume_up" size={16} />,
                  onClick: () => {
                    const currentVol = voice.getPeerVolume?.(targetUser.peerId) ?? 100;
                    setVolumeMenu({
                      x: contextMenu.x,
                      y: contextMenu.y,
                      peerId: targetUser.peerId,
                      nickname: targetUser.nickname,
                      volume: currentVol,
                    });
                    setContextMenu(null);
                  },
                },
              ];
            }
            if (contextMenu.type === "channel") {
              const { channel } = contextMenu;
              const isChMuted = localStorage.getItem(`channel_notif_mode_${channel.id}`) === "nothing";
              return [
                {
                  label: t("contextMenu.markAsRead", "Marcar como leído"),
                  icon: <MaterialIcon name="done_all" size={16} />,
                  onClick: () => {
                    markChannelAsRead?.(server?.roomCode, channel.id);
                    setContextMenu(null);
                  },
                },
                {
                  label: isChMuted
                    ? t("contextMenu.unmuteChannel", "Desilenciar canal")
                    : t("contextMenu.muteChannel", "Silenciar canal"),
                  icon: <MaterialIcon name={isChMuted ? "notifications" : "notifications_off"} size={16} />,
                  onClick: () => {
                    if (isChMuted) {
                      localStorage.removeItem(`channel_notif_mode_${channel.id}`);
                    } else {
                      localStorage.setItem(`channel_notif_mode_${channel.id}`, "nothing");
                    }
                    window.dispatchEvent(new CustomEvent("onicord:channel-mute-changed", { detail: { channelId: channel.id } }));
                    setContextMenu(null);
                  },
                },
              ];
            }
            return [];
          })()}
        />
      )}

      {/* 5. Moderation Confirmation Modal */}
      {moderationConfirm && (
        <ConfirmDialogModal
          isOpen={Boolean(moderationConfirm)}
          title={
            moderationConfirm.type === "ban"
              ? t("settings.members.banTitle", "Banear miembro")
              : t("settings.members.kickTitle", "Expulsar miembro")
          }
          message={
            moderationConfirm.type === "ban"
              ? t("settings.members.confirmBan", `¿Estás seguro de que deseas banear a ${moderationConfirm.nickname}?`)
              : t("settings.members.confirmKick", `¿Estás seguro de que deseas expulsar a ${moderationConfirm.nickname}?`)
          }
          warningMessage={
            moderationConfirm.type === "ban"
              ? t("settings.members.banWarning", "El usuario no podrá volver a unirse hasta que sea desbaneado.")
              : t("settings.members.kickWarning", "El usuario será desconectado inmediatamente del servidor.")
          }
          confirmLabel={moderationConfirm.type === "ban" ? "Banear" : "Expulsar"}
          cancelLabel="Cancelar"
          type="danger"
          onConfirm={async () => {
            const { type, targetId } = moderationConfirm;
            setModerationConfirm(null);
            if (!server?.id || !targetId) return;
            setPeers((prev) =>
              prev.filter((p) => p.id !== targetId && p.userId !== targetId && p.peerId !== targetId)
            );
            try {
              if (type === "kick") {
                const currentKicked = { ...(server.kickedUsers || {}) };
                currentKicked[targetId] = Date.now();
                const updated = await window.electronAPI.updateServerSettings(server.id, {
                  kickedUsers: currentKicked,
                });
                if (updated) onServerUpdated?.(updated);
                soundEngine.playCue("disconnect");
              } else if (type === "ban") {
                const currentBanned = Array.from(new Set([...(server.bannedUsers || []), targetId]));
                const updated = await window.electronAPI.updateServerSettings(server.id, {
                  bannedUsers: currentBanned,
                });
                if (updated) onServerUpdated?.(updated);
                soundEngine.playCue("disconnect");
              }
            } catch (err) {
              console.error(`[Moderation Error (${type})]:`, err);
            }
          }}
          onCancel={() => setModerationConfirm(null)}
        />
      )}
    </>
  );
}
