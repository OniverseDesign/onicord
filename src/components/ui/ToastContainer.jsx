import { useState, useEffect } from "react";
import {
  IconToastSuccess,
  IconToastError,
  IconToastWarning,
  IconToastInfo,
} from "../icons/StreamIcons";

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const handleToast = (e) => {
      const { id, title, message, type, duration } = e.detail;

      setToasts((prev) => [...prev, { id, title, message, type: type || "info" }]);

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

  if (toasts.length === 0) return null;

  const getTypeStyles = (type) => {
    switch (type) {
      case "success":
        return {
          border: "border-onicord-success/80 shadow-md",
          iconBg: "bg-onicord-success/20 text-onicord-success",
        };
      case "danger":
      case "error":
        return {
          border: "border-onicord-danger/80 shadow-md",
          iconBg: "bg-onicord-danger/20 text-onicord-danger",
        };
      case "warning":
        return {
          border: "border-amber-500/80 shadow-[0_0_20px_rgba(245,158,11,0.2)]",
          iconBg: "bg-amber-500/20 text-amber-400",
        };
      case "info":
      default:
        return {
          border: "border-sky-500/80 shadow-[0_0_20px_rgba(56,189,248,0.2)]",
          iconBg: "bg-sky-500/20 text-sky-400",
        };
    }
  };

  return (
    <div
      className="fixed bottom-6 right-6 flex flex-col gap-3 pointer-events-none select-none"
      style={{ zIndex: 999999999 }}
    >
      {toasts.map((toast) => {
        const styles = getTypeStyles(toast.type);
        return (
          <div
            key={toast.id}
            className={`bg-onicord-mantle border rounded-onicord-inner p-3.5 min-w-[320px] max-w-[400px] pointer-events-auto animate-fade-in flex items-center justify-between gap-3.5 transition-all shadow-xl ${styles.border}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${styles.iconBg}`}>
                {toast.type === "success" && <IconToastSuccess size="base" />}
                {(toast.type === "danger" || toast.type === "error") && <IconToastError size="base" />}
                {toast.type === "warning" && <IconToastWarning size="base" />}
                {toast.type === "info" && <IconToastInfo size="base" />}
              </div>

              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold text-onicord-text truncate leading-tight">
                  {toast.title}
                </h4>
                {toast.message && (
                  <p className="text-xs text-onicord-text line-clamp-2 leading-relaxed mt-0.5 font-medium">
                    {toast.message}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleDismiss(toast.id)}
              className="text-onicord-muted hover:text-onicord-text text-xs p-1 rounded transition cursor-pointer"
              aria-label="Cerrar notificación"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
