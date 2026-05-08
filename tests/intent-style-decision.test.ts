import { describe, expect, it } from 'vitest'
import { expandIntentStyleDecision } from '../src/battle-core/service/ai/dynamic-strategy-validator'
import { buildWalkableRowsForLlm } from '../src/battle-core/service/ai/decision-tree/map-grid-for-llm'

describe('expandIntentStyleDecision', () => {
  it('preserves legacy single-action decisions', () => {
    const raw = { action: 'cast_skill', skillId: 'arcane_bolt' }
    expect(expandIntentStyleDecision(raw)).toEqual(raw)
  })

  it('preserves sequence payloads', () => {
    const raw = {
      name: 'combo',
      sequence: [{ action: 'dash', moveTargetX: 1, moveTargetY: 2 }],
      ttlTicks: 5,
    }
    expect(expandIntentStyleDecision(raw)).toEqual(raw)
  })

  it('expands move_first intent into dash then skill', () => {
    const out = expandIntentStyleDecision({
      intent: 'move_and_act',
      move: { targetX: 4, targetY: 5 },
      action: { type: 'cast_skill', skillId: 'fireball' },
      priority: 'move_first',
      ttlTicks: 6,
    })
    expect(out?.sequence?.length).toBe(2)
    expect(out?.sequence?.[0]).toMatchObject({ action: 'dash', moveTargetX: 4, moveTargetY: 5 })
    expect(out?.sequence?.[1]).toMatchObject({ action: 'cast_skill', skillId: 'fireball' })
  })
})

describe('buildWalkableRowsForLlm', () => {
  it('builds a row-major walkable matrix', () => {
    const rows = buildWalkableRowsForLlm(2, 2, (x, y) => x === y)
    expect(rows.length).toBe(2)
    expect(rows[0]).toEqual([true, false])
    expect(rows[1]).toEqual([false, true])
  })
})
