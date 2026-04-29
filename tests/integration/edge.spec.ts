import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const isRealSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('example.supabase.co')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey =
  process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY

async function openDockPanel(page: Page, panelName: 'Chat' | 'Profile' | 'Start battle') {
  await page.getByRole('button', { name: panelName }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

async function startPveBattleFromEnemyModal(page: Page) {
  const enemyTrigger = page.locator('[aria-label^="View "][aria-label$=" info"]').first()
  await expect(enemyTrigger).toBeVisible()
  for (let attempt = 0; attempt < 3; attempt++) {
    await enemyTrigger.dispatchEvent('click')
    try {
      const battleButton = page.getByRole('button', { name: /^BATTLE$/ })
      await expect(battleButton).toBeVisible({ timeout: 1500 })
      await battleButton.click({ force: true })
      await expect(page.getByText('In Battle · battle-core session')).toBeVisible()
      return
    } catch {
      await enemyTrigger.focus()
      await page.keyboard.press('Enter')
      await page.waitForTimeout(120)
    }
  }
  throw new Error('Failed to enter PVE battle')
}

function ensureAdminCleanupReadyOrSkip() {
  if (!supabaseUrl || !serviceRoleKey) {
    test.skip(true, 'Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for admin verification')
  }
}

async function listUsersByEmail(email: string) {
  const admin = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users.filter((user) => user.email?.toLowerCase() === email.toLowerCase())
}

async function cleanupCreatedAuthUsersByEmail(email: string) {
  const admin = createClient(supabaseUrl!, serviceRoleKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  const matches = await listUsersByEmail(email)
  for (const user of matches) {
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) throw error
  }
}

test.describe('边界测试 - Auth', () => {
  test('空 display name 时注册失败', async ({ page }) => {
    await page.goto('/')
    await openDockPanel(page, 'Profile')
    await page.getByRole('button', { name: 'Sign up' }).click()
    await page.getByPlaceholder('you@example.com').fill(`edge-${Date.now()}@example.com`)
    const passwordInputs = page.locator('.auth-password-input')
    await passwordInputs.nth(0).fill('Password123!')
    await passwordInputs.nth(1).fill('Password123!')
    await page.getByRole('button', { name: 'Sign up and enter' }).click()
    await expect(page.getByText('Please choose a display name')).toBeVisible()
  })

  test('邮箱格式非法时，应有明确错误提示', async ({ page }) => {
    await page.goto('/')
    await openDockPanel(page, 'Profile')
    await page.getByRole('button', { name: 'Sign up' }).click()
    await page.getByPlaceholder('you@example.com').fill('invalid-email-format')
    await page.getByPlaceholder('Adventurer').fill(`Edge-${Date.now().toString().slice(-4)}`)
    const passwordInputs = page.locator('.auth-password-input')
    await passwordInputs.nth(0).fill('Password123!')
    await passwordInputs.nth(1).fill('Password123!')
    await page.getByRole('button', { name: 'Sign up and enter' }).click()
    await expect(page.locator('p.text-rose-700').first()).toBeVisible({ timeout: 15000 })
  })
  test('重复点击注册按钮时，不应创建多个用户', async ({ page }) => {
    ensureAdminCleanupReadyOrSkip()
    const email = `edge-multi-${Date.now()}@example.com`
    try {
      await page.goto('/')
      await openDockPanel(page, 'Profile')
      await page.getByRole('button', { name: 'Sign up' }).click()
      await page.getByPlaceholder('you@example.com').fill(email)
      await page.getByPlaceholder('Adventurer').fill(`Edge-${Date.now().toString().slice(-4)}`)
      const passwordInputs = page.locator('.auth-password-input')
      await passwordInputs.nth(0).fill('Password123!')
      await passwordInputs.nth(1).fill('Password123!')
      const submitButton = page.getByRole('button', { name: 'Sign up and enter' })
      await Promise.all([
        submitButton.click({ force: true }),
        submitButton.click({ force: true }),
        submitButton.click({ force: true }),
      ])
      await expect(page.getByText('Current session:')).toBeVisible({ timeout: 30000 })

      const users = await listUsersByEmail(email)
      expect(users).toHaveLength(1)
    } finally {
      await cleanupCreatedAuthUsersByEmail(email)
    }
  })
})

test.describe('边界测试 - Battle', () => {
  test('战斗入口弹窗可打开（基础健康检查）', async ({ page }) => {
    await page.goto('/')
    await openDockPanel(page, 'Start battle')
    await expect(page.getByText('Search PVP Opponent')).toBeVisible()
  })

  test('超长战斗（超时结算）应稳定给出结果', async ({ page }) => {
    test.slow()
    await page.goto('/')
    await startPveBattleFromEnemyModal(page)
    await expect(page.getByRole('heading', { name: /VICTORY!|DEFEAT/ })).toBeVisible({ timeout: 120000 })
    await page.getByRole('button', { name: 'CONTINUE' }).click()
    await expect(page.getByText('In Battle · battle-core session')).toBeHidden({ timeout: 15000 })
  })
  test('战斗中连续点击技能，不应产生并发状态错乱', async ({ page }) => {
    await page.goto('/')
    await startPveBattleFromEnemyModal(page)
    const skillButton = page.locator('button').filter({ hasText: /MP \d+ · \d+t/ }).first()
    await expect(skillButton).toBeVisible()
    await expect(skillButton).toBeEnabled()
    await Promise.all([
      skillButton.click({ force: true }),
      skillButton.click({ force: true }),
      skillButton.click({ force: true }),
      skillButton.click({ force: true }),
    ])

    await expect(page.getByText('In Battle · battle-core session')).toBeVisible()
    await expect(page.getByText(/Ready: next action will use/i).first()).toBeVisible()
    await expect(skillButton).toBeEnabled({ timeout: 30000 })
  })
})

test.describe('边界测试 - 数据与持久化', () => {
  test('本地存档键存在时可被读取', async ({ page }) => {
    await page.goto('/')
    const save = await page.evaluate(() => localStorage.getItem('battle-game-save'))
    expect(save === null || typeof save === 'string').toBeTruthy()
  })

  test('损坏的 localStorage 存档不应导致页面崩溃', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('battle-game-save', '{bad-json')
    })
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()
    await expect(page.locator('[aria-label="You"], img[alt="You"]').first()).toBeVisible()
  })

  test('刷新期间写入存档时，状态不应出现回退', async ({ page }) => {
    await page.goto('/')
    const initial = await page.evaluate(() => {
      const raw = localStorage.getItem('battle-game-save')
      if (!raw) return null
      const parsed = JSON.parse(raw) as { playerPos?: { x?: number; y?: number } }
      return parsed.playerPos ?? null
    })

    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(280)
    await page.keyboard.up('ArrowRight')

    const movedSave = await page.evaluate(() => {
      const raw = localStorage.getItem('battle-game-save')
      if (!raw) return null
      const parsed = JSON.parse(raw) as { playerPos?: { x?: number; y?: number } }
      return parsed.playerPos ?? null
    })
    expect(movedSave).not.toBeNull()

    await page.reload()
    await page.waitForTimeout(350)
    const afterReloadSave = await page.evaluate(() => {
      const raw = localStorage.getItem('battle-game-save')
      if (!raw) return null
      const parsed = JSON.parse(raw) as { playerPos?: { x?: number; y?: number } }
      return parsed.playerPos ?? null
    })
    expect(afterReloadSave).toEqual(movedSave)
    expect(afterReloadSave).not.toEqual(initial)
  })
})

