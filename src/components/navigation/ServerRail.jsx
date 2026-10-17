import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { IconAdd, IconSettings } from "../icons/StreamIcons";
import IconEstrella from "../icons/Estrella.svg?react";
import MaterialIcon from "../icons/MaterialIcon";
import SmartAnimatedImage from "../ui/SmartAnimatedImage";
import { soundEngine } from "../../lib/soundEngine";

function ServerIcon({
  server,
  active,
  unreadCount,
  onClick,
  onContextMenu,
  isMuted,
  onMergeServers,
  isInsideFolder = false,
  isVoiceActive = false,
}) {
  const hasUnread = unreadCount > 0 && !isMuted;

  return (
    <button
      type="button"
      draggable="true"
      onDragStart={(e) => {
        e.dataTransfer.setData(
          "text/plain",
          JSON.stringify({ type: "server", id: server.id }),
        );
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.classList.add("scale-105");
      }}
      onDragLeave={(e) => e.currentTarget.classList.remove("scale-105")}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("scale-105");
        try {
          const data = JSON.parse(e.dataTransfer.getData("text/plain"));
          if (data.type === "server" && data.id !== server.id) {
            onMergeServers?.(data.id, server.id);
          }
        } catch {}
      }}
      onClick={(e) => {
        soundEngine.playNav("select");
        onClick?.(e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(e, server);
      }}
      title={server.name}
      className="group relative flex w-full justify-center py-1"
    >
      {/* Show outer indicator pill ONLY when not inside a folder card container */}
      {!isInsideFolder && (
        <span
          className={`onicord-rail-indicator ${
            isVoiceActive
              ? "h-10 opacity-100 bg-onicord-success shadow-[0_0_12px_rgba(34,197,94,0.7)]"
              : active
                ? "h-10 opacity-100 bg-white"
                : hasUnread
                  ? "h-2 opacity-100 bg-white"
                  : "h-0 opacity-0 group-hover:h-5 group-hover:opacity-100"
          }`}
        />
      )}

      <div className="relative flex items-center justify-center">
        <span
          className={`onicord-rail-btn-server relative ${
            active ? "onicord-rail-btn-active" : ""
          } ${isMuted ? "opacity-60 hover:opacity-100 transition-opacity" : ""}`}
        >
          {server.icon ? (
            <SmartAnimatedImage
              src={server.icon}
              alt=""
              className="h-full w-full object-cover"
              isAvatar
            />
          ) : (
            server.name?.slice(0, 2).toUpperCase()
          )}
        </span>

        {isMuted && (
          <div className="absolute -bottom-1 -right-1 bg-onicord-surface text-onicord-muted border border-white/5 p-0.5 rounded-full flex items-center justify-center shadow-md select-none pointer-events-none w-5 h-5 z-10">
            <MaterialIcon name="notifications_off" size={10} weight={700} />
          </div>
        )}

        {hasUnread && (
          <div className="absolute -bottom-1 -right-1 bg-onicord-danger text-white text-[10px] font-bold px-1.5 min-w-[16px] h-4 rounded-full flex items-center justify-center border-2 border-onicord-base z-10 animate-scale-up shadow-md pointer-events-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </div>
        )}
      </div>
    </button>
  );
}

