import { useEffect, useRef, useState, useCallback } from "react";
import { mergeWhiteboardElements } from "./whiteboardConstants";

export function useWhiteboardSync({
  roomCode,
  channelId,
  myId,
  myName,
  onBoardResetUi,
}) {
  const storageKey = `onicord_wb_${roomCode}_${channelId}`;

  const [elementsMap, setElementsMap] = useState(() => new Map());
  const elementsMapRef = useRef(elementsMap);
  elementsMapRef.current = elementsMap;
  const boardClearedAtRef = useRef(0);

  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [remoteEditing, setRemoteEditing] = useState({});
  const remoteInProgressStrokes = useRef(new Map());

  const saveTimerRef = useRef(null);
  const pendingSaveRef = useRef(null);

  const flushSaveToStorage = useCallback(() => {
    if (!pendingSaveRef.current) return;
    const { key, clearedAt, map } = pendingSaveRef.current;
    pendingSaveRef.current = null;
    try {
      const arr = Array.from(map.values()).slice(-800);
      localStorage.setItem(key, JSON.stringify({ clearedAt, elements: arr }));
    } catch {
      // Ignore quota errors
    }
  }, []);

  // Debounced localStorage write (300ms) so typing & dragging never block main thread
  const saveToStorage = useCallback(
    (map, clearedAtOverride = null, immediate = false) => {
      const clearedAt =
        clearedAtOverride !== null ? clearedAtOverride : boardClearedAtRef.current;
      pendingSaveRef.current = { key: storageKey, clearedAt, map };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (immediate) {
        flushSaveToStorage();
      } else {
        saveTimerRef.current = setTimeout(() => {
          flushSaveToStorage();
        }, 300);
      }
    },
    [storageKey, flushSaveToStorage]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      flushSaveToStorage();
    };
  }, [flushSaveToStorage]);

  const emitWbEvent = useCallback(
    (payload) => {
      if (!window.electronAPI?.sendWhiteboardEvent) return;
      window.electronAPI.sendWhiteboardEvent(
        {
          ...payload,
          roomCode,
          channelId,
          userId: myId,
          nickname: myName,
        },
        roomCode
      );
    },
    [roomCode, channelId, myId, myName]
  );

  // Hydrate from localStorage + SQLite on channel change and request P2P sync
  useEffect(() => {
    onBoardResetUi?.();
    setUndoStack([]);
    setRedoStack([]);
    setRemoteCursors({});
    setRemoteEditing({});
    remoteInProgressStrokes.current.clear();

    let initialMap = new Map();
    let initialClearedAt = 0;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.elements)
            ? parsed.elements
            : [];
        if (!Array.isArray(parsed) && typeof parsed?.clearedAt === "number") {
          initialClearedAt = parsed.clearedAt;
        }
        list.forEach((item) => {
          if (item?.id) initialMap.set(item.id, item);
        });
      }
    } catch {
      initialMap = new Map();
    }
    boardClearedAtRef.current = initialClearedAt;
    setElementsMap(initialMap);

    let cancelled = false;
    window.electronAPI
      ?.loadWhiteboardChannel?.(roomCode, channelId)
      .then((sqliteSnap) => {
        if (cancelled || !sqliteSnap) return;
        const sqlClearedAt = sqliteSnap.clearedAt || 0;
        if (sqlClearedAt > boardClearedAtRef.current) {
          boardClearedAtRef.current = sqlClearedAt;
        }
        if (Array.isArray(sqliteSnap.elements) && sqliteSnap.elements.length > 0) {
          setElementsMap((prev) => {
            let base = prev;
            if (sqlClearedAt > 0) {
              base = new Map();
              prev.forEach((el, k) => {
                if ((el.updatedAt || 0) >= sqlClearedAt) base.set(k, el);
              });
            }
            const next = mergeWhiteboardElements(base, sqliteSnap.elements);
            if (next !== prev) saveToStorage(next, boardClearedAtRef.current);
            return next;
          });
        }
      })
      .catch(() => {});

    emitWbEvent({ type: "sync:request" });
    return () => {
      cancelled = true;
    };
  }, [storageKey, roomCode, channelId, emitWbEvent, saveToStorage]);

  // Re-sync when a peer reconnects
  useEffect(() => {
    if (!window.electronAPI?.onPeerJoined) return;
    const unsub = window.electronAPI.onPeerJoined(() => {
      emitWbEvent({ type: "sync:request" });
    });
    return () => unsub?.();
  }, [emitWbEvent]);

  // Upsert single element
  const upsertElement = useCallback(
    (el, { recordUndo = true, broadcast = true } = {}) => {
      const nextEl = {
        ...el,
        updatedAt: Date.now(),
        updatedBy: myId,
      };
      setElementsMap((prev) => {
        if (recordUndo) {
          const prevCopy = prev.get(nextEl.id) || null;
          setUndoStack((u) => [...u.slice(-49), [{ id: nextEl.id, prev: prevCopy }]]);
          setRedoStack([]);
        }
        const next = new Map(prev);
        next.set(nextEl.id, nextEl);
        saveToStorage(next);
        return next;
      });
      if (broadcast) {
        emitWbEvent({ type: "op:upsert", element: nextEl });
      }
      return nextEl;
    },
    [myId, saveToStorage, emitWbEvent]
  );

  // Batch upsert elements in one P2P message + one undo entry
  const upsertBatch = useCallback(
    (items, { recordUndo = true, broadcast = true } = {}) => {
      if (!Array.isArray(items) || items.length === 0) return [];
      const now = Date.now();
      const nextItems = items.map((el) => ({
        ...el,
        updatedAt: now,
        updatedBy: myId,
      }));
      setElementsMap((prev) => {
        if (recordUndo) {
          const undoEntries = nextItems.map((ni) => ({
            id: ni.id,
            prev: prev.get(ni.id) || null,
          }));
          setUndoStack((u) => [...u.slice(-49), undoEntries]);
          setRedoStack([]);
        }
        const next = new Map(prev);
        nextItems.forEach((ni) => next.set(ni.id, ni));
        saveToStorage(next);
        return next;
      });
      if (broadcast) {
        if (nextItems.length === 1) {
          emitWbEvent({ type: "op:upsert", element: nextItems[0] });
        } else {
          emitWbEvent({ type: "op:batch-upsert", elements: nextItems });
        }
      }
      return nextItems;
    },
    [myId, saveToStorage, emitWbEvent]
  );

  // Delete element (with cascade to attached connectors)
  const deleteElementsByIds = useCallback(
    (ids, { recordUndo = true, broadcast = true } = {}) => {
      if (!Array.isArray(ids) || ids.length === 0) return;
      const now = Date.now();
      const idSet = new Set(ids);
      const tombs = [];
      const undoEntries = [];

      elementsMapRef.current.forEach((cand) => {
        if (!cand || cand.deleted) return;
        const isDirect = idSet.has(cand.id) && !cand.locked;
        const isAttachedConnector =
          cand.type === "connector" &&
          (idSet.has(cand.fromId) || idSet.has(cand.toId));
        if (isDirect || isAttachedConnector) {
          undoEntries.push({ id: cand.id, prev: cand });
          tombs.push({
            ...cand,
            deleted: true,
            updatedAt: now,
            updatedBy: myId,
          });
        }
      });

      if (tombs.length === 0) return;
      setElementsMap((prev) => {
        if (recordUndo) {
          setUndoStack((u) => [...u.slice(-49), undoEntries]);
          setRedoStack([]);
        }
        const next = new Map(prev);
        tombs.forEach((t) => next.set(t.id, t));
        saveToStorage(next);
        return next;
      });
      if (broadcast) {
        if (tombs.length === 1) {
          emitWbEvent({ type: "op:delete", element: tombs[0] });
        } else {
          emitWbEvent({ type: "op:batch-delete", elements: tombs });
        }
      }
    },
    [myId, saveToStorage, emitWbEvent]
  );

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const rawBatch = undoStack[undoStack.length - 1];
    const batch = Array.isArray(rawBatch) ? rawBatch : [rawBatch];
    setUndoStack((u) => u.slice(0, -1));

    const redoEntries = batch.map((a) => ({
      id: a.id,
      prev: elementsMapRef.current.get(a.id) || null,
    }));
    setRedoStack((r) => [...r, redoEntries]);

    const now = Date.now();
    const toBroadcast = [];
    setElementsMap((prev) => {
      const next = new Map(prev);
      for (const action of batch) {
        const current = next.get(action.id) || null;
        if (action.prev) {
          const restored = { ...action.prev, updatedAt: now, updatedBy: myId };
          next.set(action.id, restored);
          toBroadcast.push(restored);
        } else if (current) {
          const tomb = { ...current, deleted: true, updatedAt: now, updatedBy: myId };
          next.set(action.id, tomb);
          toBroadcast.push(tomb);
        }
      }
      saveToStorage(next);
      return next;
    });
    if (toBroadcast.length > 0) {
      emitWbEvent({ type: "op:batch-upsert", elements: toBroadcast });
    }
  }, [undoStack, myId, emitWbEvent, saveToStorage]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const rawBatch = redoStack[redoStack.length - 1];
    const batch = Array.isArray(rawBatch) ? rawBatch : [rawBatch];
    setRedoStack((r) => r.slice(0, -1));

    const undoEntries = batch.map((a) => ({
      id: a.id,
      prev: elementsMapRef.current.get(a.id) || null,
    }));
    setUndoStack((u) => [...u, undoEntries]);

    const now = Date.now();
    const toBroadcast = [];
    setElementsMap((prev) => {
      const next = new Map(prev);
      for (const action of batch) {
        const current = next.get(action.id) || null;
        if (action.prev) {
          const restored = { ...action.prev, updatedAt: now, updatedBy: myId };
          next.set(action.id, restored);
          toBroadcast.push(restored);
        } else if (current) {
          const tomb = { ...current, deleted: true, updatedAt: now, updatedBy: myId };
          next.set(action.id, tomb);
          toBroadcast.push(tomb);
        }
      }
      saveToStorage(next);
      return next;
    });
    if (toBroadcast.length > 0) {
      emitWbEvent({ type: "op:batch-upsert", elements: toBroadcast });
    }
  }, [redoStack, myId, emitWbEvent, saveToStorage]);

  const clearBoard = useCallback(() => {
    const clearTs = Date.now();
    boardClearedAtRef.current = clearTs;
    setElementsMap(new Map());
    saveToStorage(new Map(), clearTs, true);
    emitWbEvent({ type: "op:clear", clearedAt: clearTs });
  }, [saveToStorage, emitWbEvent]);

  // Listen to incoming P2P events
  useEffect(() => {
    if (!window.electronAPI?.onWhiteboardEvent) return;

    const unsub = window.electronAPI.onWhiteboardEvent((data) => {
      if (!data || data.channelId !== channelId || data.roomCode !== roomCode) return;
      if (data.userId === myId) return;

      if (data.type === "cursor") {
        setRemoteCursors((prev) => ({
          ...prev,
          [data.userId]: {
            nickname: data.nickname || "User",
            x: data.x,
            y: data.y,
            color: data.color || "#38BDF8",
            time: Date.now(),
          },
        }));
      } else if (data.type === "editing-element") {
        setRemoteEditing((prev) => {
          const next = { ...prev };
          if (data.elementId) {
            next[data.elementId] = {
              userId: data.userId,
              nickname: data.nickname || "User",
              time: Date.now(),
            };
          } else {
            Object.keys(next).forEach((k) => {
              if (next[k].userId === data.userId) delete next[k];
            });
          }
          return next;
        });
      } else if (data.type === "stroke-progress" && data.stroke) {
        remoteInProgressStrokes.current.set(data.stroke.id, data.stroke);
      } else if ((data.type === "op:upsert" || data.type === "op:delete") && data.element) {
        if (data.type === "op:upsert") {
          remoteInProgressStrokes.current.delete(data.element.id);
        }
        setElementsMap((prev) => {
          const next = mergeWhiteboardElements(prev, [data.element]);
          if (next !== prev) saveToStorage(next);
          return next;
        });
      } else if (
        (data.type === "op:batch-upsert" || data.type === "op:batch-delete") &&
        Array.isArray(data.elements)
      ) {
        setElementsMap((prev) => {
          const next = mergeWhiteboardElements(prev, data.elements);
          if (next !== prev) saveToStorage(next);
          return next;
        });
      } else if (data.type === "op:clear") {
        const clearTs = data.clearedAt || Date.now();
        boardClearedAtRef.current = Math.max(boardClearedAtRef.current, clearTs);
        setElementsMap(new Map());
        saveToStorage(new Map(), boardClearedAtRef.current, true);
        onBoardResetUi?.();
      } else if (data.type === "sync:request") {
        const snapshot = Array.from(elementsMapRef.current.values());
        if (snapshot.length > 0 || boardClearedAtRef.current > 0) {
          emitWbEvent({
            type: "sync:state",
            targetUserId: data.userId,
            elements: snapshot,
            clearedAt: boardClearedAtRef.current,
          });
        }
      } else if (data.type === "sync:state" && Array.isArray(data.elements)) {
        if (data.targetUserId && data.targetUserId !== myId) return;
        const remoteClearedAt = typeof data.clearedAt === "number" ? data.clearedAt : 0;
        if (remoteClearedAt > boardClearedAtRef.current) {
          boardClearedAtRef.current = remoteClearedAt;
        }
        setElementsMap((prev) => {
          let base = prev;
          if (remoteClearedAt > 0) {
            const pruned = new Map();
            prev.forEach((el, k) => {
              if ((el.updatedAt || 0) >= remoteClearedAt) {
                pruned.set(k, el);
              }
            });
            base = pruned;
          }
          const next = mergeWhiteboardElements(base, data.elements);
          if (next !== prev) saveToStorage(next, boardClearedAtRef.current);
          return next;
        });
      }
    });

    return () => unsub();
  }, [channelId, roomCode, myId, saveToStorage, emitWbEvent]);

  // Cleanup stale remote cursors and editing indicators
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setRemoteCursors((prev) => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach((uid) => {
          if (now - next[uid].time > 3000) {
            delete next[uid];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
      setRemoteEditing((prev) => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach((eid) => {
          if (now - next[eid].time > 4500) {
            delete next[eid];
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return {
    elementsMap,
    setElementsMap,
    elementsMapRef,
    undoStack,
    redoStack,
    remoteCursors,
    remoteEditing,
    remoteInProgressStrokes,
    emitWbEvent,
    saveToStorage,
    upsertElement,
    upsertBatch,
    deleteElementsByIds,
    handleUndo,
    handleRedo,
    clearBoard,
  };
}
