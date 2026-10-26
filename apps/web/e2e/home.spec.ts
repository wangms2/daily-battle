// The first screen: the Pokémon Daily logo, the generations' mascots, Play, and
// Versus with friends; then the game picker.
// A shared link (#daily) lands on the picker. Nothing scrolls on phones.
import { expect, test, type Page } from '@playwright/test';

const TODAY = new Date('2026-10-28T10:00:00-04:00');

async function open(page: Page, path: string) {
  await page.clock.setFixedTime(TODAY);
  await page.goto(path);
}

async function noScroll(page: Page, step: string) {
  const over = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expect(over, `${step}: page scrolls`).toBeLessThanOrEqual(1);
}

const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `e2e/look/home/${project}/${name}.png` });

test('the first screen offers Play and Versus, then the four games', async ({ page }, info) => {
  await open(page, '/');
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'With friends' })).toBeVisible();
  // Nothing pops up over a first visit.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Pokémon Daily' })).toBeVisible();
  // A mascot for each generation, and no checks before any is cleared.
  const mascots = page.getByRole('group', { name: 'Generations' }).getByRole('button');
  await expect(mascots).toHaveCount(4);
  for (const [i, gen] of ['Gen 3', 'Gen 4', 'Gen 5', 'Gen 6'].entries()) {
    await expect(mascots.nth(i)).toHaveAccessibleName(`Play ${gen} OU`);
  }
  await expect(page.locator('.home-mascot-check')).toHaveCount(0);
  await noScroll(page, 'landing');
  await shot(page, '01-landing', info.project.name);

  await page.getByRole('button', { name: 'Play', exact: true }).click();
  for (const gen of ['Gen 3', 'Gen 4', 'Gen 5', 'Gen 6'])
    await expect(page.getByRole('button', { name: new RegExp(gen) })).toBeVisible();
  await noScroll(page, 'game picker');
  await shot(page, '02-picker', info.project.name);

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'With friends' })).toBeVisible();
});

test('a shared link opens the game picker', async ({ page }) => {
  await open(page, '/#daily');
  await expect(page.getByText('Choose a generation')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('With friends opens the room screen', async ({ page }) => {
  await open(page, '/');
  await page.getByRole('button', { name: 'With friends' }).click();
  await expect(page).toHaveURL(/#versus$/);
});

test('a mascot opens its generation, and one cleared today has a check', async ({ page }) => {
  // Gen 5 won today, on the first try; the others not played.
  await page.addInitScript(() => {
    if (localStorage.getItem('daily-battle:state')) return;
    const win = {
      result: 'win',
      remaining: 4,
      ts: 1,
      lead: 'Latios',
      team: [],
      battleSeed: '1',
      aiSeed: '2',
      choices: [],
      engine: '',
    };
    const game = (days: object) => ({ weeks: {}, days });
    localStorage.setItem(
      'daily-battle:state',
      JSON.stringify({
        version: 4,
        games: {
          gen3ou: game({}),
          gen4ou: game({}),
          gen5ou: game({ '2026-10-28': { swapUsed: false, attempts: [win] } }),
          gen6ou: game({}),
        },
        settings: {
          beginnerHints: false,
          battleSpeed: 'fast',
          animations: true,
          sound: false,
          shownExplainers: ['welcome', 'tour'],
        },
      }),
    );
  });
  await open(page, '/');
  const mascots = page.getByRole('group', { name: 'Generations' }).getByRole('button');
  await expect(mascots.nth(2)).toHaveAccessibleName('Play Gen 5 OU, cleared today');
  await expect(page.locator('.home-mascot-check')).toHaveCount(1);
  await mascots.nth(0).click();
  await expect(page.getByRole('button', { name: /^Gen 3 · / })).toBeVisible();
});

test('the friends on the With friends side are all on screen, none cut off', async ({ page }) => {
  await open(page, '/');
  await page.getByRole('button', { name: 'With friends' }).waitFor();
  const sides = await page.locator('.home-friend').evaluateAll((imgs) =>
    imgs.map((i) => {
      const r = i.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    }),
  );
  const width = page.viewportSize()!.width;
  expect(sides.length).toBeGreaterThanOrEqual(3);
  for (const s of sides) {
    expect(s.width).toBeGreaterThan(30);
    expect(s.left).toBeGreaterThanOrEqual(0);
    expect(s.right).toBeLessThanOrEqual(width);
  }
});
