import { describe, expect, it } from 'vitest'
import {
  applyBehaviorTreePatch,
  sanitizeBehaviorTreeState,
} from '../src/battle-core/service/ai/behavior-tree/validation'
import type { BehaviorTreeState } from '../src/battle-core/service/ai/behavior-tree/types'

function buildSeedTree(): BehaviorTreeState {
  return {
    treeId: 'seed-tree',
    version: 1,
    updatedAtTick: 0,
    root: {
      id: 'root',
      type: 'selector',
      name: 'Root',
      children: [
        {
          id: 'cond_hp_low',
          type: 'condition',
          name: 'HP low',
          metric: 'hp_ratio',
          operator: '<=',
          value: 0.35,
        },
        {
          id: 'act_cast',
          type: 'action',
          name: 'Cast Bolt',
          action: 'cast_skill',
          target: 'approach',
          skillId: 'arcane_bolt',
        },
        {
          id: 'act_dash',
          type: 'action',
          name: 'Dash Back',
          action: 'dash',
          target: 'retreat',
          moveStep: 1.2,
        },
      ],
    },
  }
}

describe('behavior tree validation', () => {
  it('falls back to seed tree when response payload is invalid', () => {
    const seedTree = buildSeedTree()
    const sanitized = sanitizeBehaviorTreeState({ foo: 'bar' }, seedTree)
    expect(sanitized).toEqual(seedTree)
    expect(sanitized).not.toBe(seedTree)
  })

  it('sanitizes llm tree payload and clamps unsafe values', () => {
    const seedTree = buildSeedTree()
    const sanitized = sanitizeBehaviorTreeState(
      {
        tree: {
          treeId: 'llm-tree',
          version: 9,
          updatedAtTick: 16,
          root: {
            id: 'root2',
            type: 'sequence',
            children: [
              {
                id: 'cond1',
                type: 'condition',
                metric: 'distance',
                operator: '<=',
                value: 6,
              },
              {
                id: 'act1',
                type: 'action',
                action: 'dash',
                target: 'retreat',
                moveStep: 999,
              },
            ],
          },
        },
      },
      seedTree
    )
    expect(sanitized.treeId).toBe('llm-tree')
    expect(sanitized.version).toBe(9)
    expect(sanitized.root.type).toBe('sequence')
    const dashNode = sanitized.root.children[1]
    if (dashNode.type !== 'action') {
      throw new Error('expected action node')
    }
    expect(dashNode.moveStep).toBe(4.2)
  })

  it('applies set_condition_value patch and bumps version', () => {
    const seedTree = buildSeedTree()
    const result = applyBehaviorTreePatch(
      seedTree,
      {
        baseVersion: 1,
        reason: 'tighten hp retreat threshold',
        ops: [
          {
            op: 'set_condition_value',
            nodeId: 'cond_hp_low',
            value: 0.28,
          },
        ],
      },
      12
    )
    expect(result.applied).toBe(true)
    expect(result.reason).toBe('ok')
    expect(result.tree.version).toBe(2)
    expect(result.tree.updatedAtTick).toBe(12)
    const condNode = result.tree.root.children[0]
    if (condNode.type !== 'condition') {
      throw new Error('expected condition node')
    }
    expect(condNode.value).toBe(0.28)
  })

  it('rejects patch when base version mismatches current tree version', () => {
    const seedTree = buildSeedTree()
    const result = applyBehaviorTreePatch(
      seedTree,
      {
        baseVersion: 777,
        reason: 'stale patch',
        ops: [
          {
            op: 'set_condition_value',
            nodeId: 'cond_hp_low',
            value: 0.5,
          },
        ],
      },
      15
    )
    expect(result.applied).toBe(false)
    expect(result.reason).toBe('base_version_mismatch')
    expect(result.tree).toEqual(seedTree)
  })
})
