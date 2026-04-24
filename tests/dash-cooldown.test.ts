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

describe('dash cooldown', () => {
  it('max 3 consecutive dash rounds allowed', () => {
    const left = makeEntity({ id: 'left-dash-limit', team: 'left', x: 2, y: 5 })
    const right = makeEntity({ id: 'right-dash-limit', team: 'right', x: 16, y: 5 })
    let session = createBattleSession({ left, right, preparationTicks: 0 })
    const tickEngine = new BattleTickEngine()

    for (let tick = 1; tick <= 4; tick += 1) {
      session = enqueueBattleCommand(session, {
        commandId: `dash-limit-${tick}`,
        sessionId: session.id,
        actorId: left.id,
        tick,
        action: 'dash',
        targetId: right.id,
        metadata: {
          moveTargetX: 18,
          moveTargetY: 5
        }
      })
      session = tickEngine.tick(session).session
    }

    const lastReject = [...session.events]
      .reverse()
      .find((event) => event.type === 'command_rejected' && event.payload.commandId === 'dash-limit-4')
    expect(lastReject?.payload.reason).toBe('dash_streak_limit_reached')
  })

  it('max 3 consecutive dash rounds allowed', () => {
    const left = makeEntity({ id: 'left-dash-cd', team: 'left', x: 2, y: 5 })
    const right = makeEntity({ id: 'right-dash-cd', team: 'right', x: 16, y: 5 })
    let session = createBattleSession({ left, right, preparationTicks: 0 })
    const tickEngine = new BattleTickEngine()

    for (let tick = 1; tick <= 3; tick += 1) {
      session = enqueueBattleCommand(session, {
        commandId: `dash-cd-move-${tick}`,
        sessionId: session.id,
        actorId: left.id,
        tick,
        action: 'dash',
        targetId: right.id,
        metadata: {
          moveTargetX: 18,
          moveTargetY: 5
        }
      })
      session = tickEngine.tick(session).session
    }

    session = enqueueBattleCommand(session, {
      commandId: 'dash-cd-stop',
      sessionId: session.id,
      actorId: left.id,
      tick: 4,
      action: 'defend'
    })
    session = tickEngine.tick(session).session

    for (let tick = 5; tick <= 6; tick += 1) {
      session = enqueueBattleCommand(session, {
        commandId: `dash-cd-blocked-${tick}`,
        sessionId: session.id,
        actorId: left.id,
        tick,
        action: 'dash',
        targetId: right.id,
        metadata: {
          moveTargetX: 18,
          moveTargetY: 5
        }
      })
      session = tickEngine.tick(session).session
    }

    session = enqueueBattleCommand(session, {
      commandId: 'dash-cd-resume',
      sessionId: session.id,
      actorId: left.id,
      tick: 7,
      action: 'dash',
      targetId: right.id,
      metadata: {
        moveTargetX: 18,
        moveTargetY: 5
      }
    })
    session = tickEngine.tick(session).session

    const blockedAt5 = session.events.find(
      (event) => event.type === 'command_rejected' && event.payload.commandId === 'dash-cd-blocked-5'
    )
    const blockedAt6 = session.events.find(
      (event) => event.type === 'command_rejected' && event.payload.commandId === 'dash-cd-blocked-6'
    )
    const resumedAt7 = session.events.find(
      (event) => event.type === 'action_executed' && event.payload.commandId === 'dash-cd-resume'
    )
    expect(blockedAt5?.payload.reason).toBe('dash_on_cooldown')
    expect(blockedAt6?.payload.reason).toBe('dash_on_cooldown')
    expect(resumedAt7?.payload.action).toBe('dash')
  })
})
