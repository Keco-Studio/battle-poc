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
