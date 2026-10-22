import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The deployed origin, for absolute link-preview URLs in index.html. Set
// VITE_SITE_URL for production; Cloudflare Pages previews fall back to their own URL.
process.env.VITE_SITE_URL ??= process.env.CF_PAGES_URL ?? '';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The simulator chunk (~6 MB) only loads if a published schedule is missing.
    chunkSizeWarningLimit: 7000,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
