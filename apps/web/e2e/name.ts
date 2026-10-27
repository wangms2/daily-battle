// The first Play asks the player's name (screens/NameScreen.tsx). Tests that
// open a game from the home screens answer it with the suggested name.
import { expect, type Page } from '@playwright/test';

export async function meet(page: Page) {
  await page.getByRole('button', { name: 'That’s me!' }).click();
  await expect(page.getByText(/Nice to meet you/)).toBeVisible();
  await page
    .getByRole('status')
    .filter({ hasText: /Nice to meet you/ })
    .click();
}
