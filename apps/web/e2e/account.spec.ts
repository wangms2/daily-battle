// Protecting a name with a password and signing in to it on another device
// (DESIGN.md §10), through the real account server (wrangler dev).
import { expect, test, type Page } from '@playwright/test';
import schedule from '../public/schedule/2026-10-19.json' with { type: 'json' };

const TODAY = new Date('2026-10-21T10:00:00-04:00');
const TEAM = schedule.suggestedTeams[0]!.team;
const win = (ts: number) => ({
  result: 'win',
  remaining: 3,
  ts,
  lead: TEAM[0]!.species,
  team: TEAM,
  battleSeed: `s${ts}`,
  aiSeed: '5,6,7,8',
  choices: [],
  engine: '',
});

/** A Gen 4 player on a 3-day first-try streak, named `name`. */
function player(name: string) {
  return {
    version: 4,
    games: {
      gen4ou: {
        weeks: {
          '2026-10-19': {
            team: TEAM,
            poolId: `${schedule.week}:g${schedule.generatorVersion}:c${schedule.pool.candidate}`,
          },
        },
        days: Object.fromEntries(
          ['2026-10-19', '2026-10-20', '2026-10-21'].map((d, i) => [
            d,
            { swapUsed: false, attempts: [win(i + 1)] },
          ]),
        ),
      },
    },
    settings: {
      name,
      beginnerHints: true,
      battleSpeed: 'normal',
      animations: true,
      sound: false,
      musicVolume: 0.35,
      effectsVolume: 0.4,
      shownExplainers: ['welcome', 'gen5-news', 'gen6-news', 'gen3-news', 'tour'],
    },
  };
}

async function openTrainer(page: Page) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: /^Trainer/ }).click();
}

test('a protected name brings its streak to another device, and a wrong password doesn’t', async ({
  browser,
  baseURL,
  page,
}, info) => {
  test.skip(info.project.name !== 'phone-375x667', 'one size covers it');
  // Saved accounts persist between runs: a new name each time.
  const name = `Ash${Date.now() % 1_000_000}`;
  await page.clock.setFixedTime(TODAY);
  await page.addInitScript(
    (s) => {
      if (!localStorage.getItem('daily-battle:state'))
        localStorage.setItem('daily-battle:state', s);
    },
    JSON.stringify(player(name)),
  );
  await page.goto('/');
  await openTrainer(page);
  await page.getByRole('button', { name: /Protect with a password/ }).click();
  await page.getByLabel('Password').fill('pikachu');
  await page.getByRole('button', { name: 'Protect', exact: true }).click();
  await expect(page.getByText(/^Protected ·/)).toBeVisible();

  // Someone else can't protect the same name.
  const rival = await (await browser.newContext({ baseURL })).newPage();
  await rival.addInitScript(
    (s) => {
      if (!localStorage.getItem('daily-battle:state'))
        localStorage.setItem('daily-battle:state', s);
    },
    JSON.stringify(player(name.toLowerCase())),
  );
  await rival.goto('/');
  await openTrainer(rival);
  await rival.getByRole('button', { name: /Protect with a password/ }).click();
  await rival.getByLabel('Password').fill('another');
  await rival.getByRole('button', { name: 'Protect', exact: true }).click();
  await expect(rival.getByRole('alert')).toHaveText(/already protected/);

  // A new device: first Play asks the name; sign in instead.
  const phone = await (await browser.newContext({ baseURL })).newPage();
  await phone.clock.setFixedTime(TODAY);
  await phone.goto('/');
  await phone.getByRole('button', { name: 'Play', exact: true }).click();
  await phone.getByRole('button', { name: /Sign in/ }).click();
  await phone.getByLabel('Your name').fill(name);
  await phone.getByLabel('Password').fill('wrong!');
  await phone.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(phone.getByRole('alert')).toHaveText(/don’t match/);
  await phone.getByLabel('Password').fill('pikachu');
  await phone.getByRole('button', { name: 'Sign in', exact: true }).click();
  // On to the games, with the streak from the first device.
  await expect(phone.getByText('Choose a generation')).toBeVisible();
  await expect(phone.getByRole('button', { name: /^Gen 4.*Streak 3/ })).toBeVisible();
});
