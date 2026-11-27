import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc'; // 🚀 Cambiado: Compilador SWC (Rust engine) para HMR instantáneo
import svgr from 'vite-plugin-svgr';          // 🚀 Agregado: Soporte nativo para importar SVGs como componentes de React
import path from "path";

export default defineConfig(({ command }) => ({
  plugins: [react(), svgr()],
  base: "./",
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          if (normalizedId.includes("node_modules")) {
            if (normalizedId.includes("pdfjs-dist")) return "vendor-pdf";
            if (normalizedId.includes("hls.js")) return "vendor-hls";
            if (
              normalizedId.includes("/react/") ||
              normalizedId.includes("/react-dom/") ||
              normalizedId.includes("/scheduler/")
            ) {
              return "vendor-react";
            }
            if (normalizedId.includes("i18next") || normalizedId.includes("react-i18next")) {
              return "vendor-i18n";
            }
            if (normalizedId.includes("@tanstack/react-virtual")) {
              return "vendor-virtual";
            }
            if (normalizedId.includes("zustand")) {
              return "vendor-zustand";
            }
            if (normalizedId.includes("uisfx")) {
              return "vendor-uisfx";
            }
          }
          if (normalizedId.endsWith("/src/i18n/locales/es.json")) {
            return "es";
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      ...(command === "build"
        ? { "@/demo/autoInit": path.resolve(__dirname, "./src/demo/noop.js") }
        : {}),
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/dev-user-*/**",
        "**/logs/**",
        "**/dist/**",
        "**/release/**",
        "**/electron/**",
        "**/addons/**",
        "**/*.tmp",
        "**/*.db*",
      ],
    },
  },

}));
