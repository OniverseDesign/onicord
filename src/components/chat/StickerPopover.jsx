import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import MaterialIcon from "../icons/MaterialIcon";
import ConfirmDialogModal from "../modals/ConfirmDialogModal";
import { getMediaUrl } from "../../lib/media";
import { soundEngine } from "../../lib/soundEngine";

const STORAGE_USO_KEY = "onicord_stickers_uso";
const PACKS_KEY = "onicord_stickers_packs";

const calculateStickerCoords = (targetRect) => {
  if (!targetRect) return { top: 0, left: 0 };

  const popoverWidth = 320;
  const popoverHeight = 384;
  const windowWidth = window.innerWidth;

  let left = targetRect.right - popoverWidth + 8;
  let top = targetRect.top - popoverHeight - 12;

  if (top < 10) {
    top = targetRect.bottom + 8;
  }

  if (left < 10) left = 10;
  if (left + popoverWidth > windowWidth - 10) {
    left = windowWidth - popoverWidth - 10;
  }

  return { top, left };
};

export default function StickerPopover({
  targetRect,
  onSelectSticker,
  onClose,
  onSharePackDirect,
}) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [topStickers, setTopStickers] = useState([]);
  const [groupedPacks, setGroupedPacks] = useState([]);
  const [looseStickers, setLooseStickers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("top");
  const [coords, setCoords] = useState(() => calculateStickerCoords(targetRect));
  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: "",
    msg: "",
  });

  const popoverRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const sectionRefs = useRef({});
  const isClickScrolling = useRef(false);
  const scrollTimeoutRef = useRef(null);
  const hasUserInteractedTab = useRef(false);

  // Play open sound on mount
  useEffect(() => {
    soundEngine.playNav("open");
  }, []);

  // Position calculation matching EmojiPickerPopover
  useLayoutEffect(() => {
    if (!targetRect) return;
    setCoords(calculateStickerCoords(targetRect));
  }, [targetRect]);

  const procesarColeccion = () => {
    if (!window.electronAPI?.listLocalStickers) {
      setLoading(false);
      return;
    }

    window.electronAPI.listLocalStickers().then((list) => {
      const listaBase = list || [];

      try {
        const historialUso = JSON.parse(
          localStorage.getItem(STORAGE_USO_KEY) || "{}"
        );
        const savedPacks = JSON.parse(localStorage.getItem(PACKS_KEY) || "{}");

        const clasificadosPorUso = [...listaBase]
          .sort((a, b) => (historialUso[b.id] || 0) - (historialUso[a.id] || 0))
          .filter((stk) => (historialUso[stk.id] || 0) > 0)
          .slice(0, 16);

        setTopStickers(clasificadosPorUso);

        const idsAsignados = new Set();

        const estructuraPacks = Object.keys(savedPacks)
          .map((titulo) => {
            const idsDeEstePack = savedPacks[titulo] || [];
            idsDeEstePack.forEach((id) => idsAsignados.add(id));

            const itemsStickers = idsDeEstePack
              .map((id) => listaBase.find((s) => s.id === id))
              .filter(Boolean);

            return {
              title: titulo,
              stickers: itemsStickers,
            };
          })
          .filter((p) => p.stickers.length > 0);

        setGroupedPacks(estructuraPacks);

        const sueltos = listaBase.filter((stk) => !idsAsignados.has(stk.id));
        setLooseStickers(sueltos);

        // Set default active tab only if user has not clicked a tab manually
        if (!hasUserInteractedTab.current) {
          if (clasificadosPorUso.length > 0) {
            setActiveTab("top");
          } else if (estructuraPacks.length > 0) {
            setActiveTab("pack-0");
          } else if (sueltos.length > 0) {
            setActiveTab("loose");
          }
        }
      } catch (e) {
        console.error("Error estructurando catálogo de stickers:", e);
      }

      setLoading(false);
    });
  };

  useEffect(() => {
    procesarColeccion();

    const handleClickOutside = (e) => {
      if (e.target.closest(".onicord-chat-toolbar-btn")) return;
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [onClose]);

  const handleStickerClick = (stk) => {
    try {
      const historialUso = JSON.parse(
        localStorage.getItem(STORAGE_USO_KEY) || "{}"
      );
      historialUso[stk.id] = (historialUso[stk.id] || 0) + 1;
      localStorage.setItem(STORAGE_USO_KEY, JSON.stringify(historialUso));
    } catch (e) {}

    onSelectSticker(stk);
    onClose();
  };

  const handleSharePackClick = async (e, pack) => {
    e.preventDefault();
    e.stopPropagation();

    const stickersMetaList = pack.stickers.map((s) => ({
      id: s.id,
      name: s.id,
      ext: s.ext,
    }));

    try {
      const result = await window.electronAPI.exportStickerPack({
        packName: pack.title,
        stickersList: stickersMetaList,
      });

      if (result && onSharePackDirect) {
        onSharePackDirect({
          id: `opk-${crypto.randomUUID().slice(0, 8)}`,
          name: result.fileName,
          packRawString: result.packRawString,
        });
        onClose();
      }
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: "Error",
        msg: "Error empacando grupo de stickers.",
      });
    }
  };

  // Section Scroll Spy matching EmojiPickerPopover
  const handleContainerScroll = () => {
    if (isClickScrolling.current) return;
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollTop = container.scrollTop;

    const tabsToCheck = [];
    if (topStickers.length > 0) tabsToCheck.push({ id: "top" });
    groupedPacks.forEach((_, idx) => tabsToCheck.push({ id: `pack-${idx}` }));
    if (looseStickers.length > 0) tabsToCheck.push({ id: "loose" });

    // Check if at bottom
    const isAtBottom =
      container.scrollHeight - scrollTop <= container.clientHeight + 12;
    if (isAtBottom && tabsToCheck.length > 0) {
      const lastTab = tabsToCheck[tabsToCheck.length - 1].id;
      if (lastTab !== activeTab) {
        setActiveTab(lastTab);
      }
      return;
    }

    let currentActive = tabsToCheck[0]?.id || "top";
    for (let i = 0; i < tabsToCheck.length; i++) {
      const tab = tabsToCheck[i];
      const el = sectionRefs.current[tab.id];
      if (el) {
        const relativeTop = el.offsetTop - container.offsetTop;
        if (scrollTop >= relativeTop - 20) {
          currentActive = tab.id;
        }
      }
    }

    if (currentActive !== activeTab) {
      setActiveTab(currentActive);
    }
  };

  const handleTabClick = (tabId) => {
    soundEngine.playNav("select");
    hasUserInteractedTab.current = true;
    setActiveTab(tabId);
    const container = scrollContainerRef.current;
    const el = sectionRefs.current[tabId];
    if (container && el) {
      isClickScrolling.current = true;
      const targetScrollTop = el.offsetTop - container.offsetTop;
      container.scrollTo({ top: targetScrollTop, behavior: "smooth" });

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isClickScrolling.current = false;
      }, 1000);
    }
  };

  // Filtered search results
  const getFilteredSearchResults = () => {
    if (!searchTerm.trim()) return [];
    const query = searchTerm.toLowerCase().trim();

    const allStickersMap = new Map();
    const addSticker = (s) => {
      if (s && s.id && !allStickersMap.has(s.id)) {
        allStickersMap.set(s.id, s);
      }
    };

    topStickers.forEach(addSticker);
    looseStickers.forEach(addSticker);
    groupedPacks.forEach((p) => p.stickers.forEach(addSticker));

    return Array.from(allStickersMap.values()).filter((stk) => {
      const matchId = stk.id?.toLowerCase().includes(query);
      const matchPath = stk.localPath?.toLowerCase().includes(query);
      return matchId || matchPath;
    });
  };

  const filteredResults = getFilteredSearchResults();

  const renderStickerGrid = (stickersList, keyPrefix) => (
    <div className="grid grid-cols-4 gap-1.5 pt-1">
      {stickersList.map((stk) => (
        <button
          key={`${keyPrefix}-${stk.id}`}
          type="button"
          onClick={() => handleStickerClick(stk)}
          className="w-full aspect-square flex items-center justify-center p-1.5 hover:bg-white/10 rounded-xl transition-transform duration-100 active:scale-125 hover:scale-105 cursor-pointer"
          title={stk.id}
        >
          <img
            src={getMediaUrl(stk.localPath)}
            alt=""
            loading="lazy"
            className="max-w-full max-h-full object-contain pointer-events-none"
          />
        </button>
      ))}
    </div>
  );

  if (!targetRect) return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        top: `${coords.top}px`,
        left: `${coords.left}px`,
      }}
      className="onicord-floating-menu w-80 h-96 flex flex-col !p-0 overflow-hidden z-[99999]"
    >
      {/* Search Header */}
      <div className="p-2.5 border-b border-white/10 bg-onicord-mantle/50 flex items-center gap-2">
        <MaterialIcon name="search" size="lg" className="text-onicord-muted pl-1" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t("chat.searchStickersPlaceholder", "Buscar stickers...")}
          className="w-full bg-transparent text-xs text-white placeholder-onicord-muted outline-none"
          autoFocus
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="text-onicord-muted hover:text-white text-xs pr-1 cursor-pointer"
          >
            ✕
          </button>
        )}
      </div>

      {/* Tabs Navigation (only when not searching) */}
      {!searchTerm && (
        <div className="flex items-center justify-start gap-3 px-2 py-1.5 border-b border-white/5 bg-white/[0.02] shrink-0 overflow-x-auto minimal-scrollbar">
          {topStickers.length > 0 && (
            <button
              type="button"
              onClick={() => handleTabClick("top")}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150 shrink-0 cursor-pointer ${
                activeTab === "top"
                  ? "bg-onicord-accent text-white scale-110 font-bold"
                  : "hover:bg-onicord-accent/50 text-onicord-text hover:text-white/80"
              }`}
              title={t("chat.emojis.recent", "Frecuentes")}
            >
              <MaterialIcon name="schedule" size={16} />
            </button>
          )}

          {groupedPacks.map((pack, idx) => {
            const firstStk = pack.stickers?.[0];
            return (
              <button
                key={`tab-pack-${idx}`}
                type="button"
                onClick={() => handleTabClick(`pack-${idx}`)}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150 shrink-0 cursor-pointer overflow-hidden ${
                  activeTab === `pack-${idx}`
                    ? "bg-onicord-accent text-white scale-110 font-bold border-2 border-onicord-accent"
                    : "hover:bg-onicord-accent/50 text-onicord-text hover:text-white/80 hover:border-2 border-onicord-accent/50"
                }`}
                title={pack.title}
              >
                {pack.iconName ? (
                  <MaterialIcon name={pack.iconName} size={16} />
                ) : firstStk?.localPath ? (
                  <img
                    src={getMediaUrl(firstStk.localPath)}
                    alt=""
                    className="w-7 h-7 object-contain rounded-md"
                  />
                ) : (
                  <MaterialIcon name="collections" size={16} />
                )}
              </button>
            );
          })}

          {looseStickers.length > 0 && (
            <button
              type="button"
              onClick={() => handleTabClick("loose")}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-150 shrink-0 cursor-pointer ${
                activeTab === "loose"
                  ? "bg-onicord-accent text-white scale-110 font-bold"
                  : "hover:bg-onicord-accent/50 text-onicord-text hover:text-white/80"
              }`}
              title={t("stickers.looseStickers", "Stickers Sueltos")}
            >
              <MaterialIcon name="grid_view" size={16} />
            </button>
          )}
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="font-mono text-[11px] text-onicord-muted animate-pulse">
            Cargando stickers...
          </p>
        </div>
      ) : searchTerm ? (
        // Search Results Mode
        <div className="flex-1 overflow-y-auto p-2.5 custom-scrollbar">
          <h4 className="text-[10px] font-bold text-onicord-muted uppercase tracking-wider pl-1 mb-1.5">
            {t("chat.searchEmojisPlaceholder", "Resultados de búsqueda")}
          </h4>
          {renderStickerGrid(filteredResults, "search")}
          {filteredResults.length === 0 && (
            <div className="py-8 text-center text-xs text-onicord-faded italic">
              {t("chat.noSearchResults", "No se encontraron resultados")}
            </div>
          )}
        </div>
      ) : (
        // Unified Scrollable Sticker Categories List
        <div
          ref={scrollContainerRef}
          onScroll={handleContainerScroll}
          className="flex-1 overflow-y-auto p-2.5 space-y-4 custom-scrollbar pb-24"
        >
          {/* Frecuentes */}
          {topStickers.length > 0 && (
            <div
              key="top"
              ref={(el) => (sectionRefs.current["top"] = el)}
              className="space-y-1.5"
            >
              <h4 className="text-[10px] font-bold text-onicord-muted uppercase tracking-wider pl-1 border-b border-white/5 pb-1">
                Frecuentes
              </h4>
              {renderStickerGrid(topStickers, "top")}
            </div>
          )}

          {/* Grouped Packs */}
          {groupedPacks.map((pack, idx) => (
            <div
              key={`pack-${idx}`}
              ref={(el) => (sectionRefs.current[`pack-${idx}`] = el)}
              className="space-y-1.5 animate-fade-in"
            >
              <h4 className="text-[10px] font-bold text-onicord-muted uppercase tracking-wider pl-1 border-b border-white/5 pb-1 flex items-center justify-between gap-2">
                <span className="truncate">{pack.title}</span>
                <button
                  type="button"
                  onClick={(e) => handleSharePackClick(e, pack)}
                  className="onicord-chip-accent text-[9px] px-2 py-0.5"
                  title={`Compartir grupo "${pack.title}" en la sala`}
                >
                  Compartir
                </button>
              </h4>
              {renderStickerGrid(pack.stickers, `pack-${idx}`)}
            </div>
          ))}

          {/* Loose stickers section */}
          {looseStickers.length > 0 && (
            <div
              key="loose"
              ref={(el) => (sectionRefs.current["loose"] = el)}
              className="space-y-1.5 animate-fade-in"
            >
              <h4 className="text-[10px] font-bold text-onicord-muted uppercase tracking-wider pl-1 border-b border-white/5 pb-1">
                Stickers Sueltos ({looseStickers.length})
              </h4>
              {renderStickerGrid(looseStickers, "loose")}
            </div>
          )}

          {/* Empty State */}
          {topStickers.length === 0 &&
            groupedPacks.length === 0 &&
            looseStickers.length === 0 && (
              <p className="text-center text-xs text-onicord-faded my-auto px-4 font-medium leading-relaxed py-12">
                No tienes stickers activos. Organiza tus carpetas desde{" "}
                <span className="text-onicord-accent font-bold">
                  Ajustes → Stickers
                </span>
                .
              </p>
            )}
        </div>
      )}

      <ConfirmDialogModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.msg}
        confirmLabel="Entendido"
        type="alert"
        onConfirm={() => setAlertModal({ isOpen: false, title: "", msg: "" })}
      />
    </div>,
    document.body
  );
}


