import { describe, expect, it } from 'vitest'
import type { BattleEntity } from '../src/battle-core/domain/entities/battle-entity'
import type { BattleSession } from '../src/battle-core/domain/entities/battle-session'
import type { DecisionContext } from '../src/battle-core/service/ai/decision-tree/decision-context'
import { computeKiteRetreat } from '../src/battle-core/service/ai/decision-tree/decision-helpers'

function makeEntity(input: { id: string; team: 'left' | 'right'; x: number; y: number }): BattleEntity {
  return {
    id: input.id,
    name: input.id,
    team: input.team,
    position: { x: input.x, y: input.y },
    resources: {
      hp: 100,
      maxHp: 100,
      mp: 50,
      maxMp: 50,
      stamina: 50,
      maxStamina: 50,
      rage: 0,
      maxRage: 100,
      shield: 0,
      maxShield: 30,
    },
    atk: 20,
    def: 8,
    spd: 10,
    skillSlots: [],
    defending: false,
    alive: true,
    effects: [],
  }
}

function makeContext(tick: number): DecisionContext {
  const actor = makeEntity({ id: 'left-actor', team: 'left', x: 0.7, y: 6 })
  const target = makeEntity({ id: 'right-target', team: 'right', x: 6, y: 5 })
  const session = {
    id: 's1',
    tick,
    phase: 'battle',
    preparationEndTick: 0,
    result: 'ongoing',
    mapBounds: { minX: 0, maxX: 20, minY: 0, maxY: 12 },
    left: actor,
    right: target,
    commandQueue: [],
    chaseState: { status: 'none' },
    movementState: {},
    events: [],
    createdAt: 0,
    updatedAt: 0,
  } as BattleSession
  return {
    session,
    actor,
    target,
    tick,
    distance: 5.3,
    actorHpRatio: 1,
    targetHpRatio: 1,
    readySkills: [],
    preferredRange: 7,
    isControlled: false,
    mapBounds: { minX: 0, maxX: 20, minY: 0, maxY: 12 },
  }
}

describe('computeKiteRetreat near X edge', () => {
  it('when near edge and both up/down are walkable, should not alternate up/down due to tick parity', () => {
    const t10 = computeKiteRetreat(makeContext(10))
    const t11 = computeKiteRetreat(makeContext(11))

    expect(t10).not.toBeNull()
    expect(t11).not.toBeNull()
    expect(t10!.y).toBe(t11!.y)
  })

  it('when near left edge, should prioritize moving toward field interior to escape, avoiding long-term Y-axis only movement', () => {
    const out = computeKiteRetreat(makeContext(10))
    expect(out).not.toBeNull()
    expect(out!.x).toBeGreaterThan(0.7)
  })
})

