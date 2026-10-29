// Playtest feedback round: the builder without its bottom row, swipe-to-close
// sheets, still sprites with animations off, item and ability details, team
// coverage in the checklist, and an opponent's possible sets with hints on.
import { expect, test, type Page } from '@playwright/test';
import sets from '../../../packages/data/gen4ou/sets.json' with { type: 'json' };
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
      shownExplainers: ['welcome', 'gen5-news', 'gen6-news', 'gen3-news', 'tour'],
      format: 'gen4ou',
    },
  };
}

async function open(page: Page, s: object) {
  await page.addInitScript((v) => {
    if (!localStorage.getItem('daily-battle:state')) localStorage.setItem('daily-battle:state', v);
  }, JSON.stringify(s));
  await page.clock.setFixedTime(TODAY);
  await page.goto('/#play');
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
  await page.getByRole('button', { name: 'Use recommended team' }).click();
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
  await page.getByRole('button', { name: 'Use recommended team' }).click();
  await page.getByRole('button', { name: /^Team checklist/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Team checklist' });
  await expect(sheet).toBeVisible();
  await noScroll(page, 'checklist sheet');
  await shot(page, '03-checklist', info.project.name);
});

test('an opponent’s info shows its likely moves with hints on, and fits', async ({
  page,
}, info) => {
  await open(page, state({ team: true }));
  await page.getByRole('button', { name: /^Start · / }).waitFor();
  await page.waitForLoadState('networkidle');
  await shot(page, '00-brief', info.project.name);
  const foe = schedule.days.find((d) => d.day === '2026-10-21')!.team[0]!.species;
  await page.getByRole('button', { name: `About ${foe}` }).click();
  // A computer shows it in the panel beside the teams; a phone or tablet in a sheet.
  const sheet =
    page.viewportSize()!.width >= 1280
      ? page.getByRole('complementary', { name: `${foe} details` })
      : page.getByRole('dialog', { name: foe });
  await expect(sheet.getByRole('list', { name: 'Moves' })).toBeVisible();
  await noScroll(page, 'foe info');
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

test('wide screens show a Pokédex entry, final stats and item icons; phones keep it lean', async ({
  page,
}, info) => {
  await open(page, state());
  await page.getByRole('button', { name: 'Use recommended team' }).click();
  await page.waitForLoadState('networkidle');
  if (info.project.use.isMobile) {
    await page
      .getByRole('button', { name: /Change set$/ })
      .first()
      .click();
    const sheet = page.getByRole('dialog', { name: /pick a set/ });
    // Final stats on one line, an item icon, and no Pokédex text.
    await expect(sheet.getByLabel('Final stats at level 100')).toBeVisible();
    await expect(sheet.locator('img[src*="/items/"]').first()).toBeAttached();
    await noScroll(page, 'set picker with final stats');
  } else {
    await page.locator('aside ul li > div > button').first().click();
    const panel = page.getByRole('region', { name: / details$/ });
    await expect(panel.getByLabel('Base and final stats')).toBeVisible();
    await expect(panel.locator('img[src*="/items/"]').first()).toBeAttached();
    // The Pokédex entry loads on demand, and opens from the name.
    await panel.getByRole('heading').getByRole('button').click();
    await expect(panel.getByRole('tooltip')).toContainText('Pokédex');
  }
});

test('a long set description floats over the card on tap, and nothing scrolls', async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith('phone'), 'phones only');
  // The set with the longest description in the data, as the first member of the team.
  const long = Object.entries(sets.species)
    .flatMap(([species, e]) => e.sets.map((set) => ({ species, set })))
    .sort((x, y) => y.set.description.length - x.set.description.length)[0]!;
  const s = state({ team: true });
  s.games.gen4ou.weeks[schedule.week]!.team = [
    { species: long.species, setId: long.set.id },
    ...TEAM.slice(1),
  ];
  await open(page, s);
  await page.getByRole('button', { name: `${long.species}'s set` }).click();
  const sheet = page.getByRole('dialog', { name: /your set/ });
  const text = sheet.locator('p[role="button"]');
  await expect(text).toBeVisible();
  await text.click();
  await expect(sheet.getByRole('tooltip')).toContainText(long.set.description);
  await noScroll(page, 'set view with the full description');
  await shot(page, '08-description-open', info.project.name);
});

test('the one-per-team message is shown in full, and a tap dismisses it', async ({ page }) => {
  await open(page, state());
  await page.getByRole('button', { name: 'Add Rotom-Frost to team' }).click();
  // Narrow layouts ask for the set first; wide ones add it straight away.
  const confirm = page.getByRole('button', { name: 'Add Rotom-Frost', exact: true });
  if (await confirm.isVisible({ timeout: 1000 }).catch(() => false)) await confirm.click();
  await page.getByRole('button', { name: /^Rotom-Wash: one per team with Rotom-Frost/ }).click();
  const note = page.getByRole('status').filter({ hasText: 'One per team' });
  await expect(note).toBeVisible();
  const fits = await note.evaluate((el) => {
    const t = el.querySelector('span')!;
    return t.scrollWidth <= t.clientWidth + 1 && t.scrollHeight <= t.clientHeight + 1;
  });
  expect(fits, 'the whole message is visible, not cut off').toBe(true);
  await noScroll(page, 'builder with the one-per-team message');
  await note.click();
  await expect(note).toHaveCount(0);
});
