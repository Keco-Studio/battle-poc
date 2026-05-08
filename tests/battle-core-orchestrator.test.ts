import { describe, expect, it } from 'vitest'
import { createBattleSession } from '../src/battle-core/domain/entities/battle-session'
import type { BattleEntity } from '../src/battle-core/domain/entities/battle-entity'
import { enqueueBattleCommand } from '../src/battle-core/engine/command-processor'
import { BattleTickEngine } from '../src/battle-core/engine/tick-engine'
import { BattleCoreOrchestrator } from '../src/battle-core/service/ai/battle-core-orchestrator'

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
    spd: 12,
    skillSlots: (input.skills || []).map((skillId) => ({ skillId, cooldownTick: 0 })),
    defending: false,
    alive: true,
    effects: []
  }
}

describe('battle core orchestrator', () => {
  it('can continuously enqueue commands for both sides and advance battle events', async () => {
    const left = makeEntity({ id: 'left-c', team: 'left', x: 3, y: 2, skills: ['arcane_bolt'] })
    const right = makeEntity({ id: 'right-c', team: 'right', x: 6.2, y: 2, skills: ['arcane_bolt'] })
    let session = createBattleSession({ left, right, preparationTicks: 0 })
    const orchestrator = new BattleCoreOrchestrator()
    const tickEngine = new BattleTickEngine()
    for (let tick = 1; tick <= 8; tick += 1) {
      const prepared = orchestrator.prepareCommands(session, tick)
      session = prepared.session
      if (prepared.failedActorIds.includes(left.id)) {
        session = enqueueBattleCommand(session, {
          commandId: `fallback-left-${tick}`,
          sessionId: session.id,
          actorId: left.id,
          tick,
          action: 'dash',
          targetId: right.id,
          metadata: { moveTargetX: right.position.x - 1.3, moveTargetY: right.position.y }
        })
      }
      if (prepared.failedActorIds.includes(right.id)) {
        session = enqueueBattleCommand(session, {
          commandId: `fallback-right-${tick}`,
          sessionId: session.id,
          actorId: right.id,
          tick,
          action: 'dash',
          targetId: left.id,
          metadata: { moveTargetX: left.position.x + 1.3, moveTargetY: left.position.y }
        })
      }
      session = tickEngine.tick(session).session
      orchestrator.onTickFinished(session)
      await Promise.resolve()
    }
    const hasAction = session.events.some((event) => event.type === 'action_executed')
    expect(hasAction).toBe(true)
  })

  it('prioritizes LLM by not marking actor failed while request is pending', () => {
    const left = makeEntity({ id: 'left-pending', team: 'left', x: 3, y: 2, skills: ['arcane_bolt'] })
    const right = makeEntity({ id: 'right-pending', team: 'right', x: 6.2, y: 2, skills: ['arcane_bolt'] })
    const session = createBattleSession({ left, right, preparationTicks: 0 })
    const orchestrator = new BattleCoreOrchestrator()

    const internal = orchestrator as unknown as {
      llmAvailability: 'unknown' | 'available' | 'unavailable'
      actorStates: Map<string, { pending: boolean; cachedDecision: null; lastError: string | null }>
    }
    internal.llmAvailability = 'available'
    internal.actorStates.set(left.id, { pending: true, cachedDecision: null, lastError: null })

    const prepared = orchestrator.prepareCommands(session, 1)
    expect(prepared.failedActorIds.includes(left.id)).toBe(false)
  })
})

