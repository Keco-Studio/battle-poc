import { test, expect, type Page } from '@playwright/test'

const isRealSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('example.supabase.co')
const existingAuthEmail = process.env.PLAYWRIGHT_AUTH_EMAIL
const existingAuthPassword = process.env.PLAYWRIGHT_AUTH_PASSWORD

function randomEmail() {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return `battle-e2e-${ts}-${rand}@example.com`
}

function randomDisplayName() {
  return `E2E-${Date.now().toString().slice(-5)}`
}

async function openProfilePanel(page: Page) {
  await page.getByRole('button', { name: 'Profile' }).click()
  await expect(page.getByText('Battle Arena')).toBeVisible()
}

async function switchToSignUp(page: Page) {
  await page.getByRole('button', { name: 'Sign up' }).click()
}

async function fillSignUpForm(page: Page, email: string, displayName: string, password: string, confirm: string) {
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByPlaceholder('Adventurer').fill(displayName)
  const passwordInputs = page.locator('.auth-password-input')
  await passwordInputs.nth(0).fill(password)
  await passwordInputs.nth(1).fill(confirm)
}

async function signOutFromProfile(page: Page) {
  const signOutButton = page.getByRole('button', { name: 'Sign out' })
  await expect(signOutButton).toBeVisible({ timeout: 30000 })
  await expect(signOutButton).toBeEnabled({ timeout: 60000 })
  await signOutButton.click()
}

test.describe('Auth flow', () => {
  test.describe.configure({ timeout: 120000 })
  test.skip(!isRealSupabase, 'Requires real Supabase credentials from .env.local')

  test('register and keep authenticated session', async ({ page }) => {
    const email = randomEmail()
    const password = 'Password123!'
    const displayName = randomDisplayName()

    await page.goto('/')
    await openProfilePanel(page)
    await switchToSignUp(page)
    await fillSignUpForm(page, email, displayName, password, password)
    await page.getByRole('button', { name: 'Sign up and enter' }).click()
    await expect(page.getByText('Current session:')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(email)).toBeVisible()
  })

  test('sign up fails when confirm password mismatches', async ({ page }) => {
    await page.goto('/')
    await openProfilePanel(page)
    await switchToSignUp(page)

    await fillSignUpForm(page, randomEmail(), randomDisplayName(), 'Password123!', 'Password123?')
    await page.getByRole('button', { name: 'Sign up and enter' }).click()
    await expect(page.getByText('Passwords do not match')).toBeVisible()
  })

  test('sign up fails when password is too short', async ({ page }) => {
    await page.goto('/')
    await openProfilePanel(page)
    await switchToSignUp(page)

    await fillSignUpForm(page, randomEmail(), randomDisplayName(), '12345', '12345')
    await page.getByRole('button', { name: 'Sign up and enter' }).click()
    await expect(
      page.getByText('Password must be at least 6 characters (Supabase default policy)')
    ).toBeVisible()
  })

  test('sign in fails with wrong password', async ({ page }) => {
    test.skip(
      !existingAuthEmail || !existingAuthPassword,
      'Requires PLAYWRIGHT_AUTH_EMAIL and PLAYWRIGHT_AUTH_PASSWORD'
    )

    await page.goto('/')
    await openProfilePanel(page)

    await page.getByPlaceholder('you@example.com').fill(existingAuthEmail!)
    const passwordInputs = page.locator('.auth-password-input')
    await passwordInputs.nth(0).fill('WrongPassword123!')
    await page.getByRole('button', { name: 'ENTER ARENA' }).click()

    await expect(page.getByText(/invalid|credentials/i)).toBeVisible({ timeout: 15000 })
  })

  test('sign out clears authenticated view', async ({ page }) => {
    test.skip(
      !existingAuthEmail || !existingAuthPassword,
      'Requires PLAYWRIGHT_AUTH_EMAIL and PLAYWRIGHT_AUTH_PASSWORD'
    )

    await page.goto('/')
    await openProfilePanel(page)
    await page.getByPlaceholder('you@example.com').fill(existingAuthEmail!)
    const passwordInputs = page.locator('.auth-password-input')
    await passwordInputs.nth(0).fill(existingAuthPassword!)
    await page.getByRole('button', { name: 'ENTER ARENA' }).click()

    await expect(page.getByText('Current session:')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(existingAuthEmail!)).toBeVisible()

    // Refresh once to avoid transient authLoading state keeping sign-out disabled.
    await page.reload()
    await openProfilePanel(page)
    await expect(page.getByText('Current session:')).toBeVisible({ timeout: 15000 })

    await signOutFromProfile(page)
    await expect(page.getByText('Current session:')).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })
})
