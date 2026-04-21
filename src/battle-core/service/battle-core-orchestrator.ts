import type { BattleSession } from '../domain/entities/battle-session'
import { enqueueBattleCommand } from '../engine/command-processor'
import {
  AutoDecisionEngine,
  type LlmProviderConfig,
  type RawBattleDecision
} from './auto-decision-engine'
import { buildShortTermMemory } from './short-term-memory'
import { normalizeDecisionToCommand } from './dynamic-strategy-validator'

type ActorState = {
  pending: boolean
  cachedDecision: RawBattleDecision | null
  lastError: string | null
  lastRequestTick: number
  nextDueTick: number
}

type OrchestratorOptions = {
  llmConfig?: LlmProviderConfig
}

export type PrepareDecisionResult = {
  session: BattleSession
  failedActorIds: string[]
}

export class BattleCoreOrchestrator {
  private static readonly PREFETCH_LEAD_TICKS = 1
  private readonly decisionEngine: AutoDecisionEngine
  private readonly actorStates = new Map<string, ActorState>()

  constructor(options?: OrchestratorOptions) {
    this.decisionEngine = new AutoDecisionEngine(options?.llmConfig)
  }

  public prepareCommands(session: BattleSession, executeAtTick: number): PrepareDecisionResult {
    if (session.result !== 'ongoing') {
      return {
        session,
        failedActorIds: []
      }
    }
    let nextSession = session
    const failedActorIds: string[] = []
    this.prefetchDecision(nextSession, nextSession.left.id)
    this.prefetchDecision(nextSession, nextSession.right.id)
    const leftResult = this.maybeEnqueueDecision(nextSession, nextSession.left.id, executeAtTick)
    nextSession = leftResult.session
    if (leftResult.failed) failedActorIds.push(nextSession.left.id)
    const rightResult = this.maybeEnqueueDecision(nextSession, nextSession.right.id, executeAtTick)
    nextSession = rightResult.session
    if (rightResult.failed) failedActorIds.push(nextSession.right.id)
    return {
      session: nextSession,
      failedActorIds
    }
  }

  public onTickFinished(session: BattleSession): void {
    this.prefetchDecision(session, session.left.id)
    this.prefetchDecision(session, session.right.id)
  }

  private maybeEnqueueDecision(
    session: BattleSession,
    actorId: string,
    executeAtTick: number
  ): { session: BattleSession; failed: boolean } {
    const actor = session.left.id === actorId ? session.left : session.right
    if (!actor.alive) return { session, failed: false }
    const state = this.getActorState(actorId, actor.spd)
    if (executeAtTick < state.nextDueTick) return { session, failed: false }
    if (state.pending) return { session, failed: false }
    if (!state.cachedDecision) {
      if (state.lastError) {
        state.nextDueTick = executeAtTick + intervalTicksForSpd(actor.spd)
        state.lastError = null
        return {
          session,
          failed: true
        }
      }
      return { session, failed: false }
    }
    const hasFutureCommand = session.commandQueue.some(
      (command) => command.actorId === actorId && command.tick >= executeAtTick
    )
    if (hasFutureCommand) return { session, failed: false }
    const normalized = normalizeDecisionToCommand({
      session,
      actorId,
      executeAtTick,
      rawDecision: state.cachedDecision
    })
    if (!normalized.ok || !normalized.command) {
      state.cachedDecision = null
      state.nextDueTick = executeAtTick + intervalTicksForSpd(actor.spd)
      return {
        session,
        failed: true
      }
    }
    state.cachedDecision = null
    state.nextDueTick = executeAtTick + intervalTicksForSpd(actor.spd)
    let command = normalized.command
    command = {
      ...command,
      metadata: {
        ...(command.metadata || {}),
        decisionSource: 'llm',
        validationReason: normalized.reason || 'ok'
      }
    }
    return {
      session: enqueueBattleCommand(session, command),
      failed: false
    }
  }

  private prefetchDecision(session: BattleSession, actorId: string): void {
    if (session.result !== 'ongoing') return
    const actor = session.left.id === actorId ? session.left : session.right
    const target = actor.id === session.left.id ? session.right : session.left
    if (!actor.alive || !target.alive) return
    const state = this.getActorState(actorId, actor.spd)
    // Only prefetch when action window is near; avoid spamming remote requests.
    if (session.tick + BattleCoreOrchestrator.PREFETCH_LEAD_TICKS < state.nextDueTick) return
    const hasFutureCommand = session.commandQueue.some(
      (command) => command.actorId === actorId && command.tick >= session.tick
    )
    if (hasFutureCommand) return
    if (state.pending || state.cachedDecision) return
    const memory = buildShortTermMemory(session, actorId)
    state.pending = true
    state.lastRequestTick = session.tick
    void this.decisionEngine
      .requestDecision({
        session,
        actor,
        target,
        memory
      })
      .then((result) => {
        state.cachedDecision = result.decision
        state.lastError = result.error || null
      })
      .finally(() => {
        state.pending = false
      })
  }

  private getActorState(actorId: string, spd: number): ActorState {
    const existing = this.actorStates.get(actorId)
    if (existing) return existing
    const created: ActorState = {
      pending: false,
      cachedDecision: null,
      lastError: null,
      lastRequestTick: -1,
      nextDueTick: Math.max(1, intervalTicksForSpd(spd))
    }
    this.actorStates.set(actorId, created)
    return created
  }
}

function intervalTicksForSpd(spd: number): number {
  return Math.max(2, Math.min(12, 10 - Math.floor(spd / 4)))
}

