import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'

function collectRuntimeFailures(page: Page) {
  const consoleErrors: string[] = []
  const failedAssets: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/assets/')) {
      failedAssets.push(`${response.status()} ${response.url()}`)
    }
  })
  return { consoleErrors, failedAssets }
}

async function expectNonblankCanvas(page: Page) {
  const canvas = page.locator('canvas')
  await expect(canvas).toBeVisible()
  const image = await canvas.screenshot()
  const stats = await sharp(image).stats()
  expect(stats.channels.reduce((total, channel) => total + channel.stdev, 0)).toBeGreaterThan(20)
}

async function startFirstBattle(page: Page, mode: 'standard' | 'sandbox') {
  await page.getByRole('button', { name: 'Go to Briar Trial' }).click()
  await expect(page.getByRole('heading', { name: 'Challenge Briar Trial' })).toBeVisible({ timeout: 15_000 })
  if (mode === 'sandbox') await page.getByRole('button', { name: 'Sandbox test' }).click()
  await expect(page.getByTestId('enemy-loadout')).toHaveAttribute('aria-readonly', mode === 'standard' ? 'true' : 'false')
  await page.getByRole('button', { name: /Start AI battle/ }).click()
  await expect(page.locator('.v3-tick-line strong')).toContainText('Tick')
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test('desktop completes the standard loop, viewer controls, report, and replay', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const failures = collectRuntimeFailures(page)
  await page.goto('/')
  await expect(page.getByText('Starbright Frontier').first()).toBeVisible()
  await page.getByRole('link', { name: /Legacy/ }).click()
  await expect(page).toHaveURL(/\/legacy$/)
  await page.getByRole('link', { name: 'Return to V3' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Current mission')).toBeVisible()
  await expect(page.getByTestId('v3-phaser-stage')).toHaveAttribute('data-ready', 'true')
  await expectNonblankCanvas(page)

  await page.getByTestId('v3-phaser-stage').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.v3-hud-strip')).toContainText('4,16')

  await startFirstBattle(page, 'standard')
  await expect.poll(async () => Number((await page.locator('.v3-tick-line strong').textContent())?.replace(/\D/g, '') ?? 0)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Pause' }).click()
  const firstAction = await page.locator('.v3-tick-line span').textContent()
  await page.getByRole('button', { name: 'Step' }).click()
  await expect.poll(() => page.locator('.v3-tick-line span').textContent()).not.toBe(firstAction)
  await page.locator('.v3-viewer-controls select').selectOption('4')
  await page.getByRole('button', { name: 'Resume' }).click()

  await expect(page.locator('.v3-report')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Challenge cleared' })).toBeVisible()
  await expect(page.locator('.v3-report')).toContainText('7319')
  await expect(page.locator('.v3-report')).toContainText('Briar Calibration Pack')
  await page.locator('.v3-report > .v3-filter-line select').selectOption('patch')
  await expect(page.locator('.v3-report-timeline')).toContainText('Strategy adjusted')

  await page.getByRole('button', { name: /Deterministic replay/ }).click()
  await expect(page.locator('.v3-tick-line strong')).toContainText('Tick 0')
  await page.locator('.v3-viewer-controls select').selectOption('4')
  await expect(page.locator('.v3-report')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: /Return to map/ }).click()
  await expect(page.getByRole('heading', { name: 'Adventure route' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('ai-battle-v3-progress') ?? '{}').starlight)).toBe(30)

  expect(failures.consoleErrors).toEqual([])
  expect(failures.failedAssets).toEqual([])
})

test('sandbox battle remains isolated from standard rewards and unlocks', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const failures = collectRuntimeFailures(page)
  await page.goto('/')
  await startFirstBattle(page, 'sandbox')
  await page.locator('.v3-viewer-controls select').selectOption('4')
  await expect(page.locator('.v3-report')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.v3-report')).toContainText('Sandbox tests do not write rewards')
  await page.getByRole('button', { name: /Return to map/ }).click()

  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('ai-battle-v3-progress') ?? '{}'))
  expect(progress.starlight).toBe(0)
  expect(progress.clearedEncounterIds).toEqual([])
  expect(failures.consoleErrors).toEqual([])
  expect(failures.failedAssets).toEqual([])
})

test('mobile keeps the complete battle arena visible without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const failures = collectRuntimeFailures(page)
  await page.goto('/')
  await expectNonblankCanvas(page)
  await startFirstBattle(page, 'standard')
  await page.evaluate(() => scrollTo(0, 0))
  await expectNonblankCanvas(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  await expect(page.locator('.v3-actor-pair')).toBeVisible()
  await expect(page.getByText('AI Reasoning')).toBeVisible()
  expect(failures.consoleErrors).toEqual([])
  expect(failures.failedAssets).toEqual([])
})
