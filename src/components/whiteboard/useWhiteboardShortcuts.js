import { useEffect } from "react";
import { canonicalizeShortcut } from "../../lib/defaultKeybindings";
import { createWbId } from "./whiteboardConstants";

export function useWhiteboardShortcuts({
  canEdit,
  editingId,
  setEditingId,
  selectedIds,
  setSelectedIds,
  elementsMapRef,
  wbKeybindings,
  spacePressed,
  setActiveTool,
  setOpenMenu,
  setContextColorOpen,
  setContextShapeOpen,
  setContextAlignOpen,
  handleUndo,
  handleRedo,
  deleteSelectedElements,
  groupSelectedElements,
  ungroupSelectedElements,
  bringToFrontSelected,
  sendToBackSelected,
  toggleLockSelected,
  upsertBatch,
}) {
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        document.activeElement?.isContentEditable ||
        editingId !== null;

      if (e.code === "Space" && !isTyping) {
        spacePressed.current = true;
      }

      if (isTyping) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "l" &&
        selectedIds.length > 0 &&
        canEdit
      ) {
        e.preventDefault();
        toggleLockSelected();
        return;
      }
      if (e.key === "]" && selectedIds.length > 0 && canEdit) {
        e.preventDefault();
        bringToFrontSelected();
        return;
      }
      if (e.key === "[" && selectedIds.length > 0 && canEdit) {
        e.preventDefault();
        sendToBackSelected();
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "g" &&
        selectedIds.length > 0 &&
        canEdit
      ) {
        e.preventDefault();
        if (e.shiftKey) ungroupSelectedElements();
        else groupSelectedElements();
        return;
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "d" &&
        selectedIds.length > 0 &&
        canEdit
      ) {
        e.preventDefault();
        const dups = [];
        selectedIds.forEach((id) => {
          const src = elementsMapRef.current.get(id);
          if (src && !src.deleted && src.type !== "connector") {
            dups.push({
              ...src,
              id: createWbId(),
              x: (src.x || 0) + 24,
              y: (src.y || 0) + 24,
            });
          }
        });
        if (dups.length > 0) {
          upsertBatch(dups);
          setSelectedIds(dups.map((d) => d.id));
        }
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.length > 0 && canEdit) {
        e.preventDefault();
        deleteSelectedElements();
        return;
      }
      if (e.key === "Enter" && selectedIds.length === 1 && canEdit) {
        const sel = elementsMapRef.current.get(selectedIds[0]);
        if (
          sel &&
          !sel.deleted &&
          !sel.locked &&
          (sel.type === "shape" ||
            sel.type === "sticky" ||
            sel.type === "text" ||
            sel.type === "section")
        ) {
          e.preventDefault();
          setEditingId(sel.id);
          return;
        }
      }
      if (e.key === "Escape") {
        setSelectedIds([]);
        setOpenMenu(null);
        setContextColorOpen(false);
        setContextShapeOpen(false);
        setContextAlignOpen(false);
        return;
      }

      if (!canEdit) return;
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      const parts = [];
      if (e.ctrlKey) parts.push("ctrl");
      if (e.altKey) parts.push("alt");
      if (e.shiftKey) parts.push("shift");
      if (e.metaKey) parts.push("meta");
      parts.push(e.key === " " ? "space" : e.key.toLowerCase());
      const pressedCanonical = canonicalizeShortcut(parts.join("+"));

      const isGlobalAction = wbKeybindings.some(
        (kb) =>
          !kb.action.startsWith("wb_tool_") &&
          kb.shortcut &&
          canonicalizeShortcut(kb.shortcut) === pressedCanonical
      );
      if (isGlobalAction) return;

      const matchedWb = wbKeybindings.find(
        (kb) =>
          kb.action.startsWith("wb_tool_") &&
          kb.shortcut &&
          canonicalizeShortcut(kb.shortcut) === pressedCanonical
      );
      if (!matchedWb) return;

      e.preventDefault();
      if (matchedWb.action === "wb_tool_select") setActiveTool("select");
      else if (matchedWb.action === "wb_tool_hand") setActiveTool("hand");
      else if (matchedWb.action === "wb_tool_pen") setActiveTool("pen");
      else if (matchedWb.action === "wb_tool_eraser") setActiveTool("eraser");
      else if (matchedWb.action === "wb_tool_sticky") setActiveTool("sticky");
      else if (matchedWb.action === "wb_tool_shape") setActiveTool("shape");
      else if (matchedWb.action === "wb_tool_text") setActiveTool("text");
      else if (matchedWb.action === "wb_tool_section") setActiveTool("section");
    };

    const onKeyUp = (e) => {
      if (e.code === "Space") {
        spacePressed.current = false;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [
    canEdit,
    editingId,
    setEditingId,
    selectedIds,
    setSelectedIds,
    elementsMapRef,
    wbKeybindings,
    spacePressed,
    setActiveTool,
    setOpenMenu,
    setContextColorOpen,
    setContextShapeOpen,
    setContextAlignOpen,
    handleUndo,
    handleRedo,
    deleteSelectedElements,
    groupSelectedElements,
    ungroupSelectedElements,
    bringToFrontSelected,
    sendToBackSelected,
    toggleLockSelected,
    upsertBatch,
  ]);
}
