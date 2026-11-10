import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc'; // 🚀 Cambiado: Compilador SWC (Rust engine) para HMR instantáneo
import svgr from 'vite-plugin-svgr';          // 🚀 Agregado: Soporte nativo para importar SVGs como componentes de React
import path from "path";

export default defineConfig({
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
          if (id.includes("node_modules")) {
            if (id.includes("pdfjs-dist")) return "vendor-pdf";
            if (id.includes("hls.js")) return "vendor-hls";
            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/scheduler/")
            ) {
              return "vendor-react";
            }
            if (id.includes("i18next") || id.includes("react-i18next")) {
              return "vendor-i18n";
            }
            if (id.includes("@tanstack/react-virtual")) {
              return "vendor-virtual";
            }
            if (id.includes("zustand")) {
              return "vendor-zustand";
            }
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },

});
