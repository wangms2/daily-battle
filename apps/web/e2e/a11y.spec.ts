// Automated accessibility checks (axe, WCAG 2.1 A/AA) on every screen and
// sheet, in light and dark, at one phone and the desktop size.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import schedule from '../public/schedule/2026-10-19.json' with { type: 'json' };

const TEAM = schedule.suggestedTeams[0]!.team;

// Playwright requires object destructuring for the fixtures argument.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => {
  test.skip(
    !['phone-390x844', 'desktop-1280x800'].includes(info.project.name),
    'one phone and the desktop cover the layouts',
  );
});

async function seed(page: Page, { team = true, welcome = false } = {}) {
  await page.addInitScript(
    ({ team, welcome, TEAM, poolId }) => {
      if (localStorage.getItem('daily-battle:state')) return;
      localStorage.setItem(
        'daily-battle:state',
        JSON.stringify({
          version: 3,
          weeks: team ? { '2026-10-19': { team: TEAM, poolId } } : {},
          days: {},
          settings: {
            beginnerHints: true,
            battleSpeed: 'instant',
            animations: true,
            shownExplainers: welcome
              ? []
              : ['welcome', 'gen5-news', 'gen6-news', 'gen3-news', 'tour'],
          },
        }),
      );
    },
    {
      team,
      welcome,
      TEAM,
      poolId: `${schedule.week}:g${schedule.generatorVersion}:c${schedule.pool.candidate}`,
    },
  );
  await page.clock.setFixedTime(new Date('2026-10-21T10:00:00-04:00'));
  await page.goto('/#play');
}

/** Fails on serious or critical violations, listing each with where it is. */
async function check(page: Page, where: string) {
  await page.waitForTimeout(250); // let sheets finish animating in
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const bad = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 4)
          .join('\n    ')}`,
    );
  expect(bad, `${where}\n${bad.join('\n')}`).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(scheme, () => {
    test.beforeEach(async ({ page }) => page.emulateMedia({ colorScheme: scheme }));

    test('first run and the team builder', async ({ page }) => {
      await seed(page, { team: false, welcome: true });
      await check(page, 'welcome sheet');
      await page.getByRole('button', { name: 'About and credits' }).click();
      await check(page, 'about sheet');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Let’s play' }).click();
      await check(page, 'team builder');
      await page
        .getByRole('button', { name: /info|About/i })
        .first()
        .click();
      await check(page, 'pokemon info');
    });

    test('the daily brief and its sheets', async ({ page }) => {
      await seed(page);
      await expect(page.getByRole('button', { name: /^Start · / })).toBeVisible();
      await check(page, 'daily brief');
      await page.getByRole('button', { name: /^Stats/ }).click();
      await check(page, 'stats');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Settings' }).click();
      await check(page, 'settings');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: '1 change left' }).click();
      await check(page, 'daily change');
    });

    test('a battle, its sheets, and the result', async ({ page }) => {
      await seed(page);
      await page.getByRole('button', { name: /^Start · / }).click();
      await page.locator('main button[aria-label*=" PP"]:enabled').first().waitFor();
      await check(page, 'battle');
      await page.getByRole('button', { name: /^Foe .* Details$/ }).click();
      await check(page, 'foe details');
      await page.locator('header').getByText(/^Turn/).click();
      await page.getByRole('button', { name: 'Battle menu' }).click();
      await check(page, 'battle menu');
      await page.getByRole('button', { name: 'Battle log' }).click();
      await check(page, 'log sheet');
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Battle menu' }).click();
      await page.getByRole('button', { name: 'Give up' }).click();
      await check(page, 'give up dialog');
      await page.getByRole('button', { name: 'Give up' }).last().click();
      await expect(page.getByRole('dialog', { name: 'Battle over' })).toBeVisible();
      await check(page, 'end card');
      await page.getByRole('button', { name: 'Back to today' }).click();
      await expect(page.getByRole('region', { name: 'Today’s result' })).toBeVisible();
      await check(page, 'brief with result');
    });
  });
}
