// What the deployed site depends on: the production CSP from public/_headers
// (applied here to every response, as Cloudflare Pages would), plus the icons,
// manifest, and link-preview tags.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import schedule from '../public/schedule/2026-10-19.json' with { type: 'json' };

const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const CSP = /Content-Security-Policy: (.+)/.exec(headers)![1]!.trim();

test.skip(({ isMobile }) => isMobile, 'one desktop run covers it');

test('the game runs under the production CSP', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) violations.push(m.text());
  });
  page.on('pageerror', (e) => violations.push(String(e)));
  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': CSP },
    });
  });
  await page.addInitScript((team) => {
    localStorage.setItem(
      'daily-battle:state',
      JSON.stringify({
        version: 3,
        weeks: { '2026-10-19': { team, poolId: '2026-10-19:c0' } },
        days: {},
        settings: {
          beginnerHints: true,
          battleSpeed: 'instant',
          animations: true,
          shownExplainers: ['welcome'],
        },
      }),
    );
  }, schedule.suggestedTeams[0]!.team);
  await page.clock.setFixedTime(new Date('2026-10-21T10:00:00-04:00'));
  await page.goto('/');
  await page.getByRole('button', { name: /^Start · / }).click();
  // The simulator runs in a worker: a first move proves it loaded under the CSP.
  await page.locator('main button[aria-label*=" PP"]:enabled').first().click({ timeout: 20_000 });
  await expect(page.getByRole('log', { name: 'Battle log' })).toContainText(/used|sent out/);
  expect(violations).toEqual([]);
});

test('ships icons, a manifest, and link-preview tags', async ({ page, request }) => {
  await page.goto('/');
  for (const sel of [
    'link[rel="icon"][href="/favicon.svg"]',
    'link[rel="apple-touch-icon"]',
    'link[rel="manifest"]',
    'meta[property="og:image"]',
    'meta[name="twitter:card"]',
  ]) {
    await expect(page.locator(sel)).toHaveCount(1);
  }
  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(og).toMatch(/\/og\.png$/);
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  for (const path of ['/favicon.svg', '/icons/apple-touch-icon.png', '/og.png']) {
    expect((await request.get(path)).ok(), path).toBe(true);
  }
});
