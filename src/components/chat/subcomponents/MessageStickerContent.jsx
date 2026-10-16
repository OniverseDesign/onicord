import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import SmartAnimatedImage from "../../ui/SmartAnimatedImage";
import { getMediaUrl } from "../../../lib/media";

export default function MessageStickerContent({ rawText, timestamp }) {
  const { t } = useTranslation();
  const [stickerSrc, setStickerSrc] = useState(null);

  const stickerMeta = (() => {
    try {
      let parsed = JSON.parse(rawText);
      if (parsed && typeof parsed === "object") {
        if (parsed.body) {
          if (typeof parsed.body === "string") {
            try { parsed = JSON.parse(parsed.body); } catch (_) {}
          } else if (typeof parsed.body === "object") {
            parsed = parsed.body;
          }
        }
      }
      return parsed;
    } catch (e) {
      console.error("Error parseando metadatos de sticker:", e);
      return null;
    }
  })();

  useEffect(() => {
    if (!stickerMeta?.stickerId) return;
    let isMounted = true;

    const loadSticker = () => {
      window.electronAPI
        ?.getStickerPath(stickerMeta.stickerId)
        .then((cachedPath) => {
          if (!isMounted) return;

          if (cachedPath) {
            setStickerSrc(getMediaUrl(cachedPath));
          } else if (stickerMeta.fallbackBase64) {
            setStickerSrc(stickerMeta.fallbackBase64);
            window.electronAPI.saveStickerLocal({
              id: stickerMeta.stickerId,
              ext: stickerMeta.ext,
              base64Data: stickerMeta.fallbackBase64,
            });
          } else {
            setStickerSrc(null);
            // Request missing sticker over P2P mesh
            window.electronAPI?.requestSticker?.({
              id: stickerMeta.stickerId,
              ext: stickerMeta.ext,
            });
          }
        });
    };

    loadSticker();

    const unsub = window.electronAPI?.onSyncComplete?.((data) => {
      if (data?.type === "sticker_imported" || data?.type === "sticker_pack_imported") {
        if (!data?.stickerId || data.stickerId === stickerMeta.stickerId) {
          loadSticker();
        }
      }
    });

    return () => {
      isMounted = false;
      unsub?.();
    };
  }, [stickerMeta?.stickerId, stickerMeta?.fallbackBase64, stickerMeta?.ext]);

  if (!stickerMeta) return null;

  return (
    <div className="flex flex-col items-start justify-start w-full h-auto my-2 pb-1">
      <div className="min-w-[120px] max-h-[120px] h-auto w-auto overflow-hidden rounded-onicord-button mt-1 items-center justify-center select-none bg-transparent">
        {stickerSrc ? (
          <SmartAnimatedImage
            src={stickerSrc}
            alt={stickerMeta.stickerName}
            className="max-h-[120px] h-auto w-auto max-w-[150px] object-contain select-none pointer-events-none rounded-onicord-button"
            timestamp={timestamp}
          />
        ) : (
          <div className="h-24 w-24 bg-white/[0.03] border border-white/5 animate-pulse rounded-onicord-button flex items-center justify-center opacity-40">
            🖼️
          </div>
        )}
      </div>
    </div>
  );
}
