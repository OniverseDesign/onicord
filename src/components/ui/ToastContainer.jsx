import { useState, useEffect } from "react";
import {
  IconToastSuccess,
  IconToastError,
  IconToastWarning,
  IconToastInfo,
} from "../icons/StreamIcons";
import MaterialIcon from "../icons/MaterialIcon";
import SmartAnimatedImage from "./SmartAnimatedImage";
import { soundEngine } from "../../lib/soundEngine";

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleToast = (e) => {
      const { id, title, message, type, duration, action, avatar, senderName } =
        e.detail || {};

      setToasts((prev) => [
        ...prev,
        {
          id,
          title,
          message,
          type: type || "info",
          action: action || null,
          avatar: avatar || null,
          senderName: senderName || null,
        },
      ]);

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration || 7500);
    };

    window.addEventListener("onicord:toast", handleToast);
    return () => window.removeEventListener("onicord:toast", handleToast);
  }, []);

  const handleDismiss = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleToastClick = (toast) => {
    if (!toast.action) return;

    soundEngine.playNav("select");

    if (typeof toast.action === "function") {
      try {
        toast.action();
      } catch (err) {
        console.error("[ToastContainer] Error executing toast action callback:", err);
      }
    } else if (typeof toast.action === "object" && toast.action !== null) {
      const { type } = toast.action;
      switch (type) {
        case "navigate_channel":
          window.dispatchEvent(
            new CustomEvent("onicord:navigate", {
              detail: {
                roomCode: toast.action.roomCode,
                channelId: toast.action.channelId,
                serverId: toast.action.serverId,
              },
            })
          );
          window.electronAPI?.focusWindow?.();
          break;

        case "open_settings":
        case "open_app_settings":
          window.dispatchEvent(
            new CustomEvent("onicord:open-app-settings", {
              detail: {
                section: toast.action.section || "about",
              },
            })
          );
          window.electronAPI?.focusWindow?.();
          break;

        case "custom_event":
          if (toast.action.eventName) {
            window.dispatchEvent(
              new CustomEvent(toast.action.eventName, {
                detail: toast.action.detail,
              })
            );
          }
          break;

        case "open_url":
          if (toast.action.url) {
            if (window.electronAPI?.openExternal) {
              window.electronAPI.openExternal(toast.action.url);
            } else {
              window.open(toast.action.url, "_blank", "noopener,noreferrer");
            }
          }
          break;

        default:
          console.warn("[ToastContainer] Unknown toast action type:", type);
          break;
      }
    }

    handleDismiss(toast.id);
  };

  if (toasts.length === 0) return null;

  const getTypeStyles = (type, isClickable) => {
    switch (type) {
      case "success":
        return {
          border: "border-onicord-success/80 shadow-md",
          iconBg: "bg-onicord-success/20 text-onicord-success",
          actionHover: isClickable ? "hover:border-onicord-success" : "",
        };
      case "danger":
      case "error":
        return {
          border: "border-onicord-danger/80 shadow-md",
          iconBg: "bg-onicord-danger/20 text-onicord-danger",
          actionHover: isClickable ? "hover:border-onicord-danger" : "",
        };
      case "warning":
        return {
          border: "border-amber-500/80 shadow-[0_0_20px_rgba(245,158,11,0.2)]",
          iconBg: "bg-amber-500/20 text-amber-400",
          actionHover: isClickable ? "hover:border-amber-400" : "",
        };
      case "info":
      default:
        return {
          border: "border-onicord-accent/80 shadow-[0_0_20px_rgb(var(--onicord-lavender)/0.25)]",
          iconBg: "bg-onicord-accent/20 text-onicord-accent",
          actionHover: isClickable ? "hover:border-onicord-accent" : "",
        };
    }
  };

  return (
    <div
      className="fixed bottom-6 right-6 flex flex-col gap-3 pointer-events-none select-none"
      style={{ zIndex: 999999999 }}
    >
      {toasts.map((toast) => {
        const isClickable = Boolean(toast.action);
        const styles = getTypeStyles(toast.type, isClickable);

        return (
          <div
            key={toast.id}
            role={isClickable ? "button" : "status"}
            tabIndex={isClickable ? 0 : -1}
            onClick={() => isClickable && handleToastClick(toast)}
            onKeyDown={(e) => {
              if (isClickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                handleToastClick(toast);
              }
            }}
            className={`group bg-onicord-mantle border rounded-onicord-inner p-3.5 min-w-[320px] max-w-[420px] pointer-events-auto animate-scale-up flex items-center justify-between gap-3.5 transition-all shadow-xl ${
              styles.border
            } ${
              isClickable
                ? `cursor-pointer hover:brightness-110 hover:-translate-y-0.5 active:scale-[0.98] ${styles.actionHover}`
                : ""
            }`}
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {toast.avatar ? (
                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 shadow-sm border border-white/10 flex items-center justify-center bg-onicord-surface">
                  <SmartAnimatedImage
                    src={toast.avatar}
                    alt={toast.senderName || ""}
                    className="w-full h-full object-cover rounded-full"
                    isAvatar={true}
                  />
                </div>
              ) : toast.senderName && toast.action?.type === "navigate_channel" ? (
                <div className="w-8 h-8 rounded-full shrink-0 shadow-sm flex items-center justify-center bg-onicord-accent text-white font-bold text-xs select-none">
                  {(toast.senderName || "?").charAt(0).toUpperCase()}
                </div>
              ) : (
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${styles.iconBg}`}
                >
                  {toast.type === "success" && <IconToastSuccess size="base" />}
                  {(toast.type === "danger" || toast.type === "error") && (
                    <IconToastError size="base" />
                  )}
                  {toast.type === "warning" && <IconToastWarning size="base" />}
                  {toast.type === "info" && <IconToastInfo size="base" />}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-onicord-text truncate leading-tight">
                  {toast.title}
                </h4>
                {toast.message && (
                  <p className="text-xs text-onicord-text line-clamp-2 leading-relaxed mt-0.5 font-medium opacity-90">
                    {toast.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isClickable && (
                <div
                  className="text-onicord-muted/60 group-hover:text-onicord-accent group-hover:translate-x-0.5 transition-all flex items-center justify-center"
                  title="Abrir"
                >
                  <MaterialIcon icon="chevron_right" size={20} />
                </div>
              )}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDismiss(toast.id);
                }}
                className="text-onicord-muted hover:text-onicord-text text-xs p-1 rounded-md hover:bg-white/10 transition cursor-pointer"
                aria-label="Cerrar notificación"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

