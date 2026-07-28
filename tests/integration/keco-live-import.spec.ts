import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { createClient, type Session } from '@supabase/supabase-js'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PROJECT_ID = 'fc3376fb-b6b8-42b0-8a16-459916e41da2'
const OWNER_ID = '33b7f9c6-7310-4100-b51d-fff916e38ab2'
const OWNER_EMAIL = 'ghjjy35786@gmail.com'
const PROJECT_REF = 'lulrcirmwwvvnupmwqcq'
const EVIDENCE_DIR = path.resolve('test-results/keco-live-import-2026-07-27')
const SOURCE_PATH = path.resolve('tests/fixtures/keco-live-import/source-readback.json')

const IMPORT_STORAGE_KEYS = [
  'battle-poc-skill-drafts-v1',
  'battle-poc-skill-modules-v1',
  'battle-poc-job-drafts-v1',
  'battle-poc-job-modules-v1',
  'battle-poc-game-config-drafts-v1',
  'battle-poc-game-config-modules-v1',
] as const

type SourceRow = {
  rowId: string
  rowIndex: number
  values: Record<string, string | number>
}

type SourceTable = {
  tableId: string
  fields: Record<string, string>
  rows: SourceRow[]
}

type SourceReadback = {
  projectId: string
  projectName: string
  capturedAt: string
  updatedAt?: string
  refresh?: {
    changes: Array<{
      table: string
      rowId: string
      field: string
      before: number
      after: number
      sourceUpdatedAt: string
    }>
  }
  tables: Record<string, SourceTable>
}

