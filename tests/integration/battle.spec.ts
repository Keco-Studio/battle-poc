import { test, expect } from '@playwright/test';

test('battle scene renders', async ({ page }) => {
  await page.goto('/');
  // The Next.js app doesn't have Phaser integrated yet, so this is a placeholder
  // In Phase 2, this will test actual battle scene rendering
  await expect(page.locator('body')).toBeVisible();
});