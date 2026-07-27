import { describe, expect, it } from 'vitest'
import {
  emptyPocSkillFlatRow,
  flatRowToBattleSkillDefinition,
  battleSkillDefinitionToFlatRow,
  normalizeSkillId,
  parseBattleSkillRow,
  resolveSkillId,
} from '@/src/lib/skills/pocSkillFieldMapping'
import { flatRowToKecoSkillFromRow } from '@/src/lib/skills/kecoSkillTableCodec'
import { importBattleSkillsFromTableRows, extractIdOptionsFromRows, findRowByIdCell, buildDraftFromTableRow, planImportColumnMapping, detectIdColumnKey } from '@/src/lib/skills/importPocSkillFromTable'
import { findRowByIdCell as findJobRowByIdCell } from '@/src/lib/jobs/importPocJobFromTable'
import { findRowByIdCell as findConfigRowByIdCell } from '@/src/lib/gameConfig/importPocGameConfig'
import { ASSET_NAME_COLUMN_KEY } from '@/src/lib/studio/studioLibraryService'
import { getBattleSkillDefinition, resetSkillCatalogToBuiltin } from '@/src/battle-core/content/skills/basic-skill-catalog'
import { validateStudioTableForImport } from '@/src/lib/studio/validateStudioTableImport'
import { partitionDraftsBySkillId, upsertPocSkillDrafts, validatePocSkillDrafts, type PocSkillDraft } from '@/src/lib/skills/pocSkillDrafts'

