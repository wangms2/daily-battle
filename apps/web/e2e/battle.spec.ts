// Real battles through the real worker: a full playthrough, resume after a
// reload, no third-party requests, and no scrolling in any battle state.
// Every attempt gets fresh random seeds (DESIGN.md §6.1), so the helpers here
// handle whatever happens: moves, forced switches, or the battle ending.
import { expect, test, type Page } from '@playwright/test';
import schedule from '../public/schedule/2026-10-19.json' with { type: 'json' };

const TODAY = new Date('2026-10-21T10:00:00-04:00');
const MOVES = 'main button[aria-label*=" PP"]:enabled';
const SWITCHES = 'main button[aria-label^="Switch to"]:not([aria-disabled="true"])';

function seededState(speed: 'normal' | 'fast' | 'instant') {
  return {
    version: 1,
    weeks: { '2026-10-19': { team: schedule.suggestedTeams[0]!.team, poolId: '2026-10-19:c0' } },
    days: {},
    stats: {
      daysPlayed: 0,
      firstTryWins: 0,
      firstTryStreak: 0,
      bestFirstTryStreak: 0,
      lastScoredDay: null,
      clears: 0,
      totalAttempts: 0,
    },
    settings: {
      beginnerHints: true,
      battleSpeed: speed,
      animations: true,
      shownExplainers: ['welcome'],
    },
  };
}

async function open(page: Page, speed: 'normal' | 'fast' | 'instant') {
  await page.addInitScript(
    (s) => {
      if (!localStorage.getItem('daily-battle:state'))
        localStorage.setItem('daily-battle:state', s);
    },
    JSON.stringify(seededState(speed)),
  );
  await page.clock.setFixedTime(TODAY);
  await page.goto('/');
}

async function noScroll(page: Page, step: string) {
  const o = await page.evaluate(() => ({
    page: document.documentElement.scrollHeight - window.innerHeight,
    dialogs: [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].map(
      (d) => d.scrollHeight - d.clientHeight,
    ),
  }));
  expect(o.page, `${step}: page scrolls`).toBeLessThanOrEqual(1);
  for (const d of o.dialogs) expect(d, `${step}: sheet overflows`).toBeLessThanOrEqual(1);
}

type State = 'moves' | 'switch' | 'end';

/** Waits until the player can act (or the battle is over), skipping playback. */
async function waitForChoice(page: Page): Promise<State> {
  const handle = await page.waitForFunction(
    ([moves, switches]) => {
      if (document.querySelector('[role="dialog"][aria-label="Battle over"]')) return 'end';
      if (document.querySelector(moves!)) return 'moves';
      if (
        document.querySelector(switches!) &&
        document.body.textContent?.includes('Who comes in?')
      ) {
        return 'switch';
      }
      // Still playing: tap the field to skip.
      (document.querySelector('.battle-field') as HTMLElement | null)?.click();
      return false;
    },
    [MOVES, SWITCHES],
    { timeout: 20_000, polling: 150 },
  );
  return (await handle.jsonValue()) as State;
}

/** Makes one choice: the first usable move, or the first switch on a forced switch. */
async function act(page: Page): Promise<State> {
  const state = await waitForChoice(page);
  if (state === 'end') return state;
  // The app may auto-submit a lone legal choice first; then the buttons disable and we just go round again.
  await page
    .locator(state === 'moves' ? MOVES : SWITCHES)
    .first()
    .click({ timeout: 2_000 })
    .catch(() => {});
  return state;
}

test('plays a full battle and stays on our own hosts', async ({ page }) => {
  const foreign: string[] = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') foreign.push(r.url());
  });
  await open(page, 'instant');
  await page.getByRole('button', { name: /^Start · / }).click();
  for (let i = 0; i < 400 && (await act(page)) !== 'end'; i++);
  await expect(page.getByRole('dialog', { name: 'Battle over' })).toBeVisible();
  await noScroll(page, 'end card');
  expect(foreign).toEqual([]);

  await page.getByRole('button', { name: 'Back to today' }).click();
  await expect(page.getByRole('button', { name: /^Start · / })).toBeVisible();
});

