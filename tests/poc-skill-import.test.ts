import { describe, expect, it } from 'vitest'
import {
  emptyPocSkillFlatRow,
  flatRowToBattleSkillDefinition,
  normalizeSkillId,
  resolveSkillId,
} from '@/src/lib/skills/pocSkillFieldMapping'
import { flatRowToKecoSkillFromRow } from '@/src/lib/skills/kecoSkillTableCodec'
import { importBattleSkillsFromTableRows, extractIdOptionsFromRows } from '@/src/lib/skills/importPocSkillFromTable'
import { ASSET_NAME_COLUMN_KEY } from '@/src/lib/studio/studioLibraryService'

describe('poc skill field mapping', () => {
  it('normalizes display ids to code keys', () => {
    expect(normalizeSkillId('Arc Spark')).toBe('Arc_Spark')
    expect(resolveSkillId('Arc Spark')).toEqual({ id: 'Arc_Spark' })
  })

  it('maps flat row to battle definition; freeze_turns syncs to applyFreezeTicks for BT', () => {
    const def = flatRowToBattleSkillDefinition({
      ...emptyPocSkillFlatRow(),
      id: 'frost_lock',
      name: 'Frost Lock',
      description: 'Freeze setup',
      category: 'control',
      power: '1.1',
      mpCost: '6',
      range: '3',
      maxCooldown: '3',
      freezeTurns: '2',
    })
    expect(def).toMatchObject({
      id: 'frost_lock',
      category: 'control',
      ratio: 1.1,
      mpCost: 6,
      applyFreezeTicks: 2,
    })
  })

  it('builds keco skill with freeze crowd control from freeze_turns', () => {
    const keco = flatRowToKecoSkillFromRow({
      ...emptyPocSkillFlatRow(),
      id: 'frost_lock',
      name: 'Frost Lock',
      power: '1.1',
      mpCost: '6',
      maxCooldown: '3',
      attachElement: 'ice',
      attachStrength: 'medium',
      attachTurns: '3',
      freezeTurns: '2',
    })
    expect(keco?.crowdControl).toEqual({ type: 'freeze', duration: 2 })
  })

  it('imports rows using simulation-style headers (power, mp, max_cooldown, freeze_turns)', () => {
    const columns = [
      { key: 'col_id', label: 'id' },
      { key: 'col_name', label: 'name' },
      { key: 'col_type', label: 'type' },
      { key: 'col_power', label: 'power' },
      { key: 'col_mp', label: 'mp_cost' },
      { key: 'col_cd', label: 'max_cooldown' },
      { key: 'col_range', label: 'range' },
      { key: 'col_freeze', label: 'freeze_turns' },
    ]
    const rows = [
      {
        id: 'row-1',
        values: {
          col_id: 'fireball',
          col_name: 'Fireball',
          col_type: 'attack',
          col_power: '1.5',
          col_mp: '6',
          col_cd: '3',
          col_range: '6.2',
          col_freeze: '',
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
      range: 3,
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
      { key: 'col_power', label: 'power' },
    ]
    const rows = [
      {
        id: 'asset-1',
        values: {
          [ASSET_NAME_COLUMN_KEY]: 'Arcane Bolt',
          col_power: '1.35',
        },
      },
    ]
    const skills = importBattleSkillsFromTableRows({ columns, rows })
    expect(skills[0]?.name).toBe('Arcane Bolt')
    expect(skills[0]?.id).toBe('Arcane_Bolt')
  })
})
