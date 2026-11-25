import React, { useRef, useState } from "react";
import {
  MousePointer2,
  Hand,
  Pen,
  Eraser,
  StickyNote,
  Shapes,
  Type,
  Frame,
  Table2,
  SmilePlus,
  Sticker,
  Undo2,
  Redo2,
  ZoomOut,
  ZoomIn,
  Download,
  Trash2,
} from "lucide-react";
import FloatingMediaBar from "../ui/FloatingMediaBar";
import EmojiPickerPopover from "../ui/EmojiPickerPopover";
import StickerPopover from "../chat/StickerPopover";
import {
  WB_COLORS,
  WB_PEN_COLORS,
  WB_SHAPES,
  WB_CONNECTORS,
} from "./whiteboardConstants";
import { renderShapeIcon, renderConnectorIcon } from "./whiteboardGeometry";
import { cn } from "../../lib/cn";

export default function WhiteboardToolbar({
  canEdit,
  activeTool,
  setActiveTool,
  penColor,
  setPenColor,
  penWidth,
  setPenWidth,
  isHighlighter,
  setIsHighlighter,
  activeColor,
  setActiveColor,
  activeShapeKind,
  setActiveShapeKind,
  activeConnectorKind,
  setActiveConnectorKind,
  setActiveStamp,
  setActiveSticker,
  openMenu,
  setOpenMenu,
  getShortcutLabel,
  undoDisabled,
  redoDisabled,
  onUndo,
  onRedo,
  zoom,
  setZoom,
  setPan,
  onExportBoard,
  onClearBoard,
}) {
  const [emojisTargetRect, setEmojisTargetRect] = useState(null);
  const [stickersTargetRect, setStickersTargetRect] = useState(null);
  const emojiBtnRef = useRef(null);
  const stickerBtnRef = useRef(null);

  return (
    <>
      <FloatingMediaBar visible={true}>
        <FloatingMediaBar.IconButton
          icon={<MousePointer2 size={18} />}
          active={activeTool === "select"}
          disabled={!canEdit}
          onClick={() => {
            setActiveTool("select");
            setOpenMenu(null);
          }}
          title={`Seleccionar (${getShortcutLabel("wb_tool_select", "V")})`}
        />
        <FloatingMediaBar.IconButton
          icon={<Hand size={18} />}
          active={activeTool === "hand"}
          onClick={() => {
            setActiveTool("hand");
            setOpenMenu(null);
          }}
          title={`Mover lienzo (${getShortcutLabel("wb_tool_hand", "H")} / Espacio)`}
        />

        <FloatingMediaBar.Divider />

        {/* Pen Tool + Popover */}
        <FloatingMediaBar.Menu
          icon={<Pen size={18} />}
          title={`Lápiz / Marcador (${getShortcutLabel("wb_tool_pen", "P")})`}
          menuTitle="Lápiz y Marcador"
          showTitle
          active={activeTool === "pen"}
          isOpen={openMenu === "pen"}
          onToggle={() => {
            if (!canEdit) return;
            setActiveTool("pen");
            setOpenMenu((prev) => (prev === "pen" ? null : "pen"));
          }}
          onClose={() => setOpenMenu((prev) => (prev === "pen" ? null : prev))}
          widthClass="w-60"
        >
          <div className="p-1.5 space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              {WB_PEN_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setPenColor(c);
                    setActiveTool("pen");
                  }}
                  style={{ backgroundColor: c }}
                  className={cn(
                    "w-5 h-5 rounded-full border border-onicord-border cursor-pointer transition-transform hover:scale-110",
                    penColor === c && "ring-2 ring-sky-400 scale-110"
                  )}
                />
              ))}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-onicord-muted">
                <span>Grosor</span>
                <span className="font-mono font-semibold text-onicord-accent">{penWidth}px</span>
              </div>
              <input
                type="range"
                min={1}
                max={32}
                value={penWidth}
                onChange={(e) => {
                  setPenWidth(Number(e.target.value));
                  setActiveTool("pen");
                }}
                className="w-full accent-sky-400 cursor-pointer h-1.5"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setIsHighlighter((v) => !v);
                setActiveTool("pen");
              }}
              className={cn(
                "w-full py-1 px-2 rounded-lg text-xs font-medium cursor-pointer transition-colors flex items-center justify-between",
                isHighlighter
                  ? "bg-onicord-accent/20 text-onicord-accent border border-onicord-accent/30"
                  : "bg-onicord-tint/10 hover:bg-onicord-tint/20 text-onicord-text"
              )}
            >
              <span>Modo resaltador</span>
              <span>{isHighlighter ? "Activo" : "Inactivo"}</span>
            </button>
          </div>
        </FloatingMediaBar.Menu>

        <FloatingMediaBar.IconButton
          icon={<Eraser size={18} />}
          active={activeTool === "eraser"}
          disabled={!canEdit}
          onClick={() => {
            setActiveTool("eraser");
            setOpenMenu(null);
          }}
          title={`Borrador (${getShortcutLabel("wb_tool_eraser", "E")})`}
        />

        {/* Sticky Note */}
        <FloatingMediaBar.Menu
          icon={<StickyNote size={18} />}
          title={`Nota adhesiva (${getShortcutLabel("wb_tool_sticky", "S")})`}
          menuTitle="Color de nota"
          showTitle
          active={activeTool === "sticky"}
          isOpen={openMenu === "sticky"}
          onToggle={() => {
            if (!canEdit) return;
            setActiveTool("sticky");
            setOpenMenu((prev) => (prev === "sticky" ? null : "sticky"));
          }}
          onClose={() => setOpenMenu((prev) => (prev === "sticky" ? null : prev))}
          widthClass="w-56"
        >
          <div className="p-1.5 flex flex-wrap gap-1.5">
            {WB_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setActiveColor(c);
                  setActiveTool("sticky");
                  setOpenMenu(null);
                }}
                style={{ backgroundColor: c.fill }}
                className={cn(
                  "w-6 h-6 rounded-lg border border-white/20 cursor-pointer hover:scale-110 transition-transform",
                  activeColor.id === c.id && "ring-2 ring-sky-400"
                )}
                title={c.label}
              />
            ))}
          </div>
        </FloatingMediaBar.Menu>

        {/* Shapes & Connectors */}
        <FloatingMediaBar.Menu
          icon={
            activeTool === "connector" ? (
              renderConnectorIcon(activeConnectorKind, 18)
            ) : (
              <Shapes size={18} />
            )
          }
          title={`Figuras y conectores (${getShortcutLabel("wb_tool_shape", "R")})`}
          menuTitle="Figuras y conectores"
          showTitle
          active={activeTool === "shape" || activeTool === "connector"}
          isOpen={openMenu === "shape"}
          onToggle={() => {
            if (!canEdit) return;
            setOpenMenu((prev) => (prev === "shape" ? null : "shape"));
          }}
          onClose={() => setOpenMenu((prev) => (prev === "shape" ? null : prev))}
          widthClass="w-64"
        >
          <div className="p-1.5 space-y-2">
            <div className="text-2xs font-bold uppercase tracking-wider text-onicord-muted px-1">
              Figuras
            </div>
            <div className="grid grid-cols-6 gap-1">
              {WB_SHAPES.map((sh) => (
                <button
                  key={sh.kind}
                  type="button"
                  onClick={() => {
                    setActiveShapeKind(sh.kind);
                    setActiveTool("shape");
                    setOpenMenu(null);
                  }}
                  className={cn(
                    "p-1.5 rounded-lg hover:bg-onicord-tint/15 text-onicord-text flex items-center justify-center cursor-pointer",
                    activeTool === "shape" &&
                      activeShapeKind === sh.kind &&
                      "bg-onicord-accent/20 text-onicord-accent"
                  )}
                  title={sh.label}
                >
                  {renderShapeIcon(sh.kind, 18)}
                </button>
              ))}
            </div>
            <div className="text-2xs font-bold uppercase tracking-wider text-onicord-muted px-1 pt-1">
              Conectores
            </div>
            <div className="grid grid-cols-3 gap-1">
              {WB_CONNECTORS.map((cnItem) => (
                <button
                  key={cnItem.kind}
                  type="button"
                  onClick={() => {
                    setActiveConnectorKind(cnItem.kind);
                    setActiveTool("connector");
                    setOpenMenu(null);
                  }}
                  className={cn(
                    "p-1.5 rounded-lg hover:bg-onicord-tint/15 text-onicord-text flex items-center justify-center gap-1 text-xs cursor-pointer",
                    activeTool === "connector" &&
                      activeConnectorKind === cnItem.kind &&
                      "bg-onicord-accent/20 text-onicord-accent"
                  )}
                  title={cnItem.label}
                >
                  {renderConnectorIcon(cnItem.kind, 16)}
                </button>
              ))}
            </div>
          </div>
        </FloatingMediaBar.Menu>

        <FloatingMediaBar.IconButton
          icon={<Type size={18} />}
          active={activeTool === "text"}
          disabled={!canEdit}
          onClick={() => {
            setActiveTool("text");
            setOpenMenu(null);
          }}
          title={`Texto (${getShortcutLabel("wb_tool_text", "T")})`}
        />
        <FloatingMediaBar.IconButton
          icon={<Frame size={18} />}
          active={activeTool === "section"}
          disabled={!canEdit}
          onClick={() => {
            setActiveTool("section");
            setOpenMenu(null);
          }}
          title={`Sección / Marco (${getShortcutLabel("wb_tool_section", "F")})`}
        />
        <FloatingMediaBar.IconButton
          icon={<Table2 size={18} />}
          active={activeTool === "table"}
          disabled={!canEdit}
          onClick={() => {
            setActiveTool("table");
            setOpenMenu(null);
          }}
          title="Tabla"
        />

        {/* Emojis */}
        <div ref={emojiBtnRef} className="inline-flex">
          <FloatingMediaBar.IconButton
            icon={<SmilePlus size={18} />}
            active={activeTool === "stamp"}
            disabled={!canEdit}
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenu(null);
              setStickersTargetRect(null);
              if (emojisTargetRect) {
                setEmojisTargetRect(null);
              } else {
                const rect = emojiBtnRef.current?.getBoundingClientRect();
                if (rect) setEmojisTargetRect(rect);
              }
            }}
            title="Emojis"
          />
        </div>

        {/* Stickers */}
        <div ref={stickerBtnRef} className="inline-flex">
          <FloatingMediaBar.IconButton
            icon={<Sticker size={18} />}
            active={activeTool === "sticker"}
            disabled={!canEdit}
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenu(null);
              setEmojisTargetRect(null);
              if (stickersTargetRect) {
                setStickersTargetRect(null);
              } else {
                const rect = stickerBtnRef.current?.getBoundingClientRect();
                if (rect) setStickersTargetRect(rect);
              }
            }}
            title="Stickers"
          />
        </div>

        <FloatingMediaBar.Divider />

        <FloatingMediaBar.IconButton
          icon={<Undo2 size={18} />}
          disabled={!canEdit || undoDisabled}
          onClick={onUndo}
          title="Deshacer (Ctrl+Z)"
        />
        <FloatingMediaBar.IconButton
          icon={<Redo2 size={18} />}
          disabled={!canEdit || redoDisabled}
          onClick={onRedo}
          title="Rehacer (Ctrl+Shift+Z)"
        />

        <FloatingMediaBar.Divider />

        <FloatingMediaBar.IconButton
          icon={<ZoomOut size={18} />}
          onClick={() => setZoom((z) => Math.max(0.2, +(z - 0.15).toFixed(2)))}
          title="Alejar"
        />
        <FloatingMediaBar.PillButton
          label={`${Math.round(zoom * 100)}%`}
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          title="Restablecer vista (100%)"
        />
        <FloatingMediaBar.IconButton
          icon={<ZoomIn size={18} />}
          onClick={() => setZoom((z) => Math.min(4, +(z + 0.15).toFixed(2)))}
          title="Acercar"
        />

        <FloatingMediaBar.Divider />

        <FloatingMediaBar.IconButton
          icon={<Download size={18} />}
          onClick={onExportBoard}
          title="Exportar tablero completo a PNG"
        />
        {canEdit && (
          <FloatingMediaBar.IconButton
            icon={<Trash2 size={18} />}
            onClick={onClearBoard}
            title="Limpiar pizarra"
          />
        )}
      </FloatingMediaBar>

      {emojisTargetRect && (
        <div onPointerDown={(e) => e.stopPropagation()}>
          <EmojiPickerPopover
            targetRect={emojisTargetRect}
            triggerRef={emojiBtnRef}
            allowCustom={false}
            onClose={() => setEmojisTargetRect(null)}
            onSelectEmoji={(emoji) => {
              setActiveStamp(emoji);
              setActiveTool("stamp");
              setEmojisTargetRect(null);
            }}
          />
        </div>
      )}

      {stickersTargetRect && (
        <div onPointerDown={(e) => e.stopPropagation()}>
          <StickerPopover
            targetRect={stickersTargetRect}
            onClose={() => setStickersTargetRect(null)}
            onSelectSticker={(stk) => {
              setActiveSticker({
                id: stk.id,
                name: stk.name,
                ext: stk.ext,
              });
              setActiveTool("sticker");
              setStickersTargetRect(null);
            }}
          />
        </div>
      )}
    </>
  );
}
