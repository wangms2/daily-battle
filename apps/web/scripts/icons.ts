// Renders the app icons and the link-preview image from public/favicon.svg
// with Playwright's Chromium, so no image tools are needed. CHROMIUM_PATH points it
// at a browser other than Playwright's own.
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

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
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

// The link preview card: 1200×630, the Pokémon Daily logo on the home screens' clay.
const logoUri = `data:image/webp;base64,${readFileSync(pub('logo.webp')).toString('base64')}`;
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`
  <style>
    html, body { margin: 0; }
    body {
      width: 1200px; height: 630px; display: flex; align-items: center; justify-content: center;
      box-sizing: border-box; background: linear-gradient(165deg, #a3646a, #8a4f58);
    }
    img { width: 920px; filter: drop-shadow(0 6px 0 rgb(0 0 0 / 0.18)); }
  </style>
  <img src="${logoUri}">
`);
await page.screenshot({ path: pub('og.png') });
console.log('og.png');
await browser.close();
