import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import { soundEngine } from "../../lib/soundEngine";
import { useInternalClose } from "../../hooks/useAnimatedMount";
import { cn } from "../../lib/cn";

export default function VoiceUserVolumeMenu({
  x,
  y,
  nickname,
  volume,
  onVolumeChange,
  onClose,
}) {
  const { t } = useTranslation();
  const menuRef = useRef(null);
  const { isClosing, triggerClose } = useInternalClose(onClose, 110);
  const [currentVol, setCurrentVol] = useState(typeof volume === "number" ? volume : 100);
  const [lastNonZeroVol, setLastNonZeroVol] = useState(volume > 0 ? volume : 100);
  const [coords, setCoords] = useState({ top: y, left: x });

  useEffect(() => {
    soundEngine.playNav("open");
  }, []);

  useEffect(() => {
    if (typeof volume === "number") {
      setCurrentVol(volume);
      if (volume > 0) {
        setLastNonZeroVol(volume);
      }
    }
  }, [volume]);

  const handleVolChange = useCallback(
    (newVal) => {
      const clamped = Math.max(0, Math.min(200, Math.round(newVal)));
      setCurrentVol(clamped);
      if (clamped > 0) {
        setLastNonZeroVol(clamped);
      }
      onVolumeChange?.(clamped);
    },
    [onVolumeChange]
  );

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!menuRef.current) return;

    const menuWidth = menuRef.current.offsetWidth || 240;
    const menuHeight = menuRef.current.offsetHeight || 160;

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    let adjustedLeft = x;
    let adjustedTop = y;

    if (x + menuWidth > windowWidth) {
      adjustedLeft = windowWidth - menuWidth - 8;
    }
    if (y + menuHeight > windowHeight) {
      adjustedTop = windowHeight - menuHeight - 8;
    }

    if (adjustedLeft < 0) adjustedLeft = 8;
    if (adjustedTop < 0) adjustedTop = 8;

    setCoords({ top: adjustedTop, left: adjustedLeft });
  }, [x, y]);

  const handleToggleMute = () => {
    if (currentVol > 0) {
      handleVolChange(0);
    } else {
      handleVolChange(lastNonZeroVol || 100);
    }
  };

  const isMuted = currentVol === 0;

  let volumeIcon = "volume_up";
  if (isMuted) volumeIcon = "volume_off";
  else if (currentVol < 50) volumeIcon = "volume_down";

  return createPortal(
    <>
      {/* Backdrop transparente a pantalla completa: captura cualquier click fuera para cerrar de inmediato */}
      <div
        className="fixed inset-0 z-[99998] cursor-default bg-transparent"
        onPointerDown={(e) => {
          e.stopPropagation();
          triggerClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          triggerClose();
        }}
      />

      <div
        ref={menuRef}
        style={{
          position: "fixed",
          top: `${coords.top}px`,
          left: `${coords.left}px`,
          zIndex: 999999,
        }}
        className={cn(
          "onicord-context-menu w-64 p-3 shadow-2xl",
          isClosing && "onicord-animate-popup-out"
        )}
        role="menu"
      >
        <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-white/5">
          <div className="w-7 h-7 rounded-lg bg-onicord-accent/20 border border-onicord-accent/30 flex items-center justify-center text-onicord-accent shrink-0">
            <MaterialIcon name={volumeIcon} size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-onicord-text truncate leading-tight">
              {nickname}
            </p>
            <p className="text-[10px] text-onicord-muted uppercase tracking-wider font-semibold">
              {t("contextMenu.userVolume", "Volumen de usuario")}
            </p>
          </div>
        </div>

        <div className="space-y-1.5 mb-3 bg-onicord-base/50 p-2 rounded-lg border border-white/5">
          <div className="flex items-center justify-between text-[11px] font-mono text-onicord-subtext">
            <span>0%</span>
            <span className="font-bold text-onicord-accent">{currentVol}%</span>
            <span>200%</span>
          </div>
          <input
            type="range"
            min={0}
            max={200}
            value={currentVol}
            onChange={(e) => handleVolChange(Number(e.target.value))}
            className="w-full h-1.5 bg-onicord-surface rounded-lg appearance-none cursor-pointer accent-onicord-accent"
          />
        </div>

        <div className="space-y-1">
          <button
            type="button"
            onClick={handleToggleMute}
            className={`onicord-context-menu-item ${
              isMuted
                ? "onicord-context-menu-item-default text-emerald-400 hover:text-white"
                : "onicord-context-menu-item-danger"
            }`}
          >
            <span>
              {isMuted
                ? t("contextMenu.unmuteUser", "Desilenciar usuario")
                : t("contextMenu.muteUser", "Silenciar usuario")}
            </span>
            <MaterialIcon name={isMuted ? "volume_up" : "volume_off"} size={16} />
          </button>

          <button
            type="button"
            onClick={() => handleVolChange(100)}
            disabled={currentVol === 100}
            className="onicord-context-menu-item onicord-context-menu-item-default disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>{t("contextMenu.resetVolume", "Restablecer (100%)")}</span>
            <MaterialIcon name="restart_alt" size={16} />
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
