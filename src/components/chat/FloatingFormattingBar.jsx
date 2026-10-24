import React, { memo } from "react";

const FloatingFormattingBar = memo(({ selection, applyFormatting, t }) => {
  if (!selection) return null;

  return (
    <div
      style={{ left: `${selection.left}px` }}
      className="absolute bottom-full mb-1.5 -translate-x-1/2 z-50 flex items-center gap-1 p-1 bg-onicord-mantle/95 border border-white/10 rounded-full shadow-xl backdrop-blur-md animate-scale-up select-none pointer-events-auto"
    >
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
  );
});

FloatingFormattingBar.displayName = "FloatingFormattingBar";
export default FloatingFormattingBar;
