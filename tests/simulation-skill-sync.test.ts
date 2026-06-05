import { describe, expect, it } from 'vitest'
import { mergeSkillDefinitions } from '../src/lib/skills/pocSkillModulesStorage'
import type { BattleSkillDefinition } from '../src/battle-core/domain/types/skill-types'
import { validateSimulationSkillDrafts } from '../src/lib/skills/validateSimulationSkillDrafts'
import type { SimulationSkillDraft } from '../src/lib/skills/simulationSkillDraftTypes'

function def(id: string, ratio = 1): BattleSkillDefinition {
  return {
    id,
    name: id,
    ratio,
    mpCost: 0,
    range: 3,
    cooldownTicks: 0,
  }
}

describe('mergeSkillDefinitions', () => {
  it('merges base and simulation lists with simulation winning on duplicate id', () => {
    const merged = mergeSkillDefinitions([def('a', 1), def('b', 2)], [def('b', 9), def('c', 3)])
    expect(merged.map((d) => d.id).sort()).toEqual(['a', 'b', 'c'])
    expect(merged.find((d) => d.id === 'b')?.ratio).toBe(9)
  })
})

describe('validateSimulationSkillDrafts', () => {
  it('converts simulation-format drafts to battle-core definitions', () => {
    const draft: SimulationSkillDraft = {
      draftId: 'd1',
      fields: {
        id: { tableId: 'studio:lib1', columnKey: 'id', value: 'arc_spark' },
        name: { tableId: 'studio:lib1', columnKey: 'name', value: 'Arc Spark' },
        type: { tableId: 'studio:lib1', columnKey: 'type', value: 'attack' },
        power: { tableId: 'studio:lib1', columnKey: 'power', value: '2' },
        mpCost: { tableId: 'studio:lib1', columnKey: 'mpCost', value: '5' },
        maxCooldown: { tableId: 'studio:lib1', columnKey: 'maxCooldown', value: '3' },
      },
    }

    const result = validateSimulationSkillDrafts([draft])
    expect(result.ok).toBe(true)
    expect(result.definitions).toHaveLength(1)
    expect(result.definitions[0]?.id).toBe('arc_spark')
    expect(result.definitions[0]?.mpCost).toBe(5)
    expect(result.definitions[0]?.cooldownTicks).toBe(30)
    expect(result.kecoSkills[0]?.power).toBe(2)
  })

  it('reports missing required fields', () => {
    const draft: SimulationSkillDraft = {
      draftId: 'd2',
      fields: {
        id: { tableId: 'studio:lib1', columnKey: 'id', value: 'x' },
      },
    }
    const result = validateSimulationSkillDrafts([draft])
    expect(result.ok).toBe(false)
    expect(result.draftErrors.some((e) => e.error.includes('name'))).toBe(true)
  })
})
