import React, { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Logo from "../icons/Logo.svg?react";
import MaterialIcon from "../icons/MaterialIcon";
import ConfirmDialogModal from "../modals/ConfirmDialogModal";
import MediaPreviewModal from "../modals/MediaPreviewModal";
import { getMediaUrl } from "../../lib/media";

export default function ServerStorageTab({ server }) {
  const { t } = useTranslation();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [visibleCount, setVisibleCount] = useState(24);
  const [showClearCacheModal, setShowClearCacheModal] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(null);

  const code = server?.roomCode || server?.code || server?.id;

  const loadFiles = async () => {
    if (!code) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const serverFiles = await window.electronAPI.getServerFiles(code);
      setFiles(serverFiles || []);
    } catch (e) {
      console.error("[Storage Tab] Error loading files:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();

    if (window.electronAPI?.onFileProgress) {
      const unsub = window.electronAPI.onFileProgress((data) => {
        if (data && data.done) {
          setTimeout(() => {
            loadFiles();
          }, 200);
        }
      });
      return () => unsub();
    }
  }, [server]);

  const formatBytes = (bytes, decimals = 1) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  const filteredFiles = useMemo(() => {
    if (category === "all") return files;
    return files.filter((f) => f.type === category);
  }, [files, category]);

  const visibleFiles = useMemo(() => {
    return filteredFiles.slice(0, visibleCount);
  }, [filteredFiles, visibleCount]);

  const handleCategoryChange = (newCat) => {
    setCategory(newCat);
    setVisibleCount(24);
  };

  const handleClearCacheConfirm = async () => {
    if (!code) return;
    try {
      const ok = await window.electronAPI.clearServerCache(code);
      if (ok) {
        setFiles([]);
      }
    } catch (e) {
      console.error("[Storage Tab] Error clearing cache:", e);
    } finally {
      setShowClearCacheModal(false);
    }
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const imagesSize = files.filter((f) => f.type === "image").reduce((acc, f) => acc + f.size, 0);
  const videosSize = files.filter((f) => f.type === "video").reduce((acc, f) => acc + f.size, 0);
  const audioSize = files.filter((f) => f.type === "audio").reduce((acc, f) => acc + f.size, 0);
  const textSize = files.filter((f) => f.type === "text").reduce((acc, f) => acc + f.size, 0);
  const docsSize = files.filter((f) => f.type === "document" || f.type === "pdf").reduce((acc, f) => acc + f.size, 0);

  const getPercentage = (size) => {
    if (totalSize === 0) return 0;
    return (size / totalSize) * 100;
  };

  return (
    <div className="onicord-settings-container">
      {/* Storage overview and breakdown */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between gap-3">
          <h3 className="onicord-settings-section-title !mb-0">
            <span>{t("serverSettings.storage.title", "Almacenamiento del Servidor")}</span>
          </h3>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-white bg-onicord-base/80 border border-white/10 px-2.5 py-1 rounded-lg">
              {formatBytes(totalSize)}
            </span>
            {files.length > 0 && (
              <button
                type="button"
                onClick={() => setShowClearCacheModal(true)}
                className="bg-onicord-accent/10 hover:bg-onicord-accent/20 text-onicord-accent border border-onicord-accent/30 rounded-lg px-3 py-1 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                title={t("serverSettings.storage.clearCacheTooltip", "Limpia la lista de archivos registrados en la app para este servidor. Ningún archivo físico de tu ordenador será borrado.")}
              >
                <MaterialIcon name="link_off" size={15} />
                <span>{t("serverSettings.storage.clearAll", "Limpiar Registro de Archivos")}</span>
              </button>
            )}
          </div>
        </div>

        <p className="onicord-settings-row-desc">
          {t("serverSettings.storage.filesCount", "{{count}} archivos guardados en caché local", { count: files.length })}
        </p>

        {/* Storage Bar Chart */}
        {files.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-white/5">
            <div className="h-2.5 w-full bg-onicord-base/80 rounded-full overflow-hidden flex border border-white/5">
              <div
                style={{ width: `${getPercentage(imagesSize)}%` }}
                className="bg-sky-500 h-full transition-all duration-300"
                title={t("serverSettings.storage.imagesTitle", "Imágenes: {{size}}", { size: formatBytes(imagesSize) })}
              />
              <div
                style={{ width: `${getPercentage(videosSize)}%` }}
                className="bg-emerald-500 h-full transition-all duration-300"
                title={t("serverSettings.storage.videosTitle", "Vídeos: {{size}}", { size: formatBytes(videosSize) })}
              />
              <div
                style={{ width: `${getPercentage(audioSize)}%` }}
                className="bg-amber-500 h-full transition-all duration-300"
                title={t("serverSettings.storage.audioTitle", "Audio: {{size}}", { size: formatBytes(audioSize) })}
              />
              <div
                style={{ width: `${getPercentage(textSize)}%` }}
                className="bg-purple-500 h-full transition-all duration-300"
                title={t("serverSettings.storage.textTitle", "Texto: {{size}}", { size: formatBytes(textSize) })}
              />
              <div
                style={{ width: `${getPercentage(docsSize)}%` }}
                className="bg-indigo-500 h-full transition-all duration-300"
                title={t("serverSettings.storage.docsTitle", "Documentos: {{size}}", { size: formatBytes(docsSize) })}
              />
            </div>

            {/* Category Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-onicord-muted font-medium pt-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-sky-500" />
                <span>{t("serverSettings.storage.images", "Imágenes")}: {formatBytes(imagesSize)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-emerald-500" />
                <span>{t("serverSettings.storage.videos", "Vídeos")}: {formatBytes(videosSize)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-amber-500" />
                <span>{t("serverSettings.storage.audio", "Audio")}: {formatBytes(audioSize)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-purple-500" />
                <span>{t("serverSettings.storage.text", "Texto/Código")}: {formatBytes(textSize)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-indigo-500" />
                <span>{t("serverSettings.storage.documents", "Documentos")}: {formatBytes(docsSize)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Media files grid and filters */}
      <div className="onicord-settings-card">
        {/* Category filter pills */}
        <div className="flex gap-2 pb-1 overflow-x-auto minimal-scrollbar">
          {[
            { id: "all", label: t("common.all", "Todos"), icon: "folder_open" },
            { id: "image", label: t("serverSettings.storage.images", "Imágenes"), icon: "image" },
            { id: "video", label: t("serverSettings.storage.videos", "Vídeos"), icon: "movie" },
            { id: "audio", label: t("serverSettings.storage.audio", "Audio"), icon: "music_note" },
            { id: "text", label: t("serverSettings.storage.text", "Texto"), icon: "code" },
            { id: "document", label: t("serverSettings.storage.documents", "Documentos"), icon: "description" },
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleCategoryChange(c.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all flex items-center gap-1.5 cursor-pointer ${
                category === c.id
                  ? "bg-onicord-accent text-onicord-dark border-onicord-accent font-bold"
                  : "bg-onicord-base/40 text-onicord-muted border-white/5 hover:bg-white/10 hover:text-white"
              }`}
            >
              <MaterialIcon name={c.icon} size={14} />
              <span>{c.label}</span>
            </button>
          ))}
        </div>

        {/* Rejilla de Archivos */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-onicord-muted">
            <div className="onicord-loading-container onicord-bounce-logo h-10 w-10 text-onicord-accent">
              <Logo className="w-full h-full" />
            </div>
            <span className="text-xs font-medium">{t("common.loading", "Cargando archivos...")}</span>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="p-8 rounded-xl bg-onicord-base/30 border border-white/5 flex flex-col items-center justify-center text-center space-y-2">
            <MaterialIcon name="folder_zip" size={36} className="text-onicord-muted opacity-40" />
            <h4 className="text-xs font-bold text-white">
              {t("serverSettings.storage.noFilesTitle", "Sin archivos en esta categoría")}
            </h4>
            <p className="text-[11px] text-onicord-muted max-w-sm leading-relaxed">
              Los archivos compartidos en los canales de texto de este servidor aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {visibleFiles.map((file, index) => (
                <div
                  key={file.id || file.localPath || `${file.name}-${index}`}
                  onClick={() => setPreviewIndex(index)}
                  className="group relative bg-onicord-base/60 hover:bg-onicord-base border border-white/5 hover:border-onicord-accent/40 rounded-xl p-2.5 flex flex-col justify-between transition-all duration-200 cursor-pointer"
                  style={{ contain: "content" }}
                  title={t("common.clickToPreview", "Clic para previsualizar")}
                >
                  {/* Fast file preview */}
                  <div className="w-full aspect-video rounded-lg bg-black/40 flex items-center justify-center overflow-hidden mb-2 relative">
                    {file.type === "image" ? (
                      <img
                        src={getMediaUrl(file.localPath)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover select-none pointer-events-none"
                      />
                    ) : file.type === "video" ? (
                      <div className="w-full h-full bg-emerald-950/30 flex flex-col items-center justify-center gap-1 group-hover:bg-emerald-900/40 transition duration-200">
                        <MaterialIcon name="play_circle_filled" size={28} className="text-emerald-400 drop-shadow group-hover:scale-110 transition duration-300" />
                        <span className="text-[9px] font-mono font-bold text-emerald-300 uppercase tracking-wider">{t("common.video", "VIDEO")}</span>
                      </div>
                    ) : file.type === "audio" ? (
                      <MaterialIcon name="music_note" size={24} className="text-amber-400 group-hover:scale-110 transition duration-300" />
                    ) : file.type === "text" ? (
                      <MaterialIcon name="code" size={24} className="text-purple-400 group-hover:scale-110 transition duration-300" />
                    ) : file.type === "pdf" ? (
                      <MaterialIcon name="picture_as_pdf" size={24} className="text-rose-400 group-hover:scale-110 transition duration-300" />
                    ) : (
                      <MaterialIcon name="description" size={24} className="text-onicord-muted group-hover:scale-110 transition duration-300" />
                    )}

                    {/* Preview overlay icon */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                      <MaterialIcon name="visibility" size={20} className="text-white drop-shadow" />
                    </div>
                  </div>

                  {/* File text info */}
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-white truncate leading-tight" title={file.name}>
                      {file.name}
                    </h4>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-onicord-muted">
                      <span>{formatBytes(file.size)}</span>
                      <span className="uppercase text-[9px] bg-white/5 px-1.5 py-0.5 rounded font-mono">
                        {file.extension.slice(1) || "FILE"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Incremental Pagination - Load More */}
            {filteredFiles.length > visibleCount && (
              <div className="flex justify-center pt-2 pb-1">
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + 24)}
                  className="onicord-btn-secondary px-5 py-2 text-xs font-bold border border-onicord-island hover:bg-onicord-accent hover:text-onicord-mantle rounded-xl flex items-center gap-2 transition duration-150 cursor-pointer shadow-md"
                >
                  <MaterialIcon name="expand_more" size={16} />
                  <span>Cargar más ({filteredFiles.length - visibleCount} restantes)</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* INDEX UNLINK CONFIRMATION MODAL */}
      {showClearCacheModal && (
        <ConfirmDialogModal
          isOpen={showClearCacheModal}
          title={t("serverSettings.storage.clearAll", "Limpiar Registro de Archivos")}
          message={t("serverSettings.storage.confirmClear", "¿Deseas limpiar la lista de archivos registrados en este servidor?")}
          warningMessage={t("serverSettings.storage.clearWarning", "Esta acción únicamente limpia el historial mostrado en la aplicación. Todos tus archivos físicos (locales y descargados) continuarán intactos en tu ordenador.")}
          confirmLabel={t("serverSettings.storage.clearAll", "Limpiar Registro")}
          cancelLabel={t("common.cancel", "Cancelar")}
          onConfirm={handleClearCacheConfirm}
          onCancel={() => setShowClearCacheModal(false)}
        />
      )}

      {/* MEDIA PREVIEW MODAL WITH CAROUSEL NAVIGATION */}
      {previewIndex !== null && (
        <MediaPreviewModal
          isOpen={previewIndex !== null}
          onClose={() => setPreviewIndex(null)}
          filesList={filteredFiles}
          currentIndex={previewIndex}
          onNavigate={(idx) => setPreviewIndex(idx)}
          formatBytes={formatBytes}
        />
      )}
    </div>
  );
}
