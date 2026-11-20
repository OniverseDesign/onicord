import React, { useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { cn } from "../../lib/cn";
import { getMediaUrl } from "../../lib/media";
import SmartAnimatedImage from "../ui/SmartAnimatedImage";

/**
 * Builds an SVG path string for a closed polygon with exact circular corner fillets (Figma/Illustrator style)
 */
function roundedPolygonPath(pts, radius) {
  if (!pts || pts.length < 3) return "";
  if (!radius || radius <= 0.5) {
    return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";
  }
  const n = pts.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];
    const v1 = { x: prev.x - curr.x, y: prev.y - curr.y };
    const v2 = { x: next.x - curr.x, y: next.y - curr.y };
    const len1 = Math.hypot(v1.x, v1.y) || 1;
    const len2 = Math.hypot(v2.x, v2.y) || 1;
    const u1 = { x: v1.x / len1, y: v1.y / len1 };
    const u2 = { x: v2.x / len2, y: v2.y / len2 };

    const dot = Math.max(-0.9999, Math.min(0.9999, u1.x * u2.x + u1.y * u2.y));
    const angle = Math.acos(dot);
    const tanHalf = Math.tan(angle / 2) || 0.001;

    const maxTangent = Math.min(len1, len2) * 0.45;
    const tangentDist = Math.min(maxTangent, radius / tanHalf);
    const arcR = Math.max(0.5, tangentDist * tanHalf);

    const p1 = { x: curr.x + u1.x * tangentDist, y: curr.y + u1.y * tangentDist };
    const p2 = { x: curr.x + u2.x * tangentDist, y: curr.y + u2.y * tangentDist };
    const cross = u1.x * u2.y - u1.y * u2.x;
    const sweep = cross < 0 ? 1 : 0;

    d += i === 0 ? `M ${p1.x} ${p1.y} ` : `L ${p1.x} ${p1.y} `;
    d += `A ${arcR} ${arcR} 0 0 ${sweep} ${p2.x} ${p2.y} `;
  }
  return d + "Z";
}

/**
 * Renders SVG geometry for a shape element
 */
export function ShapeSvg({ el }) {
  const { w, h, style = {} } = el;
  const fill = style.fill || "#D8B4FE";
  const stroke = style.stroke || "#6B21A8";
  const strokeWidth = style.strokeWidth || 2;
  const dashArray = style.strokeStyle === "dashed" ? "6 4" : undefined;
  const kind = style.shapeKind || "rect";
  const pad = strokeWidth;
  const radius = Math.min(Math.min(w, h) / 2, style.borderRadius ?? 0);

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-full overflow-visible pointer-events-none select-none"
    >
      {kind === "rect" && (
        <rect
          x={pad}
          y={pad}
          width={Math.max(1, w - pad * 2)}
          height={Math.max(1, h - pad * 2)}
          rx={radius}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray}
        />
      )}
      {kind === "pill" && (
        <rect
          x={pad}
          y={pad}
          width={Math.max(1, w - pad * 2)}
          height={Math.max(1, h - pad * 2)}
          rx={Math.min(w, h) / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray}
        />
      )}
      {kind === "circle" && (
        <ellipse
          cx={w / 2}
          cy={h / 2}
          rx={Math.max(1, w / 2 - pad)}
          ry={Math.max(1, h / 2 - pad)}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray}
        />
      )}
      {kind === "diamond" && (
        <path
          d={roundedPolygonPath(
            [
              { x: w / 2, y: pad },
              { x: w - pad, y: h / 2 },
              { x: w / 2, y: h - pad },
              { x: pad, y: h / 2 },
            ],
            radius
          )}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray}
          strokeLinejoin="round"
        />
      )}
      {kind === "triangle" && (
        <path
          d={roundedPolygonPath(
            [
              { x: w / 2, y: pad },
              { x: w - pad, y: h - pad },
              { x: pad, y: h - pad },
            ],
            radius
          )}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray}
          strokeLinejoin="round"
        />
      )}
      {kind === "cylinder" && (
        <g>
          <path
            d={`M ${pad} ${Math.min(18, h * 0.2)}
               L ${pad} ${h - Math.min(18, h * 0.2)}
               A ${Math.max(1, w / 2 - pad)} ${Math.min(16, h * 0.18)} 0 0 0 ${w - pad} ${h - Math.min(18, h * 0.2)}
               L ${w - pad} ${Math.min(18, h * 0.2)} Z`}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
          />
          <ellipse
            cx={w / 2}
            cy={Math.min(18, h * 0.2)}
            rx={Math.max(1, w / 2 - pad)}
            ry={Math.min(16, h * 0.18)}
            fill={fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
            strokeDasharray={dashArray}
          />
        </g>
      )}
    </svg>
  );
}

