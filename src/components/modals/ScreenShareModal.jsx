import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { IconClose } from "../icons/StreamIcons";
import MaterialIcon from "../icons/MaterialIcon";
import { soundEngine } from "../../lib/soundEngine";
import { useAnimatedMount, useInternalClose } from "../../hooks/useAnimatedMount";
import { cn } from "../../lib/cn";

export default function ScreenShareModal({ isOpen, onClose, onSelectSource }) {
  const { t } = useTranslation();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("screen"); // "screen" | "window"
  const [resolution, setResolution] = useState("720");
  const [selectedSourceId, setSelectedSourceId] = useState(null);

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
        isExiting && "onicord-animate-backdrop-out"
      )}
      onClick={handleClose}
      role="presentation"
    >
      <div
        className={cn(
          "relative flex flex-col w-full max-w-[700px] h-[580px] max-h-[90vh] rounded-2xl bg-onicord-surface border border-onicord-island shadow-2xl overflow-hidden select-none onicord-animate-modal-in",
          isExiting && "onicord-animate-modal-out"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <header className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0 border-b border-white/5 bg-onicord-surface">
          <div>
            <h3 className="text-lg font-bold text-onicord-text tracking-wide flex items-center gap-2">
              <MaterialIcon name="screen_share" size={22} className="text-onicord-accent" />
              <span>{t("screenShare.title", "Compartir pantalla")}</span>
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

        {/* CONTROLS BAR: SEGMENTED PILLS TABS + QUALITY SELECTOR */}
        <div className="flex items-center justify-between px-6 py-2.5 shrink-0 bg-onicord-mantle/60 border-b border-white/5 gap-3">
          {/* SEGMENTED TAB BUTTONS WITH PILL CONTAINER */}
          <div className="flex items-center gap-1.5 p-1 bg-onicord-mantle rounded-xl border border-white/5">
            <button
              type="button"
              onClick={() => handleTabChange("screen")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer select-none",
                activeTab === "screen"
                  ? "bg-onicord-surface text-onicord-accent shadow-sm border border-white/10"
                  : "text-onicord-muted hover:text-onicord-text hover:bg-white/[0.04]"
              )}
            >
              <MaterialIcon name="desktop_windows" size="sm" />
              <span>{t("screenShare.screens", "Pantallas")}</span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-0.5 leading-none",
                  activeTab === "screen"
                    ? "bg-onicord-accent/20 text-onicord-accent"
                    : "bg-white/5 text-onicord-muted"
                )}
              >
                {screens.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleTabChange("window")}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 cursor-pointer select-none",
                activeTab === "window"
                  ? "bg-onicord-surface text-onicord-accent shadow-sm border border-white/10"
                  : "text-onicord-muted hover:text-onicord-text hover:bg-white/[0.04]"
              )}
            >
              <MaterialIcon name="window" size="sm" />
              <span>{t("screenShare.windows", "Ventanas")}</span>
              <span
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-0.5 leading-none",
                  activeTab === "window"
                    ? "bg-onicord-accent/20 text-onicord-accent"
                    : "bg-white/5 text-onicord-muted"
                )}
              >
                {windows.length}
              </span>
            </button>
          </div>

          {/* QUALITY / RESOLUTION SELECTOR */}
          <div className="flex items-center gap-2 bg-onicord-mantle/80 px-3 py-1.5 rounded-xl border border-white/5 shrink-0">
            <label
              htmlFor="stream-res"
              className="text-[11px] font-semibold text-onicord-muted flex items-center gap-1.5 select-none shrink-0"
            >
              <MaterialIcon name="tune" size="sm" className="text-onicord-accent" />
              <span>{t("screenShare.quality", "Calidad:")}</span>
            </label>
            <select
              id="stream-res"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
              className="bg-transparent text-xs font-semibold text-onicord-text focus:outline-none cursor-pointer pr-1"
            >
              <option value="original" className="bg-onicord-mantle text-onicord-text">
                {t("screenShare.native", "Original (Nativa)")}
              </option>
              <option value="1080" className="bg-onicord-mantle text-onicord-text">
                1080p (FHD)
              </option>
              <option value="720" className="bg-onicord-mantle text-onicord-text">
                720p (HD)
              </option>
              <option value="480" className="bg-onicord-mantle text-onicord-text">
                480p (SD)
              </option>
            </select>
          </div>
        </div>

        {/* SOURCES GRID AREA (STABLE SCROLL CONTAINER WITH FIXED HEIGHT) */}
        <div className="flex-1 min-h-0 overflow-y-auto minimal-scrollbar p-5 bg-onicord-base/40">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-onicord-muted py-12">
              <div className="w-9 h-9 border-[3px] border-white/10 border-t-onicord-accent rounded-full animate-spin" />
              <p className="text-xs font-medium">
                {t("screenShare.loadingSources", "Buscando pantallas y ventanas...")}
              </p>
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-onicord-muted py-12 text-center">
              <MaterialIcon name="desktop_access_disabled" size={40} className="opacity-30" />
              <div>
                <p className="text-sm font-semibold text-onicord-text">
                  {t("screenShare.noSourcesFound", "No se encontraron fuentes disponibles")}
                </p>
                <p className="text-xs text-onicord-muted mt-1 max-w-sm">
                  {t("screenShare.noSourcesDesc", "Asegúrate de que las ventanas no estén minimizadas.")}
                </p>
              </div>
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
                        <MaterialIcon name="screen_share" size="lg" className="text-onicord-muted/30" />
                      )}

                      {/* Selected check badge */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-onicord-accent text-onicord-dark flex items-center justify-center shadow-md animate-scale-up">
                          <MaterialIcon name="check" size={14} weight={700} />
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
              <p className="text-xs text-onicord-muted truncate flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-onicord-accent shrink-0" />
                <span className="truncate">{selectedSource.name}</span>
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
              className="onicord-btn-primary flex items-center gap-2"
            >
              <MaterialIcon name="cast" size="sm" />
              <span>{t("screenShare.shareBtn", "Transmitir")}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body
  );
}
