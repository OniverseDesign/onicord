import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import { useVoiceChannelInfo } from "../../../context/VoiceContext";

export function extractYouTubeId(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return null;
  try {
    const u = new URL(urlStr);
    const host = u.hostname.toLowerCase();
    if (!host.includes("youtube.com") && !host.includes("youtu.be")) return null;
    if (host.includes("youtu.be")) {
      return u.pathname.slice(1).split("/")[0].split("?")[0];
    }
    if (u.pathname.includes("/shorts/")) {
      return u.pathname.split("/shorts/")[1]?.split("/")[0]?.split("?")[0];
    }
    if (u.pathname.includes("/embed/")) {
      return u.pathname.split("/embed/")[1]?.split("/")[0]?.split("?")[0];
    }
    return u.searchParams.get("v");
  } catch (e) {
    return null;
  }
}

export function extractTikTokId(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return null;
  try {
    const u = new URL(urlStr);
    if (!u.hostname.includes("tiktok.com")) return null;
    const match = u.pathname.match(/\/video\/(\d+)/);
    return match ? match[1] : null;
  } catch (e) {
    return null;
  }
}

export function extractInstagramId(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return null;
  try {
    const u = new URL(urlStr);
    if (!u.hostname.includes("instagram.com")) return null;
    const match = u.pathname.match(/\/(reel|reels|p)\/([^/]+)/);
    if (match) {
      const type = match[1] === "p" ? "p" : "reel";
      return { type, id: match[2] };
    }
    return null;
  } catch (e) {
    return null;
  }
}

export const clientOgCache = new Map();

