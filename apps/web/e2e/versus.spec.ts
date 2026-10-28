// Versus rooms (DESIGN.md §18) against the real room server (`wrangler dev`):
// two friends in two browsers create and join a room, see each other, and
// see the host's settings; a reload keeps your seat; leaving and removal work.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { E2E_ADMIN_TOKEN } from '../playwright.config';
import { meet } from './name';

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
  const page = await context.newPage();
  await pastHowTo(page);
  return page;
}

/** The host changes the room's rules: on the page (wide screens), or in the Rules sheet. */
async function rules(page: Page, change: (rules: Locator) => Promise<unknown>) {
  const region = page.getByRole('region', { name: 'Rules' });
  const edit = region.getByRole('button', { name: 'Edit' });
  if (!(await edit.isVisible())) return change(region);
  await edit.click();
  const sheet = page.getByRole('dialog', { name: 'Rules' });
  await change(sheet);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
}

/** Sets a player's handicap with their row's − and +. */
async function teamSize(page: Page, name: string, size: number) {
  const group = page.getByRole('group', { name: /team size: \d Pokémon$/ }).filter({
    has: page.getByRole('button', { name: `Fewer Pokémon for ${name}` }),
  });
  for (let i = 0; i < 4; i++) {
    const now = Number((await group.getAttribute('aria-label'))!.match(/(\d) Pokémon$/)![1]);
    if (now === size) return;
    await group.getByRole('button', { name: now > size ? /^Fewer/ : /^More/ }).click();
    await expect(group).toHaveAttribute(
      'aria-label',
      new RegExp(`${now > size ? now - 1 : now + 1} Pokémon$`),
    );
  }
}

/** Past the first-visit How Link Battle works sheet (tested on its own below). */
async function pastHowTo(page: Page) {
  await page.addInitScript(() => {
    const key = 'daily-battle:state';
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null') ?? { version: 4, games: {} };
    const seen: string[] = saved.settings?.shownExplainers ?? [];
    if (seen.includes('versus-howto')) return;
    saved.settings = { ...saved.settings, shownExplainers: [...seen, 'versus-howto'] };
    localStorage.setItem(key, JSON.stringify(saved));
  });
}

test.beforeEach(async ({ page }) => pastHowTo(page));

