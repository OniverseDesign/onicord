import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";

/**
 * Custom Onicord Tooltip component.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - Target trigger element.
 * @param {React.ReactNode} props.content - Tooltip text or node.
 * @param {"top"|"bottom"|"left"|"right"} [props.side="right"] - Placement relative to trigger.
 * @param {"start"|"center"|"end"} [props.align="center"] - Cross-axis alignment.
 * @param {number} [props.delay=120] - Delay in ms before appearing.
 * @param {boolean} [props.disabled=false] - Whether tooltip is disabled.
 * @param {string} [props.className] - Additional styles for the tooltip bubble.
 */
export default function Tooltip({
  children,
  content,
  side = "right",
  align = "center",
  delay = 120,
  disabled = false,
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const timerRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const calculatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const offset = 10; // Distance between trigger and tooltip
    const margin = 8; // Margin from viewport edges

    let top = 0;
    let left = 0;

    switch (side) {
      case "right":
        left = triggerRect.right + offset;
        if (align === "start") {
          top = triggerRect.top;
        } else if (align === "end") {
          top = triggerRect.bottom - tooltipRect.height;
        } else {
          top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        }
        break;

      case "left":
        left = triggerRect.left - tooltipRect.width - offset;
        if (align === "start") {
          top = triggerRect.top;
        } else if (align === "end") {
          top = triggerRect.bottom - tooltipRect.height;
        } else {
          top = triggerRect.top + (triggerRect.height - tooltipRect.height) / 2;
        }
        break;

      case "top":
        top = triggerRect.top - tooltipRect.height - offset;
        if (align === "start") {
          left = triggerRect.left;
        } else if (align === "end") {
          left = triggerRect.right - tooltipRect.width;
        } else {
          left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        }
        break;

      case "bottom":
      default:
        top = triggerRect.bottom + offset;
        if (align === "start") {
          left = triggerRect.left;
        } else if (align === "end") {
          left = triggerRect.right - tooltipRect.width;
        } else {
          left = triggerRect.left + (triggerRect.width - tooltipRect.width) / 2;
        }
        break;
    }

    // Keep within window boundaries
    const maxLeft = window.innerWidth - tooltipRect.width - margin;
    const maxTop = window.innerHeight - tooltipRect.height - margin;

    left = Math.max(margin, Math.min(left, maxLeft));
    top = Math.max(margin, Math.min(top, maxTop));

    setCoords({ top, left });
  }, [side, align]);

  const handleMouseEnter = useCallback(() => {
    if (disabled || !content) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      setIsOpen(true);
    }, delay);
  }, [clearTimer, content, delay, disabled]);

  const handleMouseLeave = useCallback(() => {
    clearTimer();
    setIsOpen(false);
  }, [clearTimer]);

  useEffect(() => {
    if (disabled) {
      clearTimer();
      setIsOpen(false);
    }
  }, [disabled, clearTimer]);

  useEffect(() => {
    if (isOpen) {
      calculatePosition();
      // Recalculate on window resize or scroll
      window.addEventListener("resize", calculatePosition);
      window.addEventListener("scroll", calculatePosition, true);
      return () => {
        window.removeEventListener("resize", calculatePosition);
        window.removeEventListener("scroll", calculatePosition, true);
      };
    }
  }, [isOpen, calculatePosition]);

  useEffect(() => {
    return () => clearTimer();
  }, [clearTimer]);

  // Clone single React element child to intercept mouse handlers without adding extra wrapper DOM nodes
  let triggerElement = children;
  if (React.isValidElement(children)) {
    triggerElement = React.cloneElement(children, {
      ref: (node) => {
        triggerRef.current = node;
        const { ref } = children;
        if (typeof ref === "function") ref(node);
        else if (ref && typeof ref === "object") ref.current = node;
      },
      onMouseEnter: (e) => {
        children.props?.onMouseEnter?.(e);
        handleMouseEnter();
      },
      onMouseLeave: (e) => {
        children.props?.onMouseLeave?.(e);
        handleMouseLeave();
      },
      onPointerDown: (e) => {
        children.props?.onPointerDown?.(e);
        handleMouseLeave();
      },
    });
  } else {
    triggerElement = (
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerDown={handleMouseLeave}
        className="inline-flex"
      >
        {children}
      </span>
    );
  }

  return (
    <>
      {triggerElement}
      {isOpen &&
        !disabled &&
        Boolean(content) &&
        createPortal(
          <div
            ref={tooltipRef}
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              zIndex: "var(--z-tooltip, 80)",
              pointerEvents: "none",
            }}
            className={cn(
              "onicord-tooltip select-none px-2.5 py-1.5 text-xs font-semibold text-onicord-text",
              "bg-onicord-mantle/95 backdrop-blur-onicord-popover border border-onicord-island rounded-onicord-button shadow-2xl",
              "onicord-animate-popup-in max-w-xs break-words tracking-wide flex items-center gap-1.5",
              className
            )}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}
