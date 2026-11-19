import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { IconClose } from "../icons/StreamIcons";
import MaterialIcon from "../icons/MaterialIcon";
import { soundEngine } from "../../lib/soundEngine";
import { useAnimatedMount } from "../../hooks/useAnimatedMount";
import { cn } from "../../lib/cn";
import Select from "../ui/Select";
import { acquireWebcamStream } from "../../lib/voice/webcamCompositor";

const WEBCAM_CORNER_OPTIONS = [
  { id: "top-left", icon: "north_west", defaultLabel: "Superior izquierda" },
  { id: "top-right", icon: "north_east", defaultLabel: "Superior derecha" },
  { id: "bottom-left", icon: "south_west", defaultLabel: "Inferior izquierda" },
  { id: "bottom-right", icon: "south_east", defaultLabel: "Inferior derecha" },
];

export default function ScreenShareModal({
  isOpen,
  onClose,
  onSelectSource,
  preferredWebcamId = "",
}) {
  const { t } = useTranslation();
  const [sources, setSources] = useState([]);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("screen"); // "screen" | "window" | "camera"
  const [resolution, setResolution] = useState("1080");
  const [selectedSourceId, setSelectedSourceId] = useState(null);
  const [isGameMode, setIsGameMode] = useState(() => {
    return localStorage.getItem("onicord_stream_game_mode") === "true";
  });
  const [includeAudio, setIncludeAudio] = useState(() => {
    return localStorage.getItem("onicord_stream_include_audio") !== "false";
  });
  const [includeWebcam, setIncludeWebcam] = useState(() => {
    return localStorage.getItem("onicord_stream_include_webcam") === "true";
  });
  const [webcamDeviceId, setWebcamDeviceId] = useState(() => {
    return preferredWebcamId || localStorage.getItem("onicord_preferred_webcam") || "";
  });
  const [webcamPosition, setWebcamPosition] = useState(() => {
    return localStorage.getItem("onicord_stream_webcam_position") || "bottom-right";
  });
  const [webcamMirror, setWebcamMirror] = useState(() => {
    return localStorage.getItem("onicord_stream_webcam_mirror") !== "false";
  });
  const [camPreviewError, setCamPreviewError] = useState(null);
  const [camPreviewLoading, setCamPreviewLoading] = useState(false);

  const camPreviewVideoRef = useRef(null);
  const camPreviewStreamRef = useRef(null);

  const stopCameraPreview = useCallback(() => {
    if (camPreviewStreamRef.current) {
      camPreviewStreamRef.current.getTracks().forEach((track) => {
        try {
          track.enabled = false;
          track.stop();
        } catch {}
      });
      camPreviewStreamRef.current = null;
    }
    if (camPreviewVideoRef.current) {
      camPreviewVideoRef.current.srcObject = null;
    }
  }, []);

  const refreshCameraDevices = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter((d) => d.kind === "videoinput");
      setCameraDevices(cams);
      if (cams.length > 0) {
        setWebcamDeviceId((prev) => {
          const target = prev || preferredWebcamId || localStorage.getItem("onicord_preferred_webcam") || "";
          if (target && cams.some((c) => c.deviceId === target)) {
            return target;
          }
          return cams[0].deviceId;
        });
      }
      return cams;
    } catch {
      setCameraDevices([]);
      return [];
    }
  }, [preferredWebcamId]);

  const handleToggleGameMode = () => {
    soundEngine.playNav("select");
    setIsGameMode((prev) => {
      const next = !prev;
      localStorage.setItem("onicord_stream_game_mode", String(next));
      return next;
    });
  };

  const handleToggleIncludeAudio = () => {
    soundEngine.playNav("select");
    setIncludeAudio((prev) => {
      const next = !prev;
      localStorage.setItem("onicord_stream_include_audio", String(next));
      return next;
    });
  };

  const handleToggleIncludeWebcam = () => {
    soundEngine.playNav("select");
    setIncludeWebcam((prev) => {
      const next = !prev;
      localStorage.setItem("onicord_stream_include_webcam", String(next));
      return next;
    });
  };

  const handleSelectWebcamPosition = (pos) => {
    soundEngine.playNav("select");
    setWebcamPosition(pos);
    localStorage.setItem("onicord_stream_webcam_position", pos);
  };

  const handleToggleWebcamMirror = () => {
    soundEngine.playNav("select");
    setWebcamMirror((prev) => {
      const next = !prev;
      localStorage.setItem("onicord_stream_webcam_mirror", String(next));
      return next;
    });
  };

  const { shouldRender, isAnimatingOut } = useAnimatedMount(isOpen, 140);

  useEffect(() => {
    if (isOpen) {
      soundEngine.playNav("open");
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (isAnimatingOut) return;
    stopCameraPreview();
    soundEngine.playNav("close");
    onClose?.();
  }, [isAnimatingOut, onClose, stopCameraPreview]);

  useEffect(() => {
    if (!isOpen) {
      stopCameraPreview();
    }
  }, [isOpen, stopCameraPreview]);

  useEffect(() => {
    return () => {
      stopCameraPreview();
    };
  }, [stopCameraPreview]);

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
    if (preferredWebcamId) {
      setWebcamDeviceId(preferredWebcamId);
    }
    refreshCameraDevices();

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
  }, [isOpen, preferredWebcamId, refreshCameraDevices]);

  // Live preview when "camera" tab is active
  useEffect(() => {
    if (!isOpen || activeTab !== "camera") {
      stopCameraPreview();
      setCamPreviewError(null);
      setCamPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setCamPreviewLoading(true);
    setCamPreviewError(null);

    acquireWebcamStream({
      deviceId: webcamDeviceId,
      resolution: "720",
      gameMode: false,
      isPipOverlay: true,
    })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stopCameraPreview();
        camPreviewStreamRef.current = stream;
        if (camPreviewVideoRef.current) {
          camPreviewVideoRef.current.srcObject = stream;
          camPreviewVideoRef.current.play().catch(() => {});
        }
        setCamPreviewLoading(false);
        refreshCameraDevices();
      })
      .catch((err) => {
        if (cancelled) return;
        setCamPreviewLoading(false);
        setCamPreviewError(
          err?.message ||
            t("screenShare.cameraPermissionError", "No se pudo acceder a la cámara web.")
        );
      });

    return () => {
      cancelled = true;
      stopCameraPreview();
    };
  }, [isOpen, activeTab, webcamDeviceId, stopCameraPreview, refreshCameraDevices, t]);

  const screens = useMemo(() => sources.filter((s) => s.id.startsWith("screen:")), [sources]);
  const windows = useMemo(() => sources.filter((s) => s.id.startsWith("window:")), [sources]);
  const filteredSources = activeTab === "screen" ? screens : windows;

  const handleTabChange = (tab) => {
    soundEngine.playNav("select");
    setActiveTab(tab);
    if (tab === "camera") {
      refreshCameraDevices();
      return;
    }
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

  const selectedCameraObj = useMemo(() => {
    return (
      cameraDevices.find((c) => c.deviceId === webcamDeviceId) ||
      cameraDevices[0] ||
      null
    );
  }, [cameraDevices, webcamDeviceId]);

  const selectedCameraLabel =
    selectedCameraObj?.label ||
    t("screenShare.cameraTab", "Cámara");

  const cameraOptions = useMemo(() => {
    if (cameraDevices.length === 0) {
      return [
        {
          value: "",
          label: t("screenShare.noCameraFound", "Sin cámaras detectadas"),
        },
      ];
    }
    return cameraDevices.map((cam, idx) => ({
      value: cam.deviceId,
      label: cam.label || `${t("screenShare.cameraTab", "Cámara")} ${idx + 1}`,
    }));
  }, [cameraDevices, t]);

  const buildStreamOptions = useCallback(
    (modeOverride) => ({
      gameMode: isGameMode,
      includeAudio,
      mode: modeOverride || (activeTab === "camera" ? "camera" : "screen"),
      includeWebcam: activeTab === "camera" ? true : includeWebcam && cameraDevices.length > 0,
      webcamDeviceId: selectedCameraObj?.deviceId || webcamDeviceId || "",
      webcamPosition,
      webcamMirror,
    }),
    [
      isGameMode,
      includeAudio,
      activeTab,
      includeWebcam,
      cameraDevices.length,
      selectedCameraObj?.deviceId,
      webcamDeviceId,
      webcamPosition,
      webcamMirror,
    ]
  );

  const canConfirm =
    activeTab === "camera"
      ? cameraDevices.length > 0 && !camPreviewError
      : Boolean(selectedSource);

  const handleConfirm = () => {
    if (!canConfirm) return;
    soundEngine.playNav("select");
    // Release preview hardware lock before opening stream in UserPanel
    stopCameraPreview();
    if (activeTab === "camera") {
      onSelectSource(
        {
          id: selectedCameraObj?.deviceId || webcamDeviceId || "camera",
          name: selectedCameraLabel,
          isCamera: true,
        },
        resolution,
        buildStreamOptions("camera")
      );
      return;
    }
    onSelectSource(selectedSource, resolution, buildStreamOptions("screen"));
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
          "relative flex flex-col w-full max-w-[780px] h-[610px] max-h-[90vh] rounded-2xl bg-onicord-surface border border-onicord-island shadow-2xl overflow-hidden select-none onicord-animate-modal-in",
          isAnimatingOut && "onicord-animate-modal-out"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0 bg-onicord-surface">
          <div>
            <h3 className="text-lg font-bold text-onicord-text tracking-wide">
              {t("screenShare.title", "Compartir pantalla")}
            </h3>
            <p className="text-xs text-onicord-muted mt-0.5">
              {t("screenShare.subtitle", "Elegí qué monitor, aplicación o cámara querés transmitir en la sala")}
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

        {/* Stream source category tabs and quality selector */}
        <div className="flex flex-wrap items-center justify-between px-6 py-2.5 shrink-0 gap-2.5">
          <div className="flex items-center gap-2">
            {[
              { id: "screen", label: t("screenShare.screens", "Pantallas"), count: screens.length },
              { id: "window", label: t("screenShare.windows", "Ventanas"), count: windows.length },
              { id: "camera", label: t("screenShare.cameraTab", "Cámara"), count: cameraDevices.length },
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
                      ? "bg-onicord-accent text-onicord-on-accent border-onicord-accent font-bold shadow-sm"
                      : "bg-onicord-base/40 text-onicord-muted border-onicord-border hover:bg-onicord-tint/10 hover:text-onicord-text"
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-bold leading-none",
                      isActive
                        ? "bg-black/20 text-onicord-dark"
                        : "bg-onicord-tint/5 text-onicord-muted"
                    )}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* CONTROLS RIGHT: WEBCAM OVERLAY + AUDIO TOGGLE + GAMING MODE TOGGLE + QUALITY SELECTOR */}
          <div className="flex items-center gap-2">
            {activeTab !== "camera" && (
              <button
                type="button"
                onClick={handleToggleIncludeWebcam}
                disabled={cameraDevices.length === 0}
                title={
                  cameraDevices.length === 0
                    ? t("screenShare.noCameraFound", "No se detectó ninguna cámara conectada")
                    : includeWebcam
                      ? t("screenShare.webcamActiveTip", "Webcam superpuesta activa: se mostrará en una esquina sobre tu transmisión")
                      : t("screenShare.webcamInactiveTip", "Superponer webcam sobre la pantalla compartida")
                }
                className={cn(
                  "h-8 px-2.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer select-none box-border",
                  cameraDevices.length === 0
                    ? "opacity-40 cursor-not-allowed bg-onicord-base/30 text-onicord-muted border-onicord-border"
                    : includeWebcam
                      ? "bg-onicord-accent text-onicord-on-accent border-onicord-accent font-bold shadow-sm"
                      : "bg-onicord-base/40 text-onicord-muted border-onicord-border hover:bg-onicord-tint/10 hover:text-onicord-text"
                )}
              >
                <MaterialIcon name={includeWebcam ? "videocam" : "videocam_off"} size={16} />
                <span>{t("screenShare.webcamOverlay", "Webcam")}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleToggleIncludeAudio}
              title={
                includeAudio
                  ? t("screenShare.audioActiveTip", "Audio del sistema activado. Para evitar eco de voz, recomendamos usar auriculares.")
                  : t("screenShare.audioInactiveTip", "Solo video: no transmite sonidos del sistema")
              }
              className={cn(
                "h-8 px-2.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer select-none box-border",
                includeAudio
                  ? "bg-onicord-accent text-onicord-on-accent border-onicord-accent font-bold shadow-sm"
                  : "bg-onicord-base/40 text-onicord-muted border-onicord-border hover:bg-onicord-tint/10 hover:text-white"
              )}
            >
              <MaterialIcon name={includeAudio ? "volume_up" : "volume_off"} size={16} />
              <span>{t("screenShare.systemAudio", "Audio")}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleGameMode}
              title={
                isGameMode
                  ? t("screenShare.gameModeActiveTip", "Modo Videojuegos activo: 60 FPS estables y audio estéreo")
                  : t("screenShare.gameModeInactiveTip", "Modo Estándar: Optimizado para texto y bajo uso de CPU")
              }
              className={cn(
                "h-8 px-3 text-xs font-semibold rounded-lg border transition-all flex items-center cursor-pointer select-none box-border",
                isGameMode
                  ? "bg-onicord-accent text-onicord-on-accent border-onicord-accent font-bold shadow-sm"
                  : "bg-onicord-base/40 text-onicord-muted border-onicord-border hover:bg-onicord-tint/10 hover:text-white"
              )}
            >
              <span>{t("screenShare.gameMode", "Modo Juegos")}</span>
            </button>

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
        </div>

        {/* Compact Webcam options strip when Camera tab or Webcam PiP overlay is enabled */}
        {(activeTab === "camera" || (includeWebcam && cameraDevices.length > 0)) && (
          <div className="px-6 py-2 bg-onicord-base/60 border-t border-b border-onicord-border flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0 flex-1 max-w-[300px]">
              <MaterialIcon name="videocam" size={16} className="text-onicord-accent shrink-0" />
              <Select
                id="stream-webcam-device"
                value={selectedCameraObj?.deviceId || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setWebcamDeviceId(val);
                  localStorage.setItem("onicord_preferred_webcam", val);
                }}
                size="sm"
                options={cameraOptions}
                className="w-full"
                disabled={cameraDevices.length === 0}
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {activeTab !== "camera" && (
                <div className="flex items-center gap-1 bg-onicord-surface/80 p-1 rounded-lg border border-onicord-border">
                  <span className="text-[11px] font-medium text-onicord-muted px-1.5">
                    {t("screenShare.webcamPosition", "Posición")}:
                  </span>
                  {WEBCAM_CORNER_OPTIONS.map((opt) => {
                    const isActivePos = webcamPosition === opt.id;
                    const labelMap = {
                      "top-left": t("screenShare.posTopLeft", opt.defaultLabel),
                      "top-right": t("screenShare.posTopRight", opt.defaultLabel),
                      "bottom-left": t("screenShare.posBottomLeft", opt.defaultLabel),
                      "bottom-right": t("screenShare.posBottomRight", opt.defaultLabel),
                    };
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectWebcamPosition(opt.id)}
                        title={labelMap[opt.id]}
                        className={cn(
                          "w-6 h-6 rounded-md flex items-center justify-center transition-colors cursor-pointer",
                          isActivePos
                            ? "bg-onicord-accent text-onicord-on-accent shadow-sm"
                            : "text-onicord-muted hover:text-onicord-text hover:bg-onicord-tint/10"
                        )}
                      >
                        <MaterialIcon name={opt.icon} size={14} />
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={handleToggleWebcamMirror}
                title={t("screenShare.webcamMirrorTip", "Invertir horizontalmente (efecto espejo)")}
                className={cn(
                  "h-7 px-2.5 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer select-none",
                  webcamMirror
                    ? "bg-onicord-accent/20 text-onicord-accent border-onicord-accent/40"
                    : "bg-onicord-surface/80 text-onicord-muted border-onicord-border hover:text-onicord-text"
                )}
              >
                <MaterialIcon name="flip" size={15} />
                <span>{t("screenShare.webcamMirror", "Espejo")}</span>
              </button>
            </div>
          </div>
        )}

        {/* Sources grid OR Camera live preview */}
        <div className="flex-1 min-h-0 overflow-y-auto minimal-scrollbar p-5 bg-onicord-base/40">
          {activeTab === "camera" ? (
            cameraDevices.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-onicord-muted py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-onicord-tint/5 border border-onicord-tint/10 flex items-center justify-center text-onicord-muted mb-1">
                  <MaterialIcon name="videocam_off" size={24} />
                </div>
                <p className="text-sm font-semibold text-onicord-text">
                  {t("screenShare.noCameraFound", "No se detectó ninguna cámara conectada")}
                </p>
                <p className="text-xs text-onicord-muted mt-0.5 max-w-sm">
                  {t("screenShare.noCameraDesc", "Conecta una cámara web e intenta nuevamente.")}
                </p>
              </div>
            ) : camPreviewError ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-onicord-muted py-12 text-center">
                <div className="w-12 h-12 rounded-2xl bg-onicord-danger/10 border border-onicord-danger/30 flex items-center justify-center text-onicord-danger mb-1">
                  <MaterialIcon name="videocam_off" size={24} />
                </div>
                <p className="text-sm font-semibold text-onicord-text">
                  {t("screenShare.cameraPermissionError", "No se pudo acceder a la cámara")}
                </p>
                <p className="text-xs text-onicord-muted mt-0.5 max-w-sm">
                  {camPreviewError}
                </p>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center animate-fade-in">
                <div className="w-full max-w-[540px] aspect-video rounded-2xl overflow-hidden bg-black border border-onicord-accent/40 shadow-2xl relative flex items-center justify-center">
                  <video
                    ref={camPreviewVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={cn(
                      "w-full h-full object-cover",
                      webcamMirror && "-scale-x-100"
                    )}
                  />
                  {camPreviewLoading && (
                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-2 text-onicord-muted">
                      <div className="w-8 h-8 border-[3px] border-onicord-tint/10 border-t-onicord-accent rounded-full animate-spin" />
                      <span className="text-xs font-medium">
                        {t("screenShare.loadingCamera", "Iniciando vista previa...")}
                      </span>
                    </div>
                  )}
                  <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/75 border border-onicord-tint/10 text-[11px] font-semibold text-white flex items-center gap-1.5 backdrop-blur-md">
                    <span className="w-2 h-2 rounded-full bg-onicord-accent animate-pulse" />
                    <span className="truncate max-w-[260px]">{selectedCameraLabel}</span>
                  </div>
                </div>
              </div>
            )
          ) : loading ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-onicord-muted py-12">
              <div className="w-9 h-9 border-[3px] border-onicord-tint/10 border-t-onicord-accent rounded-full animate-spin" />
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
                const pipPositionClass =
                  webcamPosition === "top-left"
                    ? "top-2 left-2"
                    : webcamPosition === "top-right"
                      ? "top-2 right-2"
                      : webcamPosition === "bottom-left"
                        ? "bottom-2 left-2"
                        : "bottom-2 right-2";

                return (
                  <div
                    key={src.id}
                    onClick={() => {
                      soundEngine.playNav("select");
                      setSelectedSourceId(src.id);
                    }}
                    onDoubleClick={() => {
                      soundEngine.playNav("select");
                      stopCameraPreview();
                      onSelectSource(src, resolution, buildStreamOptions("screen"));
                    }}
                    className={cn(
                      "group relative flex flex-col rounded-xl overflow-hidden border transition-all duration-150 cursor-pointer select-none",
                      isSelected
                        ? "bg-onicord-mantle border-onicord-accent shadow-[0_0_16px_rgba(var(--onicord-accent),0.25)] ring-2 ring-onicord-accent/80"
                        : "bg-onicord-mantle/70 border-onicord-border hover:border-onicord-accent/40 hover:bg-onicord-mantle"
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
                        <div className="w-10 h-10 rounded-lg bg-onicord-tint/5 flex items-center justify-center text-onicord-muted/30 text-xs">
                          {src.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}

                      {/* Simulated 16:9 webcam PiP corner preview */}
                      {isSelected && includeWebcam && cameraDevices.length > 0 && (
                        <div
                          className={cn(
                            "absolute w-[24%] aspect-video rounded bg-onicord-surface/90 border border-onicord-accent/80 shadow-md flex items-center justify-center pointer-events-none",
                            pipPositionClass
                          )}
                        >
                          <MaterialIcon name="videocam" size={12} className="text-onicord-accent" />
                        </div>
                      )}

                      {/* Selected check badge */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-onicord-accent text-onicord-on-accent flex items-center justify-center shadow-md animate-scale-up">
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

                    <div
                      className={cn(
                        "p-2.5 flex items-center justify-between gap-2 transition-colors",
                        isSelected
                          ? "bg-onicord-accent/10 text-onicord-accent"
                          : "text-onicord-text group-hover:bg-onicord-tint/[0.03]"
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

        <footer className="flex items-center justify-between px-6 py-3.5 shrink-0 bg-onicord-surface border-t border-onicord-border">
          <div className="min-w-0 flex-1 pr-4">
            {activeTab === "camera" ? (
              cameraDevices.length > 0 ? (
                <p className="text-xs text-onicord-muted truncate flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-onicord-accent shrink-0" />
                  <span className="truncate text-onicord-text font-medium">{selectedCameraLabel}</span>
                </p>
              ) : (
                <p className="text-xs text-onicord-muted/70">
                  {t("screenShare.noCameraFound", "No se detectó ninguna cámara conectada")}
                </p>
              )
            ) : selectedSource ? (
              <p className="text-xs text-onicord-muted truncate flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-onicord-accent shrink-0" />
                <span className="truncate text-onicord-text font-medium">{selectedSource.name}</span>
                {includeWebcam && cameraDevices.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-onicord-accent/15 text-onicord-accent border border-onicord-accent/30 font-semibold shrink-0">
                    + {t("screenShare.webcamOverlay", "Webcam")}
                  </span>
                )}
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
              disabled={!canConfirm}
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
