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

  it('enqueues bt-driven command metadata when llm runtime is available', () => {
    const left = makeEntity({ id: 'left-bt', team: 'left', x: 3, y: 2, skills: ['arcane_bolt'] })
    const right = makeEntity({ id: 'right-bt', team: 'right', x: 6.2, y: 2, skills: ['arcane_bolt'] })
    const session = createBattleSession({ left, right, preparationTicks: 0 })
    const orchestrator = new BattleCoreOrchestrator()
    const internal = orchestrator as unknown as {
      llmAvailability: 'unknown' | 'available' | 'unavailable'
    }
    internal.llmAvailability = 'available'

    const prepared = orchestrator.prepareCommands(session, 1)
    const leftCommand = prepared.session.commandQueue.find((entry) => entry.actorId === left.id && entry.tick === 1)
    expect(leftCommand).toBeDefined()
    expect(leftCommand?.metadata?.decisionSource).toBe('llm')
    expect(leftCommand?.metadata?.btVersion).toBe(2)
  })

  it('throttles bt command enqueue instead of issuing every tick', () => {
    const left = makeEntity({ id: 'left-throttle', team: 'left', x: 3, y: 2, skills: ['arcane_bolt'] })
    const right = makeEntity({ id: 'right-throttle', team: 'right', x: 6.2, y: 2, skills: ['arcane_bolt'] })
    const orchestrator = new BattleCoreOrchestrator()
    const internal = orchestrator as unknown as {
      llmAvailability: 'unknown' | 'available' | 'unavailable'
    }
    internal.llmAvailability = 'available'

    const session1 = createBattleSession({ left, right, preparationTicks: 0 })
    const prepared1 = orchestrator.prepareCommands(session1, 1)
    const prepared2 = orchestrator.prepareCommands(prepared1.session, 2)

    const tick1CommandsForLeft = prepared2.session.commandQueue.filter(
      (entry) => entry.actorId === left.id && entry.tick === 1
    )
    const tick2CommandsForLeft = prepared2.session.commandQueue.filter(
      (entry) => entry.actorId === left.id && entry.tick === 2
    )

    expect(tick1CommandsForLeft.length).toBe(1)
    expect(tick2CommandsForLeft.length).toBe(0)
  })

  it('arbitrates macro LLM vs BT instead of always taking LLM single action', async () => {
    const left = makeEntity({ id: 'left-macro', team: 'left', x: 3, y: 2, skills: ['arcane_bolt'] })
    const right = makeEntity({ id: 'right-macro', team: 'right', x: 9, y: 2, skills: ['arcane_bolt'] })
    const session = createBattleSession({ left, right, preparationTicks: 0 })
    const orchestrator = new BattleCoreOrchestrator()
    const internal = orchestrator as unknown as {
      llmAvailability: 'unknown' | 'available' | 'unavailable'
      actorStates: Map<string, {
        pending: boolean
        cachedDecision: { action?: string; metadata?: Record<string, unknown> } | null
        lastError: string | null
        btTree: object | null
        initialTreeRequested: boolean
        lastPatchTick: number
        lastMacroPlanTick: number
        nextActionTick: number
      }>
      decisionEngine: {
        requestDecision: (context: unknown) => Promise<{ decision: { action: string }; source: 'remote_llm' }>
      }
    }
    internal.llmAvailability = 'available'
    internal.actorStates.set(left.id, {
      pending: false,
      cachedDecision: null,
      lastError: null,
      btTree: null,
      initialTreeRequested: true,
      lastPatchTick: -9999,
      lastMacroPlanTick: -9999,
      nextActionTick: 999
    })
    internal.decisionEngine.requestDecision = async () => ({
      decision: { action: 'defend' },
      source: 'remote_llm'
    })

    orchestrator.prepareCommands(session, 1)
    await Promise.resolve()

    const updated = internal.actorStates.get(left.id)
    expect(updated?.cachedDecision?.metadata?.arbitrationPicked).toBe('bt')
    expect(updated?.cachedDecision?.metadata?.arbitrationScores).toBeDefined()
    expect(updated?.cachedDecision?.action).toBe('cast_skill')
  })
})

