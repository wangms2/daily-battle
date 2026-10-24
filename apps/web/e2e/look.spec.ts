// Design review only: screenshots of the current look, with Beginner hints
// off and on. Run with
//   LOOK=1 npx playwright test e2e/look.spec.ts --project=phone-390x844 --project=desktop-1280x800
import { expect, test } from '@playwright/test';

const TODAY = new Date('2026-10-21T10:00:00-04:00');

test.skip(!process.env.LOOK, 'design review screenshots only');

for (const scheme of ['light', 'dark'] as const) {
  for (const hints of [false, true]) {
    test(`${scheme} hints-${hints ? 'on' : 'off'}`, async ({ page }, info) => {
      const dir = `e2e/look/${info.project.name}/${scheme}${hints ? '-hints' : ''}`;
      await page.clock.setFixedTime(TODAY);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/#play');
      await page.screenshot({ path: `${dir}/welcome.png` });
      if (!hints) await page.getByRole('switch').click();
      await page.getByRole('button', { name: 'Let’s play' }).click();
      await page.screenshot({ path: `${dir}/builder-empty.png` });

      await page.getByRole('button', { name: 'Balanced' }).click();
      await page.screenshot({ path: `${dir}/builder-undo.png` });
      await page.waitForTimeout(5300);
      await page.screenshot({ path: `${dir}/builder.png` });

      await page
        .getByRole('button', { name: /^About / })
        .first()
        .click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${dir}/info.png` });
      await page.keyboard.press('Escape');

      await page
        .getByRole('button', { name: /Change set|Change$/ })
        .first()
        .click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${dir}/set-picker.png` });
      await page.getByRole('list', { name: 'Moves' }).getByRole('button').nth(1).click();
      await page.screenshot({ path: `${dir}/move-info.png` });
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Lock in team' }).click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${dir}/lock.png` });
      await page.getByRole('button', { name: 'Lock in', exact: true }).click();
      await expect(page.getByRole('button', { name: /^Start · / })).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${dir}/brief.png` });
      await page.getByRole('button', { name: '1 change left' }).click();
      await page.screenshot({ path: `${dir}/brief-edit.png` });
    });
  }
}
