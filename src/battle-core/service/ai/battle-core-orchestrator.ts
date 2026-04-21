import type { BattleSession } from '../../domain/entities/battle-session'
import { enqueueBattleCommand } from '../../engine/command-processor'
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
  private readonly decisionEngine: AutoDecisionEngine
  private readonly llmConfig?: LlmProviderConfig
  private readonly useProxyMode: boolean
  private readonly actorStates = new Map<string, ActorState>()
  private llmAvailability: 'unknown' | 'available' | 'unavailable'
  private availabilityCheckPending = false
  private llmDisabledForCurrentBattle = false

  constructor(options?: OrchestratorOptions) {
    this.llmConfig = options?.llmConfig
    this.decisionEngine = new AutoDecisionEngine(this.llmConfig)
    this.useProxyMode = Boolean(this.llmConfig?.proxyUrl)
    this.llmAvailability = this.useProxyMode ? 'unknown' : 'available'
  }

  public prepareCommands(session: BattleSession, executeAtTick: number): PrepareDecisionResult {
    if (session.result !== 'ongoing') {
      return {
        session,
        failedActorIds: []
      }
    }
    if (!this.shouldUseLlm()) {
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
    if (!this.shouldUseLlm()) return
    this.prefetchDecision(session, session.left.id)
    this.prefetchDecision(session, session.right.id)
  }

  public ensureLlmAvailability(): void {
    if (!this.useProxyMode) return
    if (this.llmDisabledForCurrentBattle) return
    if (this.llmAvailability !== 'unknown') return
    if (this.availabilityCheckPending) return
    this.availabilityCheckPending = true
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1500)
    const proxyBaseUrl = String(this.llmConfig?.proxyUrl || 'http://localhost:8787').replace(/\/$/, '')
    void fetch(`${proxyBaseUrl}/health`, { signal: controller.signal })
      .then(async (resp) => {
        if (!resp.ok) {
          this.llmAvailability = 'unavailable'
          return
        }
        const payload = (await resp.json()) as { ok?: boolean; hasKey?: boolean }
        this.llmAvailability = payload.ok && payload.hasKey ? 'available' : 'unavailable'
      })
      .catch(() => {
        this.llmAvailability = 'unavailable'
      })
      .finally(() => {
        clearTimeout(timer)
        this.availabilityCheckPending = false
      })
  }

  public shouldUseLlm(): boolean {
    return !this.llmDisabledForCurrentBattle && this.llmAvailability === 'available'
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
    if (!this.shouldUseLlm()) return
    if (session.result !== 'ongoing') return
    const actor = session.left.id === actorId ? session.left : session.right
    const target = actor.id === session.left.id ? session.right : session.left
    if (!actor.alive || !target.alive) return
    const state = this.getActorState(actorId, actor.spd)
    if (state.pending || state.cachedDecision) return
    const memory = buildShortTermMemory(session, actorId)
    state.pending = true
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
        if (this.useProxyMode && result.error) {
          this.llmDisabledForCurrentBattle = true
          this.llmAvailability = 'unavailable'
        }
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
      nextDueTick: Math.max(1, intervalTicksForSpd(spd))
    }
    this.actorStates.set(actorId, created)
    return created
  }
}

function intervalTicksForSpd(spd: number): number {
  return Math.max(2, Math.min(12, 10 - Math.floor(spd / 4)))
}

