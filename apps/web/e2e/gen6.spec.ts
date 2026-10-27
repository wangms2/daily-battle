// Gen 6 OU as a third daily game: picking it on first run, a battle where your
// Pokémon Mega Evolves (and the battle resumes after a reload), the one-Mega
// rule in the team builder. (The news sheet is Gen 3's now: gen3.spec.ts.)
import { expect, test, type Page } from '@playwright/test';
import schedule from '../public/schedule/gen6ou/2026-10-19.json' with { type: 'json' };
import { meet } from './name';

const TODAY = new Date('2026-10-21T10:00:00-04:00');
const MOVES = 'main button[aria-label*=" PP"]:enabled';
const poolId = `${schedule.week}:g${schedule.generatorVersion}:c${schedule.pool.candidate}`;

/** This week's pool has two Mega species: Manectric (Mega only) and Gardevoir (Mega first). */
const MEGA = 'Manectric';
const SECOND_MEGA = 'Gardevoir';
/** Manectric's Mega set, with five pool Pokémon on sets without a stone. */
const TEAM = [
  { species: 'Manectric', setId: 'manectric-special-attacker' },
  { species: 'Dragonite', setId: 'dragonite-choice-band' },
  { species: 'Rotom-Wash', setId: 'rotomwash-physically-defensive-pivot' },
  { species: 'Heatran', setId: 'heatran-specially-defensive' },
  { species: 'Skarmory', setId: 'skarmory-physically-defensive' },
  { species: 'Suicune', setId: 'suicune-defensive-calm-mind' },
];

/** A v4 save on Gen 6, news seen, optionally with this week's team locked. */
function gen6State({ locked = true } = {}) {
  return {
    version: 4,
    games: {
      gen4ou: { weeks: {}, days: {} },
      gen5ou: { weeks: {}, days: {} },
      gen6ou: { weeks: locked ? { [schedule.week]: { team: TEAM, poolId } } : {}, days: {} },
    },
    settings: {
      beginnerHints: true,
      battleSpeed: 'instant',
      animations: true,
      shownExplainers: ['welcome', 'gen5-news', 'gen6-news', 'gen3-news', 'tour'],
      format: 'gen6ou',
    },
  };
}

async function open(page: Page, state?: object, path = '/#play') {
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
  page.screenshot({ path: `e2e/look/gen6/${project}/${name}.png` });

test('a first-time player picks Gen 6 and gets its pool', async ({ page }, info) => {
  await open(page, undefined, '/#daily');
  await page.getByRole('button', { name: /^Gen 6/ }).click();
  await meet(page);
  const welcome = page.getByRole('dialog', { name: 'Welcome to Pokémon Daily' });
  await noScroll(page, 'welcome sheet');
  await shot(page, '01-welcome', info.project.name);
  await welcome.getByRole('button', { name: 'Let’s play' }).click();
  await expect(page.getByRole('button', { name: /^Gen 6 · Week of/ })).toBeVisible();
  await expect(page.getByRole('button', { name: `Add ${MEGA} to team` })).toBeVisible();
  await noScroll(page, 'gen 6 builder');
  await page.waitForLoadState('networkidle');
  await shot(page, '02-builder', info.project.name);
});

test('the builder allows one Mega per team', async ({ page }, info) => {
  await open(page, gen6State({ locked: false }));
  const wide = !info.project.use.isMobile;
  /** Adds a species with its most used set (a click on wide screens, the set prompt on phones). */
  const add = async (species: string) => {
    await page.getByRole('button', { name: `Add ${species} to team` }).click();
    if (wide) return;
    const prompt = page.getByRole('dialog', { name: /pick a set/ });
    await expect(prompt).toBeVisible();
    return prompt;
  };
  const first = await add(MEGA);
  await first?.getByRole('button', { name: `Add ${MEGA}` }).click();
  await expect(
    page.getByRole('button', { name: `Remove ${MEGA} from team` }).first(),
  ).toBeVisible();

  // Gardevoir's most used set holds Gardevoirite: a second Mega Stone is blocked.
  const second = await add(SECOND_MEGA);
  const message = page.getByText(`Only one Mega per team. ${MEGA} has the Mega Stone.`);
  await expect(message).toBeVisible();
  if (second)
    await expect(second.getByRole('button', { name: `Add ${SECOND_MEGA}` })).toBeDisabled();
  await shot(page, '03-one-mega', info.project.name);
  await expect(page.getByRole('button', { name: `Remove ${SECOND_MEGA} from team` })).toHaveCount(
    0,
  );
});

test('your Pokémon Mega Evolves, and the battle resumes', async ({ page }, info) => {
  await open(page, gen6State());
  // The first of the team leads by default: Manectric.
  await expect(page.getByRole('button', { name: `${MEGA}, leading` })).toBeVisible();
  await page.getByRole('button', { name: `Start · ${MEGA} leads` }).click();
  await page.locator(MOVES).first().waitFor();

  const toggle = page.getByRole('button', { name: 'Mega Evolve' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await noScroll(page, 'mega toggle');
  await shot(page, '04-toggle', info.project.name);
  await page.locator(MOVES).first().click();

  // It Mega Evolves before it moves (it may still faint this turn: each try has a fresh seed).
  await expect(
    page
      .getByRole('log', { name: 'Battle log' })
      .getByText(`${MEGA} has Mega Evolved into Mega ${MEGA}!`)
      // Phones show the latest lines twice: the strip and the full log.
      .first(),
  ).toBeAttached();
  await shot(page, '05-mega', info.project.name);

  await page.reload();
  await page
    .locator(
      `${MOVES}, main button[aria-label^="Switch to"], [role="dialog"][aria-label="Battle over"]`,
    )
    .first()
    .waitFor();
  // One Mega per team: no other Pokémon is offered Mega Evolution after the resume.
  await expect(page.getByRole('button', { name: 'Mega Evolve', exact: true })).toHaveCount(0);
});

test('an older #gen6 link opens Gen 6', async ({ page }) => {
  const state = gen6State();
  state.settings.format = 'gen4ou';
  await open(page, state, '/#gen6');
  await expect(page.getByRole('button', { name: /^Gen 6 · / })).toBeVisible();
  await expect(page).toHaveURL(/\/#play$/);
});
