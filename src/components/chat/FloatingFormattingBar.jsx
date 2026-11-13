import React, { memo, useRef, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

const FloatingFormattingBar = memo(({ selection, applyFormatting, t }) => {
  if (!selection) return null;

  const barRef = useRef(null);
  const targetX = selection.x ?? selection.left;
  const [adjustedX, setAdjustedX] = useState(targetX);

  useLayoutEffect(() => {
    if (!barRef.current || !selection) return;
    const currentTargetX = selection.x ?? selection.left;
    if (currentTargetX == null) return;

    const rect = barRef.current.getBoundingClientRect();
    const halfWidth = rect && rect.width > 0 ? rect.width / 2 : 135;
    const padding = 8;
    let clampedX = currentTargetX;

    const bounds = selection.containerBounds;
    if (bounds && bounds.width >= halfWidth * 2 + padding * 2) {
      const minX = bounds.left + halfWidth + padding;
      const maxX = bounds.right - halfWidth - padding;
      clampedX = Math.max(minX, Math.min(currentTargetX, maxX));
    } else {
      const minX = halfWidth + padding;
      const maxX = window.innerWidth - halfWidth - padding;
      clampedX = Math.max(minX, Math.min(currentTargetX, maxX));
    }

    setAdjustedX(clampedX);
  }, [selection.x, selection.left, selection.containerBounds]);

  const y = selection.y ?? selection.top;
  const placement = selection.placement || "top";

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={barRef}
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        left: `${adjustedX}px`,
        top: `${y}px`,
        transform: placement === "bottom" ? "translate(-50%, 0)" : "translate(-50%, -100%)",
      }}
      className="z-[9999] pointer-events-auto select-none"
    >
      <div className="flex items-center gap-1 p-1 bg-onicord-mantle/95 border border-white/10 rounded-full shadow-2xl backdrop-blur-md animate-scale-up">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormatting("**", "**")}
          className="p-1 px-2.5 rounded-full text-xs font-bold text-onicord-text hover:bg-white/10 transition-colors cursor-pointer"
          title={t("chat.formatBold")}
        >
          B
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormatting("*", "*")}
          className="p-1 px-2.5 rounded-full text-xs italic text-onicord-text hover:bg-white/10 transition-colors cursor-pointer"
          title={t("chat.formatItalic")}
        >
          I
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormatting("~~", "~~")}
          className="p-1 px-2.5 rounded-full text-xs line-through text-onicord-text hover:bg-white/10 transition-colors cursor-pointer"
          title={t("chat.formatStrike")}
        >
          S
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormatting("`", "`")}
          className="p-1 px-2.5 rounded-full text-xs font-mono text-onicord-text hover:bg-white/10 transition-colors cursor-pointer"
          title={t("chat.formatCode")}
        >
          {"</>"}
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormatting("```\n", "\n```")}
          className="p-1 px-2.5 rounded-full text-xs font-mono font-bold text-onicord-text hover:bg-white/10 transition-colors cursor-pointer"
          title={t("chat.formatCodeBlock")}
        >
          pre
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormatting("> ", "")}
          className="p-1 px-2.5 rounded-full text-xs text-onicord-text hover:bg-white/10 transition-colors cursor-pointer"
          title={t("chat.formatQuote")}
        >
          ”
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyFormatting("### ", "")}
          className="p-1 px-2.5 rounded-full text-xs font-bold text-onicord-text hover:bg-white/10 transition-colors cursor-pointer"
          title={t("chat.formatHeading")}
        >
          H
        </button>
      </div>
    </div>,
    document.body
  );
});

FloatingFormattingBar.displayName = "FloatingFormattingBar";
export default FloatingFormattingBar;