async function createOwnerSession(): Promise<Session> {
  const accessToken = (
    await fs.readFile(path.join(os.homedir(), '.supabase', 'access-token'), 'utf8')
  ).trim()
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/api-keys`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!response.ok) throw new Error(`Supabase Management API returned ${response.status}`)

  const keys = (await response.json()) as Array<{ name: string; api_key: string }>
  const serviceRoleKey = keys.find((key) => key.name === 'service_role')?.api_key
  const anonKey = keys.find((key) => key.name === 'anon')?.api_key
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !anonKey || !supabaseUrl) {
    throw new Error('Hosted Supabase URL or API keys are unavailable')
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const owner = await admin.auth.admin.getUserById(OWNER_ID)
  if (owner.error) throw owner.error
  expect(owner.data.user.email).toBe(OWNER_EMAIL)

  const link = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: OWNER_EMAIL,
  })
  if (link.error) throw link.error

  const auth = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const verified = await auth.auth.verifyOtp({
    type: 'email',
    token_hash: link.data.properties.hashed_token,
  })
  if (verified.error) throw verified.error
  if (!verified.data.session) throw new Error('One-time owner session was not created')
  expect(verified.data.user?.id).toBe(OWNER_ID)
  return verified.data.session
}

async function seedOwnerSession(context: BrowserContext, session: Session): Promise<void> {
  await context.addCookies([
    {
      name: 'sb-session',
      value: JSON.stringify(session),
      url: 'http://localhost:3002',
      sameSite: 'Lax',
    },
  ])
  await context.addInitScript((keys: readonly string[]) => {
    for (const key of keys) window.localStorage.removeItem(key)
    window.localStorage.setItem('battle-job-selected', '1')
  }, IMPORT_STORAGE_KEYS)
}

async function selectOption(
  scope: Locator,
  ariaLabel: string,
  optionLabel: string,
): Promise<void> {
  const trigger = scope.getByRole('button', { name: ariaLabel })
  await expect(trigger).toBeEnabled({ timeout: 90_000 })
  await trigger.click()
  await scope.getByRole('option', { name: optionLabel, exact: true }).click()
}

async function openImport(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Import', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Skills, class stats, equipment, loadouts, and battle formulas'))
    .toBeVisible()
  return dialog
}

async function openCategory(dialog: Locator, title: string): Promise<void> {
  await dialog.getByRole('button').filter({ hasText: title }).first().click()
  await expect(dialog.getByText(title, { exact: true }).first()).toBeVisible()
}

async function backToCategories(dialog: Locator): Promise<void> {
  await dialog.getByRole('button', { name: '返回列表' }).click()
  await expect(dialog.getByText('Skills, class stats, equipment, loadouts, and battle formulas'))
    .toBeVisible()
}

async function importConfigCategory(
  page: Page,
  dialog: Locator,
  categoryTitle: string,
  tableName: string,
  rowIds: string[],
  kind: string,
  moduleNeedle: string,
): Promise<void> {
  await openCategory(dialog, categoryTitle)
  await selectOption(dialog, 'Studio library', `battle-poc / ${tableName}`)
  for (const rowId of rowIds) {
    await expect(dialog.getByLabel(rowId, { exact: true })).toBeVisible({ timeout: 30_000 })
    await dialog.getByLabel(rowId, { exact: true }).check()
  }
  await dialog.getByRole('button', { name: `Import selected (${rowIds.length})` }).click()
  await expect.poll(
    () => page.evaluate(
      ({ storageKey, expectedKind }) => {
        const raw = window.localStorage.getItem(storageKey)
        if (!raw) return 0
        const parsed = JSON.parse(raw) as { drafts?: Array<{ kind?: string }> }
        return (parsed.drafts ?? []).filter((draft) => draft.kind === expectedKind).length
      },
      { storageKey: 'battle-poc-game-config-drafts-v1', expectedKind: kind },
    ),
    { timeout: 30_000 },
  ).toBe(rowIds.length)
  await dialog.getByRole('button', { name: 'Validate & apply' }).click()
  await expect.poll(
    () => page.evaluate(
      ({ storageKey, needle }) =>
        window.localStorage.getItem(storageKey)?.includes(needle) ?? false,
      { storageKey: 'battle-poc-game-config-modules-v1', needle: moduleNeedle },
    ),
    { timeout: 30_000 },
  ).toBe(true)
  await backToCategories(dialog)
}

async function readImportStorage(page: Page): Promise<Record<string, string>> {
  return page.evaluate((keys: readonly string[]) => {
    const entries = keys.map((key) => [key, window.localStorage.getItem(key) ?? ''])
    return Object.fromEntries(entries)
  }, IMPORT_STORAGE_KEYS)
}

test.describe.skip('legacy Supabase integration - disabled in local Web mode', () => {
  test.skip(process.env.KECO_LIVE_IMPORT !== '1', 'Set KECO_LIVE_IMPORT=1 to run')
  test.describe.configure({ timeout: 600_000 })

  test('imports and applies every supported Studio category', async ({ context, page }) => {
    page.setDefaultTimeout(90_000)
    page.on('response', (response) => {
      if (response.status() >= 400) {
        console.error(`HTTP ${response.status()} ${new URL(response.url()).pathname}`)
      }
    })
    const source = JSON.parse(await fs.readFile(SOURCE_PATH, 'utf8')) as SourceReadback
    expect(source.projectId).toBe(PROJECT_ID)
    expect(source.projectName).toBe('battle-poc')

    const session = await createOwnerSession()
    await seedOwnerSession(context, session)
    await page.goto('/')

    await page.getByRole('button', { name: 'Profile' }).click()
    await expect(page.getByText('Current session:')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(OWNER_EMAIL)).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click()

    const dialog = await openImport(page)

    await openCategory(dialog, 'Skills')
    await selectOption(dialog, 'Studio library table', 'battle-poc / Skills')
    await dialog.getByRole('button', { name: 'Studio library table' }).click()
    await expect(dialog.getByRole('option', { name: 'battle-poc / Jobs', exact: true }))
      .toBeVisible()
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '00-table-discovery.png') })
    await dialog.getByRole('button', { name: 'Studio library table' }).click()
    for (const id of ['mcp_chain_flame', 'mcp_chain_frost']) {
      await expect(dialog.getByLabel(id, { exact: true })).toBeVisible({ timeout: 30_000 })
      await dialog.getByLabel(id, { exact: true }).check()
    }
    await dialog.getByRole('button', { name: 'Import selected (2)' }).click()
    await expect.poll(
      () => page.evaluate(() => {
        const raw = window.localStorage.getItem('battle-poc-skill-drafts-v1')
        return raw ? (JSON.parse(raw).drafts?.length ?? 0) : 0
      }),
      { timeout: 30_000 },
    ).toBe(2)
    await dialog.getByRole('button', { name: 'Apply to catalog' }).click()
    await expect(dialog.getByText(/Applied \d+ skill\(s\) from Studio drafts/)).toBeVisible({
      timeout: 30_000,
    })
    await backToCategories(dialog)

    await openCategory(dialog, 'Class stats')
    await selectOption(dialog, 'Studio library table', 'battle-poc / Jobs')
    await expect(dialog.getByLabel('mcp_chain_mage', { exact: true })).toBeVisible({
      timeout: 30_000,
    })
    await dialog.getByLabel('mcp_chain_mage', { exact: true }).check()
    await dialog.getByRole('button', { name: 'Import selected' }).click()
    await expect.poll(
      () => page.evaluate(() => {
        const raw = window.localStorage.getItem('battle-poc-job-drafts-v1')
        return raw ? (JSON.parse(raw).drafts?.length ?? 0) : 0
      }),
      { timeout: 30_000 },
    ).toBe(1)
    await dialog.getByRole('button', { name: 'Validate & apply' }).click()
    await expect(dialog.getByText('Applied class stats from Studio drafts')).toBeVisible({
      timeout: 30_000,
    })
    await backToCategories(dialog)

    await importConfigCategory(
      page,
      dialog,
      'Equipment slots',
      'Equipment',
      ['weapon'],
      'equipment',
      'MCP Relay Blade',
    )
    await importConfigCategory(
      page,
      dialog,
      'Class loadouts',
      'Loadouts',
      ['mcp_chain_mage'],
      'loadout',
      'mcp_chain_frost',
    )
    await importConfigCategory(
      page,
      dialog,
      'Basic attack',
      'BasicAttack',
      ['basic_attack'],
      'basic_attack',
      'MCP Pulse Strike',
    )
    await importConfigCategory(
      page,
      dialog,
      'Battle formulas',
      'BalanceScalars',
      source.tables.BalanceScalars.rows.map((row) => String(row.values.key)),
      'balance_scalar',
      `\"expPerLevel\":${source.tables.BalanceScalars.rows.find((row) => row.values.key === 'exp_per_level')!.values.value}`,
    )

    await page.screenshot({ path: path.join(EVIDENCE_DIR, '01-import-applied.png') })

    const storage = await readImportStorage(page)
    for (const key of IMPORT_STORAGE_KEYS) expect(storage[key]).not.toBe('')

    const skillDrafts = JSON.parse(storage['battle-poc-skill-drafts-v1'])
    const jobDrafts = JSON.parse(storage['battle-poc-job-drafts-v1'])
    const configDrafts = JSON.parse(storage['battle-poc-game-config-drafts-v1'])
    const skillModules = JSON.parse(storage['battle-poc-skill-modules-v1'])
    const jobModules = JSON.parse(storage['battle-poc-job-modules-v1'])
    const configModules = JSON.parse(storage['battle-poc-game-config-modules-v1'])

    expect(JSON.stringify(skillDrafts)).toContain(source.tables.Skills.tableId)
    expect(JSON.stringify(skillDrafts)).toContain(source.tables.Skills.rows[0]!.rowId)
    expect(JSON.stringify(skillDrafts)).toContain(source.tables.Skills.rows[1]!.rowId)
    expect(JSON.stringify(jobDrafts)).toContain(source.tables.Jobs.tableId)
    expect(JSON.stringify(jobDrafts)).toContain(source.tables.Jobs.rows[0]!.rowId)
    for (const tableName of ['Equipment', 'Loadouts', 'BasicAttack', 'BalanceScalars']) {
      expect(JSON.stringify(configDrafts)).toContain(source.tables[tableName]!.tableId)
    }

    const flamePower = source.tables.Skills.rows.find(
      (row) => row.values.id === 'mcp_chain_flame',
    )!.values.power
    const expPerLevel = source.tables.BalanceScalars.rows.find(
      (row) => row.values.key === 'exp_per_level',
    )!.values.value
    const skillModuleJson = JSON.stringify(skillModules)
    const jobModuleJson = JSON.stringify(jobModules)
    const configModuleJson = JSON.stringify(configModules)
    expect(skillModuleJson).toContain('mcp_chain_flame')
    expect(skillModuleJson).toContain('mcp_chain_frost')
    expect(skillModuleJson).toContain(`"ratio":${flamePower}`)
    expect(jobModuleJson).toContain('mcp_chain_mage')
    expect(jobModuleJson).toContain('"hp":173')
    expect(configModuleJson).toContain('MCP Relay Blade')
    expect(configModuleJson).toContain('MCP Pulse Strike')
    expect(configModuleJson).toContain(`"expPerLevel":${expPerLevel}`)

    await dialog.getByRole('button', { name: '关闭' }).click()
    await page.getByTitle('Click to change class').click()
    const classDialog = page.getByRole('dialog')
    const importedClass = classDialog.getByRole('button', { name: /MCP Chain Mage/ })
    await expect(importedClass).toContainText('173')
    await expect(importedClass).toContainText('19')
    await expect(importedClass).toContainText('11')
    await expect(importedClass).toContainText('8')
    await importedClass.focus()
    await expect(classDialog.getByText('MCP Chain Flame')).toBeVisible()
    await expect(classDialog.getByText('MCP Chain Frost')).toBeVisible()
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '02-gameplay-consumers.png') })

    const skillRefresh = source.refresh?.changes.find((change) => change.table === 'Skills')
    const scalarRefresh = source.refresh?.changes.find(
      (change) => change.table === 'BalanceScalars',
    )
    expect(skillRefresh).toBeDefined()
    expect(scalarRefresh).toBeDefined()
    await page.evaluate(
      ({ skillBefore, scalarBefore }) => {
        const skillDrafts = JSON.parse(
          window.localStorage.getItem('battle-poc-skill-drafts-v1')!,
        )
        const flameDraft = skillDrafts.drafts.find(
          (draft: { fields?: { id?: { value?: string } } }) =>
            draft.fields?.id?.value === 'mcp_chain_flame',
        )
        flameDraft.fields.power.value = String(skillBefore)
        window.localStorage.setItem('battle-poc-skill-drafts-v1', JSON.stringify(skillDrafts))

        const skillModules = JSON.parse(
          window.localStorage.getItem('battle-poc-skill-modules-v1')!,
        )
        const flameDefinition = skillModules.modules
          .find((module: { source?: string }) => module.source === 'drafts')
          .definitions.find((definition: { id?: string }) => definition.id === 'mcp_chain_flame')
        flameDefinition.ratio = skillBefore
        window.localStorage.setItem('battle-poc-skill-modules-v1', JSON.stringify(skillModules))

        const configDrafts = JSON.parse(
          window.localStorage.getItem('battle-poc-game-config-drafts-v1')!,
        )
        const expDraft = configDrafts.drafts.find(
          (draft: { fields?: { id?: { value?: string } } }) =>
            draft.fields?.id?.value === 'exp_per_level',
        )
        expDraft.fields.value.value = String(scalarBefore)
        window.localStorage.setItem(
          'battle-poc-game-config-drafts-v1',
          JSON.stringify(configDrafts),
        )

        const configModules = JSON.parse(
          window.localStorage.getItem('battle-poc-game-config-modules-v1')!,
        )
        configModules.modules.find(
          (module: { source?: string }) => module.source === 'drafts',
        ).bundle.progression.expPerLevel = scalarBefore
        window.localStorage.setItem(
          'battle-poc-game-config-modules-v1',
          JSON.stringify(configModules),
        )

        window.dispatchEvent(new CustomEvent('battle-poc-skills-updated'))
        window.dispatchEvent(new CustomEvent('battle-poc-game-config-updated'))
      },
      { skillBefore: skillRefresh!.before, scalarBefore: scalarRefresh!.before },
    )
    await expect.poll(
      () => page.evaluate(() => {
        const skillDrafts = JSON.parse(
          window.localStorage.getItem('battle-poc-skill-drafts-v1')!,
        )
        const skillModules = JSON.parse(
          window.localStorage.getItem('battle-poc-skill-modules-v1')!,
        )
        const configDrafts = JSON.parse(
          window.localStorage.getItem('battle-poc-game-config-drafts-v1')!,
        )
        const configModules = JSON.parse(
          window.localStorage.getItem('battle-poc-game-config-modules-v1')!,
        )
        return {
          skillDraft: Number(skillDrafts.drafts.find(
            (draft: { fields?: { id?: { value?: string } } }) =>
              draft.fields?.id?.value === 'mcp_chain_flame',
          ).fields.power.value),
          skillModule: skillModules.modules
            .find((module: { source?: string }) => module.source === 'drafts')
            .definitions.find(
              (definition: { id?: string }) => definition.id === 'mcp_chain_flame',
            ).ratio,
          scalarDraft: Number(configDrafts.drafts.find(
            (draft: { fields?: { id?: { value?: string } } }) =>
              draft.fields?.id?.value === 'exp_per_level',
          ).fields.value.value),
          scalarModule: configModules.modules.find(
            (module: { source?: string }) => module.source === 'drafts',
          ).bundle.progression.expPerLevel,
        }
      }),
      { timeout: 90_000 },
    ).toEqual({
      skillDraft: skillRefresh!.after,
      skillModule: skillRefresh!.after,
      scalarDraft: scalarRefresh!.after,
      scalarModule: scalarRefresh!.after,
    })
    await page.screenshot({ path: path.join(EVIDENCE_DIR, '03-source-refresh.png') })

    const results = {
      projectId: PROJECT_ID,
      ownerId: OWNER_ID,
      verifiedAt: new Date().toISOString(),
      sourceCapturedAt: source.capturedAt,
      status: 'passed',
      assertions: {
        sourceTablesDiscovered: 6,
        skillDraftsApplied: 2,
        jobDraftsApplied: 1,
        gameConfigDraftsApplied: 20,
        flamePower,
        expPerLevel,
        jobConsumer: { hp: 173, atk: 19, def: 11, spd: 8 },
        loadoutConsumer: ['mcp_chain_flame', 'mcp_chain_frost'],
        refreshAuthority: {
          skillPower: { before: skillRefresh!.before, after: skillRefresh!.after },
          expPerLevel: { before: scalarRefresh!.before, after: scalarRefresh!.after },
        },
      },
      screenshots: [
        '00-table-discovery.png',
        '01-import-applied.png',
        '02-gameplay-consumers.png',
        '03-source-refresh.png',
      ],
    }
    await fs.writeFile(
      path.join(EVIDENCE_DIR, 'acceptance-results.json'),
      `${JSON.stringify(results, null, 2)}\n`,
      'utf8',
    )
  })
})
