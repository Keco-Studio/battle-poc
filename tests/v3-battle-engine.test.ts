import { describe, expect, it } from 'vitest'

import { V3_CONTENT } from '@/src/content/generated/v3'
import {
  applyBehaviorTreePatch,
  createBattle,
  evaluateBehaviorTreeWithTrace,
  resolveDecisionTick,
  validateAction,
  type V3BattleConfig,
} from '@/src/v3/runtime'

function config(overrides: Partial<V3BattleConfig> = {}): V3BattleConfig {
  return {
    seed: 7319,
    mapId: 'sunlit_circuit',
    maxDecisionTicks: 30,
    left: {
      templateType: 'job',
      templateId: 'astra_vanguard',
      skillIds: ['solar_lance', 'bloom_guard', 'gale_step', 'prism_snare'],
      treeId: 'tree_balanced',
      modifiers: { hp: 0, energy: 0, atk: 0, def: 0, spd: 0 },
    },
    right: {
      templateType: 'enemy',
      templateId: 'briar_sentinel',
      skillIds: ['solar_lance', 'bloom_guard', 'gale_step', 'prism_snare'],
      treeId: 'tree_survival',
      modifiers: { hp: 0, energy: 0, atk: 0, def: 0, spd: 0 },
    },
    versions: {
      content: V3_CONTENT.game.contentVersion,
      rules: V3_CONTENT.game.rulesetVersion,
      visual: V3_CONTENT.game.visualVersion,
      modelProvider: 'minimax',
      model: V3_CONTENT.game.defaultModel,
    },
    ...overrides,
  }
}

function runBattle(seed: number) {
  let state = createBattle(config({ seed }))
  while (state.result === 'ongoing') state = resolveDecisionTick(state, { left: null, right: null })
  return state
}

