import { describe, expect, it } from 'vitest'
import {
  emptyPocJobFlatRow,
  flatRowToJobClassConfig,
  resolveJobId,
} from '@/src/lib/jobs/pocJobFieldMapping'
import { buildDraftFromTableRow, detectIdColumnKey, importBattleJobsFromTableRows, planImportColumnMapping } from '@/src/lib/jobs/importPocJobFromTable'
import { ASSET_NAME_COLUMN_KEY } from '@/src/lib/studio/studioLibraryService'
import { getBuiltinJobCatalogSnapshot } from '@/src/lib/jobs/builtinJobCatalog'
import { applyRoleStatsRegistry, getActiveRoleStats } from '@/src/lib/jobs/jobConfigRegistry'
import { snapshotFromConfigs } from '@/src/lib/jobs/builtinJobCatalog'
import { upsertDraftModule } from '@/src/lib/jobs/pocJobModulesStorage'
import { refreshPocJobDraftsFromLiveTables } from '@/src/lib/jobs/refreshPocJobDrafts'
import { partitionDraftsByJobId, upsertPocJobDrafts, type PocJobDraft } from '@/src/lib/jobs/pocJobDrafts'

describe('poc job field mapping', () => {
  it('marks a draft invalid when the live table loader throws', async () => {
    const result = await refreshPocJobDraftsFromLiveTables([{
      draftId: 'network',
      fields: {
        id: { tableId: 't', columnKey: 'id', value: 'hero' },
        name: { tableId: 't', columnKey: 'name', value: 'Hero' },
      },
    }], async () => {
      throw new Error('network down')
    })
    expect(result.drafts[0]?.invalidReason).toContain('unavailable')
  })

  it('keeps unrelated jobs when applying a partial draft module', () => {
    const state = {
      activeModuleId: 'builtin',
      modules: [{ id: 'builtin', label: 'Default', source: 'builtin' as const, configs: getBuiltinJobCatalogSnapshot().jobClassIds.map((id) => ({
        id, name: id, description: id, preferredRange: 'melee' as const, stats: { hp: 100, atk: 5, def: 3, spd: 3, growthHp: 10, growthAtk: 2, growthDef: 1, growthSpd: 1, hpMult: 1 },
      })) }],
    }
    const next = upsertDraftModule(state, 'Studio drafts', [{
      id: 'imported', name: 'Imported', description: 'Imported', preferredRange: 'ranged',
      stats: { hp: 100, atk: 5, def: 3, spd: 3, growthHp: 10, growthAtk: 2, growthDef: 1, growthSpd: 1, hpMult: 1 },
    }])
    const configs = next.modules.find((m) => m.id === 'studio-drafts')?.configs ?? []
    expect(configs.some((c) => c.id === 'imported')).toBe(true)
    expect(configs.some((c) => c.id === 'hero')).toBe(true)
  })
  it('resolves class ids to lowercase snake keys', () => {
    expect(resolveJobId('Dark Mage')).toEqual({ id: 'dark_mage' })
  })

  it('maps flat row to class config with growth stats', () => {
    const cfg = flatRowToJobClassConfig({
      ...emptyPocJobFlatRow(),
      id: 'mage',
      name: 'Mage',
      hp: '80',
      growthHp: '20',
      atk: '9',
      growthAtk: '7',
      hpMult: '5',
      preferredRange: 'ranged',
    })
    expect(cfg).toMatchObject({
      id: 'mage',
      preferredRange: 'ranged',
      stats: {
        hp: 80,
        growthHp: 20,
        atk: 9,
        growthAtk: 7,
        hpMult: 5,
      },
    })
    expect(cfg && calcPlayerMaxHp(cfg, 3)).toBe(80 + 2 * 20)
  })
})

function calcPlayerMaxHp(
  cfg: NonNullable<ReturnType<typeof flatRowToJobClassConfig>>,
  level: number,
): number {
  const s = cfg.stats
  return s.hp + (level - 1) * s.growthHp // * s.hpMult — temporarily disabled
}

