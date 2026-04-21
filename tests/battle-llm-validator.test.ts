import { describe, expect, it } from 'vitest'
import { createBattleSession } from '../src/battle-core/domain/entities/battle-session'
import type { BattleEntity } from '../src/battle-core/domain/entities/battle-entity'
import { normalizeDecisionToCommand } from '../src/battle-core/service/dynamic-strategy-validator'

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
  it('非法 action 会降级到 fallback 命令', () => {
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

  it('合法技能决策会转为 cast_skill 命令', () => {
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
    expect(out.command.action).toBe('cast_skill')
    expect(out.command.skillId).toBe('arcane_bolt')
  })
})

