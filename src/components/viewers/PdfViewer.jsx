import { useEffect, useRef, useState, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import MaterialIcon from "../icons/MaterialIcon";

// Use the bundled worker from pdfjs-dist
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

// Individual virtualized page canvas component with text-layer selection & render cancellation
const PdfPageItem = memo(function PdfPageItem({ pdfDoc, pageNum, scale }) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const [pageDimensions, setPageDimensions] = useState({ width: 0, height: 0 });
  const [pageError, setPageError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask = null;
    let textLayer = null;

    const render = async () => {
      if (!pdfDoc || !canvasRef.current) return;
      try {
        setPageError(null);
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        setPageDimensions({ width: viewport.width, height: viewport.height });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;

        if (cancelled) return;

        // Render Text Layer overlay for selecting, highlighting and copying text
        if (textLayerRef.current) {
          textLayerRef.current.innerHTML = "";
          const textContent = await page.getTextContent();
          if (cancelled) return;

          textLayer = new pdfjsLib.TextLayer({
            textContentSource: textContent,
            container: textLayerRef.current,
            viewport,
          });
          await textLayer.render();
        }
      } catch (err) {
        if (!cancelled && err?.name !== "RenderingCancelledException") {
          console.error(`[PdfViewer] Error rendering page ${pageNum}:`, err);
          setPageError(err.message);
        }
      }
    };

    render();

    return () => {
      cancelled = true;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch (_) {}
      }
      if (textLayer) {
        try {
          textLayer.cancel();
        } catch (_) {}
      }
    };
  }, [pdfDoc, pageNum, scale]);

  if (pageError) {
    return (
      <div className="flex items-center justify-center bg-black/40 text-xs text-red-400 p-4 rounded-lg min-h-[300px] w-full">
        Error al renderizar página {pageNum}
      </div>
    );
  }

  return (
    <div
      className="relative rounded-lg shadow-md overflow-hidden bg-white select-text pointer-events-auto"
      style={{
        width: pageDimensions.width || "auto",
        height: pageDimensions.height || "auto",
      }}
    >
      <canvas
        ref={canvasRef}
        className="block rounded-lg"
      />
      <div
        ref={textLayerRef}
        className="textLayer absolute inset-0 pointer-events-auto select-text"
        style={{
          width: pageDimensions.width || "100%",
          height: pageDimensions.height || "100%",
        }}
      />
    </div>
  );
});

export default function PdfViewer({ filePath, className = "" }) {
  const { t } = useTranslation();
  const [pdfDoc, setPdfDoc] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visiblePage, setVisiblePage] = useState(1);
  const scrollContainerRef = useRef(null);

  // Load the PDF document
  useEffect(() => {
    let cancelled = false;

    const loadPdf = async () => {
      setLoading(true);
      setError(null);
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

  // High-performance virtualizer for pages: only renders active in-viewport pages
  const rowVirtualizer = useVirtualizer({
    count: totalPages,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => Math.round(840 * scale) + 16,
    overscan: 2,
  });

  // Track which page is currently centered in viewport
  const handleScroll = useCallback(() => {
    const virtualItems = rowVirtualizer.getVirtualItems();
    if (!virtualItems || virtualItems.length === 0) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollMid = container.scrollTop + container.clientHeight / 2;
    for (const item of virtualItems) {
      if (item.start <= scrollMid && item.end >= scrollMid) {
        setVisiblePage(item.index + 1);
        break;
      }
    }
  }, [rowVirtualizer]);

  // Scroll to a specific page
  const goToPage = useCallback((pageNum) => {
    if (pageNum < 1 || pageNum > totalPages) return;
    rowVirtualizer.scrollToIndex(pageNum - 1, { align: "start", behavior: "smooth" });
    setVisiblePage(pageNum);
  }, [rowVirtualizer, totalPages]);

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

      {/* Scrollable virtualized pages container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="w-full max-h-[78vh] overflow-auto rounded-2xl border border-white/10 bg-neutral-800 shadow-2xl relative"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const pageNum = virtualRow.index + 1;
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="flex justify-center p-3"
              >
                <PdfPageItem
                  pdfDoc={pdfDoc}
                  pageNum={pageNum}
                  scale={scale}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
