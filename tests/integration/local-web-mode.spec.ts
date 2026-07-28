import { expect, test } from '@playwright/test'

test('local Web mode keeps remote UI visible with zero Supabase traffic', async ({ page }) => {
  const supabaseRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      url.hostname.endsWith('.supabase.co') ||
      /\/(auth|rest|storage|functions)\/v1\//.test(url.pathname)
    ) {
      supabaseRequests.push(request.url())
    }
  })

  await page.addInitScript(() => {
    localStorage.setItem('battle-job-selected', '1')
    localStorage.setItem('battle-local-mode-proof', 'persisted')
  })

  await page.goto('/')
  await page.getByRole('button', { name: 'Import' }).click()
  await expect(page.getByTestId('local-mode-notice').first()).toBeVisible()
  await expect(page.locator('[data-remote-feature="supabase"]').first()).toBeDisabled()

  await page.reload()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('battle-local-mode-proof')))
    .toBe('persisted')
  expect(supabaseRequests).toEqual([])
})
