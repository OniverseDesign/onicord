import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import ConfirmDialogModal from "../../modals/ConfirmDialogModal";
import { getMediaUrl } from "../../../lib/media";
import { refreshCustomEmojis } from "../../../lib/emojiData";

export function formatBytes(bytes) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function getFileTypeIcon(fileName = "") {
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")).toLowerCase() : "";

  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"].includes(ext)) {
    return { name: "image", color: "text-onicord-info bg-onicord-info/10 border-onicord-info/30" };
  }
  if ([".mp4", ".webm", ".mkv", ".mov", ".avi", ".flv"].includes(ext)) {
    return { name: "movie", color: "text-onicord-success bg-onicord-success/10 border-onicord-success/30" };
  }
  if ([".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac"].includes(ext)) {
    return { name: "audiotrack", color: "text-onicord-warning bg-onicord-warning/10 border-onicord-warning/30" };
  }
  if (ext === ".pdf") {
    return { name: "picture_as_pdf", color: "text-onicord-danger bg-onicord-danger/10 border-onicord-danger/30" };
  }
  if ([".js", ".jsx", ".ts", ".tsx", ".html", ".css", ".json", ".py", ".c", ".cpp", ".cs", ".sh", ".php"].includes(ext)) {
    return { name: "code", color: "text-onicord-accent bg-onicord-accent/10 border-onicord-accent/30" };
  }
  if ([".txt", ".log", ".md", ".rtf", ".doc", ".docx"].includes(ext)) {
    return { name: "description", color: "text-onicord-accent bg-onicord-accent/10 border-onicord-accent/30" };
  }
  if ([".csv", ".xls", ".xlsx"].includes(ext)) {
    return { name: "table_chart", color: "text-onicord-success bg-onicord-success/10 border-onicord-success/30" };
  }
  if ([".zip", ".rar", ".7z", ".tar", ".gz", ".onipkg"].includes(ext)) {
    return { name: "folder_zip", color: "text-teal-400 bg-teal-500/10 border-teal-500/30" };
  }
  if ([".exe", ".bat", ".cmd", ".ps1", ".vbs", ".msi"].includes(ext)) {
    return { name: "warning", color: "text-onicord-warning bg-onicord-warning/10 border-onicord-warning/30" };
  }
  return { name: "insert_drive_file", color: "text-onicord-muted bg-onicord-tint/5 border-onicord-border-strong" };
}

