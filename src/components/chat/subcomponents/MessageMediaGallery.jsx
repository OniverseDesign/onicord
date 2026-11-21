import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import { getMediaUrl } from "../../../lib/media";

export function isImageFile(fileName = "") {
  const ext = fileName.includes(".")
    ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase()
    : "";
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"].includes(ext);
}

export default function MessageMediaGallery({
  images = [],
  msg,
  isMyMessage,
  profile = null,
  fileProgress = {},
  onDownloadFile = () => {},
  onOpenPreview = () => {},
  className = "",
}) {
  const { t } = useTranslation();
  const [resolvedPaths, setResolvedPaths] = useState({});
  const [revealedIds, setRevealedIds] = useState(() => new Set());
  const requestedIdsRef = useRef(new Set());
  const autoBlurNsfw = profile?.general?.blurNsfwContent ?? true;

  const revealImage = useCallback((id) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const hideImage = useCallback((id) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Resolve local paths for each image in the gallery in a parallel batch
  useEffect(() => {
    let isMounted = true;
    const toFetch = [];

    images.forEach((img) => {
      if (!img?.id || requestedIdsRef.current.has(img.id)) return;

      const progressEntry = fileProgress?.[img.id];
      if (progressEntry?.localPath) {
        requestedIdsRef.current.add(img.id);
        setResolvedPaths((prev) => ({ ...prev, [img.id]: progressEntry.localPath }));
        return;
      }

      toFetch.push(img);
    });

    if (toFetch.length === 0) return;

    // Fetch paths in parallel
    Promise.all(
      toFetch.map(async (img) => {
        try {
          let diskPath = null;
          if (isMyMessage && window.electronAPI?.fetchUploadedLocalPath) {
            diskPath = await window.electronAPI.fetchUploadedLocalPath(msg?.roomCode, img.id);
          } else if (window.electronAPI?.fetchMediaLocalPath) {
            diskPath = await window.electronAPI.fetchMediaLocalPath(img.id, msg?.roomCode);
          }
          if (diskPath) {
            requestedIdsRef.current.add(img.id);
            return { id: img.id, path: diskPath };
          }
        } catch {}
        return null;
      })
    ).then((results) => {
      if (!isMounted) return;
      const updates = {};
      results.forEach((r) => {
        if (r) updates[r.id] = r.path;
      });
      if (Object.keys(updates).length > 0) {
        setResolvedPaths((prev) => ({ ...prev, ...updates }));
      }
    });

    return () => {
      isMounted = false;
    };
  }, [images, isMyMessage, msg?.roomCode, fileProgress]);

  // Map of resolved web/local URLs for <img>
  const resolvedUrls = useMemo(() => {
    const urls = {};
    images.forEach((img) => {
      if (!img?.id) return;
      const diskPath = resolvedPaths[img.id] || fileProgress?.[img.id]?.localPath;
      if (diskPath) {
        urls[img.id] = getMediaUrl(diskPath);
      }
    });
    return urls;
  }, [images, resolvedPaths, fileProgress]);

  // Build the complete filesList for MediaPreviewModal navigation
  const previewFilesList = useMemo(() => {
    return images.map((img) => ({
      id: img.id,
      name: img.name,
      size: img.size,
      localPath: resolvedPaths[img.id] || fileProgress?.[img.id]?.localPath || null,
      type: "image",
    }));
  }, [images, resolvedPaths, fileProgress]);

  const handleImageClick = useCallback(
    (index) => {
      const targetImg = images[index];
      if (!targetImg) return;

      const diskPath = resolvedPaths[targetImg.id] || fileProgress?.[targetImg.id]?.localPath;

      if (!diskPath) {
        // If not downloaded yet, trigger download
        onDownloadFile(targetImg.id, targetImg.name, targetImg.size);
        return;
      }

      onOpenPreview({
        localPath: diskPath,
        fileName: targetImg.name,
        fileSize: targetImg.size,
        isImage: true,
        isVideo: false,
        filesList: previewFilesList,
        currentIndex: index,
      });
    },
    [images, resolvedPaths, fileProgress, previewFilesList, onDownloadFile, onOpenPreview]
  );

  const renderTileContent = (img, index, hasOverlay = false, remainingCount = 0) => {
    const diskPath = resolvedPaths[img.id] || fileProgress?.[img.id]?.localPath;
    const url = resolvedUrls[img.id];
    const status = fileProgress?.[img.id];
    const isDownloading = status && !status.done && status.error === undefined;
    const isNsfw = Boolean(img?.isNsfw);
    const isBlurred = isNsfw && autoBlurNsfw && !revealedIds.has(img.id);

    if (!diskPath || !url) {
      return (
        <div
          className="relative w-full h-full flex flex-col items-center justify-center p-3 text-center bg-black/40 text-onicord-muted select-none group/placeholder cursor-pointer"
          onClick={() => handleImageClick(index)}
        >
          {isNsfw && (
            <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-bold uppercase tracking-wider">
              {t("chat.nsfwBadge", "NSFW")}
            </span>
          )}
          <MaterialIcon name="image" size="md" className="text-white/40 mb-1" />
          <span className="text-[11px] truncate max-w-[90%] text-white/70 font-mono">
            {img.name || t("chat.imageLabel", "Imagen")}
          </span>
          {isDownloading ? (
            <div className="w-16 h-1.5 bg-onicord-tint/10 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-onicord-accent transition-all duration-150"
                style={{ width: `${status?.progress || 0}%` }}
              />
            </div>
          ) : (
            <span className="text-[10px] text-onicord-accent mt-1 hover:underline">
              {t("chat.clickToDownloadShort", "Clic para descargar")}
            </span>
          )}
        </div>
      );
    }

    return (
      <div
        className="relative w-full h-full cursor-pointer group/tile overflow-hidden bg-black/40"
        onClick={(e) => {
          if (isBlurred) {
            e.stopPropagation();
            revealImage(img.id);
            return;
          }
          handleImageClick(index);
        }}
      >
        <img
          src={url}
          alt={img.name || "Photo"}
          loading="lazy"
          decoding="async"
          className={`w-full h-full object-cover transition-all duration-200 ${
            isBlurred
              ? "blur-2xl scale-110 brightness-50 select-none pointer-events-none"
              : "group-hover/tile:scale-[1.02]"
          }`}
        />

        {isBlurred ? (
          <div className="absolute inset-0 flex items-center justify-center p-2 z-10 pointer-events-none">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-rose-500/40 text-rose-300 text-xs font-semibold shadow-lg select-none">
              <MaterialIcon name="visibility_off" size={15} className="text-rose-400" />
              <span className="font-bold uppercase tracking-wider text-rose-400">{t("chat.nsfwBadge", "NSFW")}</span>
            </div>
          </div>
        ) : (
          <>
            {isNsfw && (
              <div className="absolute top-2 left-2 z-20 flex items-center gap-1">
                {autoBlurNsfw ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      hideImage(img.id);
                    }}
                    title={t("chat.nsfwHideAgain", "Ocultar contenido NSFW")}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-onicord-base/85 backdrop-blur-md border border-rose-500/40 text-rose-400 hover:bg-rose-500/20 text-[10px] font-bold uppercase tracking-wider shadow transition-colors cursor-pointer"
                  >
                    <MaterialIcon name="visibility_off" size={12} />
                    <span>{t("chat.nsfwBadge", "NSFW")}</span>
                  </button>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-onicord-base/85 backdrop-blur-md border border-rose-500/40 text-rose-400 text-[10px] font-bold uppercase tracking-wider shadow">
                    {t("chat.nsfwBadge", "NSFW")}
                  </span>
                )}
              </div>
            )}
            {hasOverlay ? (
              <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px] flex items-center justify-center font-bold text-white text-2xl sm:text-3xl tracking-wide select-none group-hover/tile:bg-black/55 transition-colors">
                +{remainingCount}
              </div>
            ) : (
              <div className="absolute inset-0 bg-black/10 opacity-0 group-hover/tile:opacity-100 transition-opacity pointer-events-none" />
            )}
          </>
        )}
      </div>
    );
  };

  const total = images.length;
  if (total === 0) return null;

  // 1 Image
  if (total === 1) {
    const singleImg = images[0];
    const url = resolvedUrls[singleImg.id];
    const diskPath = resolvedPaths[singleImg.id] || fileProgress?.[singleImg.id]?.localPath;
    const isNsfw = Boolean(singleImg?.isNsfw);
    const isBlurred = isNsfw && autoBlurNsfw && !revealedIds.has(singleImg.id);

    if (!diskPath || !url) {
      return (
        <div className={`mt-2 max-w-sm rounded-xl overflow-hidden border border-onicord-border ${className}`}>
          {renderTileContent(singleImg, 0)}
        </div>
      );
    }

    return (
      <div
        className={`mt-2 relative rounded-xl overflow-hidden max-w-xl cursor-pointer group bg-black/20 border border-onicord-border hover:border-onicord-accent/40 transition-all duration-200 inline-block ${
          isBlurred ? "min-w-[220px] min-h-[140px]" : ""
        } ${className}`}
        onClick={(e) => {
          if (isBlurred) {
            e.stopPropagation();
            revealImage(singleImg.id);
            return;
          }
          handleImageClick(0);
        }}
      >
        <img
          src={url}
          alt={singleImg.name || "Photo"}
          loading="lazy"
          decoding="async"
          className={`w-auto h-auto max-w-full max-h-[380px] object-contain rounded-xl block animate-fade-in transition-all duration-200 ${
            isBlurred ? "blur-2xl scale-110 brightness-50 select-none pointer-events-none" : ""
          }`}
        />
        {isBlurred ? (
          <div className="absolute inset-0 flex items-center justify-center p-3 z-10 pointer-events-none">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/80 backdrop-blur-md border border-rose-500/40 text-rose-300 text-xs font-semibold select-none">
              <MaterialIcon name="visibility_off" size={16} className="text-rose-400" />
              <span className="font-bold uppercase tracking-wider text-rose-400">{t("chat.nsfwBadge", "NSFW")}</span>
            </div>
          </div>
        ) : (
          <>
            {isNsfw && (
              <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1">
                {autoBlurNsfw ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      hideImage(singleImg.id);
                    }}
                    title={t("chat.nsfwHideAgain", "Ocultar contenido NSFW")}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-onicord-base/85 backdrop-blur-md border border-rose-500/40 text-rose-400 hover:bg-rose-500/20 text-[10px] font-bold uppercase tracking-wider shadow transition-colors cursor-pointer"
                  >
                    <MaterialIcon name="visibility_off" size={12} />
                    <span>{t("chat.nsfwBadge", "NSFW")}</span>
                  </button>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-onicord-base/85 backdrop-blur-md border border-rose-500/40 text-rose-400 text-[10px] font-bold uppercase tracking-wider shadow">
                    {t("chat.nsfwBadge", "NSFW")}
                  </span>
                )}
              </div>
            )}
            <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </>
        )}
      </div>
    );
  }

  // 2 Images (2 equal columns)
  if (total === 2) {
    return (
      <div
        className={`mt-2 grid grid-cols-2 gap-1.5 rounded-xl overflow-hidden aspect-[16/9] max-h-[320px] max-w-2xl bg-black/20 border border-onicord-border ${className}`}
      >
        {renderTileContent(images[0], 0)}
        {renderTileContent(images[1], 1)}
      </div>
    );
  }

  // 3 Images (Matches User Reference 1: 1 large left, 2 stacked right)
  if (total === 3) {
    return (
      <div
        className={`mt-2 grid grid-cols-2 grid-rows-2 gap-1.5 rounded-xl overflow-hidden aspect-[16/10] max-h-[360px] max-w-2xl bg-black/20 border border-onicord-border ${className}`}
      >
        <div className="row-span-2 col-span-1 w-full h-full overflow-hidden">
          {renderTileContent(images[0], 0)}
        </div>
        <div className="row-span-1 col-span-1 w-full h-full overflow-hidden">
          {renderTileContent(images[1], 1)}
        </div>
        <div className="row-span-1 col-span-1 w-full h-full overflow-hidden">
          {renderTileContent(images[2], 2)}
        </div>
      </div>
    );
  }

  // 4 Images (2x2 equal grid)
  if (total === 4) {
    return (
      <div
        className={`mt-2 grid grid-cols-2 grid-rows-2 gap-1.5 rounded-xl overflow-hidden aspect-[16/10] max-h-[360px] max-w-2xl bg-black/20 border border-onicord-border ${className}`}
      >
        {images.slice(0, 4).map((img, idx) => (
          <div key={img.id || idx} className="w-full h-full overflow-hidden">
            {renderTileContent(img, idx)}
          </div>
        ))}
      </div>
    );
  }

  // 5+ Images (Matches User Reference 2: 1 large left, 2x2 on right with +N overlay on slot 5)
  const remainingCount = total - 5;
  return (
    <div
      className={`mt-2 grid grid-cols-2 gap-1.5 rounded-xl overflow-hidden aspect-[16/9] max-h-[380px] max-w-2xl bg-black/20 border border-onicord-border ${className}`}
    >
      {/* Left Column: 1 Large Image */}
      <div className="w-full h-full overflow-hidden">
        {renderTileContent(images[0], 0)}
      </div>

      {/* Right Column: 2x2 Subgrid */}
      <div className="grid grid-cols-2 grid-rows-2 gap-1.5 w-full h-full">
        {renderTileContent(images[1], 1)}
        {renderTileContent(images[2], 2)}
        {renderTileContent(images[3], 3)}
        {renderTileContent(images[4], 4, total > 5, remainingCount)}
      </div>
    </div>
  );
}
