import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import * as pdfjsLib from "pdfjs-dist";
import MaterialIcon from "../icons/MaterialIcon";

// Use the bundled worker from pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

export default function PdfViewer({ filePath, className = "" }) {
  const { t } = useTranslation();
  const [pdfDoc, setPdfDoc] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visiblePage, setVisiblePage] = useState(1);
  const scrollContainerRef = useRef(null);
  const pageRefs = useRef([]);
  const canvasRefs = useRef([]);
  const renderedPages = useRef(new Set());

  // Load the PDF document
  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      setLoading(true);
      setError(null);
      renderedPages.current = new Set();
      try {
        let data;
        if (window.electronAPI?.readBinaryFile) {
          const buffer = await window.electronAPI.readBinaryFile(filePath);
          if (!buffer) throw new Error("No se pudo leer el archivo");
          data = { data: new Uint8Array(buffer) };
        } else {
          data = { url: filePath };
        }

        const doc = await pdfjsLib.getDocument(data).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setVisiblePage(1);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (filePath) loadPdf();
    return () => { cancelled = true; };
  }, [filePath]);

  // Render a single page into its canvas
  const renderPage = useCallback(async (pageNum) => {
    if (!pdfDoc || renderedPages.current.has(`${pageNum}-${scale}`)) return;
    const canvas = canvasRefs.current[pageNum - 1];
    if (!canvas) return;

    try {
      renderedPages.current.add(`${pageNum}-${scale}`);
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const ctx = canvas.getContext("2d");

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (err) {
      console.error(`[PdfViewer] Error rendering page ${pageNum}:`, err);
      renderedPages.current.delete(`${pageNum}-${scale}`);
    }
  }, [pdfDoc, scale]);

  // Render all pages when doc loads or scale changes
  useEffect(() => {
    if (!pdfDoc) return;
    renderedPages.current = new Set();
    for (let i = 1; i <= totalPages; i++) {
      renderPage(i);
    }
  }, [pdfDoc, totalPages, scale, renderPage]);

  // Track which page is currently visible during scroll
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || totalPages === 0) return;

    const scrollTop = container.scrollTop;
    const containerHeight = container.clientHeight;
    const scrollMid = scrollTop + containerHeight / 2;

    for (let i = 0; i < pageRefs.current.length; i++) {
      const el = pageRefs.current[i];
      if (!el) continue;
      if (el.offsetTop <= scrollMid && el.offsetTop + el.offsetHeight > scrollMid) {
        setVisiblePage(i + 1);
        break;
      }
    }
  }, [totalPages]);

  // Scroll to a specific page
  const goToPage = useCallback((pageNum) => {
    const el = pageRefs.current[pageNum - 1];
    if (el && scrollContainerRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center p-12 bg-onicord-mantle rounded-2xl border border-onicord-island gap-3 w-full h-[70vh] ${className}`}>
        <MaterialIcon name="picture_as_pdf" size="xl" className="animate-pulse text-onicord-accent" />
        <p className="text-sm font-semibold text-onicord-text">{t("pdf.loading", "Cargando documento PDF...")}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center p-12 bg-onicord-mantle rounded-2xl border border-onicord-island gap-3 w-full h-[40vh] ${className}`}>
        <MaterialIcon name="error" size="xl" className="text-red-400" />
        <p className="text-sm font-semibold text-onicord-text">{t("pdf.error", "Error al cargar PDF")}</p>
        <p className="text-xs text-onicord-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center gap-3 w-full ${className}`}>
      {/* Controls */}
      <div className="flex items-center gap-2 bg-onicord-crust/80 backdrop-blur-sm rounded-full px-4 py-2 border border-onicord-island shadow-lg select-none z-10">
        <button
          type="button"
          onClick={() => goToPage(Math.max(1, visiblePage - 1))}
          disabled={visiblePage <= 1}
          className="onicord-icon-btn w-8 h-8 rounded-full flex items-center justify-center text-sm disabled:opacity-30 cursor-pointer disabled:cursor-default"
        >
          <MaterialIcon name="chevron_left" size="sm" />
        </button>
        <span className="text-xs font-semibold text-onicord-text min-w-[80px] text-center">
          {visiblePage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => goToPage(Math.min(totalPages, visiblePage + 1))}
          disabled={visiblePage >= totalPages}
          className="onicord-icon-btn w-8 h-8 rounded-full flex items-center justify-center text-sm disabled:opacity-30 cursor-pointer disabled:cursor-default"
        >
          <MaterialIcon name="chevron_right" size="sm" />
        </button>

        <div className="w-px h-5 bg-onicord-island mx-1" />

        <button
          type="button"
          onClick={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))}
          disabled={scale <= 0.5}
          className="onicord-icon-btn w-8 h-8 rounded-full flex items-center justify-center text-sm disabled:opacity-30 cursor-pointer disabled:cursor-default"
        >
          <MaterialIcon name="remove" size="sm" />
        </button>
        <span className="text-xs font-semibold text-onicord-text min-w-[45px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)))}
          disabled={scale >= 3}
          className="onicord-icon-btn w-8 h-8 rounded-full flex items-center justify-center text-sm disabled:opacity-30 cursor-pointer disabled:cursor-default"
        >
          <MaterialIcon name="add" size="sm" />
        </button>
      </div>

      {/* Scrollable pages container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="w-full max-h-[78vh] overflow-auto rounded-2xl border border-white/10 bg-neutral-800 shadow-2xl"
      >
        <div className="flex flex-col items-center gap-4 p-4">
          {Array.from({ length: totalPages }, (_, i) => (
            <div
              key={i}
              ref={(el) => { pageRefs.current[i] = el; }}
              className="shrink-0"
            >
              <canvas
                ref={(el) => { canvasRefs.current[i] = el; }}
                className="rounded-lg shadow-md"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
