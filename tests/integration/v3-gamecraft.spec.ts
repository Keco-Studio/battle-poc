import { expect, test, type Page } from '@playwright/test'
import sharp from 'sharp'

const outputRoot = 'test-results/v3-gamecraft'

type Progress = {
  schemaVersion: 1
  clearedEncounterIds: string[]
  unlockedEncounterIds: string[]
  exp: number
  starlight: number
  drops: string[]
  playerPosition: { x: number; y: number }
  battleRecords: unknown[]
}

function completedPrerequisites(): Progress {
  return {
    schemaVersion: 1,
    clearedEncounterIds: ['briar_trial', 'sunforge_trial', 'prism_trial'],
    unlockedEncounterIds: ['briar_trial', 'sunforge_trial', 'prism_trial', 'marshal_gate'],
    exp: 150,
    starlight: 105,
    drops: ['bloom_core', 'sunforge_coil', 'prism_lens'],
    playerPosition: { x: 3, y: 16 },
    battleRecords: [],
  }
}

function runtimeEvidence(page: Page) {
  const consoleErrors: string[] = []
  const failedAssets: string[] = []
  const externalRequests: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/assets/')) failedAssets.push(`${response.status()} ${response.url()}`)
  })
  page.on('request', (request) => {
    const url = request.url()
    if (url.startsWith('data:') || url.startsWith('blob:')) return
    if (new URL(url).origin !== 'http://127.0.0.1:3004') externalRequests.push(url)
  })
  return { consoleErrors, failedAssets, externalRequests }
}

async function expectCanvasPixels(page: Page) {
  const image = await page.locator('canvas').screenshot()
  const stats = await sharp(image).stats()
  expect(stats.channels.reduce((sum, channel) => sum + channel.stdev, 0)).toBeGreaterThan(20)
}

async function installProgress(page: Page, progress: Progress) {
  await page.addInitScript((value) => {
    localStorage.setItem('ai-battle-v3-progress', JSON.stringify(value))
  }, progress)
}

async function travelTo(page: Page, encounterName: string) {
  await page.getByRole('button', { name: `Go to ${encounterName}` }).click()
  await expect(page.getByRole('heading', { name: `Challenge ${encounterName}` })).toBeVisible({ timeout: 20_000 })
}

async function choosePlayerSkills(page: Page, skillIds: string[]) {
  const selectors = page.locator('.v3-build-column').first().locator('.v3-skill-slot select')
  await expect(selectors).toHaveCount(4)
  for (let index = 0; index < skillIds.length; index += 1) await selectors.nth(index).selectOption(skillIds[index])
}

async function runBattle(page: Page) {
  await page.getByRole('button', { name: /Start AI battle/ }).click()
  await page.locator('.v3-viewer-controls select').selectOption('4')
  await expect(page.locator('.v3-report')).toBeVisible({ timeout: 30_000 })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test('travel commits intermediate cells before opening preparation', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const evidence = runtimeEvidence(page)
  await page.goto('/')
  await expect(page.getByTestId('v3-phaser-stage')).toHaveAttribute('data-ready', 'true')
  await expectCanvasPixels(page)

  await page.getByRole('button', { name: 'Go to Briar Trial' }).click()
  const seen = new Set<string>()
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (await page.getByRole('heading', { name: 'Challenge Briar Trial' }).isVisible().catch(() => false)) break
    const text = await page.locator('.v3-hud-strip').textContent({ timeout: 100 }).catch(() => null)
    if (!text) {
      await page.waitForTimeout(30)
      continue
    }
    const coordinate = text.match(/\d+,\d+/)?.[0]
    if (coordinate) seen.add(coordinate)
    if (seen.size === 2) await page.screenshot({ path: `${outputRoot}/exploration-travel.png`, fullPage: true })
    await page.waitForTimeout(60)
  }
  await expect(page.getByRole('heading', { name: 'Challenge Briar Trial' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const progress = JSON.parse(localStorage.getItem('ai-battle-v3-progress') ?? '{}')
    return `${progress.playerPosition?.x},${progress.playerPosition?.y}`
  })).toBe('9,14')
  expect(seen.size).toBeGreaterThanOrEqual(4)
  expect(evidence.consoleErrors).toEqual([])
  expect(evidence.failedAssets).toEqual([])
  expect(evidence.externalRequests).toEqual([])
})

test('sunforge defeat gives evidence and an adjusted build can win', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await travelTo(page, 'Sunforge Trial')
  await runBattle(page)
  await expect(page.getByRole('heading', { name: 'Challenge failed' })).toBeVisible()
  await expect(page.locator('.v3-report-insights')).toContainText('Next adjustments')
  await page.screenshot({ path: `${outputRoot}/sunforge-defeat.png`, fullPage: true })

  await page.getByRole('button', { name: /Return to map/ }).click()
  await travelTo(page, 'Sunforge Trial')
  await choosePlayerSkills(page, ['bloom_guard', 'prism_snare', 'meteor_arc', 'comet_break'])
  await runBattle(page)
  await expect(page.getByRole('heading', { name: 'Challenge cleared' })).toBeVisible()
  await expect(page.locator('.v3-report-insights')).toContainText('Keys to victory')
  await page.screenshot({ path: `${outputRoot}/sunforge-adjusted-victory.png`, fullPage: true })
})

test('earned progression enables a boss victory and deterministic replay', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await installProgress(page, completedPrerequisites())
  await page.goto('/')
  await expect(page.getByText('3 / 4')).toBeVisible()
  await travelTo(page, 'Eclipse Gate')
  await expect(page.getByLabel('Expedition bonuses')).toContainText('HP +18')
  await expect(page.getByLabel('Expedition bonuses')).toContainText('Energy +20')
  await choosePlayerSkills(page, ['solar_lance', 'bloom_guard', 'gale_step', 'echo_bolt'])
  await page.screenshot({ path: `${outputRoot}/boss-preparation.png`, fullPage: true })
  await runBattle(page)
  await expect(page.getByRole('heading', { name: 'Challenge cleared' })).toBeVisible()
  const firstResult = await page.locator('.v3-report header h2').innerText()
  await page.screenshot({ path: `${outputRoot}/boss-victory.png`, fullPage: true })

  await page.getByRole('button', { name: /Deterministic replay/ }).click()
  await page.locator('.v3-viewer-controls select').selectOption('4')
  await expect(page.locator('.v3-report')).toBeVisible({ timeout: 30_000 })
  expect(await page.locator('.v3-report header h2').innerText()).toBe(firstResult)
  await page.getByRole('button', { name: /Return to map/ }).click()
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('ai-battle-v3-progress') ?? '{}'))
  expect(progress.clearedEncounterIds).toContain('marshal_gate')
  expect(progress.starlight).toBe(205)
})

test('mobile battle stays framed, local, and free of engine tokens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const evidence = runtimeEvidence(page)
  await page.goto('/')
  await travelTo(page, 'Briar Trial')
  await page.getByRole('button', { name: /Start AI battle/ }).click()
  await expect(page.locator('.v3-actor-pair')).toBeVisible()
  await expectCanvasPixels(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0)
  const visibleText = await page.locator('body').innerText()
  for (const token of ['left_win', 'right_win', 'hp_zero', 'accepted:', 'not_equipped', 'set_threshold']) {
    expect(visibleText).not.toContain(token)
  }
  await page.screenshot({ path: `${outputRoot}/mobile-battle.png`, fullPage: true })
  expect(evidence.consoleErrors).toEqual([])
  expect(evidence.failedAssets).toEqual([])
  expect(evidence.externalRequests).toEqual([])
})
