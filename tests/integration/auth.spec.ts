import { test, expect, type Page } from '@playwright/test'

const isRealSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('example.supabase.co')

function randomEmail() {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return `battle-e2e-${ts}-${rand}@example.com`
}

async function openProfilePanel(page: Page) {
  await page.getByRole('button', { name: 'Profile' }).click()
  await expect(page.getByText('Battle Arena')).toBeVisible()
}

test.describe('Auth flow', () => {
  test.skip(!isRealSupabase, 'Requires real Supabase credentials from .env.local')

  test('register and keep authenticated session', async ({ page }) => {
    const email = randomEmail()
    const password = 'Password123!'
    const displayName = `E2E-${Date.now().toString().slice(-5)}`

    await page.goto('/')
    await openProfilePanel(page)

    await page.getByRole('button', { name: 'Sign up' }).click()
    await page.getByPlaceholder('you@example.com').fill(email)
    await page.getByPlaceholder('Adventurer').fill(displayName)

    const passwordInputs = page.locator('.auth-password-input')
    await passwordInputs.nth(0).fill(password)
    await passwordInputs.nth(1).fill(password)

    await page.getByRole('button', { name: 'Sign up and enter' }).click()
    await expect(page.getByText('Current session:')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(email)).toBeVisible()
  })
})
