import { useState, useRef, useEffect, useCallback } from "react";

const DRAG_THRESHOLD_PX = 6;
const AUTO_SCROLL_EDGE_PX = 36;
const AUTO_SCROLL_MAX_SPEED = 10;
const RAIL_GAP_PX = 10; // matches gap-2.5 (0.625rem = 10px)
const FOLDER_INNER_GAP_PX = 6; // matches gap-1.5 (0.375rem = 6px)

/**
 * Pure helper that computes the updated folders and top-level rail order
 * after a drag-and-drop operation completes.
 */
export function computeNextRailLayout(folders, railItems, draggedItem, dropTarget) {
  if (!draggedItem || !dropTarget) return null;

  let nextFolders = folders.map((f) => ({
    ...f,
    serverIds: [...(f.serverIds || [])],
  }));
  let nextOrder = railItems.map((item) => ({ type: item.type, id: item.id }));

  const removeFromSourceFolder = (serverId, sourceFolderId) => {
    if (!sourceFolderId) return;
    nextFolders = nextFolders.map((f) =>
      f.id === sourceFolderId
        ? { ...f, serverIds: f.serverIds.filter((id) => id !== serverId) }
        : f
    );
  };

  if (draggedItem.type === "folder") {
    if (dropTarget.scope !== "top-reorder") return null;
    const fromIdx = nextOrder.findIndex(
      (entry) => entry.type === "folder" && entry.id === draggedItem.id
    );
    if (fromIdx === -1) return null;

    let toIdx = dropTarget.insertIndex;
    if (toIdx === fromIdx || toIdx === fromIdx + 1) return null;

    const [moved] = nextOrder.splice(fromIdx, 1);
    if (toIdx > fromIdx) toIdx -= 1;
    toIdx = Math.max(0, Math.min(nextOrder.length, toIdx));
    nextOrder.splice(toIdx, 0, moved);
  } else if (draggedItem.type === "server") {
    const serverId = draggedItem.id;
    const sourceFolderId = draggedItem.sourceFolderId || null;

    if (dropTarget.scope === "merge") {
      if (dropTarget.targetId === serverId) return null;
      if (dropTarget.targetType === "folder" && dropTarget.targetId === sourceFolderId) {
        return null;
      }

      // Remove from source folder or standalone top-level order
      if (sourceFolderId) {
        removeFromSourceFolder(serverId, sourceFolderId);
      } else {
        nextOrder = nextOrder.filter(
          (entry) => !(entry.type === "server" && entry.id === serverId)
        );
      }

      if (dropTarget.targetType === "folder") {
        nextFolders = nextFolders.map((f) =>
          f.id === dropTarget.targetId
            ? { ...f, serverIds: [...f.serverIds.filter((id) => id !== serverId), serverId] }
            : f
        );
      } else if (dropTarget.targetType === "server") {
        const newFolderId = crypto.randomUUID();
        nextFolders.push({
          id: newFolderId,
          name: "Nueva Carpeta",
          color: null,
          serverIds: [dropTarget.targetId, serverId],
        });
        // Replace target server in top-level order with the new folder
        nextOrder = nextOrder.map((entry) =>
          entry.type === "server" && entry.id === dropTarget.targetId
            ? { type: "folder", id: newFolderId }
            : entry
        );
      }
    } else if (dropTarget.scope === "folder-inner") {
      const targetFolder = nextFolders.find((f) => f.id === dropTarget.folderId);
      if (!targetFolder) return null;

      if (sourceFolderId === dropTarget.folderId) {
        // Reorder within the same folder
        const fromIdx = targetFolder.serverIds.indexOf(serverId);
        if (fromIdx === -1) return null;
        let toIdx = dropTarget.insertIndex;
        if (toIdx === fromIdx || toIdx === fromIdx + 1) return null;
        const updated = [...targetFolder.serverIds];
        const [moved] = updated.splice(fromIdx, 1);
        if (toIdx > fromIdx) toIdx -= 1;
        toIdx = Math.max(0, Math.min(updated.length, toIdx));
        updated.splice(toIdx, 0, moved);
        targetFolder.serverIds = updated;
      } else {
        // Move from standalone or another folder into this folder at insertIndex
        if (sourceFolderId) {
          removeFromSourceFolder(serverId, sourceFolderId);
        } else {
          nextOrder = nextOrder.filter(
            (entry) => !(entry.type === "server" && entry.id === serverId)
          );
        }
        const filtered = targetFolder.serverIds.filter((id) => id !== serverId);
        const clampedIdx = Math.max(0, Math.min(filtered.length, dropTarget.insertIndex));
        filtered.splice(clampedIdx, 0, serverId);
        targetFolder.serverIds = filtered;
      }
    } else if (dropTarget.scope === "top-reorder") {
      let toIdx = dropTarget.insertIndex;

      if (sourceFolderId) {
        // Extract server from folder to top-level position
        removeFromSourceFolder(serverId, sourceFolderId);
        toIdx = Math.max(0, Math.min(nextOrder.length, toIdx));
        nextOrder.splice(toIdx, 0, { type: "server", id: serverId });
      } else {
        const fromIdx = nextOrder.findIndex(
          (entry) => entry.type === "server" && entry.id === serverId
        );
        if (fromIdx === -1) return null;
        if (toIdx === fromIdx || toIdx === fromIdx + 1) return null;
        const [moved] = nextOrder.splice(fromIdx, 1);
        if (toIdx > fromIdx) toIdx -= 1;
        toIdx = Math.max(0, Math.min(nextOrder.length, toIdx));
        nextOrder.splice(toIdx, 0, moved);
      }
    }
  }

  // Auto-dissolve folders with fewer than 2 servers
  const dissolvedReplacements = new Map();
  const survivingFolders = [];
  for (const folder of nextFolders) {
    if (folder.serverIds.length >= 2) {
      survivingFolders.push(folder);
    } else if (folder.serverIds.length === 1) {
      dissolvedReplacements.set(folder.id, folder.serverIds[0]);
    } else {
      dissolvedReplacements.set(folder.id, null);
    }
  }

  if (dissolvedReplacements.size > 0) {
    const rebuiltOrder = [];
    for (const entry of nextOrder) {
      if (entry.type === "folder" && dissolvedReplacements.has(entry.id)) {
        const remainingServerId = dissolvedReplacements.get(entry.id);
        if (remainingServerId) {
          rebuiltOrder.push({ type: "server", id: remainingServerId });
        }
      } else {
        rebuiltOrder.push(entry);
      }
    }
    nextOrder = rebuiltOrder;
  }

  return {
    nextFolders: survivingFolders,
    nextOrder,
  };
}

