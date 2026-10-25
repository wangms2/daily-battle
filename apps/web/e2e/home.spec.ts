// The first screen: Daily Battle or Versus with friends, then the game picker.
// A shared link (#daily) lands on the picker. Nothing scrolls on phones.
import { expect, test, type Page } from '@playwright/test';

const TODAY = new Date('2026-10-28T10:00:00-04:00');

async function open(page: Page, path: string) {
  await page.clock.setFixedTime(TODAY);
  await page.goto(path);
}

async function noScroll(page: Page, step: string) {
  const over = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  expect(over, `${step}: page scrolls`).toBeLessThanOrEqual(1);
}

const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `e2e/look/home/${project}/${name}.png` });

test('the first screen offers Daily Battle and Versus, then the four games', async ({
  page,
}, info) => {
  await open(page, '/');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'With friends' })).toBeVisible();
  // Nothing pops up over a first visit.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await noScroll(page, 'landing');
  await shot(page, '01-landing', info.project.name);

  await page.getByRole('button', { name: 'Play' }).click();
  for (const gen of ['Gen 3', 'Gen 4', 'Gen 5', 'Gen 6'])
    await expect(page.getByRole('button', { name: new RegExp(gen) })).toBeVisible();
  await noScroll(page, 'game picker');
  await shot(page, '02-picker', info.project.name);

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'With friends' })).toBeVisible();
});

test('a shared link opens the game picker', async ({ page }) => {
  await open(page, '/#daily');
  await expect(page.getByText('Choose a generation')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('With friends opens the room screen', async ({ page }) => {
  await open(page, '/');
  await page.getByRole('button', { name: 'With friends' }).click();
  await expect(page).toHaveURL(/#versus$/);
});
