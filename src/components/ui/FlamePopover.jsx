import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

const calculateFlameCoords = (rect) => {
  if (!rect) return { top: 0, left: 0 };

  const popoverWidth = 260;
  const popoverHeight = 160;
  const windowWidth = window.innerWidth;

  let left = rect.left + rect.width / 2 - popoverWidth / 2;
  let top = rect.top - popoverHeight - 10;

  if (top < 10) {
    top = rect.bottom + 10;
  }

  if (left < 10) left = 10;
  if (left + popoverWidth > windowWidth - 10) {
    left = windowWidth - popoverWidth - 10;
  }

  return { top, left };
};

export default function FlamePopover({ rect, tier, currentDays, isServer, onClose }) {
  const { t } = useTranslation();
  const popoverRef = useRef(null);
  const [coords, setCoords] = useState(() => calculateFlameCoords(rect));

  useLayoutEffect(() => {
    if (!rect) return;
    setCoords(calculateFlameCoords(rect));
  }, [rect]);

  if (!rect) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
      }}
      className="onicord-popover-card w-64 p-3 pointer-events-none text-left"
    >
      <div className="flex items-center gap-2 mb-1.5 pb-1.5">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm"
          style={{ backgroundColor: tier.color }}
        />
        <div className="flex flex-col min-w-0">
          <h4 className="text-xs font-bold truncate leading-tight text-onicord-text">
            {isServer ? t("flame.serverFlame") : t("flame.title")}
          </h4>
          <span className="text-[10px] font-medium" style={{ color: tier.color }}>
            {tier.name} — {t("flame.days", { count: currentDays })}
          </span>
        </div>
      </div>
      <p className="text-[11px] text-onicord-muted leading-relaxed mb-2">
        {isServer
          ? t("flame.serverExplanation")
          : t("flame.userExplanation")}
      </p>
      <div className="text-[10px] font-mono bg-onicord-surface/60 p-1.5 rounded-lg border border-onicord-island text-onicord-faded">
        <span className="text-onicord-accent font-bold">{t("flame.rule")}</span> {t("flame.ruleDesc")}
      </div>
    </div>,
    document.body
  );
}
