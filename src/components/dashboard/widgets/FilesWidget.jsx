import React from "react";
import { useTranslation } from "react-i18next";

export default function FilesWidget({ recentFiles = [], profile }) {
  const { t } = useTranslation();
  const myUserId = profile?.id || null;
  const enviados = recentFiles.filter(
    (f) => f.ownerId === myUserId && myUserId !== null,
  );
  const recibidos = recentFiles.filter((f) => f.ownerId !== myUserId);
  const totalFilesCount = recentFiles.length;

  return (
    <div
      style={{ containerType: "inline-size" }}
      className="onicord-widget-shell w-full h-full p-6 flex flex-col justify-between select-none"
    >
      {}
      <div className="onicord-widget-header flex justify-between items-center w-full gap-2 mb-2 shrink-0">
        <h3
          style={{ fontSize: "clamp(0.6rem, 3.5cqi, 0.8rem)" }}
          className="onicord-widget-title font-bold text-onicord-dark/90 truncate"
        >
          {t("widgets.files.title", "Files")}
        </h3>
        <span
          style={{ fontSize: "clamp(0.6rem, 3cqi, 0.5rem)" }}
          className="onicord-widget-badge-fixed shrink-0 px-2 py-0.5 font-medium"
        >
          P2P
        </span>
      </div>

      {}
      <div className="flex-1 grid grid-cols-2 gap-3 min-h-0 my-1">
        {}
        <div className="flex flex-col min-w-0 h-full">
          <span
            style={{ fontSize: "clamp(0.55rem, 2.5cqi, 0.75rem)" }}
            className="font-black uppercase tracking-tight text-onicord-dark-muted mb-1 flex items-center gap-1 shrink-0"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-black/40" />
            {t("widgets.files.sent", "Sent")} ({enviados.length})
          </span>
          <div className="flex-1 min-w-0 flex flex-col gap-1.5 overflow-y-auto pr-0.5">
            {enviados.length > 0 ? (
              enviados.slice(0, 5).map((file, idx) => (
                <div
                  key={file.id}
                  className={`onicord-widget-list-item ${idx >= 3 ? "hidden @md:block" : ""}`}
                  title={file.name}
                >
                  <p
                    style={{ fontSize: "clamp(0.6rem, 2.8cqi, 0.8rem)" }}
                    className="font-mono font-bold text-onicord-dark truncate"
                  >
                    {file.name}
                  </p>
                </div>
              ))
            ) : (
              <p
                style={{ fontSize: "clamp(0.55rem, 2.5cqi, 0.75rem)" }}
                className="text-onicord-dark-muted italic py-1"
              >
                {t("widgets.files.noTransfers", "No transfers")}
              </p>
            )}
          </div>
        </div>

        {}
        <div className="flex flex-col min-w-0 h-full">
          <span
            style={{ fontSize: "clamp(0.55rem, 2.5cqi, 0.75rem)" }}
            className="font-black uppercase tracking-tight text-onicord-dark-muted mb-1 flex items-center gap-1 shrink-0"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-black/20" />
            {t("widgets.files.received", "Received")} ({recibidos.length})
          </span>
          <div className="flex-1 min-w-0 flex flex-col gap-1.5 overflow-y-auto pr-0.5">
            {recibidos.length > 0 ? (
              recibidos.slice(0, 5).map((file, idx) => (
                <div
                  key={file.id}
                  className={`onicord-widget-list-item bg-black/10 ${idx >= 3 ? "hidden @md:block" : ""}`}
                  title={file.name}
                >
                  <p
                    style={{ fontSize: "clamp(0.6rem, 2.8cqi, 0.8rem)" }}
                    className="font-mono font-bold text-onicord-dark-sub truncate"
                  >
                    {file.name}
                  </p>
                </div>
              ))
            ) : (
              <p
                style={{ fontSize: "clamp(0.55rem, 2.5cqi, 0.75rem)" }}
                className="text-onicord-dark-muted italic py-1"
              >
                {t("widgets.files.noDownloads", "No downloads")}
              </p>
            )}
          </div>
        </div>
      </div>

      {}
      <div
        style={{ fontSize: "clamp(0.55rem, 2.8cqi, 0.75rem)" }}
        className="onicord-widget-footer-sep mt-2 text-onicord-dark-muted"
      >
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-onicord-dark animate-pulse" />
          <span>{t("widgets.files.filestoreIndex", "FileStore Index")}</span>
        </div>
        <span className="font-mono font-bold">{totalFilesCount} {t("widgets.files.objects", "Objects")}</span>
      </div>
    </div>
  );
}

FilesWidget.widgetId = "ares";
FilesWidget.badgeText = "Shared Files";
FilesWidget.bgVariant = "success";
FilesWidget.defaultGeo = { x: 7, y: 1, w: 3, h: 3 };
FilesWidget.minW = 3;
FilesWidget.minH = 2;
