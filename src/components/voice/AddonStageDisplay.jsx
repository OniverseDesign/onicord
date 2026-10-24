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

  // Terminación completa del iframe y recursos al cerrar explícitamente
  const handleTerminate = useCallback(() => {
    if (iframeRef.current) {
      try {
        iframeRef.current.src = "about:blank";
      } catch (_) {}
    }
    onClose?.();
  }, [onClose]);

  // Guardar y preservar la definición original del launcher/catálogo agnósticamente
  const catalogStageRef = useRef(stageData);
  useEffect(() => {
    if (stageData && (stageData.htmlContent || stageData.entryPoint || stageData.activity?.isCatalog)) {
      catalogStageRef.current = stageData;
    }
  }, [stageData]);

  // Retorno al Catálogo Launcher sin desmontar ni recargar la llamada de voz
  const handleReturnToCatalog = useCallback(() => {
    const catalog = catalogStageRef.current || stageData;
    setActiveGame(null);
    setActiveUrl(catalog?.url || null);
    setActiveHtml(catalog?.htmlContent || null);
    setActiveTitle(catalog?.title || "Escenario");

    if (iframeRef.current) {
      try {
        iframeRef.current.src = "about:blank";
      } catch (_) {}
    }

    const catalogActivity = {
      pluginId: catalog?.pluginId,
      name: catalog?.activity?.name || catalog?.title || "Arcade",
      details: catalog?.activity?.details || "Catálogo de Juegos",
      state: null,
      cover: null,
      type: "launcher",
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
  }, [stageData, isMini]);

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

      if (
        e.data.type === "ONICORD_STAGE_LAUNCH_GAME" ||
        e.data.type === "ONICORD_STAGE_NAVIGATE"
      ) {
        // Control de aislamiento: si ya hay un juego externo corriendo, no permitir comandar navegación desde la web remota
        if (activeGameRef.current && !activeHtmlRef.current) {
          return;
        }

        const game = e.data.game || e.data.target;
        if (game && typeof game.url === "string") {
          const rawUrl = game.url.trim();
          // Validación estricta de protocolo web: solo https:// o http:// (bloquea javascript:, file:, data:, onicord-media:)
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

          const gameActivity = {
            pluginId: stageData?.pluginId,
            name: safeTitle,
            details: safeDetails,
            state: safeState,
            cover: safeCover,
            type: "game",
            isCatalog: false,
            startTime: Date.now(),
          };

          const safeGame = {
            ...game,
            title: safeTitle,
            url: rawUrl,
            details: safeDetails,
            state: safeState,
            cover: safeCover,
            userNick: userNick,
            authorName: userNick,
            shareCapture: game.shareCapture || stageData?.shareCapture || null,
            frameScripts: Array.isArray(game.frameScripts) ? game.frameScripts : (stageData?.frameScripts || []),
            type: "game",
            isCatalog: false,
            activity: gameActivity,
          };

          setActiveGame(safeGame);
          setActiveTitle(safeTitle);
          setActiveHtml(null); // Limpiar srcDoc para que el iframe cargue la URL del juego
          setActiveUrl(rawUrl);

          // Sincronizar nuevo objetivo con Electron (para inyección de frameScripts, apodo y captura de enlaces de sala)
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
      }
    };

    window.addEventListener("message", handleWindowMessage);
    return () => window.removeEventListener("message", handleWindowMessage);
  }, [stageData, handleTerminate]);

  // Manejo de volumen y silencio en elementos multimedia internos y Web Audio subframes con soporte para Auto-Ducking
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

  // Detección dinámica de mandos, transferencia de foco y puente continuo de entrada a juegos en iframe
  useEffect(() => {
    let animId = null;

    const checkAndSyncGamepads = () => {
      const rawPads = navigator.getGamepads ? navigator.getGamepads() : [];
      const connected = Array.from(rawPads || []).some((p) => p && p.connected);
      setHasGamepad(connected);

      if (connected && iframeRef.current?.contentWindow) {
        // 1. Si hay juego activo y se pulsa algún botón, garantizar foco
        const anyButtonPressed = Array.from(rawPads).some((p) => p?.buttons?.some((b) => b.pressed));
        if (anyButtonPressed && activeGameRef.current && document.activeElement !== iframeRef.current) {
          try {
            iframeRef.current.focus();
            iframeRef.current.contentWindow.focus();
          } catch (_) {}
        }

        // 2. Transmitir estado serializado del mando al iframe para soslayar restricciones de aislamiento entre orígenes
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

    animId = requestAnimationFrame(checkAndSyncGamepads);

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  // Asegurar que el iframe del juego capture el foco activo necesario para el Gamepad API y controles
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

      // Sincronizar scripts con el subframe activo
      if (window.electronAPI?.openStageView) {
        const effectiveGameActivity = activeGame?.activity || {
          pluginId: stageData?.pluginId,
          name: activeGame?.title || activeTitle || "Juego",
          details: activeGame?.details || "Arcade",
          state: activeGame?.state || "En partida",
          cover: activeGame?.cover || null,
          type: "game",
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

  // PiP Resize clamp y liberación global de puntero (idéntico a StreamDisplay)
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

  // Clases dinámicas del contenedor raíz persistente (el iframe NUNCA se desmonta)
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
      "fixed inset-0 z-40 w-screen h-screen bg-black flex flex-col select-none overflow-hidden";
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
      {/* 1. PERSISTENT CENTRAL CONTENT (El iframe permanece siempre montado para evitar recargas) */}
      <div
        onPointerDown={() => {
          try {
            iframeRef.current?.focus();
            iframeRef.current?.contentWindow?.focus();
          } catch (_) {}
        }}
        className="flex-1 w-full h-full relative overflow-hidden bg-black min-h-0 min-w-0 pointer-events-auto"
      >
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
          sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-forms allow-modals allow-downloads"
          allow="gamepad; autoplay; fullscreen; pointer-lock; clipboard-read; clipboard-write; microphone; hid; usb; screen-wake-lock; wake-lock;"
          className="w-full h-full border-0 bg-black block outline-none"
          tabIndex={0}
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
                    ...activeGame,
                    url: activeUrl || activeGame?.url || stageData?.url,
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
                  const urlPattern =
                    currentContext.shareCapture?.urlPattern ||
                    (currentContext.url?.includes("garticphone.com")
                      ? "garticphone\\.com/(?:[a-zA-Z]{2}/)?([-_a-zA-Z0-9]{6,16})|garticphone\\.com/.*[?&]c="
                      : null);
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
                    console.log("[AddonStage] Compartiendo enlace al chat:", dynamicUrl);
                    onShareToChat(dynamicUrl, currentContext);
                  } else if (!queryParam && !urlPattern && currentContext.url) {
                    // Si el complemento no usa parámetros ni patrones de sala, compartir URL base
                    onShareToChat(currentContext.url, currentContext);
                  } else {
                    console.warn("[AddonStage] No se detectó una sala activa.");
                    setAddonConfirmDialog({
                      title: "Sala aún no detectada",
                      message: "No se detectó un enlace de sala activo para invitar.",
                      warningMessage: "Si estás en Gartic Phone, hacé clic en 'INICIAR' dentro del juego para crear la sala. Si ya estás en la sala, podés hacer clic en 'INVITAR' dentro del juego para copiar el enlace.",
                      confirmLabel: "Entendido",
                      type: "alert",
                      onConfirm: () => setAddonConfirmDialog(null),
                    });
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
