// The first time the game opens, it asks the player's name before the landing
// (screens/NameScreen.tsx). Tests that open the landing as a new player answer
// it with the suggested name; a player who has one goes straight on.
import { expect, type Page } from '@playwright/test';

export async function meet(page: Page) {
  const ask = page.getByRole('button', { name: 'That’s me!' });
  const play = page.getByRole('button', { name: 'Play', exact: true });
  await expect(ask.or(play).first()).toBeVisible();
  if (!(await ask.isVisible())) return;
  await ask.click();
  await expect(page.getByText(/Nice to meet you/)).toBeVisible();
  await page.getByRole('button', { name: 'Let’s go!' }).click();
  await expect(play).toBeVisible();
}

/** Answers the name and waits: the greeting goes by itself. */
export async function meetAndWait(page: Page) {
  await page.getByRole('button', { name: 'That’s me!' }).click();
  await expect(page.getByText(/Nice to meet you/)).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Welcome' })).toBeHidden({ timeout: 5000 });
}