test('resumes a battle after a reload', async ({ page }) => {
  await open(page, 'instant');
  await page.getByRole('button', { name: /^Start · / }).click();
  for (let i = 0; i < 4; i++) if ((await act(page)) === 'end') break;
  if ((await waitForChoice(page)) === 'end') return; // the battle ended early; nothing to resume
  const log = page.getByRole('log', { name: 'Battle log' });
  const turn = await page
    .locator('header')
    .getByText(/^Turn \d+$/)
    .textContent();
  const text = await log.textContent();
  await page.reload();
  await waitForChoice(page);
  await expect(page.locator('header').getByText(/^Turn \d+$/)).toHaveText(turn!);
  await expect(log).toHaveText(text!);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`battle screens fit without scrolling (${scheme})`, async ({ page }, info) => {
    const dir = `e2e/screens/${info.project.name}/${scheme}`;
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, 'fast');
    await page.getByRole('button', { name: /^Start · / }).click();

    let state = await waitForChoice(page);
    // Park the mouse off the controls so no hover card shows in the shots.
    await page.mouse.move(1, 1);
    await noScroll(page, 'first choice');
    await page.screenshot({ path: `${dir}/20-battle.png` });

    // Play a couple of turns at Fast speed, catching one mid-playback.
    let caughtPlayback = false;
    for (let i = 0; i < 3 && state !== 'end'; i++) {
      if (state === 'switch') {
        await noScroll(page, 'forced switch');
        await page.screenshot({ path: `${dir}/27-battle-switch.png` });
      }
      await page
        .locator(state === 'moves' ? MOVES : SWITCHES)
        .first()
        .click();
      await page.mouse.move(1, 1);
      if (!caughtPlayback) {
        await page.waitForTimeout(400);
        await noScroll(page, 'playback');
        await page.screenshot({ path: `${dir}/21-battle-playing.png` });
        caughtPlayback = true;
      }
      state = await waitForChoice(page);
    }
    test.skip(state === 'end', 'battle ended before the sheets could be checked');

    for (const [who, file] of [
      ['Your', '22-battle-you'],
      ['Foe', '23-battle-foe'],
    ] as const) {
      const bar = page.getByRole('button', { name: new RegExp(`^${who} .* Details$`) });
      if (await bar.isVisible()) {
        await bar.click();
        await expect(page.getByRole('tooltip')).toBeVisible();
        await page.waitForTimeout(250); // let it fade in
        expect(await page.getByRole('dialog').count(), 'details are a card, not a sheet').toBe(0);
        await noScroll(page, `${who} info`);
        await page.screenshot({ path: `${dir}/${file}.png` });
        // A tap anywhere else closes it.
        await page
          .locator('header')
          .getByText(/^Turn \d+$/)
          .click();
        await expect(page.getByRole('tooltip')).toBeHidden();
      }
    }

    const expand = page.getByRole('button', { name: 'Open the battle log' });
    if (await expand.isVisible()) {
      await expand.click();
      await page.waitForTimeout(250);
      await noScroll(page, 'log');
      await page.screenshot({ path: `${dir}/24-battle-log.png` });
      await page.keyboard.press('Escape');
    }

    await page.getByRole('button', { name: 'Battle menu' }).click();
    await page.waitForTimeout(250);
    await noScroll(page, 'menu');
    await page.screenshot({ path: `${dir}/25-battle-menu.png` });
    await page.getByRole('button', { name: 'Give up' }).click();
    await page.getByRole('button', { name: 'Give up' }).last().click();
    await expect(page.getByRole('dialog', { name: 'Battle over' })).toBeVisible();
    await page.waitForTimeout(300);
    await noScroll(page, 'end');
    await page.screenshot({ path: `${dir}/26-battle-end.png` });
  });
}
