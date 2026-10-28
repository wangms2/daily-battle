// Counting players (DESIGN.md §18a): devices' pings reach the server, and the
// admin page counts the people behind them.
import { expect, test } from '@playwright/test';
import { E2E_ADMIN_TOKEN } from '../playwright.config';

// Playwright requires object destructuring for the fixtures argument.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop-1280x800', 'the server and admin page, once');
});

test('pings count players on the admin page; bad ones are refused', async ({ page }) => {
  await page.goto('/#about');
  const results = await page.evaluate(async () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = local(new Date());
    const id = () => crypto.randomUUID();
    const send = (body: unknown) =>
      fetch('/api/ping', { method: 'POST', body: JSON.stringify(body) }).then((r) => r.status);
    const a = id();
    return [
      await send({ id: a, day: today, activity: 'daily-gen3ou', since: '2026-01-04' }),
      await send({ id: a, day: today, activity: 'lessons-gen3ou' }),
      await send({ id: id(), day: today, activity: 'versus' }),
      await send({ id: 'not-an-id', day: today, activity: 'versus' }),
      await send({ id: id(), day: today, activity: 'hacking' }),
    ];
  });
  expect(results).toEqual([204, 204, 204, 400, 400]);

  await page.goto('/#admin');
  await page.getByLabel('Password').fill(E2E_ADMIN_TOKEN);
  await page.getByRole('button', { name: 'Open' }).click();
  const today = page.locator('.card').filter({ hasText: 'Players today' });
  await expect(today).toBeVisible();
  // Other runs share this database, so at least the two players sent here.
  const count = Number(await today.locator('.display').textContent());
  expect(count).toBeGreaterThanOrEqual(2);
  await expect(page.getByText(/Link Battle \d+/)).toBeVisible();
});
