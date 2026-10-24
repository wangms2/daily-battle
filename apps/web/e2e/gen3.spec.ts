// Gen 3 OU as a fourth daily game: picking it on first run, its builder and a
// battle in the games' own look (Emerald sprites, Gen 3 backgrounds, its pixel
// font), the news sheet a returning player sees once, and #gen3 links.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import schedule from '../public/schedule/gen3ou/2026-10-19.json' with { type: 'json' };

const TODAY = new Date('2026-10-21T10:00:00-04:00');
const MOVES = 'main button[aria-label*=" PP"]:enabled';
const poolId = `${schedule.week}:g${schedule.generatorVersion}:c${schedule.pool.candidate}`;
/** This week's Balanced suggestion, led by its first Pokémon. */
const TEAM = schedule.suggestedTeams[0]!.team;
const LEAD = TEAM[0]!.species;

/** A v4 save on Gen 3, news seen, optionally with this week's team locked. */
function gen3State({ locked = true } = {}) {
  return {
    version: 4,
    games: {
      gen3ou: { weeks: locked ? { [schedule.week]: { team: TEAM, poolId } } : {}, days: {} },
      gen4ou: { weeks: {}, days: {} },
      gen5ou: { weeks: {}, days: {} },
      gen6ou: { weeks: {}, days: {} },
    },
    settings: {
      beginnerHints: true,
      battleSpeed: 'instant',
      animations: true,
      shownExplainers: ['welcome', 'gen5-news', 'gen6-news', 'gen3-news'],
      format: 'gen3ou',
    },
  };
}

async function open(page: Page, state?: object, path = '/') {
  if (state) {
    await page.addInitScript((s) => {
      if (!localStorage.getItem('daily-battle:state'))
        localStorage.setItem('daily-battle:state', s);
    }, JSON.stringify(state));
  }
  await page.clock.setFixedTime(TODAY);
  await page.goto(path);
}

/** Neither the page nor an open sheet scrolls (checked once sheets have slid in). */
async function noScroll(page: Page, step: string) {
  await page.waitForTimeout(400);
  const o = await page.evaluate(() => ({
    page: document.documentElement.scrollHeight - window.innerHeight,
    dialogs: [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].map(
      (d) => d.scrollHeight - d.clientHeight,
    ),
  }));
  expect(o.page, `${step}: page scrolls`).toBeLessThanOrEqual(1);
  for (const d of o.dialogs) expect(d, `${step}: sheet overflows`).toBeLessThanOrEqual(1);
}

/** No WCAG 2.1 A/AA violations on the page as it is. */
async function axe(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `e2e/look/gen3/${project}/${name}.png` });

test('a first-time player picks Gen 3 and gets its pool in Emerald sprites', async ({
  page,
}, info) => {
  await open(page);
  const welcome = page.getByRole('dialog', { name: 'Welcome to Daily Battle' });
  // The games run by generation: Gen 3 comes first.
  await expect(welcome.getByRole('radio').first()).toContainText('Gen 3 OU');
  await welcome.getByRole('radio', { name: /Gen 3 OU/ }).click();
  await noScroll(page, 'welcome sheet');
  await shot(page, '01-welcome-picked', info.project.name);
  await welcome.getByRole('button', { name: 'Play Gen 3 OU' }).click();
  await expect(page.getByRole('button', { name: /^Gen 3 · Week of/ })).toBeVisible();
  const species = schedule.pool.species[0]!;
  await expect(page.getByRole('button', { name: `Add ${species} to team` })).toBeVisible();
  // Every front sprite is the Emerald one.
  const fronts = await page
    .locator('main img[src*="/sprites/"]:not([src*="/icons/"])')
    .evaluateAll((imgs) => imgs.map((i) => i.getAttribute('src')!));
  expect(fronts.length).toBeGreaterThan(0);
  expect(fronts.filter((src) => !src.includes('/sprites/gen3/front/'))).toEqual([]);
  await noScroll(page, 'gen 3 builder');
  await page.waitForLoadState('networkidle');
  await shot(page, '02-builder', info.project.name);
  await axe(page);
});

test('a Gen 3 battle uses the Emerald sprites, a Gen 3 background, and its font', async ({
  page,
}, info) => {
  await open(page, gen3State());
  await page.getByRole('button', { name: `Start · ${LEAD} leads` }).click();
  await page.locator(MOVES).first().waitFor();
  await expect(page.locator('main img[src*="/sprites/gen3/back/"]').first()).toBeAttached();
  await expect(page.locator('main img[src*="/sprites/gen3/front/"]').first()).toBeAttached();
  await expect(page.locator('[style*="bg-gen3"]').first()).toBeAttached();
  const font = await page
    .locator('[data-gen="3"] .battle-pixel')
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font).toMatch(/Jersey 10/);
  await page.waitForLoadState('networkidle');
  await noScroll(page, 'gen 3 battle');
  await shot(page, '03-battle', info.project.name);
  await axe(page);
  await page.locator(MOVES).first().click();
  await page
    .locator(
      `${MOVES}, main button[aria-label^="Switch to"], [role="dialog"][aria-label="Battle over"]`,
    )
    .first()
    .waitFor();
  await shot(page, '04-after-a-turn', info.project.name);
});

test('a player from before Gen 3 gets the news once, and can try it', async ({ page }, info) => {
  const state = gen3State({ locked: false });
  state.settings.format = 'gen4ou';
  state.settings.shownExplainers = ['welcome', 'gen5-news', 'gen6-news'];
  await open(page, state);
  const news = page.getByRole('dialog', { name: 'New: Gen 3 OU' });
  await expect(news).toBeVisible();
  await noScroll(page, 'gen 3 news');
  await shot(page, '05-news', info.project.name);
  await news.getByRole('button', { name: 'Try Gen 3 OU' }).click();
  await expect(page.getByRole('button', { name: /^Gen 3 · / })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /^Gen 3 · / })).toBeVisible();
  await expect(news).toBeHidden();
});

test('a #gen3 share link opens Gen 3', async ({ page }) => {
  const state = gen3State();
  state.settings.format = 'gen4ou';
  await open(page, state, '/#gen3');
  await expect(page.getByRole('button', { name: /^Gen 3 · / })).toBeVisible();
  await expect(page).toHaveURL(/\/#?$/);
});