export default function MessageEmbedCard({ url }) {
  const { t } = useTranslation();
  const { inVoice } = useVoiceChannelInfo();
  const cachedData = url ? clientOgCache.get(url) : null;
  const [ogData, setOgData] = useState(() => cachedData || null);
  const [loading, setLoading] = useState(() => !cachedData);
  const [isPlaying, setIsPlaying] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [ogEnabled, setOgEnabled] = useState(() => {
    try {
      const raw = localStorage.getItem("onicord_general_settings");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.enableOpenGraph !== undefined) return Boolean(parsed.enableOpenGraph);
      }
    } catch {}
    return true;
  });

  const ytId = extractYouTubeId(url);
  const ttId = extractTikTokId(url);
  const igInfo = extractInstagramId(url);

  useEffect(() => {
    const handleUpdate = (e) => {
      if (e.detail?.enableOpenGraph !== undefined) {
        setOgEnabled(Boolean(e.detail.enableOpenGraph));
      }
    };
    window.addEventListener("onicord:general-settings-updated", handleUpdate);
    return () => window.removeEventListener("onicord:general-settings-updated", handleUpdate);
  }, []);

  useEffect(() => {
    setImgError(false);
    setIsPlaying(false);

    if (!ogEnabled) {
      setLoading(false);
      return;
    }

    if (clientOgCache.has(url)) {
      const cached = clientOgCache.get(url);
      setOgData(cached);
      setLoading(false);
      return;
    }

    let isMounted = true;
    if (window.electronAPI?.fetchOpenGraph) {
      window.electronAPI
        .fetchOpenGraph(url)
        .then((data) => {
          if (data && isMounted) {
            if (data.success !== false) {
              clientOgCache.set(url, data);
            }
            setOgData(data);
            // Signal ChatPanel to re-anchor scroll if user was at the bottom
            window.dispatchEvent(new CustomEvent("onicord:embed-loaded"));
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => {
      isMounted = false;
    };
  }, [url, ogEnabled]);

  if (!ogEnabled) return null;

  if (loading)
    return (
      <div className="mt-2 text-xs text-onicord-muted animate-pulse select-none">
        {t("chat.embed.loading", "Cargando vista previa...")}
      </div>
    );
  if (!ogData) return null;

  const handleOpenExternal = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (window.electronAPI?.openExternalLink) {
      window.electronAPI.openExternalLink(url);
    } else {
      window.open(url, "_blank");
    }
  };

  const embedUrl =
    ogData.embedUrl ||
    (ytId ? `https://www.youtube.com/embed/${ytId}` : null);

  const isYouTube = Boolean(ytId || ogData.mediaType === "youtube");

  // Direct audio track player
  if (ogData.mediaType === "audio" && (ogData.audio || ogData.url)) {
    return (
      <div
        onClick={handleOpenExternal}
        className="flex flex-col max-w-[480px] mt-2 rounded-onicord-inner p-3 bg-onicord-mantle border border-onicord-island text-left gap-2 cursor-pointer hover:border-onicord-accent/40 transition-colors"
      >
        <div className="flex items-center gap-1.5 text-onicord-muted text-2xs font-bold uppercase tracking-wider">
          <MaterialIcon name="music_note" size={14} />
          <span>{ogData.siteName || "Audio"}</span>
        </div>
        <span className="text-sm font-semibold text-onicord-text truncate">
          {ogData.title || url}
        </span>
        <audio
          controls
          src={ogData.audio || ogData.url}
          className="w-full mt-1"
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  // Spotify embed card with artwork and playback launcher
  if (ogData.mediaType === "spotify") {
    return (
      <div
        onClick={handleOpenExternal}
        className="flex max-w-[500px] mt-2 rounded-onicord-inner overflow-hidden bg-onicord-mantle border border-emerald-500/25 hover:border-emerald-500/60 justify-between items-center p-3 cursor-pointer transition-all duration-normal group/spotify text-left gap-3 select-none"
      >
        {ogData.image && (
          <img
            src={ogData.image}
            alt=""
            referrerPolicy="no-referrer"
            className="w-16 h-16 rounded-lg object-cover shadow-md shrink-0"
          />
        )}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[#1DB954] text-2xs font-bold uppercase tracking-wider">
            <MaterialIcon name="graphic_eq" size={14} />
            <span>Spotify</span>
          </div>
          <span className="text-sm font-bold text-onicord-text group-hover/spotify:underline truncate mt-0.5">
            {ogData.title || url}
          </span>
          <span className="text-xs text-onicord-muted truncate">
            {ogData.description || "Escuchar en Spotify"}
          </span>
        </div>
        <div className="w-10 h-10 rounded-full bg-[#1DB954] text-black flex items-center justify-center shrink-0 group-hover/spotify:scale-105 transition-transform shadow-lg">
          <MaterialIcon name="play_arrow" size={24} />
        </div>
      </div>
    );
  }

  // Pinterest embed card with natural vertical proportion
  if (ogData.mediaType === "pinterest" || (ogData.siteName === "Pinterest" && ogData.image)) {
    return (
      <div
        onClick={handleOpenExternal}
        className="flex flex-col max-w-[340px] mt-2 rounded-onicord-inner bg-onicord-mantle border border-onicord-island hover:border-onicord-accent/40 p-3 gap-1.5 text-left cursor-pointer transition-all duration-normal group/card select-none"
      >
        <span className="text-2xs font-bold uppercase tracking-wider text-onicord-muted truncate">
          {ogData.siteName || "Pinterest"}
        </span>

        <span className="text-sm font-bold text-onicord-text group-hover/card:underline line-clamp-2 leading-snug">
          {ogData.title || url}
        </span>

        {ogData.description && ogData.description !== "Explorar en Pinterest" && ogData.description !== "Pin en Pinterest" && (
          <p className="text-xs text-onicord-subtext line-clamp-2 leading-relaxed -mt-0.5">
            {ogData.description}
          </p>
        )}

        {ogData.image && (
          <div className="w-full relative bg-onicord-scrim overflow-hidden rounded-xl border border-onicord-border flex items-center justify-center max-h-[420px] mt-1">
            <img
              src={ogData.image}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full max-h-[420px] object-contain group-hover/card:scale-[1.02] transition-transform duration-relaxed rounded-xl"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          </div>
        )}
      </div>
    );
  }

  const isTikTok = Boolean(
    ttId || ogData.mediaType === "tiktok" || ogData.siteName === "TikTok",
  );

  const isSocialPhotoCard =
    (ogData.siteName === "Instagram" || ogData.siteName === "Facebook") &&
    ogData.mediaType === "image" &&
    Boolean(ogData.image) &&
    !imgError;

  if (isSocialPhotoCard) {
    return (
      <div
        onClick={handleOpenExternal}
        className="flex flex-col max-w-[420px] mt-2 rounded-onicord-inner bg-onicord-mantle border border-onicord-island hover:border-onicord-accent/40 p-3.5 gap-1.5 text-left cursor-pointer transition-all duration-normal group/card select-none"
      >
        <span className="text-2xs font-bold uppercase tracking-wider text-onicord-muted truncate">
          {ogData.siteName}
        </span>

        <span className="text-sm font-bold text-onicord-text group-hover/card:underline line-clamp-2 leading-snug">
          {ogData.title || url}
        </span>

        {ogData.description && (
          <p className="text-xs text-onicord-subtext line-clamp-2 leading-relaxed -mt-0.5">
            {ogData.description}
          </p>
        )}

        <div className="w-full relative bg-onicord-scrim overflow-hidden rounded-xl border border-onicord-border flex items-center justify-center max-h-[420px] mt-1">
          <img
            src={ogData.image}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full max-h-[420px] object-contain group-hover/card:scale-[1.02] transition-transform duration-relaxed rounded-xl"
            onError={() => setImgError(true)}
          />
        </div>
      </div>
    );
  }

  const isGifOrTenor = ogData.mediaType === "gif" || ogData.siteName === "Tenor" || ogData.siteName === "GIPHY";

  const isVideoContent =
    isYouTube ||
    isTikTok ||
    ogData.mediaType === "video" ||
    isGifOrTenor ||
    Boolean(ogData.video) ||
    Boolean(igInfo) ||
    (typeof url === "string" &&
      (url.includes("tiktok.com") ||
        url.includes("/reel/") ||
        url.includes("/reels/")));

  const isVertical =
    ogData.aspectRatio === "9:16" ||
    (typeof url === "string" &&
      (url.includes("/shorts/") ||
        url.includes("tiktok.com") ||
        url.includes("/reel/") ||
        url.includes("/reels/")));

  // Multimedia preview (Video or GIF)
  if (isVideoContent) {
    const ytThumb = ogData.image || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null);
    const previewThumb = isYouTube ? ytThumb : ogData.image;
    const playableEmbedUrl = isYouTube
      ? (embedUrl ? `${embedUrl}?autoplay=1&rel=0` : null)
      : isTikTok
        ? (ogData.embedUrl ||
          (ttId
            ? `https://www.tiktok.com/player/v1/${ttId}?embed_from=oembed&music_info=1&description=1&autoplay=1`
            : null))
        : null;
    const supportsInlinePlayer = Boolean(playableEmbedUrl && (isYouTube || isTikTok));
    const hasMediaPreview =
      supportsInlinePlayer ||
      Boolean(ogData.video) ||
      (Boolean(previewThumb) && !imgError);

    return (
      <div
        onClick={!supportsInlinePlayer ? handleOpenExternal : undefined}
        className={`flex flex-col mt-2 p-3.5 ${
          isVertical ? "max-w-[230px]" : "max-w-[500px]"
        } rounded-onicord-inner bg-onicord-mantle border border-onicord-island gap-1.5 text-left select-none ${
          !supportsInlinePlayer ? "cursor-pointer hover:border-onicord-accent/40 transition-colors" : ""
        }`}
      >
        <span className="text-2xs font-bold uppercase tracking-wider text-onicord-muted truncate">
          {ogData.siteName || (ytId ? "YouTube" : isTikTok ? "TikTok" : igInfo ? "Instagram" : isGifOrTenor ? "GIF" : "Video")}
        </span>

        <span
          onClick={handleOpenExternal}
          className="text-sm font-bold text-onicord-text hover:underline line-clamp-2 cursor-pointer leading-snug"
        >
          {ogData.title || url}
        </span>

        {ogData.description && !isGifOrTenor && (
          <p
            onClick={handleOpenExternal}
            className="text-xs text-onicord-subtext leading-relaxed line-clamp-2 cursor-pointer -mt-0.5"
          >
            {ogData.description}
          </p>
        )}

        {hasMediaPreview && (
          <div
            className={`w-full relative bg-onicord-scrim ${
              isVertical
                ? "aspect-[9/16]"
                : ogData.aspectRatio === "1:1"
                  ? "aspect-square"
                  : isGifOrTenor && !ogData.video
                    ? "aspect-auto max-h-[360px]"
                    : "aspect-video"
            } overflow-hidden rounded-xl mt-1 border border-onicord-border flex items-center justify-center`}
          >
            {supportsInlinePlayer ? (
              isPlaying ? (
                <iframe
                  src={playableEmbedUrl}
                  className="w-full h-full border-0 rounded-xl"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  title={ogData.title || (isYouTube ? "YouTube Video Player" : "TikTok Video Player")}
                />
              ) : (
                <div
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsPlaying(true);
                  }}
                  className="w-full h-full relative cursor-pointer group/yt overflow-hidden flex items-center justify-center bg-onicord-scrim"
                >
                  {previewThumb && !imgError && (
                    <img
                      src={previewThumb}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={() => setImgError(true)}
                      className="w-full h-full object-cover group-hover/yt:scale-105 transition-transform duration-relaxed"
                    />
                  )}
                  <div className="absolute inset-0 bg-onicord-scrim-soft flex items-center justify-center group-hover/yt:bg-onicord-scrim-soft transition-colors">
                    <div
                      className={`w-12 h-12 rounded-full ${
                        isYouTube
                          ? "bg-red-600/90 text-onicord-on-scrim"
                          : "bg-onicord-scrim-heavy text-onicord-on-scrim border border-onicord-on-scrim/15"
                      } flex items-center justify-center group-hover/yt:scale-110 transition-transform shadow-lg`}
                    >
                      <MaterialIcon name="play_arrow" size={28} />
                    </div>
                  </div>
                  {isYouTube && Boolean(inVoice) && (
                    <button
                      type="button"
                      title={t("chat.watchPartyRoom", "Ver en Watch Party con la sala")}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        window.dispatchEvent(
                          new CustomEvent("onicord:start-watch-party", {
                            detail: { url, title: ogData.title },
                          }),
                        );
                      }}
                      className="absolute top-2 right-2 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-onicord-scrim-heavy hover:bg-onicord-accent text-onicord-on-scrim hover:text-onicord-on-accent text-xs font-semibold tracking-wide backdrop-blur-onicord-popover shadow-lg border border-onicord-on-scrim/10 opacity-0 group-hover/yt:opacity-100 transition-all duration-normal"
                    >
                      <MaterialIcon name="smart_display" size={14} />
                      <span>Watch Party</span>
                    </button>
                  )}
                </div>
              )
            ) : ogData.video ? (
              <video
                src={ogData.video}
                poster={ogData.image}
                autoPlay={isGifOrTenor}
                loop={isGifOrTenor}
                muted={isGifOrTenor}
                playsInline
                controls={!isGifOrTenor}
                className="w-full h-full object-contain rounded-xl"
              />
            ) : previewThumb && !imgError ? (
              <div
                onClick={handleOpenExternal}
                className="w-full h-full relative cursor-pointer group/ext overflow-hidden flex items-center justify-center bg-onicord-scrim"
              >
                <img
                  src={previewThumb}
                  alt=""
                  referrerPolicy="no-referrer"
                  onError={() => setImgError(true)}
                  className="w-full h-full object-contain group-hover/ext:scale-105 transition-transform duration-relaxed rounded-xl"
                />
                {!isGifOrTenor && (
                  <div className="absolute inset-0 bg-onicord-scrim-soft opacity-0 group-hover/ext:opacity-100 flex items-center justify-center transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-onicord-scrim text-onicord-on-scrim flex items-center justify-center group-hover/ext:scale-110 transition-transform">
                      <MaterialIcon name="open_in_new" size={22} />
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  // Standard web link preview with side thumbnail
  return (
    <div
      onClick={handleOpenExternal}
      className="flex max-w-[550px] mt-2 rounded-onicord-inner overflow-hidden bg-onicord-mantle border border-onicord-island justify-between items-stretch cursor-pointer hover:border-onicord-accent/40 transition-all duration-normal group/card text-left"
    >
      {/* Embed Text Details */}
      <div className="flex flex-col min-w-0 flex-1 p-3 justify-center">
        <span className="text-2xs font-bold uppercase tracking-wider text-onicord-muted truncate">
          {ogData.siteName || t("chat.embed.webLink", "Enlace Web")}
        </span>
        <span className="text-sm font-semibold text-onicord-text group-hover/card:underline line-clamp-1 mt-0.5 tracking-wide">
          {ogData.title || url}
        </span>
        <p className="text-xs text-onicord-muted leading-relaxed line-clamp-2 mt-1">
          {ogData.description ||
            t("chat.embed.clickToOpen", "Click to open this link...")}
        </p>
      </div>

      {/* Fixed lateral thumbnail (150px) */}
      {ogData.image && !imgError && (
        <div className="w-[150px] min-h-[100px] shrink-0 bg-onicord-mantle/30 flex overflow-hidden rounded-onicord-button">
          <img
            src={ogData.image}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover animate-fade-in"
            onError={() => setImgError(true)}
          />
        </div>
      )}
    </div>
  );
}
