import { describe, expect, it } from 'vitest'
import { createBattleSession } from '../src/battle-core/domain/entities/battle-session'
import type { BattleEntity } from '../src/battle-core/domain/entities/battle-entity'
import { normalizeDecisionToCommand } from '../src/battle-core/service/ai/dynamic-strategy-validator'

function makeEntity(input: {
  id: string
  team: 'left' | 'right'
  x: number
  y: number
  skills?: string[]
}): BattleEntity {
  return {
    id: input.id,
    name: input.id,
    team: input.team,
    position: { x: input.x, y: input.y },
    resources: {
      hp: 100,
      maxHp: 100,
      mp: 30,
      maxMp: 30,
      stamina: 40,
      maxStamina: 40,
      rage: 0,
      maxRage: 100,
      shield: 0,
      maxShield: 30
    },
    atk: 20,
    def: 8,
    spd: 10,
    skillSlots: (input.skills || []).map((skillId) => ({ skillId, cooldownTick: 0 })),
    defending: false,
    alive: true,
    effects: []
  }
}

describe('dynamic strategy validator', () => {
it('illegal action falls back to fallback command', () => {
    const left = makeEntity({ id: 'left-a', team: 'left', x: 3, y: 2 })
    const right = makeEntity({ id: 'right-a', team: 'right', x: 6, y: 2 })
    const session = createBattleSession({ left, right, preparationTicks: 0 })
    const out = normalizeDecisionToCommand({
      session,
      actorId: left.id,
      executeAtTick: 1,
      rawDecision: {
        action: 'teleport'
      }
    })
    expect(out.ok).toBe(false)
    expect(out.command).toBeUndefined()
  })

  it('valid skill decision converts to cast_skill command', () => {
    const left = makeEntity({ id: 'left-b', team: 'left', x: 3, y: 2, skills: ['arcane_bolt'] })
    const right = makeEntity({ id: 'right-b', team: 'right', x: 6, y: 2 })
    const session = createBattleSession({ left, right, preparationTicks: 0 })
    const out = normalizeDecisionToCommand({
      session,
      actorId: left.id,
      executeAtTick: 1,
      rawDecision: {
        action: 'cast_skill',
        targetId: right.id,
        skillId: 'arcane_bolt'
      }
    })
    expect(out.ok).toBe(true)
    expect(out.command).toBeDefined()
    const command = out.command!
    expect(command.action).toBe('cast_skill')
    expect(command.skillId).toBe('arcane_bolt')
  })

  it('downgrades dash to dodge when dash is recently blocked repeatedly', () => {
    const left = makeEntity({ id: 'left-c', team: 'left', x: 3, y: 2 })
    const right = makeEntity({ id: 'right-c', team: 'right', x: 8, y: 2 })
    const base = createBattleSession({ left, right, preparationTicks: 0 })
    const session = {
      ...base,
      tick: 10,
      events: [
        ...base.events,
        {
          eventId: 'e-1',
          sessionId: base.id,
          tick: 8,
          type: 'command_rejected' as const,
          payload: { actorId: left.id, reason: 'dash_blocked' },
          createdAt: Date.now(),
        },
        {
          eventId: 'e-2',
          sessionId: base.id,
          tick: 9,
          type: 'command_rejected' as const,
          payload: { actorId: left.id, reason: 'dash_blocked_by_walkability' },
          createdAt: Date.now(),
        },
      ],
    }
    const out = normalizeDecisionToCommand({
      session,
      actorId: left.id,
      executeAtTick: 11,
      rawDecision: {
        action: 'dash',
        metadata: { moveTargetX: 6.4, moveTargetY: 2 }
      }
    })
    expect(out.ok).toBe(true)
    expect(out.command?.action).toBe('dodge')
  })
})

