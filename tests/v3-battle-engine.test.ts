import { describe, expect, it } from 'vitest'

import { V3_CONTENT } from '@/src/content/generated/v3'
import {
  applyBehaviorTreePatch,
  createBattle,
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
    },
    right: {
      templateType: 'enemy',
      templateId: 'briar_sentinel',
      skillIds: ['solar_lance', 'bloom_guard', 'gale_step', 'prism_snare'],
      treeId: 'tree_survival',
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
})