describe('poc skill field mapping', () => {
  it('keeps imported params in the runtime catalog after registration', () => {
    resetSkillCatalogToBuiltin()
    const skills = importBattleSkillsFromTableRows({
      columns: [
        { key: 'id', label: 'id' },
        { key: 'name', label: 'name' },
        { key: 'element', label: 'attach_element' },
      ],
      rows: [{ id: 'row-1', values: { id: 'storm', name: 'Storm', element: 'lightning' } }],
    })
    expect(skills[0]?.params?.attachElement).toBe('lightning')
    expect(getBattleSkillDefinition('storm')?.params?.attachElement).toBe('lightning')
  })
  it('normalizes display ids to code keys', () => {
    expect(normalizeSkillId('Arc Spark')).toBe('Arc_Spark')
    expect(resolveSkillId('Arc Spark')).toEqual({ id: 'Arc_Spark' })
  })

  it('rejects an unknown supplied skill category instead of defaulting to burst', () => {
    const parsed = parseBattleSkillRow({
      ...emptyPocSkillFlatRow(),
      id: 'bad_category',
      name: 'Bad Category',
      category: 'teleport',
      mpCost: '0',
      maxCooldown: '0',
    })

    expect(parsed.definition).toBeNull()
    expect(parsed.error).toMatch(/category/i)
  })

  it.each([
    ['skillType', 'teleport'],
    ['attachStrength', 'enormous'],
  ] as const)('rejects an unknown supplied %s value', (field, value) => {
    const draft: PocSkillDraft = {
      draftId: `bad-${field}`,
      fields: {
        id: { tableId: 'studio:skills', columnKey: 'id', value: `bad_${field}` },
        name: { tableId: 'studio:skills', columnKey: 'name', value: `Bad ${field}` },
        mpCost: { tableId: 'studio:skills', columnKey: 'mp', value: '0' },
        maxCooldown: { tableId: 'studio:skills', columnKey: 'cooldown', value: '0' },
        attachElement: { tableId: 'studio:skills', columnKey: 'element', value: 'fire' },
        [field]: { tableId: 'studio:skills', columnKey: field, value },
      },
    }

    const result = validatePocSkillDrafts([draft])

    expect(result.ok).toBe(false)
    expect(result.draftErrors[0]?.error).toMatch(new RegExp(field, 'i'))
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
      range: 6.2,
    })
  })

  it('preserves simulation combat fields in the runtime definition params', () => {
    const columns = [
      { key: 'id', label: 'id' },
      { key: 'name', label: 'name' },
      { key: 'power', label: 'power' },
      { key: 'range', label: 'range' },
      { key: 'element', label: 'attach_element' },
      { key: 'dot', label: 'dot_damage' },
      { key: 'dotTurns', label: 'dot_turns' },
      { key: 'special', label: 'special_effect' },
      { key: 'specialValue', label: 'special_effect_value' },
      { key: 'reactions', label: 'reaction_triggers_json' },
    ]
    const skills = importBattleSkillsFromTableRows({
      columns,
      rows: [{
        id: 'row-1',
        values: {
          id: 'storm',
          name: 'Storm',
          power: '1.4',
          range: '6.2',
          element: 'lightning',
          dot: '3',
          dotTurns: '2',
          special: 'slow',
          specialValue: '0.25',
          reactions: '[{"element":"fire","reaction":"overload"}]',
        },
      }],
    })
    expect(skills[0]).toMatchObject({
      id: 'storm',
      range: 6.2,
      params: expect.objectContaining({
        attachElement: 'lightning',
        dotDamage: 3,
        dotTurns: 2,
        specialEffect: 'slow',
        specialEffectValue: 0.25,
        reactionTriggers: [{ element: 'fire', reaction: 'overload' }],
      }),
    })
  })

  it('preserves advanced fields when building a persisted Studio draft', () => {
    const columns = [
      { key: 'id', label: 'id' }, { key: 'name', label: 'name' },
      { key: 'dot', label: 'dot_damage' }, { key: 'dotTurns', label: 'dot_turns' },
    ]
    const plan = planImportColumnMapping(columns)
    const draft = buildDraftFromTableRow({
      tableId: 'studio:t', row: { id: 'r1', values: { id: 'storm', name: 'Storm', dot: '3', dotTurns: '2' } },
      columnToField: plan.columnToField, idColumnKey: detectIdColumnKey(columns)!, skillIdValue: 'storm', columns,
    })
    expect(draft.fields.dotDamage?.value).toBe('3')
    expect(draft.fields.dotTurns?.value).toBe('2')
  })

  it('keeps bindings for recognized optional columns that are currently blank', () => {
    const columns = [
      { key: 'id', label: 'id' },
      { key: 'name', label: 'name' },
      { key: 'power', label: 'power' },
      { key: 'dot', label: 'dot_damage' },
    ]
    const plan = planImportColumnMapping(columns)
    const draft = buildDraftFromTableRow({
      tableId: 'studio:t',
      row: { id: 'r1', values: { id: 'storm', name: 'Storm', power: '', dot: '' } },
      columnToField: plan.columnToField,
      idColumnKey: detectIdColumnKey(columns)!,
      skillIdValue: 'storm',
      columns,
    })
    expect(draft.fields.power).toMatchObject({ columnKey: 'power', value: '' })
    expect(draft.fields.dotDamage).toMatchObject({ columnKey: 'dot', value: '' })
  })

  it('round-trips cooldowns according to their declared unit', () => {
    expect(battleSkillDefinitionToFlatRow({
      id: 'long_turns', name: 'Long Turns', ratio: 1, mpCost: 0, range: 3,
      cooldownTicks: 12, cooldownUnit: 'turns',
    }).maxCooldown).toBe('12')
    expect(battleSkillDefinitionToFlatRow({
      id: 'runtime_ticks', name: 'Runtime Ticks', ratio: 1, mpCost: 0, range: 3,
      cooldownTicks: 120, cooldownUnit: 'ticks',
    }).maxCooldown).toBe('12')
  })

  it('rejects malformed numeric values instead of silently using defaults', () => {
    expect(() => importBattleSkillsFromTableRows({
      columns: [
        { key: 'id', label: 'id' },
        { key: 'name', label: 'name' },
        { key: 'power', label: 'power' },
      ],
      rows: [{ id: 'row-1', values: { id: 'storm', name: 'Storm', power: 'not-a-number' } }],
    })).toThrow(/row 1.*power/i)
  })

  it('rejects duplicate normalized skill ids instead of dropping a row', () => {
    expect(() => importBattleSkillsFromTableRows({
      columns: [{ key: 'id', label: 'id' }, { key: 'name', label: 'name' }],
      rows: [
        { id: 'row-1', values: { id: 'Arc Spark', name: 'Arc Spark' } },
        { id: 'row-2', values: { id: 'Arc_Spark', name: 'Arc Spark 2' } },
      ],
    })).toThrow(/duplicate.*skill id/i)
  })

  it('treats an existing normalized skill id as an update and replaces its draft', () => {
    const existing: PocSkillDraft = {
      draftId: 'old',
      fields: {
        id: { tableId: 'old-table', columnKey: 'id', value: 'Arc Spark' },
        name: { tableId: 'old-table', columnKey: 'name', value: 'Old name' },
      },
    }
    const incoming: PocSkillDraft = {
      draftId: 'new',
      fields: {
        id: { tableId: 'studio-table', columnKey: 'id', value: 'Arc_Spark' },
        name: { tableId: 'studio-table', columnKey: 'name', value: 'Live name' },
      },
    }

    const partitioned = partitionDraftsBySkillId([incoming], [existing])
    expect(partitioned.rejected).toHaveLength(0)
    expect(partitioned.updated).toEqual([incoming])
    expect(upsertPocSkillDrafts([existing], partitioned.accepted)).toEqual([incoming])
  })

  it('accepts valid element and reaction fields for the executable Keco runtime', () => {
    const draft: PocSkillDraft = {
      draftId: 'element-draft',
      fields: {
        id: { tableId: 'studio-table', columnKey: 'id', value: 'storm_bloom' },
        name: { tableId: 'studio-table', columnKey: 'name', value: 'Storm Bloom' },
        power: { tableId: 'studio-table', columnKey: 'power', value: '1.5' },
        mpCost: { tableId: 'studio-table', columnKey: 'mpCost', value: '3' },
        range: { tableId: 'studio-table', columnKey: 'range', value: '4' },
        maxCooldown: { tableId: 'studio-table', columnKey: 'maxCooldown', value: '2' },
        attachElement: { tableId: 'studio-table', columnKey: 'element', value: 'thunder' },
        attachStrength: { tableId: 'studio-table', columnKey: 'strength', value: 'strong' },
        attachTurns: { tableId: 'studio-table', columnKey: 'turns', value: '3' },
        reactionTriggersJson: { tableId: 'studio-table', columnKey: 'reactions', value: '[{"element":"fire","reaction":"overload"}]' },
      },
    }

    const result = validatePocSkillDrafts([draft])

    expect(result.ok).toBe(true)
    expect(result.kecoSkills[0]?.attachElement).toEqual({ element: 'thunder', strength: 'strong', duration: 3 })
    expect(result.kecoSkills[0]?.reactionTrigger).toEqual([{ element: 'fire', reaction: 'overload' }])
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

  it('refuses ambiguous first-row selection when a live table contains duplicate ids', () => {
    const rows = [
      { id: 'r1', values: { id: 'Hero' } },
      { id: 'r2', values: { id: 'hero' } },
    ]

    expect(findRowByIdCell(rows, 'id', 'hero')).toBeNull()
    expect(findJobRowByIdCell(rows, 'id', 'hero')).toBeNull()
    expect(findConfigRowByIdCell(rows, 'id', 'hero')).toBeNull()
  })

  it('rejects a skill table without an explicit id column', () => {
    const columns = [
      { key: ASSET_NAME_COLUMN_KEY, label: 'Name' },
      { key: 'col_power', label: 'power' },
    ]
    expect(detectIdColumnKey(columns)).toBeUndefined()
    expect(() => importBattleSkillsFromTableRows({ columns, rows: [] })).toThrow(/id column/i)
  })

  it('rejects a job-shaped table at the skill validation gate', () => {
    const result = validateStudioTableForImport([
      { key: 'id', label: 'id' },
      { key: 'hp', label: 'hp' },
      { key: 'growth_hp', label: 'growth_hp' },
    ], 'skills')
    expect(result.ok).toBe(false)
    expect(result.suspectedKind).toBe('job_classes')
  })
})
