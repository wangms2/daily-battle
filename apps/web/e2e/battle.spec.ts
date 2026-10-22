// Real battles through the real worker: a full playthrough, resume after a
// reload, no third-party requests, and no scrolling in any battle state.
// Every attempt gets fresh random seeds (DESIGN.md §6.1), so the helpers here
// handle whatever happens: moves, forced switches, or the battle ending.
import { expect, test, type Page } from '@playwright/test';
import schedule from '../public/schedule/2026-10-19.json' with { type: 'json' };

const TODAY = new Date('2026-10-21T10:00:00-04:00');
const MOVES = 'main button[aria-label*=" PP"]:enabled';
const SWITCHES = 'main button[aria-label^="Switch to"]:not([aria-disabled="true"])';

const TEAM = schedule.suggestedTeams[0]!.team;
/** A finished try, for seeding earlier days. */
const tried = (result: 'win' | 'loss', remaining: number) => ({
  result,
  remaining,
  ts: 1,
  lead: TEAM[0]!.species,
  team: TEAM,
  battleSeed: '1,2,3,4',
  aiSeed: '5,6,7,8',
  choices: [],
  engine: '',
});

function seededState(speed: 'normal' | 'fast' | 'instant', days: Record<string, unknown> = {}) {
  return {
    version: 3,
    weeks: {
      '2026-10-19': {
        team: TEAM,
        poolId: `${schedule.week}:g${schedule.generatorVersion}:c${schedule.pool.candidate}`,
      },
    },
    days,
    settings: {
      beginnerHints: true,
      battleSpeed: speed,
      animations: true,
      shownExplainers: ['welcome'],
    },
  };
}

async function open(
  page: Page,
  speed: 'normal' | 'fast' | 'instant',
  days: Record<string, unknown> = {},
) {
  await page.addInitScript(
    (s) => {
      if (!localStorage.getItem('daily-battle:state'))
        localStorage.setItem('daily-battle:state', s);
    },
    JSON.stringify(seededState(speed, days)),
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
        /Who comes in\?|Send in your last Pokémon/.test(document.body.textContent ?? '')
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
  // If the click misses (the buttons disabled mid-turn), we just go round again.
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

  await expect(page.getByRole('dialog', { name: 'Battle over' })).toContainText(
    /Try 1 of 3|⭐ First try/,
  );
  await page.getByRole('button', { name: 'Back to today' }).click();
  // Today's result now shows on the brief.
  await expect(page.getByRole('region', { name: 'Today’s result' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Try again|Play again) · / })).toBeVisible();
});

test('on a touch screen, a bench tap opens details and its button switches', async ({
  page,
}, info) => {
  test.skip(!info.project.use.hasTouch, 'touch only');
  await open(page, 'instant');
  await page.getByRole('button', { name: /^Start · / }).click();
  test.skip((await waitForChoice(page)) !== 'moves', 'no move turn to switch from');
  const mon = page.locator(SWITCHES).first();
  const species = (await mon.getAttribute('aria-label'))!.match(/^Switch to (.+?),/)![1]!;
  await mon.tap();
  const card = page.getByRole('dialog', { name: species });
  await expect(card).toBeVisible();
  await expect(page.locator('main')).not.toContainText(', come back!'); // not switched yet
  await page.waitForTimeout(250);
  await noScroll(page, 'bench card');
  await page.screenshot({ path: `e2e/screens/${info.project.name}/light/27-bench-card.png` });
  await card.getByRole('button', { name: `Switch to ${species}` }).tap();
  await expect(card).toBeHidden();
  await expect(page.locator('main')).toContainText(', come back!');
});

test('on a touch screen, holding a move shows its details and keeps them; a tap chooses', async ({
  page,
}, info) => {
  test.skip(!info.project.use.hasTouch, 'touch only');
  await open(page, 'instant');
  await page.getByRole('button', { name: /^Start · / }).click();
  test.skip((await waitForChoice(page)) !== 'moves', 'no move turn');
  const move = page.locator(MOVES).first();
  const box = (await move.boundingBox())!;
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchEnd') =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchStart' ? [at] : [],
    });
  // Hold: the details appear almost at once and stay after the finger lifts.
  await touch('touchStart');
  await page.waitForTimeout(250);
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.waitForTimeout(400);
  await touch('touchEnd');
  await page.waitForTimeout(200);
  await expect(page.getByRole('tooltip')).toBeVisible();
  await expect(page.getByRole('tooltip')).toContainText('Power');
  await noScroll(page, 'move details');
  await page.screenshot({ path: `e2e/screens/${info.project.name}/light/31-move-hold.png` });
  await expect(page.locator('main')).not.toContainText(' used '); // not chosen
  // A tap elsewhere closes it; a quick tap on the move chooses it.
  await page.locator('header').tap();
  await expect(page.getByRole('tooltip')).toBeHidden();
  await move.tap();
  await expect(page.locator('main')).toContainText(' used ');
});