/** Battle settings for both players: instant playback, no hints, past the welcome. */
async function quick(page: Page) {
  await page.addInitScript(() => {
    const key = 'daily-battle:state';
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    // Once per test: a reload keeps what the test has played since.
    if (saved?.settings?.battleSpeed === 'instant') return;
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 4,
        games: { gen4ou: { weeks: {}, days: {} }, gen5ou: { weeks: {}, days: {} } },
        settings: {
          beginnerHints: false,
          battleSpeed: 'instant',
          animations: false,
          shownExplainers: [
            'welcome',
            'gen5-news',
            'gen6-news',
            'gen3-news',
            'tour',
            'versus-howto',
          ],
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
  // Let entrances finish: axe reads colours mid-fade as low contrast.
  await p.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
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
  await rules(page, async (sheet) => {
    await sheet.getByRole('button', { name: '3', exact: true }).click();
    await sheet.getByRole('button', { name: 'Gen 5 OU' }).click();
  });
  await teamSize(page, 'Misty', 4);
  await expect(misty.getByRole('region', { name: 'Rules' })).toContainText('Gen 5 OU');
  await expect(misty.getByRole('region', { name: 'Rules' })).toContainText('3');
  await expect(misty.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  // Misty sees the size the host gave her, on her own stepper.
  await expect(misty.getByRole('group', { name: 'Misty’s team size: 4 Pokémon' })).toBeVisible();
  await expect(misty.getByRole('button', { name: 'Gen 4 OU' })).toHaveCount(0);
  await expect(misty.getByText('Waiting for the host')).toBeVisible();
  // A guest sets their own handicap, and only their own.
  await expect(misty.getByRole('button', { name: 'Fewer Pokémon for Ash' })).toHaveCount(0);
  await expect(misty.getByRole('group', { name: 'Ash’s team size: 6 Pokémon' })).toBeVisible();
  await teamSize(misty, 'Misty', 5);
  await expect(page.getByRole('group', { name: 'Misty’s team size: 5 Pokémon' })).toBeVisible();

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

test('the first screen opens versus rooms', async ({ page }) => {
  await quick(page);
  await page.goto('/');
  // A new player names themselves first: the name they play under in rooms.
  await meet(page);
  await page.getByRole('button', { name: 'With friends' }).click();
  await expect(page.getByRole('button', { name: 'Create a room' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /name/i }).first()).not.toHaveValue('');
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
    await pastHowTo(guest);
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
  // The button can go (the phase ends) between the two checks, and an unbounded
  // isEnabled() would then wait on it until the test times out, so a player
  // would miss their turns and lose on the clock.
  if ((await ready.isVisible()) && (await ready.isEnabled({ timeout: 1_000 }).catch(() => false))) {
    await ready.click({ timeout: 2_000 }).catch(() => {});
    return false;
  }
  await step(page);
  return false;
}

/** Rejects, naming the call, if it takes longer than 20 s. */
function hung<T>(label: string, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} hung for 20s`)), 20_000);
  });
  return Promise.race([work, late]).finally(() => clearTimeout(timer));
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
  await rules(red, (sheet) => sheet.getByRole('button', { name: '1', exact: true }).click());
  for (const name of ['Red', 'Blue', 'Green']) {
    await teamSize(red, name, 3);
  }
  // Each player has their own 12.
  const twelve = (p: Page) =>
    p
      .getByRole('list', { name: 'Your pool' })
      .getByRole('img')
      .evaluateAll((els) => els.map((e) => e.getAttribute('alt')));
  await expect(red.getByRole('list', { name: 'Your pool' }).getByRole('img')).toHaveCount(12);
  await expect(blue.getByRole('list', { name: 'Your pool' }).getByRole('img')).toHaveCount(12);
  expect(await twelve(red)).not.toEqual(await twelve(blue));
  await red.getByRole('button', { name: 'Start the game' }).click();

  // Everyone builds three from their 12; the first round starts when all are in.
  for (const p of all) await build(p, 3);

  // Round 1: three players, so one faces the AI. Blue makes a change first.
  for (const p of all)
    await expect(p.getByRole('heading', { name: /^Round 1 · vs / })).toBeVisible();
  let vsAi = 0;
  for (const p of all) {
    if (await p.getByRole('heading', { name: 'Round 1 · vs Rival (AI)' }).isVisible()) vsAi++;
    // Facing a player, you see the 12 their change can come from.
    else
      await expect(p.getByRole('list', { name: /’s 12$/ }).getByRole('listitem')).toHaveCount(12);
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
    for (const [j, p] of all.entries()) if (!done[j]) done[j] = await hung(`Player ${j}`, tick(p));
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

  // The admin page has the game: its three players and its battles.
  const admin = await browser.newPage({ baseURL });
  await admin.goto('/#admin');
  await admin.getByLabel('Password').fill(E2E_ADMIN_TOKEN);
  await admin.getByRole('button', { name: 'Open' }).click();
  await expect(admin.getByText('Versus games', { exact: true })).toBeVisible();
  await admin.getByRole('button', { name: 'games' }).click();
  await admin.getByRole('row').filter({ hasText: code }).click();
  const detail = admin.getByLabel('Game detail');
  for (const name of ['Red', 'Blue', 'Green']) {
    await expect(detail.getByRole('cell', { name, exact: true }).first()).toBeVisible();
  }
  await expect(detail.getByRole('cell', { name: /vs Rival \(AI\)$/ }).first()).toBeVisible();
  await admin.close();
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
    await teamSize(page, name, 3);
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
  await silver.getByRole('button', { name: 'Forfeit' }).click();
  await silver.getByRole('dialog').getByRole('button', { name: 'Forfeit' }).click();
  await expect(page.getByRole('dialog', { name: 'Battle over' })).toContainText('You won');
  await expect(page.getByRole('dialog', { name: 'Battle over' })).toContainText('Silver gave up.');
  await page.getByRole('button', { name: 'Back to the room' }).click();
  await expect(page.getByRole('heading', { name: 'Round 1 results' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Results' })).toContainText('Gold beat Silver');
  // The break moves on to the standings by itself.
  await expect(page.getByRole('list', { name: 'Standings' })).toContainText('Silver');
});

/** Gives up the battle on screen and goes back to the room. */
async function giveUp(page: Page) {
  await page.getByRole('button', { name: 'Battle menu' }).click();
  await page.getByRole('button', { name: 'Forfeit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Forfeit' }).click();
  await page.getByRole('button', { name: 'Back to the room' }).click();
}

test('late joiners and players who are out watch the battles; players still in see only balls', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  const names = ['Ash', 'Brock', 'Misty', 'Gary'];
  await quick(page);
  const code = await createRoom(page, 'Ash');
  const pages: Record<string, Page> = { Ash: page };
  for (const name of names.slice(1)) {
    pages[name] = await friend(browser, baseURL);
    await quick(pages[name]);
    await joinRoom(pages[name], code, name);
  }
  for (const p of Object.values(pages)) p.on('pageerror', (e) => errors.push(String(e)));
  await rules(page, (sheet) => sheet.getByRole('button', { name: '1', exact: true }).click());
  for (const name of names) {
    await teamSize(page, name, 3);
  }
  await page.getByRole('button', { name: 'Start the game' }).click();
  for (const name of names) await build(pages[name]!, 3);

  // Who faces whom in round 1.
  const foeOf: Record<string, string> = {};
  for (const name of names) {
    const heading = pages[name]!.getByRole('heading', { name: /^Round 1 · vs / });
    await expect(heading).toBeVisible();
    foeOf[name] = (await heading.textContent())!.replace(/^Round 1 · vs /, '');
  }
  const pairs = names
    .filter((n) => names.indexOf(n) < names.indexOf(foeOf[n]!))
    .map((n) => [n, foeOf[n]!] as const);
  expect(pairs).toHaveLength(2);

  // Oak joins after the start: a spectator, watching both battles.
  const oak = await friend(browser, baseURL);
  await quick(oak);
  oak.on('pageerror', (e) => errors.push(String(e)));
  await oak.goto(`/#versus/${code}`);
  await oak.getByLabel('Your name').fill('Oak');
  await oak.getByRole('button', { name: 'Join room' }).click();
  await expect(oak.getByText('You’re watching. You’ll play in the next game.')).toBeVisible();
  for (const name of names)
    await pages[name]!.getByRole('button', { name: /^Ready with / }).click();
  const cards = oak.locator('section[aria-label*=" vs "]');
  await expect(cards).toHaveCount(2);
  await expect(oak.getByText('Getting ready…')).toHaveCount(0, { timeout: 20_000 });
  await expect(cards.first().getByRole('log')).not.toContainText('The battle is starting…');
  await axe(oak);

  // Oak reacts to a battle; its players see it float up.
  const watched = (await cards.first().getAttribute('aria-label'))!.split(' vs ');
  // Reactions float over what's on screen, so wait for the players' battle screens.
  for (const name of watched) await expect(pages[name]!.locator(MOVES).first()).toBeVisible();
  await cards.first().getByRole('button', { name: 'React 🔥' }).click();
  // Both at once: a reaction floats by in a couple of seconds.
  await Promise.all(
    watched.map((name) => expect(pages[name]!.getByText('Oak', { exact: true })).toBeVisible()),
  );

  // A player still in sees the room as balls only, and can't watch.
  await page.getByRole('button', { name: /Room$/ }).click();
  const drawer = page.getByRole('dialog', { name: `Room ${code}` });
  await expect(drawer.getByRole('list', { name: 'Battles' }).getByRole('listitem')).toHaveCount(2);
  await expect(drawer.getByRole('img', { name: /’s team: \d of 3 left/ })).toHaveCount(4);
  await expect(drawer.locator('img:not([src="/fx/pokeball.png"])')).toHaveCount(0);
  await expect(drawer.getByRole('button', { name: /^Watch / })).toHaveCount(0);
  await expect(drawer).toContainText('Players still in can’t watch other battles');
  await expect(drawer).toContainText('Watching: Oak');
  await axe(page);
  await page.keyboard.press('Escape');

  // The second of each pair gives up and is out (one life).
  for (const [winner, loser] of pairs) {
    await giveUp(pages[loser]!);
    await pages[winner]!.getByRole('button', { name: 'Back to the room' }).click();
  }
  const [out] = pairs.map(([, loser]) => pages[loser]!);
  await expect(out!.getByText('You’re out')).toBeVisible();
  await expect(out!.getByRole('region', { name: 'Results' })).toBeVisible();
  await axe(out!);

  // Round 2: the two winners. Those out watch it, and can open it from the drawer.
  const [a, b] = pairs.map(([winner]) => winner);
  for (const name of [a!, b!]) {
    await pages[name]!.getByRole('button', { name: /^Ready with / }).click({ timeout: 20_000 });
  }
  await expect(out!.getByText(/^You’re out \(/)).toBeVisible();
  await expect(out!.locator('section[aria-label*=" vs "]')).toHaveCount(1);
  await out!.getByRole('button', { name: /Room$/ }).click();
  await expect(
    out!
      .getByRole('dialog')
      .getByRole('button', { name: new RegExp(`^Watch (${a} vs ${b}|${b} vs ${a})$`) }),
  ).toBeVisible();
  await out!.keyboard.press('Escape');

  // The game ends; Oak takes a seat in the next one.
  await giveUp(pages[b!]!);
  await pages[a!]!.getByRole('button', { name: 'Back to the room' }).click();
  for (const p of [page, oak])
    await expect(p.getByRole('heading', { name: 'Game over' })).toBeVisible();
  await expect(oak.getByRole('group', { name: 'Podium' })).toContainText(a!);
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(players(oak)).toHaveCount(5);
  expect(errors).toEqual([]);
});

test('the first visit explains Link Battle once, and How it works brings it back', async ({
  browser,
  baseURL,
}) => {
  const page = await (await browser.newContext({ baseURL })).newPage();
  await page.goto('/#versus');
  const sheet = page.getByRole('dialog', { name: 'How Link Battle works' });
  await expect(sheet).toContainText('Last one standing wins');
  await expect(sheet).toContainText('Handicaps');
  await sheet.getByRole('button', { name: 'Got it' }).click();
  await expect(sheet).toBeHidden();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Create a room' })).toBeVisible();
  await expect(sheet).toBeHidden();
  await page.getByRole('button', { name: 'How it works' }).click();
  await expect(sheet).toBeVisible();
});
