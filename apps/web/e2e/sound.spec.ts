// Sound (DESIGN.md §21): on for new players at a gentle volume, and with nothing
// downloaded when it is off; a Sound switch
// and separate music and effects sliders in Settings, kept across reloads; and
// with sound on, a battle loads its generation's track and the cries of the
// Pokémon sent out.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import schedule from '../public/schedule/gen3ou/2026-10-19.json' with { type: 'json' };

// Playwright requires object destructuring for the fixtures argument.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => {
  test.skip(
    !['phone-360x640', 'phone-390x844', 'desktop-1280x800'].includes(info.project.name),
    'the smallest phone, a common one, and the desktop cover the layouts',
  );
});

const TODAY = new Date('2026-10-21T10:00:00-04:00');
const MOVES = 'main button[aria-label*=" PP"]:enabled';
const poolId = `${schedule.week}:g${schedule.generatorVersion}:c${schedule.pool.candidate}`;
const TEAM = schedule.suggestedTeams[0]!.team;
const LEAD = TEAM[0]!.species;
const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** A Gen 3 save with this week's team locked; `fast` so turns play out (instant skips cries). */
function state(sound?: object) {
  return {
    version: 4,
    games: {
      gen3ou: { weeks: { [schedule.week]: { team: TEAM, poolId } }, days: {} },
      gen4ou: { weeks: {}, days: {} },
      gen5ou: { weeks: {}, days: {} },
      gen6ou: { weeks: {}, days: {} },
    },
    settings: {
      beginnerHints: false,
      battleSpeed: 'fast',
      animations: false,
      shownExplainers: ['welcome', 'tour'],
      format: 'gen3ou',
      sound: false,
      ...sound,
    },
  };
}

/** Opens the app with a save, recording every audio file it requests. */
async function open(page: Page, saved: object) {
  const audio: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/audio/')) audio.push(new URL(r.url()).pathname);
  });
  await page.addInitScript((s) => {
    if (!localStorage.getItem('daily-battle:state')) localStorage.setItem('daily-battle:state', s);
  }, JSON.stringify(saved));
  await page.clock.setFixedTime(TODAY);
  await page.goto('/#play');
  return audio;
}

/** Starts the battle and plays a turn. */
async function battle(page: Page) {
  await page.getByRole('button', { name: `Start · ${LEAD} leads` }).click();
  await page.locator(MOVES).first().waitFor();
  await page.locator(MOVES).first().click();
  await page
    .locator(
      `${MOVES}, main button[aria-label^="Switch to"], [role="dialog"][aria-label="Battle over"]`,
    )
    .first()
    .waitFor();
}

test('with sound off, a battle loads no audio', async ({ page }) => {
  const audio = await open(page, state());
  await battle(page);
  await page.waitForTimeout(500);
  expect(audio).toEqual([]);
});

test('Settings has a Sound switch with separate music and effects sliders, kept on reload', async ({
  page,
}) => {
  await open(page, state());
  await page.getByRole('button', { name: 'Settings' }).click();
  const sheet = page.getByRole('dialog', { name: 'Settings' });
  const music = sheet.getByRole('slider', { name: 'Music volume' });
  const effects = sheet.getByRole('slider', { name: 'Effects volume' });
  await expect(music).toBeDisabled();
  await expect(effects).toBeDisabled();
  await sheet.getByRole('switch', { name: /Sound/ }).click();
  await expect(music).toBeEnabled();
  await music.fill('20');
  await effects.fill('80');
  await expect(music).toHaveAttribute('aria-valuetext', '20%');
  await expect(effects).toHaveAttribute('aria-valuetext', '80%');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `e2e/look/sound/${test.info().project.name}/settings.png` });
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  // Everything fits without scrolling, even on the smallest phone.
  const overflow = await sheet.evaluate((d) => d.scrollHeight - d.clientHeight);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(sheet.getByRole('switch', { name: /Sound/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(sheet.getByRole('slider', { name: 'Music volume' })).toHaveValue('20');
  await expect(sheet.getByRole('slider', { name: 'Effects volume' })).toHaveValue('80');
});

test('with sound on, a battle loads its generation track and the cries of who comes out', async ({
  page,
}) => {
  const audio = await open(page, state({ sound: true, musicVolume: 0.5, effectsVolume: 0.5 }));
  await battle(page);
  await expect.poll(() => audio).toContain('/audio/music/gen3.mp3');
  // Gen 3 uses the game-era cries.
  await expect.poll(() => audio).toContain(`/audio/cries/legacy/${toId(LEAD)}.mp3`);
  expect(audio.filter((a) => a.includes('/cries/latest/'))).toEqual([]);
});
