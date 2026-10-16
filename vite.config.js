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
