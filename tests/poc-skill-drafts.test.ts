import { describe, expect, it } from 'vitest'
import {
  createEmptyDraft,
  draftToFlatRow,
  validatePocSkillDrafts,
  partitionDraftsBySkillId,
} from '@/src/lib/skills/pocSkillDrafts'
import { planImportColumnMapping } from '@/src/lib/skills/importPocSkillFromTable'

describe('poc skill drafts', () => {
  it('validates required id and name fields', () => {
    const result = validatePocSkillDrafts([createEmptyDraft()])
    expect(result.ok).toBe(false)
    expect(result.draftErrors[0]?.error).toContain('Missing')
  })

  it('converts draft bindings to flat row', () => {
    const draft = createEmptyDraft()
    draft.fields = {
      id: { tableId: 'studio:lib1', columnKey: 'col_id', value: 'fireball' },
      name: { tableId: 'studio:lib1', columnKey: 'col_name', value: 'Fireball' },
      power: { tableId: 'studio:lib1', columnKey: 'col_power', value: '1.5' },
    }
    const flat = draftToFlatRow(draft)
    expect(flat.id).toBe('fireball')
    expect(flat.name).toBe('Fireball')
    expect(flat.power).toBe('1.5')
  })

  it('rejects duplicate skill ids on import partition', () => {
    const existing = createEmptyDraft()
    existing.fields.id = { tableId: 't', columnKey: 'c', value: 'fireball' }
    existing.fields.name = { tableId: 't', columnKey: 'c', value: 'Fireball' }

    const incoming = createEmptyDraft()
    incoming.fields.id = { tableId: 't', columnKey: 'c', value: 'fireball' }
    incoming.fields.name = { tableId: 't', columnKey: 'c', value: 'Fireball 2' }

    const { accepted, rejected } = partitionDraftsBySkillId([incoming], [existing])
    expect(accepted).toHaveLength(0)
    expect(rejected).toHaveLength(1)
  })

  it('maps id and name columns from headers', () => {
    const plan = planImportColumnMapping([
      { key: 'col_b', label: 'id' },
      { key: 'col_c', label: 'name' },
      { key: 'col_power', label: 'power' },
    ])
    expect(plan.ambiguities).toHaveLength(0)
    expect(plan.columnToField.get('col_b')).toBe('id')
    expect(plan.columnToField.get('col_power')).toBe('power')
  })
})
