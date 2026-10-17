import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { IconClose } from "../icons/StreamIcons";
import { soundEngine } from "../../lib/soundEngine";
import { useAnimatedMount } from "../../hooks/useAnimatedMount";
import { cn } from "../../lib/cn";
import Select from "../ui/Select";

export default function ScreenShareModal({ isOpen, onClose, onSelectSource }) {
  const { t } = useTranslation();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("screen"); // "screen" | "window"
  const [resolution, setResolution] = useState("1080");
  const [selectedSourceId, setSelectedSourceId] = useState(null);

  const { shouldRender, isAnimatingOut } = useAnimatedMount(isOpen, 140);

  useEffect(() => {
    if (isOpen) {
      soundEngine.playNav("open");
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (isAnimatingOut) return;
    soundEngine.playNav("close");
    onClose?.();
  }, [isAnimatingOut, onClose]);

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
    setSelectedSourceId(null);
    if (window.electronAPI?.getScreenSources) {
      window.electronAPI
        .getScreenSources()
        .then((res) => {
          const fetched = res || [];
          setSources(fetched);
          setLoading(false);
          // Auto-select first screen source
          const firstScreen = fetched.find((s) => s.id.startsWith("screen:")) || fetched[0];
          if (firstScreen) {
            setSelectedSourceId(firstScreen.id);
          }
        })
        .catch((err) => {
          console.error("Error cargando fuentes de video:", err);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [isOpen]);

  const screens = useMemo(() => sources.filter((s) => s.id.startsWith("screen:")), [sources]);
  const windows = useMemo(() => sources.filter((s) => s.id.startsWith("window:")), [sources]);
  const filteredSources = activeTab === "screen" ? screens : windows;

  const handleTabChange = (tab) => {
    soundEngine.playNav("select");
    setActiveTab(tab);
    const targetSources = tab === "screen" ? screens : windows;
    if (targetSources.length > 0) {
      const currentInTab = targetSources.find((s) => s.id === selectedSourceId);
      if (!currentInTab) {
        setSelectedSourceId(targetSources[0].id);
      }
    } else {
      setSelectedSourceId(null);
    }
  };

  const selectedSource = useMemo(() => {
    return sources.find((s) => s.id === selectedSourceId) || filteredSources[0] || null;
  }, [sources, selectedSourceId, filteredSources]);

  const handleConfirm = () => {
    if (!selectedSource) return;
    soundEngine.playNav("select");
    onSelectSource(selectedSource, resolution);
  };

  if (!shouldRender) return null;

  return createPortal(
    <div
      className={cn(
        "onicord-modal-backdrop",
        isAnimatingOut && "onicord-animate-backdrop-out"
      )}
      onClick={handleClose}
      role="presentation"
    >
      <div
        className={cn(
          "relative flex flex-col w-full max-w-[700px] h-[580px] max-h-[90vh] rounded-2xl bg-onicord-surface border border-onicord-island shadow-2xl overflow-hidden select-none onicord-animate-modal-in",
          isAnimatingOut && "onicord-animate-modal-out"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <header className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0 bg-onicord-surface">
          <div>
            <h3 className="text-lg font-bold text-onicord-text tracking-wide">
              {t("screenShare.title", "Compartir pantalla")}
            </h3>
            <p className="text-xs text-onicord-muted mt-0.5">
              {t("screenShare.subtitle", "Elegí qué monitor o aplicación querés transmitir en la sala")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="onicord-icon-btn shrink-0"
            title={t("common.close", "Cerrar")}
          >
            <IconClose size="base" />
          </button>
        </header>

        {/* CONTROLS BAR: SERVER STORAGE STYLE FILTER PILLS + QUALITY SELECTOR */}
        <div className="flex items-center justify-between px-6 py-2.5 shrink-0 gap-3">
          {/* CATEGORY FILTER PILLS LIKE SERVER STORAGE TAB */}
          <div className="flex items-center gap-2">
            {[
              { id: "screen", label: t("screenShare.screens", "Pantallas"), count: screens.length },
              { id: "window", label: t("screenShare.windows", "Ventanas"), count: windows.length },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleTabChange(tab.id)}
                  className={cn(
                    "h-8 px-3 text-xs font-semibold rounded-lg border transition-all flex items-center gap-2 cursor-pointer select-none box-border",
                    isActive
                      ? "bg-onicord-accent text-onicord-dark border-onicord-accent font-bold shadow-sm"
                      : "bg-onicord-base/40 text-onicord-muted border-white/5 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none",
                      isActive
                        ? "bg-black/20 text-onicord-dark"
                        : "bg-white/5 text-onicord-muted"
                    )}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* QUALITY / RESOLUTION SELECTOR */}
          <Select
            id="stream-res"
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
            align="right"
            size="sm"
            options={[
              { value: "original", label: t("screenShare.native", "Original") },
              { value: "1080", label: "1080p" },
              { value: "720", label: "720p" },
              { value: "480", label: "480p" },
            ]}
          />
        </div>

        {/* SOURCES GRID AREA */}
        <div className="flex-1 min-h-0 overflow-y-auto minimal-scrollbar p-5 bg-onicord-base/40">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-onicord-muted py-12">
              <div className="w-9 h-9 border-[3px] border-white/10 border-t-onicord-accent rounded-full animate-spin" />
              <p className="text-xs font-medium">
                {t("screenShare.loadingSources", "Buscando pantallas y ventanas...")}
              </p>
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-onicord-muted py-12 text-center">
              <p className="text-sm font-semibold text-onicord-text">
                {t("screenShare.noSourcesFound", "No se encontraron fuentes disponibles")}
              </p>
              <p className="text-xs text-onicord-muted mt-0.5 max-w-sm">
                {t("screenShare.noSourcesDesc", "Asegúrate de que las ventanas no estén minimizadas.")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 animate-fade-in">
              {filteredSources.map((src) => {
                const isSelected = selectedSourceId === src.id;
                return (
                  <div
                    key={src.id}
                    onClick={() => {
                      soundEngine.playNav("select");
                      setSelectedSourceId(src.id);
                    }}
                    onDoubleClick={() => {
                      soundEngine.playNav("select");
                      onSelectSource(src, resolution);
                    }}
                    className={cn(
                      "group relative flex flex-col rounded-xl overflow-hidden border transition-all duration-150 cursor-pointer select-none",
                      isSelected
                        ? "bg-onicord-mantle border-onicord-accent shadow-[0_0_16px_rgba(var(--onicord-accent),0.25)] ring-2 ring-onicord-accent/80"
                        : "bg-onicord-mantle/70 border-white/5 hover:border-onicord-accent/40 hover:bg-onicord-mantle"
                    )}
                  >
                    {/* Preview Thumbnail */}
                    <div className="aspect-video w-full bg-black/90 relative flex items-center justify-center overflow-hidden border-b border-black/30">
                      {src.thumbnail ? (
                        <img
                          src={src.thumbnail}
                          alt={src.name}
                          className="w-full h-full object-contain group-hover:scale-[1.03] transition-transform duration-200"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-onicord-muted/30 text-xs">
                          {src.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}

                      {/* Selected check badge */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-onicord-accent text-onicord-dark flex items-center justify-center shadow-md animate-scale-up">
                          <svg
                            className="w-3.5 h-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      )}

                      {/* App Icon */}
                      {src.appIcon && (
                        <img
                          src={src.appIcon}
                          alt=""
                          className="absolute bottom-2 left-2 w-5 h-5 rounded bg-black/60 p-0.5 backdrop-blur-sm shadow"
                        />
                      )}
                    </div>

                    {/* Title */}
                    <div
                      className={cn(
                        "p-2.5 flex items-center justify-between gap-2 transition-colors",
                        isSelected
                          ? "bg-onicord-accent/10 text-onicord-accent"
                          : "text-onicord-text group-hover:bg-white/[0.03]"
                      )}
                    >
                      <span
                        className={cn(
                          "truncate text-xs font-medium leading-tight",
                          isSelected ? "font-semibold text-onicord-accent" : "text-onicord-text"
                        )}
                        title={src.name}
                      >
                        {src.name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* FOOTER */}
        <footer className="flex items-center justify-between px-6 py-3.5 shrink-0 bg-onicord-surface border-t border-white/5">
          <div className="min-w-0 flex-1 pr-4">
            {selectedSource ? (
              <p className="text-xs text-onicord-muted truncate flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-onicord-accent shrink-0" />
                <span className="truncate text-onicord-text font-medium">{selectedSource.name}</span>
              </p>
            ) : (
              <p className="text-xs text-onicord-muted/70">
                {t("screenShare.selectPrompt", "Selecciona una pantalla o ventana para comenzar")}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="onicord-btn-secondary"
            >
              {t("common.cancel", "Cancelar")}
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedSource}
              className="onicord-btn-primary"
            >
              {t("screenShare.shareBtn", "Transmitir")}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
