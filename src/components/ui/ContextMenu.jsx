import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { soundEngine } from "../../lib/soundEngine";
import { useInternalClose } from "../../hooks/useAnimatedMount";

export default function ContextMenu({ x, y, title, items, onClose }) {
  const menuRef = useRef(null);
  const { isClosing, triggerClose } = useInternalClose(onClose, 110);

  const [coords, setCoords] = useState({ top: y, left: x });

  useEffect(() => {
    soundEngine.playNav("open");
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) {
        return;
      }
      triggerClose();
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        triggerClose();
      }
    };

    const timeoutId = setTimeout(() => {
      window.addEventListener("click", handleOutsideClick);
      window.addEventListener("contextmenu", handleOutsideClick);
      window.addEventListener("keydown", handleKeyDown);
    }, 10);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("click", handleOutsideClick);
      window.removeEventListener("contextmenu", handleOutsideClick);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [triggerClose]);

  useEffect(() => {
    if (!menuRef.current) return;

    const menuWidth = menuRef.current.offsetWidth;
    const menuHeight = menuRef.current.offsetHeight;

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
  }, [x, y, items]);

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
        zIndex: 999999,
      }}
      className={cn(
        "onicord-context-menu",
        isClosing && "onicord-animate-popup-out"
      )}
    >
      {title && (
        <>
          <div className="onicord-context-menu-title">
            {title}
          </div>
          <div className="h-[1px] bg-white/5 my-1 mx-1 opacity-30" />
        </>
      )}

      <div className="space-y-0.5">
        {items.map((item, idx) => {
          if (item === "SEPARATOR") {
            return (
              <div
                key={`sep-${idx}`}
                className="h-[1px] bg-white/5 my-1 mx-1 opacity-30"
              />
            );
          }

          return (
            <button
              key={`item-${idx}`}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                soundEngine.playNav("select");
                item.onClick();
                triggerClose();
              }}
              className={cn(
                "onicord-context-menu-item",
                item.disabled
                  ? "opacity-40 cursor-not-allowed text-onicord-muted"
                  : item.variant === "danger"
                    ? "onicord-context-menu-item-danger"
                    : "onicord-context-menu-item-default",
              )}
            >
              <span>{item.label}</span>
              {item.icon && (
                <span className="w-[25px] h-[25px] flex justify-center items-center text-[14px] opacity-70">{item.icon}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
