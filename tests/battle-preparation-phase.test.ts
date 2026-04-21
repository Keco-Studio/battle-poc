import { describe, expect, it } from 'vitest'
import { createBattleSession } from '../src/battle-core/domain/entities/battle-session'
import type { BattleEntity } from '../src/battle-core/domain/entities/battle-entity'
import { enqueueBattleCommand } from '../src/battle-core/engine/command-processor'
import { BattleTickEngine } from '../src/battle-core/engine/tick-engine'

function makeEntity(input: {
  id: string
  team: 'left' | 'right'
  x: number
  y: number
}): BattleEntity {
  return {
    id: input.id,
    name: input.id,
    team: input.team,
    position: { x: input.x, y: input.y },
    resources: {
      hp: 100,
      maxHp: 100,
      mp: 40,
      maxMp: 40,
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
    skillSlots: [],
    defending: false,
    alive: true,
    effects: []
  }
}

describe('battle preparation phase', () => {
  it('preparation阶段跳过攻击和位移命令', () => {
    const left = makeEntity({ id: 'left-1', team: 'left', x: 3, y: 5 })
    const right = makeEntity({ id: 'right-1', team: 'right', x: 4.2, y: 5 })
    let session = createBattleSession({ left, right })
    session = {
      ...session,
      phase: 'preparation',
      preparationEndTick: 20
    } as typeof session

    session = enqueueBattleCommand(session, {
      commandId: 'c-basic',
      sessionId: session.id,
      actorId: left.id,
      tick: 1,
      action: 'basic_attack',
      targetId: right.id
    })
    session = enqueueBattleCommand(session, {
      commandId: 'c-dash',
      sessionId: session.id,
      actorId: right.id,
      tick: 1,
      action: 'dash',
      targetId: left.id,
      metadata: { moveTargetX: 8, moveTargetY: 8 }
    })

    const out = new BattleTickEngine().tick(session).session
    expect(out.left.resources.hp).toBe(100)
    expect(out.right.resources.hp).toBe(100)
    expect(out.left.position).toEqual({ x: 3, y: 5 })
    expect(out.right.position).toEqual({ x: 4.2, y: 5 })
  })

  it('preparation阶段允许defend和dodge', () => {
    const left = makeEntity({ id: 'left-2', team: 'left', x: 2, y: 2 })
    const right = makeEntity({ id: 'right-2', team: 'right', x: 3, y: 2 })
    let session = createBattleSession({ left, right })
    session = {
      ...session,
      phase: 'preparation',
      preparationEndTick: 20
    } as typeof session

    session = enqueueBattleCommand(session, {
      commandId: 'c-def',
      sessionId: session.id,
      actorId: left.id,
      tick: 1,
      action: 'defend'
    })
    session = enqueueBattleCommand(session, {
      commandId: 'c-dodge',
      sessionId: session.id,
      actorId: right.id,
      tick: 1,
      action: 'dodge'
    })

    const out = new BattleTickEngine().tick(session).session
    expect(out.left.defending).toBe(true)
    expect(out.right.resources.stamina).toBeLessThan(40)
    expect(
      out.events.some(
        (ev) => ev.type === 'action_executed' && ev.payload.action === 'dodge' && ev.payload.actorId === right.id
      )
    ).toBe(true)
  })

  it('达到preparationEndTick后切换到battle阶段', () => {
    const left = makeEntity({ id: 'left-3', team: 'left', x: 1, y: 1 })
    const right = makeEntity({ id: 'right-3', team: 'right', x: 2.4, y: 1 })
    let session = createBattleSession({ left, right })
    session = {
      ...session,
      tick: 1,
      phase: 'preparation',
      preparationEndTick: 2
    } as typeof session

    const out = new BattleTickEngine().tick(session).session
    expect((out as typeof session).phase).toBe('battle')
  })
})
