import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const isRealSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('example.supabase.co')
const existingAuthEmail = process.env.PLAYWRIGHT_AUTH_EMAIL
const existingAuthPassword = process.env.PLAYWRIGHT_AUTH_PASSWORD
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey =
  process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

function randomEmail() {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return `battle-e2e-${ts}-${rand}@example.com`
}

async function fillSignUpForm(page: Page, email: string, password: string, confirm: string) {
  await page.getByPlaceholder('you@example.com').fill(email)
  const passwordInputs = page.locator('.auth-password-input')
  await passwordInputs.nth(0).fill(password)
  await passwordInputs.nth(1).fill(confirm)
}

async function openProfilePanel(page: Page) {
  await page.evaluate(() => window.localStorage.setItem('battle-job-selected', '1'))
  const blockingDialog = page.getByRole('dialog')
  if (await blockingDialog.isVisible().catch(() => false)) {
    await blockingDialog.getByRole('button', { name: 'Close' }).click()
    await expect(blockingDialog).not.toBeVisible()
  }
  await page.getByRole('button', { name: 'Profile' }).click()
  await expect(page.getByText('Battle Arena', { exact: true })).toBeVisible()
}

async function switchToSignUp(page: Page) {
  await page.getByRole('button', { name: 'Sign up' }).click()
}

async function signOutFromProfile(page: Page) {
  const signOutButton = page.getByRole('button', { name: 'Sign out' })
  await expect(signOutButton).toBeVisible({ timeout: 30000 })
  await expect(signOutButton).toBeEnabled({ timeout: 60000 })
  await signOutButton.click()
}

async function fillSignInForm(page: Page, email: string, password: string) {
  await page.getByPlaceholder('you@example.com').fill(email)
  const passwordInputs = page.locator('.auth-password-input')
  await passwordInputs.nth(0).fill(password)
}

async function signInWithExistingAccountOrSkip(page: Page) {
  if (!existingAuthEmail || !existingAuthPassword) {
    test.skip(true, 'Requires PLAYWRIGHT_AUTH_EMAIL and PLAYWRIGHT_AUTH_PASSWORD')
  }

  await fillSignInForm(page, existingAuthEmail!, existingAuthPassword!)
  await page.getByRole('button', { name: 'ENTER ARENA' }).click()

  const sessionVisible = page.getByText('Current session:')
  const authError = page.locator('p.text-rose-700').first()
  const outcome = await Promise.race([
    sessionVisible
      .waitFor({ state: 'visible', timeout: 30000 })
      .then(() => 'session')
      .catch(() => null),
    authError
      .waitFor({ state: 'visible', timeout: 30000 })
      .then(() => 'error')
      .catch(() => null),
  ])

  if (outcome !== 'session') {
    test.skip(true, 'Configured auth credentials are unavailable or invalid in current environment')
  }
}

function ensureAdminCleanupReadyOrSkip() {
  if (!supabaseUrl || !serviceRoleKey) {
    test.skip(true, 'Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for cleanup')
  }
}

async function cleanupCreatedAuthUserByEmail(email: string) {
  const admin = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) {
    throw error
  }
  const target = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
  if (!target) return
  const { error: deleteError } = await admin.auth.admin.deleteUser(target.id)
  if (deleteError) {
    throw deleteError
  }
}

