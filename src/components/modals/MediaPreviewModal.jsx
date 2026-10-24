import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import PdfViewer from "../viewers/PdfViewer";
import { getMediaUrl } from "../../lib/media";
import { cn } from "../../lib/cn";
import { useInternalClose } from "../../hooks/useAnimatedMount";

export default function MediaPreviewModal({
  isOpen,
  onClose,
  localPath,
  fileName,
  fileSize,
  isImage,
  isVideo,
  initialTime = 0,
  formatBytes,
  filesList = [],
  currentIndex = 0,
  onNavigate = null,
}) {
  const { t } = useTranslation();
  const { isClosing, triggerClose } = useInternalClose(onClose, 140);
  const [textContent, setTextContent] = useState(null);
  const [audioCover, setAudioCover] = useState(null);

  // If a filesList is provided, derive current active item from list
  const activeItem = filesList.length > 0 && filesList[currentIndex] ? filesList[currentIndex] : null;
  const currentPath = activeItem?.localPath || localPath;
  const currentName = activeItem?.name || fileName;
  const currentSize = activeItem?.size || fileSize;

  const ext = currentName ? currentName.slice(currentName.lastIndexOf(".")).toLowerCase() : "";
  const isImg = isImage || (activeItem?.type === "image") || [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(ext);
  const isVid = isVideo || (activeItem?.type === "video") || [".mp4", ".webm", ".mkv", ".mov", ".avi"].includes(ext);
  const isAud = (activeItem?.type === "audio") || [".mp3", ".wav", ".ogg", ".m4a", ".flac"].includes(ext);
  const isTxt = (activeItem?.type === "text") || [".txt", ".log", ".js", ".json", ".css", ".md", ".html", ".py", ".ts", ".jsx", ".tsx"].includes(ext);
  const isPdf = (activeItem?.type === "pdf") || ext === ".pdf";

  const formatMediaUrl = (pathStr) => getMediaUrl(pathStr);

  useEffect(() => {
    let isMounted = true;
    if (isOpen && isAud && currentPath && window.electronAPI?.getAudioCover) {
      window.electronAPI.getAudioCover(currentPath).then((coverDataUrl) => {
        if (isMounted) {
          setAudioCover(coverDataUrl);
        }
      });
    } else {
      setAudioCover(null);
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, isAud, currentPath]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        triggerClose();
      } else if (e.key === "ArrowLeft" && onNavigate && currentIndex > 0) {
        onNavigate(currentIndex - 1);
      } else if (e.key === "ArrowRight" && onNavigate && currentIndex < filesList.length - 1) {
        onNavigate(currentIndex + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, triggerClose, onNavigate, currentIndex, filesList.length]);

  useEffect(() => {
    if (isOpen && isTxt && currentPath) {
      const url = formatMediaUrl(currentPath);
      fetch(url)
        .then((res) => res.text())
        .then((data) => setTextContent(data))
        .catch(() => setTextContent(t("common.errorLoadingText", "No se pudo cargar el archivo de texto.")));
    } else {
      setTextContent(null);
    }
  }, [isOpen, isTxt, currentPath, t]);

  if (!isOpen || !currentPath) return null;

  return createPortal(
    <div
      className={cn(
        "onicord-modal-backdrop fixed inset-0 z-[999999] select-none pointer-events-auto bg-onicord-mantle/90 backdrop-blur-md flex items-center justify-center p-4",
        isClosing && "onicord-animate-backdrop-out"
      )}
      onClick={triggerClose}
    >
      {/* Top right close button */}
      <button
        type="button"
        className="onicord-icon-btn absolute top-4 right-4 h-10 w-10 rounded-full border border-onicord-island text-lg font-bold onicord-icon-btn-danger z-[999999] shadow-2xl cursor-pointer"
        onClick={triggerClose}
        title={t("common.close", "Cerrar (Esc)")}
      >
        ✕
      </button>

      {/* Counter Badge if list has multiple files */}
      {filesList.length > 1 && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/60 border border-white/10 text-xs font-mono font-bold text-white backdrop-blur-md z-[999999] shadow-lg">
          {currentIndex + 1} / {filesList.length}
        </div>
      )}

      {/* Left Navigation Arrow */}
      {onNavigate && currentIndex > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(currentIndex - 1);
          }}
          className="absolute left-4 sm:left-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 hover:bg-onicord-accent hover:text-onicord-mantle text-white border border-white/20 flex items-center justify-center backdrop-blur-md shadow-2xl transition-all duration-150 active:scale-95 cursor-pointer z-[999999] group"
          title={t("common.previous", "Anterior (←)")}
        >
          <MaterialIcon name="chevron_left" size="lg" />
        </button>
      )}

      {/* Right Navigation Arrow */}
      {onNavigate && currentIndex < filesList.length - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(currentIndex + 1);
          }}
          className="absolute right-4 sm:right-8 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 hover:bg-onicord-accent hover:text-onicord-mantle text-white border border-white/20 flex items-center justify-center backdrop-blur-md shadow-2xl transition-all duration-150 active:scale-95 cursor-pointer z-[999999] group"
          title={t("common.next", "Siguiente (→)")}
        >
          <MaterialIcon name="chevron_right" size="lg" />
        </button>
      )}

      {/* Preview Card */}
      <div
        className={cn(
          "onicord-media-preview-card max-w-5xl w-full flex flex-col items-center select-none z-[999998]",
          isClosing && "onicord-animate-modal-out"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {isImg && (
          <img
            src={formatMediaUrl(currentPath)}
            alt={currentName}
            className="max-w-full max-h-[82vh] object-contain rounded shadow-lg select-text"
          />
        )}

        {isVid && (
          <NativeVideoPlayer
            key={currentPath}
            src={formatMediaUrl(currentPath)}
            initialTime={activeItem?.initialTime || initialTime || 0}
          />
        )}

        {isAud && (
          <NativeAudioPlayer
            key={currentPath}
            src={formatMediaUrl(currentPath)}
            fileName={currentName}
            fileSize={currentSize}
            audioCover={audioCover}
            formatBytes={formatBytes}
          />
        )}

        {isPdf && (
          <PdfViewer key={currentPath} filePath={currentPath} />
        )}

        {isTxt && (
          <div className="w-full max-h-[60vh] bg-onicord-mantle p-4 rounded-xl border border-onicord-island overflow-auto font-mono text-xs text-onicord-text select-text whitespace-pre-wrap leading-relaxed shadow-inner">
            {textContent !== null
              ? textContent
              : t("common.loading", "Cargando contenido...")}
          </div>
        )}

        {!isImg && !isVid && !isAud && !isPdf && !isTxt && (
          <div className="flex flex-col items-center justify-center p-8 bg-onicord-mantle rounded-2xl border border-onicord-island gap-3">
            <MaterialIcon name="insert_drive_file" size="xl" className="text-onicord-muted" />
            <p className="text-sm font-semibold text-onicord-text">{currentName}</p>
          </div>
        )}

        <div className="mt-4 w-full flex items-center justify-between border-t border-white/10 pt-3 select-none gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-onicord-text truncate">
              {currentName}
            </p>
            <p className="text-xs text-onicord-muted mt-0.5">
              {formatBytes ? formatBytes(currentSize) : `${currentSize} bytes`} — {t("chat.storedLocally", "Almacenado localmente")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (window.electronAPI?.showItemInFolder) {
                window.electronAPI.showItemInFolder(currentPath);
              } else {
                console.warn("showItemInFolder is not defined");
              }
            }}
            className="onicord-btn-secondary px-3 py-1.5 text-xs shrink-0 border border-onicord-island hover:bg-onicord-accent hover:text-onicord-mantle rounded-full flex items-center gap-1.5 transition-all duration-150"
          >
            <MaterialIcon name="folder_open" size="sm" />
            <span>{t("chat.openLocation", "Abrir carpeta")}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function NativeVideoPlayer({ src, initialTime = 0 }) {
  const videoRef = useRef(null);

  const logDiag = (level, msg) => {
    console.log(`[OniDiag][VIDEO] ${msg}`);
    if (window.electronAPI?.diagLog) {
      window.electronAPI.diagLog(level, "UI-Console", `[OniDiag][VIDEO] ${msg}`);
    }
  };

  useEffect(() => {
    logDiag("info", `Video player mounted. src=${src}, initialTime=${initialTime}`);
    if (initialTime > 0 && videoRef.current) {
      const vid = videoRef.current;
      const applyTime = () => {
        try {
          if (initialTime > 0) {
            vid.currentTime = initialTime;
            logDiag("info", `Applied initialTime ${initialTime} to video`);
          }
        } catch (e) {
          logDiag("error", `Error applying initialTime: ${e.message}`);
        }
      };
      if (vid.readyState >= 1) {
        applyTime();
      } else {
        vid.addEventListener("loadedmetadata", applyTime, { once: true });
        vid.addEventListener("canplay", applyTime, { once: true });
      }
    }
  }, [initialTime, src]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const handleFSChange = () => {
      const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
      logDiag("info", `fullscreenchange event fired: isFS=${isFS}`);
    };

    const handleFSError = (err) => {
      logDiag("error", `fullscreenerror event fired: ${err?.message || "Rejected by browser/policy"}`);
    };

    vid.addEventListener("fullscreenchange", handleFSChange);
    vid.addEventListener("fullscreenerror", handleFSError);
    vid.addEventListener("webkitfullscreenchange", handleFSChange);
    vid.addEventListener("webkitfullscreenerror", handleFSError);
    document.addEventListener("fullscreenchange", handleFSChange);
    document.addEventListener("fullscreenerror", handleFSError);

    return () => {
      vid.removeEventListener("fullscreenchange", handleFSChange);
      vid.removeEventListener("fullscreenerror", handleFSError);
      vid.removeEventListener("webkitfullscreenchange", handleFSChange);
      vid.removeEventListener("webkitfullscreenerror", handleFSError);
      document.removeEventListener("fullscreenchange", handleFSChange);
      document.removeEventListener("fullscreenerror", handleFSError);
    };
  }, []);

  const handleDoubleClick = async () => {
    logDiag("info", "Double click triggered on video element");
    const vid = videoRef.current;
    if (!vid) return;

    if (document.fullscreenElement || document.webkitFullscreenElement) {
      logDiag("info", "Attempting exitFullscreen()");
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      } catch (e) {
        logDiag("error", `exitFullscreen failed: ${e.message}`);
      }
    } else {
      logDiag("info", "Attempting requestFullscreen()");
      try {
        if (vid.requestFullscreen) {
          await vid.requestFullscreen();
          logDiag("info", "requestFullscreen() Promise resolved successfully!");
        } else if (vid.webkitEnterFullscreen) {
          vid.webkitEnterFullscreen();
          logDiag("info", "webkitEnterFullscreen() executed!");
        }
      } catch (e) {
        logDiag("error", `requestFullscreen failed: ${e.message}`);
        try {
          if (vid.webkitEnterFullscreen) {
            vid.webkitEnterFullscreen();
            logDiag("info", "Fallback webkitEnterFullscreen() executed!");
          }
        } catch (err2) {
          logDiag("error", `Fallback webkitEnterFullscreen failed: ${err2.message}`);
        }
      }
    }
  };

  return (
    <video
      ref={videoRef}
      key={src}
      src={src}
      controls
      autoPlay
      onDoubleClick={handleDoubleClick}
      onPlay={() => logDiag("info", "Video playing")}
      onPause={() => logDiag("info", "Video paused")}
      className="w-full max-w-5xl max-h-[82vh] object-contain rounded-2xl shadow-xl bg-black border border-white/10"
    />
  );
}

