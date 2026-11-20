import React from "react";
import {
  ChevronDown,
  Copy,
  Trash2,
  SquareDashed,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Group,
  Ungroup,
  Lock,
  Unlock,
  BringToFront,
  SendToBack,
  Download,
} from "lucide-react";
import Tooltip from "../ui/Tooltip";
import {
  WB_COLORS,
  WB_PEN_COLORS,
  WB_SHAPES,
  WB_CONNECTORS,
  createWbId,
} from "./whiteboardConstants";
import { renderShapeIcon, renderConnectorIcon } from "./whiteboardGeometry";
import { cn } from "../../lib/cn";

export default function WhiteboardContextBar({
  contextBarPos,
  canvasWidth,
  canEdit,
  commonProps,
  selectedElements,
  selectedElement,
  contextShapeOpen,
  setContextShapeOpen,
  contextColorOpen,
  setContextColorOpen,
  contextAlignOpen,
  setContextAlignOpen,
  upsertBatch,
  onModifyTable,
  onBringToFront,
  onSendToBack,
  onToggleLock,
  onGroup,
  onUngroup,
  onAlign,
  onDistribute,
  onDeleteSelected,
  onExportSection,
  onExportSelection,
  setSelectedIds,
}) {
  if (!contextBarPos || !canEdit || !commonProps) return null;

  const isSectionSelected = selectedElement?.type === "section";
  const isGroupOrMulti = commonProps.count >= 2 || commonProps.hasGroup;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        left: Math.max(120, Math.min(canvasWidth - 120, contextBarPos.x)),
        top: Math.max(56, contextBarPos.y - 16),
      }}
      className="absolute -translate-x-1/2 -translate-y-full z-40 flex items-center gap-1 px-2 py-1.5 rounded-2xl bg-onicord-surface/95 backdrop-blur-2xl border border-onicord-island shadow-2xl text-onicord-text"
    >
      {commonProps.count > 1 && (
        <span className="px-1.5 py-0.5 rounded-lg bg-onicord-accent/20 text-onicord-accent text-[11px] font-bold mr-0.5">
          {commonProps.count}
        </span>
      )}

      {/* Shape switcher */}
      {commonProps.allShapes && (
        <div className="relative">
          <Tooltip content="Cambiar figura" side="top">
            <button
              type="button"
              onClick={() => {
                setContextShapeOpen((v) => !v);
                setContextColorOpen(false);
                setContextAlignOpen(false);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-xl hover:bg-onicord-tint/10 text-xs transition-colors cursor-pointer"
            >
              {renderShapeIcon(selectedElements[0]?.style?.shapeKind, 16)}
              <ChevronDown size={14} />
            </button>
          </Tooltip>
          {contextShapeOpen && (
            <div className="absolute bottom-full left-0 mb-2 p-1.5 rounded-xl bg-onicord-surface/95 backdrop-blur-2xl border border-onicord-island shadow-xl flex gap-1">
              {WB_SHAPES.map((sh) => (
                <Tooltip key={sh.kind} content={sh.label} side="top">
                  <button
                    type="button"
                    onClick={() => {
                      upsertBatch(
                        selectedElements.map((el) => ({
                          ...el,
                          style: { ...el.style, shapeKind: sh.kind },
                        }))
                      );
                      setContextShapeOpen(false);
                    }}
                    className={cn(
                      "p-1.5 rounded-lg hover:bg-onicord-tint/10 cursor-pointer",
                      selectedElements[0]?.style?.shapeKind === sh.kind &&
                        "bg-onicord-tint/15 text-onicord-accent"
                    )}
                  >
                    {renderShapeIcon(sh.kind, 16)}
                  </button>
                </Tooltip>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Connector switcher */}
      {commonProps.allConnectors && (
        <div className="relative">
          <Tooltip content="Cambiar tipo de conector" side="top">
            <button
              type="button"
              onClick={() => {
                setContextShapeOpen((v) => !v);
                setContextColorOpen(false);
                setContextAlignOpen(false);
              }}
              className="flex items-center gap-1 px-2 py-1 rounded-xl hover:bg-onicord-tint/10 text-xs transition-colors cursor-pointer"
            >
              {renderConnectorIcon(selectedElements[0]?.style?.connectorKind, 16)}
              <ChevronDown size={14} />
            </button>
          </Tooltip>
          {contextShapeOpen && (
            <div className="absolute bottom-full left-0 mb-2 p-1.5 rounded-xl bg-onicord-surface/95 backdrop-blur-2xl border border-onicord-island shadow-xl flex gap-1">
              {WB_CONNECTORS.map((cnItem) => (
                <Tooltip key={cnItem.kind} content={cnItem.label} side="top">
                  <button
                    type="button"
                    onClick={() => {
                      upsertBatch(
                        selectedElements.map((el) => ({
                          ...el,
                          style: { ...el.style, connectorKind: cnItem.kind },
                        }))
                      );
                      setContextShapeOpen(false);
                    }}
                    className={cn(
                      "p-1.5 rounded-lg hover:bg-onicord-tint/10 cursor-pointer",
                      (selectedElements[0]?.style?.connectorKind || "arrow") ===
                        cnItem.kind && "bg-onicord-tint/15 text-onicord-accent"
                    )}
                  >
                    {renderConnectorIcon(cnItem.kind, 16)}
                  </button>
                </Tooltip>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Color swatch */}
      {commonProps.allColorable && (
        <div className="relative">
          <Tooltip content="Cambiar color" side="top">
            <button
              type="button"
              onClick={() => {
                setContextColorOpen((v) => !v);
                setContextShapeOpen(false);
                setContextAlignOpen(false);
              }}
              className="p-1 rounded-xl hover:bg-onicord-tint/10 transition-colors cursor-pointer flex items-center"
            >
              <span
                style={{
                  backgroundColor:
                    selectedElements[0]?.type === "connector" ||
                    selectedElements[0]?.type === "stroke"
                      ? selectedElements[0]?.style?.stroke || "#A1A1AA"
                      : selectedElements[0]?.type === "text"
                        ? selectedElements[0]?.style?.color || "#F4F4F5"
                        : selectedElements[0]?.style?.fill || "#D8B4FE",
                }}
                className="w-4 h-4 rounded-full border border-onicord-border"
              />
            </button>
          </Tooltip>
          {contextColorOpen && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-1.5 rounded-xl bg-onicord-surface/95 backdrop-blur-2xl border border-onicord-island shadow-xl flex gap-1.5">
              {commonProps.allConnectors || commonProps.allStrokes
                ? WB_PEN_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        upsertBatch(
                          selectedElements.map((el) => ({
                            ...el,
                            style: { ...el.style, stroke: c },
                          }))
                        );
                        setContextColorOpen(false);
                      }}
                      style={{ backgroundColor: c }}
                      className="w-5 h-5 rounded-full border border-onicord-border hover:scale-110 transition-transform cursor-pointer"
                    />
                  ))
                : WB_COLORS.map((c) => (
                    <Tooltip key={c.id} content={c.label} side="top">
                      <button
                        type="button"
                        onClick={() => {
                          upsertBatch(
                            selectedElements.map((el) => {
                              if (el.type === "connector" || el.type === "stroke") {
                                return { ...el, style: { ...el.style, stroke: c.fill } };
                              }
                              if (el.type === "text") {
                                return { ...el, style: { ...el.style, color: c.fill } };
                              }
                              return {
                                ...el,
                                style: { ...el.style, fill: c.fill, stroke: c.stroke },
                              };
                            })
                          );
                          setContextColorOpen(false);
                        }}
                        style={{ backgroundColor: c.fill }}
                        className="w-5 h-5 rounded-full border border-onicord-border hover:scale-110 transition-transform cursor-pointer"
                      />
                    </Tooltip>
                  ))}
            </div>
          )}
        </div>
      )}

      {/* Dashed border toggle */}
      {commonProps.allShapes && (
        <Tooltip content="Borde sólido / punteado" side="top">
          <button
            type="button"
            onClick={() => {
              const isDashed = selectedElements[0]?.style?.strokeStyle === "dashed";
              const nextStyle = isDashed ? "solid" : "dashed";
              upsertBatch(
                selectedElements.map((el) => ({
                  ...el,
                  style: { ...el.style, strokeStyle: nextStyle },
                }))
              );
            }}
            className="p-1.5 rounded-xl hover:bg-onicord-tint/10 transition-colors cursor-pointer"
          >
            <SquareDashed size={16} />
          </button>
        </Tooltip>
      )}

      {/* Align & Distribute */}
      {commonProps.alignableCount >= 2 && (
        <div className="relative">
          <Tooltip content="Alinear y distribuir" side="top">
            <button
              type="button"
              onClick={() => {
                setContextAlignOpen((v) => !v);
                setContextColorOpen(false);
                setContextShapeOpen(false);
              }}
              className="flex items-center gap-0.5 p-1.5 rounded-xl hover:bg-onicord-tint/10 transition-colors cursor-pointer"
            >
              <AlignCenterVertical size={16} />
              <ChevronDown size={13} />
            </button>
          </Tooltip>
          {contextAlignOpen && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-1.5 rounded-xl bg-onicord-surface/95 backdrop-blur-2xl border border-onicord-island shadow-xl flex items-center gap-0.5 w-max">
              <Tooltip content="Alinear a la izquierda" side="top">
                <button type="button" onClick={() => onAlign("left")} className="p-1.5 rounded-lg hover:bg-onicord-tint/10 cursor-pointer">
                  <AlignStartVertical size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Centrar horizontalmente" side="top">
                <button type="button" onClick={() => onAlign("centerH")} className="p-1.5 rounded-lg hover:bg-onicord-tint/10 cursor-pointer">
                  <AlignCenterVertical size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Alinear a la derecha" side="top">
                <button type="button" onClick={() => onAlign("right")} className="p-1.5 rounded-lg hover:bg-onicord-tint/10 cursor-pointer">
                  <AlignEndVertical size={15} />
                </button>
              </Tooltip>
              <div className="w-px h-4 bg-onicord-tint/15 mx-0.5" />
              <Tooltip content="Alinear arriba" side="top">
                <button type="button" onClick={() => onAlign("top")} className="p-1.5 rounded-lg hover:bg-onicord-tint/10 cursor-pointer">
                  <AlignStartHorizontal size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Centrar verticalmente" side="top">
                <button type="button" onClick={() => onAlign("centerV")} className="p-1.5 rounded-lg hover:bg-onicord-tint/10 cursor-pointer">
                  <AlignCenterHorizontal size={15} />
                </button>
              </Tooltip>
              <Tooltip content="Alinear abajo" side="top">
                <button type="button" onClick={() => onAlign("bottom")} className="p-1.5 rounded-lg hover:bg-onicord-tint/10 cursor-pointer">
                  <AlignEndHorizontal size={15} />
                </button>
              </Tooltip>
              {commonProps.alignableCount >= 3 && (
                <>
                  <div className="w-px h-4 bg-onicord-tint/15 mx-0.5" />
                  <Tooltip content="Distribuir horizontalmente" side="top">
                    <button type="button" onClick={() => onDistribute("horizontal")} className="p-1.5 rounded-lg hover:bg-onicord-tint/10 cursor-pointer">
                      <AlignHorizontalSpaceAround size={15} />
                    </button>
                  </Tooltip>
                  <Tooltip content="Distribuir verticalmente" side="top">
                    <button type="button" onClick={() => onDistribute("vertical")} className="p-1.5 rounded-lg hover:bg-onicord-tint/10 cursor-pointer">
                      <AlignVerticalSpaceAround size={15} />
                    </button>
                  </Tooltip>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Table controls */}
      {selectedElement?.type === "table" && !selectedElement.locked && (
        <>
          <Tooltip content="Añadir fila" side="top">
            <button type="button" onClick={() => onModifyTable(selectedElement, "addRow")} className="px-1.5 py-1 rounded-lg hover:bg-onicord-tint/10 text-[11px] font-semibold cursor-pointer">
              +Fila
            </button>
          </Tooltip>
          <Tooltip content="Quitar última fila" side="top">
            <button type="button" onClick={() => onModifyTable(selectedElement, "removeRow")} className="px-1.5 py-1 rounded-lg hover:bg-onicord-tint/10 text-[11px] font-semibold cursor-pointer">
              -Fila
            </button>
          </Tooltip>
          <Tooltip content="Añadir columna" side="top">
            <button type="button" onClick={() => onModifyTable(selectedElement, "addCol")} className="px-1.5 py-1 rounded-lg hover:bg-onicord-tint/10 text-[11px] font-semibold cursor-pointer">
              +Col
            </button>
          </Tooltip>
          <Tooltip content="Quitar última columna" side="top">
            <button type="button" onClick={() => onModifyTable(selectedElement, "removeCol")} className="px-1.5 py-1 rounded-lg hover:bg-onicord-tint/10 text-[11px] font-semibold cursor-pointer">
              -Col
            </button>
          </Tooltip>
          <div className="w-px h-4 bg-onicord-tint/15 mx-0.5" />
        </>
      )}

      {/* Layer order & Lock */}
      {commonProps.hasLayerable && (
        <>
          <Tooltip content="Traer al frente (])" side="top">
            <button type="button" onClick={onBringToFront} className="p-1.5 rounded-xl hover:bg-onicord-tint/10 transition-colors cursor-pointer">
              <BringToFront size={15} />
            </button>
          </Tooltip>
          <Tooltip content="Enviar atrás ([)" side="top">
            <button type="button" onClick={onSendToBack} className="p-1.5 rounded-xl hover:bg-onicord-tint/10 transition-colors cursor-pointer">
              <SendToBack size={15} />
            </button>
          </Tooltip>
          <Tooltip
            content={commonProps.allLocked ? "Desbloquear (Ctrl+Shift+L)" : "Bloquear (Ctrl+Shift+L)"}
            side="top"
          >
            <button
              type="button"
              onClick={onToggleLock}
              className={cn(
                "p-1.5 rounded-xl transition-colors cursor-pointer",
                commonProps.anyLocked
                  ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                  : "hover:bg-onicord-tint/10"
              )}
            >
              {commonProps.allLocked ? <Unlock size={15} /> : <Lock size={15} />}
            </button>
          </Tooltip>
        </>
      )}

      <div className="w-px h-4 bg-onicord-tint/15 mx-0.5" />

      {/* Group / Ungroup */}
      {commonProps.count >= 2 && (
        <Tooltip content="Agrupar (Ctrl+G)" side="top">
          <button type="button" onClick={onGroup} className="p-1.5 rounded-xl hover:bg-onicord-tint/10 transition-colors cursor-pointer">
            <Group size={15} />
          </button>
        </Tooltip>
      )}
      {commonProps.hasGroup && (
        <Tooltip content="Desagrupar (Ctrl+Shift+G)" side="top">
          <button type="button" onClick={onUngroup} className="p-1.5 rounded-xl hover:bg-onicord-tint/10 transition-colors cursor-pointer">
            <Ungroup size={15} />
          </button>
        </Tooltip>
      )}

      {/* Export Section or Group/Selection PNG */}
      {isSectionSelected && (
        <Tooltip content="Exportar sección a PNG" side="top">
          <button
            type="button"
            onClick={() => onExportSection(selectedElement)}
            className="p-1.5 rounded-xl hover:bg-onicord-tint/10 text-onicord-accent transition-colors cursor-pointer"
          >
            <Download size={15} />
          </button>
        </Tooltip>
      )}
      {!isSectionSelected && isGroupOrMulti && (
        <Tooltip content="Exportar grupo / selección a PNG" side="top">
          <button
            type="button"
            onClick={onExportSelection}
            className="p-1.5 rounded-xl hover:bg-onicord-tint/10 text-onicord-accent transition-colors cursor-pointer"
          >
            <Download size={15} />
          </button>
        </Tooltip>
      )}

      {/* Duplicate */}
      {commonProps.hasDuplicatable && (
        <Tooltip content="Duplicar (Ctrl+D)" side="top">
          <button
            type="button"
            onClick={() => {
              const dups = selectedElements
                .filter((el) => el.type !== "connector")
                .map((el) => ({
                  ...el,
                  id: createWbId(),
                  x: (el.x || 0) + 24,
                  y: (el.y || 0) + 24,
                }));
              if (dups.length > 0) {
                upsertBatch(dups);
                setSelectedIds(dups.map((d) => d.id));
              }
            }}
            className="p-1.5 rounded-xl hover:bg-onicord-tint/10 transition-colors cursor-pointer"
          >
            <Copy size={15} />
          </button>
        </Tooltip>
      )}

      {/* Delete */}
      <Tooltip content="Eliminar (Supr)" side="top">
        <button
          type="button"
          onClick={onDeleteSelected}
          className="p-1.5 rounded-xl hover:bg-red-500/20 text-red-400 transition-colors cursor-pointer"
        >
          <Trash2 size={16} />
        </button>
      </Tooltip>
    </div>
  );
}
