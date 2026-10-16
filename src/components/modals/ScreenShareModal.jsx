import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { IconClose } from "../icons/StreamIcons";
import { soundEngine } from "../../lib/soundEngine";
import { useAnimatedMount, useInternalClose } from "../../hooks/useAnimatedMount";
import { cn } from "../../lib/cn";

export default function ScreenShareModal({ isOpen, onClose, onSelectSource }) {
  const { t } = useTranslation();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("screen"); 
  const [resolution, setResolution] = useState("720"); 

  const { shouldRender, isAnimatingOut } = useAnimatedMount(isOpen, 140);
  const { isClosing, triggerClose } = useInternalClose(onClose, 140);
  const isExiting = isClosing || isAnimatingOut;

  useEffect(() => {
    if (isOpen) {
      soundEngine.playNav("open");
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (isExiting) return;
    soundEngine.playNav("close");
    triggerClose();
  }, [isExiting, triggerClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    if (window.electronAPI?.getScreenSources) {
      window.electronAPI
        .getScreenSources()
        .then((res) => {
          setSources(res || []);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Error cargando fuentes de video:", err);
          setLoading(false);
        });
    }
  }, [isOpen]);

  if (!shouldRender) return null;

  const filteredSources = sources.filter((src) => {
    if (activeTab === "screen") return src.id.startsWith("screen:");
    return src.id.startsWith("window:");
  });

  return createPortal(
    <div
      className={cn(
        "onicord-modal-backdrop",
        isExiting && "onicord-animate-backdrop-out"
      )}
      onClick={handleClose}
      role="presentation"
    >
      <div
        className={cn(
          "onicord-modal-card-wide border border-white/5",
          isExiting && "onicord-animate-modal-out"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          className="onicord-icon-btn absolute right-5 top-5"
        >
          <IconClose size="base" />
        </button>

        <div className="pb-4">
          <div>
            <h3 className="text-xl font-bold text-onicord-text tracking-wide">
              {t("screenShare.title")}
            </h3>
            <p className="mt-1.5 text-[15px] text-onicord-muted leading-normal">
              {t("screenShare.subtitle")}
            </p>
          </div>
        </div>

        {}
        <div className="flex items-center justify-between border-y border-white/5 py-3">
          <div className="flex gap-4 text-sm font-medium">
            <button
              onClick={() => setActiveTab("screen")}
              className={`onicord-tab-item ${activeTab === "screen" ? "onicord-tab-item-active" : ""}`}
            >
              {t("screenShare.screens")}
              {activeTab === "screen" && (
                <div className="onicord-tab-indicator" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("window")}
              className={`onicord-tab-item ${activeTab === "window" ? "onicord-tab-item-active" : ""}`}
            >
              {t("screenShare.windows")}
              {activeTab === "window" && (
                <div className="onicord-tab-indicator" />
              )}
            </button>
          </div>

          {}
          <div className="flex items-center gap-2 pb-2">
            <label
              htmlFor="stream-res"
              className="text-[11px] font-bold uppercase tracking-wider text-onicord-muted"
            >
              {t("screenShare.quality")}
            </label>
            <select
              id="stream-res"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="onicord-select text-xs py-1 px-2"
            >
              <option value="original">{t("screenShare.native")}</option>
              <option value="1080">1080p (FHD)</option>
              <option value="720">720p (HD)</option>
              <option value="480">480p (SD)</option>
            </select>
          </div>
        </div>

        {}
        {}
        {}
        <div className="flex-1 overflow-y-auto minimal-scrollbar p-2 flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center min-h-[200px]">
              <div className="w-8 h-8 border-[3px] border-white/10 border-t-onicord-accent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-2 animate-fade-in">
              {filteredSources.map((src) => (
                <div
                  key={src.id}
                  onClick={() => {
                    soundEngine.playNav("select");
                    onSelectSource(src, resolution);
                  }}

                  className="onicord-grid-item-interactive group cursor-pointer"
                >
                  <div className="aspect-video w-full bg-black relative flex items-center justify-center overflow-hidden border-b border-black/20">
                    <img
                      src={src.thumbnail}
                      alt=""
                      className="max-h-full max-w-full object-contain group-hover:scale-[1.02] transition duration-200"
                    />
                    {src.appIcon && (
                      <img
                        src={src.appIcon}
                        alt=""
                        className="absolute bottom-1.5 left-1.5 w-4 h-4 rounded bg-black/40 p-0.5"
                      />
                    )}
                  </div>
                  <div className="p-2 truncate text-[11px] font-medium text-onicord-text group-hover:bg-white/5 transition">
                    {src.name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {}
        <div className="pt-6 flex items-center justify-end gap-6">
          <button onClick={handleClose} className="onicord-btn-text">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
