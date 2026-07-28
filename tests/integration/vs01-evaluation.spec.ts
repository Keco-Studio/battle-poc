import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

import { VS01_ASSETS } from '../../src/content/generated/vs01/assets'

const EVIDENCE_DIR = path.resolve('test-results/vs01-evaluation')
const PROGRESS_KEY = 'battle-poc:vs01-progress'
const SUPABASE_PATH = /\/(auth|rest|storage|functions)\/v1(?:\/|$)/

type Rect = { x: number; y: number; width: number; height: number }

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
}

async function installCleanLocalState(page: Page, unlocked = false) {
  await page.addInitScript(({ key, progress }) => {
    if (sessionStorage.getItem('vs01-evaluation-initialized') === '1') return
    localStorage.clear()
    localStorage.setItem('battle-job-selected', '1')
    localStorage.setItem(key, JSON.stringify(progress))
    sessionStorage.setItem('vs01-evaluation-initialized', '1')
  }, {
    key: PROGRESS_KEY,
    progress: {
      defeatedEnemyIds: unlocked ? ['cinder_wisp', 'iron_husk', 'frost_revenant'] : [],
      completed: false,
    },
  })
}

async function expectPaintedCanvas(page: Page) {
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible()
  await expect.poll(async () => canvas.evaluate((element) => {
    const target = element as HTMLCanvasElement
    const context = target.getContext('2d')
    if (!context || target.width === 0 || target.height === 0) return 0
    const pixels = context.getImageData(0, 0, target.width, target.height).data
    const colors = new Set<string>()
    const pixelStride = Math.max(1, Math.floor((target.width * target.height) / 4096)) * 4
    for (let index = 0; index < pixels.length; index += pixelStride) {
      if (pixels[index + 3] === 0) continue
      colors.add(`${pixels[index]}:${pixels[index + 1]}:${pixels[index + 2]}`)
      if (colors.size >= 12) break
    }
    return colors.size
  }), { timeout: 15_000 }).toBeGreaterThanOrEqual(12)
}

test.beforeAll(async () => {
  await mkdir(EVIDENCE_DIR, { recursive: true })
})

