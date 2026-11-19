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
const PdfPageItem = memo(function PdfPageItem({
  pdfDoc,
  pageNum,
  scale,
  expectedWidth,
  expectedHeight,
}) {
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const [pageDimensions, setPageDimensions] = useState({
    width: expectedWidth || 0,
    height: expectedHeight || 0,
  });
  const [pageError, setPageError] = useState(null);

  useEffect(() => {
    if (expectedWidth && expectedHeight) {
      setPageDimensions({ width: expectedWidth, height: expectedHeight });
    }
  }, [expectedWidth, expectedHeight]);

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
        const width = Math.round(viewport.width);
        const height = Math.round(viewport.height);
        setPageDimensions({ width, height });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);

        const renderContext = {
          canvasContext: ctx,
          viewport,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        };

        renderTask = page.render(renderContext);
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

  const currentW = pageDimensions.width || expectedWidth || "auto";
  const currentH = pageDimensions.height || expectedHeight || "auto";

  return (
    <div
      className="relative rounded-lg shadow-lg overflow-hidden bg-white select-text pointer-events-auto shrink-0 transition-shadow"
      style={{
        width: typeof currentW === "number" ? `${currentW}px` : currentW,
        height: typeof currentH === "number" ? `${currentH}px` : currentH,
      }}
    >
      <canvas
        ref={canvasRef}
        className="block rounded-lg"
        style={{
          width: typeof currentW === "number" ? `${currentW}px` : "100%",
          height: typeof currentH === "number" ? `${currentH}px` : "100%",
        }}
      />
      <div
        ref={textLayerRef}
        className="textLayer absolute inset-0 pointer-events-auto select-text"
        style={{
          width: typeof currentW === "number" ? `${currentW}px` : "100%",
          height: typeof currentH === "number" ? `${currentH}px` : "100%",
        }}
      />
    </div>
  );
});

