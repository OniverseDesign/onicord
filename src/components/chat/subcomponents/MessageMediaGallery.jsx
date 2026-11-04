import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
  fileProgress = {},
  onDownloadFile = () => {},
  onOpenPreview = () => {},
  className = "",
}) {
  const [resolvedPaths, setResolvedPaths] = useState({});
  const requestedIdsRef = useRef(new Set());

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

    if (!diskPath || !url) {
      return (
        <div
          className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-black/40 text-onicord-muted select-none group/placeholder"
          onClick={() => handleImageClick(index)}
        >
          <MaterialIcon name="image" size="md" className="text-white/40 mb-1" />
          <span className="text-[11px] truncate max-w-[90%] text-white/70 font-mono">
            {img.name || "Imagen"}
          </span>
          {isDownloading ? (
            <div className="w-16 h-1.5 bg-white/10 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-onicord-accent transition-all duration-150"
                style={{ width: `${status?.progress || 0}%` }}
              />
            </div>
          ) : (
            <span className="text-[10px] text-onicord-accent mt-1 hover:underline">
              Clic para descargar
            </span>
          )}
        </div>
      );
    }

    return (
      <div
        className="relative w-full h-full cursor-pointer group/tile overflow-hidden bg-black/40"
        onClick={() => handleImageClick(index)}
      >
        <img
          src={url}
          alt={img.name || "Foto"}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-200 group-hover/tile:scale-[1.02]"
        />

        {hasOverlay ? (
          <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px] flex items-center justify-center font-bold text-white text-2xl sm:text-3xl tracking-wide select-none group-hover/tile:bg-black/55 transition-colors">
            +{remainingCount}
          </div>
        ) : (
          <div className="absolute inset-0 bg-black/10 opacity-0 group-hover/tile:opacity-100 transition-opacity pointer-events-none" />
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

    if (!diskPath || !url) {
      return (
        <div className={`mt-2 max-w-sm rounded-xl overflow-hidden border border-white/5 ${className}`}>
          {renderTileContent(singleImg, 0)}
        </div>
      );
    }

    return (
      <div
        className={`mt-2 relative rounded-xl overflow-hidden max-w-xl cursor-pointer group bg-black/20 border border-white/5 hover:border-onicord-accent/40 transition-all duration-200 inline-block ${className}`}
        onClick={() => handleImageClick(0)}
      >
        <img
          src={url}
          alt={singleImg.name || "Foto"}
          className="w-auto h-auto max-w-full max-h-[380px] object-contain rounded-xl block animate-fade-in"
        />
        <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </div>
    );
  }

  // 2 Images (2 equal columns)
  if (total === 2) {
    return (
      <div
        className={`mt-2 grid grid-cols-2 gap-1.5 rounded-xl overflow-hidden aspect-[16/9] max-h-[320px] max-w-2xl bg-black/20 border border-white/5 ${className}`}
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
        className={`mt-2 grid grid-cols-2 grid-rows-2 gap-1.5 rounded-xl overflow-hidden aspect-[16/10] max-h-[360px] max-w-2xl bg-black/20 border border-white/5 ${className}`}
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
        className={`mt-2 grid grid-cols-2 grid-rows-2 gap-1.5 rounded-xl overflow-hidden aspect-[16/10] max-h-[360px] max-w-2xl bg-black/20 border border-white/5 ${className}`}
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
      className={`mt-2 grid grid-cols-2 gap-1.5 rounded-xl overflow-hidden aspect-[16/9] max-h-[380px] max-w-2xl bg-black/20 border border-white/5 ${className}`}
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
