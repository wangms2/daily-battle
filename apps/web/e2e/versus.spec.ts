// Versus rooms (DESIGN.md §18) against the real room server (`wrangler dev`):
// two friends in two browsers create and join a room, see each other, and
// see the host's settings; a reload keeps your seat; leaving and removal work.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Page } from '@playwright/test';

// Playwright requires object destructuring for the fixtures argument.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => {
  test.skip(
    !['phone-390x844', 'desktop-1280x800'].includes(info.project.name),
    'one phone and the desktop cover the layouts',
  );
});

const players = (page: Page) => page.getByRole('list', { name: 'Players' }).getByRole('listitem');

/** A second player in their own browser. */
async function friend(browser: Browser, baseURL: string | undefined) {
  const context = await browser.newContext({ baseURL });
  return context.newPage();
}

/** Battle settings for both players: instant playback, no hints, past the welcome. */
async function quick(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('daily-battle:state')) return;
    localStorage.setItem(
      'daily-battle:state',
      JSON.stringify({
        version: 4,
        games: { gen4ou: { weeks: {}, days: {} }, gen5ou: { weeks: {}, days: {} } },
        settings: {
          beginnerHints: false,
          battleSpeed: 'instant',
          animations: false,
          shownExplainers: ['welcome', 'gen5-news'],
          format: 'gen4ou',
        },
      }),
    );
  });
}

const MOVES = 'main button[aria-label*=" PP"]:enabled';
const SWITCHES = 'main button[aria-label^="Switch to"]:not([aria-disabled="true"])';

/** One step of a live battle: make a choice if there's one to make. Returns true once it's over. */
async function step(page: Page): Promise<boolean> {
  const state = await page.evaluate(
    ([moves, switches]) => {
      if (document.querySelector('[role="dialog"][aria-label="Battle over"]')) return 'end';
      if (document.querySelector(moves!)) return 'moves';
      if (
        document.querySelector(switches!) &&
        /Who comes in\?|Send in your last Pokémon/.test(document.body.textContent ?? '')
      ) {
        return 'switch';
      }
      return 'wait';
    },
    [MOVES, SWITCHES],
  );
  if (state === 'end') return true;
  if (state !== 'wait') {
    await page
      .locator(state === 'moves' ? MOVES : SWITCHES)
      .first()
      .click({ timeout: 2_000 })
      .catch(() => {});
  }
  return false;
}

/** No WCAG 2.1 A/AA violations on the page as it is. */
async function axe(p: Page) {
  const { violations } = await new AxeBuilder({ page: p })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`)).toEqual([]);
}

async function createRoom(page: Page, name: string): Promise<string> {
  await page.goto('/#versus');
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create a room' }).click();
  const code = (await page.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z]{5}$/);
  return code;
}

async function joinRoom(page: Page, code: string, name: string) {
  await page.goto(`/#versus/${code}`);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.getByTestId('room-code')).toHaveText(code);
}