/**
 * Resolves and renders a P2P-shared image element on the whiteboard
 */
function WhiteboardImage({ el, autoDownload = true }) {
  const [src, setSrc] = useState(() => el.thumbnail || null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const roomCode = el.roomCode;
    const fileId = el.fileId;
    if (!fileId || !roomCode || !window.electronAPI) return;

    const unsubProgress = window.electronAPI.onFileProgress?.((data) => {
      if (!data || data.fileId !== fileId) return;
      if (data.done) {
        setIsDownloading(false);
        if (data.localPath) {
          setSrc(getMediaUrl(data.localPath));
        } else if (window.electronAPI.fetchMediaLocalPath) {
          window.electronAPI.fetchMediaLocalPath(fileId, roomCode).then((diskPath) => {
            if (!cancelled && diskPath) setSrc(getMediaUrl(diskPath));
          });
        }
      } else if (data.error) {
        setIsDownloading(false);
      }
    });

    const resolveImage = async () => {
      try {
        let localPath = null;
        if (window.electronAPI.fetchUploadedLocalPath) {
          localPath = await window.electronAPI.fetchUploadedLocalPath(roomCode, fileId);
        }
        if (!localPath && window.electronAPI.fetchMediaLocalPath) {
          localPath = await window.electronAPI.fetchMediaLocalPath(fileId, roomCode);
        }
        if (localPath) {
          if (!cancelled) setSrc(getMediaUrl(localPath));
          return;
        }
        if (autoDownload && window.electronAPI.downloadFile) {
          if (!cancelled) setIsDownloading(true);
          await window.electronAPI.downloadFile(
            roomCode,
            fileId,
            el.fileName || "image.png",
            el.fileSize || 0
          );
          if (window.electronAPI.fetchMediaLocalPath) {
            const postPath = await window.electronAPI.fetchMediaLocalPath(fileId, roomCode);
            if (!cancelled && postPath) {
              setSrc(getMediaUrl(postPath));
              setIsDownloading(false);
            }
          }
        }
      } catch {
        if (!cancelled) setIsDownloading(false);
      }
    };

    resolveImage();
    return () => {
      cancelled = true;
      unsubProgress?.();
    };
  }, [el.fileId, el.roomCode, el.fileName, el.fileSize, autoDownload]);

  return (
    <div className="w-full h-full rounded-xl overflow-hidden bg-onicord-surface/60 border border-white/10 shadow-lg flex items-center justify-center relative">
      {src ? (
        <img
          src={src}
          alt={el.fileName || "Imagen"}
          draggable={false}
          className="w-full h-full object-contain pointer-events-none select-none"
        />
      ) : (
        <span className="text-xs text-onicord-muted px-2 text-center truncate">
          {isDownloading ? `Descargando ${el.fileName || "imagen"}...` : `Cargando ${el.fileName || "imagen"}...`}
        </span>
      )}
    </div>
  );
}

/**
 * Resolves and renders a P2P-synced sticker element on the whiteboard
 */
function WhiteboardSticker({ el }) {
  const [stickerSrc, setStickerSrc] = useState(null);

  useEffect(() => {
    if (!el.stickerId) return;
    let isMounted = true;

    const loadSticker = () => {
      window.electronAPI
        ?.getStickerPath?.(el.stickerId)
        .then((cachedPath) => {
          if (!isMounted) return;
          if (cachedPath) {
            setStickerSrc(getMediaUrl(cachedPath));
          } else {
            setStickerSrc(null);
            window.electronAPI?.requestSticker?.({
              id: el.stickerId,
              ext: el.ext,
            });
          }
        });
    };

    loadSticker();

    const unsub = window.electronAPI?.onSyncComplete?.((data) => {
      if (data?.type === "sticker_imported" || data?.type === "sticker_pack_imported") {
        if (!data?.stickerId || data.stickerId === el.stickerId) {
          loadSticker();
        }
      }
    });

    return () => {
      isMounted = false;
      unsub?.();
    };
  }, [el.stickerId, el.ext]);

  return (
    <div className="w-full h-full flex items-center justify-center select-none overflow-hidden rounded-xl">
      {stickerSrc ? (
        <SmartAnimatedImage
          src={stickerSrc}
          alt={el.stickerName || "Sticker"}
          className="w-full h-full object-contain pointer-events-none select-none"
          timestamp={el.updatedAt}
        />
      ) : (
        <span className="text-[11px] text-onicord-muted px-2 text-center truncate">
          {el.stickerName || "Sticker..."}
        </span>
      )}
    </div>
  );
}

