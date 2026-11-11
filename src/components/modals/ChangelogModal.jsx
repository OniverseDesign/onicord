import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { cn } from "../../lib/cn";
import { useAnimatedMount } from "../../hooks/useAnimatedMount";
import { IconClose } from "../icons/StreamIcons";
import MaterialIcon from "../icons/MaterialIcon";
import Heading from "../ui/Heading";
import Text from "../ui/Text";

function normalizeReleaseNotes(raw) {
  if (!raw) return "";
  let text = "";
  if (Array.isArray(raw)) {
    text = raw
      .map((entry) => {
        const ver = entry.version ? `## v${entry.version}\n` : "";
        const note = typeof entry === "string" ? entry : (entry.note || "");
        return ver + note;
      })
      .join("\n\n");
  } else if (typeof raw === "string") {
    text = raw;
  } else if (typeof raw === "object") {
    text = raw.note || raw.body || "";
  }

  // Strip or convert HTML tags if present (e.g. from electron-updater latest.yml)
  if (/<[a-z][\s\S]*>/i.test(text)) {
    text = text
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n")
      .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
      .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
      .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
      .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
      .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
      .replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`")
      .replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, "[$2]($1)")
      .replace(/<[^>]+>/g, "");
  }

  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function FormattedReleaseNotes({ content }) {
  if (!content) return null;

  const normalized = normalizeReleaseNotes(content);
  const lines = normalized.split("\n");

  return (
    <div className="space-y-1.5 text-xs text-onicord-subtext font-normal leading-relaxed select-text">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={idx} className="h-1.5" />;
        }

        // Headings without any dividers or horizontal lines
        if (trimmed.startsWith("### ")) {
          return (
            <h4 key={idx} className="font-bold text-sm text-onicord-accent mt-3 mb-1">
              {trimmed.replace(/^###\s+/, "")}
            </h4>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h3 key={idx} className="font-bold text-sm text-onicord-text mt-3.5 mb-1">
              {trimmed.replace(/^##\s+/, "")}
            </h3>
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h2 key={idx} className="font-extrabold text-base text-onicord-text mt-4 mb-1.5">
              {trimmed.replace(/^#\s+/, "")}
            </h2>
          );
        }

        // Bullet items
        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          const itemText = trimmed.replace(/^[-*]\s+/, "");
          return (
            <div key={idx} className="flex items-start gap-2 pl-1.5">
              <span className="text-onicord-accent font-bold mt-0.5 select-none">•</span>
              <span className="flex-1 text-onicord-subtext">
                {renderInlineMarkdown(itemText)}
              </span>
            </div>
          );
        }

        return (
          <p key={idx} className="text-onicord-subtext">
            {renderInlineMarkdown(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function renderInlineMarkdown(text) {
  const parts = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={match.index} className="font-bold text-onicord-text">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code key={match.index} className="px-1.5 py-0.5 rounded bg-white/10 text-onicord-accent font-mono text-xs">
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("[") && token.includes("](") && token.endsWith(")")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        parts.push(
          <a
            key={match.index}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-onicord-accent hover:underline inline-flex items-center gap-0.5"
          >
            <span>{linkMatch[1]}</span>
          </a>
        );
      }
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  return parts.length > 0 ? parts : text;
}

export default function ChangelogModal({
  isOpen,
  onClose,
  version,
  notes,
  loading = false,
  error = null,
  isNewVersion = false,
}) {
  const { t } = useTranslation();
  const { shouldRender, isAnimatingOut } = useAnimatedMount(isOpen, 140);
  const cardRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose?.();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!shouldRender) return null;

  const githubReleaseUrl = `https://github.com/OniverseDesign/onicord/releases/tag/v${version}`;

  return createPortal(
    <div
      className={cn("onicord-modal-backdrop !z-modal", isAnimatingOut && "onicord-animate-backdrop-out")}
      onClick={onClose}
    >
      <div
        ref={cardRef}
        className={cn(
          "onicord-modal-card-wide !max-w-2xl !p-6 w-full flex flex-col max-h-[85vh] relative",
          isAnimatingOut && "onicord-animate-modal-out"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Square centered close button */}
        <button
          type="button"
          onClick={onClose}
          className="onicord-icon-btn absolute right-5 top-5"
          aria-label={t("common.close", "Cerrar")}
        >
          <IconClose size="base" />
        </button>

        {/* Modal Header without lines or redundant badges */}
        <div className="pr-10 shrink-0">
          <Heading level={2} size="xl" className="leading-tight text-left">
            {t("changelog.title", "Novedades de la versión")} v{version}
          </Heading>
          <Text variant="sm" color="muted" className="mt-1 text-left">
            {isNewVersion
              ? t("changelog.newSubtitle", "Descubre las novedades y mejoras que incluye esta actualización.")
              : t("changelog.currentSubtitle", "Registro de cambios y mejoras introducidos en esta versión.")}
          </Text>
        </div>

        {/* Modal Body without dividing lines */}
        <div className="my-4 flex-1 overflow-y-auto minimal-scrollbar min-h-[160px] max-h-[58vh] pr-1">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 text-onicord-muted space-y-3">
              <MaterialIcon name="sync" size={28} className="animate-spin text-onicord-accent" />
              <p className="text-xs font-medium">
                {t("changelog.loading", "Cargando notas de lanzamiento...")}
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="p-4 rounded-onicord-inner bg-onicord-danger/10 text-onicord-danger text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <MaterialIcon name="error" size={16} />
                <span>No se pudieron cargar las notas de lanzamiento</span>
              </div>
              <p className="text-onicord-danger/80">{error}</p>
            </div>
          )}

          {!loading && !error && notes && (
            <FormattedReleaseNotes content={notes} />
          )}

          {!loading && !error && !notes && (
            <div className="text-center py-10 text-onicord-muted text-xs">
              <p>No se encontraron notas de lanzamiento para esta versión.</p>
            </div>
          )}
        </div>

        {/* Modal Footer without divider line */}
        <div className="pt-2 flex items-center justify-between shrink-0">
          <a
            href={githubReleaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-onicord-muted hover:text-onicord-accent transition flex items-center gap-1.5"
          >
            <MaterialIcon name="open_in_new" size={14} />
            <span>{t("changelog.viewOnGitHub", "Ver en GitHub")}</span>
          </a>

          <button
            type="button"
            onClick={onClose}
            className="onicord-btn-secondary"
          >
            {t("common.close", "Cerrar")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