describe('V3 deterministic battle engine', () => {
  it('repeats the same battle with the same seed and decisions', () => {
    const first = runBattle(7319)
    const second = runBattle(7319)
    expect(second.events).toEqual(first.events)
    expect(second.result).toBe(first.result)
    expect(second.actors).toEqual(first.actors)
  })

  it('rejects out-of-range casts without spending energy', () => {
    const state = createBattle(config())
    state.actors.left.position = { x: 1, y: 1 }
    state.actors.right.position = { x: 14, y: 14 }
    const before = state.actors.left.energy

    const result = validateAction(state, {
      actorId: 'left',
      kind: 'skill',
      skillId: 'solar_lance',
      targetId: 'right',
    })

    expect(result).toEqual({ ok: false, code: 'out_of_range' })
    expect(state.actors.left.energy).toBe(before)
  })

  it('records the visited behavior path and selected non-root action node', () => {
    const state = createBattle(config())
    const evaluated = evaluateBehaviorTreeWithTrace(state, 'left')
    expect(evaluated.trace.visitedNodeIds).toEqual(expect.arrayContaining([
      'root', 'recover_seq', 'hp_low', 'execute_seq', 'enemy_low', 'control_seq', 'enemy_mobile', 'control',
    ]))
    expect(evaluated.trace.selectedNodeId).toBe('control')
    expect(evaluated.trace.selectedNodeId).not.toBe(state.trees.left.rootId)
  })

  it('records an invalid tree action before executing a safe fallback', () => {
    const state = createBattle(config({
      left: {
        ...config().left,
        skillIds: ['solar_lance', 'bloom_guard', 'gale_step', 'echo_bolt'],
      },
    }))
    const next = resolveDecisionTick(state, { left: null, right: null })
    const rejected = next.events.find((event) => event.type === 'action_rejected' && event.actorId === 'left')
    const fallback = next.events.find((event) => event.type === 'action' && event.actorId === 'left')
    expect(rejected).toMatchObject({ rejectCode: 'not_equipped', nodeId: 'control' })
    expect(rejected?.visitedNodeIds).toContain('root')
    expect(fallback).toMatchObject({ nodeId: 'control' })
    expect(next.tick).toBe(1)
  })

  it('rejects stale Tick and stale tree versions without mutating the tree', () => {
    const state = createBattle(config())
    const tree = state.trees.left

    const staleTick = applyBehaviorTreePatch(tree, {
      actorId: 'left',
      decisionTick: state.tick - 1,
      baseTreeVersion: tree.version,
      reason: 'old snapshot',
      ops: [{ kind: 'set_threshold', nodeId: 'hp_low', value: 0.5 }],
    }, state.tick, V3_CONTENT.rules.maxPatchOps, state.actors.left.skillIds)
    expect(staleTick.status).toBe('stale')
    expect(staleTick.tree).toBe(tree)

    const staleTree = applyBehaviorTreePatch(tree, {
      actorId: 'left',
      decisionTick: state.tick,
      baseTreeVersion: tree.version - 1,
      reason: 'old tree',
      ops: [{ kind: 'set_threshold', nodeId: 'hp_low', value: 0.5 }],
    }, state.tick, V3_CONTENT.rules.maxPatchOps, state.actors.left.skillIds)
    expect(staleTree.status).toBe('stale')
    expect(staleTree.tree).toBe(tree)
  })

  it('draws at the configured maximum decision Tick when both actors survive', () => {
    let state = createBattle(config({ maxDecisionTicks: 1 }))
    state.actors.left.atk = 1
    state.actors.right.atk = 1
    state = resolveDecisionTick(state, { left: null, right: null })
    expect(state.tick).toBe(1)
    expect(state.result).toBe('draw')
    expect(state.endReason).toBe('max_tick')
  })

  it('routes around arena obstacles and reaches damaging combat', () => {
    const state = runBattle(7319)
    expect(state.actors.left.damageDealt + state.actors.right.damageDealt).toBeGreaterThan(0)
    expect(state.events.some((event) => event.type === 'damage')).toBe(true)
  })

  it('applies embedded expedition modifiers to current and maximum stats', () => {
    const state = createBattle(config({
      left: {
        ...config().left,
        modifiers: { hp: 18, energy: 20, atk: 4, def: 3, spd: 1 },
      },
    }))
    const template = V3_CONTENT.jobs.astra_vanguard
    expect(state.actors.left).toMatchObject({
      hp: template.hp + 18,
      maxHp: template.hp + 18,
      energy: template.energy + 20,
      maxEnergy: template.energy + 20,
      atk: template.atk + 4,
      def: template.def + 3,
      spd: template.spd + 1,
    })
  })

  it('turns the prerequisite rewards into a meaningful but non-guaranteed boss advantage', () => {
    const skills = Object.keys(V3_CONTENT.skills)
    const loadouts: string[][] = []
    for (const first of skills) for (const second of skills) for (const third of skills) for (const fourth of skills) {
      const loadout = [first, second, third, fourth]
      if (new Set(loadout).size === 4) loadouts.push(loadout)
    }
    const boss = V3_CONTENT.enemies.eclipse_marshal
    const countWins = (modifiers: V3BattleConfig['left']['modifiers']) => loadouts.reduce((wins, skillIds) => {
      let state = createBattle(config({
        mapId: 'prism_gate',
        maxDecisionTicks: V3_CONTENT.rules.maxDecisionTicks,
        left: { ...config().left, skillIds, modifiers },
        right: {
          templateType: 'enemy',
          templateId: boss.id,
          skillIds: boss.skillIds,
          treeId: boss.treeId,
          modifiers: { hp: 0, energy: 0, atk: 0, def: 0, spd: 0 },
        },
      }))
      while (state.result === 'ongoing') state = resolveDecisionTick(state, { left: null, right: null })
      return wins + (state.result === 'left_win' ? 1 : 0)
    }, 0)

    expect(loadouts).toHaveLength(1680)
    expect(countWins({ hp: 0, energy: 0, atk: 0, def: 0, spd: 0 })).toBe(0)
    const progressedWins = countWins({ hp: 18, energy: 20, atk: 4, def: 3, spd: 1 })
    expect(progressedWins).toBeGreaterThan(0)
    expect(progressedWins).toBeLessThan(loadouts.length)
  }, 30_000)
})
