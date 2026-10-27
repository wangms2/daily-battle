// Real battles through the real worker: a full playthrough, resume after a
// reload, no third-party requests, and no scrolling in any battle state.
// Every attempt gets fresh random seeds (DESIGN.md §6.1), so the helpers here
// handle whatever happens: moves, forced switches, or the battle ending.
import { expect, test, type Page } from '@playwright/test';
import speciesFile from '../../../packages/data/gen4ou/species.json' with { type: 'json' };
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
      shownExplainers: ['welcome', 'gen5-news', 'gen6-news', 'gen3-news', 'tour'],
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
  await page.goto('/#play');
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

  const over = page.getByRole('dialog', { name: 'Battle over' });
  await expect(over).toContainText(/Try 1|⭐ First try/);
  const won = (await over.textContent())!.includes('First try');
  await page.getByRole('button', { name: 'Back to today' }).click();
  if (won) {
    // The day's beaten: back to the game picker, with a way to share it.
    await expect(page.getByText('Choose a generation')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Share today' })).toBeVisible();
  } else {
    // Today's result now shows on the brief.
    await expect(page.getByRole('region', { name: 'Today’s result' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Try again · / })).toBeVisible();
  }
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
  await page
    .locator('header')
    .getByText(/^Turn /)
    .tap();
  await expect(page.getByRole('tooltip')).toBeHidden();
  await move.tap();
  await expect(page.locator('main')).toContainText(' used ');
});

test('a run after the day is won is practice, and never shows in the share', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Forfeit' }).click();
  const confirm = page.getByRole('dialog', { name: 'Forfeit this battle?' });
  await expect(confirm).toContainText('practice run');
  await confirm.getByRole('button', { name: 'Forfeit' }).click();
  const card = page.getByRole('dialog', { name: 'Battle over' });
  await expect(card).toContainText('Practice');
  await card.getByRole('button', { name: 'Share' }).click();
  await page
    .getByRole('dialog', { name: 'Share your result' })
    .getByRole('button', { name: 'Copy text' })
    .click();
  const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(copied).toContain('⭐ First try! 4/6 left');
  // Practice runs are never shared.
  expect(copied).not.toMatch(/practice|🔁/u);
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

    await page.getByRole('button', { name: 'Battle menu' }).click();
    await page.waitForTimeout(250);
    await noScroll(page, 'menu');
    await page.screenshot({ path: `${dir}/25-battle-menu.png` });
    await page.getByRole('button', { name: 'Forfeit' }).click();
    await page.getByRole('button', { name: 'Forfeit' }).last().click();
    await expect(page.getByRole('dialog', { name: 'Battle over' })).toBeVisible();
    await page.waitForTimeout(300);
    await noScroll(page, 'end');
    await page.screenshot({ path: `${dir}/26-battle-end.png` });
  });
}