export default function MessageMediaAttachment({
  fileData,
  msg,
  isMyMessage,
  profile = null,
  server,
  fileProgress = {},
  onDownloadFile = () => {},
  onCancelDownload = () => {},
  onOpenPreview = () => {},
  onShowAlert = () => {},
}) {
  const { t } = useTranslation();
  const [overrideRemotePath, setOverrideRemotePath] = useState(null);
  const [isNsfwRevealed, setIsNsfwRevealed] = useState(false);
  const [execWarningModal, setExecWarningModal] = useState({
    isOpen: false,
    mode: "blocked",
    onConfirm: null,
  });
  const inlineVideoRef = useRef(null);

  const isNsfw = Boolean(fileData?.isNsfw);
  const autoBlurNsfw = profile?.general?.blurNsfwContent ?? true;
  const isBlurred = isNsfw && autoBlurNsfw && !isNsfwRevealed;

  const fileExtension = fileData?.name?.split(".").pop()?.toLowerCase() || "";
  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(fileExtension);
  const isVideo = ["mp4", "webm", "mkv", "mov"].includes(fileExtension);

  const status = fileProgress ? fileProgress[fileData?.id] : undefined;
  const isDownloading = status && !status.done && status.error === undefined;
  const isCompleted = isMyMessage || status?.done === true;

  useEffect(() => {
    let isMounted = true;
    if (isMyMessage && fileData?.id && !overrideRemotePath) {
      window.electronAPI
        ?.fetchUploadedLocalPath?.(msg.roomCode, fileData.id)
        .then((localDiskPath) => {
          if (localDiskPath && isMounted) {
            setOverrideRemotePath(localDiskPath);
          }
        });
    }
    return () => {
      isMounted = false;
    };
  }, [isMyMessage, fileData?.id, msg.roomCode, overrideRemotePath]);

  useEffect(() => {
    if (
      !isMyMessage &&
      fileData?.id &&
      status?.done &&
      !status?.localPath &&
      !overrideRemotePath
    ) {
      window.electronAPI
        ?.fetchMediaLocalPath?.(fileData.id, msg.roomCode)
        .then((diskPath) => {
          if (diskPath) setOverrideRemotePath(diskPath);
        });
    }
  }, [
    isMyMessage,
    status?.done,
    fileData?.id,
    msg.roomCode,
    status?.localPath,
    overrideRemotePath,
  ]);

  const activePath = overrideRemotePath || status?.localPath;
  const resolvedMediaSrc = activePath ? getMediaUrl(activePath) : null;

  const executeFileAction = async () => {
    if (isCompleted) {
      let pathStr = activePath;
      if (!pathStr && isMyMessage && fileData?.id && msg.roomCode && window.electronAPI?.fetchUploadedLocalPath) {
        pathStr = await window.electronAPI.fetchUploadedLocalPath(msg.roomCode, fileData.id);
      }
      if (!pathStr && fileData?.id && window.electronAPI?.fetchMediaLocalPath) {
        pathStr = await window.electronAPI.fetchMediaLocalPath(fileData.id, msg.roomCode);
      }
      if (pathStr) {
        setOverrideRemotePath(pathStr);

        let initialTime = 0;
        if (inlineVideoRef.current) {
          initialTime = inlineVideoRef.current.currentTime || 0;
          inlineVideoRef.current.pause();
        }

        onOpenPreview({
          localPath: pathStr,
          fileName: fileData?.name,
          fileSize: fileData?.size,
          isImage,
          isVideo,
          initialTime,
        });
        return;
      }
    }
    onDownloadFile(fileData.id, fileData.name, fileData.size);
  };

  const handleFileActionClick = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const executableExtensions = [
      ".exe", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".cjs", ".mjs", ".sh", ".lnk", ".html"
    ];
    const fileExt = "." + (fileData?.name?.split(".").pop()?.toLowerCase() || "");
    const isExecutable = executableExtensions.includes(fileExt);

    if (isExecutable) {
      const allowExec = server?.allowExecutableFiles ?? false;
      if (!allowExec) {
        setExecWarningModal({
          isOpen: true,
          mode: "blocked",
          onConfirm: null,
        });
        return;
      } else {
        setExecWarningModal({
          isOpen: true,
          mode: "confirm",
          onConfirm: async () => {
            await executeFileAction();
          },
        });
        return;
      }
    }

    await executeFileAction();
  };

  const handleInstallPackClick = async (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!activePath) return;

    try {
      const response = window.electronAPI?.importMediaPackAuto
        ? await window.electronAPI.importMediaPackAuto(activePath)
        : await window.electronAPI.importStickerPackRaw(activePath);

      if (response && response.success) {
        if (response.type === "emojis") {
          const EMOJI_PACKS_KEY = "onicord_emoji_packs";
          const savedEmojiPacks = JSON.parse(
            localStorage.getItem(EMOJI_PACKS_KEY) || "{}",
          );
          savedEmojiPacks[response.name] = response.ids || [];
          localStorage.setItem(EMOJI_PACKS_KEY, JSON.stringify(savedEmojiPacks));
          refreshCustomEmojis();

          onShowAlert(
            t("chat.emojisPack.installSuccessTitle", "Instalación Exitosa"),
            t(
              "chat.emojisPack.installSuccessDesc",
              { name: response.name, count: response.count },
              `¡Pack "${response.name}" instalado con éxito!\nSe indexaron ${response.count} emojis en tu biblioteca.`,
            ),
          );
        } else {
          const PACKS_KEY = "onicord_sticker_packs_v1";
          const savedPacks = JSON.parse(
            localStorage.getItem(PACKS_KEY) || "{}",
          );

          savedPacks[response.name] = response.ids || [];
          localStorage.setItem(PACKS_KEY, JSON.stringify(savedPacks));

          onShowAlert(
            t("chat.stickers.installSuccessTitle", "Installation Successful"),
            t(
              "chat.stickers.installSuccessDesc",
              { name: response.name, count: response.count },
              `¡Pack "${response.name}" instalado con éxito!\nSe indexaron ${response.count} stickers en tu biblioteca.`,
            ),
          );
        }
      }
    } catch (err) {
      onShowAlert(
        t("chat.stickers.installErrorTitle", "Installation Error"),
        t(
          "chat.stickers.installErrorDesc",
          "No se pudo procesar el paquete .onipkg.",
        ),
      );
    }
  };

  if (!fileData) return null;

  return (
    <div className="mt-2 max-w-full">
      {isCompleted && (isImage || isVideo) && resolvedMediaSrc ? (
        isImage ? (
          <div
            onClick={(e) => {
              if (isBlurred) {
                e.stopPropagation();
                setIsNsfwRevealed(true);
                return;
              }
              handleFileActionClick(e);
            }}
            className={`relative mt-1 max-w-[550px] rounded-onicord-inner overflow-hidden bg-onicord-scrim-soft border border-onicord-border cursor-pointer hover:border-onicord-accent/40 transition-all duration-normal group/media inline-flex items-center justify-center ${
              isBlurred ? "min-w-[220px] min-h-[140px]" : ""
            }`}
          >
            <img
              src={resolvedMediaSrc}
              alt={fileData.name}
              loading="lazy"
              decoding="async"
              className={`w-auto h-auto max-w-full max-h-[400px] object-contain rounded-onicord-inner block animate-fade-in transition-all duration-normal ${
                isBlurred ? "blur-2xl scale-110 brightness-50 select-none pointer-events-none" : ""
              }`}
            />
            {isBlurred ? (
              <div className="absolute inset-0 flex items-center justify-center p-3 z-10 pointer-events-none">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-onicord-scrim-heavy backdrop-blur-onicord-popover border border-onicord-danger/40 text-onicord-danger text-xs font-semibold shadow-lg select-none">
                  <MaterialIcon name="visibility_off" size={16} className="text-onicord-danger" />
                  <span className="font-bold uppercase tracking-wider text-onicord-danger">{t("chat.nsfwBadge", "NSFW")}</span>
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
                          setIsNsfwRevealed(false);
                        }}
                        title={t("chat.nsfwHideAgain", "Ocultar contenido NSFW")}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-onicord-base/85 backdrop-blur-onicord-popover border border-onicord-danger/40 text-onicord-danger hover:bg-onicord-danger/20 text-2xs font-bold uppercase tracking-wider shadow transition-colors cursor-pointer"
                      >
                        <MaterialIcon name="visibility_off" size={12} />
                        <span>{t("chat.nsfwBadge", "NSFW")}</span>
                      </button>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-onicord-base/85 backdrop-blur-onicord-popover border border-onicord-danger/40 text-onicord-danger text-2xs font-bold uppercase tracking-wider shadow">
                        {t("chat.nsfwBadge", "NSFW")}
                      </span>
                    )}
                  </div>
                )}
                <div className="absolute inset-0 bg-onicord-tint/5 opacity-0 group-hover/media:opacity-100 transition-opacity duration-fast pointer-events-none" />
              </>
            )}
          </div>
        ) : (
          <div
            className={`relative mt-1 max-w-[550px] rounded-onicord-inner overflow-hidden bg-onicord-scrim border border-onicord-border-strong group/vid inline-flex items-center justify-center cursor-pointer hover:border-onicord-accent/40 transition-all duration-normal ${
              isBlurred ? "min-w-[240px] min-h-[150px]" : ""
            }`}
            onClick={(e) => {
              if (isBlurred) {
                e.stopPropagation();
                setIsNsfwRevealed(true);
                return;
              }
              if (inlineVideoRef.current) {
                const rect = inlineVideoRef.current.getBoundingClientRect();
                const clickYFromBottom = rect.bottom - e.clientY;
                if (clickYFromBottom <= 45) return;
              }
              handleFileActionClick(e);
            }}
          >
            <video
              ref={inlineVideoRef}
              src={resolvedMediaSrc}
              poster={fileData?.thumbnail || undefined}
              controls={!isBlurred}
              className={`w-auto h-auto max-w-full max-h-[400px] object-contain rounded-onicord-inner block animate-fade-in z-10 transition-all duration-normal ${
                isBlurred ? "blur-2xl scale-110 brightness-50 select-none pointer-events-none" : ""
              }`}
            />
            {isBlurred ? (
              <div className="absolute inset-0 flex items-center justify-center p-3 z-20 pointer-events-none">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-onicord-scrim-heavy backdrop-blur-onicord-popover border border-onicord-danger/40 text-onicord-danger text-xs font-semibold shadow-lg select-none">
                  <MaterialIcon name="visibility_off" size={16} className="text-onicord-danger" />
                  <span className="font-bold uppercase tracking-wider text-onicord-danger">{t("chat.nsfwBadge", "NSFW")}</span>
                </div>
              </div>
            ) : (
              <>
                {isNsfw && (
                  <div className="absolute top-2.5 left-2.5 z-30 flex items-center gap-1">
                    {autoBlurNsfw ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          inlineVideoRef.current?.pause?.();
                          setIsNsfwRevealed(false);
                        }}
                        title={t("chat.nsfwHideAgain", "Ocultar contenido NSFW")}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-onicord-base/85 backdrop-blur-onicord-popover border border-onicord-danger/40 text-onicord-danger hover:bg-onicord-danger/20 text-2xs font-bold uppercase tracking-wider shadow transition-colors cursor-pointer"
                      >
                        <MaterialIcon name="visibility_off" size={12} />
                        <span>{t("chat.nsfwBadge", "NSFW")}</span>
                      </button>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-onicord-base/85 backdrop-blur-onicord-popover border border-onicord-danger/40 text-onicord-danger text-2xs font-bold uppercase tracking-wider shadow">
                        {t("chat.nsfwBadge", "NSFW")}
                      </span>
                    )}
                  </div>
                )}
                <div className="absolute inset-0 bg-onicord-tint/5 opacity-0 group-hover/vid:opacity-100 transition-opacity duration-fast pointer-events-none z-20" />
              </>
            )}
          </div>
        )
      ) : isVideo && fileData?.thumbnail ? (
        <div
          onClick={(e) => {
            if (isBlurred) {
              e.stopPropagation();
              setIsNsfwRevealed(true);
              return;
            }
            handleFileActionClick(e);
          }}
          className="relative mt-1 max-w-[480px] rounded-onicord-inner overflow-hidden bg-onicord-scrim border border-onicord-border-strong cursor-pointer hover:border-onicord-accent/50 transition-all duration-normal group/thumb shadow-lg select-none"
        >
          <img
            src={fileData.thumbnail}
            alt={fileData.name}
            loading="lazy"
            decoding="async"
            className={`w-full max-h-[280px] object-cover rounded-onicord-inner block transition-all ${
              isBlurred
                ? "blur-2xl scale-110 brightness-50"
                : "opacity-90 group-hover/thumb:opacity-100"
            }`}
          />
          {isBlurred ? (
            <div className="absolute inset-0 flex items-center justify-center p-3 z-20 pointer-events-none">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-onicord-scrim-heavy backdrop-blur-onicord-popover border border-onicord-danger/40 text-onicord-danger text-xs font-semibold shadow-lg select-none">
                <MaterialIcon name="visibility_off" size={16} className="text-onicord-danger" />
                <span className="font-bold uppercase tracking-wider text-onicord-danger">{t("chat.nsfwBadge", "NSFW")}</span>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20 flex flex-col justify-between p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-onicord-scrim backdrop-blur-onicord-popover text-xs font-medium text-onicord-on-scrim/90 border border-onicord-border-strong">
                    <MaterialIcon name="videocam" size={14} className="text-onicord-success" />
                    {fileData.name?.split(".").pop()?.toUpperCase()}
                  </span>
                  {isNsfw && (
                    <span className="px-1.5 py-0.5 rounded-md bg-onicord-danger/20 border border-onicord-danger/40 text-onicord-danger text-2xs font-bold uppercase tracking-wider">
                      {t("chat.nsfwBadge", "NSFW")}
                    </span>
                  )}
                </div>
                <span className="px-2 py-0.5 rounded-md bg-onicord-scrim backdrop-blur-onicord-popover text-xs font-medium text-onicord-muted border border-onicord-border-strong">
                  {formatBytes(fileData.size)}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-onicord-accent text-onicord-on-accent shadow-md group-hover/thumb:scale-105 transition-transform">
                  {isDownloading ? (
                    <MaterialIcon name="downloading" size={22} className="animate-spin" />
                  ) : (
                    <MaterialIcon name="play_arrow" size={24} />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-onicord-on-scrim group-hover/thumb:text-onicord-accent transition-colors">
                    {fileData.name}
                  </p>
                  <p className="text-xs text-onicord-on-scrim/70">
                    {isDownloading
                      ? `${t("chat.downloading", "Descargando")} (${status?.progress || 0}%)…`
                      : t("chat.clickToDownloadPlay", "Haz clic para descargar y reproducir")}
                  </p>
                </div>
              </div>
            </div>
          )}
          {isDownloading && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-onicord-tint/20">
              <div
                className="h-full bg-onicord-accent transition-all duration-normal"
                style={{ width: `${status?.progress || 0}%` }}
              />
            </div>
          )}
        </div>
      ) : (() => {
        const iconConfig = getFileTypeIcon(fileData.name);
        return (
          <div className="onicord-file-attachment-card group/file">
            <div className="flex items-center gap-4 z-10">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${iconConfig.color}`}>
                <MaterialIcon name={iconConfig.name} size={20} />
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className={`truncate text-sm font-medium text-onicord-text hover:underline cursor-pointer ${isDownloading ? "pointer-events-none opacity-70" : ""}`}
                  onClick={(e) => handleFileActionClick(e)}
                >
                  {fileData.name}
                </p>
                <div className="text-xs text-onicord-muted select-none mt-0.5">
                  {status?.error ? (
                    <span className="text-onicord-danger">
                      {t("common.error", "Error")}: {status.error}
                    </span>
                  ) : isCompleted ? (
                    <span className="text-onicord-success font-medium flex flex-col items-start gap-1">
                      {t("chat.downloadCompleted")}
                      {fileData.name?.endsWith(".onipkg") && activePath && (
                        <button
                          type="button"
                          onClick={handleInstallPackClick}
                          className="onicord-btn-primary onicord-btn-primary-sm mt-1.5"
                        >
                          {t("chat.installStickerPack", "Instalar Paquete")}
                        </button>
                      )}
                    </span>
                  ) : isDownloading ? (
                    <span className="text-onicord-text">
                      {t("chat.downloading")} ({status.progress || 0}%)…
                    </span>
                  ) : (
                    <span>{formatBytes(fileData.size)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {isDownloading ? (
                  <button
                    type="button"
                    onClick={() => onCancelDownload(fileData.id)}
                    className="onicord-icon-btn-round onicord-icon-btn-round-danger"
                    title={t("chat.cancelDownload")}
                  >
                    <span className="text-sm font-bold leading-none">✕</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => handleFileActionClick(e)}
                    className={`onicord-icon-btn-round ${isCompleted ? "onicord-icon-btn-round-success" : ""}`}
                    title={
                      isCompleted
                        ? t("chat.viewFile", "Ver / Previsualizar")
                        : t("chat.downloadFile", "Descargar")
                    }
                  >
                    {isCompleted ? (
                      <MaterialIcon name="visibility" size={18} className="text-onicord-accent" />
                    ) : (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                    )}
                  </button>
                )}
              </div>
            </div>

            {isDownloading && (
              <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-onicord-surface">
                <div
                  className="h-full bg-onicord-success shadow-onicord-glow-success transition-all duration-normal ease-out"
                  style={{ width: `${status.progress || 0}%` }}
                />
              </div>
            )}
          </div>
        );
      })()}

      {execWarningModal.isOpen && (
        <ConfirmDialogModal
          isOpen={execWarningModal.isOpen}
          title={
            execWarningModal.mode === "blocked"
              ? t("chat.fileRestrictedTitle", "Tipo de archivo restringido")
              : t("chat.execDownloadTitle", "Advertencia de Descarga")
          }
          message={
            execWarningModal.mode === "blocked"
              ? t("chat.fileRestrictedMsg", "Este servidor tiene deshabilitado el envío y descarga de archivos ejecutables y scripts (.exe, .bat, .js) por políticas de seguridad.")
              : t("chat.execDownloadMsg", "Estás a punto de descargar o abrir un archivo ejecutable ({{name}}). Asegúrate de confiar en el remitente antes de abrirlo en tu ordenador.", { name: fileData?.name })
          }
          warningMessage={
            execWarningModal.mode === "confirm"
              ? t("chat.execDownloadWarning", "Los archivos ejecutables pueden contener scripts o código que modifique tu sistema.")
              : undefined
          }
          confirmLabel={
            execWarningModal.mode === "blocked"
              ? t("common.ok", "Entendido")
              : t("chat.downloadAnyway", "Descargar de todos modos")
          }
          cancelLabel={t("common.cancel", "Cancelar")}
          type={execWarningModal.mode === "blocked" ? "alert" : "confirm"}
          onConfirm={() => {
            const action = execWarningModal.onConfirm;
            setExecWarningModal({ isOpen: false, mode: "blocked", onConfirm: null });
            action?.();
          }}
          onCancel={() =>
            setExecWarningModal({ isOpen: false, mode: "blocked", onConfirm: null })
          }
        />
      )}
    </div>
  );
}
