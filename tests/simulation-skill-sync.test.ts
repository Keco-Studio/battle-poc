import { describe, expect, it } from 'vitest'
import { mergeSkillDefinitions } from '../src/lib/skills/pocSkillModulesStorage'
import type { BattleSkillDefinition } from '../src/battle-core/domain/types/skill-types'
import { validateSimulationSkillDrafts } from '../src/lib/skills/validateSimulationSkillDrafts'
import type { SimulationSkillDraft } from '../src/lib/skills/simulationSkillDraftTypes'
import { applyDefinitionsToRuntimeCatalog } from '../src/lib/skills/pocSkillModulesStorage'
import { getBattleSkillDefinition } from '../src/battle-core/content/skills/basic-skill-catalog'
import { registerKecoSkills } from '../src/keco/kecoSkillBridge'
import { resolveKecoCastSkill } from '../src/keco/resolveKecoCastSkill'
import { attachKecoOverlay } from '../src/keco/attachKecoOverlay'
import { createBattleSession } from '../src/battle-core/domain/entities/battle-session'
import type { BattleEntity } from '../src/battle-core/domain/entities/battle-entity'
import { executeSkill, processTurnEnd, type BattleState, type Skill as KecoSkill } from '@keco/battle-engine'
import { enqueueBattleCommand, processBattleCommands } from '../src/battle-core/engine/command-processor'
import { tickStatusEffects } from '../src/battle-core/engine/effect-processor'
import { BattleTickEngine } from '../src/battle-core/engine/tick-engine'
import { setKecoSkillsRecord } from '../src/lib/skills/kecoSkillRegistry'
import { entityToKecoUnit } from '../src/keco/entitySync'
import { refreshSimulationSkillDraftsFromLiveTables } from '../src/lib/skills/refreshSimulationSkillDrafts'

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
  it('rejects simulation drafts that have no Studio source bindings', async () => {
    const refreshed = await refreshSimulationSkillDraftsFromLiveTables([{
      draftId: 'local-only-simulation',
      fields: {
        id: { tableId: '', columnKey: 'id', value: 'local_only' },
        name: { tableId: '', columnKey: 'name', value: 'Local Only' },
      },
    }], async () => null)

    expect(refreshed.drafts[0]?.invalidReason).toMatch(/Studio.*binding/i)
  })

  it('fails closed when a cross-table binding has no explicit id column', async () => {
    const source: SimulationSkillDraft = {
      draftId: 'cross-table-no-id',
      fields: {
        id: { tableId: 'anchor', columnKey: 'id', value: 'storm' },
        name: { tableId: 'anchor', columnKey: 'name', value: 'Storm' },
        power: { tableId: 'stats', columnKey: 'power', value: '1' },
      },
    }
    const refreshed = await refreshSimulationSkillDraftsFromLiveTables([source], async (tableId) => {
      if (tableId === 'anchor') {
        return {
          columns: [{ key: 'id', label: 'id' }, { key: 'name', label: 'name' }],
          rows: [{ id: 'anchor-row', values: { id: 'storm', name: 'Storm' } }],
        }
      }
      return {
        columns: [{ key: 'name', label: 'name' }, { key: 'power', label: 'power' }],
        rows: [{ id: 'stats-row', values: { name: 'storm', power: '99' } }],
      }
    })

    expect(refreshed.drafts[0]?.invalidReason).toMatch(/explicit id/i)
    expect(refreshed.drafts[0]?.fields.power?.value).not.toBe('99')
  })

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

  it('does not sync a draft whose Studio source row disappeared', () => {
    const result = validateSimulationSkillDrafts([{
      draftId: 'deleted',
      invalidReason: 'Source table row not found; rebind this draft before syncing.',
      fields: { id: { tableId: 't', columnKey: 'id', value: 'deleted' }, name: { tableId: 't', columnKey: 'name', value: 'Deleted' } },
    }])
    expect(result.ok).toBe(false)
    expect(result.definitions).toHaveLength(0)
    expect(result.draftErrors[0]?.error).toContain('rebind')
  })

  it('converts cooldown to runtime ticks exactly once across Apply and re-registration', () => {
    const draft: SimulationSkillDraft = {
      draftId: 'cooldown-once',
      fields: {
        id: { tableId: 'studio:lib1', columnKey: 'id', value: 'cooldown_once' },
        name: { tableId: 'studio:lib1', columnKey: 'name', value: 'Cooldown Once' },
        type: { tableId: 'studio:lib1', columnKey: 'type', value: 'attack' },
        power: { tableId: 'studio:lib1', columnKey: 'power', value: '2' },
        mpCost: { tableId: 'studio:lib1', columnKey: 'mpCost', value: '5' },
        maxCooldown: { tableId: 'studio:lib1', columnKey: 'maxCooldown', value: '3' },
      },
    }
    const result = validateSimulationSkillDrafts([draft])
    expect(result.ok).toBe(true)
    applyDefinitionsToRuntimeCatalog(result.definitions)
    applyDefinitionsToRuntimeCatalog(result.definitions)
    expect(getBattleSkillDefinition('cooldown_once')?.cooldownTicks).toBe(30)
  })

  it('maps imported DOT fields into the executable Keco skill', () => {
    const draft: SimulationSkillDraft = {
      draftId: 'dot-runtime',
      fields: {
        id: { tableId: 'studio:lib1', columnKey: 'id', value: 'burning_import' },
        name: { tableId: 'studio:lib1', columnKey: 'name', value: 'Burning Import' },
        type: { tableId: 'studio:lib1', columnKey: 'type', value: 'attack' },
        power: { tableId: 'studio:lib1', columnKey: 'power', value: '1' },
        mpCost: { tableId: 'studio:lib1', columnKey: 'mpCost', value: '0' },
        maxCooldown: { tableId: 'studio:lib1', columnKey: 'maxCooldown', value: '0' },
        dotDamage: { tableId: 'studio:lib1', columnKey: 'dotDamage', value: '0.5' },
        dotDuration: { tableId: 'studio:lib1', columnKey: 'dotDuration', value: '2' },
      },
    }
    const result = validateSimulationSkillDrafts([draft])
    expect(result.ok).toBe(true)
    expect(result.kecoSkills[0]?.dot).toEqual({ damage: 0.5, duration: 2 })
    const skillById = registerKecoSkills(result.kecoSkills)
    const left = makeEntity('dot-left', 'left')
    const right = makeEntity('dot-right', 'right')
    const session = attachKecoOverlay(createBattleSession({ left, right, preparationTicks: 0 }))
    const cast = resolveKecoCastSkill({
      session,
      keco: { ...session.keco!, skillById },
      actor: left,
      target: right,
      skillId: 'burning_import',
      commandId: 'dot-cast',
      tick: 0,
    })
    expect(cast.applied).toBe(true)
    const targetAfterCast = cast.keco.units[right.id]!
    expect(targetAfterCast.dot).toEqual({ damage: 0.5, remainingTurns: 2 })
    const turnEnd = processTurnEnd({ phase: 'player_turn', currentTurn: 1, player: targetAfterCast, monster: targetAfterCast, selectedSkill: null, skillCooldowns: {}, battleLogs: [], result: null }, targetAfterCast, [])
    expect(turnEnd.newUnit.hp).toBeLessThan(targetAfterCast.hp)
  })

  it('applies imported DOT fields in the map battle command path', () => {
    const draft: SimulationSkillDraft = {
      draftId: 'dot-map-runtime',
      fields: {
        id: { tableId: 'studio:lib1', columnKey: 'id', value: 'map_burning_import' },
        name: { tableId: 'studio:lib1', columnKey: 'name', value: 'Map Burning Import' },
        type: { tableId: 'studio:lib1', columnKey: 'type', value: 'attack' },
        power: { tableId: 'studio:lib1', columnKey: 'power', value: '1' },
        mpCost: { tableId: 'studio:lib1', columnKey: 'mpCost', value: '0' },
        maxCooldown: { tableId: 'studio:lib1', columnKey: 'maxCooldown', value: '0' },
        dotDamage: { tableId: 'studio:lib1', columnKey: 'dotDamage', value: '0.5' },
        dotDuration: { tableId: 'studio:lib1', columnKey: 'dotDuration', value: '2' },
      },
    }
    const result = validateSimulationSkillDrafts([draft])
    applyDefinitionsToRuntimeCatalog(result.definitions)
    const left = makeEntity('map-dot-left', 'left')
    left.skillSlots = [{ skillId: 'map_burning_import', cooldownTick: 0 }]
    const right = makeEntity('map-dot-right', 'right')
    let session = createBattleSession({ left, right, preparationTicks: 0 })
    session = enqueueBattleCommand(session, { commandId: 'map-dot-cast', sessionId: session.id, actorId: left.id, targetId: right.id, skillId: 'map_burning_import', action: 'cast_skill', tick: 0 })
    session = processBattleCommands({ ...session, tick: 1 }).session
    expect(session.right.effects.some((effect) => effect.effectType === 'dot')).toBe(true)
    const hpBefore = session.right.resources.hp
    const ticked = tickStatusEffects(session)
    expect(ticked.right.resources.hp).toBeLessThan(hpBefore)
  })

  it('advances element DOT and freeze through real map battle ticks', () => {
    const result = validateSimulationSkillDrafts([
      simulationDraft('element_burn_freeze', {
        attachElement: 'fire',
        attachStrength: 'weak',
        attachDuration: '2',
        dotDamage: '0.5',
        dotDuration: '2',
        freezeDuration: '2',
      }),
    ])
    expect(result.ok).toBe(true)
    applyDefinitionsToRuntimeCatalog(result.definitions)
    setKecoSkillsRecord(registerKecoSkills(result.kecoSkills))

    const left = makeEntity('combined-left', 'left')
    left.skillSlots = [{ skillId: 'element_burn_freeze', cooldownTick: 0 }]
    const right = makeEntity('combined-right', 'right')
    let session = attachKecoOverlay(createBattleSession({ left, right, preparationTicks: 0 }))
    session = enqueueBattleCommand(session, {
      commandId: 'combined-cast',
      sessionId: session.id,
      actorId: left.id,
      targetId: right.id,
      skillId: 'element_burn_freeze',
      action: 'cast_skill',
      tick: 0,
    })

    const engine = new BattleTickEngine()
    session = engine.tick(session).session
    const hpAfterFirstTurn = session.right.resources.hp

    expect(session.keco?.turn).toBe(1)
    expect(session.keco?.units[right.id]?.dot?.remainingTurns).toBe(1)
    expect(session.right.effects.some((effect) => effect.effectType === 'freeze')).toBe(true)

    session = engine.tick(session).session

    expect(session.keco?.turn).toBe(2)
    expect(session.right.resources.hp).toBeLessThan(hpAfterFirstTurn)
    expect(session.keco?.units[right.id]?.dot).toBeNull()
    expect(session.keco?.units[right.id]?.control).toBeNull()
  })

  it('applies an imported debuff when the same skill also uses the Keco element path', () => {
    const result = validateSimulationSkillDrafts([
      simulationDraft('element_debuff', {
        attachElement: 'water',
        attachStrength: 'weak',
        attachDuration: '2',
        specialType: 'def_debuff',
        specialValue: '0.25',
        specialDuration: '2',
      }),
    ])
    applyDefinitionsToRuntimeCatalog(result.definitions)
    setKecoSkillsRecord(registerKecoSkills(result.kecoSkills))
    const left = makeEntity('element-debuff-left', 'left')
    left.skillSlots = [{ skillId: 'element_debuff', cooldownTick: 0 }]
    const right = makeEntity('element-debuff-right', 'right')
    let session = attachKecoOverlay(createBattleSession({ left, right, preparationTicks: 0 }))
    session = enqueueBattleCommand(session, {
      commandId: 'element-debuff-cast',
      sessionId: session.id,
      actorId: left.id,
      targetId: right.id,
      skillId: 'element_debuff',
      action: 'cast_skill',
      tick: 0,
    })

    session = processBattleCommands({ ...session, tick: 1 }).session

    expect(session.right.effects.some((effect) => effect.tags?.includes('def_debuff'))).toBe(true)
  })

  it('applies supported imported special effects in the map battle command path', () => {
    const draft: SimulationSkillDraft = {
      draftId: 'debuff-runtime',
      fields: {
        id: { tableId: 'studio:lib1', columnKey: 'id', value: 'weakening_import' },
        name: { tableId: 'studio:lib1', columnKey: 'name', value: 'Weakening Import' },
        type: { tableId: 'studio:lib1', columnKey: 'type', value: 'attack' },
        power: { tableId: 'studio:lib1', columnKey: 'power', value: '1' },
        mpCost: { tableId: 'studio:lib1', columnKey: 'mpCost', value: '0' },
        maxCooldown: { tableId: 'studio:lib1', columnKey: 'maxCooldown', value: '0' },
        specialType: { tableId: 'studio:lib1', columnKey: 'specialType', value: 'def_debuff' },
        specialValue: { tableId: 'studio:lib1', columnKey: 'specialValue', value: '0.25' },
        specialDuration: { tableId: 'studio:lib1', columnKey: 'specialDuration', value: '2' },
      },
    }
    const result = validateSimulationSkillDrafts([draft])
    expect(result.ok).toBe(true)
    applyDefinitionsToRuntimeCatalog(result.definitions)
    const left = makeEntity('debuff-left', 'left')
    left.skillSlots = [{ skillId: 'weakening_import', cooldownTick: 0 }]
    const right = makeEntity('debuff-right', 'right')
    let session = createBattleSession({ left, right, preparationTicks: 0 })
    session = enqueueBattleCommand(session, { commandId: 'debuff-cast', sessionId: session.id, actorId: left.id, targetId: right.id, skillId: 'weakening_import', action: 'cast_skill', tick: 0 })
    session = processBattleCommands({ ...session, tick: 1 }).session
    expect(session.right.effects.some((effect) => effect.tags?.includes('def_debuff'))).toBe(true)
  })

  it('executes imported element attachment and explicit reaction triggers in map commands', () => {
    const result = validateSimulationSkillDrafts([
      simulationDraft('map_fire_setup', {
        attachElement: 'fire',
        attachStrength: 'weak',
        attachDuration: '2',
      }),
      simulationDraft('map_custom_reaction', {
        attachElement: 'grass',
        attachStrength: 'weak',
        attachDuration: '2',
        reactionTriggersJson: '[{"element":"fire","reaction":"vaporize"}]',
      }),
    ])
    expect(result.ok).toBe(true)
    applyDefinitionsToRuntimeCatalog(result.definitions)
    setKecoSkillsRecord(registerKecoSkills(result.kecoSkills))

    const left = makeEntity('element-left', 'left')
    left.skillSlots = result.definitions.map((skill) => ({ skillId: skill.id, cooldownTick: 0 }))
    const right = makeEntity('element-right', 'right')
    let session = attachKecoOverlay(createBattleSession({ left, right, preparationTicks: 0 }))

    session = enqueueBattleCommand(session, { commandId: 'attach-fire', sessionId: session.id, actorId: left.id, targetId: right.id, skillId: 'map_fire_setup', action: 'cast_skill', tick: 0 })
    session = processBattleCommands({ ...session, tick: 1 }).session
    expect(session.keco?.units[right.id]?.element?.element).toBe('fire')

    session = enqueueBattleCommand(session, { commandId: 'custom-reaction', sessionId: session.id, actorId: left.id, targetId: right.id, skillId: 'map_custom_reaction', action: 'cast_skill', tick: 1 })
    session = processBattleCommands({ ...session, tick: 2 }).session
    expect(session.keco?.logs.some((log) => log.type === 'element_reaction' && log.reaction === 'vaporize')).toBe(true)
    expect(session.events.some((event) => event.type === 'combo_triggered' && event.payload.comboId === 'keco:vaporize')).toBe(true)
  })

  it('refreshes stale Keco HP from battle-core before resolving result', () => {
    const result = validateSimulationSkillDrafts([
      simulationDraft('map_finisher', {
        power: '5',
        attachElement: 'water',
        attachStrength: 'weak',
        attachDuration: '2',
      }),
    ])
    applyDefinitionsToRuntimeCatalog(result.definitions)
    setKecoSkillsRecord(registerKecoSkills(result.kecoSkills))
    const left = makeEntity('finisher-left', 'left')
    left.skillSlots = [{ skillId: 'map_finisher', cooldownTick: 0 }]
    const right = makeEntity('finisher-right', 'right')
    let session = attachKecoOverlay(createBattleSession({ left, right, preparationTicks: 0 }))
    session = { ...session, right: { ...session.right, resources: { ...session.right.resources, hp: 1 } } }

    session = enqueueBattleCommand(session, { commandId: 'finish', sessionId: session.id, actorId: left.id, targetId: right.id, skillId: 'map_finisher', action: 'cast_skill', tick: 0 })
    session = processBattleCommands({ ...session, tick: 1 }).session

    expect(session.right.resources.hp).toBe(0)
    expect(session.keco?.units[right.id]?.hp).toBe(0)
    expect(session.result).toBe('left_win')
  })

  it('applies configured reaction extra damage instead of only logging it', () => {
    const attacker = entityToKecoUnit(makeEntity('reaction-attacker', 'left'))
    const defender = {
      ...entityToKecoUnit(makeEntity('reaction-defender', 'right')),
      element: { element: 'fire' as const, strength: 'weak' as const, remainingTurns: 2 },
    }
    const skill: KecoSkill = {
      id: 'configured-overload',
      name: 'Configured Overload',
      type: 'attack',
      power: 1,
      mpCost: 0,
      cooldown: 0,
      maxCooldown: 0,
      attachElement: { element: 'grass', strength: 'weak', duration: 2 },
      reactionTrigger: [{ element: 'fire', reaction: 'overload' }],
      description: '',
    }
    const state: BattleState = {
      phase: 'player_turn',
      currentTurn: 1,
      player: attacker,
      monster: defender,
      selectedSkill: null,
      skillCooldowns: {},
      battleLogs: [],
      result: null,
    }

    const result = executeSkill(state, attacker, defender, skill, [])

    expect(result.triggeredReaction).toBe('overload')
    expect(result.totalDamage).toBe(36)
  })
})

