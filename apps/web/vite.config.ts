import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The deployed origin, for absolute link-preview URLs in index.html. Set
// VITE_SITE_URL for production; Cloudflare Pages previews fall back to their own URL.
{
  const site = (process.env.VITE_SITE_URL || process.env.CF_PAGES_URL || '').replace(/\/+$/, '');
  // Accept a bare host ("battle.example.com"); link previews need an absolute URL.
  process.env.VITE_SITE_URL = site && !/^https?:\/\//.test(site) ? `https://${site}` : site;
}

/**
 * The site-wide headers from public/_headers (the `/*` block Cloudflare Pages
 * serves with every page), so `vite preview`, and with it every e2e run, gets
 * the deployed CSP: anything it would block fails the tests, not the live site.
 */
function siteHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  let inSite = false;
  const file = readFileSync(new URL('./public/_headers', import.meta.url), 'utf8');
  for (const line of file.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      inSite = line.trim() === '/*';
      continue;
    }
    const at = line.indexOf(':');
    if (inSite && at > 0) headers[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return headers;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  preview: { headers: siteHeaders() },
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
