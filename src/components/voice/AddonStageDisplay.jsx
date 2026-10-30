import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Hls from "hls.js";
import MaterialIcon from "../icons/MaterialIcon";
import {
  IconClose,
  IconExpand,
  IconCollapse,
  IconVolumeUp,
  IconVolumeOff,
  IconStopStream,
  IconFullscreen,
  IconFullscreenExit,
} from "../icons/StreamIcons";
import { soundEngine } from "../../lib/soundEngine";
import ConfirmDialogModal from "../modals/ConfirmDialogModal";
import FloatingMediaBar from "../ui/FloatingMediaBar";
import { useWatchParty } from "../../context/WatchPartyContext";

export default function AddonStageDisplay({
  stageData, // { pluginId, title, url, htmlContent, authorName, inviteData }
  onClose,
  isMini = false,
  onToggleSize = null,
  isFullscreen = false,
  onToggleFullscreen = null,
  onShareToChat = null,
}) {
  const { t, i18n } = useTranslation();
  const currentLang = (i18n.language || "es").split("-")[0].toLowerCase();
  const watchParty = useWatchParty();
  const {
    session: watchPartySession,
    isHost: isWatchPartyHost,
    startCinemaWatchParty,
    stopWatchParty,
    broadcastState: broadcastWatchPartyState,
    updateHostPlaybackTime,
    sendSeek: sendWatchPartySeek,
    togglePlayPause: toggleWatchPartyPlayPause,
  } = watchParty || {};
  const iframeRef = useRef(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [hasGamepad, setHasGamepad] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [duckMultiplier, setDuckMultiplier] = useState(1.0);
  const inactivityTimeoutRef = useRef(null);

  useEffect(() => {
    const handleDucking = (e) => {
      const mult = e.detail?.duckMultiplier ?? 1.0;
      setDuckMultiplier(mult);
    };
    window.addEventListener("voice-ducking-change", handleDucking);
    return () => window.removeEventListener("voice-ducking-change", handleDucking);
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = Math.max(0, Math.min(1, (volume / 100) * duckMultiplier));
      videoRef.current.muted = isMuted;
    }
  }, [volume, duckMultiplier, isMuted]);

  // Dynamic states enabling smooth transitions between Launcher and the selected game
  const [activeUrl, setActiveUrl] = useState(stageData?.url || null);
  const [activeHtml, setActiveHtml] = useState(stageData?.htmlContent || null);
  const [activeTitle, setActiveTitle] = useState(stageData?.title || "Escenario de Complemento");
  const [activeGame, setActiveGame] = useState(null);

  const activeGameRef = useRef(activeGame);
  activeGameRef.current = activeGame;
  const activeHtmlRef = useRef(activeHtml);
  activeHtmlRef.current = activeHtml;

  // Dynamic Addon Action Protocol (Agnostic header buttons)
  const [stageActions, setStageActions] = useState(Array.isArray(stageData?.actions) ? stageData.actions : []);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  useEffect(() => {
    setStageActions(Array.isArray(stageData?.actions) ? stageData.actions : []);
  }, [stageData]);

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [activeGame]);

  // Media State for native FloatingMediaBar integration
  const isCurrentMedia = Boolean(
    activeGame &&
      activeGame.type !== "game" &&
      (activeGame.mediaType === "video" || activeGame.type === "movie" || Boolean(activeGame.streamUrl))
  );

  const isCinemaWatchParty = Boolean(
    isCurrentMedia &&
      (activeGame?.isChannel || stageData?.isChannel || watchPartySession?.type === "cinema")
  );

  const isSyncHost = Boolean(
    isCinemaWatchParty &&
      stageData?.isSyncHost !== false &&
      activeGame?.isSyncHost !== false &&
      (isWatchPartyHost || !watchPartySession || watchPartySession.type !== "cinema")
  );
  const [mediaPlaybackTime, setMediaPlaybackTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const knownTotalDurationRef = useRef(0);
  const [mediaPlaying, setMediaPlaying] = useState(false);
  const [mediaSeeking, setMediaSeeking] = useState(false);
  const [mediaSeekValue, setMediaSeekValue] = useState(0);
  const [mediaSubtitles, setMediaSubtitles] = useState([]);
  const [currentSubtitle, setCurrentSubtitle] = useState("off");
  const [showSubtitlesMenu, setShowSubtitlesMenu] = useState(false);
  const [mediaError, setMediaError] = useState(null);
  const [mediaBuffering, setMediaBuffering] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const loadingDoneRef = useRef(false);
  const [loadingMessage, setLoadingMessage] = useState("Conectando con la fuente de video...");
  const subtitleBlobsRef = useRef([]);

  useEffect(() => {
    return () => {
      subtitleBlobsRef.current.forEach((u) => {
        try { URL.revokeObjectURL(u); } catch (_) {}
      });
      subtitleBlobsRef.current = [];
    };
  }, []);

  const finishMediaLoading = useCallback(() => {
    if (loadingDoneRef.current) return;
    loadingDoneRef.current = true;
    setLoadingProgress(100);
    setTimeout(() => {
      setMediaLoading(false);
    }, 300);
  }, []);
  const [audioTracks, setAudioTracks] = useState([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(0);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [activeCueText, setActiveCueText] = useState("");

  // Preserve original launcher/catalog definition agnostically
  const catalogStageRef = useRef(stageData);
  useEffect(() => {
    if (stageData && (stageData.htmlContent || stageData.entryPoint || stageData.activity?.isCatalog)) {
      catalogStageRef.current = stageData;
    }
  }, [stageData]);

  const isCurrentMediaRef = useRef(isCurrentMedia);
  isCurrentMediaRef.current = isCurrentMedia;
  const lastSavedContinueTimeRef = useRef(0);

  const getContinueStorageKey = useCallback((targetPluginId) => {
    const pid = targetPluginId || activeGameRef.current?.pluginId || stageData?.pluginId || "default";
    return pid === "onicord-cinema" ? "onicord_cinema_continue_watching" : `onicord_stage_continue_${pid}`;
  }, [stageData?.pluginId]);

  const removeContinueWatching = useCallback((mediaId, targetPluginId) => {
    if (!mediaId) return;
    try {
      const key = getContinueStorageKey(targetPluginId);
      const stored = localStorage.getItem(key);
      if (!stored) return;
      let list = JSON.parse(stored);
      if (!Array.isArray(list)) return;
      list = list.filter((x) => x.id !== mediaId);
      localStorage.setItem(key, JSON.stringify(list));
      iframeRef.current?.contentWindow?.postMessage(
        { type: "ONICORD_STAGE_CONTINUE_WATCHING_UPDATED", pluginId: targetPluginId || stageData?.pluginId },
        "*"
      );
      iframeRef.current?.contentWindow?.postMessage(
        { type: "ONICORD_CINEMA_CONTINUE_WATCHING_UPDATED" },
        "*"
      );
    } catch (_) {}
  }, [getContinueStorageKey, stageData?.pluginId]);

  const saveContinueWatching = useCallback((cTime, dur) => {
    const curGame = activeGameRef.current;
    if (!curGame || !isCurrentMediaRef.current) return;
    const mediaId = curGame.id;
    if (!mediaId || typeof cTime !== "number" || cTime < 4) return;

    const pid = curGame.pluginId || stageData?.pluginId || "default";
    const effectiveDur = dur && dur > 0 ? dur : (curGame.duration || 0);

    if (effectiveDur > 0 && cTime / effectiveDur >= 0.95) {
      removeContinueWatching(mediaId, pid);
      return;
    }

    try {
      const key = getContinueStorageKey(pid);
      const stored = localStorage.getItem(key);
      let list = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(list)) list = [];

      const existingIdx = list.findIndex((x) => x.id === mediaId);
      const itemToSave = {
        id: mediaId,
        pluginId: pid,
        type: curGame.type || "movie",
        title: curGame.title,
        name: curGame.title,
        details: curGame.details || "",
        cover: curGame.cover,
        poster: curGame.cover,
        banner: curGame.banner,
        background: curGame.banner,
        logo: curGame.logo || null,
        url: curGame.url,
        streamUrl: curGame.streamUrl || curGame.url,
        infoHash: curGame.infoHash || null,
        fileIdx: curGame.fileIdx ?? 0,
        trackers: curGame.trackers || [],
        subtitles: curGame.subtitles || [],
        currentTime: Math.floor(cTime),
        resumeTime: Math.floor(cTime),
        duration: Math.floor(effectiveDur),
        progress: effectiveDur > 0 ? Number((cTime / effectiveDur).toFixed(3)) : 0,
        isChannel: Boolean(curGame.isChannel),
        updatedAt: Date.now(),
      };

      if (existingIdx >= 0) {
        list[existingIdx] = { ...list[existingIdx], ...itemToSave };
      } else {
        list.unshift(itemToSave);
      }

      if (list.length > 20) {
        list = list.slice(0, 20);
      }

      localStorage.setItem(key, JSON.stringify(list));
      iframeRef.current?.contentWindow?.postMessage(
        { type: "ONICORD_STAGE_CONTINUE_WATCHING_UPDATED", pluginId: pid },
        "*"
      );
      iframeRef.current?.contentWindow?.postMessage(
        { type: "ONICORD_CINEMA_CONTINUE_WATCHING_UPDATED" },
        "*"
      );
    } catch (_) {}
  }, [getContinueStorageKey, removeContinueWatching, stageData?.pluginId]);

  // Complete iframe and resource teardown on explicit close
  const handleTerminate = useCallback(() => {
    if (videoRef.current && isCurrentMediaRef.current && activeGameRef.current) {
      saveContinueWatching(videoRef.current.currentTime, videoRef.current.duration || 0);
    }
    if (iframeRef.current) {
      try {
        iframeRef.current.src = "about:blank";
      } catch (_) {}
    }
    if (isCinemaWatchParty && isSyncHost && stopWatchParty) {
      stopWatchParty();
    }
    onClose?.();
  }, [onClose, isCinemaWatchParty, isSyncHost, stopWatchParty, saveContinueWatching]);

  // Return to Launcher catalog without unmounting or reloading voice call
  const handleReturnToCatalog = useCallback(() => {
    if (videoRef.current && isCurrentMediaRef.current && activeGameRef.current) {
      saveContinueWatching(videoRef.current.currentTime, videoRef.current.duration || 0);
    }
    if (isCinemaWatchParty && isSyncHost && stopWatchParty) {
      stopWatchParty();
    }
    const catalog = catalogStageRef.current || stageData;
    setActiveGame(null);
    setActiveUrl(catalog?.url || null);
    setActiveHtml(catalog?.htmlContent || null);
    setActiveTitle(catalog?.title || "Escenario");
    setMediaError(null);
    setMediaBuffering(false);
    setMediaLoading(false);
    setMediaPlaying(false);
    setMediaPlaybackTime(0);
    setMediaDuration(0);
    knownTotalDurationRef.current = 0;
    setCurrentSubtitle("off");
    setActiveCueText("");
    setAudioTracks([]);
    setCurrentAudioTrack(0);

    if (iframeRef.current) {
      try {
        iframeRef.current.src = "about:blank";
      } catch (_) {}
    }

    const isCinemaCatalog = catalog?.pluginId === "onicord-cinema" || catalog?.icon === "movie" || catalog?.title === "Cinema" || catalog?.activity?.type === "movie";
    const catalogActivity = {
      pluginId: catalog?.pluginId,
      name: catalog?.activity?.name || catalog?.title || "Catálogo",
      details: catalog?.activity?.details || "Catálogo",
      state: null,
      cover: null,
      type: isCinemaCatalog ? "movie" : "launcher",
      isCatalog: true,
      startTime: Date.now(),
    };

    if (window.electronAPI?.openStageView) {
      window.electronAPI.openStageView({
        ...catalog,
        activity: catalogActivity,
        isFloating: isMini,
      });
    }

    if (window.electronAPI?.setStageActivity) {
      window.electronAPI.setStageActivity(catalogActivity);
    }
  }, [stageData, isMini, isCinemaWatchParty, isSyncHost, stopWatchParty]);

  // Diccionario exhaustivo de códigos de idioma ISO 639 a nombres en español
  const LANGUAGE_NAMES = {
    spa: "Español",
    es: "Español",
    spanish: "Español",
    "es-419": "Español (Latinoamérica)",
    lat: "Español (Latinoamérica)",
    latino: "Español (Latinoamérica)",
    pob: "Portugués (Brasil)",
    "pt-br": "Portugués (Brasil)",
    por: "Portugués",
    pt: "Portugués",
    eng: "Inglés",
    en: "Inglés",
    english: "Inglés",
    fre: "Francés",
    fra: "Francés",
    fr: "Francés",
    ita: "Italiano",
    it: "Italiano",
    ger: "Alemán",
    deu: "Alemán",
    de: "Alemán",
    jap: "Japonés",
    jpn: "Japonés",
    ja: "Japonés",
    kor: "Coreano",
    ko: "Coreano",
    rus: "Ruso",
    ru: "Ruso",
    zht: "Chino Tradicional",
    zhs: "Chino Simplificado",
    chi: "Chino",
    zho: "Chino",
    zh: "Chino",
    ara: "Árabe",
    ar: "Árabe",
    tur: "Turco",
    tr: "Turco",
    pol: "Polaco",
    pl: "Polaco",
    nld: "Holandés",
    dut: "Holandés",
    nl: "Holandés",
    swe: "Sueco",
    sv: "Sueco",
    nor: "Noruego",
    no: "Noruego",
    dan: "Danés",
    da: "Danés",
    fin: "Finlandés",
    fi: "Finlandés",
    ell: "Griego",
    el: "Griego",
    ron: "Rumano",
    ro: "Rumano",
    hun: "Húngaro",
    hu: "Húngaro",
    cze: "Checo",
    cs: "Checo",
    slo: "Eslovaco",
    sk: "Eslovaco",
    slv: "Esloveno",
    bul: "Búlgaro",
    hrv: "Croata",
    hr: "Croata",
    srp: "Serbio",
    sr: "Serbio",
    bos: "Bosnio",
    bs: "Bosnio",
    ukr: "Ucraniano",
    uk: "Ucraniano",
    heb: "Hebreo",
    he: "Hebreo",
    ind: "Indonesio",
    id: "Indonesio",
    tha: "Tailandés",
    vie: "Vietnamita",
    per: "Persa",
    fa: "Persa",
  };

  const syncStageContextToIframe = useCallback(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "ONICORD_STAGE_CONTEXT",
          language: currentLang,
          locale: i18n.language || currentLang,
        },
        "*"
      );
    } catch (_) {}
  }, [currentLang, i18n.language]);

  useEffect(() => {
    syncStageContextToIframe();
    const timer = setTimeout(syncStageContextToIframe, 180);
    return () => clearTimeout(timer);
  }, [syncStageContextToIframe, activeUrl, activeHtml]);

  // Helper para mostrar nombres de idiomas limpios según el idioma seleccionado en Onicord
  const ISO_639_TO_BCP47 = {
    spa: "es", es: "es", spanish: "es", "es-419": "es-419", lat: "es-419", latino: "es-419",
    pob: "pt-BR", "pt-br": "pt-BR", por: "pt", pt: "pt",
    eng: "en", en: "en", english: "en",
    fre: "fr", fra: "fr", fr: "fr",
    ita: "it", it: "it",
    ger: "de", deu: "de", de: "de",
    jap: "ja", jpn: "ja", ja: "ja",
    kor: "ko", ko: "ko",
    rus: "ru", ru: "ru",
    zht: "zh-Hant", zhs: "zh-Hans", chi: "zh", zho: "zh", zh: "zh",
    ara: "ar", ar: "ar", tur: "tr", tr: "tr", pol: "pl", pl: "pl",
    nld: "nl", dut: "nl", nl: "nl", swe: "sv", sv: "sv", nor: "no", no: "no",
    dan: "da", da: "da", fin: "fi", fi: "fi", ell: "el", el: "el",
    ron: "ro", ro: "ro", hun: "hu", hu: "hu", cze: "cs", cs: "cs",
    slo: "sk", sk: "sk", slv: "sl", bul: "bg", hrv: "hr", hr: "hr",
    srp: "sr", sr: "sr", bos: "bs", bs: "bs", ukr: "uk", uk: "uk",
    heb: "he", he: "he", ind: "id", id: "id", tha: "th", vie: "vi", per: "fa", fa: "fa",
  };

  const formatLanguageName = (code, isAudio = false) => {
    if (!code) return isAudio ? t("stage.primary") : t("stage.unknown");
    const c = String(code).toLowerCase().trim();
    const bcp47 = ISO_639_TO_BCP47[c] || (c.length <= 3 ? c : null);
    if (bcp47 && typeof Intl !== "undefined" && Intl.DisplayNames) {
      try {
        const dn = new Intl.DisplayNames([currentLang, "en"], { type: "language" });
        const name = dn.of(bcp47);
        if (name && name.toLowerCase() !== bcp47.toLowerCase()) {
          return name.charAt(0).toUpperCase() + name.slice(1);
        }
      } catch (_) {}
    }
    if (LANGUAGE_NAMES[c]) return LANGUAGE_NAMES[c];
    return code.length <= 4 ? code.toUpperCase() : code;
  };

  // Filtra, organiza, prioriza y desambigua la lista de subtítulos según el idioma activo en Onicord
  const organizeSubtitlesList = (rawSubs) => {
    if (!Array.isArray(rawSubs) || rawSubs.length === 0) return [];

    const grouped = {};
    for (const s of rawSubs) {
      const code = (s.lang || "des").toLowerCase().trim();
      if (!grouped[code]) grouped[code] = [];
      grouped[code].push(s);
    }

    const prioByAppLang = {
      es: ["spa", "es", "es-419", "lat", "latino", "eng", "en", "pob", "pt-br", "por", "pt"],
      en: ["eng", "en", "spa", "es", "es-419", "lat", "pob", "pt-br", "por", "pt"],
      pt: ["pob", "pt-br", "por", "pt", "eng", "en", "spa", "es", "es-419", "lat"],
    };
    const prio = [
      ...(prioByAppLang[currentLang] || prioByAppLang.es),
      "fre", "fra", "fr", "ita", "it", "ger", "deu", "de", "jap", "ja", "kor", "ko"
    ];

    const sortedCodes = Object.keys(grouped).sort((a, b) => {
      const idxA = prio.indexOf(a);
      const idxB = prio.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      const nameA = formatLanguageName(a);
      const nameB = formatLanguageName(b);
      return nameA.localeCompare(nameB);
    });

    const organized = [];
    for (const code of sortedCodes) {
      const langName = formatLanguageName(code);
      const list = grouped[code].slice(0, 3);
      list.forEach((sub, i) => {
        let tag = "";
        const fn = (sub.subtitleFileName || sub.label || "").toLowerCase();
        if (fn.includes("forced") || fn.includes("forzado")) tag = t("stage.forcedTag");
        else if (fn.includes("sdh") || fn.includes("cc")) tag = " (SDH)";
        else if (list.length > 1) tag = ` #${i + 1}`;

        organized.push({
          ...sub,
          id: String(sub.id || `${code}_${i}`),
          lang: code,
          label: `${langName}${tag}`,
        });
      });
    }

    return organized;
  };

  const resolveSubtitlesList = useCallback(async (rawSubs) => {
    subtitleBlobsRef.current.forEach((u) => {
      try { URL.revokeObjectURL(u); } catch (_) {}
    });
    subtitleBlobsRef.current = [];

    if (!Array.isArray(rawSubs) || rawSubs.length === 0) {
      setMediaSubtitles([]);
      return;
    }

    const organized = organizeSubtitlesList(rawSubs);
    const prepared = await Promise.all(
      organized.map(async (sub) => {
        try {
          if (sub.url && !sub.url.endsWith(".vtt") && !sub.url.startsWith("blob:")) {
            const res = await fetch(sub.url);
            if (res.ok) {
              const raw = await res.text();
              const vtt = raw.startsWith("WEBVTT")
                ? raw
                : "WEBVTT\n\n" + raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
              const blob = new Blob([vtt], { type: "text/vtt" });
              const objUrl = URL.createObjectURL(blob);
              subtitleBlobsRef.current.push(objUrl);
              return { ...sub, url: objUrl };
            }
          }
        } catch (e) {
          console.debug("[AddonStage] Error resolviendo subtítulo:", e);
        }
        return sub;
      })
    );
    setMediaSubtitles(prepared);
  }, [currentLang]);

  // Progreso real + interpolación monotónica de 0% a 100% para carga de video
  useEffect(() => {
    if (!mediaLoading) {
      loadingDoneRef.current = false;
      return;
    }
    loadingDoneRef.current = false;
    setLoadingProgress(0);
    setLoadingMessage("Conectando con la fuente de video...");

    const progressInterval = setInterval(() => {
      if (loadingDoneRef.current) return;
      const video = videoRef.current;
      let realFloor = 0;
      if (video) {
        if (video.readyState >= 3) {
          realFloor = 98;
        } else if (video.readyState === 2) {
          realFloor = 75;
        } else if (video.readyState === 1) {
          realFloor = 42;
        }
        if (video.buffered && video.buffered.length > 0) {
          const bufferedEnd = video.buffered.end(video.buffered.length - 1);
          const bufPct = Math.min(95, Math.round((bufferedEnd / 5) * 95));
          realFloor = Math.max(realFloor, bufPct);
        }
      }
      setLoadingProgress((prev) => {
        if (prev >= 100) return 100;
        const base = Math.max(prev, realFloor);
        if (base >= 92) return base;
        const step = Math.max(0.45, (92 - base) * 0.045);
        return Math.min(92, Number((base + step).toFixed(1)));
      });
    }, 100);

    const t1 = setTimeout(() => {
      setLoadingMessage("Estableciendo buffer y leyendo metadatos...");
    }, 3200);
    const t2 = setTimeout(() => {
      setLoadingMessage("Buscando fragmentos de video...");
    }, 7500);
    const t3 = setTimeout(() => {
      setLoadingMessage("Cargando transmisión multimedia...");
    }, 15000);
    return () => {
      clearInterval(progressInterval);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [mediaLoading]);

  const loadMediaStream = useCallback((targetUrl) => {
    const video = videoRef.current;
    if (!video || !targetUrl) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setMediaError(null);
    setMediaBuffering(false);
    setMediaLoading(true);

    const isHls = targetUrl.includes(".m3u8") || targetUrl.includes("/hls.m3u8");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
      });
      hlsRef.current = hls;
      hls.loadSource(targetUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.warn("[AddonStageDisplay] HLS Error fatal:", data);
          setMediaLoading(false);
          setMediaError(t("stage.playbackErrorCodec"));
        }
      });
    } else {
      video.src = targetUrl;
      video.load();
      video.play().catch(() => {});
    }
  }, [t]);

  const handleMediaError = useCallback(() => {
    const video = videoRef.current;
    const err = video?.error;
    const currentSrc = video?.src || "";

    if (
      err?.code === 4 &&
      currentSrc.includes("/torrent/") &&
      !currentSrc.includes("transcode=1")
    ) {
      const sep = currentSrc.includes("?") ? "&" : "?";
      loadMediaStream(`${currentSrc}${sep}transcode=1`);
      return;
    }

    setMediaLoading(false);
    let msg = t("stage.playbackErrorGeneric");
    if (err?.code === 4) {
      msg = t("stage.playbackErrorCodec");
    }
    setMediaError(msg);
    setMediaBuffering(false);
  }, [loadMediaStream, t]);

  useEffect(() => {
    let cancelled = false;
    if (isCurrentMedia && activeGame) {
      (async () => {
        let targetUrl = activeGame.streamUrl || activeUrl;
        if (activeGame.infoHash && window.electronAPI?.getTorrentStreamUrl) {
          try {
            targetUrl = await window.electronAPI.getTorrentStreamUrl({
              infoHash: activeGame.infoHash,
              fileIdx: activeGame.fileIdx ?? 0,
              trackers: activeGame.trackers || [],
            });
          } catch (_) {}
        }
        if (!cancelled && targetUrl) {
          if (activeGame.resumeTime && activeGame.resumeTime > 5) {
            if (targetUrl.includes("/torrent/") && !targetUrl.includes("/raw") && !targetUrl.includes("ss=")) {
              try {
                const parsed = new URL(targetUrl);
                parsed.searchParams.set("ss", String(Math.floor(activeGame.resumeTime)));
                targetUrl = parsed.toString();
              } catch (_) {}
            }
          }
          loadMediaStream(targetUrl);
        }
      })();
    }
    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (activeGame?.infoHash) {
        window.electronAPI?.stopTorrent?.(activeGame.infoHash);
      }
    };
  }, [isCurrentMedia, activeGame?.streamUrl, activeGame?.infoHash, activeGame?.fileIdx, activeUrl, loadMediaStream]);

  // 1. Host processes incoming commands (PLAY, PAUSE, SEEK) triggered by channel guests
  useEffect(() => {
    if (!isCinemaWatchParty || !isSyncHost) return;
    const handleHostCommand = (e) => {
      const cmd = e.detail;
      const video = videoRef.current;
      if (!cmd || !video) return;

      if (cmd.type === "PLAY") {
        video.play().catch(() => {});
      } else if (cmd.type === "PAUSE") {
        video.pause();
      } else if (cmd.type === "SEEK" && typeof cmd.time === "number") {
        let inBuffer = false;
        if (video.buffered && video.buffered.length > 0) {
          for (let i = 0; i < video.buffered.length; i++) {
            if (cmd.time >= video.buffered.start(i) && cmd.time <= video.buffered.end(i)) {
              inBuffer = true;
              break;
            }
          }
        }
        if (inBuffer) {
          video.currentTime = cmd.time;
        } else {
          const currentSrc = video.src || "";
          if (currentSrc.includes("/torrent/") && !currentSrc.includes("/raw")) {
            try {
              const parsed = new URL(currentSrc);
              parsed.searchParams.set("ss", String(Math.floor(cmd.time)));
              video.src = parsed.toString();
              video.currentTime = 0;
              video.play().catch(() => {});
            } catch (_) {
              video.currentTime = cmd.time;
            }
          } else {
            video.currentTime = cmd.time;
          }
        }
      }
    };
    window.addEventListener("onicord:watch-party-host-command", handleHostCommand);
    return () => window.removeEventListener("onicord:watch-party-host-command", handleHostCommand);
  }, [isCinemaWatchParty, isSyncHost]);

  // 2. Guest real-time synchronization & smooth drift correction
  useEffect(() => {
    if (!isCinemaWatchParty || isSyncHost || !watchPartySession || watchPartySession.type !== "cinema") return;
    const video = videoRef.current;
    if (!video) return;

    // A. Play / Pause state sync
    if (watchPartySession.isPlaying && video.paused && !mediaLoading && !mediaBuffering) {
      video.play().catch(() => {});
    } else if (!watchPartySession.isPlaying && !video.paused) {
      video.pause();
    }

    // B. Playback time alignment & Drift Correction
    if (typeof watchPartySession.currentTime === "number" && video.readyState >= 2 && !mediaLoading) {
      const latencyComp = Math.max(0, (Date.now() - (watchPartySession.updatedAt || Date.now())) / 1000);
      const targetTime = watchPartySession.isPlaying ? watchPartySession.currentTime + latencyComp : watchPartySession.currentTime;
      const drift = targetTime - video.currentTime;

      if (Math.abs(drift) > 2.5) {
        // Large desync (> 2.5s): perform hard seek to realign instantly
        let inBuffer = false;
        if (video.buffered && video.buffered.length > 0) {
          for (let i = 0; i < video.buffered.length; i++) {
            if (targetTime >= video.buffered.start(i) && targetTime <= video.buffered.end(i)) {
              inBuffer = true;
              break;
            }
          }
        }
        if (inBuffer) {
          video.currentTime = Math.max(0, targetTime);
        } else {
          const currentSrc = video.src || "";
          if (currentSrc.includes("/torrent/") && !currentSrc.includes("/raw")) {
            try {
              const parsed = new URL(currentSrc);
              parsed.searchParams.set("ss", String(Math.floor(targetTime)));
              video.src = parsed.toString();
              video.currentTime = 0;
              if (watchPartySession.isPlaying) video.play().catch(() => {});
            } catch (_) {
              video.currentTime = Math.max(0, targetTime);
            }
          } else {
            video.currentTime = Math.max(0, targetTime);
          }
        }
        video.playbackRate = 1.0;
      } else if (drift > 0.5) {
        // Guest is slightly behind (0.5s - 2.5s): speed up slightly (1.04x) without audio pitch warping
        video.playbackRate = 1.04;
      } else if (drift < -0.5) {
        // Guest is slightly ahead (-0.5s - -2.5s): slow down slightly (0.96x)
        video.playbackRate = 0.96;
      } else {
        // Within acceptable network jitter tolerance: standard playback speed
        video.playbackRate = 1.0;
      }
    }
  }, [watchPartySession, isCinemaWatchParty, isSyncHost, mediaLoading, mediaBuffering]);

  // 3. When the Watch Party ends (host leaves or stops movie), guest returns cleanly to catalog
  useEffect(() => {
    const handlePartyEnded = () => {
      if (isCinemaWatchParty && !isSyncHost) {
        handleReturnToCatalog();
      }
    };
    window.addEventListener("onicord:watch-party-ended", handlePartyEnded);
    return () => window.removeEventListener("onicord:watch-party-ended", handlePartyEnded);
  }, [isCinemaWatchParty, isSyncHost, handleReturnToCatalog]);

  // Detectar pistas de audio de la etiqueta video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const detectAudioTracks = () => {
      const tracks = [];
      const raw = video.audioTracks;
      if (raw && raw.length > 0) {
        for (let i = 0; i < raw.length; i++) {
          const t = raw[i];
          const lang = t.language || "";
          let label = t.label;
          if (!label) {
            const friendly = formatLanguageName(lang, true);
            label = friendly ? `Audio ${friendly}` : `Pista de Audio ${i + 1}`;
          }
          tracks.push({
            id: i,
            label,
            lang,
            enabled: Boolean(t.enabled),
          });
        }
      }
      setAudioTracks(tracks);
    };

    video.addEventListener("loadedmetadata", detectAudioAudioTracksSafety);
    function detectAudioAudioTracksSafety() {
      detectAudioTracks();
    }

    if (video.audioTracks) {
      video.audioTracks.addEventListener?.("change", detectAudioTracks);
      video.audioTracks.addEventListener?.("addtrack", detectAudioTracks);
      video.audioTracks.addEventListener?.("removetrack", detectAudioTracks);
    }

    return () => {
      video.removeEventListener("loadedmetadata", detectAudioAudioTracksSafety);
      if (video.audioTracks) {
        video.audioTracks.removeEventListener?.("change", detectAudioTracks);
        video.audioTracks.removeEventListener?.("addtrack", detectAudioTracks);
        video.audioTracks.removeEventListener?.("removetrack", detectAudioTracks);
      }
    };
  }, [activeGame]);

  // Notificar cambios de pantalla completa al sistema para ocultar la TitleBar y manejar Escape
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("onicord:stage-fullscreen-change", {
        detail: { isFullscreen },
      })
    );
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onToggleFullscreen?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, onToggleFullscreen]);

  // Sincronizar textTracks de HTML5 y alimentar el overlay de subtítulos de alta visibilidad
  useEffect(() => {
    setActiveCueText("");
    const video = videoRef.current;
    if (!video?.textTracks) return;

    const tracks = video.textTracks;
    let cleanup = null;

    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const sub = mediaSubtitles[i];
      if (currentSubtitle !== "off" && sub && sub.id === currentSubtitle) {
        // 'hidden' oculta el renderizado nativo tosco del navegador en el fondo,
        // pero permite que sigan disparándose los eventos cuechange para nuestro overlay personalizado
        track.mode = "hidden";
        const handleCueChange = () => {
          const cues = track.activeCues;
          if (cues && cues.length > 0) {
            const rawText = Array.from(cues).map((c) => c.text).join("\n");
            // Limpiar etiquetas HTML residuales (ej: <i>, <b>, <c>) si vinieran del VTT
            const cleanText = rawText.replace(/<[^>]*>/g, "").trim();
            setActiveCueText(cleanText);
          } else {
            setActiveCueText("");
          }
        };
        track.addEventListener("cuechange", handleCueChange);
        handleCueChange();
        cleanup = () => track.removeEventListener("cuechange", handleCueChange);
      } else {
        track.mode = "disabled";
      }
    }

    return () => {
      if (cleanup) cleanup();
    };
  }, [currentSubtitle, mediaSubtitles]);

  // Agnostic state for native confirmation dialogs (used by stage and addons)
  const [addonConfirmDialog, setAddonConfirmDialog] = useState(null);
  const [isClearingStorage, setIsClearingStorage] = useState(false);

  const handleConfirmClearStorage = async () => {
    setIsClearingStorage(true);
    try {
      if (window.electronAPI?.clearStageStorage) {
        const res = await window.electronAPI.clearStageStorage();
        console.log("[AddonStage] Datos de juegos eliminados con éxito:", res);
        iframeRef.current?.contentWindow?.postMessage(
          { type: "ONICORD_CLEAR_STAGE_STORAGE_SUCCESS", success: res?.success !== false },
          "*"
        );
      }
    } catch (err) {
      console.error("[AddonStage] Error al borrar almacenamiento:", err);
    } finally {
      setIsClearingStorage(false);
      setAddonConfirmDialog(null);
    }
  };

  const handleRequestClearStorage = () => {
    setAddonConfirmDialog({
      title: t("stage.clearStorageTitle"),
      message: t("stage.clearStorageMsg"),
      warningMessage: t("stage.clearStorageWarn"),
      confirmLabel: t("stage.clearStorageConfirm"),
      cancelLabel: t("stage.cancel"),
      type: "danger",
      onConfirm: handleConfirmClearStorage,
    });
  };

  const handleDialogConfirm = () => {
    if (addonConfirmDialog?.requestId) {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "ONICORD_CONFIRM_RESPONSE",
          requestId: addonConfirmDialog.requestId,
          confirmed: true,
        },
        "*"
      );
    }
    if (typeof addonConfirmDialog?.onConfirm === "function") {
      addonConfirmDialog.onConfirm();
    } else {
      setAddonConfirmDialog(null);
    }
  };

  const handleDialogCancel = () => {
    if (addonConfirmDialog?.requestId) {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: "ONICORD_CONFIRM_RESPONSE",
          requestId: addonConfirmDialog.requestId,
          confirmed: false,
        },
        "*"
      );
    }
    if (typeof addonConfirmDialog?.onCancel === "function") {
      addonConfirmDialog.onCancel();
    }
    setAddonConfirmDialog(null);
  };

  useEffect(() => {
    setActiveUrl(stageData?.url || null);
    setActiveHtml(stageData?.htmlContent || null);
    setActiveTitle(stageData?.title || "Escenario de Complemento");

    const isDirectMedia = Boolean(
      stageData?.streamUrl ||
      stageData?.mediaType === "video" ||
      (stageData?.type === "movie" && (stageData?.url || stageData?.streamUrl))
    );

    if (isDirectMedia) {
      const initialDur = typeof stageData.duration === "number" && stageData.duration > 0 ? stageData.duration : 0;
      knownTotalDurationRef.current = initialDur;
      setMediaDuration(initialDur);
      loadingDoneRef.current = false;
      setLoadingProgress(0);
      setMediaLoading(true);
      setMediaPlaying(false);
      setMediaError(null);
      setMediaBuffering(false);

      const isHostFlag = stageData.isSyncHost !== false;
      const gameObj = {
        ...stageData,
        title: stageData.title,
        streamUrl: stageData.streamUrl || stageData.url,
        url: stageData.streamUrl || stageData.url,
        type: "movie",
        mediaType: "video",
        cover: stageData.cover || stageData.activity?.cover || null,
        logo: stageData.logo || null,
        banner: stageData.banner || null,
        subtitles: stageData.subtitles || [],
        isChannel: Boolean(stageData.isChannel),
        syncMode: stageData.syncMode || "group",
        isSyncHost: isHostFlag,
      };
      setActiveGame(gameObj);
      setActiveUrl(stageData.streamUrl || stageData.url);
      setActiveHtml(null);

      if (Array.isArray(stageData.subtitles) && stageData.subtitles.length > 0) {
        resolveSubtitlesList(stageData.subtitles);
      }

      if (stageData.infoHash) {
        const port = 42883;
        fetch(`http://127.0.0.1:${port}/torrent/${stageData.infoHash}/${stageData.fileIdx || 0}/meta`)
          .then((r) => (r.ok ? r.json() : null))
          .then((meta) => {
            if (meta && typeof meta.duration === "number" && meta.duration > 0) {
              knownTotalDurationRef.current = meta.duration;
              setMediaDuration(meta.duration);
            }
          })
          .catch(() => {});
      }
    } else {
      setActiveGame(null);
    }

    // If the stage opens with a defined activity (e.g. direct game or chat embed), sync RPC immediately
    if (stageData?.activity && window.electronAPI?.setStageActivity) {
      const isMedia = stageData?.pluginId === "onicord-cinema" || stageData?.icon === "movie" || stageData?.title === "Cinema" || stageData?.activity?.type === "movie";
      window.electronAPI.setStageActivity({
        pluginId: stageData?.pluginId,
        name: stageData.activity.name,
        details: stageData.activity.details || stageData?.title || "Complemento",
        state: stageData.activity.state || null,
        cover: stageData.activity.cover || null,
        type: isMedia ? "movie" : (stageData.activity.type || (stageData.activity.isCatalog ? "launcher" : "game")),
        isCatalog: Boolean(stageData.activity.isCatalog),
        startTime: stageData.activity.startTime || Date.now(),
      });
    }
  }, [stageData, resolveSubtitlesList]);

  const [position, setPosition] = useState(() => {
    const width = typeof window !== "undefined" ? window.innerWidth : 1200;
    const height = typeof window !== "undefined" ? window.innerHeight : 800;
    return {
      x: Math.max(10, width - 360),
      y: Math.max(10, height - 250),
    };
  });
  const currentPos = useRef(position);
  const isDragging = useRef(false);
  const stageContainerRef = useRef(null);
  const rafId = useRef(null);
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  useEffect(() => {
    return () => {
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  // Listen for messages emitted from internal stage widgets
  useEffect(() => {
    const handleWindowMessage = (e) => {
      // 1. Validate sender: only accept messages originating from our own iframe
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      if (!e.data || typeof e.data !== "object") return;

      if (
        e.data.type === "ONICORD_STAGE_LAUNCH_GAME" ||
        e.data.type === "ONICORD_STAGE_LAUNCH_ITEM" ||
        e.data.type === "ONICORD_STAGE_NAVIGATE"
      ) {
        // Isolation guard: if external target is running, do not allow navigation commands from remote web
        if (activeGameRef.current && !activeHtmlRef.current) {
          return;
        }

        const game = e.data.item || e.data.game || e.data.target;
        if (game && typeof game.url === "string") {
          const rawUrl = game.url.trim();
          // Strict web protocol validation: only https:// or http:// (blocks javascript:, file:, data:, onicord-media:)
          if (!rawUrl.startsWith("https://") && !rawUrl.startsWith("http://")) {
            console.warn("[AddonStageDisplay] URL de juego descartada por protocolo no seguro:", rawUrl);
            return;
          }

          const safeTitle = typeof game.title === "string" ? game.title.trim().slice(0, 100) : (stageData?.title || "Juego");
          const safeDetails = typeof game.details === "string" ? game.details.trim().slice(0, 150) : (stageData?.title || "Complemento");
          const safeState = typeof game.state === "string" ? game.state.trim().slice(0, 100) : null;
          let safeCover = null;
          if (typeof game.cover === "string") {
            const trimmedCover = game.cover.trim();
            if (trimmedCover.startsWith("https://") || trimmedCover.startsWith("http://") || trimmedCover.startsWith("data:image/") || trimmedCover.startsWith("onicord-media://")) {
              safeCover = trimmedCover;
            }
          }

          const isGeneric = (n) => !n || n === "Jugador" || n === "PLAYER";
          const userNick = (!isGeneric(game.userNick) ? game.userNick : null)
            || (!isGeneric(game.authorName) ? game.authorName : null)
            || (!isGeneric(stageData?.userNick) ? stageData?.userNick : null)
            || (!isGeneric(stageData?.authorName) ? stageData?.authorName : null)
            || (!isGeneric(window._onicordUserNick) ? window._onicordUserNick : null)
            || "Oniverse";

          const isMedia = game.type !== "game" && (game.mediaType === "video" || game.type === "movie" || Boolean(game.streamUrl));
          const gameActivity = {
            pluginId: stageData?.pluginId,
            name: safeTitle,
            details: safeDetails || (isMedia ? "Reproductor" : stageData?.title || "Complemento"),
            state: safeState || (isMedia ? (safeDetails || "Reproduciendo") : "En partida"),
            cover: safeCover,
            type: isMedia ? (game.type || "movie") : (game.type || "game"),
            isCatalog: false,
            startTime: Date.now(),
          };

          const safeGame = {
            ...game,
            title: safeTitle,
            url: rawUrl,
            streamUrl: isMedia ? (game.streamUrl || rawUrl) : null,
            logo: game.logo || null,
            subtitles: game.subtitles || [],
            details: safeDetails,
            state: safeState,
            cover: safeCover,
            userNick: userNick,
            authorName: userNick,
            shareCapture: game.shareCapture || stageData?.shareCapture || null,
            frameScripts: Array.isArray(game.frameScripts) ? game.frameScripts : (stageData?.frameScripts || []),
            type: game.type || (isMedia ? "movie" : "game"),
            mediaType: isMedia ? "video" : (game.mediaType || "app"),
            isCatalog: false,
            isChannel: Boolean(game.isChannel || stageData?.isChannel),
            pluginId: game.pluginId || stageData?.pluginId || "default",
            syncMode: game.syncMode || stageData?.syncMode || (game.isChannel ? "group" : "solo"),
            isSyncHost: stageData?.isSyncHost !== false,
            resumeTime: typeof game.resumeTime === "number" ? game.resumeTime : 0,
            activity: game.activity || gameActivity,
          };

          if (safeGame.isChannel && isMedia && startCinemaWatchParty) {
            startCinemaWatchParty(safeGame);
            if (onShareToChat) {
              onShareToChat(safeGame.streamUrl || safeGame.url, {
                ...stageData,
                ...safeGame,
              });
            }
          }

          setMediaError(null);
          setMediaBuffering(false);
          setActiveCueText("");
          if (isMedia) {
            loadingDoneRef.current = false;
            setLoadingProgress(0);
            setMediaLoading(true);
            setMediaPlaying(false);
            setLoadingMessage("Conectando con la fuente de video...");

            const initialDur = typeof game.duration === "number" && game.duration > 0 ? game.duration : 0;
            knownTotalDurationRef.current = initialDur;
            setMediaDuration(initialDur);

            if (game.infoHash) {
              const port = 42883;
              fetch(`http://127.0.0.1:${port}/torrent/${game.infoHash}/${game.fileIdx || 0}/meta`)
                .then((r) => (r.ok ? r.json() : null))
                .then((meta) => {
                  if (meta && typeof meta.duration === "number" && meta.duration > 0) {
                    knownTotalDurationRef.current = meta.duration;
                    setMediaDuration(meta.duration);
                  }
                })
                .catch(() => {});
            }
          }

          if (isMedia && Array.isArray(game.subtitles)) {
            resolveSubtitlesList(game.subtitles);
          } else {
            resolveSubtitlesList([]);
          }

          setActiveGame(safeGame);
          setActiveTitle(safeTitle);
          setActiveHtml(null); // Clear srcDoc so iframe loads the game URL
          setActiveUrl(rawUrl);

          // Synchronize new target with Electron (for frameScript injection, nickname, and room link capture)
          if (window.electronAPI?.openStageView) {
            window.electronAPI.openStageView({
              ...stageData,
              ...safeGame,
              activity: gameActivity,
              url: rawUrl,
              entryPoint: null,
              htmlContent: null,
              isFloating: isMini,
            });
          }

          if (window.electronAPI?.setStageActivity) {
            window.electronAPI.setStageActivity(gameActivity);
          }
        }
      } else if (e.data.type === "ONICORD_CLOSE_STAGE") {
        if (activeGameRef.current && !activeHtmlRef.current) return;
        handleTerminate();
      } else if (e.data.type === "ONICORD_REQUEST_CONFIRM") {
        const req = e.data;
        setAddonConfirmDialog({
          requestId: req.requestId || req.id || String(Date.now()),
          title: req.title || "Confirmación",
          message: req.message || "¿Deseas continuar?",
          warningMessage: req.warningMessage || null,
          confirmLabel: req.confirmLabel || "Confirmar",
          cancelLabel: req.cancelLabel || "Cancelar",
          type: req.type || (req.danger || req.isDanger ? "danger" : "confirm"),
        });
      } else if (e.data.type === "ONICORD_CLEAR_STAGE_STORAGE") {
        const origins = Array.isArray(e.data.origins) ? e.data.origins : undefined;
        if (window.electronAPI?.clearStageStorage) {
          window.electronAPI.clearStageStorage(origins).then((res) => {
            iframeRef.current?.contentWindow?.postMessage(
              { type: "ONICORD_CLEAR_STAGE_STORAGE_SUCCESS", success: Boolean(res?.success) },
              "*"
            );
          });
        }
      } else if (e.data.type === "ONICORD_MEDIA_TIME_UPDATE") {
        setMediaPlaybackTime(typeof e.data.currentTime === "number" ? e.data.currentTime : 0);
        if (typeof e.data.duration === "number" && e.data.duration > 0) {
          setMediaDuration(e.data.duration);
        }
        setMediaPlaying(Boolean(e.data.isPlaying));
      } else if (e.data.type === "ONICORD_MEDIA_SUBTITLES") {
        setMediaSubtitles(Array.isArray(e.data.subtitles) ? e.data.subtitles : []);
        if (e.data.currentSubtitle) {
          setCurrentSubtitle(e.data.currentSubtitle);
        }
      } else if (e.data.type === "ONICORD_STAGE_SET_ACTIONS") {
        if (Array.isArray(e.data.actions)) {
          setStageActions(e.data.actions);
        }
        syncStageContextToIframe();
      } else if (e.data.type === "ONICORD_STAGE_READY") {
        syncStageContextToIframe();
      }
    };

    window.addEventListener("message", handleWindowMessage);
    return () => window.removeEventListener("message", handleWindowMessage);
  }, [stageData, handleTerminate, syncStageContextToIframe]);

  // Volume and mute management for internal media elements and Web Audio subframes with Auto-Ducking support
  useEffect(() => {
    const effectiveVolume = isMuted ? 0 : Math.round(volume * duckMultiplier);
    if (window.electronAPI?.setStageVolume) {
      window.electronAPI.setStageVolume(effectiveVolume, isMuted);
    }
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        const mediaEls = doc.querySelectorAll("audio, video");
        mediaEls.forEach((el) => {
          el.volume = isMuted ? 0 : effectiveVolume / 100;
          el.muted = isMuted;
        });
      }
    } catch (_) {}
  }, [volume, isMuted, duckMultiplier]);

  // Dynamic gamepad detection, focus transfer, and continuous input bridge for game iframe
  useEffect(() => {
    let animId = null;
    let isLoopRunning = false;

    const checkAndSyncGamepads = () => {
      const rawPads = navigator.getGamepads ? navigator.getGamepads() : [];
      const connected = Array.from(rawPads || []).some((p) => p && p.connected);
      setHasGamepad(connected);

      if (!connected) {
        isLoopRunning = false;
        return;
      }

      if (iframeRef.current?.contentWindow) {
        // 1. If game active and any button pressed, guarantee focus
        const anyButtonPressed = Array.from(rawPads).some((p) => p?.buttons?.some((b) => b.pressed));
        if (anyButtonPressed && activeGameRef.current && document.activeElement !== iframeRef.current) {
          try {
            iframeRef.current.focus();
            iframeRef.current.contentWindow.focus();
          } catch (_) {}
        }

        // 2. Stream serialized gamepad state to iframe to bypass cross-origin isolation restrictions
        try {
          const serializablePads = Array.from(rawPads).map((p) => {
            if (!p || !p.connected) return null;
            return {
              id: p.id || "Generic Gamepad",
              index: p.index || 0,
              connected: Boolean(p.connected),
              mapping: p.mapping || "standard",
              timestamp: p.timestamp || performance.now(),
              buttons: p.buttons
                ? p.buttons.map((b) => ({
                    pressed: Boolean(b.pressed),
                    value: typeof b.value === "number" ? b.value : (b.pressed ? 1 : 0),
                  }))
                : [],
              axes: p.axes ? Array.from(p.axes) : [],
            };
          });

          iframeRef.current.contentWindow.postMessage(
            { type: "ONICORD_GAMEPAD_STATE", pads: serializablePads },
            "*"
          );
        } catch (_) {}
      }

      animId = requestAnimationFrame(checkAndSyncGamepads);
    };

    const startLoopIfNeeded = () => {
      const rawPads = navigator.getGamepads ? navigator.getGamepads() : [];
      const connected = Array.from(rawPads || []).some((p) => p && p.connected);
      setHasGamepad(connected);
      if (connected && !isLoopRunning) {
        isLoopRunning = true;
        animId = requestAnimationFrame(checkAndSyncGamepads);
      }
    };

    const onGamepadConnected = () => startLoopIfNeeded();
    const onGamepadDisconnected = () => {
      const rawPads = navigator.getGamepads ? navigator.getGamepads() : [];
      const connected = Array.from(rawPads || []).some((p) => p && p.connected);
      setHasGamepad(connected);
      if (!connected && animId) {
        cancelAnimationFrame(animId);
        isLoopRunning = false;
      }
    };

    window.addEventListener("gamepadconnected", onGamepadConnected);
    window.addEventListener("gamepaddisconnected", onGamepadDisconnected);

    startLoopIfNeeded();

    return () => {
      window.removeEventListener("gamepadconnected", onGamepadConnected);
      window.removeEventListener("gamepaddisconnected", onGamepadDisconnected);
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  // Ensure game iframe captures active focus required for Gamepad API and controls
  useEffect(() => {
    if (activeGame && iframeRef.current) {
      const focusFrame = () => {
        try {
          iframeRef.current?.focus();
          iframeRef.current?.contentWindow?.focus();
        } catch (_) {}
      };
      focusFrame();
      const t1 = setTimeout(focusFrame, 200);
      const t2 = setTimeout(focusFrame, 800);

      // Sync scripts with active subframe
      if (window.electronAPI?.openStageView) {
        const effectiveGameActivity = activeGame?.activity || {
          pluginId: stageData?.pluginId,
          name: activeGame?.title || activeTitle || "Complemento",
          details: activeGame?.details || stageData?.title || "Complemento",
          state: activeGame?.state || (isCurrentMedia ? "Reproduciendo" : "En partida"),
          cover: activeGame?.cover || null,
          type: activeGame?.type || (isCurrentMedia ? "movie" : "game"),
          isCatalog: false,
          startTime: Date.now(),
        };

        window.electronAPI.openStageView({
          ...stageData,
          ...activeGame,
          activity: effectiveGameActivity,
          url: activeUrl || activeGame?.url,
          entryPoint: null,
          htmlContent: null,
          isFloating: isMini,
        });
      }

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
  }, [activeGame, activeUrl]);

  // PiP Resize clamp and global pointer release (same as StreamDisplay)
  useEffect(() => {
    if (!isMini) return;
    const handleResize = () => {
      const maxX = Math.max(10, window.innerWidth - 355);
      const maxY = window.innerHeight - 205;
      const currentX = Number.isFinite(currentPos.current?.x) ? currentPos.current.x : window.innerWidth - 360;
      const currentY = Number.isFinite(currentPos.current?.y) ? currentPos.current.y : window.innerHeight - 250;
      const nextX = Math.max(10, Math.min(currentX, maxX));
      const nextY = Math.max(10, Math.min(currentY, maxY));
      currentPos.current = { x: nextX, y: nextY };
      if (stageContainerRef.current) {
        stageContainerRef.current.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`;
      }
      setPosition({ x: nextX, y: nextY });
    };
    handleResize();
    const handleGlobalPointerUp = (e) => {
      if (isDragging.current) {
        handlePointerUp(e);
      }
    };
    window.addEventListener("resize", handleResize);
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerUp);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerUp);
    };
  }, [isMini]);

  // Fullscreen inactivity timer for control bar
  useEffect(() => {
    if (!isFullscreen) {
      setShowControls(true);
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      return;
    }

    setShowControls(true);
    const resetTimer = () => {
      setShowControls(true);
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      inactivityTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    };

    resetTimer();
    window.addEventListener("mousemove", resetTimer, { passive: true });
    window.addEventListener("pointermove", resetTimer, { passive: true });
    window.addEventListener("keydown", resetTimer, { passive: true });

    return () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current);
      }
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("pointermove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
    };
  }, [isFullscreen]);

  const handlePointerDown = (e) => {
    if (e.target.closest("button") || e.target.closest("input")) return;
    isDragging.current = true;
    hasMoved.current = false;
    lastPointerPos.current = { x: e.clientX, y: e.clientY };

    if (stageContainerRef.current) {
      try {
        stageContainerRef.current.setPointerCapture(e.pointerId);
      } catch (_) {}
      stageContainerRef.current.style.transition = "none";
      stageContainerRef.current.style.willChange = "transform";
    }
    if (iframeRef.current) {
      iframeRef.current.style.pointerEvents = "none";
    }
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    const deltaX = e.clientX - lastPointerPos.current.x;
    const deltaY = e.clientY - lastPointerPos.current.y;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      hasMoved.current = true;
    }

    lastPointerPos.current = { x: e.clientX, y: e.clientY };

    const maxX = Math.max(10, window.innerWidth - 355);
    const maxY = Math.max(10, window.innerHeight - 205);
    const currentX = Number.isFinite(currentPos.current?.x) ? currentPos.current.x : window.innerWidth - 360;
    const currentY = Number.isFinite(currentPos.current?.y) ? currentPos.current.y : window.innerHeight - 250;
    const nextX = Math.max(10, Math.min(currentX + deltaX, maxX));
    const nextY = Math.max(10, Math.min(currentY + deltaY, maxY));

    currentPos.current = { x: nextX, y: nextY };

    if (!rafId.current) {
      rafId.current = requestAnimationFrame(() => {
        if (stageContainerRef.current) {
          stageContainerRef.current.style.transform = `translate3d(${currentPos.current.x}px, ${currentPos.current.y}px, 0)`;
        }
        rafId.current = null;
      });
    }
  };

  const handlePointerUp = (e) => {
    if (!isDragging.current) return;
    isDragging.current = false;

    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    if (stageContainerRef.current) {
      stageContainerRef.current.style.transform = `translate3d(${currentPos.current.x}px, ${currentPos.current.y}px, 0)`;
      stageContainerRef.current.style.transition = "";
      stageContainerRef.current.style.willChange = "";
      try {
        if (e?.pointerId !== undefined && stageContainerRef.current.hasPointerCapture(e.pointerId)) {
          stageContainerRef.current.releasePointerCapture(e.pointerId);
        }
      } catch (_) {}
    }
    if (iframeRef.current) {
      iframeRef.current.style.pointerEvents = "auto";
    }

    setPosition({ ...currentPos.current });
  };

  const stageTitle = activeTitle || stageData?.title || "Escenario de Complemento";

  const isCatalogLauncher =
    !activeGame &&
    (Boolean(stageData?.activity?.isCatalog) ||
      stageData?.activity?.type === "launcher" ||
      Boolean(stageData?.entryPoint) ||
      Boolean(activeHtml));

  // Dynamic classes for persistent root container (iframe is NEVER unmounted)
  let containerClasses = "";
  let containerStyles = {};

  if (isMini) {
    containerClasses =
      "fixed bg-onicord-surface w-[340px] h-[190px] rounded-onicord-inner overflow-hidden border-2 border-[var(--accent-purple)] shadow-2xl z-40 cursor-move group hover:scale-[1.01] transition-transform duration-150 touch-none select-none flex flex-col";
    containerStyles = {
      top: 0,
      left: 0,
      transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
    };
  } else if (isFullscreen) {
    containerClasses =
      "fixed inset-0 z-[999999] w-screen h-screen bg-black flex flex-col select-none overflow-hidden";
  } else {
    // Modo Normal / Inline
    containerClasses =
      "relative flex-1 w-full h-full min-h-0 min-w-0 flex flex-col bg-onicord-surface select-none overflow-hidden rounded-onicord-inner border border-onicord-island";
  }

  return (
    <div
      ref={stageContainerRef}
      onPointerDown={isMini ? handlePointerDown : undefined}
      onPointerMove={isMini ? handlePointerMove : undefined}
      onPointerUp={isMini ? handlePointerUp : undefined}
      onPointerCancel={isMini ? handlePointerUp : undefined}
      style={containerStyles}
      className={containerClasses}
    >
      {/* 1. PERSISTENT CENTRAL CONTENT (Iframe remains mounted to prevent reload flashes; Video element used for movies) */}
      <div
        onPointerDown={() => {
          try {
            iframeRef.current?.focus();
            iframeRef.current?.contentWindow?.focus();
          } catch (_) {}
        }}
        className="flex-1 w-full h-full relative overflow-hidden bg-black min-h-0 min-w-0 pointer-events-auto"
      >
        {isCurrentMedia ? (
          <div
            className="w-full h-full relative overflow-hidden bg-black flex items-center justify-center cursor-pointer select-none"
            onClick={(e) => {
              if (e.target === videoRef.current || e.currentTarget === e.target) {
                if (isCinemaWatchParty && !isSyncHost && toggleWatchPartyPlayPause) {
                  toggleWatchPartyPlayPause();
                  return;
                }
                if (videoRef.current) {
                  if (videoRef.current.paused) videoRef.current.play().catch(() => {});
                  else videoRef.current.pause();
                }
              }
            }}
            onDoubleClick={(e) => {
              if (e.target === videoRef.current || e.currentTarget === e.target) {
                if (onToggleFullscreen) onToggleFullscreen();
              }
            }}
          >
            <style>{`
              video::cue {
                background-color: rgba(6, 6, 10, 0.82) !important;
                color: #ffffff !important;
                font-family: 'Outfit', 'Roboto', sans-serif !important;
                font-size: 1.15rem !important;
                font-weight: 600 !important;
                text-shadow: 0 1px 4px rgba(0, 0, 0, 0.95) !important;
                border-radius: 6px !important;
                padding: 3px 8px !important;
              }
            `}</style>

            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain bg-black"
              onLoadStart={() => setLoadingProgress((p) => Math.max(p, 10))}
              onLoadedMetadata={(e) => {
                setLoadingProgress((p) => Math.max(p, 45));
                const v = e.currentTarget;
                if (v.duration && Number.isFinite(v.duration) && v.duration > 0) {
                  if (!knownTotalDurationRef.current || knownTotalDurationRef.current < 60) {
                    knownTotalDurationRef.current = v.duration;
                    setMediaDuration(v.duration);
                  }
                }
                if (activeGame?.resumeTime && activeGame.resumeTime > 5) {
                  if (Math.abs(v.currentTime - activeGame.resumeTime) > 3) {
                    try { v.currentTime = activeGame.resumeTime; } catch (_) {}
                  }
                }
              }}
              onProgress={(e) => {
                const v = e.currentTarget;
                if (v.buffered && v.buffered.length > 0) {
                  const bufEnd = v.buffered.end(v.buffered.length - 1);
                  const pct = Math.min(95, Math.round((bufEnd / 5) * 95));
                  setLoadingProgress((p) => Math.max(p, pct));
                }
              }}
              onLoadedData={() => setLoadingProgress((p) => Math.max(p, 65))}
              onCanPlay={() => {
                setLoadingProgress((p) => Math.max(p, 88));
                if (activeGame?.resumeTime && activeGame.resumeTime > 5) {
                  const v = videoRef.current;
                  if (v && Math.abs(v.currentTime - activeGame.resumeTime) > 3) {
                    try { v.currentTime = activeGame.resumeTime; } catch (_) {}
                  }
                }
                if (isCinemaWatchParty && !isSyncHost && watchPartySession && typeof watchPartySession.currentTime === "number") {
                  const latencyComp = Math.max(0, (Date.now() - (watchPartySession.updatedAt || Date.now())) / 1000);
                  const targetTime = watchPartySession.isPlaying ? watchPartySession.currentTime + latencyComp : watchPartySession.currentTime;
                  if (videoRef.current && Math.abs(targetTime - videoRef.current.currentTime) > 1.5) {
                    videoRef.current.currentTime = Math.max(0, targetTime);
                  }
                  if (watchPartySession.isPlaying) {
                    videoRef.current?.play().catch(() => {});
                  } else {
                    videoRef.current?.pause();
                  }
                }
              }}
              onTimeUpdate={(e) => {
                const ct = e.target.currentTime;
                const dur = e.target.duration && Number.isFinite(e.target.duration) && e.target.duration > 0 ? e.target.duration : (activeGame?.duration || 0);
                if (ct > 0 && !e.target.paused) finishMediaLoading();
                setMediaPlaybackTime(ct);
                if (isCinemaWatchParty && isSyncHost && updateHostPlaybackTime) {
                  updateHostPlaybackTime(ct);
                }
                if (dur > 0) {
                  if (!knownTotalDurationRef.current || Math.abs(dur - knownTotalDurationRef.current) < 5) {
                    setMediaDuration(dur);
                  }
                }
                setMediaPlaying(!e.target.paused);
                if (Math.abs(ct - lastSavedContinueTimeRef.current) >= 4) {
                  lastSavedContinueTimeRef.current = ct;
                  saveContinueWatching(ct, dur);
                }
              }}
              onPlay={() => {
                setMediaPlaying(true);
                if (isCinemaWatchParty && isSyncHost && broadcastWatchPartyState) {
                  broadcastWatchPartyState({ isPlaying: true, currentTime: videoRef.current?.currentTime ?? 0 });
                }
              }}
              onPause={() => {
                setMediaPlaying(false);
                if (videoRef.current) {
                  saveContinueWatching(videoRef.current.currentTime, videoRef.current.duration || 0);
                }
                if (isCinemaWatchParty && isSyncHost && broadcastWatchPartyState) {
                  broadcastWatchPartyState({ isPlaying: false, currentTime: videoRef.current?.currentTime ?? 0 });
                }
              }}
              onSeeked={() => {
                if (isCinemaWatchParty && isSyncHost && broadcastWatchPartyState) {
                  broadcastWatchPartyState({ currentTime: videoRef.current?.currentTime ?? 0 });
                }
              }}
              onWaiting={() => {
                if (!mediaLoading) {
                  setMediaBuffering(true);
                }
              }}
              onPlaying={() => {
                finishMediaLoading();
                setMediaBuffering(false);
                setMediaError(null);
              }}
              onError={handleMediaError}
              onEnded={() => {
                if (activeGameRef.current?.id) {
                  removeContinueWatching(activeGameRef.current.id);
                }
                handleReturnToCatalog();
              }}
            >
              {mediaSubtitles.map((sub) => (
                <track
                  key={sub.id}
                  kind="subtitles"
                  label={sub.label || sub.lang || sub.id}
                  srcLang={sub.lang || "es"}
                  src={sub.url}
                  default={currentSubtitle === sub.id}
                />
              ))}
            </video>

            {/* Dedicated High-Visibility React Subtitle Overlay */}
            {currentSubtitle !== "off" && activeCueText && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-20 md:bottom-24 z-20 pointer-events-none max-w-[85%] text-center select-none transition-all duration-150">
                <span
                  className="inline-block px-4 py-2 rounded-xl bg-black/85 text-white font-bold text-xl md:text-3xl leading-snug tracking-wide shadow-2xl border border-white/10"
                  style={{
                    textShadow: "0 2px 4px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.9)",
                  }}
                >
                  {activeCueText}
                </span>
              </div>
            )}

            {/* Media Loading Overlay with Backdrop & Logo/Title */}
            {mediaLoading && !mediaError && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-hidden bg-black select-none pointer-events-auto">
                {/* Backdrop borroso cinematográfico */}
                {(activeGame.banner || activeGame.cover) && (
                  <img
                    src={activeGame.banner || activeGame.cover}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover filter blur-3xl brightness-[0.22] scale-110 pointer-events-none transition-opacity duration-700"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/85 pointer-events-none" />

                {/* Contenedor central cinemático (únicamente el logo/título) */}
                <div className="relative z-10 flex items-center justify-center max-w-4xl p-10 text-center overflow-visible animate-in fade-in zoom-in-95 duration-300">
                  {activeGame.logo && !logoLoadFailed ? (
                    <div className="relative inline-flex items-center justify-center max-w-[85vw] md:max-w-xl max-h-[160px] md:max-h-[200px] overflow-visible">
                      {/* Capa 1: Logo base atenuado/background */}
                      <img
                        src={activeGame.logo}
                        alt={activeGame.title}
                        className="w-auto h-auto max-w-full max-h-[160px] md:max-h-[200px] object-contain opacity-20 select-none pointer-events-none"
                        onError={() => setLogoLoadFailed(true)}
                      />

                      {/* Capa 2: Wrapper con drop-shadow sutil fuera del clip-path para que el glow jamás se corte con el contenedor */}
                      <div
                        className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-visible"
                        style={{
                          filter: "drop-shadow(0 0 8px rgba(255, 255, 255, 0.28))",
                        }}
                      >
                        <img
                          src={activeGame.logo}
                          alt=""
                          aria-hidden="true"
                          style={{
                            clipPath: `inset(0 ${Math.max(0, 100 - loadingProgress)}% 0 0)`,
                            transition: "clip-path 220ms ease-out",
                          }}
                          className="w-auto h-auto max-w-full max-h-[160px] md:max-h-[200px] object-contain select-none pointer-events-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="relative inline-block max-w-full overflow-visible">
                      {/* Capa 1: Título base atenuado/hollow */}
                      <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black uppercase tracking-wider text-white/15 select-none leading-tight">
                        {activeGame.title}
                      </h1>

                      {/* Capa 2: Wrapper con drop-shadow sutil fuera del clip-path para evitar cortes */}
                      <div
                        className="absolute inset-0 pointer-events-none overflow-visible"
                        style={{
                          filter: "drop-shadow(0 0 8px rgba(255, 255, 255, 0.28))",
                        }}
                      >
                        <h1
                          aria-hidden="true"
                          style={{
                            clipPath: `inset(0 ${Math.max(0, 100 - loadingProgress)}% 0 0)`,
                            transition: "clip-path 220ms ease-out",
                          }}
                          className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black uppercase tracking-wider text-white select-none leading-tight"
                        >
                          {activeGame.title}
                        </h1>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error Overlay */}
            {mediaError && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 p-6 text-center select-text">
                <MaterialIcon name="error_outline" size={48} className="text-red-500 mb-3" />
                <h3 className="text-lg font-bold text-white mb-2">{t("stage.playbackErrorTitle")}</h3>
                <p className="text-sm text-gray-300 max-w-md mb-6">{mediaError}</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReturnToCatalog();
                  }}
                  className="px-5 py-2.5 bg-onicord-accent hover:bg-red-600 text-white font-semibold text-sm rounded-xl transition cursor-pointer shadow-lg"
                >
                  {t("stage.returnAndChooseSource")}
                </button>
              </div>
            )}

            {/* Buffering Indicator */}
            {mediaBuffering && !mediaLoading && !mediaError && mediaPlaybackTime > 0 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 pointer-events-none">
                <div className="w-12 h-12 border-4 border-white/20 border-t-red-500 rounded-full animate-spin mb-3"></div>
                <span className="text-xs text-white/80 font-medium">{t("stage.buffering")}</span>
              </div>
            )}
          </div>
        ) : (
          <iframe
            key={
              activeGame
                ? `game-${activeGame.id || activeGame.title || activeUrl || "active"}`
                : activeHtml
                  ? `catalog-${stageData?.pluginId || "launcher"}`
                  : `direct-${activeUrl || "stage"}`
            }
            ref={iframeRef}
            src={activeUrl || undefined}
            srcDoc={activeHtml || undefined}
            title={stageTitle}
            onLoad={syncStageContextToIframe}
            sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-downloads"
            allow="gamepad; autoplay; fullscreen; pointer-lock; clipboard-read; clipboard-write; microphone; hid; usb; screen-wake-lock; wake-lock;"
            className="w-full h-full border-0 bg-black block outline-none"
            tabIndex={0}
          />
        )}

        {/* 2. PiP Mode overlay (StreamDisplay style: drag across entire surface and control buttons) */}
        {isMini && (
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDoubleClick={() => !hasMoved.current && onToggleSize?.()}
            className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/70 flex flex-col justify-between p-2.5 z-20 cursor-move pointer-events-auto touch-none select-none"
          >
            <div className="flex items-center justify-between w-full pointer-events-none">
              <span className="bg-black/75 px-2.5 py-1 rounded-md text-[11px] text-white font-semibold select-none truncate max-w-[200px] flex items-center gap-1.5 backdrop-blur-sm border border-white/10 shadow-sm pointer-events-none">
                <MaterialIcon name={stageData?.icon || "sports_esports"} size={14} className="text-onicord-accent shrink-0" />
                <span className="truncate">{stageTitle}</span>
              </span>

              <div className="flex items-center gap-1.5 pointer-events-auto">
                {activeGame && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleReturnToCatalog();
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-onicord-surface text-emerald-400 hover:bg-onicord-overlay hover:text-emerald-300 transition duration-150 shadow-md cursor-pointer border border-emerald-500/30"
                    title={isCurrentMedia ? t("stage.returnToCatalog") : t("stage.returnToGamesCatalog")}
                  >
                    <MaterialIcon name="apps" size={16} />
                  </button>
                )}
                {onToggleSize && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (!hasMoved.current && onToggleSize) onToggleSize();
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-onicord-surface text-onicord-text hover:bg-onicord-overlay hover:text-white transition duration-150 shadow-md cursor-pointer border border-white/10"
                    title={t("stage.expandToStage")}
                  >
                    <IconFullscreen size="lg" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex justify-end pointer-events-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleTerminate();
                }}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-onicord-surface text-onicord-text hover:bg-red-500/80 hover:text-white transition duration-150 shadow-md cursor-pointer border border-white/10"
                title={isCurrentMedia ? t("stage.closePlayback") : t("stage.closeGame")}
              >
                <IconClose size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Top Left Badge (visible only in normal or fullscreen mode) */}
      {!isMini && (
        <div
          className={`absolute top-4 left-4 z-30 flex items-center gap-2 bg-black/80 border border-white/10 px-3.5 py-1.5 rounded-full text-xs shadow-2xl backdrop-blur-md select-none transition-all duration-300 pointer-events-auto ${
            isFullscreen && !showControls
              ? "opacity-0 -translate-y-4 pointer-events-none"
              : "opacity-100 translate-y-0 pointer-events-auto"
          }`}
        >
          <MaterialIcon name={isCinemaWatchParty ? "movie" : (stageData?.icon || "sports_esports")} size={16} className="text-onicord-accent" />
          <span className="font-semibold text-white truncate max-w-[200px]">{stageTitle}</span>
          {isCinemaWatchParty && (
            <span className="onicord-live-badge text-[10px]">
              {isSyncHost ? t("stage.host", "Anfitrión") : (watchPartySession?.hostNickname || t("stage.synced", "Sincronizado"))}
            </span>
          )}
          {hasGamepad && (
            <span className="flex items-center gap-1 text-[11px] text-green-400 bg-green-950/60 border border-green-500/30 px-2 py-0.5 rounded-full">
              <MaterialIcon name="gamepad" size={12} />
              {t("stage.gamepadReady")}
            </span>
          )}
        </div>
      )}

      {/* 3b. Top Right Controls (discreet in catalog/launcher mode: Dynamic Addon Actions, fullscreen, and close) */}
      {!isMini && isCatalogLauncher && (
        <div
          className={`absolute top-4 right-4 z-30 flex items-center gap-2 select-none transition-all duration-300 pointer-events-auto ${
            isFullscreen && !showControls
              ? "opacity-0 -translate-y-4 pointer-events-none"
              : "opacity-100 translate-y-0 pointer-events-auto"
          }`}
        >
          {/* Dynamic Actions registered by the active addon */}
          {stageActions.map((act) => (
            <button
              key={act.id}
              type="button"
              onClick={() => {
                if (act.id === "clear_storage") {
                  handleRequestClearStorage();
                }
                iframeRef.current?.contentWindow?.postMessage(
                  { type: "ONICORD_STAGE_ACTION_CLICK", actionId: act.id, action: act },
                  "*"
                );
              }}
              className={`flex h-8 w-8 items-center justify-center rounded-full bg-black/60 hover:bg-black/90 ${
                act.danger
                  ? "hover:text-red-400"
                  : act.icon === "star"
                  ? "hover:text-amber-400"
                  : "hover:text-emerald-400"
              } border border-white/10 text-white/80 transition-all shadow-lg backdrop-blur-md cursor-pointer`}
              title={act.title}
            >
              <MaterialIcon name={act.icon} size={18} />
            </button>
          ))}

          {onToggleFullscreen && (
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 hover:bg-black/90 border border-white/10 text-white/80 hover:text-white transition-all shadow-lg backdrop-blur-md cursor-pointer"
              title={isFullscreen ? t("voice.exitFullScreen") : t("voice.fullScreen")}
            >
              {isFullscreen ? <IconFullscreenExit size="sm" /> : <IconFullscreen size="sm" />}
            </button>
          )}
          <button
            type="button"
            onClick={handleTerminate}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 hover:bg-red-500/80 border border-white/10 text-white/80 hover:text-white transition-all shadow-lg backdrop-blur-md cursor-pointer"
            title={t("stage.closeCatalog")}
          >
            <IconClose size={16} />
          </button>
        </div>
      )}

      {/* 4. Generic Bottom Media & Stage Control Bar (populates controls dynamically based on active content capabilities) */}
      {!isMini && !isCatalogLauncher && (
        <FloatingMediaBar visible={!isFullscreen || showControls}>
          {/* 1. Return to Catalog button (common to games, movies, music, and apps) */}
          {(activeGame || catalogStageRef.current) && (
            <FloatingMediaBar.PillButton
              icon="apps"
              label={t("stage.catalog")}
              variant="success"
              title={t("stage.returnToCatalog")}
              onClick={handleReturnToCatalog}
            />
          )}

          {/* Watch Party synchronization indicator */}
          {isCinemaWatchParty && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-onicord-accent/15 border border-onicord-accent/30 text-onicord-accent text-xs font-semibold select-none shrink-0">
              <MaterialIcon name="groups" size={15} />
              <span>
                {isSyncHost
                  ? t("stage.watchPartyHost", "Anfitrión")
                  : (watchPartySession?.hostNickname ? `Host: ${watchPartySession.hostNickname}` : t("stage.synced", "Sincronizado"))}
              </span>
            </div>
          )}

          {/* 2. Play / Pause & Timeline controls (for video/audio media streams) */}
          {(isCurrentMedia || activeGame?.hasTimeline) && (
            <>
              <FloatingMediaBar.IconButton
                icon={mediaPlaying ? "pause" : "play_arrow"}
                title={mediaPlaying ? t("stage.pause") : t("stage.play")}
                primary={!mediaPlaying}
                onClick={() => {
                  if (isCinemaWatchParty && !isSyncHost && toggleWatchPartyPlayPause) {
                    toggleWatchPartyPlayPause();
                    return;
                  }
                  if (videoRef.current) {
                    if (videoRef.current.paused) videoRef.current.play().catch(() => {});
                    else videoRef.current.pause();
                  } else {
                    iframeRef.current?.contentWindow?.postMessage({ type: "ONICORD_MEDIA_TOGGLE_PLAY" }, "*");
                  }
                }}
              />

              <FloatingMediaBar.Timeline
                currentTime={mediaSeeking ? mediaSeekValue : mediaPlaybackTime}
                duration={mediaDuration}
                isSeeking={mediaSeeking}
                onSeekStart={() => setMediaSeeking(true)}
                onSeekChange={(v) => setMediaSeekValue(v)}
                onSeekEnd={(v) => {
                  setMediaSeeking(false);
                  if (isCinemaWatchParty && !isSyncHost && sendWatchPartySeek) {
                    sendWatchPartySeek(v);
                    return;
                  }
                  const vRef = videoRef.current;
                  if (vRef) {
                    let inBuffer = false;
                    if (vRef.buffered && vRef.buffered.length > 0) {
                      for (let i = 0; i < vRef.buffered.length; i++) {
                        if (v >= vRef.buffered.start(i) && v <= vRef.buffered.end(i)) {
                          inBuffer = true;
                          break;
                        }
                      }
                    }
                    if (inBuffer) {
                      vRef.currentTime = v;
                    } else {
                      const currentSrc = vRef.src || "";
                      if (currentSrc.includes("/torrent/") && !currentSrc.includes("/raw")) {
                        try {
                          const parsed = new URL(currentSrc);
                          parsed.searchParams.set("ss", String(Math.floor(v)));
                          vRef.src = parsed.toString();
                          vRef.currentTime = 0;
                          vRef.play().catch(() => {});
                        } catch (_) {
                          vRef.currentTime = v;
                        }
                      } else {
                        vRef.currentTime = v;
                      }
                    }
                  }
                  iframeRef.current?.contentWindow?.postMessage({ type: "ONICORD_MEDIA_SEEK", time: v }, "*");
                }}
                format={(sec) => {
                  if (!sec || isNaN(sec) || sec < 0) return "0:00";
                  const s = Math.floor(sec);
                  const m = Math.floor(s / 60);
                  const remSec = s % 60;
                  const padSec = remSec < 10 ? "0" + remSec : remSec;
                  if (m >= 60) {
                    const h = Math.floor(m / 60);
                    const remMin = m % 60;
                    const padMin = remMin < 10 ? "0" + remMin : remMin;
                    return `${h}:${padMin}:${padSec}`;
                  }
                  return `${m}:${padSec}`;
                }}
              />
            </>
          )}

          {/* 3. Audio Volume (shared across all content types) */}
          <FloatingMediaBar.Volume
            volume={volume}
            max={100}
            step={1}
            isMuted={isMuted}
            onToggleMute={() => {
              const nextMute = !isMuted;
              setIsMuted(nextMute);
              iframeRef.current?.contentWindow?.postMessage({ type: "ONICORD_MEDIA_SET_MUTE", isMuted: nextMute }, "*");
            }}
            onVolumeChange={(val) => {
              setVolume(val);
              if (isMuted && val > 0) setIsMuted(false);
              iframeRef.current?.contentWindow?.postMessage({ type: "ONICORD_MEDIA_SET_VOLUME", volume: val / 100 }, "*");
            }}
            titleMute={t("stage.mute")}
            titleUnmute={t("stage.unmute")}
            customMuteIcon={<IconVolumeOff size="base" />}
            customUnmuteIcon={<IconVolumeUp size="base" />}
            showDividers={Boolean(isCurrentMedia || activeGame?.hasTimeline)}
          />

          {/* 4. Audio Tracks & Subtitles Menus (for media content or tracks) */}
          {(isCurrentMedia || audioTracks.length > 0 || mediaSubtitles.length > 0) && (
            <>
              <FloatingMediaBar.Menu
                icon="audiotrack"
                title={t("stage.audioTrackTitle")}
                menuTitle={t("stage.audioLanguage")}
                active={audioTracks.length > 1}
                isOpen={showAudioMenu}
                widthClass="w-56"
                onToggle={(e) => {
                  e?.stopPropagation();
                  setShowAudioMenu((prev) => !prev);
                  setShowSubtitlesMenu(false);
                }}
                onClose={() => setShowAudioMenu(false)}
                items={
                  audioTracks.length > 0
                    ? audioTracks.map((track) => ({
                        id: track.id,
                        label: track.label,
                        isSelected: currentAudioTrack === track.id,
                        onClick: () => {
                          setCurrentAudioTrack(track.id);
                          const video = videoRef.current;
                          if (video?.audioTracks && video.audioTracks.length > 0) {
                            for (let i = 0; i < video.audioTracks.length; i++) {
                              video.audioTracks[i].enabled = (i === track.id);
                            }
                          }
                          setShowAudioMenu(false);
                        },
                      }))
                    : [
                        {
                          id: 0,
                          label: t("stage.defaultAudioTrack"),
                          isSelected: true,
                          onClick: () => setShowAudioMenu(false),
                        },
                      ]
                }
              />

              <FloatingMediaBar.Menu
                icon="subtitles"
                title={t("stage.subtitles")}
                menuTitle={t("stage.subtitles")}
                active={currentSubtitle !== "off"}
                isOpen={showSubtitlesMenu}
                widthClass="w-64"
                onToggle={(e) => {
                  e?.stopPropagation();
                  setShowSubtitlesMenu((prev) => !prev);
                  setShowAudioMenu(false);
                }}
                onClose={() => setShowSubtitlesMenu(false)}
                items={[
                  {
                    id: "off",
                    label: t("stage.subtitlesOff"),
                    isSelected: currentSubtitle === "off",
                    onClick: () => {
                      setCurrentSubtitle("off");
                      setActiveCueText("");
                      iframeRef.current?.contentWindow?.postMessage({ type: "ONICORD_MEDIA_SET_SUBTITLE", id: "off" }, "*");
                      setShowSubtitlesMenu(false);
                    },
                  },
                  ...(mediaSubtitles.length > 0
                    ? mediaSubtitles.map((sub) => ({
                        id: sub.id,
                        label: sub.label,
                        isSelected: currentSubtitle === sub.id,
                        onClick: () => {
                          setCurrentSubtitle(sub.id);
                          iframeRef.current?.contentWindow?.postMessage({ type: "ONICORD_MEDIA_SET_SUBTITLE", id: sub.id, url: sub.url }, "*");
                          setShowSubtitlesMenu(false);
                        },
                      }))
                    : [
                        {
                          id: "none_available",
                          label: t("stage.noSubtitles"),
                          disabled: true,
                          isSelected: false,
                          onClick: () => setShowSubtitlesMenu(false),
                        },
                      ]),
                ]}
              />
            </>
          )}

          {/* 5. Share / Invite to Chat button (when content supports room/session sharing) */}
          {onShareToChat && (!isCurrentMedia || (isCinemaWatchParty && isSyncHost)) && (
            <FloatingMediaBar.PillButton
              icon="share"
              label={t("stage.inviteToChat", "Invitar al chat")}
              title={t("stage.inviteToChatTitle", "Compartir invitación en el chat")}
              onClick={async () => {
                const currentContext = {
                  ...stageData,
                  ...activeGame,
                  url: activeUrl || activeGame?.url || stageData?.url,
                  shareCapture: activeGame?.shareCapture || stageData?.shareCapture,
                };

                if (isCinemaWatchParty) {
                  onShareToChat(currentContext.streamUrl || currentContext.url, currentContext);
                  return;
                }

                let dynamicUrl = null;
                if (window.electronAPI?.captureStageShareUrl) {
                  try {
                    dynamicUrl = await window.electronAPI.captureStageShareUrl(currentContext);
                  } catch (e) {
                    console.debug("[AddonStage] captureStageShareUrl error:", e);
                  }
                }

                const queryParam = currentContext.shareCapture?.queryParam;
                const urlPattern = currentContext.shareCapture?.urlPattern || null;
                let isValidRoom = false;

                if (dynamicUrl) {
                  if (urlPattern) {
                    try {
                      isValidRoom = new RegExp(urlPattern, "i").test(dynamicUrl);
                    } catch (_) {
                      isValidRoom = false;
                    }
                  } else if (queryParam) {
                    isValidRoom = dynamicUrl.includes(queryParam);
                  } else {
                    isValidRoom = true;
                  }
                }

                if (isValidRoom) {
                  onShareToChat(dynamicUrl, currentContext);
                } else if (!queryParam && !urlPattern && currentContext.url) {
                  onShareToChat(currentContext.url, currentContext);
                } else {
                  setAddonConfirmDialog({
                    title: t("stage.roomNotDetectedTitle"),
                    message: t("stage.roomNotDetectedMsg"),
                    warningMessage: t("stage.roomNotDetectedWarn"),
                    confirmLabel: t("stage.understood"),
                    type: "alert",
                    onConfirm: () => setAddonConfirmDialog(null),
                  });
                }
              }}
            />
          )}

          {/* 6. Custom Controls dynamically registered by any Addon */}
          {Array.isArray(activeGame?.controls) &&
            activeGame.controls.map((ctrl) => (
              <FloatingMediaBar.IconButton
                key={ctrl.id}
                icon={ctrl.icon || "tune"}
                title={ctrl.title || ctrl.label || "Control"}
                active={Boolean(ctrl.active)}
                onClick={() => {
                  iframeRef.current?.contentWindow?.postMessage(
                    { type: "ONICORD_STAGE_CONTROL_CLICK", controlId: ctrl.id, control: ctrl },
                    "*"
                  );
                }}
              />
            ))}

          {/* 7. PiP Mode toggle button (shared across all content) */}
          {onToggleSize && (
            <FloatingMediaBar.PillButton
              icon={<IconFullscreenExit size="base" />}
              label={t("stage.pipMode")}
              title={t("stage.pipModeTitle")}
              onClick={onToggleSize}
            />
          )}

          {/* 8. Fullscreen toggle button (shared across all content) */}
          {onToggleFullscreen && (
            <FloatingMediaBar.IconButton
              icon={isFullscreen ? <IconFullscreenExit size="base" /> : <IconFullscreen size="base" />}
              title={isFullscreen ? t("voice.exitFullScreen") : t("voice.fullScreen")}
              active={isFullscreen}
              onClick={onToggleFullscreen}
            />
          )}

          {/* 9. Stop / Close Stage button (shared across all content) */}
          <FloatingMediaBar.StopButton
            icon={<IconStopStream size="base" />}
            title={t("stage.closeStage")}
            onClick={handleTerminate}
          />
        </FloatingMediaBar>
      )}

      {/* 5. Standard Onicord Confirmation Modal for Addons and Stage */}
      {addonConfirmDialog && (
        <ConfirmDialogModal
          isOpen={Boolean(addonConfirmDialog)}
          title={addonConfirmDialog.title}
          message={addonConfirmDialog.message}
          warningMessage={addonConfirmDialog.warningMessage}
          confirmLabel={isClearingStorage ? t("stage.clearing") : addonConfirmDialog.confirmLabel}
          cancelLabel={addonConfirmDialog.cancelLabel}
          type={addonConfirmDialog.type || "confirm"}
          onConfirm={handleDialogConfirm}
          onCancel={handleDialogCancel}
        />
      )}
    </div>
  );
}
