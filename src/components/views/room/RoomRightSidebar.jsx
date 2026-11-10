import React from "react";
import { useTranslation } from "react-i18next";
import RichPresenceCard from "../../ui/RichPresenceCard";
import MembersSidebar from "../../navigation/MembersSidebar";
import PluginIsland from "../../plugins/PluginIsland";

export default function RoomRightSidebar({
  rightWidth,
  hasActiveGame,
  displayGame,
  sanitizedMembersList,
  voiceMembersDisplay,
  voice,
  handleVoiceUserContextMenu,
  handleMemberContextMenu,
  handleUserClick,
  profile,
  server,
  onOpenAppSettings,
  getChannelUnreadCount,
  handleMessageUser,
}) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        width: `${rightWidth}px`,
        minWidth: `${rightWidth}px`,
        maxWidth: `${rightWidth}px`,
        gap: "calc(var(--gap) + 3px)",
      }}
      className="h-full shrink-0 flex-shrink-0 flex flex-col"
    >
      {/* Draggable Rich Presence island */}
      <div
        className={`w-full overflow-hidden transition-all duration-300 ease-in-out shrink-0 flex flex-col ${
          hasActiveGame
            ? "max-h-48 opacity-100 scale-100 pointer-events-auto"
            : "max-h-0 opacity-0 scale-95 pointer-events-none -mb-[calc(var(--gap)+3px)]"
        }`}
      >
        {displayGame && displayGame.name && (
          <RichPresenceCard
            gameName={displayGame.name}
            cover={displayGame.cover}
            smallCover={displayGame.smallCover}
            startTime={displayGame.startTime}
            type={displayGame.type || "game"}
            state={displayGame.state}
            party={displayGame.party}
            details={
              displayGame.details ||
              (displayGame.type === "music"
                ? t("userPanel.listeningTo", "Escuchando a")
                : displayGame.type === "movie" || displayGame.type === "cinema" || displayGame.name === "Cinema" || displayGame.source === "addon:onicord-cinema"
                  ? (displayGame.isCatalog ? t("userPanel.exploring", "Explorando") : t("userPanel.watching", "Viendo"))
                  : displayGame.type === "app"
                    ? t("gamesTab.usingNow", "Usando ahora")
                    : displayGame.type === "client"
                      ? t("userPopout.inMenus", "En los menús")
                      : t("userPanel.playing", "Jugando a"))
            }
          />
        )}
      </div>

      <MembersSidebar
        members={sanitizedMembersList}
        voiceMembers={voiceMembersDisplay}
        onVoiceUserContextMenu={
          voice.inVoice ? handleVoiceUserContextMenu : undefined
        }
        onMemberContextMenu={handleMemberContextMenu}
        onUserClick={handleUserClick}
        profile={profile}
        roomCode={server.roomCode}
        serverId={server.roomCode || server.id}
        onEditProfile={() => {
          onOpenAppSettings?.("profile", { serverId: server.roomCode || server.id });
        }}
        getChannelUnreadCount={getChannelUnreadCount}
        onMessageUser={handleMessageUser}
        disableFlameSystem={server?.disableFlameSystem}
        ownerId={server?.ownerId}
        server={server}
      />

      <PluginIsland
        roomCode={server?.roomCode}
        profile={profile}
        server={server}
        voice={voice}
      />
    </div>
  );
}
