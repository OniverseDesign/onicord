import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import svgr from 'vite-plugin-svgr';
import path from 'path';

export default defineConfig({
  plugins: [react(), svgr()],
  base: './',
  root: '.',
  publicDir: false,
  define: {
    'import.meta.env.VITE_DEMO': JSON.stringify('true'),
  },
  build: {
    outDir: 'docs/demo',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'pdfjs-dist/web/pdf_viewer.css': path.resolve(__dirname, './src/demo/empty.css'),
      'pdfjs-dist/build/pdf.worker.mjs': path.resolve(__dirname, './src/demo/emptyStub.js'),
      'pdfjs-dist': path.resolve(__dirname, './src/demo/emptyStub.js'),
      'hls.js': path.resolve(__dirname, './src/demo/emptyStub.js'),
    },
  },
});
