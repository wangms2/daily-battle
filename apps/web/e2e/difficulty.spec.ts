// The Hard AI in the browser: the battle worker fetches and compiles poke-engine's
// WebAssembly under the production CSP ('wasm-unsafe-eval'), the battle says
// it's Hard, and a reload resumes it from the saved AI choices.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import schedule from '../public/schedule/gen3ou/2026-10-19.json' with { type: 'json' };

const headers = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const CSP = /Content-Security-Policy: (.+)/.exec(headers)![1]!.trim();
const MOVES = 'main button[aria-label*=" PP"]:enabled';
const TEAM = schedule.suggestedTeams[0]!.team;
const poolId = `${schedule.week}:g${schedule.generatorVersion}:c${schedule.pool.candidate}`;

test.skip(({ isMobile }) => isMobile, 'one desktop run covers it');

test('a Hard battle loads its engine under the CSP, and resumes after a reload', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to|WebAssembly/i.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(String(e)));
  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': CSP },
    });
  });
  const wasm: string[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('.wasm')) wasm.push(r.url());
  });
  await page.addInitScript(
    (s) => {
      if (!localStorage.getItem('daily-battle:state'))
        localStorage.setItem('daily-battle:state', s);
    },
    JSON.stringify({
      version: 4,
      games: {
        gen3ou: { weeks: { [schedule.week]: { team: TEAM, poolId } }, days: {} },
        gen4ou: { weeks: {}, days: {} },
        gen5ou: { weeks: {}, days: {} },
        gen6ou: { weeks: {}, days: {} },
      },
      settings: {
        beginnerHints: true,
        battleSpeed: 'instant',
        animations: false,
        shownExplainers: ['welcome', 'tour'],
        format: 'gen3ou',
        difficulty: { gen3ou: 'hard' },
      },
    }),
  );
  await page.clock.setFixedTime(new Date('2026-10-21T10:00:00-04:00'));
  await page.goto('/#play');
  const picker = page.getByRole('radiogroup', { name: 'Difficulty' });
  await expect(picker.getByRole('radio', { name: 'Hard' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('button', { name: /^Start · / }).click();

  const header = page.getByRole('banner');
  await expect(header.getByText('Hard', { exact: true })).toBeVisible();
  await page.locator(MOVES).first().click({ timeout: 30_000 });
  await expect(header.getByText('Turn 2')).toBeVisible({ timeout: 30_000 });
  expect(wasm.some((u) => /gen3[^/]*\.wasm$/.test(u))).toBe(true);

  // The page reopens the battle in progress, replayed from the saved choices.
  await page.reload();
  await expect(page.getByRole('banner').getByText('Turn 2')).toBeVisible({ timeout: 30_000 });
  await page.locator(MOVES).first().click({ timeout: 30_000 });
  await expect(
    page
      .getByRole('banner')
      .getByText('Turn 3')
      .or(page.getByRole('button', { name: /^Switch to/ }).first())
      .or(page.getByRole('dialog', { name: 'Battle over' })),
  ).toBeVisible({ timeout: 30_000 });
  expect(problems).toEqual([]);
});