function ServerFolderItem({
  folder,
  servers,
  activeServerId,
  onSelectServer,
  onServerContextMenu,
  getServerUnreadCount,
  mutedServers,
  onDropOnFolder,
  onRemoveFromFolder,
  onMergeServers,
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();

  const folderServers = servers.filter((s) => folder.serverIds.includes(s.id));

  const hasUnread = folderServers.some((s) => {
    const unread = getServerUnreadCount?.(s.roomCode) || 0;
    const isMuted = mutedServers.includes(s.roomCode);
    return unread > 0 && !isMuted;
  });

  const isFolderActive = folderServers.some((s) => s.id === activeServerId);

  return (
    <div
      className="w-full flex flex-col items-center gap-1"
      onDragOver={(e) => {
        e.preventDefault();
        e.currentTarget.classList.add("scale-105");
      }}
      onDragLeave={(e) => e.currentTarget.classList.remove("scale-105")}
      onDrop={(e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("scale-105");
        try {
          const data = JSON.parse(e.dataTransfer.getData("text/plain"));
          if (data.type === "server") {
            onDropOnFolder?.(data.id, folder.id);
          }
        } catch {}
      }}
    >
      {/* UNIFIED CONTAINER */}
      {!expanded ? (
        /* CLOSED STATE: 2x2 grid preview button */
        <button
          type="button"
          onClick={() => {
            soundEngine.playNav("expand");
            setExpanded(true);
          }}
          title={folder.name}
          className="group relative flex w-full justify-center py-1 cursor-pointer"
        >
          <span
            className={`onicord-rail-indicator ${
              isFolderActive
                ? "h-10 opacity-100"
                : hasUnread
                  ? "h-2 opacity-100 bg-white"
                  : "h-0 opacity-0 group-hover:h-5 group-hover:opacity-100"
            }`}
          />

          <div className="relative flex items-center justify-center">
            <span className="onicord-rail-btn-server relative flex items-center justify-center transition-all bg-onicord-surface/50 hover:bg-onicord-surface/80">
              <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-[2px] p-[3px] overflow-hidden onicord-rail-btn onicord-rail-btn-accent">
                {folderServers.slice(0, 4).map((srv) => (
                  <div
                    key={srv.id}
                    className="w-full h-full flex items-center justify-center overflow-hidden rounded-full bg-onicord-base/60 text-[9px] font-bold text-white"
                  >
                    {srv.icon ? (
                      <SmartAnimatedImage
                        src={srv.icon}
                        alt=""
                        className="w-full h-full object-cover"
                        isAvatar
                      />
                    ) : (
                      <span className="text-[9px] font-extrabold uppercase select-none">
                        {srv.name?.slice(0, 1)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </span>
          </div>
        </button>
      ) : (
        /* EXPANDED STATE: Folder header and all servers inside the EXACT SAME container card */
        <div className="w-[62px] py-1 px-1 rounded-onicord-outer-p4 bg-onicord-surface border border-onicord-island flex flex-col items-center gap-1.5 animate-scale-up relative">
          {/* Folder Top Button */}
          <button
            type="button"
            onClick={() => {
              soundEngine.playNav("collapse");
              setExpanded(false);
            }}
            title={folder.name}
            className="w-full flex justify-center py-1 cursor-pointer transition-opacity"
          >
            <div className="w-10 h-10 rounded-onicord-outer-p4 flex items-center justify-center text-onicord-accent hover:text-onicord-text transition-colors">
              <MaterialIcon name="folder_open" size={22} />
            </div>
          </button>

          {folderServers.map((server) => {
            const active = activeServerId === server.id;
            const unreadCount = getServerUnreadCount?.(server.roomCode) || 0;
            const isMuted = mutedServers.includes(server.roomCode);
            const hasUnread = unreadCount > 0 && !isMuted;
            const isVoiceActive = currentVoiceServerId === server.id;

            return (
              <div
                key={server.id}
                draggable="true"
                onDragStart={(e) => {
                  e.dataTransfer.setData(
                    "text/plain",
                    JSON.stringify({ type: "server", id: server.id }),
                  );
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.add("scale-105");
                }}
                onDragLeave={(e) => e.currentTarget.classList.remove("scale-105")}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("scale-105");
                  try {
                    const data = JSON.parse(e.dataTransfer.getData("text/plain"));
                    if (data.type === "server" && data.id !== server.id) {
                      onMergeServers?.(data.id, server.id);
                    }
                  } catch {}
                }}
                className="w-full relative group flex items-center"
              >
                {/* Indicator pill ON THE FAR-LEFT EDGE OF THE RAIL, OUTSIDE THE CONTAINER */}
                <span
                  className={`onicord-rail-indicator absolute -left-[9px] z-20 ${
                    isVoiceActive
                      ? "h-8 opacity-100 bg-onicord-success shadow-[0_0_10px_rgba(34,197,94,0.7)]"
                      : active
                        ? "h-8 opacity-100 bg-white"
                        : hasUnread
                          ? "h-2 opacity-100 bg-white"
                          : "h-0 opacity-0 group-hover:h-4 group-hover:opacity-100"
                  }`}
                />

                <ServerIcon
                  server={server}
                  active={active}
                  onClick={() => onSelectServer?.(server.id)}
                  onContextMenu={onServerContextMenu}
                  unreadCount={unreadCount}
                  isMuted={isMuted}
                  onMergeServers={onMergeServers}
                  isInsideFolder={true}
                  isVoiceActive={isVoiceActive}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ServerRail({
  servers = [],
  folders = [],
  activeServerId,
  currentVoiceServerId = null,
  onSelectHome,
  onSelectServer,
  onAdd,
  onServerContextMenu,
  onOpenAppSettings,
  getServerUnreadCount,
  mutedServers = [],
  onUpdateFolders,
}) {
  const { t } = useTranslation();
  const homeActive = activeServerId === null;

  // Automatically delete folders if they have no valid servers inside
  useEffect(() => {
    if (!folders || folders.length === 0) return;

    let hasChanges = false;
    const cleanedFolders = folders
      .map((f) => {
        const validServerIds = (f.serverIds || []).filter((id) =>
          servers.some((s) => s.id === id)
        );
        if (validServerIds.length !== (f.serverIds || []).length) {
          hasChanges = true;
        }
        return { ...f, serverIds: validServerIds };
      })
      .filter((f) => {
        if (f.serverIds.length === 0) {
          hasChanges = true;
          return false;
        }
        return true;
      });

    if (hasChanges) {
      onUpdateFolders?.(cleanedFolders);
    }
  }, [servers, folders, onUpdateFolders]);

  // Standalone servers are not in any folder
  const groupedServerIds = folders.flatMap((f) => f.serverIds || []);
  const standaloneServers = servers.filter((s) => !groupedServerIds.includes(s.id));

  const handleMergeServers = (sourceId, targetId) => {
    let nextFolders = [...folders];
    let sourceFolder = nextFolders.find((f) => f.serverIds.includes(sourceId));
    let targetFolder = nextFolders.find((f) => f.serverIds.includes(targetId));

    // Remove from old source folder
    if (sourceFolder) {
      nextFolders = nextFolders.map((f) =>
        f.id === sourceFolder.id
          ? { ...f, serverIds: f.serverIds.filter((id) => id !== sourceId) }
          : f
      );
    }

    if (targetFolder) {
      // Add to target folder
      nextFolders = nextFolders.map((f) =>
        f.id === targetFolder.id
          ? { ...f, serverIds: [...new Set([...f.serverIds, sourceId])] }
          : f
      );
    } else {
      // Create new folder
      nextFolders.push({
        id: crypto.randomUUID(),
        name: "Nueva Carpeta",
        serverIds: [targetId, sourceId],
      });
    }

    // Clean up empty folders
    nextFolders = nextFolders
      .map((f) => ({
        ...f,
        serverIds: f.serverIds.filter((id) => servers.some((s) => s.id === id)),
      }))
      .filter((f) => f.serverIds.length > 0);
    onUpdateFolders?.(nextFolders);
  };

  const handleDropOnFolder = (serverId, folderId) => {
    let nextFolders = folders.map((f) => {
      if (f.id === folderId) {
        return { ...f, serverIds: [...new Set([...f.serverIds, serverId])] };
      }
      return { ...f, serverIds: f.serverIds.filter((id) => id !== serverId) };
    });

    nextFolders = nextFolders
      .map((f) => ({
        ...f,
        serverIds: f.serverIds.filter((id) => servers.some((s) => s.id === id)),
      }))
      .filter((f) => f.serverIds.length > 0);
    onUpdateFolders?.(nextFolders);
  };

  const handleRemoveFromFolder = (serverId) => {
    let nextFolders = folders.map((f) => ({
      ...f,
      serverIds: f.serverIds.filter((id) => id !== serverId),
    }));

    nextFolders = nextFolders
      .map((f) => ({
        ...f,
        serverIds: f.serverIds.filter((id) => servers.some((s) => s.id === id)),
      }))
      .filter((f) => f.serverIds.length > 0);
    onUpdateFolders?.(nextFolders);
  };

  return (
    <nav
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        try {
          const data = JSON.parse(e.dataTransfer.getData("text/plain"));
          if (data.type === "server") {
            handleRemoveFromFolder(data.id);
          }
        } catch {}
      }}
      className="flex w-[72px] h-full shrink-0 flex-col items-center bg-onicord-base py-3 select-none"
    >
      {/* Home / Dashboard Button */}
      <button
        type="button"
        onClick={() => {
          soundEngine.playNav("select");
          if (onSelectHome) onSelectHome();
          else if (onSelectServer) onSelectServer(null);
        }}
        title={t("serverRail.homeTitle")}
        className="group relative mb-2 flex w-full justify-center"
      >
        <span
          className={`onicord-rail-indicator ${
            homeActive
              ? "h-10 opacity-100"
              : "h-0 opacity-0 group-hover:h-5 group-hover:opacity-100"
          }`}
        />
        <span
          className={`onicord-rail-btn-server ${
            homeActive ? "onicord-rail-btn-active" : "text-onicord-accent"
          }`}
        >
          <IconEstrella className="w-7 h-7 transition-transform duration-300 ease-in-out transform group-hover:rotate-180" />
        </span>
      </button>

      <div className="mb-2 h-0.5 w-8 rounded-full bg-onicord-overlay" />

      {/* Servers/Folders Scroll Area */}
      <div className="flex w-full flex-1 flex-col items-center gap-2.5 overflow-y-auto no-scrollbar">
        {/* Render Folders */}
        {folders.map((folder) => (
          <ServerFolderItem
            key={folder.id}
            folder={folder}
            servers={servers}
            activeServerId={activeServerId}
            onSelectServer={onSelectServer}
            onServerContextMenu={onServerContextMenu}
            getServerUnreadCount={getServerUnreadCount}
            mutedServers={mutedServers}
            onDropOnFolder={handleDropOnFolder}
            onRemoveFromFolder={handleRemoveFromFolder}
            onMergeServers={handleMergeServers}
          />
        ))}

        {/* Render Standalone Servers */}
        {standaloneServers.map((server) => (
          <ServerIcon
            key={server.id}
            server={server}
            active={activeServerId === server.id}
            onClick={() => onSelectServer?.(server.id)}
            onContextMenu={onServerContextMenu}
            unreadCount={getServerUnreadCount?.(server.roomCode) || 0}
            isMuted={mutedServers.includes(server.roomCode)}
            onMergeServers={handleMergeServers}
            isVoiceActive={currentVoiceServerId === server.id}
          />
        ))}
      </div>

      {/* Rail Bottom Action Buttons */}
      <div className="flex flex-col items-center gap-2 mt-auto w-full shrink-0 pt-2">
        <button
          type="button"
          onClick={() => {
            soundEngine.playNav("open");
            onAdd?.();
          }}
          title={t("serverRail.addServerTitle")}
          className="group relative flex w-full justify-center"
        >
          <span className="onicord-rail-btn onicord-rail-btn-accent">
            <IconAdd size="xl" />
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenAppSettings}
          title={t("userPanel.settingsTitle")}
          className="group relative flex w-full justify-center"
        >
          <span className="onicord-rail-btn onicord-rail-btn-accent">
            <IconSettings className="transition-transform duration-300 ease-in-out group-hover:rotate-180" />
          </span>
        </button>
      </div>
    </nav>
  );
}