describe('Keco overlay tick boundaries', () => {
  it('does not advance Keco turns during battle preparation', () => {
    const session = attachKecoOverlay(createBattleSession({
      left: makeEntity('preparation-left', 'left'),
      right: makeEntity('preparation-right', 'right'),
      preparationTicks: 2,
    }))

    const ticked = new BattleTickEngine().tick(session).session

    expect(ticked.phase).toBe('preparation')
    expect(ticked.keco?.turn).toBe(0)
  })

  it('does not advance Keco statuses after battle result is final', () => {
    const attached = attachKecoOverlay(createBattleSession({
      left: makeEntity('finished-left', 'left'),
      right: makeEntity('finished-right', 'right'),
      preparationTicks: 0,
    }))
    const rightUnit = attached.keco!.units[attached.right.id]!
    const finished = {
      ...attached,
      result: 'left_win' as const,
      keco: {
        ...attached.keco!,
        units: {
          ...attached.keco!.units,
          [attached.right.id]: {
            ...rightUnit,
            dot: { damage: 0.5, remainingTurns: 2 },
          },
        },
      },
    }

    const ticked = new BattleTickEngine().tick(finished).session

    expect(ticked.keco?.turn).toBe(0)
    expect(ticked.keco?.units[attached.right.id]?.dot?.remainingTurns).toBe(2)
    expect(ticked.right.resources.hp).toBe(finished.right.resources.hp)
  })
})

function simulationDraft(
  id: string,
  overrides: Partial<Record<string, string>>,
): SimulationSkillDraft {
  const values = {
    id,
    name: id,
    type: 'attack',
    power: '1',
    mpCost: '0',
    maxCooldown: '0',
    ...overrides,
  }
  return {
    draftId: `draft-${id}`,
    fields: Object.fromEntries(Object.entries(values).map(([key, value]) => [
      key,
      { tableId: 'studio:skills', columnKey: key, value },
    ])) as SimulationSkillDraft['fields'],
  }
}

function makeEntity(id: string, team: 'left' | 'right'): BattleEntity {
  return {
    id,
    name: id,
    team,
    position: { x: team === 'left' ? 1 : 2, y: 1 },
    resources: { hp: 100, maxHp: 100, mp: 20, maxMp: 20, stamina: 10, maxStamina: 10, rage: 0, maxRage: 100, shield: 0, maxShield: 10 },
    atk: 20,
    def: 5,
    spd: 5,
    skillSlots: [],
    defending: false,
    alive: true,
    effects: [],
  }
}
