import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
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

export default function AddonStageDisplay({
  stageData, // { pluginId, title, url, htmlContent, authorName, inviteData }
  onClose,
  isMini = false,
  onToggleSize = null,
  isFullscreen = false,
  onToggleFullscreen = null,
  onShareToChat = null,
}) {
  const { t } = useTranslation();
  const iframeRef = useRef(null);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [hasGamepad, setHasGamepad] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const inactivityTimeoutRef = useRef(null);

  // Estados dinámicos para permitir transición fluida entre el Launcher y el juego seleccionado
  const [activeUrl, setActiveUrl] = useState(stageData?.url || null);
  const [activeHtml, setActiveHtml] = useState(stageData?.htmlContent || null);
  const [activeTitle, setActiveTitle] = useState(stageData?.title || "Escenario de Complemento");
  const [activeGame, setActiveGame] = useState(null);

  // Estado agnóstico para diálogos de confirmación nativos (usado por el escenario y por los addons)
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
      title: "Borrar datos y caché de juegos",
      message: "¿Estás seguro de que deseas borrar los datos almacenados de los juegos web del catálogo?",
      warningMessage: "Esta acción eliminará partidas guardadas en el navegador, texturas, shaders y caché de descargas para liberar espacio o resolver problemas de carga. Tu cuenta, ajustes y chats de Onicord no se verán afectados.",
      confirmLabel: "Borrar datos",
      cancelLabel: "Cancelar",
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
    setActiveGame(null);

    // Si el escenario se abre con una actividad definida (ej: juego directo o embed de chat), sincronizar RPC inmediatamente
    if (stageData?.activity && window.electronAPI?.setStageActivity) {
      window.electronAPI.setStageActivity({
        pluginId: stageData?.pluginId,
        name: stageData.activity.name,
        details: stageData.activity.details || stageData?.title || "Complemento",
        state: stageData.activity.state || null,
        cover: stageData.activity.cover || null,
        type: stageData.activity.type || (stageData.activity.isCatalog ? "launcher" : "game"),
        isCatalog: Boolean(stageData.activity.isCatalog),
        startTime: stageData.activity.startTime || Date.now(),
      });
    }
  }, [stageData]);

  const [position, setPosition] = useState(() => {
    const width = typeof window !== "undefined" ? window.innerWidth : 1200;
    const height = typeof window !== "undefined" ? window.innerHeight : 800;
    return {
      x: Math.max(10, width - 360),
      y: Math.max(10, height - 250),
    };
  });
  const isDragging = useRef(false);
  const [isDraggingState, setIsDraggingState] = useState(false);
  const lastPointerPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  // Terminación completa del iframe y recursos al cerrar explícitamente
  const handleTerminate = useCallback(() => {
    if (iframeRef.current) {
      try {
        iframeRef.current.src = "about:blank";
      } catch (_) {}
    }
    onClose?.();
  }, [onClose]);

  // Retorno al Catálogo Launcher sin desmontar ni recargar la llamada de voz
  const handleReturnToCatalog = useCallback(() => {
    setActiveGame(null);
    setActiveUrl(stageData?.url || null);
    setActiveHtml(stageData?.htmlContent || null);
    setActiveTitle(stageData?.title || "Escenario");

    if (window.electronAPI?.setStageActivity) {
      window.electronAPI.setStageActivity({
        pluginId: stageData?.pluginId,
        name: stageData?.title || stageData?.activity?.name || "Complemento",
        details: stageData?.activity?.details || stageData?.title || "Complemento",
        state: null,
        cover: null,
        type: "launcher",
        isCatalog: true,
        startTime: Date.now(),
      });
    }
  }, [stageData]);

  const activeGameRef = useRef(activeGame);
  activeGameRef.current = activeGame;
  const activeHtmlRef = useRef(activeHtml);
  activeHtmlRef.current = activeHtml;

  // Escuchar mensajes emitidos desde widgets internos del escenario
  useEffect(() => {
    const handleWindowMessage = (e) => {
      // 1. Validar remitente: solo aceptar mensajes originados por nuestro propio iframe
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      if (!e.data || typeof e.data !== "object") return;

      // 2. Control de aislamiento de catálogo:
      // Cuando un juego externo está activo (activeGame no nulo y activeHtml es nulo),
      // el sitio web remoto NO tiene permitido comandar navegación ni cerrar el escenario.
      if (activeGameRef.current && !activeHtmlRef.current) {
        return;
      }

      if (
        e.data.type === "ONICORD_STAGE_LAUNCH_GAME" ||
        e.data.type === "ONICORD_STAGE_NAVIGATE"
      ) {
        const game = e.data.game || e.data.target;
        if (game && typeof game.url === "string") {
          const rawUrl = game.url.trim();
          // 3. Validación estricta de protocolo web: solo https:// o http:// (bloquea javascript:, file:, data:, onicord-media:)
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

          const safeGame = {
            ...game,
            title: safeTitle,
            url: rawUrl,
            details: safeDetails,
            state: safeState,
            cover: safeCover,
          };

          setActiveGame(safeGame);
          setActiveTitle(safeTitle);
          setActiveHtml(null); // Limpiar srcDoc para que el iframe cargue la URL del juego
          setActiveUrl(rawUrl);

          if (window.electronAPI?.setStageActivity) {
            window.electronAPI.setStageActivity({
              pluginId: stageData?.pluginId,
              name: safeTitle,
              details: safeDetails,
              state: safeState,
              cover: safeCover,
              type: "game",
              isCatalog: false,
              startTime: Date.now(),
            });
          }
        }
      } else if (e.data.type === "ONICORD_CLOSE_STAGE") {
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
      }
    };

    window.addEventListener("message", handleWindowMessage);
    return () => window.removeEventListener("message", handleWindowMessage);
  }, [stageData, handleTerminate]);

  // Manejo de volumen y silencio en elementos multimedia internos y Web Audio subframes
  useEffect(() => {
    if (window.electronAPI?.setStageVolume) {
      window.electronAPI.setStageVolume(volume, isMuted);
    }
    try {
      const doc = iframeRef.current?.contentDocument;
      if (doc) {
        const mediaEls = doc.querySelectorAll("audio, video");
        mediaEls.forEach((el) => {
          el.volume = isMuted ? 0 : volume / 100;
          el.muted = isMuted;
        });
      }
    } catch (_) {}
  }, [volume, isMuted]);

  // Detección dinámica de mandos
  useEffect(() => {
    const checkGamepads = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const connected = Array.from(pads).some((p) => p && p.connected);
      setHasGamepad(connected);
    };

    checkGamepads();
    window.addEventListener("gamepadconnected", checkGamepads);
    window.addEventListener("gamepaddisconnected", checkGamepads);
    const interval = setInterval(checkGamepads, 2500);

    return () => {
      window.removeEventListener("gamepadconnected", checkGamepads);
      window.removeEventListener("gamepaddisconnected", checkGamepads);
      clearInterval(interval);
    };
  }, []);

  // PiP Resize clamp y liberación global de puntero (idéntico a StreamDisplay)
  useEffect(() => {
    if (!isMini) return;
    const handleResize = () => {
      setPosition((prev) => {
        const maxX = window.innerWidth - 355;
        const maxY = window.innerHeight - 205;
        const currentX = Number.isFinite(prev?.x) ? prev.x : window.innerWidth - 360;
        const currentY = Number.isFinite(prev?.y) ? prev.y : window.innerHeight - 250;
        return {
          x: Math.max(10, Math.min(currentX, maxX)),
          y: Math.max(10, Math.min(currentY, maxY)),
        };
      });
    };
    handleResize();
    const handleGlobalPointerUp = () => {
      isDragging.current = false;
      setIsDraggingState(false);
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
    setIsDraggingState(true);
    hasMoved.current = false;
    lastPointerPos.current = { x: e.clientX, y: e.clientY };
    try {
      e.target.setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    const deltaX = e.clientX - lastPointerPos.current.x;
    const deltaY = e.clientY - lastPointerPos.current.y;

    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      hasMoved.current = true;
    }

    setPosition((prev) => {
      const currentX = Number.isFinite(prev?.x) ? prev.x : window.innerWidth - 360;
      const currentY = Number.isFinite(prev?.y) ? prev.y : window.innerHeight - 250;
      const nextX = Math.max(10, Math.min(currentX + deltaX, window.innerWidth - 355));
      const nextY = Math.max(10, Math.min(currentY + deltaY, window.innerHeight - 205));
      return { x: nextX, y: nextY };
    });
    lastPointerPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e) => {
    isDragging.current = false;
    setIsDraggingState(false);
    try {
      if (e?.target?.hasPointerCapture?.(e.pointerId)) {
        e.target.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}
  };

  const stageTitle = activeTitle || stageData?.title || "Escenario de Complemento";

  const isCatalogLauncher =
    !activeGame &&
    (Boolean(stageData?.activity?.isCatalog) ||
      stageData?.activity?.type === "launcher" ||
      Boolean(stageData?.entryPoint) ||
      Boolean(activeHtml));

  // Clases dinámicas del contenedor raíz persistente (el iframe NUNCA se desmonta)
  let containerClasses = "";
  let containerStyles = {};

  if (isMini) {
    containerClasses =
      "fixed bg-onicord-surface w-[340px] h-[190px] rounded-onicord-inner overflow-hidden border-2 border-[var(--accent-purple)] shadow-2xl z-40 cursor-move group hover:scale-[1.01] transition-all duration-75 touch-none select-none flex flex-col";
    containerStyles = { left: `${position.x}px`, top: `${position.y}px` };
  } else if (isFullscreen) {
    containerClasses =
      "fixed inset-0 z-40 w-screen h-screen bg-black flex flex-col select-none overflow-hidden";
  } else {
    // Modo Normal / Inline
    containerClasses =
      "relative flex-1 w-full h-full min-h-0 min-w-0 flex flex-col bg-onicord-surface select-none overflow-hidden rounded-onicord-inner border border-onicord-island";
  }

  return (
    <div
      onPointerDown={isMini ? handlePointerDown : undefined}
      onPointerMove={isMini ? handlePointerMove : undefined}
      onPointerUp={isMini ? handlePointerUp : undefined}
      style={containerStyles}
      className={containerClasses}
    >
      {/* 1. PERSISTENT CENTRAL CONTENT (El iframe permanece siempre montado para evitar recargas) */}
      <div className={`flex-1 w-full h-full relative overflow-hidden bg-black min-h-0 min-w-0 ${isDraggingState ? "pointer-events-none select-none" : "pointer-events-auto"}`}>
        <iframe
          ref={iframeRef}
          src={activeUrl || undefined}
          srcDoc={activeHtml || undefined}
          title={stageTitle}
          credentialless="true"
          sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-downloads"
          allow="cross-origin-isolated; gamepad; autoplay; fullscreen; clipboard-read; clipboard-write; microphone; pointer-lock"
          className="w-full h-full border-0 bg-black block"
        />

        {/* 2. OVERLAY INTEGRADO MODO PIP (Estilo StreamDisplay, arrastre en toda la superficie y botones) */}
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
                    title="Volver al catálogo de juegos"
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
                    title="Expandir a escenario"
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
                title="Cerrar juego"
              >
                <IconClose size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Top Left Badge (solo visible en modo normal o fullscreen, sin badge pulsante) */}
      {!isMini && (
        <div
          className={`absolute top-4 left-4 z-30 flex items-center gap-2 bg-black/80 border border-white/10 px-3.5 py-1.5 rounded-full text-xs shadow-2xl backdrop-blur-md select-none transition-all duration-300 pointer-events-auto ${
            isFullscreen && !showControls
              ? "opacity-0 -translate-y-4 pointer-events-none"
              : "opacity-100 translate-y-0 pointer-events-auto"
          }`}
        >
          <MaterialIcon name={stageData?.icon || "sports_esports"} size={16} className="text-onicord-accent" />
          <span className="font-semibold text-white truncate max-w-[200px]">{stageTitle}</span>
          {hasGamepad && (
            <span className="flex items-center gap-1 text-[11px] text-green-400 bg-green-950/60 border border-green-500/30 px-2 py-0.5 rounded-full">
              <MaterialIcon name="gamepad" size={12} />
              Mando listo
            </span>
          )}
        </div>
      )}

      {/* 3b. Top Right Controls (discretos en modo catálogo/launcher: borrar datos, pantalla completa y cerrar) */}
      {!isMini && isCatalogLauncher && (
        <div
          className={`absolute top-4 right-4 z-30 flex items-center gap-2 select-none transition-all duration-300 pointer-events-auto ${
            isFullscreen && !showControls
              ? "opacity-0 -translate-y-4 pointer-events-none"
              : "opacity-100 translate-y-0 pointer-events-auto"
          }`}
        >
          {/* Botón Borrar datos y caché de juegos web */}
          <button
            type="button"
            onClick={handleRequestClearStorage}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 hover:bg-black/90 hover:text-red-400 border border-white/10 text-white/80 transition-all shadow-lg backdrop-blur-md cursor-pointer"
            title="Borrar datos y caché de juegos web"
          >
            <MaterialIcon name="delete_sweep" size={18} />
          </button>

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
            title="Cerrar catálogo"
          >
            <IconClose size={16} />
          </button>
        </div>
      )}

      {/* 4. Bottom Media Control Bar (solo visible cuando se está dentro de un juego, no en el launcher) */}
      {!isMini && !isCatalogLauncher && (
        <div
          className={`absolute bottom-6 left-0 right-0 z-30 flex justify-center select-none px-4 transition-all duration-300 ${
            isFullscreen && !showControls
              ? "opacity-0 translate-y-6 pointer-events-none"
              : "opacity-100 translate-y-0 pointer-events-auto"
          }`}
        >
          <div className="onicord-media-control-bar max-w-[90%] mx-auto shadow-2xl border border-white/20 bg-onicord-surface/90 flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md">
            {/* Botón Volver al Catálogo (visible cuando se está dentro de un juego) */}
            {activeGame && (
              <button
                type="button"
                onClick={handleReturnToCatalog}
                className="onicord-media-bar-btn flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/35 text-emerald-400 text-xs font-semibold border border-emerald-500/40 transition-colors shadow-sm"
                title="Volver al catálogo de juegos"
              >
                <MaterialIcon name="apps" size={16} />
                <span>Catálogo</span>
              </button>
            )}

            {/* Audio volume */}
            <div className="flex items-center gap-2 border-r border-white/10 pr-2">
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className={`onicord-icon-btn-round ${
                  isMuted ? "bg-onicord-danger/20 text-onicord-danger border-onicord-danger/40" : "text-white"
                }`}
                title={isMuted ? "Reactivar sonido" : "Silenciar juego"}
              >
                {isMuted ? <IconVolumeOff size="base" /> : <IconVolumeUp size="base" />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => {
                  setVolume(Number(e.target.value));
                  if (isMuted) setIsMuted(false);
                }}
                className="w-16 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer accent-onicord-accent"
              />
            </div>

            {/* Share to Chat button */}
            {onShareToChat && (
              <button
                type="button"
                onClick={async () => {
                  let dynamicUrl = null;
                  const currentContext = {
                    ...stageData,
                    url: activeUrl || stageData?.url,
                    shareCapture: activeGame?.shareCapture || stageData?.shareCapture,
                  };

                  // 1. Intentar capturar el enlace de la sala por IPC en Electron de forma agnóstica
                  if (window.electronAPI?.captureStageShareUrl) {
                    try {
                      dynamicUrl = await window.electronAPI.captureStageShareUrl(currentContext);
                    } catch (e) {
                      console.debug("[AddonStage] captureStageShareUrl error:", e);
                    }
                  }

                  const queryParam = currentContext.shareCapture?.queryParam;
                  if (dynamicUrl && (!queryParam || dynamicUrl.includes(queryParam))) {
                    console.log("[AddonStage] Compartiendo enlace al chat:", dynamicUrl);
                    onShareToChat(dynamicUrl);
                  } else if (!queryParam && currentContext.url) {
                    // Si el complemento no usa parámetros de sala, compartir URL base
                    onShareToChat(currentContext.url);
                  } else {
                    console.warn("[AddonStage] No se detectó una sala activa.");
                    alert(
                      "La sala aún no está activa en el juego para compartirla.\n\nSi creaste una sala, recordá ingresar al modo online o 'Inalámbrico' dentro del juego para habilitarla."
                    );
                  }
                }}
                className="onicord-media-bar-btn flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white text-xs transition-colors"
                title="Invitar al canal de texto con el link de la partida"
              >
                <MaterialIcon name="share" size={16} />
                <span>Invitar al chat</span>
              </button>
            )}

            {/* PiP Mode toggle button */}
            {onToggleSize && (
              <button
                type="button"
                onClick={onToggleSize}
                className="onicord-media-bar-btn flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 text-white text-xs transition-colors"
                title="Modo PiP (Ver chat mientras juegas)"
              >
                <IconFullscreenExit size="base" />
                <span>Modo PiP</span>
              </button>
            )}

            {/* Fullscreen toggle button */}
            {onToggleFullscreen && (
              <button
                type="button"
                onClick={onToggleFullscreen}
                className={`onicord-icon-btn-round ${isFullscreen ? "bg-sky-500/20 text-sky-400 border-sky-500/40" : "text-white"}`}
                title={isFullscreen ? t("voice.exitFullScreen") : t("voice.fullScreen")}
              >
                {isFullscreen ? <IconFullscreenExit size="base" /> : <IconFullscreen size="base" />}
              </button>
            )}

            {/* Stop / Close Stage button */}
            <button
              type="button"
              onClick={handleTerminate}
              className="onicord-icon-btn-round-stop bg-red-500/20 hover:bg-red-500/40 text-red-400 p-1.5 rounded-full border border-red-500/40 transition-colors"
              title="Cerrar juego"
            >
              <IconStopStream size="base" />
            </button>
          </div>
        </div>
      )}

      {/* 5. Modal de Confirmación Estándar de Onicord para Addons y Escenario */}
      {addonConfirmDialog && (
        <ConfirmDialogModal
          isOpen={Boolean(addonConfirmDialog)}
          title={addonConfirmDialog.title}
          message={addonConfirmDialog.message}
          warningMessage={addonConfirmDialog.warningMessage}
          confirmLabel={isClearingStorage ? "Borrando..." : addonConfirmDialog.confirmLabel}
          cancelLabel={addonConfirmDialog.cancelLabel}
          type={addonConfirmDialog.type || "confirm"}
          onConfirm={handleDialogConfirm}
          onCancel={handleDialogCancel}
        />
      )}
    </div>
  );
}
