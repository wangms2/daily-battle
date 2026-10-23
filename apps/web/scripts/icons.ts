// Renders the app icons and the link-preview image from public/favicon.svg
// with Playwright's Chromium, so no image tools are needed.
//   pnpm --filter web icons
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const pub = (p: string) => fileURLToPath(new URL(`../public/${p}`, import.meta.url));
const svg = readFileSync(pub('favicon.svg'), 'utf8');
const uri = (s: string) => `data:image/svg+xml;base64,${Buffer.from(s).toString('base64')}`;
const svgUri = uri(svg);
// iOS rounds home-screen icons itself and fills transparency with black: square it off.
const squareUri = uri(svg.replace('rx="14"', 'rx="0"'));
const plex = fileURLToPath(
  new URL(
    '../node_modules/@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2',
    import.meta.url,
  ),
);
const plexUri = `data:font/woff2;base64,${readFileSync(plex).toString('base64')}`;

const browser = await chromium.launch();
const page = await browser.newPage();

for (const [file, size] of [
  ['icons/icon-192.png', 192],
  ['icons/icon-512.png', 512],
  ['icons/apple-touch-icon.png', 180],
] as const) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0}</style><img src="${file.includes('apple') ? squareUri : svgUri}" width="${size}" height="${size}">`,
  );
  await page.screenshot({ path: pub(file), omitBackground: true });
  console.log('icon', file);
}

// The link preview card: 1200×630, the mark and the name on the steel-blue gradient.
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`
  <style>
    @font-face { font-family: Plex; src: url(${plexUri}) format('woff2'); font-weight: 700; }
    html, body { margin: 0; }
    body {
      width: 1200px; height: 630px; display: flex; align-items: center; gap: 56px; padding: 0 96px;
      box-sizing: border-box; background: linear-gradient(160deg, #4a6c99, #26405f); color: #fff;
      font-family: Plex, sans-serif;
    }
    h1 { font-size: 104px; line-height: 1; margin: 0; letter-spacing: -1px; }
    p { font-size: 40px; margin: 22px 0 0; color: #d2ae63; font-weight: 700; }
  </style>
  <img src="${svgUri}" width="260" height="260">
  <div><h1>Daily Battle</h1><p>A new Gen 4 or Gen 5 OU opponent every day</p></div>
`);
await page.screenshot({ path: pub('og.png') });
console.log('og.png');
await browser.close();