test('friends join a room, see each other, and see the host’s rules', async ({
  page,
  browser,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const code = await createRoom(page, 'Ash');
  await expect(players(page)).toHaveCount(1);
  await expect(players(page).first()).toContainText('Ash (you)');
  await expect(players(page).first()).toContainText('Host');

  const misty = await friend(browser, baseURL);
  await joinRoom(misty, code, 'Misty');
  for (const p of [page, misty]) {
    await expect(players(p)).toHaveCount(2);
    await expect(players(p).nth(1)).toContainText('Misty');
  }

  // The host changes the rules; everyone sees them. Only the host has the controls.
  await page.getByRole('button', { name: '3', exact: true }).click();
  await page.getByRole('button', { name: 'Gen 5 OU' }).click();
  await page.getByRole('combobox', { name: 'Misty’s team size' }).selectOption('4');
  await expect(misty.getByText('Gen 5 OU')).toBeVisible();
  await expect(misty.getByText('Lives').locator('..')).toContainText('3');
  await expect(players(misty).nth(1)).toContainText('4 Pokémon');
  await expect(misty.getByRole('button', { name: 'Gen 4 OU' })).toHaveCount(0);
  await expect(misty.getByText('Waiting for the host')).toBeVisible();

  // A reload keeps your seat: no name to type, the same player.
  await misty.reload();
  await expect(misty.getByTestId('room-code')).toHaveText(code);
  await expect(players(misty)).toHaveCount(2);
  await expect(players(page)).toHaveCount(2);

  // Leaving takes you out of everyone's list.
  await misty.getByRole('button', { name: 'Leave room' }).click();
  await misty.getByRole('dialog').getByRole('button', { name: 'Leave' }).click();
  await expect(misty.getByRole('button', { name: 'Create a room' })).toBeVisible();
  await expect(players(page)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('the host can remove a player, and names are unique', async ({ page, browser, baseURL }) => {
  const code = await createRoom(page, 'Brock');
  const other = await friend(browser, baseURL);
  await other.goto(`/#versus/${code}`);
  await other.getByLabel('Your name').fill('brock');
  await other.getByRole('button', { name: 'Join room' }).click();
  await expect(other.getByText('Someone in the room already has that name.')).toBeVisible();
  await other.getByLabel('Your name').fill('Gary');
  await other.getByRole('button', { name: 'Join room' }).click();
  await expect(players(page)).toHaveCount(2);

  await page.getByRole('button', { name: 'Remove Gary' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click();
  await expect(other.getByText('The host removed you from the room.')).toBeVisible();
  await expect(players(page)).toHaveCount(1);
});

test('a code for no room says so', async ({ page }) => {
  await page.goto('/#versus/ZZZZZ');
  await expect(page.getByText('That room doesn’t exist, or it has closed.')).toBeVisible();
});

test('the versus screens pass axe, light and dark', async ({ page, browser, baseURL }) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/#versus');
    await axe(page);
    const code = await createRoom(page, `Host ${colorScheme}`);
    const guest = await (await browser.newContext({ baseURL, colorScheme })).newPage();
    await guest.goto(`/#versus/${code}`);
    await guest.getByLabel('Your name').waitFor();
    await axe(guest);
    await guest.getByLabel('Your name').fill('Guest');
    await guest.getByRole('button', { name: 'Join room' }).click();
    await expect(players(page)).toHaveCount(2);
    await axe(page);
    await axe(guest);
  }
});

/** Builds a team of `size` in the builder: the first Pokémon offered each time, its most used set. */
async function build(page: Page, size: number) {
  const wide = page.viewportSize()!.width >= 900;
  await expect(page.getByRole('button', { name: `Pick ${size} more` })).toBeVisible();
  for (let i = 0; i < size; i++) {
    await page
      .getByRole('button', { name: /^Add .* to team$/ })
      .first()
      .click();
    if (!wide) {
      await page
        .getByRole('dialog', { name: /pick a set/ })
        .getByRole('button', { name: /^Add / })
        .click();
    }
  }
  await page.getByRole('button', { name: 'Lock in team' }).click();
  await page.getByRole('button', { name: 'Lock in', exact: true }).click();
}

/**
 * One step of a game for a player: back to the room after a battle, ready up
 * before one, or a choice in one. Returns true once the game is over.
 */
async function tick(page: Page): Promise<boolean> {
  if (await page.getByRole('heading', { name: 'Game over' }).isVisible()) return true;
  const back = page.getByRole('button', { name: 'Back to the room' });
  if (await back.isVisible()) {
    await back.click({ timeout: 2_000 }).catch(() => {});
    return false;
  }
  const ready = page.getByRole('button', { name: /^Ready with / });
  if ((await ready.isVisible()) && (await ready.isEnabled())) {
    await ready.click({ timeout: 2_000 }).catch(() => {});
    return false;
  }
  await step(page);
  return false;
}

test('a room of three builds teams and plays to a winner', async ({ page, browser, baseURL }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  const red = page;
  await quick(red);
  const code = await createRoom(red, 'Red');
  const blue = await friend(browser, baseURL);
  const green = await friend(browser, baseURL);
  const all = [red, blue, green];
  for (const p of [blue, green]) await quick(p);
  for (const p of all) p.on('pageerror', (e) => errors.push(String(e)));
  await joinRoom(blue, code, 'Blue');
  await joinRoom(green, code, 'Green');
  // One life each and three Pokémon keep the game short.
  await red.getByRole('button', { name: '1', exact: true }).click();
  for (const name of ['Red', 'Blue', 'Green']) {
    await red.getByRole('combobox', { name: `${name}’s team size` }).selectOption('3');
  }
  await expect(red.getByRole('list', { name: 'The pool' }).getByRole('listitem')).toHaveCount(12);
  await red.getByRole('button', { name: 'Start the game' }).click();

  // Everyone builds three from the pool; the first round starts when all are in.
  for (const p of all) await build(p, 3);

  // Round 1: three players, so one faces the AI. Blue makes a change first.
  for (const p of all)
    await expect(p.getByRole('heading', { name: /^Round 1 · vs / })).toBeVisible();
  let vsAi = 0;
  for (const p of all) {
    if (await p.getByRole('heading', { name: 'Round 1 · vs Rival (AI)' }).isVisible()) vsAi++;
  }
  expect(vsAi).toBe(1);
  await axe(blue);
  await blue
    .getByRole('button', { name: /^Change / })
    .first()
    .click();
  await blue
    .getByRole('button', { name: /^Swap in / })
    .first()
    .click();
  await blue.getByRole('dialog').getByRole('button', { name: 'Swap in', exact: true }).click();
  await expect(blue.getByText('New', { exact: true })).toBeVisible();

  // Play every battle out, round after round, until the game ends.
  const done = [false, false, false];
  for (let i = 0; i < 3000 && done.some((d) => !d); i++) {
    for (const [j, p] of all.entries()) if (!done[j]) done[j] = await tick(p);
  }
  for (const p of all) {
    await expect(p.getByRole('heading', { name: 'Game over' })).toBeVisible();
    await expect(p.getByRole('list', { name: 'Standings' })).toBeVisible();
  }
  const headline = (await red.getByRole('status').first().textContent())!;
  expect(headline).toMatch(/You win!|(Blue|Green) wins|share the win/);
  await axe(red);

  // The host plays again: back to the lobby with everyone, lives reset.
  await red.getByRole('button', { name: 'Play again' }).click();
  for (const p of all) await expect(p.getByRole('heading', { name: /^Room / })).toBeVisible();
  await expect(players(blue)).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('a player who gives up mid-battle loses it, and a reload resumes', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  await quick(page);
  const code = await createRoom(page, 'Gold');
  const silver = await friend(browser, baseURL);
  await quick(silver);
  await joinRoom(silver, code, 'Silver');
  for (const name of ['Gold', 'Silver']) {
    await page.getByRole('combobox', { name: `${name}’s team size` }).selectOption('3');
  }
  await page.getByRole('button', { name: 'Start the game' }).click();
  for (const p of [page, silver]) await build(p, 3);
  for (const p of [page, silver]) await p.getByRole('button', { name: /^Ready with / }).click();
  await expect(silver.getByRole('timer')).toBeVisible({ timeout: 20_000 });
  // A reload mid-battle comes back to the same battle.
  await silver.reload();
  await expect(silver.locator(MOVES).first()).toBeVisible({ timeout: 20_000 });
  // Silver gives up: Gold wins the battle, and Silver loses a life.
  await silver.getByRole('button', { name: 'Battle menu' }).click();
  await silver.getByRole('button', { name: 'Give up' }).click();
  await silver.getByRole('dialog').getByRole('button', { name: 'Give up' }).click();
  await expect(page.getByRole('dialog', { name: 'Battle over' })).toContainText('You won');
  await expect(page.getByRole('dialog', { name: 'Battle over' })).toContainText('Silver gave up.');
  await page.getByRole('button', { name: 'Back to the room' }).click();
  await expect(page.getByRole('heading', { name: 'Round 1 results' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Results' })).toContainText('Gold beat Silver');
  await expect(page.getByRole('list', { name: 'Standings' })).toContainText('Silver');
});
