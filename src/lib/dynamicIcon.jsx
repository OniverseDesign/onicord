import React from "react";

// Exact SVG path data extracted from build/logo.svg
export const SQUIRCLE_PATH =
  "M467.9,581.3H113.4C50.8,581.3,0,530.6,0,467.9V113.4C0,50.8,50.8,0,113.4,0h354.6 c62.6,0,113.4,50.8,113.4,113.4v354.6C581.3,530.6,530.6,581.3,467.9,581.3z";

export const STAR_PATH =
  "M480.3,306.8C366,329.1,329.1,366,306.8,480.3c-3.4,17.6-28.8,17.6-32.2,0C252.2,366,215.3,329.1,101,306.8 c-17.6-3.4-17.6-28.8,0-32.2c114.3-22.3,151.2-59.2,173.6-173.6c3.4-17.6,28.8-17.6,32.2,0c22.3,114.3,59.2,151.2,173.6,173.6 C498,278,498,303.3,480.3,306.8z";

/**
 * Normalizes an RGB string or hex to valid SVG color representation (e.g. "rgb(r, g, b)")
 */
function normalizeColor(colorStr, fallback = "#cba6f7") {
  if (!colorStr) return fallback;
  const str = String(colorStr).trim();
  if (
    str.startsWith("#") ||
    str.startsWith("rgb(") ||
    str.startsWith("rgba(") ||
    str.startsWith("hsl(")
  ) {
    return str;
  }
  // Check if it's space-separated "R G B"
  const parts = str.split(/\s+/).map(Number);
  if (parts.length >= 3 && !parts.some(isNaN)) {
    return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
  }
  return fallback;
}

/**
 * Builds standard SVG string for Onicord logo with given colors.
 */
export function generateLogoSvg({ accentColor = "#CBA6F7", bgColor = "#313244" } = {}) {
  const normAccent = normalizeColor(accentColor, "#CBA6F7");
  const normBg = normalizeColor(bgColor, "#313244");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 581.3 581.3" width="100%" height="100%">
  <path fill="${normBg}" d="${SQUIRCLE_PATH}"/>
  <path fill="${normAccent}" d="${STAR_PATH}"/>
</svg>`;
}

/**
 * Renders an SVG markup string into a high-resolution PNG Data URL via offscreen canvas.
 */
export function renderSvgToPngDataUrl(svgString, size = 256) {
  return new Promise((resolve) => {
    try {
      if (typeof window === "undefined" || typeof document === "undefined") {
        return resolve(null);
      }

      const img = new Image();
      const svgDataUri =
        "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);

      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, size, size);
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          console.warn("[DynamicIcon] Error rendering to canvas:", err);
          resolve(null);
        }
      };

      img.onerror = (err) => {
        console.warn("[DynamicIcon] Error loading SVG in Image:", err);
        resolve(null);
      };

      img.src = svgDataUri;
    } catch (err) {
      console.warn("[DynamicIcon] Unexpected error rendering SVG:", err);
      resolve(null);
    }
  });
}

let updateTimer = null;
let lastAccentColor = null;
let lastBgColor = null;

/**
 * Updates favicon and dispatches IPC call to Electron to update taskbar & system tray icon.
 * Debounced to keep performance optimal during slider drags.
 */
export function updateDynamicAppIcon({ accentColor, bgColor, debounceMs = 90 }) {
  if (typeof window === "undefined") return;

  const normAccent = normalizeColor(accentColor, "#CBA6F7");
  const normBg = normalizeColor(bgColor, "#313244");

  if (normAccent === lastAccentColor && normBg === lastBgColor) {
    return;
  }

  if (updateTimer) {
    clearTimeout(updateTimer);
  }

  updateTimer = setTimeout(async () => {
    updateTimer = null;
    lastAccentColor = normAccent;
    lastBgColor = normBg;

    const svg = generateLogoSvg({ accentColor: normAccent, bgColor: normBg });
    const pngDataUrl = await renderSvgToPngDataUrl(svg, 256);

    if (!pngDataUrl) return;

    // 1. Update HTML document favicon
    try {
      let link = document.querySelector("link[rel*='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        link.type = "image/png";
        document.head.appendChild(link);
      }
      link.href = pngDataUrl;
    } catch (e) {
      console.warn("[DynamicIcon] Failed to update favicon link:", e);
    }

    // 2. Send to Electron main process if available
    try {
      if (
        window.electronAPI &&
        typeof window.electronAPI.updateAppIcon === "function"
      ) {
        window.electronAPI.updateAppIcon(pngDataUrl);
      }
    } catch (e) {
      console.warn("[DynamicIcon] Failed to send updateAppIcon IPC:", e);
    }

    // 3. Dispatch global custom event for local UI listeners
    try {
      window.dispatchEvent(
        new CustomEvent("onicord:icon-updated", {
          detail: { pngDataUrl, accentColor: normAccent, bgColor: normBg },
        }),
      );
    } catch (_) {}
  }, debounceMs);
}

/**
 * Declarative React component rendering the dynamic Onicord squircle logo.
 */
export function OnicordDynamicLogo({
  className = "w-6 h-6",
  accentColor = "var(--onicord-accent)",
  bgColor = "var(--onicord-bg-overlay)",
  style,
  ...props
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 581.3 581.3"
      className={className}
      style={style}
      {...props}
    >
      <path fill={bgColor} d={SQUIRCLE_PATH} />
      <path fill={accentColor} d={STAR_PATH} />
    </svg>
  );
}

export default OnicordDynamicLogo;