test('a run after the day is won is practice, and shares as practice', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (t: string) => {
          (window as unknown as { copied: string }).copied = t;
        },
      },
    });
  });
  await open(page, 'instant', { '2026-10-21': { swapUsed: false, attempts: [tried('win', 4)] } });
  await page.getByRole('button', { name: 'Play again · practice' }).click();
  await waitForChoice(page);
  await page.getByRole('button', { name: 'Battle menu' }).click();
  await page.getByRole('button', { name: 'Give up' }).click();
  const confirm = page.getByRole('dialog', { name: 'Give up this battle?' });
  await expect(confirm).toContainText('practice run');
  await confirm.getByRole('button', { name: 'Give up' }).click();
  const card = page.getByRole('dialog', { name: 'Battle over' });
  await expect(card).toContainText('Practice');
  await expect(card).not.toContainText('of 3');
  await card.getByRole('button', { name: 'Share' }).click();
  await page
    .getByRole('dialog', { name: 'Share your result' })
    .getByRole('button', { name: 'Copy text' })
    .click();
  const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(copied).toContain('⭐ First try! 4/6 left');
  expect(copied).toMatch(/🔁 (?:🟩|⬛|⬜){6} practice/u);
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

test('three lost tries break the streak, and the result copies to share', async ({
  page,
}, info) => {
  const dir = `e2e/screens/${info.project.name}/light`;
  // No system share sheet, so Share copies; capture exactly what's copied.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (t: string) => {
          (window as unknown as { copied: string }).copied = t;
        },
      },
    });
  });
  await open(page, 'instant', { '2026-10-20': { swapUsed: false, attempts: [tried('win', 3)] } });
  await expect(page.getByRole('button', { name: 'Stats. Streak 1' })).toBeVisible();

  for (let i = 1; i <= 3; i++) {
    await page.getByRole('button', { name: /^(Start|Try again) · / }).click();
    await waitForChoice(page);
    await page.getByRole('button', { name: 'Battle menu' }).click();
    await page.getByRole('button', { name: 'Give up' }).click();
    await page.getByRole('button', { name: 'Give up' }).last().click();
    const card = page.getByRole('dialog', { name: 'Battle over' });
    await expect(card).toContainText('You gave up');
    await expect(card).toContainText(`Try ${i} of 3`);
    if (i < 3) await expect(card).toContainText(`${3 - i} ${i === 2 ? 'try' : 'tries'} left`);
    else {
      await expect(card).toContainText('Streak reset');
      await page.waitForTimeout(300);
      await noScroll(page, 'end card, 3 tries');
      await page.screenshot({ path: `${dir}/28-end-tries.png` });
    }
    await card.getByRole('button', { name: 'Back to today' }).click();
  }

  const strip = page.getByRole('region', { name: 'Today’s result' });
  await expect(strip).toContainText('Not cleared in 3 tries');
  await expect(page.getByRole('button', { name: 'Stats. Streak 0' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play again · practice' })).toBeVisible();
  // From here on, changes are per practice run; the daily change is gone.
  await expect(page.getByRole('button', { name: 'Practice change' })).toBeVisible();
  await noScroll(page, 'brief with result');
  await page.screenshot({ path: `${dir}/29-brief-result.png` });

  await strip.getByRole('button', { name: 'Share' }).click();
  const choice = page.getByRole('dialog', { name: 'Share your result' });
  // The card image is drawn for the preview; the image button waits for it.
  await expect(choice.getByRole('img')).toBeVisible();
  // Actually shown, not blocked: the preview server sends the deployed CSP.
  await expect
    .poll(() => choice.getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBe(2400);
  await expect(choice.getByRole('button', { name: /^(Share|Copy|Save) image$/ })).toBeEnabled();
  await page.waitForTimeout(300);
  await noScroll(page, 'share choice');
  await page.screenshot({ path: `${dir}/30-share-choice.png` });
  await choice.getByRole('button', { name: 'Copy text' }).click();
  await expect(page.getByRole('status')).toContainText('Text copied');
  const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  const lines = copied.split('\n');
  expect(lines.slice(0, 2)).toEqual(['Daily Battle · Oct 21', '❌ Not cleared in 3 tries']);
  for (const row of lines.slice(2, 5)) expect(row).toMatch(/^❌ ⬜+⬛*$/u); // given up: grey
  expect(copied).toContain('🔥 Streak reset');
  for (const s of schedule.days.find((d) => d.day === '2026-10-21')!.team) {
    if (!TEAM.some((t) => t.species === s.species)) expect(copied).not.toContain(s.species);
  }
});