export default function PdfViewer({ filePath, className = "" }) {
  const { t } = useTranslation();
  const [pdfDoc, setPdfDoc] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [autoFit, setAutoFit] = useState(true);
  const [basePageSize, setBasePageSize] = useState(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visiblePage, setVisiblePage] = useState(1);
  const scrollContainerRef = useRef(null);

  const calculateFitScale = useCallback((cWidth, bWidth) => {
    if (!cWidth || !bWidth) return 1.0;
    // Padding inside row is p-3 (12px * 2 = 24px) plus vertical scrollbar (~16px) -> 44px buffer
    const availableWidth = Math.max(200, cWidth - 44);
    const targetScale = Math.min(3.0, Math.max(0.4, +(availableWidth / bWidth).toFixed(2)));
    return targetScale;
  }, []);

  // Track container width and adjust scale if autoFit is active
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleResize = () => {
      const newWidth = container.clientWidth;
      if (newWidth > 0) {
        setContainerWidth(newWidth);
        if (autoFit && basePageSize?.width) {
          const fitScale = calculateFitScale(newWidth, basePageSize.width);
          setScale(fitScale);
        }
      }
    };

    handleResize();

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [autoFit, basePageSize, calculateFitScale]);

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

        try {
          const firstPage = await doc.getPage(1);
          if (cancelled) return;
          const unscaledViewport = firstPage.getViewport({ scale: 1.0 });
          const baseSize = {
            width: Math.round(unscaledViewport.width),
            height: Math.round(unscaledViewport.height),
          };
          setBasePageSize(baseSize);

          const currentCWidth = scrollContainerRef.current?.clientWidth || 0;
          if (currentCWidth > 0) {
            const fitScale = calculateFitScale(currentCWidth, baseSize.width);
            setScale(fitScale);
          }
        } catch (pageErr) {
          console.warn("[PdfViewer] Could not read page 1 dimensions:", pageErr);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (filePath) loadPdf();
    return () => { cancelled = true; };
  }, [filePath, calculateFitScale]);

  const estimatedPageHeight = Math.round((basePageSize?.height || 842) * scale);

  // High-performance virtualizer for pages: only renders active in-viewport pages
  const rowVirtualizer = useVirtualizer({
    count: totalPages,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => estimatedPageHeight + 24,
    overscan: 2,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [scale, rowVirtualizer]);

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

  const handleZoomIn = () => {
    setAutoFit(false);
    setScale((s) => Math.min(3.0, +(s + 0.2).toFixed(2)));
  };

  const handleZoomOut = () => {
    setAutoFit(false);
    setScale((s) => Math.max(0.4, +(s - 0.2).toFixed(2)));
  };

  const handleResetZoom = () => {
    setAutoFit(false);
    setScale(1.0);
  };

  const handleToggleFitWidth = () => {
    if (autoFit) {
      setAutoFit(false);
      setScale(1.0);
    } else {
      setAutoFit(true);
      const cWidth = containerWidth || scrollContainerRef.current?.clientWidth || 0;
      if (cWidth > 0 && basePageSize?.width) {
        setScale(calculateFitScale(cWidth, basePageSize.width));
      }
    }
  };

  const handleWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setAutoFit(false);
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      setScale((s) => Math.min(3.0, Math.max(0.4, +(s + delta).toFixed(2))));
    }
  };

  const expectedPageWidth = Math.round((basePageSize?.width || 595) * scale);
  const totalContentWidth = expectedPageWidth > 0 ? expectedPageWidth + 32 : 0;
  const isOverflowingX = totalContentWidth > 0 && containerWidth > 0 && totalContentWidth > containerWidth;
  const rowMinWidth = isOverflowingX ? `${totalContentWidth}px` : "100%";

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
    <div className={`flex flex-col items-center gap-3 w-full h-full min-h-0 ${className}`}>
      {/* Controls */}
      <div className="flex items-center gap-2 bg-onicord-crust/90 backdrop-blur-md rounded-full px-4 py-2 border border-onicord-island shadow-lg select-none z-10 shrink-0">
        <button
          type="button"
          onClick={() => goToPage(Math.max(1, visiblePage - 1))}
          disabled={visiblePage <= 1}
          className="onicord-icon-btn w-8 h-8 rounded-full flex items-center justify-center text-sm disabled:opacity-30 cursor-pointer disabled:cursor-default"
          title={t("pdf.prevPage", "Página anterior")}
        >
          <MaterialIcon name="chevron_left" size="sm" />
        </button>
        <span className="text-xs font-semibold text-onicord-text min-w-[70px] text-center font-mono">
          {visiblePage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => goToPage(Math.min(totalPages, visiblePage + 1))}
          disabled={visiblePage >= totalPages}
          className="onicord-icon-btn w-8 h-8 rounded-full flex items-center justify-center text-sm disabled:opacity-30 cursor-pointer disabled:cursor-default"
          title={t("pdf.nextPage", "Página siguiente")}
        >
          <MaterialIcon name="chevron_right" size="sm" />
        </button>

        <div className="w-px h-5 bg-onicord-island mx-1" />

        <button
          type="button"
          onClick={handleZoomOut}
          disabled={scale <= 0.4}
          className="onicord-icon-btn w-8 h-8 rounded-full flex items-center justify-center text-sm disabled:opacity-30 cursor-pointer disabled:cursor-default"
          title={t("pdf.zoomOut", "Alejar")}
        >
          <MaterialIcon name="remove" size="sm" />
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          className="text-xs font-semibold text-onicord-text min-w-[50px] text-center font-mono hover:text-onicord-accent transition-colors cursor-pointer"
          title={t("pdf.resetZoom", "Tamaño original (100%)")}
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={handleZoomIn}
          disabled={scale >= 3.0}
          className="onicord-icon-btn w-8 h-8 rounded-full flex items-center justify-center text-sm disabled:opacity-30 cursor-pointer disabled:cursor-default"
          title={t("pdf.zoomIn", "Acercar")}
        >
          <MaterialIcon name="add" size="sm" />
        </button>

        <div className="w-px h-5 bg-onicord-island mx-1" />

        <button
          type="button"
          onClick={handleToggleFitWidth}
          className={`onicord-icon-btn w-8 h-8 rounded-full flex items-center justify-center text-sm cursor-pointer transition-all ${
            autoFit
              ? "bg-onicord-accent text-onicord-on-accent hover:bg-onicord-accent/90"
              : "hover:text-onicord-accent"
          }`}
          title={t("pdf.fitWidth", "Ajustar al ancho")}
        >
          <MaterialIcon name="fit_screen" size="sm" />
        </button>
      </div>

      {/* Scrollable virtualized pages container */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        className="w-full flex-1 min-h-[300px] overflow-auto rounded-2xl border border-onicord-tint/10 bg-neutral-900/90 shadow-2xl relative select-text"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: rowMinWidth,
            minWidth: "100%",
            position: "relative",
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const pageNum = virtualRow.index + 1;
            return (
              <div
                key={`${virtualRow.key}-${scale}`}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: rowMinWidth,
                  minWidth: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className="flex justify-center p-3"
              >
                <PdfPageItem
                  pdfDoc={pdfDoc}
                  pageNum={pageNum}
                  scale={scale}
                  expectedWidth={expectedPageWidth}
                  expectedHeight={estimatedPageHeight}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
