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

          // ── ACENTOS NATIVOS CORE ENVOLVILLES EN ALFA ──
          accent: "rgb(var(--onicord-lavender) / <alpha-value>)",
          danger: "rgb(var(--onicord-danger) / <alpha-value>)",
          success: "rgb(var(--onicord-success) / <alpha-value>)",
          sapphire: "rgb(var(--onicord-sapphire) / <alpha-value>)",

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
        // 📏 Escala tipográfica armonizada Onicord (8 niveles estándar)
        "2xs": ["var(--font-size-2xs, 10px)", { lineHeight: "var(--line-height-2xs, 14px)", letterSpacing: "0.04em" }],
        xs: ["var(--font-size-xs, 12px)", { lineHeight: "var(--line-height-xs, 16px)" }],
        sm: ["var(--font-size-sm, 14px)", { lineHeight: "var(--line-height-sm, 20px)" }],
        base: ["var(--font-size-base, 15px)", { lineHeight: "var(--line-height-base, 22px)" }],
        lg: ["var(--font-size-lg, 18px)", { lineHeight: "var(--line-height-lg, 24px)", letterSpacing: "-0.015em" }],
        xl: ["var(--font-size-xl, 20px)", { lineHeight: "var(--line-height-xl, 26px)", letterSpacing: "-0.02em" }],
        "2xl": ["var(--font-size-2xl, 24px)", { lineHeight: "var(--line-height-2xl, 30px)", letterSpacing: "-0.025em" }],
        "3xl": ["var(--font-size-3xl, 30px)", { lineHeight: "var(--line-height-3xl, 36px)", letterSpacing: "-0.03em" }],

        // 🏷️ Alias semánticos
        badge: ["var(--font-size-2xs, 10px)", { lineHeight: "var(--line-height-2xs, 14px)", letterSpacing: "0.04em" }],
        caption: ["var(--font-size-xs, 12px)", { lineHeight: "var(--line-height-xs, 16px)" }],
        body: ["var(--font-size-base, 15px)", { lineHeight: "var(--line-height-base, 22px)" }],
      },
      fontFamily: {
        sans: ["var(--font)", "sans-serif"],
        mono: ["var(--font)", "monospace"],
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
      },
      zIndex: {
        content: "10",
        resizer: "20",
        sticky: "30",
        titlebar: "40",
        popover: "50",
        modal: "60",
        "modal-card": "61",
        "modal-nested": "70",
        "modal-nested-card": "71",
        "modal-controls": "75",
        tooltip: "80",
        toast: "90",
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
    require("tailwindcss-animate"), // Registramos tu plugin de animaciones por hardware
    require("daisyui"), // Registramos daisyUI con su escudo
  ],

  // 🛡️ NUESTRO ESCUDO PROTECTOR AUTOMÁTICO PARA DAISYUI
  daisyui: {
    themes: true,
    styled: false,
    utils: true,
    prefix: "daisy-",
  },
};
