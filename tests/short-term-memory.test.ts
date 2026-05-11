import { describe, expect, it } from 'vitest'
import { createBattleSession } from '../src/battle-core/domain/entities/battle-session'
import type { BattleEntity } from '../src/battle-core/domain/entities/battle-entity'
import type { BattleEvent } from '../src/battle-core/domain/types/event-types'
import {
  buildShortTermMemory,
  memoryDerivedRecentEventsSummary,
  MEMORY_SUMMARY_OUTCOME_LIMIT,
} from '../src/battle-core/service/ai/short-term-memory'

function entity(id: string, team: 'left' | 'right', hp: number, maxHp: number): BattleEntity {
  return {
    id,
    name: id,
    team,
    position: { x: 1, y: 1 },
    resources: {
      hp,
      maxHp,
      mp: 10,
      maxMp: 10,
      stamina: 10,
      maxStamina: 10,
      rage: 0,
      maxRage: 100,
      shield: 0,
      maxShield: 10,
    },
    atk: 10,
    def: 5,
    spd: 10,
    skillSlots: [],
    defending: false,
    alive: true,
    effects: [],
  }
}

function damageEvent(
  sessionId: string,
  tick: number,
  actorId: string,
  targetId: string,
  damage: number,
  rawDamage: number,
  shieldAbsorbed: number
): BattleEvent {
  return {
    eventId: `e-${tick}-${targetId}`,
    sessionId,
    tick,
    type: 'damage_applied',
    payload: { actorId, targetId, damage, rawDamage, shieldAbsorbed },
    createdAt: 0,
  }
}

describe('buildShortTermMemory', () => {
  it('aggregates HP lost in window and snapshot missing HP from max', () => {
    const left = entity('L', 'left', 70, 100)
    const right = entity('R', 'right', 90, 100)
    let session = createBattleSession({ left, right, preparationTicks: 0 })
    const ev: BattleEvent[] = [
      damageEvent(session.id, 1, 'R', 'L', 10, 12, 2),
      damageEvent(session.id, 2, 'L', 'R', 5, 5, 0),
      damageEvent(session.id, 3, 'R', 'L', 20, 25, 5),
    ]
    session = { ...session, events: ev }

    const mem = buildShortTermMemory(session, 'L')
    expect(mem.actorHpLostInWindow).toBe(30)
    expect(mem.targetHpLostInWindow).toBe(5)
    expect(mem.actorMissingHpFromMax).toBe(30)
    expect(mem.targetMissingHpFromMax).toBe(10)
    expect(mem.recentCombatOutcomeSummary.length).toBe(3)
  })

  it('memoryDerivedRecentEventsSummary includes totals and is undefined when empty', () => {
    const left = entity('L', 'left', 100, 100)
    const right = entity('R', 'right', 100, 100)
    const session = createBattleSession({ left, right, preparationTicks: 0 })
    const mem = buildShortTermMemory(session, 'L')
    expect(memoryDerivedRecentEventsSummary(mem)).toBeUndefined()
  })

  it('caps outcome lines at MEMORY_SUMMARY_OUTCOME_LIMIT', () => {
    const left = entity('L', 'left', 50, 100)
    const right = entity('R', 'right', 100, 100)
    let session = createBattleSession({ left, right, preparationTicks: 0 })
    const many: BattleEvent[] = []
    for (let i = 0; i < MEMORY_SUMMARY_OUTCOME_LIMIT + 15; i += 1) {
      many.push(damageEvent(session.id, i, 'R', 'L', 1, 1, 0))
    }
    session = { ...session, events: many }
    const mem = buildShortTermMemory(session, 'L')
    expect(mem.recentCombatOutcomeSummary.length).toBe(MEMORY_SUMMARY_OUTCOME_LIMIT)
  })
})