test.describe('VS01 Ember Relay release evidence', () => {
  test.describe.configure({ timeout: 120_000 })

  test('desktop vertical slice is static, playable, and reaches MiniMax', async ({ page }) => {
    const supabaseRequests: string[] = []
    const externalRuntimeRequests: string[] = []
    const aiRequests: string[] = []
    const pageErrors: string[] = []

    page.on('request', (request) => {
      const url = new URL(request.url())
      if (url.hostname.endsWith('.supabase.co') || SUPABASE_PATH.test(url.pathname)) {
        supabaseRequests.push(request.url())
      }
      if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
        externalRuntimeRequests.push(request.url())
      }
      if (url.port === '8787') aiRequests.push(request.url())
    })
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await installCleanLocalState(page)
    await page.goto('/')

    await expect(page.getByTestId('vs01-objective')).toContainText('3 relay threats remaining')
    await expectPaintedCanvas(page)
    await expect(page.locator('[aria-label^="View "][aria-label$=" info"]')).toHaveCount(3)
    await expect(page.getByText('Cinder Wisp Lv.2', { exact: true })).toBeVisible()
    await expect(page.getByText('Iron Husk Lv.3', { exact: true })).toBeVisible()
    await expect(page.getByText('Frost Revenant Lv.4', { exact: true })).toBeVisible()

    const mapCatalogResponse = await page.request.get('/api/maps')
    expect(mapCatalogResponse.status()).toBe(200)
    const mapCatalog = await mapCatalogResponse.json() as {
      defaultMapId?: string
      maps?: Array<{ ref?: string }>
    }
    expect(mapCatalog.defaultMapId).toBe('builtin:emberwatch-causeway')
    expect(mapCatalog.maps?.slice(0, 2).map((item) => item.ref)).toEqual([
      'builtin:emberwatch-causeway',
      'builtin:ashen-relay-core',
    ])

    const mapResponse = await page.request.get('/api/airpg-map?map=builtin%3Aemberwatch-causeway')
    expect(mapResponse.status()).toBe(200)
    const map = await mapResponse.json() as {
      enemies?: Array<{ templateId?: string; skillIds?: string[]; level?: number }>
    }
    expect(map.enemies).toHaveLength(3)
    expect(map.enemies?.map((enemy) => enemy.templateId)).toEqual([
      'cinder_wisp',
      'iron_husk',
      'frost_revenant',
    ])
    expect(map.enemies?.every((enemy) => enemy.skillIds?.length === 2)).toBe(true)
    expect(map.enemies?.map((enemy) => enemy.level)).toEqual([2, 3, 4])

    const assetResponses = await Promise.all(VS01_ASSETS.map((asset) => page.request.get(asset.path)))
    expect(assetResponses.every((response) => response.status() === 200)).toBe(true)

    const mapSelect = page.getByLabel('Select map')
    const coreOption = mapSelect.locator('option[value="builtin:ashen-relay-core"]')
    await expect(coreOption).toBeDisabled()
    await expect(coreOption).toContainText('(Locked)')

    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'desktop-causeway.png') })

    const enemy = page.getByRole('button', { name: 'View Cinder Wisp info' })
    await expect(enemy).toBeVisible()
    await enemy.dispatchEvent('click')
    const battleButton = page.getByRole('button', { name: /^BATTLE$/ })
    await expect(battleButton).toBeVisible()
    await battleButton.click({ force: true })
    await expect(page.getByText('In Battle · battle-core session')).toBeVisible()
    await expect(page.getByText('Decision Mode: dual_llm')).toBeVisible()
    await expect(page.getByText(/LLM Runtime: available/)).toBeVisible({ timeout: 15_000 })
    await expect.poll(() => aiRequests.some((url) => url.endsWith('/api/ai/battle-decision')), {
      timeout: 45_000,
    }).toBe(true)

    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'desktop-battle.png') })

    await page.evaluate(({ key }) => {
      localStorage.setItem(key, JSON.stringify({
        defeatedEnemyIds: ['cinder_wisp', 'iron_husk', 'frost_revenant'],
        completed: false,
      }))
    }, { key: PROGRESS_KEY })
    await page.reload()

    await expect(page.getByTestId('vs01-objective')).toContainText('Enter the Ashen Relay Core')
    await expect(page.getByLabel('Select map').locator('option[value="builtin:ashen-relay-core"]')).toBeEnabled()
    await page.getByLabel('Select map').selectOption('builtin:ashen-relay-core')
    await expect(page.getByTestId('map-status')).toContainText('Ashen Relay Core')
    await expect(page.getByRole('button', { name: 'View Null Custodian info' })).toBeVisible()
    await expectPaintedCanvas(page)
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'desktop-core.png') })

    expect(supabaseRequests).toEqual([])
    expect(externalRuntimeRequests).toEqual([])
    expect(pageErrors).toEqual([])
  })

  test('mobile objective remains readable without covering status panels', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await installCleanLocalState(page)
    await page.goto('/')

    const objective = page.getByTestId('vs01-objective')
    const playerStatus = page.getByTestId('player-status')
    const mapStatus = page.getByTestId('map-status')
    const mapSelector = page.getByTestId('map-selector')
    const mapTools = page.getByTestId('map-tools')
    await expect(objective).toBeVisible()
    await expect(playerStatus).toBeVisible()
    await expect(mapStatus).toBeVisible()

    const boxes = await Promise.all([
      objective.boundingBox(),
      playerStatus.boundingBox(),
      mapStatus.boundingBox(),
      mapSelector.boundingBox(),
      mapTools.boundingBox(),
    ])
    expect(boxes.every(Boolean)).toBe(true)
    for (let left = 0; left < boxes.length; left++) {
      for (let right = left + 1; right < boxes.length; right++) {
        expect(overlaps(boxes[left]!, boxes[right]!)).toBe(false)
      }
    }
    await expectPaintedCanvas(page)

    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'mobile-causeway.png') })
  })
})
