import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import Tooltip from "../../ui/Tooltip";
import { useWidgetLayout } from "../WidgetLayoutContext";
import WidgetShell from "../primitives/WidgetShell";
import HeroMetric from "../primitives/HeroMetric";
import SegmentedBlockBar from "../primitives/SegmentedBlockBar";

function getFileIcon(name = "") {
  const ext = String(name).split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"].includes(ext)) return "image";
  if (["mp4", "mkv", "webm", "mov", "avi"].includes(ext)) return "movie";
  if (["mp3", "wav", "ogg", "flac", "m4a"].includes(ext)) return "audio_file";
  if (["zip", "rar", "7z", "tar", "gz", "onipkg"].includes(ext)) return "folder_zip";
  if (["js", "jsx", "ts", "tsx", "py", "json", "css", "html"].includes(ext)) return "code";
  if (["pdf", "doc", "docx", "txt", "md"].includes(ext)) return "description";
  return "insert_drive_file";
}

function formatFileSize(bytes) {
  const num = Number(bytes);
  if (!Number.isFinite(num) || num <= 0) return "";
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  if (num < 1024 * 1024 * 1024) return `${(num / (1024 * 1024)).toFixed(1)} MB`;
  return `${(num / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function FilesWidgetV2({ recentFiles = [], profile }) {
  const { t } = useTranslation();
  const { sizeMode } = useWidgetLayout();
  const [filterTab, setFilterTab] = useState("all");

  const myUserId = profile?.id || null;

  const { sentFiles, receivedFiles } = useMemo(() => {
    const sent = recentFiles.filter((f) => f.ownerId === myUserId && myUserId !== null);
    const recv = recentFiles.filter((f) => f.ownerId !== myUserId);
    return { sentFiles: sent, receivedFiles: recv };
  }, [recentFiles, myUserId]);

  const total = recentFiles.length;

  const visibleList = useMemo(() => {
    if (filterTab === "sent") return sentFiles.map((f) => ({ ...f, dir: "sent" }));
    if (filterTab === "received") return receivedFiles.map((f) => ({ ...f, dir: "recv" }));
    return recentFiles.map((f) => ({
      ...f,
      dir: f.ownerId === myUserId && myUserId !== null ? "sent" : "recv",
    }));
  }, [filterTab, sentFiles, receivedFiles, recentFiles, myUserId]);

  const openFileFolder = (file) => {
    const targetPath = file.localPath || file.path || file.filePath;
    if (targetPath && window.electronAPI?.showItemInFolder) {
      window.electronAPI.showItemInFolder(targetPath);
    }
  };

  const filterControl = (
    <div className="bento-v2-pill-group">
      {[
        { id: "all", label: t("widgets.files.all", "ALL") },
        { id: "sent", label: `↑${sentFiles.length}` },
        { id: "received", label: `↓${receivedFiles.length}` },
      ].map((tab) => {
        const active = filterTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterTab(tab.id)}
            style={
              active
                ? { backgroundColor: "var(--widget-pill-fg)", color: "var(--widget-pill-bg)" }
                : undefined
            }
            className="h-full px-2 rounded-full text-2xs font-mono font-bold cursor-pointer"
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );

  const splitSegments = [
    { id: "sent", label: t("widgets.files.sent", "Enviados"), value: Math.max(sentFiles.length, total === 0 ? 1 : 0), opacity: 0.92 },
    { id: "recv", label: t("widgets.files.received", "Recibidos"), value: Math.max(receivedFiles.length, total === 0 ? 1 : 0), opacity: 0.32 },
  ];

  // MICRO mode
  if (sizeMode === "micro") {
    return (
      <WidgetShell>
        <div className="flex-1 flex flex-col justify-between min-h-0">
          <span className="bento-v2-label-micro bento-v2-ink-muted">P2P</span>
          <HeroMetric
            value={total}
            sublabel={`↑${sentFiles.length} · ↓${receivedFiles.length}`}
            sizeScale="lg"
          />
        </div>
      </WidgetShell>
    );
  }

  // STRIP mode
  if (sizeMode === "strip") {
    return (
      <WidgetShell title={t("widgets.files.title", "Archivos")} headerRight={filterControl}>
        <div className="flex-1 flex items-center gap-4 min-h-0">
          <div className="flex flex-col gap-1.5 w-32 shrink-0">
            <HeroMetric value={total} sizeScale="sm" />
            <SegmentedBlockBar segments={splitSegments} className="h-3" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            {visibleList.slice(0, 2).map((file, idx) => (
              <button
                key={file.id || idx}
                type="button"
                onClick={() => openFileFolder(file)}
                className="w-full px-2.5 py-1 rounded-onicord-button bento-v2-ink-track flex items-center gap-2 text-left cursor-pointer"
              >
                <MaterialIcon name={getFileIcon(file.name)} size={14} className="shrink-0" />
                <span className="text-xs font-bold truncate flex-1">{file.name}</span>
                <span className="text-2xs font-mono bento-v2-ink-muted shrink-0">
                  {file.dir === "sent" ? "↑" : "↓"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </WidgetShell>
    );
  }

  // COMPACT / PILLAR / STANDARD / EXPANDED
  return (
    <WidgetShell
      title={t("widgets.files.title", "Archivos")}
      headerRight={filterControl}
      footer={
        <div className="flex items-center justify-between text-2xs font-mono font-bold bento-v2-ink-muted">
          <span>{t("widgets.files.filestoreIndex", "FileStore Index")}</span>
          <span>
            {total} {t("widgets.files.objects", "Objetos")}
          </span>
        </div>
      }
    >
      <div className="flex-1 flex flex-col gap-2.5 min-h-0">
        <div className="flex items-end justify-between gap-3 shrink-0">
          <HeroMetric value={total} sizeScale="sm" />
          <div className="flex-1 max-w-[160px] flex flex-col gap-1 pb-1">
            <div className="flex justify-between text-2xs font-mono font-bold bento-v2-ink-muted">
              <span>↑ {sentFiles.length}</span>
              <span>↓ {receivedFiles.length}</span>
            </div>
            <SegmentedBlockBar segments={splitSegments} className="h-3" />
          </div>
        </div>

        <div
          className={
            sizeMode === "expanded" && filterTab === "all"
              ? "flex-1 min-h-0 grid grid-cols-2 gap-1.5 overflow-y-auto bento-v2-no-scrollbar pr-0.5"
              : "flex-1 min-h-0 overflow-y-auto bento-v2-no-scrollbar space-y-1.5 pr-0.5"
          }
          data-no-drag="true"
        >
          {visibleList.length === 0 ? (
            <p className="text-2xs bento-v2-ink-muted italic py-2 col-span-2">
              {t("widgets.files.noTransfers", "No transfers")}
            </p>
          ) : (
            visibleList.slice(0, sizeMode === "compact" ? 3 : 10).map((file, idx) => {
              const sizeStr = formatFileSize(file.size || file.fileSize);
              return (
                <Tooltip
                  key={file.id || `${file.name}-${idx}`}
                  content={file.name}
                  side="top"
                >
                  <button
                    type="button"
                    onClick={() => openFileFolder(file)}
                    className="w-full px-2.5 py-1.5 rounded-onicord-button bento-v2-ink-track hover:opacity-90 border bento-v2-ink-divider flex items-center gap-2 text-left transition-opacity cursor-pointer min-w-0"
                  >
                    <MaterialIcon name={getFileIcon(file.name)} size={15} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{file.name}</p>
                      {sizeStr && (
                        <p className="text-2xs font-mono bento-v2-ink-muted truncate">{sizeStr}</p>
                      )}
                    </div>
                    <span className="text-xs font-mono font-black shrink-0 bento-v2-ink-muted">
                      {file.dir === "sent" ? "↑" : "↓"}
                    </span>
                  </button>
                </Tooltip>
              );
            })
          )}
        </div>
      </div>
    </WidgetShell>
  );
}