/**
 * Renders an individual interactive whiteboard object (sticky, shape, text, section, stamp, image, table, sticker)
 */
export default function WhiteboardElement({
  el,
  isSelected,
  isEditing,
  editingBy,
  canEdit,
  autoDownload = true,
  onPointerDown,
  onDoubleClick,
  onTextChange,
  onTableCellChange,
  onFinishEdit,
  onResizeStart,
  onRadiusStart,
  onRotateStart,
  onConnectStart,
}) {
  const textareaRef = useRef(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const elRef = textareaRef.current;
      requestAnimationFrame(() => {
        elRef.focus();
        elRef.select();
      });
    }
  }, [isEditing]);

  if (el.type === "connector" || el.deleted) {
    return null;
  }

  const isStroke = el.type === "stroke";

  const isDarkFill = el.style?.fill === "#27272A";
  const textColor =
    el.type === "text" || el.type === "section"
      ? el.style?.color || "#F4F4F5"
      : isDarkFill
        ? "#F4F4F5"
        : "#18181B";

  const handles = ["nw", "ne", "sw", "se"];

  return (
    <div
      data-wb-id={el.id}
      onPointerDown={isStroke && !isSelected ? undefined : (e) => onPointerDown(e, el)}
      onDoubleClick={(e) => onDoubleClick(e, el)}
      style={{
        position: "absolute",
        left: el.x,
        top: el.y,
        width: el.w,
        height: el.h,
        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
        transformOrigin: "center center",
        zIndex: el.zIndex ?? (el.type === "section" ? 1 : 10),
      }}
      className={cn(
        "group select-none",
        isStroke && !isSelected && "pointer-events-none",
        !canEdit || el.locked ? "cursor-default" : "cursor-move",
        isSelected &&
          (el.locked
            ? "ring-2 ring-amber-400/80 ring-offset-1 ring-offset-transparent rounded-lg"
            : "ring-2 ring-sky-400 ring-offset-1 ring-offset-transparent rounded-lg")
      )}
    >
      {isSelected && el.locked && (
        <div
          title="Bloqueado"
          className="absolute -top-3 -right-3 w-5 h-5 rounded-full bg-amber-500 text-zinc-950 flex items-center justify-center shadow-md z-40 pointer-events-none"
        >
          <Lock size={11} />
        </div>
      )}
      {editingBy && !isEditing && (
        <div className="absolute -top-6 left-0 px-2 py-0.5 rounded-full bg-sky-500 text-zinc-950 text-[10px] font-bold shadow-md z-40 pointer-events-none whitespace-nowrap">
          {editingBy.nickname} editando…
        </div>
      )}
      {/* STICKY NOTE */}
      {el.type === "sticky" && (
        <div
          style={{ backgroundColor: el.style?.fill || "#FEF08A" }}
          className="w-full h-full rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.35)] p-3 flex flex-col justify-between border border-black/10"
        >
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={el.text || ""}
              onChange={(e) => onTextChange(el.id, e.target.value)}
              onBlur={onFinishEdit}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") onFinishEdit();
              }}
              style={{ color: textColor }}
              placeholder="Escribe una nota..."
              className="w-full h-full bg-transparent resize-none outline-none text-sm font-medium leading-snug placeholder:text-black/40"
            />
          ) : (
            <div
              style={{ color: textColor }}
              className="w-full flex-1 text-sm font-medium leading-snug whitespace-pre-wrap break-words overflow-hidden"
            >
              {el.text || (
                <span className="opacity-40 italic">Doble clic para editar</span>
              )}
            </div>
          )}
          {el.authorName && (
            <div
              style={{ color: textColor }}
              className="text-[10px] font-semibold opacity-50 truncate pt-1"
            >
              {el.authorName}
            </div>
          )}
        </div>
      )}

      {/* SHAPE */}
      {el.type === "shape" && (
        <div className="w-full h-full relative flex items-center justify-center">
          <ShapeSvg el={el} />
          <div className="absolute inset-0 flex items-center justify-center p-3 overflow-hidden">
            {isEditing ? (
              <div className="relative w-full max-h-full grid">
                <span
                  aria-hidden="true"
                  className="invisible col-start-1 row-start-1 text-sm font-semibold text-center whitespace-pre-wrap break-words leading-snug min-h-[1.25rem]"
                >
                  {(el.text || " ") + "\n"}
                </span>
                <textarea
                  ref={textareaRef}
                  value={el.text || ""}
                  onChange={(e) => onTextChange(el.id, e.target.value)}
                  onBlur={onFinishEdit}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") onFinishEdit();
                  }}
                  style={{ color: textColor }}
                  placeholder="Escribe..."
                  className="col-start-1 row-start-1 w-full h-full bg-transparent resize-none outline-none text-center text-sm font-semibold leading-snug overflow-hidden placeholder:text-black/35"
                />
              </div>
            ) : (
              <span
                style={{ color: textColor }}
                className="text-sm font-semibold text-center whitespace-pre-wrap break-words leading-snug pointer-events-none"
              >
                {el.text}
              </span>
            )}
          </div>
        </div>
      )}

      {/* FREE TEXT */}
      {el.type === "text" && (
        <div className="w-full h-full flex items-start p-1">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={el.text || ""}
              onChange={(e) => onTextChange(el.id, e.target.value)}
              onBlur={onFinishEdit}
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Escape") onFinishEdit();
              }}
              placeholder="Escribe algo..."
              style={{
                color: textColor,
                fontSize: `${el.style?.fontSize || 18}px`,
              }}
              className="w-full h-full bg-transparent resize-none outline-none font-semibold leading-snug"
            />
          ) : (
            <div
              style={{
                color: textColor,
                fontSize: `${el.style?.fontSize || 18}px`,
              }}
              className="w-full h-full font-semibold leading-snug whitespace-pre-wrap break-words"
            >
              {el.text || (
                <span className="opacity-40 italic text-sm">Texto vacío</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* SECTION / FRAME */}
      {el.type === "section" && (
        <div className="w-full h-full rounded-2xl border-2 border-dashed border-onicord-border bg-onicord-surface/20 relative">
          <div className="absolute -top-7 left-0 px-2.5 py-0.5 rounded-lg bg-onicord-surface border border-onicord-border text-xs font-bold text-onicord-text">
            {isEditing ? (
              <input
                ref={textareaRef}
                value={el.text || ""}
                onChange={(e) => onTextChange(el.id, e.target.value)}
                onBlur={onFinishEdit}
                onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") onFinishEdit();
                }}
                className="bg-transparent outline-none text-xs font-bold w-32"
              />
            ) : (
              <span>{el.text || "Sección"}</span>
            )}
          </div>
        </div>
      )}

      {/* STAMP / EMOJI */}
      {el.type === "stamp" && (
        <div
          style={{
            fontSize: `${Math.max(20, Math.round(Math.min(el.w || 48, el.h || 48) * 0.72))}px`,
          }}
          className="w-full h-full flex items-center justify-center leading-none drop-shadow-md select-none"
        >
          {el.text || "👍"}
        </div>
      )}

      {/* STICKER */}
      {el.type === "sticker" && <WhiteboardSticker el={el} />}

      {/* FREEHAND STROKE (selectable, movable, resizable, rotatable, groupable) */}
      {el.type === "stroke" && (() => {
        const pts = el.points || [];
        const w = Math.max(1, el.w || 1);
        const h = Math.max(1, el.h || 1);
        const d = pts
          .map((p, i) => {
            const px = p.rx !== undefined ? p.rx * w : p.x - (el.x || 0);
            const py = p.ry !== undefined ? p.ry * h : p.y - (el.y || 0);
            return `${i === 0 ? "M" : "L"} ${px} ${py}`;
          })
          .join(" ");
        const sw = el.style?.strokeWidth || 4;
        return (
          <svg
            width={w}
            height={h}
            viewBox={`0 0 ${w} ${h}`}
            className="w-full h-full overflow-visible pointer-events-none select-none"
          >
            <path
              d={d}
              fill="none"
              stroke={el.style?.stroke || "#FFFFFF"}
              strokeWidth={sw}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={el.style?.isHighlighter ? 0.35 : 1}
            />
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(16, sw + 12)}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-auto cursor-move"
              onPointerDown={(e) => onPointerDown(e, el)}
            />
          </svg>
        );
      })()}

      {/* IMAGE */}
      {el.type === "image" && <WhiteboardImage el={el} autoDownload={autoDownload} />}

      {/* TABLE */}
      {el.type === "table" && (
        <div className="w-full h-full rounded-xl overflow-hidden bg-[#1E1F22] border border-white/20 shadow-xl flex flex-col">
          <div
            style={{
              gridTemplateColumns: `repeat(${Math.max(1, el.cols || el.cells?.[0]?.length || 3)}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${Math.max(1, el.rows || el.cells?.length || 3)}, minmax(0, 1fr))`,
            }}
            className="w-full h-full grid"
          >
            {(el.cells || []).map((row, rIdx) =>
              row.map((cellVal, cIdx) => (
                <div
                  key={`${rIdx}-${cIdx}`}
                  className={cn(
                    "border-r border-b border-white/10 last:border-r-0 flex items-center px-2 py-1 min-w-0 min-h-0",
                    rIdx === 0 ? "bg-white/10 font-semibold" : "bg-transparent"
                  )}
                >
                  <input
                    type="text"
                    value={cellVal ?? ""}
                    disabled={!canEdit || el.locked}
                    onPointerDown={(e) => {
                      if (canEdit && !el.locked) e.stopPropagation();
                    }}
                    onChange={(e) =>
                      onTableCellChange?.(el.id, rIdx, cIdx, e.target.value)
                    }
                    placeholder={rIdx === 0 ? `Col ${cIdx + 1}` : ""}
                    className="w-full h-full bg-transparent outline-none text-xs text-white placeholder:text-white/30 truncate disabled:cursor-default"
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* RESIZE HANDLES + OUTER CORNER ROTATION ZONES */}
      {isSelected && canEdit && !el.locked && (
        <>
          {handles.map((dir) => {
            const posClass =
              dir === "nw"
                ? "-top-1.5 -left-1.5 cursor-nwse-resize"
                : dir === "ne"
                  ? "-top-1.5 -right-1.5 cursor-nesw-resize"
                  : dir === "sw"
                    ? "-bottom-1.5 -left-1.5 cursor-nesw-resize"
                    : "-bottom-1.5 -right-1.5 cursor-nwse-resize";
            const rotClass =
              dir === "nw"
                ? "-top-4 -left-4"
                : dir === "ne"
                  ? "-top-4 -right-4"
                  : dir === "sw"
                    ? "-bottom-4 -left-4"
                    : "-bottom-4 -right-4";
            return (
              <React.Fragment key={dir}>
                {onRotateStart && (
                  <div
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onRotateStart(e, el);
                    }}
                    title="Arrastrar para rotar (Shift: pasos de 45°)"
                    className={cn(
                      "absolute w-3.5 h-3.5 rounded-full cursor-grab active:cursor-grabbing z-35 hover:bg-sky-400/30 transition-colors",
                      rotClass
                    )}
                  />
                )}
                <div
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onResizeStart(e, el, dir);
                  }}
                  className={cn(
                    "absolute w-3 h-3 rounded-full bg-white border-2 border-sky-500 shadow-sm z-40",
                    posClass
                  )}
                />
              </React.Fragment>
            );
          })}
        </>
      )}

      {/* INNER CORNER RADIUS HANDLE (all shapes except circle) */}
      {isSelected &&
        canEdit &&
        !el.locked &&
        el.type === "shape" &&
        el.style?.shapeKind !== "circle" &&
        onRadiusStart && (
          <div
            onPointerDown={(e) => {
              e.stopPropagation();
              onRadiusStart(e, el);
            }}
            style={{
              left: `${Math.min(el.w / 2 - 6, 8 + (el.style?.borderRadius ?? 0) * 0.55)}px`,
              top: `${Math.min(el.h / 2 - 6, 8 + (el.style?.borderRadius ?? 0) * 0.55)}px`,
            }}
            title="Arrastrar para redondear esquinas"
            className="absolute w-2.5 h-2.5 rounded-full bg-white border-2 border-sky-500 shadow-sm z-40 cursor-nwse-resize hover:scale-125 transition-transform"
          />
        )}

      {/* OUTER CONNECTOR ANCHORS (top, right, bottom, left) */}
      {isSelected &&
        canEdit &&
        !el.locked &&
        (el.type === "shape" ||
          el.type === "sticky" ||
          el.type === "section" ||
          el.type === "image" ||
          el.type === "table") &&
        onConnectStart && (
          <>
            {[
              { side: "top", cls: "-top-4 left-1/2 -translate-x-1/2" },
              { side: "right", cls: "top-1/2 -right-4 -translate-y-1/2" },
              { side: "bottom", cls: "-bottom-4 left-1/2 -translate-x-1/2" },
              { side: "left", cls: "top-1/2 -left-4 -translate-y-1/2" },
            ].map((anc) => (
              <div
                key={anc.side}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onConnectStart(e, el, anc.side);
                }}
                title="Arrastrar para conectar"
                className={cn(
                  "absolute w-3 h-3 rounded-full bg-sky-400/85 hover:bg-sky-300 border-2 border-[#1E1F22] shadow-md z-40 cursor-crosshair hover:scale-125 transition-transform",
                  anc.cls
                )}
              />
            ))}
          </>
        )}
    </div>
  );
}
