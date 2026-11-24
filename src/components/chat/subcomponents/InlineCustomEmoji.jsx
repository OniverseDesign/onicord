import React, { useState, useEffect } from "react";
import { getMediaUrl } from "../../../lib/media";
import { getCustomEmojiById } from "../../../lib/emojiData";
import Tooltip from "../../ui/Tooltip";

const resolvedUrlCache = new Map();

export default function InlineCustomEmoji({
  id,
  shortcode,
  ext = "webp",
  animated = false,
  sizeClass = "w-5 h-5",
  className = "",
  showTooltip = true,
}) {
  const getInitialUrl = (targetId) => {
    if (!targetId) return null;
    if (resolvedUrlCache.has(targetId)) {
      return resolvedUrlCache.get(targetId);
    }
    const local = getCustomEmojiById(targetId);
    if (local?.localPath) {
      const url = getMediaUrl(local.localPath);
      resolvedUrlCache.set(targetId, url);
      return url;
    }
    return null;
  };

  const [src, setSrc] = useState(() => getInitialUrl(id));

  useEffect(() => {
    if (!id) {
      setSrc(null);
      return;
    }

    const cached = getInitialUrl(id);
    if (cached) {
      setSrc(cached);
      return;
    }

    let isMounted = true;
    setSrc(null);

    const resolveEmoji = () => {
      window.electronAPI?.getEmojiPath?.(id).then((localPath) => {
        if (!isMounted) return;
        if (localPath) {
          const url = getMediaUrl(localPath);
          resolvedUrlCache.set(id, url);
          setSrc(url);
        } else {
          window.electronAPI?.requestEmoji?.({
            id,
            ext,
            shortcode,
            animated,
          });
        }
      });
    };

    resolveEmoji();

    const unsub = window.electronAPI?.onSyncComplete?.((data) => {
      if (
        data?.type === "emoji_imported" ||
        data?.type === "emoji_pack_imported"
      ) {
        if (!data?.emojiId || data.emojiId === id) {
          resolveEmoji();
        }
      }
    });

    return () => {
      isMounted = false;
      unsub?.();
    };
  }, [id, ext, shortcode, animated]);

  const shortcodeLabel = `:${shortcode}:`;

  const node = !src ? (
    <span
      className={`inline-flex items-center px-1 py-0.5 rounded bg-onicord-tint/10 text-onicord-muted font-mono text-[11px] align-baseline ${className}`}
    >
      {shortcodeLabel}
    </span>
  ) : (
    <img
      src={src}
      alt={shortcodeLabel}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`inline-block align-text-bottom object-contain select-none ${sizeClass} ${className}`}
    />
  );

  if (!showTooltip) return node;

  return (
    <Tooltip
      side="top"
      content={<span className="font-mono text-xs">{shortcodeLabel}</span>}
    >
      {node}
    </Tooltip>
  );
}
