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
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        // 🚀 AGREGADO: Keyframes para la marquesina fluida
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out forwards",
        // 🚀 AGREGADO: Animación lineal e infinita (ajusta los 15s si quieres cambiar la velocidad)
        marquee: "marquee 15s linear infinite",
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