test('a lost first try breaks the streak, and the result copies to share', async ({
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
    await page.getByRole('button', { name: 'Forfeit' }).click();
    await page.getByRole('button', { name: 'Forfeit' }).last().click();
    const card = page.getByRole('dialog', { name: 'Battle over' });
    await expect(card).toContainText('You gave up');
    await expect(card).toContainText(`Try ${i}`);
    await expect(card).toContainText('Streak reset');
    // There is no limit: it always offers another try until the day is won.
    await expect(card.getByRole('button', { name: 'Try again' })).toBeVisible();
    if (i === 3) {
      await page.waitForTimeout(300);
      await noScroll(page, 'end card, 3 tries');
      await page.screenshot({ path: `${dir}/28-end-tries.png` });
    }
    await card.getByRole('button', { name: 'Back to today' }).click();
  }

  const strip = page.getByRole('region', { name: 'Today’s result' });
  await expect(strip).toContainText('Not cleared yet · 3 tries');
  await expect(page.getByRole('button', { name: 'Stats. Streak 0' })).toBeVisible();
  // Still open, so the next run is a try, not practice, and the daily change stays.
  await expect(page.getByRole('button', { name: /^Try again · / })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Practice change' })).toHaveCount(0);
  // After three losses the team can still be changed (the streak is already gone).
  await page.getByRole('button', { name: 'Edit team' }).click();
  await expect(page.getByRole('button', { name: 'Swap' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pick a whole new team' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
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
  expect(lines.slice(0, 2)).toEqual([
    'Pokémon Daily · Gen 4 OU · Oct 21',
    'Not cleared yet · 3 tries',
  ]);
  for (const row of lines.slice(2, 5)) expect(row).toMatch(/^❌ ⬜+⬛*$/u); // given up: grey
  expect(copied).toContain('🔥 Streak reset');
  for (const s of schedule.days.find((d) => d.day === '2026-10-21')!.team) {
    if (!TEAM.some((t) => t.species === s.species)) expect(copied).not.toContain(s.species);
  }
});

test('a move draws its Showdown animation on the field, and a tap skips it', async ({ page }) => {
  await open(page, 'normal');
  await page.getByRole('button', { name: /^Start · / }).click();
  const fx = page.locator('.battle-field img[style*="position: absolute"]');
  await page.locator(MOVES).first().click({ timeout: 20_000 });
  // The effect images appear while the move plays…
  await expect(fx.first()).toBeAttached({ timeout: 5_000 });
  // …and tapping the field skips the turn and clears them.
  await page.locator('.battle-field').click({ position: { x: 5, y: 5 } });
  await expect(fx).toHaveCount(0);
  await expect(page.locator(MOVES).first()).toBeEnabled({ timeout: 10_000 });
});

test('with animations off, no effect images are drawn', async ({ page }) => {
  await page.addInitScript(
    (s) => localStorage.setItem('daily-battle:state', s),
    JSON.stringify({
      ...seededState('normal'),
      settings: { ...seededState('normal').settings, animations: false },
    }),
  );
  await page.clock.setFixedTime(TODAY);
  await page.goto('/#play');
  await page.getByRole('button', { name: /^Start · / }).click();
  const fx = page.locator('.battle-field img[style*="position: absolute"]');
  await page.locator(MOVES).first().click({ timeout: 20_000 });
  await page.waitForTimeout(1_500);
  await expect(fx).toHaveCount(0);
});

/** Loses the day's first try quickly, by giving up. */
async function loseFirstTry(page: Page) {
  await page.getByRole('button', { name: /^Start · / }).click();
  await waitForChoice(page);
  await page.getByRole('button', { name: 'Battle menu' }).click();
  await page.getByRole('button', { name: 'Forfeit' }).click();
  await page.getByRole('button', { name: 'Forfeit' }).last().click();
  return page.getByRole('dialog', { name: 'Battle over' });
}

/** Swaps team slot `n` for the first Pokémon on the bench, through the brief's edit mode. */
async function swapOne(page: Page, n: number) {
  await page.getByRole('button', { name: 'Swap' }).nth(n).click();
  await page
    .getByRole('button', { name: /^Bring in / })
    .first()
    .click();
  await page.getByRole('button', { name: 'Bring in' }).first().click();
  await page.getByRole('button', { name: 'Make change' }).click();
}

test('after a first-try loss the team changes freely and the changes stay', async ({ page }) => {
  await open(page, 'instant');
  const card = await loseFirstTry(page);
  await expect(card).toContainText('Streak reset');
  // The end card offers the team, already open for changes.
  await card.getByRole('button', { name: 'Change team' }).click();
  await expect(page.getByRole('button', { name: 'Swap' }).first()).toBeVisible();
  await noScroll(page, 'brief, editing after a loss');
  await swapOne(page, 0);
  // The daily change isn't spent: swap again right away.
  await expect(page.getByRole('button', { name: 'Edit team' })).toBeVisible();
  await expect(page.getByText('Change used')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit team' }).click();
  await swapOne(page, 1);
  await expect(page.getByRole('button', { name: /^Try again · / })).toBeVisible();
});

test('picking a whole new team goes back to the builder and ends the streak', async ({ page }) => {
  await open(page, 'instant');
  const card = await loseFirstTry(page);
  await card.getByRole('button', { name: 'Change team' }).click();
  await page.getByRole('button', { name: 'Pick a whole new team' }).click();
  await page.getByRole('button', { name: 'Pick new team' }).last().click();
  await expect(page.getByRole('button', { name: /^Pick \d more$/ })).toBeVisible();
});

test('a finished day offers the other games on the brief, the end card, and the share sheet', async ({
  page,
}) => {
  await open(page, 'instant', { '2026-10-21': { swapUsed: false, attempts: [tried('win', 4)] } });
  const row = page.getByRole('region', { name: 'Play another generation' });
  await expect(row.getByRole('button')).toHaveText([/Gen 3 OU/, /Gen 5 OU/, /Gen 6 OU/]);
  await expect(row.getByRole('button', { name: /Gen 5 OU. Not played/ })).toBeVisible();
  await noScroll(page, 'brief with the other games');

  // The end card of a practice run offers them too, and so does the share sheet.
  await page.getByRole('button', { name: 'Play again · practice' }).click();
  await waitForChoice(page);
  await page.getByRole('button', { name: 'Battle menu' }).click();
  await page.getByRole('button', { name: 'Forfeit' }).click();
  await page
    .getByRole('dialog', { name: 'Forfeit this battle?' })
    .getByRole('button', { name: 'Forfeit' })
    .click();
  const card = page.getByRole('dialog', { name: 'Battle over' });
  await expect(card.getByRole('region', { name: 'Play another generation' })).toBeVisible();
  await noScroll(page, 'end card with the other games');
  await card.getByRole('button', { name: 'Share' }).click();
  const share = page.getByRole('dialog', { name: 'Share your result' });
  await expect(share.getByRole('region', { name: 'Play another generation' })).toBeVisible();
  await noScroll(page, 'share sheet with the other games');

  // One tap starts the other game.
  await share.getByRole('button', { name: /Play Gen 5 OU/ }).click();
  await expect(page.getByRole('button', { name: /^Gen 5 · / })).toBeVisible();
});

test('each stat bar shows its Pokémon’s types', async ({ page }) => {
  await open(page, 'instant');
  await page.getByRole('button', { name: /^Start · / }).click();
  await waitForChoice(page);
  const types = async (i: number) =>
    page
      .locator('.statbar')
      .nth(i)
      .locator('[title]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('title')));
  // The foe's bar comes first, then yours.
  expect((await types(0)).length).toBeGreaterThan(0);
  expect(await types(1)).toEqual(
    speciesFile.species[TEAM[0]!.species as keyof typeof speciesFile.species]!.types,
  );
});

test('the battle text flows from the newest line back through earlier turns', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) >= 900, 'wide screens have the log column instead');
  await open(page, 'instant');
  await page.getByRole('button', { name: /^Start · / }).click();
  const box = page.getByRole('log', { name: 'Battle log' });
  const view = () =>
    box.evaluate((el) => ({
      turns: el.querySelectorAll('[data-kind="turn"]').length,
      top: el.scrollTop,
      overflow: el.scrollHeight - el.clientHeight,
      fromEnd: el.scrollHeight - el.scrollTop - el.clientHeight,
    }));
  // Play until there's more than the box holds.
  for (let i = 0; i < 12; i++) {
    if ((await act(page)) === 'end') return;
    if ((await waitForChoice(page)) === 'end') return;
    if ((await view()).overflow > 40) break;
  }
  await expect(page.getByRole('button', { name: 'Open the battle log' })).toHaveCount(0);
  const now = await view();
  expect(now.turns).toBeGreaterThan(1);
  // It rests on the newest line, and the arrow goes back through earlier turns.
  expect(now.fromEnd).toBeLessThan(24);
  const up = page.getByRole('button', { name: 'Earlier turns' });
  await expect(up).toBeVisible();
  const latest = page.getByRole('button', { name: 'Back to the latest' });
  await expect(latest).toHaveCount(0);
  await up.click();
  await expect.poll(async () => (await view()).top).toBeLessThan(now.top);
  // Scrolled back, a Latest cue returns to the newest line in one tap.
  await expect(latest).toBeVisible();
  await latest.click();
  await expect.poll(async () => (await view()).fromEnd).toBeLessThan(24);
  await expect(latest).toHaveCount(0);
  // A new turn keeps following the newest line.
  if ((await act(page)) === 'end') return;
  await waitForChoice(page);
  await expect.poll(async () => (await view()).fromEnd).toBeLessThan(24);
});

test('the switch row starts with your Pokémon in battle, which shows its details but can’t be switched to', async ({
  page,
}) => {
  await open(page, 'instant');
  await page.getByRole('button', { name: /^Start · / }).click();
  await page.locator(MOVES).first().waitFor();
  const row = page.getByRole('group', { name: 'Switch' });
  const tiles = row.getByRole('button');
  await expect(tiles).toHaveCount(6);
  // First, marked as the one in battle, and the lead you picked.
  const current = tiles.first();
  await expect(current).toHaveAttribute('aria-current', 'true');
  await expect(current).toHaveAccessibleName(new RegExp(`^${TEAM[0]!.species}, in battle`));
  // The rest are the ones to switch to.
  await expect(tiles.nth(1)).toHaveAccessibleName(/^Switch to /);
  // A tap shows its details, with no Switch button (it is aria-disabled, like a fainted
  // Pokémon's tile, which Playwright won't click without force).
  await current.click({ force: true });
  const card = page.getByRole('tooltip');
  await expect(card).toContainText(TEAM[0]!.species);
  await expect(page.getByRole('button', { name: /^(Switch to|Send in) / })).toHaveCount(5);
  // The turn goes on as before: nothing was switched.
  await expect(page.locator(MOVES).first()).toBeVisible();
});

test('on a computer, 1–4 pick a move from the keyboard', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard play is for computers');
  await open(page, 'instant');
  await page.getByRole('button', { name: /^Start · / }).click();
  test.skip((await waitForChoice(page)) !== 'moves', 'no move turn');
  await page.keyboard.press('1');
  await expect(page.locator('main')).toContainText(' used ');
});
