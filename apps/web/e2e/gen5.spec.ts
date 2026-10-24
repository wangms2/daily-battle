// Gen 5 OU as a second daily game: picking it on first run, switching games
// from the title, a share link that opens it, and a real battle with Team
// Preview (the foe's six show from the start), with no scrolling on phones.
import { expect, test, type Page } from '@playwright/test';
import schedule from '../public/schedule/gen5ou/2026-10-26.json' with { type: 'json' };

const TODAY = new Date('2026-10-28T10:00:00-04:00');
const MOVES = 'main button[aria-label*=" PP"]:enabled';
const TEAM = schedule.suggestedTeams[0]!.team;
const poolId = `${schedule.week}:g${schedule.generatorVersion}:c${schedule.pool.candidate}`;

/** A v4 save on Gen 5 with this week's team locked. */
function gen5State() {
  return {
    version: 4,
    games: {
      gen4ou: { weeks: {}, days: {} },
      gen5ou: { weeks: { [schedule.week]: { team: TEAM, poolId } }, days: {} },
    },
    settings: {
      beginnerHints: true,
      battleSpeed: 'instant',
      animations: true,
      shownExplainers: ['welcome', 'gen5-news', 'gen6-news', 'gen3-news'],
      format: 'gen5ou',
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

const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `e2e/look/gen5/${project}/${name}.png` });

test('a first-time player picks Gen 5 and gets its pool', async ({ page }, info) => {
  await open(page);
  const welcome = page.getByRole('dialog', { name: 'Welcome to Daily Battle' });
  await expect(welcome.getByRole('button', { name: 'Pick a game to start' })).toBeDisabled();
  await welcome.getByRole('radio', { name: /Gen 5 OU/ }).click();
  await noScroll(page, 'welcome sheet');
  await shot(page, '01-welcome-picked', info.project.name);
  await welcome.getByRole('button', { name: 'Play Gen 5 OU' }).click();
  await expect(page.getByRole('button', { name: /^Gen 5 · Week of/ })).toBeVisible();
  // A Pokémon only Gen 5 has.
  await expect(page.getByText(schedule.pool.species[0]!).first()).toBeVisible();
  await noScroll(page, 'gen 5 builder');
  // Let the pool sprites load before the screenshot.
  await page.waitForLoadState('networkidle');
  await shot(page, '02-builder', info.project.name);
});

test('the title switches games, each with its own team', async ({ page }, info) => {
  await open(page, gen5State());
  await page.getByRole('button', { name: /^Gen 5 · / }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a game' });
  await expect(picker).toBeVisible();
  await noScroll(page, 'game picker');
  await shot(page, '03-picker', info.project.name);
  await picker.getByRole('button', { name: /Gen 4 OU/ }).click();
  // No Gen 4 team yet this week: its builder opens.
  await expect(page.getByRole('button', { name: /^Gen 4 · Week of/ })).toBeVisible();
  await page.getByRole('button', { name: /^Gen 4 · / }).click();
  await page
    .getByRole('dialog', { name: 'Choose a game' })
    .getByRole('button', { name: /Gen 5 OU/ })
    .click();
  // Back on Gen 5's brief with its locked team.
  await expect(page.getByRole('button', { name: /^Start · / })).toBeVisible();
});

test('a #gen5 share link opens Gen 5', async ({ page }) => {
  const state = gen5State();
  state.settings.format = 'gen4ou';
  await open(page, state, '/#gen5');
  await expect(page.getByRole('button', { name: /^Gen 5 · / })).toBeVisible();
  await expect(page).toHaveURL(/\/#?$/);
});

test('a Gen 5 battle shows the foe six from the start, and resumes', async ({ page }, info) => {
  await open(page, gen5State());
  // Phones show the brief's tip line (with hints on); wide screens have none.
  if (info.project.use.isMobile)
    await expect(page.getByText('They see your six too')).toBeVisible();
  else await expect(page.getByRole('button', { name: /^Start · / })).toBeVisible();
  await shot(page, '04-brief', info.project.name);
  await page.getByRole('button', { name: /^Start · / }).click();
  await page.locator(MOVES).first().waitFor();
  // Team Preview: all six foe Pokémon show as icons on its team marks, not balls.
  const foe = schedule.days.find((d) => d.day === '2026-10-28')!.team.map((s) => s.species);
  const icons = await page
    .locator('img[src*="/sprites/icons/"]')
    .evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).getAttribute('src')!));
  for (const s of foe) {
    const id = s.toLowerCase().replace(/[^a-z0-9]/g, '');
    expect(
      icons.some((src) => src.endsWith(`/icons/${id}.png`)),
      s,
    ).toBe(true);
  }
  await noScroll(page, 'gen 5 battle');
  await shot(page, '05-battle', info.project.name);

  // A few turns, then a reload resumes the same battle.
  for (let i = 0; i < 3; i++) {
    const move = page.locator(MOVES).first();
    if (!(await move.isVisible().catch(() => false))) break;
    await move.click({ timeout: 2_000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
  await shot(page, '06-battle-later', info.project.name);
  await page.reload();
  // It resumes wherever the battle was: a move to pick, a switch after a faint, or the end.
  await page
    .locator(
      `${MOVES}, main button[aria-label^="Switch to"], [role="dialog"][aria-label="Battle over"]`,
    )
    .first()
    .waitFor();
  await noScroll(page, 'resumed');
});

test('a player from before Gen 5 gets only the newest news, once', async ({ page }, info) => {
  // A Gen 4 save from before Gen 5 (v3), as most players have. Gen 6 has
  // come out since, so its sheet is the one they see; Gen 5's never shows.
  await open(page, {
    version: 3,
    weeks: {},
    days: {},
    settings: {
      beginnerHints: true,
      battleSpeed: 'instant',
      animations: true,
      shownExplainers: ['welcome'],
    },
  });
  const news = page.getByRole('dialog', { name: 'New: Gen 6 OU' });
  await expect(news).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'New: Gen 5 OU' })).toBeHidden();
  await noScroll(page, 'news');
  await shot(page, '07-news', info.project.name);
  await news.getByRole('button', { name: 'Stay on Gen 4' }).click();
  await expect(page.getByRole('button', { name: /^Gen 4 · / })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: /^Gen 4 · / })).toBeVisible();
  await expect(page.getByRole('dialog', { name: /^New: / })).toBeHidden();
});
