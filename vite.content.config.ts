import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Content script: un único archivo IIFE sin imports, como exige Chrome.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: false,
    target: 'chrome114',
    copyPublicDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/index.ts'),
      name: 'WhatsAppIntelligenceContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});
