import { describe, expect, it } from 'vitest'
import {
  emptyPocJobFlatRow,
  flatRowToJobClassConfig,
  resolveJobId,
} from '@/src/lib/jobs/pocJobFieldMapping'
import { importBattleJobsFromTableRows } from '@/src/lib/jobs/importPocJobFromTable'
import { getBuiltinJobCatalogSnapshot } from '@/src/lib/jobs/builtinJobCatalog'
import { applyRoleStatsRegistry, getActiveRoleStats } from '@/src/lib/jobs/jobConfigRegistry'
import { snapshotFromConfigs } from '@/src/lib/jobs/builtinJobCatalog'

describe('poc job field mapping', () => {
  it('resolves class ids to lowercase snake keys', () => {
    expect(resolveJobId('Dark Mage')).toEqual({ id: 'dark_mage' })
  })

  it('maps flat row to class config with growth stats', () => {
    const cfg = flatRowToJobClassConfig({
      ...emptyPocJobFlatRow(),
      id: 'mage',
      name: 'Mage',
      baseHp: '80',
      growthHp: '20',
      baseAtk: '9',
      growthAtk: '7',
      hpMult: '5',
      preferredRange: 'ranged',
    })
    expect(cfg).toMatchObject({
      id: 'mage',
      preferredRange: 'ranged',
      stats: {
        baseHp: 80,
        growthHp: 20,
        baseAtk: 9,
        growthAtk: 7,
        hpMult: 5,
      },
    })
    expect(cfg && calcPlayerMaxHp(cfg, 3)).toBe((80 + 2 * 20) * 5)
  })
})

function calcPlayerMaxHp(
  cfg: NonNullable<ReturnType<typeof flatRowToJobClassConfig>>,
  level: number,
): number {
  const s = cfg.stats
  return (s.baseHp + (level - 1) * s.growthHp) * s.hpMult
}

describe('importBattleJobsFromTableRows', () => {
  it('imports rows using job_classes style headers', () => {
    const columns = [
      { key: 'col_id', label: 'id' },
      { key: 'col_name', label: 'name' },
      { key: 'col_base_hp', label: 'base_hp' },
      { key: 'col_growth_hp', label: 'growth_hp' },
      { key: 'col_hp_mult', label: 'hp_multiplier' },
    ]
    const rows = [
      {
        id: 'row-1',
        values: {
          col_id: 'hero',
          col_name: 'Hero',
          col_base_hp: '130',
          col_growth_hp: '40',
          col_hp_mult: '5',
        },
      },
    ]
    const configs = importBattleJobsFromTableRows({ columns, rows })
    expect(configs).toHaveLength(1)
    expect(configs[0]!.stats.baseHp).toBe(130)
    expect(configs[0]!.stats.growthHp).toBe(40)
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
          baseHp: 100,
          baseAtk: 5,
          baseDef: 3,
          baseSpd: 3,
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
    expect((s.baseHp + s.growthHp) * s.hpMult).toBe(220)
  })
})

describe('builtin catalog', () => {
  it('includes six default classes', () => {
    expect(getBuiltinJobCatalogSnapshot().jobClassIds).toHaveLength(6)
  })
})
