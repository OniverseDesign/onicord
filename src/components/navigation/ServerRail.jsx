import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { IconAdd, IconSettings } from "../icons/StreamIcons";
import IconEstrella from "../icons/Estrella.svg?react";
import MaterialIcon from "../icons/MaterialIcon";
import SmartAnimatedImage from "../ui/SmartAnimatedImage";
import Tooltip from "../ui/Tooltip";
import { soundEngine } from "../../lib/soundEngine";
import { useServerRailDnd } from "./useServerRailDnd";

function ServerIcon({
  server,
  active,
  unreadCount,
  onClick,
  onContextMenu,
  isMuted,
  isInsideFolder = false,
  isVoiceActive = false,
  onPointerDown,
  isDragging = false,
  isMergeTarget = false,
  suppressClickRef,
}) {
  const hasUnread = unreadCount > 0 && !isMuted;
  const hasIcon = Boolean(server.icon);

  return (
    <Tooltip content={server.name} side="right" disabled={isDragging}>
      <button
        type="button"
        onPointerDown={onPointerDown}
        onClick={(e) => {
          if (suppressClickRef?.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          soundEngine.playNav("select");
          onClick?.(e);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu?.(e, server);
        }}
        className={`group relative flex w-full justify-center py-1 outline-none focus:outline-none touch-none ${
          isDragging ? "opacity-20" : "opacity-100"
        }`}
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

        <div
          className={`relative flex items-center justify-center rounded-[18px] transition-transform duration-150 ${
            isMergeTarget
              ? "scale-105 ring-2 ring-onicord-accent ring-offset-2 ring-offset-onicord-base"
              : ""
          }`}
        >
          <span
            className={`onicord-rail-btn-server relative ${
              hasIcon
                ? active
                  ? "rounded-[16px] !bg-transparent hover:!bg-transparent"
                  : "!bg-transparent hover:!bg-transparent"
                : active
                  ? "onicord-rail-btn-active"
                  : ""
            } ${isMuted ? "opacity-60 hover:opacity-100 transition-opacity" : ""}`}
          >
            {hasIcon ? (
              <SmartAnimatedImage
                src={server.icon}
                alt=""
                className="h-full w-full object-cover pointer-events-none"
              />
            ) : (
              server.name?.slice(0, 2).toUpperCase()
            )}
          </span>

          {isMuted && (
            <div className="absolute -bottom-1 -right-1 bg-onicord-surface text-onicord-muted border border-onicord-border p-0.5 rounded-full flex items-center justify-center shadow-md select-none pointer-events-none w-5 h-5 z-10">
              <MaterialIcon name="notifications_off" size={10} weight={700} />
            </div>
          )}

          {hasUnread && (
            <div className="absolute -bottom-1 -right-1 bg-onicord-danger text-onicord-on-danger text-[10px] font-bold px-1.5 min-w-[16px] h-4 rounded-full flex items-center justify-center border-2 border-onicord-base z-10 animate-scale-up shadow-md pointer-events-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </div>
          )}
        </div>
      </button>
    </Tooltip>
  );
}

function FolderPreviewIcon({ folderServers, isMergeTarget = false }) {
  return (
    <div
      className={`relative flex items-center justify-center rounded-[18px] transition-transform duration-150 ${
        isMergeTarget
          ? "scale-105 ring-2 ring-onicord-accent ring-offset-2 ring-offset-onicord-base"
          : ""
      }`}
    >
      <span className="onicord-rail-btn-server relative flex items-center justify-center transition-all bg-onicord-surface/50 hover:bg-onicord-surface/80">
        <div className="w-full h-full grid grid-cols-2 grid-rows-2 gap-[2px] p-[3px] overflow-hidden onicord-rail-btn onicord-rail-btn-accent">
          {folderServers.slice(0, 4).map((srv) => (
            <div
              key={srv.id}
              className="w-full h-full flex items-center justify-center overflow-hidden rounded-full bg-onicord-base/60 text-[9px] font-bold text-onicord-text"
            >
              {srv.icon ? (
                <SmartAnimatedImage
                  src={srv.icon}
                  alt=""
                  className="w-full h-full object-cover pointer-events-none"
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
  );
}

function ServerFolderItem({
  folder,
  servers,
  activeServerId,
  currentVoiceServerId = null,
  onSelectServer,
  onServerContextMenu,
  getServerUnreadCount,
  mutedServers,
  dnd,
  isDraggingFolder = false,
  isMergeTarget = false,
}) {
  const [expanded, setExpanded] = useState(false);

  // Preserve the exact order of folder.serverIds
  const serverMap = useMemo(() => {
    const map = new Map();
    for (const s of servers) map.set(s.id, s);
    return map;
  }, [servers]);

  const folderServers = useMemo(
    () => (folder.serverIds || []).map((id) => serverMap.get(id)).filter(Boolean),
    [folder.serverIds, serverMap]
  );

  const memberIds = useMemo(() => folderServers.map((s) => s.id), [folderServers]);

  const hasUnread = folderServers.some((s) => {
    const unread = getServerUnreadCount?.(s.roomCode) || 0;
    const isMuted = mutedServers.includes(s.roomCode);
    return unread > 0 && !isMuted;
  });

  const isFolderActive = folderServers.some((s) => s.id === activeServerId);
  const isFolderVoiceActive = Boolean(
    currentVoiceServerId && folderServers.some((s) => s.id === currentVoiceServerId)
  );

  const {
    activeDrag,
    dropTarget,
    suppressClickRef,
    startPointerDrag,
    registerFolderCard,
    registerFolderServer,
    getFolderServerShiftY,
  } = dnd;

  const isFolderInnerDrop =
    dropTarget?.scope === "folder-inner" && dropTarget.folderId === folder.id;

  return (
    <div
      ref={(el) => registerFolderCard(folder.id, expanded ? el : null)}
      className={`w-full flex flex-col items-center gap-1 ${
        isDraggingFolder ? "opacity-20" : "opacity-100"
      }`}
    >
      {!expanded ? (
        /* Closed state: 2x2 grid preview button */
        <Tooltip content={folder.name} side="right" disabled={isDraggingFolder || Boolean(activeDrag)}>
          <button
            type="button"
            onPointerDown={(e) =>
              startPointerDrag(e, { type: "folder", id: folder.id, sourceFolderId: null })
            }
            onClick={(e) => {
              if (suppressClickRef.current) {
                e.preventDefault();
                e.stopPropagation();
                return;
              }
              soundEngine.playNav("expand");
              setExpanded(true);
            }}
            className="group relative flex w-full justify-center py-1 cursor-pointer outline-none focus:outline-none touch-none"
          >
            <span
              className={`onicord-rail-indicator ${
                isFolderVoiceActive
                  ? "h-8 opacity-100 bg-onicord-success shadow-[0_0_10px_rgba(34,197,94,0.7)]"
                  : isFolderActive
                    ? "h-10 opacity-100"
                    : hasUnread
                      ? "h-2 opacity-100 bg-white"
                      : "h-0 opacity-0 group-hover:h-5 group-hover:opacity-100"
              }`}
            />

            <FolderPreviewIcon
              folder={folder}
              folderServers={folderServers}
              isMergeTarget={isMergeTarget}
            />
          </button>
        </Tooltip>
      ) : (
        /* EXPANDED STATE: Folder header and all servers inside the container card */
        <div
          className={`w-[62px] py-1 px-1 rounded-onicord-outer-p4 bg-onicord-surface border flex flex-col items-center gap-1.5 animate-scale-up relative transition-colors ${
            isMergeTarget || isFolderInnerDrop
              ? "border-onicord-accent/70 bg-onicord-surface/95"
              : "border-onicord-island"
          }`}
        >
          {/* Folder Top Button */}
          <Tooltip content={folder.name} side="right" disabled={isDraggingFolder || Boolean(activeDrag)}>
            <button
              type="button"
              onPointerDown={(e) =>
                startPointerDrag(e, { type: "folder", id: folder.id, sourceFolderId: null })
              }
              onClick={(e) => {
                if (suppressClickRef.current) {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                soundEngine.playNav("collapse");
                setExpanded(false);
              }}
              className="w-full flex justify-center py-1 cursor-pointer transition-opacity outline-none focus:outline-none touch-none"
            >
              <div className="w-10 h-10 rounded-onicord-outer-p4 flex items-center justify-center text-onicord-accent hover:text-onicord-text transition-colors">
                <MaterialIcon name="folder_open" size={22} />
              </div>
            </button>
          </Tooltip>

          {folderServers.map((server, idx) => {
            const active = activeServerId === server.id;
            const unreadCount = getServerUnreadCount?.(server.roomCode) || 0;
            const isMuted = mutedServers.includes(server.roomCode);
            const hasUnread = unreadCount > 0 && !isMuted;
            const isVoiceActive = currentVoiceServerId === server.id;
            const isServerDragging =
              activeDrag?.type === "server" && activeDrag.id === server.id;
            const shiftY = getFolderServerShiftY(folder.id, memberIds, idx);
            const showExternalLineBefore =
              isFolderInnerDrop &&
              activeDrag?.sourceFolderId !== folder.id &&
              dropTarget.insertIndex === idx;

            return (
              <div
                key={server.id}
                ref={(el) => registerFolderServer(folder.id, server.id, el)}
                style={shiftY ? { transform: `translateY(${shiftY}px)` } : undefined}
                className="w-full relative group flex flex-col items-center onicord-rail-dnd-item"
              >
                {showExternalLineBefore && (
                  <div className="onicord-rail-drop-line -top-1 absolute z-30" />
                )}

                <div className="w-full relative flex items-center">
                  {/* Left rail active indicator pill */}
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
                    isInsideFolder={true}
                    isVoiceActive={isVoiceActive}
                    isDragging={isServerDragging}
                    suppressClickRef={suppressClickRef}
                    onPointerDown={(e) =>
                      startPointerDrag(e, {
                        type: "server",
                        id: server.id,
                        sourceFolderId: folder.id,
                      })
                    }
                  />
                </div>
              </div>
            );
          })}

          {isFolderInnerDrop &&
            activeDrag?.sourceFolderId !== folder.id &&
            dropTarget.insertIndex >= folderServers.length && (
              <div className="onicord-rail-drop-line my-0.5" />
            )}
        </div>
      )}
    </div>
  );
}

export default function ServerRail({
  servers = [],
  folders = [],
  serverOrder = [],
  activeServerId,
  currentVoiceServerId = null,
  activeView = null,
  onSelectView = null,
  onSelectHome,
  onSelectServer,
  onAdd,
  onServerContextMenu,
  onOpenAppSettings,
  getServerUnreadCount,
  mutedServers = [],
  onUpdateFolders,
  onUpdateRailLayout,
}) {
  const { t } = useTranslation();
  const scrollContainerRef = useRef(null);

  const homeActive = activeView ? activeView === "home" : activeServerId === null;

  const commitLayout = useCallback(
    ({ nextFolders, nextOrder }) => {
      if (onUpdateRailLayout) {
        onUpdateRailLayout({ serverFolders: nextFolders, serverOrder: nextOrder });
      } else {
        onUpdateFolders?.(nextFolders);
      }
    },
    [onUpdateRailLayout, onUpdateFolders]
  );

  // Clean up folders whose servers no longer exist (or dissolve < 2) once servers are loaded
  useEffect(() => {
    if (!servers || servers.length === 0 || !folders || folders.length === 0) return;

    const validServerIdsSet = new Set(servers.map((s) => s.id));
    let hasChanges = false;
    const dissolvedMap = new Map();
    const cleanedFolders = [];

    for (const f of folders) {
      const validIds = (f.serverIds || []).filter((id) => validServerIdsSet.has(id));
      if (validIds.length !== (f.serverIds || []).length) {
        hasChanges = true;
      }
      if (validIds.length >= 2) {
        cleanedFolders.push({ ...f, serverIds: validIds });
      } else {
        hasChanges = true;
        dissolvedMap.set(f.id, validIds[0] || null);
      }
    }

    if (hasChanges) {
      const nextOrder = (serverOrder || []).flatMap((entry) => {
        if (entry?.type === "folder" && dissolvedMap.has(entry.id)) {
          const remaining = dissolvedMap.get(entry.id);
          return remaining ? [{ type: "server", id: remaining }] : [];
        }
        return entry ? [entry] : [];
      });
      commitLayout({ nextFolders: cleanedFolders, nextOrder });
    }
  }, [servers, folders, serverOrder, commitLayout]);

  // Build unified top-level rail items (folders + standalone servers interleaved)
  const railItems = useMemo(() => {
    const serverMap = new Map();
    for (const s of servers) serverMap.set(s.id, s);

    const folderMap = new Map();
    const groupedServerIds = new Set();
    for (const f of folders) {
      const validIds = (f.serverIds || []).filter((id) => serverMap.has(id));
      if (validIds.length > 0) {
        folderMap.set(f.id, { ...f, serverIds: validIds });
        for (const id of validIds) groupedServerIds.add(id);
      }
    }

    const result = [];
    const seenKeys = new Set();

    if (Array.isArray(serverOrder) && serverOrder.length > 0) {
      for (const entry of serverOrder) {
        if (!entry || !entry.id || !entry.type) continue;
        const key = `${entry.type}:${entry.id}`;
        if (seenKeys.has(key)) continue;

        if (entry.type === "folder" && folderMap.has(entry.id)) {
          seenKeys.add(key);
          result.push({ type: "folder", id: entry.id, folder: folderMap.get(entry.id) });
        } else if (
          entry.type === "server" &&
          serverMap.has(entry.id) &&
          !groupedServerIds.has(entry.id)
        ) {
          seenKeys.add(key);
          result.push({ type: "server", id: entry.id, server: serverMap.get(entry.id) });
        }
      }
    }

    // Append any folders or standalone servers not yet listed in serverOrder
    for (const [fId, folder] of folderMap.entries()) {
      const key = `folder:${fId}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        result.push({ type: "folder", id: fId, folder });
      }
    }
    for (const srv of servers) {
      if (groupedServerIds.has(srv.id)) continue;
      const key = `server:${srv.id}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        result.push({ type: "server", id: srv.id, server: srv });
      }
    }

    return result;
  }, [servers, folders, serverOrder]);

  const dnd = useServerRailDnd({
    railItems,
    folders,
    scrollContainerRef,
    onCommitLayout: commitLayout,
  });

  const {
    activeDrag,
    dropTarget,
    ghostRef,
    suppressClickRef,
    startPointerDrag,
    registerTopItem,
    getTopItemShiftY,
  } = dnd;

  // Lookup dragged entity for the floating ghost
  const draggedServer =
    activeDrag?.type === "server"
      ? servers.find((s) => s.id === activeDrag.id) || null
      : null;
  const draggedFolder =
    activeDrag?.type === "folder"
      ? folders.find((f) => f.id === activeDrag.id) || null
      : null;
  const draggedFolderServers = draggedFolder
    ? (draggedFolder.serverIds || [])
        .map((id) => servers.find((s) => s.id === id))
        .filter(Boolean)
    : [];

  return (
    <nav className="flex w-[66px] h-full shrink-0 flex-col items-center bg-onicord-base py-2 select-none">
      {/* Home / Dashboard Button */}
      <Tooltip content={t("serverRail.homeTitle")} side="right" disabled={Boolean(activeDrag)}>
        <button
          type="button"
          onClick={() => {
            soundEngine.playNav("select");
            if (onSelectHome) onSelectHome();
            else if (onSelectServer) onSelectServer(null);
          }}
          className="group relative mb-2 flex w-full justify-center outline-none focus:outline-none"
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
      </Tooltip>

      <div className="mb-2 h-0.5 w-8 rounded-full bg-onicord-overlay" />

      {/* Servers/Folders scroll area */}
      <div
        ref={scrollContainerRef}
        className="flex w-full flex-1 flex-col items-center gap-2.5 overflow-y-auto no-scrollbar py-0.5"
      >
        {railItems.map((item, idx) => {
          const key = `${item.type}:${item.id}`;
          const shiftY = getTopItemShiftY(idx);
          const isDragging =
            activeDrag?.type === item.type &&
            activeDrag?.id === item.id &&
            !activeDrag?.sourceFolderId;
          const isMergeTarget =
            dropTarget?.scope === "merge" &&
            dropTarget?.targetType === item.type &&
            dropTarget?.targetId === item.id;
          const showInsertLineBefore =
            Boolean(activeDrag?.sourceFolderId) &&
            dropTarget?.scope === "top-reorder" &&
            dropTarget?.insertIndex === idx;

          return (
            <div
              key={key}
              ref={(el) => registerTopItem(key, el)}
              style={shiftY ? { transform: `translateY(${shiftY}px)` } : undefined}
              className="w-full relative flex flex-col items-center onicord-rail-dnd-item"
            >
              {showInsertLineBefore && (
                <div className="onicord-rail-drop-line -top-1.5 absolute z-30" />
              )}

              {item.type === "folder" ? (
                <ServerFolderItem
                  folder={item.folder}
                  servers={servers}
                  activeServerId={activeServerId}
                  currentVoiceServerId={currentVoiceServerId}
                  onSelectServer={onSelectServer}
                  onServerContextMenu={onServerContextMenu}
                  getServerUnreadCount={getServerUnreadCount}
                  mutedServers={mutedServers}
                  dnd={dnd}
                  isDraggingFolder={isDragging}
                  isMergeTarget={isMergeTarget}
                />
              ) : (
                <ServerIcon
                  server={item.server}
                  active={activeServerId === item.server.id}
                  onClick={() => onSelectServer?.(item.server.id)}
                  onContextMenu={onServerContextMenu}
                  unreadCount={getServerUnreadCount?.(item.server.roomCode) || 0}
                  isMuted={mutedServers.includes(item.server.roomCode)}
                  isVoiceActive={currentVoiceServerId === item.server.id}
                  isDragging={isDragging}
                  isMergeTarget={isMergeTarget}
                  suppressClickRef={suppressClickRef}
                  onPointerDown={(e) =>
                    startPointerDrag(e, {
                      type: "server",
                      id: item.server.id,
                      sourceFolderId: null,
                    })
                  }
                />
              )}
            </div>
          );
        })}

        {Boolean(activeDrag?.sourceFolderId) &&
          dropTarget?.scope === "top-reorder" &&
          dropTarget?.insertIndex >= railItems.length && (
            <div className="onicord-rail-drop-line my-0.5" />
          )}
      </div>

      {/* Rail Bottom Action Buttons */}
      <div className="flex flex-col items-center gap-2 mt-auto w-full shrink-0 pt-2">
        {/* Native Discover Button (Above Add Server) */}
        <Tooltip content={t("discover.heroTitle", "Explorar Servidores")} side="right" disabled={Boolean(activeDrag)}>
          <button
            type="button"
            onClick={() => {
              soundEngine.playNav("select");
              onSelectView?.("discover");
            }}
            className="group relative flex w-full justify-center outline-none focus:outline-none"
          >
            <span
              className={`onicord-rail-indicator ${
                activeView === "discover"
                  ? "h-10 opacity-100 bg-white"
                  : "h-0 opacity-0 group-hover:h-5 group-hover:opacity-100"
              }`}
            />
            <span
              className={`onicord-rail-btn ${
                activeView === "discover"
                  ? "onicord-rail-btn-active bg-onicord-accent text-white border-transparent"
                  : "onicord-rail-btn-accent text-onicord-accent hover:text-white"
              }`}
            >
              <MaterialIcon name="explore" size={24} />
            </span>
          </button>
        </Tooltip>

        <Tooltip content={t("serverRail.addServerTitle")} side="right" disabled={Boolean(activeDrag)}>
          <button
            type="button"
            onClick={() => {
              soundEngine.playNav("open");
              onAdd?.();
            }}
            className="group relative flex w-full justify-center outline-none focus:outline-none"
          >
            <span className="onicord-rail-btn onicord-rail-btn-accent">
              <IconAdd size="xl" />
            </span>
          </button>
        </Tooltip>

        <Tooltip content={t("userPanel.settingsTitle")} side="right" disabled={Boolean(activeDrag)}>
          <button
            type="button"
            onClick={onOpenAppSettings}
            className="group relative flex w-full justify-center outline-none focus:outline-none"
          >
            <span className="onicord-rail-btn onicord-rail-btn-accent">
              <IconSettings className="transition-transform duration-300 ease-in-out group-hover:rotate-180" />
            </span>
          </button>
        </Tooltip>
      </div>

      {/* Floating 60fps Drag Ghost Portal */}
      {activeDrag &&
        (draggedServer || draggedFolder) &&
        createPortal(
          <div
            ref={ghostRef}
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              width: activeDrag.rect?.width || 66,
              transform: `translate3d(${activeDrag.initialX}px, ${activeDrag.initialY}px, 0) scale(1.06)`,
              pointerEvents: "none",
              zIndex: 9999,
              willChange: "transform",
            }}
            className="flex justify-center py-1 drop-shadow-[0_10px_20px_rgba(0,0,0,0.45)]"
          >
            {draggedServer ? (
              <span className="onicord-rail-btn-server rounded-[16px] ring-2 ring-onicord-accent/80">
                {draggedServer.icon ? (
                  <SmartAnimatedImage
                    src={draggedServer.icon}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  draggedServer.name?.slice(0, 2).toUpperCase()
                )}
              </span>
            ) : (
              <FolderPreviewIcon
                folder={draggedFolder}
                folderServers={draggedFolderServers}
              />
            )}
          </div>,
          document.body
        )}
    </nav>
  );
}