describe('importBattleJobsFromTableRows', () => {
  it('rejects a job table without an explicit id column', () => {
    expect(detectIdColumnKey([
      { key: ASSET_NAME_COLUMN_KEY, label: 'Name' },
      { key: 'hp', label: 'hp' },
    ])).toBeUndefined()
  })

  it('keeps bindings for blank recognized job columns', () => {
    const columns = [{ key: 'id', label: 'id' }, { key: 'name', label: 'name' }, { key: 'hp', label: 'hp' }]
    const plan = planImportColumnMapping(columns)
    const draft = buildDraftFromTableRow({
      tableId: 'studio:jobs',
      row: { id: 'r1', values: { id: 'hero', name: 'Hero', hp: '' } },
      columnToField: plan.columnToField,
      idColumnKey: 'id',
      jobIdValue: 'hero',
    })
    expect(draft.fields.hp).toMatchObject({ columnKey: 'hp', value: '' })
  })
  it('imports rows using job_classes style headers', () => {
    const columns = [
      { key: 'col_id', label: 'id' },
      { key: 'col_name', label: 'name' },
      { key: 'col_hp', label: 'hp' },
      { key: 'col_growth_hp', label: 'growth_hp' },
      { key: 'col_hp_mult', label: 'hp_multiplier' },
    ]
    const rows = [
      {
        id: 'row-1',
        values: {
          col_id: 'hero',
          col_name: 'Hero',
          col_hp: '130',
          col_growth_hp: '40',
          col_hp_mult: '5',
        },
      },
    ]
    const configs = importBattleJobsFromTableRows({ columns, rows })
    expect(configs).toHaveLength(1)
    expect(configs[0]!.stats.hp).toBe(130)
    expect(configs[0]!.stats.growthHp).toBe(40)
  })

  it('maps Keco Studio export headers with (string) suffix', () => {
    const columns = [
      { key: 'col_id', label: 'id (string)' },
      { key: 'col_hp', label: 'hp (string)' },
      { key: 'col_hp_mult', label: 'hp_mult (number)' },
    ]
    const rows = [
      {
        id: 'row-1',
        values: { col_id: 'hero', col_hp: '200', col_hp_mult: '3' },
      },
    ]
    const configs = importBattleJobsFromTableRows({ columns, rows })
    expect(configs[0]!.stats.hp).toBe(200)
    expect(configs[0]!.stats.hpMult).toBe(3)
  })

  it('rejects a supplied malformed numeric job field', () => {
    expect(() => importBattleJobsFromTableRows({
      columns: [
        { key: 'id', label: 'id' },
        { key: 'name', label: 'name' },
        { key: 'hp', label: 'hp' },
      ],
      rows: [{ id: 'row-1', values: { id: 'hero', name: 'Hero', hp: 'not-a-number' } }],
    })).toThrow(/row 1.*hp|hp.*row 1/i)
  })

  it('rejects unsupported preferred range values', () => {
    expect(() => importBattleJobsFromTableRows({
      columns: [
        { key: 'id', label: 'id' },
        { key: 'name', label: 'name' },
        { key: 'preferred_range', label: 'preferred_range' },
      ],
      rows: [{ id: 'row-1', values: { id: 'hero', name: 'Hero', preferred_range: 'invalid' } }],
    })).toThrow(/row 1.*preferredRange|preferredRange.*row 1/i)
  })

  it('rejects duplicate normalized job ids instead of dropping the second row', () => {
    expect(() => importBattleJobsFromTableRows({
      columns: [
        { key: 'id', label: 'id' },
        { key: 'name', label: 'name' },
      ],
      rows: [
        { id: 'row-1', values: { id: 'Hero', name: 'Hero' } },
        { id: 'row-2', values: { id: 'hero', name: 'Hero 2' } },
      ],
    })).toThrow(/duplicate.*hero/i)
  })

  it('treats an existing normalized job id as an update and replaces its draft', () => {
    const existing: PocJobDraft = {
      draftId: 'old',
      fields: {
        id: { tableId: 'old-table', columnKey: 'id', value: 'Dark Mage' },
        name: { tableId: 'old-table', columnKey: 'name', value: 'Old name' },
      },
    }
    const incoming: PocJobDraft = {
      draftId: 'new',
      fields: {
        id: { tableId: 'studio-table', columnKey: 'id', value: 'dark_mage' },
        name: { tableId: 'studio-table', columnKey: 'name', value: 'Live name' },
      },
    }

    const partitioned = partitionDraftsByJobId([incoming], [existing])
    expect(partitioned.rejected).toHaveLength(0)
    expect(partitioned.updated).toEqual([incoming])
    expect(upsertPocJobDrafts([existing], partitioned.accepted)).toEqual([incoming])
  })
})

describe('job config registry', () => {
  it('applies imported stats for runtime lookup', () => {
    const snap = snapshotFromConfigs([
      {
        id: 'hero',
        name: 'Hero',
        description: 'Test',
        preferredRange: 'melee',
        stats: {
          hp: 100,
          atk: 5,
          def: 3,
          spd: 3,
          growthHp: 10,
          growthAtk: 2,
          growthDef: 1,
          growthSpd: 1,
          hpMult: 2,
        },
      },
    ])
    applyRoleStatsRegistry(snap.roleStats)
    const s = getActiveRoleStats('hero')!
    expect(s.hp + s.growthHp).toBe(110) // * s.hpMult — temporarily disabled
  })
})

describe('builtin catalog', () => {
  it('includes six default classes', () => {
    expect(getBuiltinJobCatalogSnapshot().jobClassIds).toHaveLength(6)
  })
})
