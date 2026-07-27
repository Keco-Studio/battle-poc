import { describe, expect, it } from 'vitest'
import {
  createEmptyDraft,
  draftToFlatRow,
  validatePocSkillDrafts,
  partitionDraftsBySkillId,
} from '@/src/lib/skills/pocSkillDrafts'
import { planImportColumnMapping } from '@/src/lib/skills/importPocSkillFromTable'
import { refreshPocSkillDraftsFromLiveTables } from '@/src/lib/skills/refreshPocSkillDrafts'
import { getBuiltinBattleSkillDefinitions } from '@/src/battle-core/content/skills/basic-skill-catalog'
import { upsertDraftModule } from '@/src/lib/skills/pocSkillModulesStorage'
import { clearDraftSkillModule } from '@/src/lib/skills/pocSkillModulesStorage'
import { applyPocSkillDrafts } from '@/src/lib/skills/pocSkillsStorage'
import { savePocSkillDrafts } from '@/src/lib/skills/pocSkillDrafts'
import { savePocSkillModulesState } from '@/src/lib/skills/pocSkillModulesStorage'

describe('poc skill drafts', () => {
  it('keeps unrelated skills when applying a partial draft module', () => {
    const state = {
      activeModuleId: 'builtin',
      modules: [{ id: 'builtin', label: 'Default', source: 'builtin' as const, definitions: getBuiltinBattleSkillDefinitions() }],
    }
    const next = upsertDraftModule(state, 'Studio drafts', [{
      id: 'imported', name: 'Imported', ratio: 1, mpCost: 0, range: 3, cooldownTicks: 0,
    }])
    const defs = next.modules.find((m) => m.id === 'studio-drafts')?.definitions ?? []
    expect(defs.some((d) => d.id === 'imported')).toBe(true)
    expect(defs.some((d) => d.id === 'fireball')).toBe(true)
  })

  it('does not retain a removed skill from the previous draft module', () => {
    const base = getBuiltinBattleSkillDefinitions()
    const state = {
      activeModuleId: 'studio-drafts',
      modules: [
        { id: 'builtin', label: 'Default', source: 'builtin' as const, definitions: base },
        { id: 'studio-drafts', label: 'Studio', source: 'drafts' as const, definitions: [...base, { id: 'old', name: 'Old', ratio: 1, mpCost: 0, range: 3, cooldownTicks: 0 }] },
      ],
    }
    const next = upsertDraftModule(state, 'Studio drafts', [{ id: 'new', name: 'New', ratio: 1, mpCost: 0, range: 3, cooldownTicks: 0 }])
    const ids = next.modules.find((m) => m.id === 'studio-drafts')?.definitions.map((d) => d.id) ?? []
    expect(ids).toContain('new')
    expect(ids).not.toContain('old')
  })
  it('validates required id and name fields', () => {
    const result = validatePocSkillDrafts([createEmptyDraft()])
    expect(result.ok).toBe(false)
    expect(result.draftErrors[0]?.error).toContain('Missing')
  })

  it('accepts element and reaction fields consumed by the Keco map runtime', () => {
    const draft = createEmptyDraft()
    draft.fields = {
      id: { tableId: 't', columnKey: 'id', value: 'storm' },
      name: { tableId: 't', columnKey: 'name', value: 'Storm' },
      attachElement: { tableId: 't', columnKey: 'element', value: 'thunder' },
      reactionTriggersJson: { tableId: 't', columnKey: 'reactions', value: '[{"element":"fire","reaction":"overload"}]' },
    } as typeof draft.fields
    const result = validatePocSkillDrafts([draft])
    expect(result.ok).toBe(true)
    expect(result.kecoSkills[0]?.attachElement?.element).toBe('thunder')
    expect(result.kecoSkills[0]?.reactionTrigger).toEqual([{ element: 'fire', reaction: 'overload' }])
  })

  it('blocks a draft whose Studio source row disappeared', () => {
    const draft = createEmptyDraft()
    draft.invalidReason = 'Source table row not found; rebind this draft before applying.'
    draft.fields.id = { tableId: 't', columnKey: 'id', value: 'fireball' }
    draft.fields.name = { tableId: 't', columnKey: 'name', value: 'Fireball' }
    const result = validatePocSkillDrafts([draft])
    expect(result.ok).toBe(false)
    expect(result.draftErrors[0]?.error).toContain('rebind')
  })

  it('removes the previously applied draft module when the source is deleted', () => {
    const state = {
      activeModuleId: 'studio-drafts',
      modules: [
        { id: 'builtin', label: 'Default', source: 'builtin' as const, definitions: getBuiltinBattleSkillDefinitions() },
        { id: 'studio-drafts', label: 'Studio', source: 'drafts' as const, definitions: [{ id: 'old', name: 'Old', ratio: 1, mpCost: 0, range: 3, cooldownTicks: 0 }] },
      ],
    }
    const next = clearDraftSkillModule(state)
    expect(next.activeModuleId).toBe('builtin')
    expect(next.modules.some((m) => m.id === 'studio-drafts')).toBe(false)
  })

  it('refreshes advanced fields from the live Studio row', async () => {
    const draft = createEmptyDraft()
    draft.sourceRowId = 'row-1'
    draft.fields = {
      id: { tableId: 't', columnKey: 'id', value: 'storm' },
      name: { tableId: 't', columnKey: 'name', value: 'Storm' },
      dotDamage: { tableId: 't', columnKey: 'dot', value: '1' },
    } as typeof draft.fields
    const result = await refreshPocSkillDraftsFromLiveTables([draft], async () => [{
      id: 'row-1', values: { id: 'storm', name: 'Storm', dot: '3' },
    }])
    expect(result.drafts[0]?.fields.dotDamage?.value).toBe('3')
  })

  it('marks a draft invalid when the live table loader throws', async () => {
    const draft = createEmptyDraft()
    draft.fields = {
      id: { tableId: 't', columnKey: 'id', value: 'storm' },
      name: { tableId: 't', columnKey: 'name', value: 'Storm' },
    } as typeof draft.fields
    const result = await refreshPocSkillDraftsFromLiveTables([draft], async () => {
      throw new Error('network down')
    })
    expect(result.drafts[0]?.invalidReason).toContain('unavailable')
  })

  it('does not keep the old active module when a live row becomes malformed', async () => {
    const storage = new Map<string, string>()
    const ls = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k), clear: () => storage.clear(), key: (i: number) => [...storage.keys()][i] ?? null, get length() { return storage.size } }
    Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true })
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })
    const builtin = getBuiltinBattleSkillDefinitions()
    savePocSkillModulesState({ activeModuleId: 'studio-drafts', modules: [
      { id: 'builtin', label: 'Default', source: 'builtin', definitions: builtin },
      { id: 'studio-drafts', label: 'Stale', source: 'drafts', definitions: [...builtin, { id: 'storm', name: 'Storm', ratio: 1, mpCost: 0, range: 3, cooldownTicks: 0 }] },
    ] }, { notify: false })
    const draft = createEmptyDraft()
    draft.fields = {
      id: { tableId: 't', columnKey: 'id', value: 'storm' },
      name: { tableId: 't', columnKey: 'name', value: 'Storm' },
      power: { tableId: 't', columnKey: 'power', value: 'bad' },
    } as typeof draft.fields
    savePocSkillDrafts([draft])
    const result = await applyPocSkillDrafts(null)
    expect(result.state.activeModuleId).toBe('builtin')
    expect(result.state.modules.some((m) => m.id === 'studio-drafts')).toBe(false)
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

  it('treats an existing skill id as an import update', () => {
    const existing = createEmptyDraft()
    existing.fields.id = { tableId: 't', columnKey: 'c', value: 'fireball' }
    existing.fields.name = { tableId: 't', columnKey: 'c', value: 'Fireball' }

    const incoming = createEmptyDraft()
    incoming.fields.id = { tableId: 't', columnKey: 'c', value: 'fireball' }
    incoming.fields.name = { tableId: 't', columnKey: 'c', value: 'Fireball 2' }

    const { accepted, rejected } = partitionDraftsBySkillId([incoming], [existing])
    expect(accepted).toEqual([incoming])
    expect(rejected).toHaveLength(0)
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
