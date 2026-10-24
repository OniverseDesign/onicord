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