export function useServerRailDnd({
  railItems,
  folders,
  scrollContainerRef,
  onCommitLayout,
}) {
  const [activeDrag, setActiveDrag] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const ghostRef = useRef(null);
  const suppressClickRef = useRef(false);

  // DOM element registries
  const topItemElsRef = useRef(new Map()); // key: `${type}:${id}` -> HTMLElement
  const folderCardElsRef = useRef(new Map()); // key: folderId -> HTMLElement
  const folderServerElsRef = useRef(new Map()); // key: `${folderId}:${serverId}` -> HTMLElement

  // Mutable refs for 60fps pointermove tracking without re-renders
  const sessionRef = useRef(null);
  const latestDataRef = useRef({ railItems, folders, onCommitLayout });
  latestDataRef.current = { railItems, folders, onCommitLayout };

  const dropTargetRef = useRef(null);
  const setDropTargetIfChanged = useCallback((next) => {
    const prev = dropTargetRef.current;
    const same =
      prev === next ||
      (prev &&
        next &&
        prev.scope === next.scope &&
        prev.targetType === next.targetType &&
        prev.targetId === next.targetId &&
        prev.folderId === next.folderId &&
        prev.insertIndex === next.insertIndex);
    if (!same) {
      dropTargetRef.current = next;
      setDropTarget(next);
    }
  }, []);

  const registerTopItem = useCallback((key, el) => {
    if (el) topItemElsRef.current.set(key, el);
    else topItemElsRef.current.delete(key);
  }, []);

  const registerFolderCard = useCallback((folderId, el) => {
    if (el) folderCardElsRef.current.set(folderId, el);
    else folderCardElsRef.current.delete(folderId);
  }, []);

  const registerFolderServer = useCallback((folderId, serverId, el) => {
    const key = `${folderId}:${serverId}`;
    if (el) folderServerElsRef.current.set(key, el);
    else folderServerElsRef.current.delete(key);
  }, []);

  const computeHitTarget = useCallback((clientX, clientY, draggedItem) => {
    const { railItems: items, folders: currentFolders } = latestDataRef.current;

    // 1. Check if pointer is inside an expanded folder card (for server drags)
    if (draggedItem.type === "server") {
      for (const [folderId, cardEl] of folderCardElsRef.current.entries()) {
        if (!cardEl) continue;
        const cardRect = cardEl.getBoundingClientRect();
        const insideX = clientX >= cardRect.left - 8 && clientX <= cardRect.right + 8;
        const insideY = clientY >= cardRect.top + 32 && clientY <= cardRect.bottom + 4;
        if (insideX && insideY) {
          const folder = currentFolders.find((f) => f.id === folderId);
          if (folder) {
            const memberIds = folder.serverIds || [];
            let insertIndex = memberIds.length;
            for (let i = 0; i < memberIds.length; i++) {
              const el = folderServerElsRef.current.get(`${folderId}:${memberIds[i]}`);
              if (!el) continue;
              const r = el.getBoundingClientRect();
              const midY = r.top + r.height / 2;
              if (clientY < midY) {
                insertIndex = i;
                break;
              }
            }
            return { scope: "folder-inner", folderId, insertIndex };
          }
        }
      }
    }

    // 2. Hit-test top-level railItems
    if (items.length === 0) {
      return { scope: "top-reorder", insertIndex: 0 };
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const el = topItemElsRef.current.get(`${item.type}:${item.id}`);
      if (!el) continue;
      const rect = el.getBoundingClientRect();

      if (clientY < rect.top) {
        return { scope: "top-reorder", insertIndex: i };
      }

      if (clientY <= rect.bottom) {
        const isSelf =
          item.type === draggedItem.type &&
          item.id === draggedItem.id &&
          !draggedItem.sourceFolderId;

        if (isSelf) {
          return { scope: "top-reorder", insertIndex: i };
        }

        const ratio = (clientY - rect.top) / Math.max(1, rect.height);

        // Dual-zone: servers can merge onto standalone servers or collapsed folders
        if (draggedItem.type === "server" && ratio >= 0.25 && ratio <= 0.75) {
          return {
            scope: "merge",
            targetType: item.type,
            targetId: item.id,
          };
        }

        return {
          scope: "top-reorder",
          insertIndex: ratio < 0.5 ? i : i + 1,
        };
      }
    }

    return { scope: "top-reorder", insertIndex: items.length };
  }, []);

  const startPointerDrag = useCallback(
    (e, item, sourceEl) => {
      if (e.button !== 0) return;
      const el = sourceEl || e.currentTarget;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      sessionRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        offsetX: e.clientX - rect.left,
        offsetY: rect.top ? e.clientY - rect.top : rect.height / 2,
        rect,
        item,
        active: false,
        rafId: null,
        scrollRafId: null,
      };
    },
    []
  );

  useEffect(() => {
    const updateGhostPosition = (x, y) => {
      const session = sessionRef.current;
      if (!session || !ghostRef.current) return;
      const gx = x - session.offsetX;
      const gy = y - session.offsetY;
      ghostRef.current.style.transform = `translate3d(${gx}px, ${gy}px, 0) scale(1.06)`;
    };

    const runAutoScroll = () => {
      const session = sessionRef.current;
      const container = scrollContainerRef?.current;
      if (!session || !session.active || !container) {
        if (session) session.scrollRafId = null;
        return;
      }

      const cRect = container.getBoundingClientRect();
      const y = session.lastY;
      let delta = 0;

      if (y < cRect.top + AUTO_SCROLL_EDGE_PX) {
        const intensity = Math.max(0, (cRect.top + AUTO_SCROLL_EDGE_PX - y) / AUTO_SCROLL_EDGE_PX);
        delta = -Math.ceil(intensity * AUTO_SCROLL_MAX_SPEED);
      } else if (y > cRect.bottom - AUTO_SCROLL_EDGE_PX) {
        const intensity = Math.max(0, (y - (cRect.bottom - AUTO_SCROLL_EDGE_PX)) / AUTO_SCROLL_EDGE_PX);
        delta = Math.ceil(intensity * AUTO_SCROLL_MAX_SPEED);
      }

      if (delta !== 0) {
        container.scrollTop += delta;
        const target = computeHitTarget(session.lastX, session.lastY, session.item);
        setDropTargetIfChanged(target);
        session.scrollRafId = requestAnimationFrame(runAutoScroll);
      } else {
        session.scrollRafId = null;
      }
    };

    const handlePointerMove = (e) => {
      const session = sessionRef.current;
      if (!session) return;

      session.lastX = e.clientX;
      session.lastY = e.clientY;

      if (!session.active) {
        const dist = Math.hypot(e.clientX - session.startX, e.clientY - session.startY);
        if (dist < DRAG_THRESHOLD_PX) return;

        session.active = true;
        suppressClickRef.current = true;
        setActiveDrag({
          ...session.item,
          rect: session.rect,
          initialX: e.clientX - session.offsetX,
          initialY: e.clientY - session.offsetY,
        });
      }

      updateGhostPosition(e.clientX, e.clientY);

      if (!session.rafId) {
        session.rafId = requestAnimationFrame(() => {
          const s = sessionRef.current;
          if (!s || !s.active) return;
          s.rafId = null;
          const target = computeHitTarget(s.lastX, s.lastY, s.item);
          setDropTargetIfChanged(target);

          if (!s.scrollRafId && scrollContainerRef?.current) {
            s.scrollRafId = requestAnimationFrame(runAutoScroll);
          }
        });
      }
    };

    const finishDrag = (commit) => {
      const session = sessionRef.current;
      if (!session) return;

      if (session.rafId) cancelAnimationFrame(session.rafId);
      if (session.scrollRafId) cancelAnimationFrame(session.scrollRafId);

      const wasActive = session.active;
      const draggedItem = session.item;
      const currentTarget = dropTargetRef.current;

      sessionRef.current = null;
      dropTargetRef.current = null;
      setActiveDrag(null);
      setDropTarget(null);

      if (wasActive) {
        setTimeout(() => {
          suppressClickRef.current = false;
        }, 50);

        if (commit && currentTarget) {
          const { railItems: items, folders: currentFolders, onCommitLayout: commitFn } =
            latestDataRef.current;
          const result = computeNextRailLayout(
            currentFolders,
            items,
            draggedItem,
            currentTarget
          );
          if (result) {
            commitFn?.(result);
          }
        }
      }
    };

    const handlePointerUp = () => finishDrag(true);
    const handlePointerCancel = () => finishDrag(false);

    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    };
  }, [computeHitTarget, scrollContainerRef, setDropTargetIfChanged]);

  /**
   * Computes smooth vertical displacement (in px) for top-level items during reorder.
   */
  const getTopItemShiftY = useCallback(
    (index) => {
      if (!activeDrag || !dropTarget || dropTarget.scope !== "top-reorder") return 0;
      if (activeDrag.sourceFolderId) return 0;

      const fromIdx = railItems.findIndex(
        (item) => item.type === activeDrag.type && item.id === activeDrag.id
      );
      if (fromIdx === -1 || index === fromIdx) return 0;

      const toIdx = dropTarget.insertIndex;
      const step = (activeDrag.rect?.height || 48) + RAIL_GAP_PX;

      if (fromIdx < toIdx && index > fromIdx && index < toIdx) {
        return -step;
      }
      if (fromIdx > toIdx && index >= toIdx && index < fromIdx) {
        return step;
      }
      return 0;
    },
    [activeDrag, dropTarget, railItems]
  );

  /**
   * Computes smooth vertical displacement (in px) for servers inside an expanded folder.
   */
  const getFolderServerShiftY = useCallback(
    (folderId, memberIds, index) => {
      if (
        !activeDrag ||
        !dropTarget ||
        dropTarget.scope !== "folder-inner" ||
        dropTarget.folderId !== folderId
      ) {
        return 0;
      }
      if (activeDrag.sourceFolderId !== folderId) return 0;

      const fromIdx = memberIds.indexOf(activeDrag.id);
      if (fromIdx === -1 || index === fromIdx) return 0;

      const toIdx = dropTarget.insertIndex;
      const step = (activeDrag.rect?.height || 48) + FOLDER_INNER_GAP_PX;

      if (fromIdx < toIdx && index > fromIdx && index < toIdx) {
        return -step;
      }
      if (fromIdx > toIdx && index >= toIdx && index < fromIdx) {
        return step;
      }
      return 0;
    },
    [activeDrag, dropTarget]
  );

  return {
    activeDrag,
    dropTarget,
    ghostRef,
    suppressClickRef,
    startPointerDrag,
    registerTopItem,
    registerFolderCard,
    registerFolderServer,
    getTopItemShiftY,
    getFolderServerShiftY,
  };
}
