import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { IconClose } from "../icons/StreamIcons";
import MaterialIcon from "../icons/MaterialIcon";
import { soundEngine } from "../../lib/soundEngine";
import { useInternalClose } from "../../hooks/useAnimatedMount";

function normalizeSearchText(text) {
  if (!text) return "";
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function ModalShell({
  title,
  subtitle,
  sections,
  activeSection,
  onSectionChange,
  onClose,
  children,
  footer,
  sidebarFooter,
  searchable = true,
  searchPlaceholder,
}) {
  const { t } = useTranslation();
  const effectivePlaceholder = searchPlaceholder || t("common.searchSettings", "Buscar ajustes...");
  const contentRef = useRef(null);
  const searchInputRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { isClosing, triggerClose } = useInternalClose(onClose, 140);

  useEffect(() => {
    soundEngine.playNav("open");
  }, []);

  const handleClose = useCallback(() => {
    soundEngine.playNav("close");
    triggerClose();
  }, [triggerClose]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeSection]);

  const normalizedQuery = useMemo(() => normalizeSearchText(searchQuery), [searchQuery]);

  const filteredSections = useMemo(() => {
    if (!Array.isArray(sections)) return [];
    if (!normalizedQuery) return sections;

    return sections
      .map((section) => {
        const sectionLabelNorm = normalizeSearchText(section.label);
        const sectionDirectMatch =
          sectionLabelNorm.includes(normalizedQuery) ||
          (Array.isArray(section.keywords) &&
            section.keywords.some((kw) =>
              normalizeSearchText(kw).includes(normalizedQuery)
            ));

        const matchedFeatures = (section.features || []).filter((feat) => {
          if (normalizeSearchText(feat.label).includes(normalizedQuery)) return true;
          if (
            Array.isArray(feat.keywords) &&
            feat.keywords.some((kw) => normalizeSearchText(kw).includes(normalizedQuery))
          ) {
            return true;
          }
          return false;
        });

        if (sectionDirectMatch || matchedFeatures.length > 0) {
          return {
            ...section,
            matchedFeatures,
            sectionDirectMatch,
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [sections, normalizedQuery]);

  const handleSelectFeature = useCallback(
    (sectionId, featureId) => {
      soundEngine.playNav("select");
      if (activeSection !== sectionId) {
        onSectionChange?.(sectionId);
      }
      setTimeout(() => {
        if (!contentRef.current) return;
        const target = contentRef.current.querySelector(
          `[data-setting-id="${featureId}"], #setting-${featureId}, #${featureId}`
        );
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          target.classList.remove("onicord-highlight-target");
          void target.offsetWidth;
          target.classList.add("onicord-highlight-target");
          setTimeout(() => {
            target.classList.remove("onicord-highlight-target");
          }, 1800);
        }
      }, 140);
    },
    [activeSection, onSectionChange]
  );

  const handleSearchKeyDown = (e) => {
    if (e.key === "Escape") {
      if (searchQuery) {
        e.stopPropagation();
        setSearchQuery("");
      }
    } else if (e.key === "Enter") {
      if (filteredSections.length > 0) {
        e.preventDefault();
        const first = filteredSections[0];
        if (first.matchedFeatures && first.matchedFeatures.length > 0) {
          handleSelectFeature(first.id, first.matchedFeatures[0].id);
        } else {
          soundEngine.playNav("select");
          onSectionChange?.(first.id);
        }
      }
    }
  };

  return createPortal(
    <div
      className={cn(
        "onicord-modal-backdrop p-3 md:p-5",
        isClosing && "onicord-animate-backdrop-out"
      )}
      onClick={handleClose}
      role="presentation"
    >
      <div
        className={cn(
          "onicord-modal-card-settings",
          isClosing && "onicord-animate-modal-out"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar navigation */}
        {Array.isArray(sections) && sections.length > 0 && (
          <aside className="flex w-[260px] shrink-0 flex-col bg-onicord-mantle py-4 px-2 m-3 rounded-2xl border border-onicord-island">
            <div className="mb-2 px-3">
              <h2 className="text-xl font-bold tracking-wide text-onicord-accent">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1 truncate text-xs text-onicord-text">
                  {subtitle}
                </p>
              )}
            </div>

            {/* Settings search input */}
            {searchable && (
              <div className="px-1.5 mb-2.5">
                <div className="relative flex items-center">
                  <MaterialIcon
                    name="search"
                    size="sm"
                    className="absolute left-3 text-onicord-muted/60 pointer-events-none z-10"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder={effectivePlaceholder}
                    className="onicord-input h-10 pl-9 pr-8 text-xs placeholder:text-onicord-muted/50"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        searchInputRef.current?.focus();
                      }}
                      className="absolute right-2.5 text-onicord-muted hover:text-onicord-text p-1 rounded-full transition-colors cursor-pointer"
                      title={t("common.clearSearch", "Limpiar búsqueda (Esc)")}
                    >
                      <MaterialIcon name="close" size="xs" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <nav className="mt-1 flex-1 space-y-1 overflow-y-auto px-1.5 minimal-scrollbar">
              {filteredSections.length === 0 ? (
                <div className="py-8 px-2 text-center text-xs text-onicord-muted">
                  <MaterialIcon
                    name="search_off"
                    size="md"
                    className="mx-auto mb-1.5 opacity-40 text-onicord-text"
                  />
                  <p>{t("common.noResultsFor", "No se encontraron resultados para")}</p>
                  <p className="font-semibold text-onicord-text truncate max-w-[190px] mx-auto mt-0.5">
                    "{searchQuery}"
                  </p>
                </div>
              ) : (
                filteredSections.map((section) => {
                  const isActive = activeSection === section.id;
                  const hasMatchedFeatures =
                    Array.isArray(section.matchedFeatures) && section.matchedFeatures.length > 0;

                  return (
                    <div key={section.id} className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.playNav("select");
                          onSectionChange?.(section.id);
                        }}
                        className={cn(
                          "onicord-modal-nav-item flex items-center gap-2.5",
                          isActive && "onicord-modal-nav-item-active"
                        )}
                      >
                        {section.icon && (
                          <MaterialIcon
                            name={section.icon}
                            size="sm"
                            className="shrink-0 opacity-70"
                          />
                        )}
                        <span className="truncate">{section.label}</span>
                      </button>

                      {/* Nested sub-features matching search query */}
                      {hasMatchedFeatures && (
                        <div className="ml-5 pl-2 border-l border-onicord-accent/30 space-y-0.5 py-0.5">
                          {section.matchedFeatures.map((feat) => (
                            <button
                              key={feat.id}
                              type="button"
                              onClick={() => handleSelectFeature(section.id, feat.id)}
                              className="onicord-modal-subnav-item"
                              title={feat.label}
                            >
                              <MaterialIcon
                                name="subdirectory_arrow_right"
                                size="xs"
                                className="shrink-0 text-onicord-accent/70"
                              />
                              <span className="truncate">{feat.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </nav>
            {sidebarFooter && (
              <div className="mt-auto pt-2 px-2 shrink-0">
                {sidebarFooter}
              </div>
            )}
          </aside>
        )}

        {/* Main content area */}
        <div className="flex min-w-0 flex-1 flex-col bg-onicord-surface rounded-2xl border border-onicord-island m-3 overflow-hidden">
          <header className="onicord-modal-content-header">
            <h3 className="text-xl font-semibold text-onicord-text">
              {Array.isArray(sections) && sections.length > 0
                ? sections.find((s) => s.id === activeSection)?.label
                : title}
            </h3>
            <button
              type="button"
              onClick={handleClose}
              className="onicord-icon-btn"
              aria-label="Close"
            >
              <IconClose size="base" />
            </button>
          </header>

          <div ref={contentRef} className="onicord-modal-content-body minimal-scrollbar">{children}</div>

          {footer && (
            <footer className="onicord-modal-footer">
              {footer}
            </footer>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function ModalField({ label, hint, children }) {
  return (
    <div className="">
      <label className="onicord-field-label">
        {label}
      </label>
      {children}
      {hint && (
        <p className="mt-3 text-xs text-onicord-faded leading-normal">
          {hint}
        </p>
      )}
    </div>
  );
}

export const ModalInput = React.forwardRef(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn("onicord-input", className)}
        {...props}
      />
    );
  },
);

ModalInput.displayName = "ModalInput";

export function ModalButton({
  variant = "primary",
  children,
  className = "",
  ...props
}) {
  const variantStyles =
    variant === "primary"
      ? "onicord-btn-primary"
      : variant === "danger"
        ? "onicord-btn-destructive"
        : "onicord-btn-secondary";

  return (
    <button
      type="button"
      className={cn(variantStyles, className)}
      {...props}
    >
      {children}
    </button>
  );
}
