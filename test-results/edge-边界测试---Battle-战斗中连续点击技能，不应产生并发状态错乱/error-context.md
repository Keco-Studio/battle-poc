# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: edge.spec.ts >> 边界测试 - Battle >> 战斗中连续点击技能，不应产生并发状态错乱
- Location: tests/integration/edge.spec.ts:137:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.focus: Target page, context or browser has been closed
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - generic [ref=e3]:
      - generic:
        - button "View Demon Guard info":
          - img "Demon Guard"
          - generic: Demon Guard Lv.1~1
        - button "View Shadow Assassin info":
          - img "Shadow Assassin"
          - generic: Shadow Assassin Lv.1~1
        - generic:
          - img "You"
          - generic: You
    - generic [ref=e5] [cursor=pointer]:
      - generic [ref=e6]:
        - img "Player" [ref=e7]
        - generic [ref=e8]:
          - generic [ref=e9]: WARRIOR
          - generic [ref=e10]: Lv.1
      - generic [ref=e11]:
        - generic [ref=e13]:
          - generic [ref=e14]: HP
          - generic [ref=e15]: 500/500
        - generic [ref=e19]:
          - generic [ref=e20]: MP
          - generic [ref=e21]: 250/250
        - generic [ref=e24]: 💰 0 Gold
    - generic [ref=e25]: "Map: Top-down battle arena · 16x16 (grid) · Fallback render"
    - generic [ref=e26]:
      - text: Map
      - combobox [ref=e27]:
        - option "Top-down battle arena" [selected]
        - option "demo-project"
        - option "pixel-npc"
        - option "top-down-pixel-art-village-map-houses-paths-tree-1776773208725"
    - generic [ref=e28]:
      - button "Sync PixelLab Resource" [ref=e29] [cursor=pointer]
      - button "Generate PixelLab Map" [ref=e30] [cursor=pointer]
      - button "Edit Collision" [ref=e31] [cursor=pointer]
    - generic [ref=e32]:
      - generic [ref=e33]:
        - button "Battle history" [ref=e34] [cursor=pointer]:
          - img [ref=e35]
        - generic: Battle history
      - generic [ref=e41]:
        - button "Battle log" [ref=e42] [cursor=pointer]:
          - img [ref=e43]
        - generic: Battle log
      - generic [ref=e46]:
        - button "Chat" [ref=e47] [cursor=pointer]:
          - img [ref=e48]
        - generic: Chat
      - generic [ref=e50]:
        - button "Start battle" [ref=e51] [cursor=pointer]:
          - img [ref=e52]
        - generic: Start battle
      - generic [ref=e61]:
        - button "Profile" [ref=e62] [cursor=pointer]:
          - img [ref=e63]
        - generic: Profile
  - status [ref=e66]:
    - generic [ref=e67]:
      - img [ref=e69]
      - generic [ref=e71]:
        - text: Static route
        - button "Hide static indicator" [ref=e72] [cursor=pointer]:
          - img [ref=e73]
  - alert [ref=e76]
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test'
  2   | import { createClient } from '@supabase/supabase-js'
  3   | 
  4   | const isRealSupabase =
  5   |   !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  6   |   !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  7   |   !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('example.supabase.co')
  8   | const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  9   | const serviceRoleKey =
  10  |   process.env.PLAYWRIGHT_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  11  | 
  12  | async function openDockPanel(page: Page, panelName: 'Chat' | 'Profile' | 'Start battle') {
  13  |   await page.getByRole('button', { name: panelName }).click()
  14  |   await expect(page.getByRole('dialog')).toBeVisible()
  15  | }
  16  | 
  17  | async function startPveBattleFromEnemyModal(page: Page) {
  18  |   const enemyTrigger = page.locator('[aria-label^="View "][aria-label$=" info"]').first()
  19  |   await expect(enemyTrigger).toBeVisible()
  20  |   for (let attempt = 0; attempt < 3; attempt++) {
  21  |     await enemyTrigger.dispatchEvent('click')
  22  |     try {
  23  |       const battleButton = page.getByRole('button', { name: /^BATTLE$/ })
  24  |       await expect(battleButton).toBeVisible({ timeout: 1500 })
  25  |       await battleButton.click({ force: true })
  26  |       await expect(page.getByText('In Battle · battle-core session')).toBeVisible()
  27  |       return
  28  |     } catch {
> 29  |       await enemyTrigger.focus()
      |                          ^ Error: locator.focus: Target page, context or browser has been closed
  30  |       await page.keyboard.press('Enter')
  31  |       await page.waitForTimeout(120)
  32  |     }
  33  |   }
  34  |   throw new Error('Failed to enter PVE battle')
  35  | }
  36  | 
  37  | function ensureAdminCleanupReadyOrSkip() {
  38  |   if (!supabaseUrl || !serviceRoleKey) {
  39  |     test.skip(true, 'Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for admin verification')
  40  |   }
  41  | }
  42  | 
  43  | async function listUsersByEmail(email: string) {
  44  |   const admin = createClient(supabaseUrl!, serviceRoleKey!, {
  45  |     auth: {
  46  |       autoRefreshToken: false,
  47  |       persistSession: false,
  48  |     },
  49  |   })
  50  |   const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  51  |   if (error) throw error
  52  |   return data.users.filter((user) => user.email?.toLowerCase() === email.toLowerCase())
  53  | }
  54  | 
  55  | async function cleanupCreatedAuthUsersByEmail(email: string) {
  56  |   const admin = createClient(supabaseUrl!, serviceRoleKey!, {
  57  |     auth: {
  58  |       autoRefreshToken: false,
  59  |       persistSession: false,
  60  |     },
  61  |   })
  62  |   const matches = await listUsersByEmail(email)
  63  |   for (const user of matches) {
  64  |     const { error } = await admin.auth.admin.deleteUser(user.id)
  65  |     if (error) throw error
  66  |   }
  67  | }
  68  | 
  69  | test.describe('边界测试 - Auth', () => {
  70  |   test('空 display name 时注册失败', async ({ page }) => {
  71  |     await page.goto('/')
  72  |     await openDockPanel(page, 'Profile')
  73  |     await page.getByRole('button', { name: 'Sign up' }).click()
  74  |     await page.getByPlaceholder('you@example.com').fill(`edge-${Date.now()}@example.com`)
  75  |     const passwordInputs = page.locator('.auth-password-input')
  76  |     await passwordInputs.nth(0).fill('Password123!')
  77  |     await passwordInputs.nth(1).fill('Password123!')
  78  |     await page.getByRole('button', { name: 'Sign up and enter' }).click()
  79  |     await expect(page.getByText('Please choose a display name')).toBeVisible()
  80  |   })
  81  | 
  82  |   test('邮箱格式非法时，应有明确错误提示', async ({ page }) => {
  83  |     await page.goto('/')
  84  |     await openDockPanel(page, 'Profile')
  85  |     await page.getByRole('button', { name: 'Sign up' }).click()
  86  |     await page.getByPlaceholder('you@example.com').fill('invalid-email-format')
  87  |     await page.getByPlaceholder('Adventurer').fill(`Edge-${Date.now().toString().slice(-4)}`)
  88  |     const passwordInputs = page.locator('.auth-password-input')
  89  |     await passwordInputs.nth(0).fill('Password123!')
  90  |     await passwordInputs.nth(1).fill('Password123!')
  91  |     await page.getByRole('button', { name: 'Sign up and enter' }).click()
  92  |     await expect(page.locator('p.text-rose-700').first()).toBeVisible({ timeout: 15000 })
  93  |   })
  94  |   test('重复点击注册按钮时，不应创建多个用户', async ({ page }) => {
  95  |     ensureAdminCleanupReadyOrSkip()
  96  |     const email = `edge-multi-${Date.now()}@example.com`
  97  |     try {
  98  |       await page.goto('/')
  99  |       await openDockPanel(page, 'Profile')
  100 |       await page.getByRole('button', { name: 'Sign up' }).click()
  101 |       await page.getByPlaceholder('you@example.com').fill(email)
  102 |       await page.getByPlaceholder('Adventurer').fill(`Edge-${Date.now().toString().slice(-4)}`)
  103 |       const passwordInputs = page.locator('.auth-password-input')
  104 |       await passwordInputs.nth(0).fill('Password123!')
  105 |       await passwordInputs.nth(1).fill('Password123!')
  106 |       const submitButton = page.getByRole('button', { name: 'Sign up and enter' })
  107 |       await Promise.all([
  108 |         submitButton.click({ force: true }),
  109 |         submitButton.click({ force: true }),
  110 |         submitButton.click({ force: true }),
  111 |       ])
  112 |       await expect(page.getByText('Current session:')).toBeVisible({ timeout: 30000 })
  113 | 
  114 |       const users = await listUsersByEmail(email)
  115 |       expect(users).toHaveLength(1)
  116 |     } finally {
  117 |       await cleanupCreatedAuthUsersByEmail(email)
  118 |     }
  119 |   })
  120 | })
  121 | 
  122 | test.describe('边界测试 - Battle', () => {
  123 |   test('战斗入口弹窗可打开（基础健康检查）', async ({ page }) => {
  124 |     await page.goto('/')
  125 |     await openDockPanel(page, 'Start battle')
  126 |     await expect(page.getByText('Search PVP Opponent')).toBeVisible()
  127 |   })
  128 | 
  129 |   test('超长战斗（超时结算）应稳定给出结果', async ({ page }) => {
```