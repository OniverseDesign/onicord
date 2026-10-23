import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";

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

export default function MessageEmbedCard({ url }) {
  const { t } = useTranslation();
  const [ogData, setOgData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
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
    if (!ogEnabled) {
      setLoading(false);
      return;
    }
    let isMounted = true;
    if (window.electronAPI?.fetchOpenGraph) {
      window.electronAPI
        .fetchOpenGraph(url)
        .then((data) => {
          if (data && isMounted) {
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

  // CASO AUDIO: Pista de audio directa
  if (ogData.mediaType === "audio" && (ogData.audio || ogData.url)) {
    return (
      <div
        onClick={handleOpenExternal}
        className="flex flex-col max-w-[480px] mt-2 rounded-onicord-inner p-3 bg-onicord-mantle border border-onicord-island text-left gap-2 cursor-pointer hover:border-onicord-accent/40 transition-colors"
      >
        <div className="flex items-center gap-1.5 text-onicord-muted text-[11px] font-bold uppercase tracking-wider">
          <MaterialIcon name="music_note" size={14} />
          <span>{ogData.siteName || "Audio"}</span>
        </div>
        <span className="text-[14px] font-semibold text-onicord-text truncate">
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

  // CASO SPOTIFY: Tarjeta temática con carátula y reproductor
  if (ogData.mediaType === "spotify") {
    return (
      <div
        onClick={handleOpenExternal}
        className="flex max-w-[500px] mt-2 rounded-onicord-inner overflow-hidden bg-onicord-mantle border border-emerald-500/25 hover:border-emerald-500/60 justify-between items-center p-3 cursor-pointer transition-all duration-200 group/spotify text-left gap-3 select-none"
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
          <div className="flex items-center gap-1.5 text-[#1DB954] text-[11px] font-bold uppercase tracking-wider">
            <MaterialIcon name="graphic_eq" size={14} />
            <span>Spotify</span>
          </div>
          <span className="text-[14px] font-bold text-onicord-text group-hover/spotify:underline truncate mt-0.5">
            {ogData.title || url}
          </span>
          <span className="text-[12px] text-onicord-muted truncate">
            {ogData.description || "Escuchar en Spotify"}
          </span>
        </div>
        <div className="w-10 h-10 rounded-full bg-[#1DB954] text-black flex items-center justify-center shrink-0 group-hover/spotify:scale-105 transition-transform shadow-lg">
          <MaterialIcon name="play_arrow" size={24} />
        </div>
      </div>
    );
  }

  // CASO PINTEREST: Tarjeta con imagen de proporción vertical/natural y estilo estándar
  if (ogData.mediaType === "pinterest" || (ogData.siteName === "Pinterest" && ogData.image)) {
    return (
      <div
        onClick={handleOpenExternal}
        className="flex flex-col max-w-[340px] mt-2 rounded-onicord-inner bg-onicord-mantle border border-onicord-island hover:border-onicord-accent/40 p-3 gap-1.5 text-left cursor-pointer transition-all duration-200 group/card select-none"
      >
        <span className="text-[11px] font-bold uppercase tracking-wider text-onicord-muted truncate">
          {ogData.siteName || "Pinterest"}
        </span>

        <span className="text-[14px] font-bold text-onicord-text group-hover/card:underline line-clamp-2 leading-snug">
          {ogData.title || url}
        </span>

        {ogData.description && ogData.description !== "Explorar en Pinterest" && ogData.description !== "Pin en Pinterest" && (
          <p className="text-[12px] text-onicord-subtext line-clamp-2 leading-relaxed -mt-0.5">
            {ogData.description}
          </p>
        )}

        {ogData.image && (
          <div className="w-full relative bg-black/40 overflow-hidden rounded-xl border border-white/5 flex items-center justify-center max-h-[420px] mt-1">
            <img
              src={ogData.image}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full max-h-[420px] object-contain group-hover/card:scale-[1.02] transition-transform duration-300 rounded-xl"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          </div>
        )}
      </div>
    );
  }

  const isGifOrTenor = ogData.mediaType === "gif" || ogData.siteName === "Tenor" || ogData.siteName === "GIPHY";

  const isVideoContent =
    isYouTube ||
    ogData.mediaType === "video" ||
    isGifOrTenor ||
    Boolean(ogData.video) ||
    Boolean(ttId) ||
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

  // CASO 1: Previsualización Multimedia (Video o GIF)
  if (isVideoContent) {
    const ytThumb = ogData.image || (ytId ? `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg` : null);

    return (
      <div
        onClick={!isYouTube ? handleOpenExternal : undefined}
        className={`flex flex-col mt-2 p-3.5 ${
          isVertical ? "max-w-[230px]" : "max-w-[500px]"
        } rounded-onicord-inner bg-onicord-mantle border border-onicord-island gap-1.5 text-left select-none ${
          !isYouTube ? "cursor-pointer hover:border-onicord-accent/40 transition-colors" : ""
        }`}
      >
        {/* Site Name */}
        <span className="text-[11px] font-bold uppercase tracking-wider text-onicord-muted truncate">
          {ogData.siteName || (ytId ? "YouTube" : ttId ? "TikTok" : igInfo ? "Instagram" : isGifOrTenor ? "GIF" : "Video")}
        </span>

        {/* Title */}
        <span
          onClick={handleOpenExternal}
          className="text-[14px] font-bold text-onicord-text hover:underline line-clamp-2 cursor-pointer leading-snug"
        >
          {ogData.title || url}
        </span>

        {/* Description */}
        {ogData.description && !isGifOrTenor && (
          <p
            onClick={handleOpenExternal}
            className="text-[12px] text-onicord-subtext leading-relaxed line-clamp-2 cursor-pointer -mt-0.5"
          >
            {ogData.description}
          </p>
        )}

        {/* Video / Media Box con bordes redondeados */}
        <div
          className={`w-full relative bg-black/40 ${
            isVertical ? "aspect-[9/16]" : isGifOrTenor && !ogData.video ? "aspect-auto max-h-[360px]" : "aspect-video"
          } overflow-hidden rounded-xl mt-1 border border-white/5 flex items-center justify-center`}
        >
          {isYouTube ? (
            isPlaying ? (
              <iframe
                src={`${embedUrl}?autoplay=1&rel=0`}
                className="w-full h-full border-0 rounded-xl"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                title={ogData.title || "YouTube Video Player"}
              />
            ) : (
              <div
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsPlaying(true);
                }}
                className="w-full h-full relative cursor-pointer group/yt overflow-hidden flex items-center justify-center bg-black/40"
              >
                {ytThumb && (
                  <img
                    src={ytThumb}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover/yt:scale-105 transition-transform duration-300"
                  />
                )}
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover/yt:bg-black/20 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-red-600/90 text-white flex items-center justify-center group-hover/yt:scale-110 transition-transform">
                    <MaterialIcon name="play_arrow" size={28} />
                  </div>
                </div>
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
          ) : ogData.image ? (
            <div
              onClick={handleOpenExternal}
              className="w-full h-full relative cursor-pointer group/ext overflow-hidden flex items-center justify-center bg-black/40"
            >
              <img
                src={ogData.image}
                alt=""
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain group-hover/ext:scale-105 transition-transform duration-300 rounded-xl"
              />
              {!isGifOrTenor && (
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/ext:opacity-100 flex items-center justify-center transition-opacity">
                  <div className="w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center group-hover/ext:scale-110 transition-transform">
                    <MaterialIcon name="open_in_new" size={22} />
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // CASO 2: Enlace Web / Imagen Estándar (Diseño Original Restaurado)
  return (
    <div
      onClick={handleOpenExternal}
      className="flex max-w-[550px] mt-2 rounded-onicord-inner overflow-hidden bg-onicord-mantle border border-onicord-island justify-between items-stretch cursor-pointer hover:border-onicord-accent/40 transition-all duration-200 group/card text-left"
    >
      {/* Embed Text Details */}
      <div className="flex flex-col min-w-0 flex-1 p-3 justify-center">
        <span className="text-[10px] font-bold uppercase tracking-wider text-onicord-muted truncate">
          {ogData.siteName || t("chat.embed.webLink", "Enlace Web")}
        </span>
        <span className="text-[14px] font-semibold text-onicord-text group-hover/card:underline line-clamp-1 mt-0.5 tracking-wide">
          {ogData.title || url}
        </span>
        <p className="text-[12px] text-onicord-muted leading-relaxed line-clamp-2 mt-1">
          {ogData.description ||
            t("chat.embed.clickToOpen", "Click to open this link...")}
        </p>
      </div>

      {/* Imagen Lateral Fija de 150px (Diseño Original) */}
      {ogData.image && (
        <div className="w-[150px] min-h-[100px] shrink-0 bg-onicord-mantle/30 flex overflow-hidden rounded-onicord-button">
          <img
            src={ogData.image}
            alt=""
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover animate-fade-in"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        </div>
      )}
    </div>
  );
}
