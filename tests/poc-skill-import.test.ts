import { describe, expect, it } from 'vitest'
import {
  flatRowToBattleSkillDefinition,
  normalizeSkillId,
  resolveSkillId,
} from '@/src/lib/skills/pocSkillFieldMapping'
import { importBattleSkillsFromTableRows, extractIdOptionsFromRows } from '@/src/lib/skills/importPocSkillFromTable'
import { ASSET_NAME_COLUMN_KEY } from '@/src/lib/studio/studioLibraryService'

describe('poc skill field mapping', () => {
  it('normalizes display ids to code keys', () => {
    expect(normalizeSkillId('Arc Spark')).toBe('Arc_Spark')
    expect(resolveSkillId('Arc Spark')).toEqual({ id: 'Arc_Spark' })
  })

  it('maps flat row to battle definition with control fields', () => {
    const def = flatRowToBattleSkillDefinition({
      id: 'frost_lock',
      name: 'Frost Lock',
      description: 'Freeze setup',
      category: 'control',
      ratio: '1.1',
      mpCost: '6',
      range: '7.2',
      cooldownTicks: '3',
      applyFreezeTicks: '2',
      shatterBonusRatio: '0.45',
      consumeFreezeOnHit: 'true',
    })
    expect(def).toMatchObject({
      id: 'frost_lock',
      category: 'control',
      ratio: 1.1,
      mpCost: 6,
      applyFreezeTicks: 2,
      shatterBonusRatio: 0.45,
      consumeFreezeOnHit: true,
    })
  })

  it('imports rows using keco-style headers (power, mp, cd)', () => {
    const columns = [
      { key: 'col_id', label: 'id' },
      { key: 'col_name', label: 'name' },
      { key: 'col_power', label: 'power' },
      { key: 'col_mp', label: 'mp' },
      { key: 'col_cd', label: 'cd' },
      { key: 'col_range', label: 'range' },
    ]
    const rows = [
      {
        id: 'row-1',
        values: {
          col_id: 'fireball',
          col_name: 'Fireball',
          col_power: '1.5',
          col_mp: '6',
          col_cd: '3',
          col_range: '6.2',
        },
      },
    ]
    const skills = importBattleSkillsFromTableRows({ columns, rows })
    expect(skills).toHaveLength(1)
    expect(skills[0]).toMatchObject({
      id: 'fireball',
      name: 'Fireball',
      ratio: 1.5,
      mpCost: 6,
      cooldownTicks: 3,
      range: 6.2,
    })
  })

  it('extracts unique id options from loaded rows', () => {
    const rows = [
      { id: 'r1', values: { col_id: 'fireball', col_name: 'Fireball' } },
      { id: 'r2', values: { col_id: 'frost_lock', col_name: 'Frost Lock' } },
      { id: 'r3', values: { col_id: 'fireball', col_name: 'Fireball dup' } },
    ]
    expect(extractIdOptionsFromRows(rows, 'col_id')).toEqual([
      { value: 'fireball', label: 'fireball' },
      { value: 'frost_lock', label: 'frost_lock' },
    ])
  })

  it('falls back to asset name when id column missing', () => {
    const columns = [
      { key: ASSET_NAME_COLUMN_KEY, label: 'Name' },
      { key: 'col_ratio', label: 'ratio' },
    ]
    const rows = [
      {
        id: 'asset-1',
        values: {
          [ASSET_NAME_COLUMN_KEY]: 'Arcane Bolt',
          col_ratio: '1.35',
        },
      },
    ]
    const skills = importBattleSkillsFromTableRows({ columns, rows })
    expect(skills[0]?.name).toBe('Arcane Bolt')
    expect(skills[0]?.id).toBe('Arcane_Bolt')
  })
})
