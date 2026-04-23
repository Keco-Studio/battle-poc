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
}

type OrchestratorOptions = {
  llmConfig?: LlmProviderConfig
}

export type RawSequenceData = {
  actorId: string
  raw: Record<string, unknown>
}

export type PrepareDecisionResult = {
  session: BattleSession
  failedActorIds: string[]
  sequences?: RawSequenceData[]
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
    const sequences: RawSequenceData[] = []
    this.prefetchDecision(nextSession, nextSession.left.id)
    this.prefetchDecision(nextSession, nextSession.right.id)
    const leftResult = this.maybeEnqueueDecision(nextSession, nextSession.left.id, executeAtTick)
    nextSession = leftResult.session
    if (leftResult.failed) failedActorIds.push(nextSession.left.id)
    if (leftResult.sequenceData) sequences.push(leftResult.sequenceData)
    const rightResult = this.maybeEnqueueDecision(nextSession, nextSession.right.id, executeAtTick)
    nextSession = rightResult.session
    if (rightResult.failed) failedActorIds.push(nextSession.right.id)
    if (rightResult.sequenceData) sequences.push(rightResult.sequenceData)
    return {
      session: nextSession,
      failedActorIds,
      sequences: sequences.length > 0 ? sequences : undefined,
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
  ): { session: BattleSession; failed: boolean; sequenceData?: RawSequenceData } {
    const actor = session.left.id === actorId ? session.left : session.right
    if (!actor.alive) return { session, failed: false }
    const state = this.getActorState(actorId)
    const hasFutureCommand = session.commandQueue.some(
      (command) => command.actorId === actorId && command.tick >= executeAtTick
    )
    if (hasFutureCommand) return { session, failed: false }
    if (!state.cachedDecision) {
      if (state.lastError) {
        state.lastError = null
      }
      return { session, failed: true }
    }

    if (Array.isArray(state.cachedDecision.sequence) && state.cachedDecision.sequence.length > 0) {
      const raw = state.cachedDecision as unknown as Record<string, unknown>
      state.cachedDecision = null
      return { session, failed: true, sequenceData: { actorId, raw } }
    }

    const normalized = normalizeDecisionToCommand({
      session,
      actorId,
      executeAtTick,
      rawDecision: state.cachedDecision
    })
    if (!normalized.ok || !normalized.command) {
      state.cachedDecision = null
      return {
        session,
        failed: true
      }
    }
    state.cachedDecision = null
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
    const state = this.getActorState(actorId)
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

  private getActorState(actorId: string): ActorState {
    const existing = this.actorStates.get(actorId)
    if (existing) return existing
    const created: ActorState = {
      pending: false,
      cachedDecision: null,
      lastError: null
    }
    this.actorStates.set(actorId, created)
    return created
  }
}

