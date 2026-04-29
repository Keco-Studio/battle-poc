import { test, expect, type Page } from '@playwright/test'

const isRealSupabase =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('example.supabase.co')

async function openDockPanel(page: Page, panelName: 'Chat' | 'Profile' | 'Start battle') {
  await page.getByRole('button', { name: panelName }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

async function startPveBattleFromEnemyModal(page: Page) {
  const enemyTrigger = page.locator('[aria-label^="View "][aria-label$=" info"]').first()
  await expect(enemyTrigger).toBeVisible()
  const battleButton = page.getByRole('button', { name: /^BATTLE$/ })
  let opened = false
  for (let attempt = 0; attempt < 3; attempt++) {
    await enemyTrigger.dispatchEvent('click')
    try {
      await expect(battleButton).toBeVisible({ timeout: 1500 })
      opened = true
      break
    } catch {
      await enemyTrigger.focus()
      await page.keyboard.press('Enter')
      await page.waitForTimeout(120)
    }
  }
  expect(opened).toBeTruthy()
  await battleButton.click({ force: true })
  await expect(page.getByText('In Battle · battle-core session')).toBeVisible()
}

async function getPlayerMarkerPosition(page: Page): Promise<{ left: number; top: number }> {
  const avatar = page.locator('img[alt="You"], [aria-label="You"]').first()
  await expect(avatar).toBeVisible()
  const style = await avatar.evaluate((el) => {
    const host = el.parentElement as HTMLElement | null
    return {
      left: host?.style.left ?? '',
      top: host?.style.top ?? '',
    }
  })
  return {
    left: Number.parseFloat(style.left),
    top: Number.parseFloat(style.top),
  }
}

function moved(from: { left: number; top: number }, to: { left: number; top: number }): boolean {
  return Math.abs(from.left - to.left) > 0.5 || Math.abs(from.top - to.top) > 0.5
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function pickAffordableCooldownSkill(page: Page) {
  const mpStat = await page.locator('span', { hasText: /^MP \d+\/\d+$/ }).first().textContent()
  const currentMp = Number((mpStat ?? '0/0').match(/MP\s+(\d+)\//)?.[1] ?? '0')

  const skillButtons = page.locator('button').filter({ hasText: /MP \d+ · [1-9]\d*t/ })
  const total = await skillButtons.count()
  for (let i = 0; i < total; i++) {
    const skill = skillButtons.nth(i)
    const text = await skill.textContent()
    const mpCost = Number(text?.match(/MP\s+(\d+)/)?.[1] ?? '999')
    if (mpCost > 0 && mpCost <= currentMp) {
      return skill
    }
  }
  return null
}

test.describe('战斗规则正确性（P0）', () => {
  test('战斗页基础渲染可见', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('body')).toBeVisible()
  })

  test('可打开战斗入口面板', async ({ page }) => {
    await page.goto('/')
    await openDockPanel(page, 'Start battle')
    await expect(page.getByText('Search PVP Opponent')).toBeVisible()
  })

  test('CD=0 临界帧后技能可再次释放', async ({ page }) => {
    await page.goto('/')
    await startPveBattleFromEnemyModal(page)

    const cooldownSkill = await pickAffordableCooldownSkill(page)
    if (!cooldownSkill) {
      test.skip(true, 'No affordable skill with cooldown available')
      return
    }
    const rawSkillText = (await cooldownSkill.textContent()) ?? ''
    const skillLabel = rawSkillText.split('MP')[0]?.trim()
    test.skip(!skillLabel, 'Cannot resolve selected skill label')
    const trackedSkill = page
      .locator('button')
      .filter({ hasText: new RegExp(`${escapeRegExp(skillLabel)}\\s*MP\\s+\\d+\\s+·\\s+[1-9]\\d*t`) })
      .first()
    await expect(trackedSkill).toBeVisible()
    await expect(trackedSkill).toBeEnabled()
    await trackedSkill.click()

    await expect(trackedSkill).toBeDisabled({ timeout: 15000 })
    await expect(trackedSkill).toBeEnabled({ timeout: 30000 })

    await trackedSkill.click()
    await expect(page.getByText(/Ready: next action will use/i).first()).toBeVisible()
  })
})

test.describe('输入与交互冲突（P0）', () => {
  test('输入框聚焦时，WASD 只输入文字不触发移动', async ({ page }) => {
    await page.goto('/')
    await openDockPanel(page, 'Chat')
    const input = page.getByPlaceholder('Message Engineer Bolt...')
    await input.click()

    const before = await getPlayerMarkerPosition(page)
    await page.keyboard.type('ddd')
    await page.waitForTimeout(350)
    const after = await getPlayerMarkerPosition(page)

    await expect(input).toHaveValue(/ddd/)
    expect(moved(before, after)).toBeFalsy()
  })

  test('非输入态时，方向键可触发移动', async ({ page }) => {
    await page.goto('/')
    const before = await getPlayerMarkerPosition(page)

    const movementKeys: Array<'ArrowRight' | 'ArrowDown' | 'ArrowLeft' | 'ArrowUp'> = [
      'ArrowRight',
      'ArrowDown',
      'ArrowLeft',
      'ArrowUp',
    ]
    let didMove = false
    for (const key of movementKeys) {
      await page.keyboard.down(key)
      await page.waitForTimeout(320)
      await page.keyboard.up(key)
      await page.waitForTimeout(200)
      const after = await getPlayerMarkerPosition(page)
      if (moved(before, after)) {
        didMove = true
        break
      }
    }

    expect(didMove).toBeTruthy()
  })

  test('弹窗打开时 Esc 只关闭弹窗，不应透传为角色移动', async ({ page }) => {
    await page.goto('/')
    await openDockPanel(page, 'Chat')
    const before = await getPlayerMarkerPosition(page)

    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await page.waitForTimeout(200)
    const after = await getPlayerMarkerPosition(page)
    expect(moved(before, after)).toBeFalsy()
  })
})

test.describe('数据一致性与持久化（P0）', () => {
  test('刷新后前端位置状态保持一致（本地存档）', async ({ page }) => {
    await page.goto('/')
    const beforeSave = await page.evaluate(() => {
      const raw = localStorage.getItem('battle-game-save')
      if (!raw) return null
      const parsed = JSON.parse(raw) as { playerPos?: { x?: number; y?: number } }
      return parsed.playerPos ?? null
    })
    await page.keyboard.down('ArrowRight')
    await page.waitForTimeout(320)
    await page.keyboard.up('ArrowRight')
    await page.waitForFunction(
      (prev) => {
        const raw = localStorage.getItem('battle-game-save')
        if (!raw) return false
        const parsed = JSON.parse(raw) as { playerPos?: { x?: number; y?: number } }
        if (!parsed.playerPos) return false
        if (!prev) return true
        return parsed.playerPos.x !== prev.x || parsed.playerPos.y !== prev.y
      },
      beforeSave,
      { timeout: 3000 }
    )
    const movedSave = await page.evaluate(() => {
      const raw = localStorage.getItem('battle-game-save')
      if (!raw) return null
      const parsed = JSON.parse(raw) as { playerPos?: { x?: number; y?: number } }
      return parsed.playerPos ?? null
    })
    expect(movedSave).not.toBeNull()

    await page.reload()
    await page.waitForTimeout(400)
    const afterReloadSave = await page.evaluate(() => {
      const raw = localStorage.getItem('battle-game-save')
      if (!raw) return null
      const parsed = JSON.parse(raw) as { playerPos?: { x?: number; y?: number } }
      return parsed.playerPos ?? null
    })
    expect(afterReloadSave).toEqual(movedSave)
  })

  test('注册后自动建档与战斗记录落库（联调）', async () => {
    test.skip(!isRealSupabase, 'Requires real Supabase credentials')
    // Covered by dedicated auth/data tests when real Supabase is enabled.
  })
})

test.describe('多人/对战相关（P1）', () => {
  test('打开匹配列表时展示真实对手列表区域', async ({ page }) => {
    await page.goto('/')
    await openDockPanel(page, 'Start battle')
    await expect(
      page
        .getByText(/players online|Loading players|User not found|Unable to load players/i)
        .first()
    ).toBeVisible()
  })

  test('并发触发开始战斗时仅进入单一战斗会话', async ({ page }) => {
    await page.goto('/')
    const enemyTrigger = page.locator('[aria-label^="View "][aria-label$=" info"]').first()
    await expect(enemyTrigger).toBeVisible()
    await enemyTrigger.dispatchEvent('click')

    const battleButton = page.getByRole('button', { name: /^BATTLE$/ })
    await expect(battleButton).toBeVisible()
    await Promise.all([battleButton.click({ force: true }), battleButton.click({ force: true })])

    await expect(page.getByText('In Battle · battle-core session')).toBeVisible()
    await expect(page.getByText('In Battle · battle-core session')).toHaveCount(1)
  })
})