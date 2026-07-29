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
  await page.getByRole('button', { name: '前往青藤试炼' }).click()
  await expect(page.getByRole('heading', { name: '挑战 青藤试炼' })).toBeVisible({ timeout: 15_000 })
  if (mode === 'sandbox') await page.getByRole('button', { name: '自由测试' }).click()
  await expect(page.getByTestId('enemy-loadout')).toHaveAttribute('aria-readonly', mode === 'standard' ? 'true' : 'false')
  await page.getByRole('button', { name: /开始 AI 对战/ }).click()
  await expect(page.locator('.v3-tick-line strong')).toContainText('Tick')
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
})

test('desktop completes the standard loop, viewer controls, report, and replay', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const failures = collectRuntimeFailures(page)
  await page.goto('/')
  await expect(page.getByText('星辉边境 / Starbright Frontier')).toBeVisible()
  await page.getByRole('link', { name: /旧版/ }).click()
  await expect(page).toHaveURL(/\/legacy$/)
  await page.getByRole('link', { name: '返回新版 V3' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('当前任务')).toBeVisible()
  await expect(page.getByTestId('v3-phaser-stage')).toHaveAttribute('data-ready', 'true')
  await expectNonblankCanvas(page)

  await page.getByTestId('v3-phaser-stage').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('.v3-hud-strip')).toContainText('4,16')

  await startFirstBattle(page, 'standard')
  await expect.poll(async () => Number((await page.locator('.v3-tick-line strong').textContent())?.replace(/\D/g, '') ?? 0)).toBeGreaterThan(0)
  await page.getByRole('button', { name: '暂停' }).click()
  const firstAction = await page.locator('.v3-tick-line span').textContent()
  await page.getByRole('button', { name: '单步' }).click()
  await expect.poll(() => page.locator('.v3-tick-line span').textContent()).not.toBe(firstAction)
  await page.locator('.v3-viewer-controls select').selectOption('4')
  await page.getByRole('button', { name: '继续' }).click()

  await expect(page.locator('.v3-report')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: '挑战成功' })).toBeVisible()
  await expect(page.locator('.v3-report')).toContainText('7319')
  await expect(page.locator('.v3-report')).toContainText('青叶校准包')
  await page.locator('.v3-report > .v3-filter-line select').selectOption('patch')
  await expect(page.locator('.v3-report-timeline')).toContainText('策略已调整')

  await page.getByRole('button', { name: /确定性重放/ }).click()
  await expect(page.locator('.v3-tick-line strong')).toContainText('Tick 0')
  await page.locator('.v3-viewer-controls select').selectOption('4')
  await expect(page.locator('.v3-report')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: /返回地图/ }).click()
  await expect(page.getByRole('heading', { name: '冒险路线' })).toBeVisible()
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
  await expect(page.locator('.v3-report')).toContainText('自由测试不会写入奖励')
  await page.getByRole('button', { name: /返回地图/ }).click()

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
  await expect(page.getByText('AI 思路')).toBeVisible()
  expect(failures.consoleErrors).toEqual([])
  expect(failures.failedAssets).toEqual([])
})
