import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Script del mundo de la página (world: MAIN): IIFE inactivo hasta que el content script lo activa.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: false,
    target: 'chrome114',
    copyPublicDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/pageHook.ts'),
      name: 'WhatsAppIntelligencePageHook',
      formats: ['iife'],
      fileName: () => 'page-hook.js',
    },
  },
});
