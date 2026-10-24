// The whole loop with only a keyboard: start, see a move's details on focus,
// play to the end, and land on the result card.
import { expect, test, type Page } from '@playwright/test';
import schedule from '../public/schedule/2026-10-19.json' with { type: 'json' };

// Playwright requires object destructuring for the fixtures argument.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop-1280x800', 'keyboard play is a desktop concern');
});

/** Presses Tab until the focused element matches, like a keyboard user would. */
async function tabTo(page: Page, matches: (el: Element) => boolean, max = 80): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate((src) => {
      const el = document.activeElement;
      return !!el && new Function('el', `return (${src})(el)`)(el);
    }, matches.toString());
    if (hit) return;
  }
  throw new Error('Never reached the element with Tab');
}

const isMove = (el: Element) =>
  el.matches('main button[aria-label*=" PP"]:enabled') ||
  (el.matches('main button[aria-label^="Switch to"]:not([aria-disabled="true"])') &&
    !!/Who comes in\?|Send in your last Pokémon/.test(document.body.textContent ?? ''));

test('plays a whole battle with only the keyboard', async ({ page }) => {
  await page.addInitScript(
    ({ team, poolId }) => {
      localStorage.setItem(
        'daily-battle:state',
        JSON.stringify({
          version: 3,
          weeks: { '2026-10-19': { team, poolId } },
          days: {},
          settings: {
            beginnerHints: true,
            battleSpeed: 'instant',
            animations: true,
            shownExplainers: ['welcome', 'gen5-news', 'gen6-news'],
          },
        }),
      );
    },
    {
      team: schedule.suggestedTeams[0]!.team,
      poolId: `${schedule.week}:g${schedule.generatorVersion}:c${schedule.pool.candidate}`,
    },
  );
  await page.clock.setFixedTime(new Date('2026-10-21T10:00:00-04:00'));
  await page.goto('/#play');

  await tabTo(page, (el) => /^Start · /.test(el.textContent ?? ''));
  await page.keyboard.press('Enter');
  await page.locator('main button[aria-label*=" PP"]:enabled').first().waitFor();

  // Focusing a move shows what it does, the keyboard's long-press.
  await tabTo(page, (el) => el.matches('main button[aria-label*=" PP"]:enabled'));
  await expect(page.getByRole('tooltip')).toBeVisible();

  const over = page.getByRole('dialog', { name: 'Battle over' });
  const focusedChoice = () =>
    page.evaluate(
      (src) => new Function('el', `return (${src})(el)`)(document.activeElement),
      isMove.toString(),
    );
  // After each turn, focus returns to the first choice: no tabbing back down.
  let refocused = 0;
  for (let i = 0; i < 400 && !(await over.isVisible()); i++) {
    if (await focusedChoice()) {
      await page.keyboard.press('Enter');
      if (i > 0) refocused++;
    }
    await page.waitForTimeout(60);
  }
  expect(refocused).toBeGreaterThan(0);
  await expect(over).toBeVisible();
  // Focus lands on the result card.
  await expect(over).toBeFocused();
  await tabTo(page, (el) => el.textContent === 'Back to today');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Today’s result' })).toBeVisible();
});
