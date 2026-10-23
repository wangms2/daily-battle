// Playtest feedback round: the builder without its bottom row, swipe-to-close
// sheets, still sprites with animations off, item and ability details, team
// coverage in the checklist, and an opponent's possible sets with hints on.
import { expect, test, type Page } from '@playwright/test';
import schedule from '../public/schedule/2026-10-19.json' with { type: 'json' };

const TODAY = new Date('2026-10-21T10:00:00-04:00');
const TEAM = schedule.suggestedTeams[0]!.team;
const poolId = `${schedule.week}:g${schedule.generatorVersion}:c${schedule.pool.candidate}`;

function state({ team = false, animations = true } = {}) {
  return {
    version: 4,
    games: {
      gen4ou: { weeks: team ? { [schedule.week]: { team: TEAM, poolId } } : {}, days: {} },
      gen5ou: { weeks: {}, days: {} },
    },
    settings: {
      beginnerHints: true,
      battleSpeed: 'instant',
      animations,
      shownExplainers: ['welcome', 'gen5-news'],
      format: 'gen4ou',
    },
  };
}

async function open(page: Page, s: object) {
  await page.addInitScript((v) => {
    if (!localStorage.getItem('daily-battle:state')) localStorage.setItem('daily-battle:state', v);
  }, JSON.stringify(s));
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
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

const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `e2e/look/feedback/${project}/${name}.png` });

test('the builder fits with no team row, and a picked tile’s pencil changes its set', async ({
  page,
}, info) => {
  await open(page, state());
  await page.getByRole('button', { name: 'Balanced' }).click();
  await page.waitForLoadState('networkidle');
  await noScroll(page, 'builder with a team');
  await shot(page, '01-builder', info.project.name);
  if (info.project.use.isMobile) {
    await page
      .getByRole('button', { name: /Change set$/ })
      .first()
      .click();
    await expect(page.getByRole('dialog', { name: /pick a set/ })).toBeVisible();
    // The item opens a details card, like a move.
    const item = page.getByRole('dialog').getByRole('definition').getByRole('button').first();
    await item.click();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await noScroll(page, 'set picker with an item card');
    await shot(page, '02-set-picker-item', info.project.name);
  }
});

test('the checklist sheet shows coverage gaps without overflowing', async ({ page }, info) => {
  await open(page, state());
  await page.getByRole('button', { name: 'Balanced' }).click();
  await page.getByRole('button', { name: /^Team checklist/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Team checklist' });
  await expect(sheet).toBeVisible();
  await noScroll(page, 'checklist sheet');
  await shot(page, '03-checklist', info.project.name);
});

test('an opponent’s possible sets show with hints on, and fit', async ({ page }, info) => {
  await open(page, state({ team: true }));
  await page.getByRole('button', { name: /^Start · / }).waitFor();
  await page.waitForLoadState('networkidle');
  await shot(page, '00-brief', info.project.name);
  const foe = schedule.days.find((d) => d.day === '2026-10-21')!.team[0]!.species;
  await page.getByRole('button', { name: `About ${foe}` }).click();
  const sheet = page.getByRole('dialog', { name: foe });
  await expect(sheet.getByRole('tablist', { name: 'Possible sets' })).toBeVisible();
  await noScroll(page, 'foe info with possible sets');
  await shot(page, '04-foe-sets', info.project.name);
});

test('a sheet swipes closed from its handle, and springs back from a short drag', async ({
  page,
}, info) => {
  test.skip(!info.project.use.isMobile, 'phones only: wide screens show a dialog');
  await open(page, state({ team: true }));
  await page.getByRole('button', { name: 'Settings' }).click();
  const sheet = page.getByRole('dialog', { name: 'Settings' });
  await expect(sheet).toBeVisible();
  await page.waitForTimeout(300);
  const title = sheet.getByRole('heading', { name: 'Settings' });
  const box = (await title.boundingBox())!;
  const drag = async (dy: number) => {
    await page.mouse.move(box.x + 10, box.y + 5);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + 10, box.y + 5 + (dy * i) / 8);
    await page.mouse.up();
  };
  await drag(30);
  await page.waitForTimeout(300);
  await expect(sheet).toBeVisible();
  await drag(250);
  await expect(sheet).toBeHidden();
});

test('with animations off, sprites are still images on the builder and in battle', async ({
  page,
}) => {
  await open(page, state({ team: true, animations: false }));
  await expect(page.getByRole('button', { name: /^Start · / })).toBeVisible();
  const gifs = () =>
    page.locator('img[src*="/sprites/front/"], img[src*="/sprites/back/"]').count();
  expect(await gifs()).toBe(0);
  expect(await page.locator('img[src*="/sprites/front-still/"]').count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: /^Start · / }).click();
  await page.locator('main button[aria-label*=" PP"]:enabled').first().waitFor();
  expect(await gifs()).toBe(0);
  expect(await page.locator('img[src*="-still/"]').count()).toBeGreaterThan(0);
});