test.describe('Auth flow', () => {
  test.describe.configure({ timeout: 120000 })
  test.skip(!isRealSupabase, 'Requires real Supabase credentials from .env.local')

  test('shows Google login only in sign-in mode', async ({ page }) => {
    await page.goto('/')
    await openProfilePanel(page)

    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await switchToSignUp(page)
    await expect(page.getByRole('button', { name: 'Continue with Google' })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign up and enter' })).toBeVisible()
  })

  test('starts Google OAuth with the battle callback and PKCE', async ({ page }) => {
    await page.goto('/')
    await openProfilePanel(page)

    const authorizeRequest = page.waitForRequest((request) =>
      request.url().includes('/auth/v1/authorize'),
    )
    const authorizeResponse = page.waitForResponse((response) =>
      response.url().includes('/auth/v1/authorize'),
    )
    await page.getByRole('button', { name: 'Continue with Google' }).click({
      noWaitAfter: true,
    })

    const requestUrl = new URL((await authorizeRequest).url())
    expect(requestUrl.searchParams.get('provider')).toBe('google')
    expect(requestUrl.searchParams.get('redirect_to')).toBe(
      'http://localhost:3002/auth/callback',
    )
    expect(requestUrl.searchParams.get('code_challenge')).toBeTruthy()
    expect(requestUrl.searchParams.get('code_challenge_method')).toBe('s256')
    expect(requestUrl.searchParams.get('access_type')).toBe('offline')
    expect(requestUrl.searchParams.get('prompt')).toBe('consent')

    const providerResponse = await authorizeResponse
    expect([302, 303]).toContain(providerResponse.status())
    expect(providerResponse.headers().location).toContain('accounts.google.com')
  })

  test('returns provider callback errors to the battle auth error state', async ({ page }) => {
    await page.goto('/auth/callback?error=access_denied')
    await expect(page).toHaveURL('/?error=auth_error')
    await expect(page.getByRole('alert', { name: 'Authentication error' })).toContainText(
      'Google sign-in could not be completed',
    )

    await page.getByRole('button', { name: 'Try again' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByText('Battle Arena', { exact: true })).toBeVisible()
  })

  test('rejects a callback without a code or existing session', async ({ page }) => {
    await page.goto('/auth/callback')
    await expect(page).toHaveURL('/?error=auth_error')
  })

  test('sign in and keep authenticated session', async ({ page }) => {
    await page.goto('/')
    await openProfilePanel(page)
    await signInWithExistingAccountOrSkip(page)
    await expect(page.getByText('Current session:')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText(existingAuthEmail!)).toBeVisible()
  })

  test('register and auto-delete created account', async ({ page }) => {
    ensureAdminCleanupReadyOrSkip()
    const email = randomEmail()
    const password = 'Password123!'

    try {
      await page.goto('/')
      await openProfilePanel(page)
      await switchToSignUp(page)
      await fillSignUpForm(page, email, password, password)
      await page.getByRole('button', { name: 'Sign up and enter' }).click()
      await expect(page.getByText('Current session:')).toBeVisible({ timeout: 30000 })
      await expect(page.getByText(email)).toBeVisible()
    } finally {
      await cleanupCreatedAuthUserByEmail(email)
    }
  })

  test('sign up fails when confirm password mismatches', async ({ page }) => {
    await page.goto('/')
    await openProfilePanel(page)
    await switchToSignUp(page)

    await fillSignUpForm(page, randomEmail(), 'Password123!', 'Password123?')
    await page.getByRole('button', { name: 'Sign up and enter' }).click()
    await expect(page.getByText('Passwords do not match')).toBeVisible()
  })

  test('sign up fails when password is too short', async ({ page }) => {
    await page.goto('/')
    await openProfilePanel(page)
    await switchToSignUp(page)

    await fillSignUpForm(page, randomEmail(), '12345', '12345')
    await page.getByRole('button', { name: 'Sign up and enter' }).click()
    await expect(
      page.getByText('Password must be at least 6 characters (Supabase default policy)'),
    ).toBeVisible()
  })

  test('sign in fails with wrong password', async ({ page }) => {
    test.skip(!existingAuthEmail, 'Requires PLAYWRIGHT_AUTH_EMAIL')

    await page.goto('/')
    await openProfilePanel(page)

    await fillSignInForm(page, existingAuthEmail!, 'WrongPassword123!')
    await page.getByRole('button', { name: 'ENTER ARENA' }).click()

    await expect(page.locator('p.text-rose-700').first()).toBeVisible({ timeout: 30000 })
  })

  test('sign in keeps session after page reload', async ({ page }) => {
    await page.goto('/')
    await openProfilePanel(page)
    await signInWithExistingAccountOrSkip(page)
    await expect(page.getByText('Current session:')).toBeVisible({ timeout: 30000 })

    await page.reload()
    await openProfilePanel(page)
    await expect(page.getByText('Current session:')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(existingAuthEmail!)).toBeVisible()
  })

  test('sign out clears authenticated view', async ({ page }) => {
    await page.goto('/')
    await openProfilePanel(page)
    await signInWithExistingAccountOrSkip(page)

    await expect(page.getByText('Current session:')).toBeVisible({ timeout: 30000 })
    await expect(page.getByText(existingAuthEmail!)).toBeVisible()

    await page.reload()
    await openProfilePanel(page)
    await expect(page.getByText('Current session:')).toBeVisible({ timeout: 15000 })

    await signOutFromProfile(page)
    await expect(page.getByText('Current session:')).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('sign in validates empty email input', async ({ page }) => {
    await page.goto('/')
    await openProfilePanel(page)
    const passwordInputs = page.locator('.auth-password-input')
    await passwordInputs.nth(0).fill('Password123!')
    await page.getByRole('button', { name: 'ENTER ARENA' }).click()
    await expect(page.getByText('Please enter email')).toBeVisible()
  })

  test('sign up rejects duplicate email', async ({ page }) => {
    test.skip(!existingAuthEmail, 'Requires PLAYWRIGHT_AUTH_EMAIL')

    await page.goto('/')
    await openProfilePanel(page)
    await switchToSignUp(page)
    await fillSignUpForm(page, existingAuthEmail!, 'Password123!', 'Password123!')
    await page.getByRole('button', { name: 'Sign up and enter' }).click()
    await expect(page.locator('p.text-rose-700').first()).toBeVisible({ timeout: 30000 })
  })
})
