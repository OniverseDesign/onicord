/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Mapeo elástico real del tema Mocha V2 con soporte de opacidades nativas
        onicord: {
          base: "rgb(var(--onicord-bg-base) / <alpha-value>)",
          surface: "rgb(var(--onicord-bg-surface) / <alpha-value>)",
          mantle: "rgb(var(--onicord-bg-mantle) / <alpha-value>)",
          overlay: "rgb(var(--onicord-bg-overlay) / <alpha-value>)",

          // ── TEXTOS CLAROS STANDARD (Variables directas) ──
          text: "var(--onicord-text)",
          subtext: "var(--onicord-subtext)",
          muted: "var(--onicord-muted)",
          faded: "var(--onicord-faded)",

          // 🚀 TEXTOS OSCUROS DE ALTO CONTRASTE
          dark: "var(--onicord-text-dark)",
          "dark-sub": "var(--onicord-text-dark-sub)",
          "dark-muted": "var(--onicord-text-dark-muted)",

          // 🌗 TINTE, BORDES, INTERACCIONES Y TEXTO SOBRE ACENTOS ADAPTATIVOS
          tint: "rgb(var(--onicord-tint-rgb) / <alpha-value>)",
          "border-subtle": "var(--onicord-border-subtle)",
          border: "var(--onicord-border)",
          "border-strong": "var(--onicord-border-strong)",
          "border-island": "var(--onicord-border-island)",
          hover: "var(--hover)",
          active: "var(--active)",
          "message-hover": "var(--message-hover)",
          "on-accent": "var(--onicord-on-accent)",
          "on-danger": "var(--onicord-on-danger)",
          "on-warning": "var(--onicord-on-warning)",
          "on-info": "var(--onicord-on-info)",

          // ── SCRIMS PARA OVERLAYS SOBRE MEDIA ──
          "scrim-soft": "var(--onicord-scrim-soft)",
          scrim: "var(--onicord-scrim)",
          "scrim-heavy": "var(--onicord-scrim-heavy)",
          "on-scrim": "rgb(var(--onicord-on-scrim-rgb) / <alpha-value>)",
          "on-light": "rgb(var(--onicord-on-light-rgb) / <alpha-value>)",

          // ── ACENTOS NATIVOS CORE ENVOLVILLES EN ALFA ──
          accent: "rgb(var(--onicord-accent-rgb) / <alpha-value>)",
          danger: "rgb(var(--onicord-danger) / <alpha-value>)",
          success: "rgb(var(--onicord-success) / <alpha-value>)",
          warning: "rgb(var(--onicord-warning) / <alpha-value>)",
          info: "rgb(var(--onicord-info) / <alpha-value>)",
          sapphire: "rgb(var(--onicord-sapphire) / <alpha-value>)",

          // ── INDICADORES SATURADOS (VIVID) Y ESTADOS DE PRESENCIA ──
          "success-vivid": "rgb(var(--onicord-success-vivid) / <alpha-value>)",
          "warning-vivid": "rgb(var(--onicord-warning-vivid) / <alpha-value>)",
          "danger-vivid": "rgb(var(--onicord-danger-vivid) / <alpha-value>)",
          "info-vivid": "rgb(var(--onicord-info-vivid) / <alpha-value>)",
          "accent-vivid": "rgb(var(--onicord-accent-vivid) / <alpha-value>)",
          "offline-vivid": "rgb(var(--onicord-offline-vivid) / <alpha-value>)",
          "status-online": "rgb(var(--onicord-success-vivid) / <alpha-value>)",
          "status-idle": "rgb(var(--onicord-warning-vivid) / <alpha-value>)",
          "status-dnd": "rgb(var(--onicord-danger-vivid) / <alpha-value>)",
          "status-streaming": "rgb(var(--onicord-accent-vivid) / <alpha-value>)",
          "status-offline": "rgb(var(--onicord-offline-vivid) / <alpha-value>)",

          // ── ESCALA PASTEL MOCHA V2 COMPLETA ENVOLVIBLE ──
          rosewater: "rgb(var(--onicord-rosewater) / <alpha-value>)",
          flamingo: "rgb(var(--onicord-flamingo) / <alpha-value>)",
          pink: "rgb(var(--onicord-pink) / <alpha-value>)",
          mauve: "rgb(var(--onicord-mauve) / <alpha-value>)",
          red: "rgb(var(--onicord-red) / <alpha-value>)",
          maroon: "rgb(var(--onicord-maroon) / <alpha-value>)",
          peach: "rgb(var(--onicord-peach) / <alpha-value>)",
          yellow: "rgb(var(--onicord-yellow) / <alpha-value>)",
          teal: "rgb(var(--onicord-teal) / <alpha-value>)",
          sky: "rgb(var(--onicord-sky) / <alpha-value>)",
          blue: "rgb(var(--onicord-blue) / <alpha-value>)",
        },
      },
      fontSize: {
        // 📏 Escala tipográfica armonizada Onicord (9 niveles estándar)
        "2xs": ["var(--font-size-2xs, 10px)", { lineHeight: "var(--line-height-2xs, 14px)", letterSpacing: "0.04em" }],
        micro: ["var(--font-size-micro, 11px)", { lineHeight: "var(--line-height-micro, 15px)" }],
        xs: ["var(--font-size-xs, 12px)", { lineHeight: "var(--line-height-xs, 16px)" }],
        sm: ["var(--font-size-sm, 14px)", { lineHeight: "var(--line-height-sm, 20px)" }],
        base: ["var(--font-size-base, 15px)", { lineHeight: "var(--line-height-base, 22px)" }],
        lg: ["var(--font-size-lg, 18px)", { lineHeight: "var(--line-height-lg, 24px)", letterSpacing: "-0.015em" }],
        xl: ["var(--font-size-xl, 20px)", { lineHeight: "var(--line-height-xl, 26px)", letterSpacing: "-0.02em" }],
        "2xl": ["var(--font-size-2xl, 24px)", { lineHeight: "var(--line-height-2xl, 30px)", letterSpacing: "-0.025em" }],
        "3xl": ["var(--font-size-3xl, 30px)", { lineHeight: "var(--line-height-3xl, 36px)", letterSpacing: "-0.03em" }],
      },
      fontFamily: {
        sans: ["var(--font-sans)", "sans-serif"],
        mono: ["var(--font-sans)", "monospace"],
        code: ["var(--font-mono)", "monospace"],
      },
      borderRadius: {
        "onicord-outer": "var(--radius-outer)",
        "onicord-inner": "var(--radius-inner)",
        "onicord-button": "var(--radius-control)",
        "onicord-chip": "var(--radius-chip)",
      },
      boxShadow: {
        sm: "var(--onicord-shadow-sm)",
        DEFAULT: "var(--onicord-shadow-md)",
        md: "var(--onicord-shadow-md)",
        lg: "var(--onicord-shadow-lg)",
        "2xl": "var(--onicord-shadow-2xl)",
        inner: "var(--onicord-shadow-inner)",
        "onicord-header": "var(--onicord-shadow-header)",
        "onicord-elevated": "var(--onicord-shadow-elevated)",
        "onicord-glow-accent": "var(--onicord-glow-accent)",
        "onicord-glow-success": "var(--onicord-glow-success)",
        "onicord-glow-danger": "var(--onicord-glow-danger)",
        "onicord-glow-warning": "var(--onicord-glow-warning)",
      },
      backdropBlur: {
        "onicord-backdrop": "2px",
        "onicord-popover": "12px",
        "onicord-island": "24px",
      },
      zIndex: {
        content: "var(--z-content)",
        resizer: "var(--z-resizer)",
        sticky: "var(--z-sticky)",
        titlebar: "var(--z-titlebar)",
        popover: "var(--z-popover)",
        modal: "var(--z-modal)",
        "modal-card": "var(--z-modal-card)",
        "modal-nested": "var(--z-modal-nested)",
        "modal-nested-card": "var(--z-modal-nested-card)",
        "modal-controls": "var(--z-modal-controls)",
        tooltip: "var(--z-tooltip)",
        toast: "var(--z-toast)",
        "overlay-top": "var(--z-overlay-top)",
      },
      transitionDuration: {
        instant: "var(--duration-instant)",
        fast: "var(--duration-fast)",
        normal: "var(--duration-normal)",
        relaxed: "var(--duration-relaxed)",
        slow: "var(--duration-slow)",
      },
      transitionTimingFunction: {
        "onicord-spring": "var(--ease-spring)",
        "onicord-out": "var(--ease-out)",
        "onicord-in": "var(--ease-in)",
        "onicord-smooth": "var(--ease-in-out)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "reaction-pop": {
          "0%": { transform: "scale(0.65)", opacity: "0" },
          "70%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "scale-up": {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "modal-enter": {
          "0%": { opacity: "0", transform: "scale(0.96) translateY(8px)" },
          "100%": { opacity: "1", transform: "scale(1) translateY(0)" },
        },
        "modal-exit": {
          "0%": { opacity: "1", transform: "scale(1) translateY(0)" },
          "100%": { opacity: "0", transform: "scale(0.96) translateY(6px)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out forwards",
        marquee: "marquee 15s linear infinite",
        "reaction-pop": "reaction-pop 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards",
        "scale-up": "scale-up 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "modal-in": "modal-enter 180ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "modal-out": "modal-exit 140ms cubic-bezier(0.4, 0, 1, 1) forwards",
      },
    },
  },
  plugins: [
    require("@tailwindcss/container-queries"),
  ],
};
