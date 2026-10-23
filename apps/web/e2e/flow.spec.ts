// Walks the whole M6 flow on every viewport. At each step it checks that the
// page doesn't scroll (and no sheet overflows), and saves a screenshot for
// design review under e2e/screens/<viewport>/.
import { expect, test, type Page } from '@playwright/test';

const TODAY = new Date('2026-10-21T10:00:00-04:00');

async function noScroll(page: Page, step: string) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].map((d) => ({
      overflow: d.scrollHeight - d.clientHeight,
      offscreen: d.getBoundingClientRect().top < -1,
    }));
    return { page: doc.scrollHeight - window.innerHeight, dialogs };
  });
  expect(overflow.page, `${step}: page scrolls`).toBeLessThanOrEqual(1);
  for (const d of overflow.dialogs) {
    expect(d.overflow, `${step}: sheet overflows`).toBeLessThanOrEqual(1);
    expect(d.offscreen, `${step}: sheet runs off the top`).toBe(false);
  }
}

async function shot(page: Page, name: string, project: string) {
  await page.waitForTimeout(250); // let sheet animations settle
  await noScroll(page, name);
  await page.screenshot({ path: `e2e/screens/${project}/${name}.png` });
}

for (const scheme of ['light', 'dark'] as const) {
  test(`full flow (${scheme})`, async ({ page }, info) => {
    const project = `${info.project.name}/${scheme}`;
    await page.clock.setFixedTime(TODAY);
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');

    // First run: welcome sheet.
    await expect(page.getByRole('dialog', { name: 'Welcome to Daily Battle' })).toBeVisible();
    await shot(page, '01-welcome', project);
    await page.getByRole('radio', { name: /Gen 4 OU/ }).click();
    await page.getByRole('button', { name: 'Play Gen 4 OU' }).click();

    // Builder: empty, then a suggested team, then info and set picker.
    await expect(page.getByRole('button', { name: /Pick 6 more/ })).toBeVisible();
    await shot(page, '02-builder-empty', project);
    // Wide screens show sets in a panel under the pool instead of sheets.
    const wide = page.viewportSize()!.width >= 900;
    await page
      .getByRole('button', { name: /^Add .* to team$/ })
      .first()
      .click();
    if (wide) {
      // Added with the most used set; the panel shows its sets to change it.
      const panel = page.getByRole('region', { name: / details$/ });
      await expect(panel.getByRole('button', { name: 'Remove from team' })).toBeVisible();
    } else {
      // A Pokémon with more than one set prompts for it, the most used one ready.
      const prompt = page.getByRole('dialog', { name: /pick a set/ });
      await expect(prompt.getByRole('tab', { selected: true })).toBeVisible();
      await shot(page, '03-add-prompt', project);
      await prompt.getByRole('button', { name: /^Add / }).click();
    }
    await shot(page, '03-builder-one', project);
    await page
      .getByRole('button', { name: /^Remove .* from team$/ })
      .first()
      .click();

    await page.getByRole('button', { name: 'Balanced' }).click();
    await expect(page.getByRole('button', { name: 'Lock in team' })).toBeEnabled();
    await shot(page, '04-builder-full', project);

    await page
      .getByRole('button', { name: /^About / })
      .first()
      .click();
    await shot(page, '05-info', project);
    if (!wide) await page.keyboard.press('Escape');

    // On wide screens the team panel's row opens that member's details; on phones, its pencil.
    if (wide) await page.locator('aside ul li > div > button').first().click();
    else
      await page
        .getByRole('button', { name: /Change set/ })
        .first()
        .click();
    if (wide) await expect(page.getByRole('region', { name: / details$/ })).toBeVisible();
    else await expect(page.getByRole('dialog', { name: /pick a set/ })).toBeVisible();
    await shot(page, '06-set-picker', project);
    const tabs = page.getByRole('tab');
    if ((await tabs.count()) > 1) {
      await tabs.nth(1).click();
      if (wide) await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
      await shot(page, '07-set-other', project);
    }
    if (!wide) await page.keyboard.press('Escape');

    if (await page.getByRole('button', { name: /Team checklist/ }).isVisible()) {
      await page.getByRole('button', { name: /Team checklist/ }).click();
      await shot(page, '08-checklist', project);
      await page.keyboard.press('Escape');
    }

    await page.getByRole('button', { name: 'Lock in team' }).click();
    await shot(page, '09-lock-confirm', project);
    await page.getByRole('button', { name: 'Lock in', exact: true }).click();

    // Daily brief: lead, edit mode, swap.
    await expect(page.getByRole('button', { name: /^Start · / })).toBeVisible();
    await shot(page, '10-brief', project);
    await page
      .getByRole('button', { name: /^Lead with / })
      .first()
      .click();
    await expect(page.getByRole('button', { name: /leads$/ })).toBeVisible();

    await page.getByRole('button', { name: '1 change left' }).click();
    await shot(page, '11-brief-edit', project);
    await page.getByRole('button', { name: 'Swap' }).first().click();
    await shot(page, '12-brief-replace', project);
    await page
      .getByRole('button', { name: /^Bring in / })
      .first()
      .click();
    await page.getByRole('button', { name: 'Bring in' }).first().click();
    await shot(page, '13-change-confirm', project);
    await page.getByRole('button', { name: 'Make change' }).click();
    await expect(page.getByText('Change used')).toBeVisible();

    // Sheets from the top bar.
    await page.getByRole('button', { name: /^Stats/ }).click();
    await shot(page, '14-stats', project);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Settings' }).click();
    await shot(page, '15-settings', project);
    await page.keyboard.press('Escape');

    // State survives a reload.
    await page.reload();
    await expect(page.getByText('Change used')).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Welcome to Daily Battle' })).toHaveCount(0);
  });
}
