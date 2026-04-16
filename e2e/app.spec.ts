import { test, expect } from '@playwright/test'

test.describe('Battle Game E2E', () => {
  test('should load the main page without errors', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Check body exists
    const body = page.locator('body')
    await expect(body).toBeVisible()
  })

  test('should have no console errors on page load', async ({ page }) => {
    const errors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    page.on('pageerror', (error) => {
      errors.push(error.message)
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    // Filter out known non-critical errors
    const criticalErrors = errors.filter(err =>
      !err.includes('Download the React DevTools') &&
      !err.includes('favicon')
    )

    expect(criticalErrors).toHaveLength(0)
  })
})