function NativeAudioPlayer({ src, fileName, fileSize, audioCover, formatBytes }) {
  return (
    <div className="flex flex-col items-center justify-center p-6 bg-onicord-mantle/95 rounded-2xl border border-onicord-island w-full max-w-md gap-4 shadow-2xl backdrop-blur-xl animate-fade-in">
      {audioCover ? (
        <div className="relative group w-48 h-48 sm:w-56 sm:h-56 rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center bg-black/40">
          <img
            src={audioCover}
            alt={fileName}
            className="w-full h-full object-cover rounded-2xl animate-fade-in transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      ) : (
        <div className="w-20 h-20 rounded-full bg-onicord-accent/20 border border-onicord-accent/40 flex items-center justify-center text-onicord-accent shadow-inner">
          <MaterialIcon name="audiotrack" size="xl" />
        </div>
      )}
      <div className="w-full text-center px-2">
        <h4 className="text-sm font-bold text-white truncate max-w-full" title={fileName}>
          {fileName}
        </h4>
        {fileSize > 0 && (
          <p className="text-[11px] text-onicord-muted font-mono mt-0.5">
            {formatBytes ? formatBytes(fileSize) : ""}
          </p>
        )}
      </div>
      <audio
        key={src}
        src={src}
        controls
        autoPlay
        className="w-full"
      />
    </div>
  );
}
