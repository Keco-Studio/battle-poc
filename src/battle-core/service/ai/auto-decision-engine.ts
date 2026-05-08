import type { BattleEntity } from '../../domain/entities/battle-entity'
import type { BattleSession } from '../../domain/entities/battle-session'
import { getBattleSkillDefinition } from '../../content/skills/basic-skill-catalog'
import type { ShortTermMemory } from './short-term-memory'
import {
  buildStructuredPayload,
  buildSystemPrompt,
  type LlmMapGridSnapshot,
} from './decision-tree/llm-prompt-builder'

export type RawBattleDecision = {
  action?: string
  targetId?: string
  skillId?: string
  sequence?: unknown[]
  name?: string
  ttlTicks?: number
  metadata?: Record<string, unknown>
}

export type LlmProviderConfig = {
  provider: 'deepseek' | 'zhipu' | 'minimax' | 'custom'
  apiKey?: string
  model?: string
  proxyUrl?: string
  baseUrl?: string
  timeoutMs?: number
}

/**
 * Context passed to LLM providers. Renamed from the ambiguous
 * `DecisionContext` (which collided with decision-tree/decision-context.ts).
 */
export type LlmDecisionContext = {
  session: BattleSession
  actor: BattleEntity
  target: BattleEntity
  memory: ShortTermMemory
  /** Session id for tracing */
  battleId?: string
  decisionRefreshReason?: string
  currentIntent?: string
  recentEventsSummary?: string
  /** Row-major walkable matrix from map collision (optional when no grid available) */
  mapGrid?: LlmMapGridSnapshot
}

export type { LlmMapGridSnapshot }

function structuredPayloadArgs(context: LlmDecisionContext): Parameters<typeof buildStructuredPayload>[0] {
  return {
    session: context.session,
    actor: context.actor,
    target: context.target,
    refreshReason: context.decisionRefreshReason ?? 'interval',
    currentIntent: context.currentIntent ?? 'trade',
    memorySummary: context.memory.recentActionSummary.join(', ') || 'No recent actions.',
    battleId: context.battleId,
    recentEventsSummary: context.recentEventsSummary,
    mapGrid: context.mapGrid,
  }
}

export type DecisionResult = {
  decision: RawBattleDecision | null
  source: 'remote_llm' | 'heuristic_fallback'
  error?: string
}

interface DecisionProvider {
  request(context: LlmDecisionContext): Promise<RawBattleDecision>
}

const MIN_TIMEOUT_MS = 400
/** Proxy + MiniMax + 大地图 payload 常需 10–25s+；须大于浏览器/代理上游等待时间 */
const DEFAULT_TIMEOUT_MS = 60000
const ERROR_BODY_SNIPPET_LIMIT = 140

class HeuristicDecisionProvider implements DecisionProvider {
  async request(context: LlmDecisionContext): Promise<RawBattleDecision> {
    const { actor, target } = context
    const distance = Math.hypot(actor.position.x - target.position.x, actor.position.y - target.position.y)
    const availableSkill = actor.skillSlots
      .map((slot) => ({
        slot,
        skill: getBattleSkillDefinition(slot.skillId)
      }))
      .find(
        (entry) =>
          entry.skill &&
          entry.slot.cooldownTick <= context.session.tick &&
          actor.resources.mp >= entry.skill.mpCost &&
          distance <= entry.skill.range
      )
    if (availableSkill?.skill) {
      return {
        action: 'cast_skill',
        targetId: target.id,
        skillId: availableSkill.skill.id
      }
    }
    if (distance <= 1.8) {
      return {
        action: 'basic_attack',
        targetId: target.id
      }
    }
    return {
      action: 'dash',
      targetId: target.id,
      metadata: {
        moveTargetX: actor.team === 'left' ? target.position.x - 1.4 : target.position.x + 1.4,
        moveTargetY: target.position.y
      }
    }
  }
}

/**
 * Shared skeleton for HTTP-based LLM providers. Subclasses only need to
 * describe how to *build* the request and *parse* the response — the
 * timeout/abort/fetch/error-envelope plumbing is done here.
 */
abstract class BaseHttpLlmProvider implements DecisionProvider {
  constructor(protected readonly config: LlmProviderConfig) { }

  async request(context: LlmDecisionContext): Promise<RawBattleDecision> {
    const timeoutMs = Math.max(MIN_TIMEOUT_MS, Number(this.config.timeoutMs || DEFAULT_TIMEOUT_MS))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const { endpoint, init } = this.buildRequest(context, timeoutMs)
      const resp = await fetch(endpoint, { ...init, signal: controller.signal })
      if (!resp.ok) {
        const bodyText = await resp.text().catch(() => '')
        throw new Error(`${this.httpErrorPrefix}${resp.status}:${bodyText.slice(0, ERROR_BODY_SNIPPET_LIMIT)}`)
      }
      return await this.parseResponse(resp)
    } finally {
      clearTimeout(timer)
    }
  }

  protected getDefaultModel(): string {
    if (this.config.provider === 'deepseek') return 'deepseek-chat'
    if (this.config.provider === 'zhipu') return 'glm-4.5'
    if (this.config.provider === 'minimax') return 'MiniMax-M2.1'
    return 'gpt-4o-mini'
  }

  protected abstract readonly httpErrorPrefix: string
  protected abstract buildRequest(
    context: LlmDecisionContext,
    timeoutMs: number,
  ): { endpoint: string; init: RequestInit }
  protected abstract parseResponse(resp: Response): Promise<RawBattleDecision>
}

class ProxyLlmDecisionProvider extends BaseHttpLlmProvider {
  protected readonly httpErrorPrefix = 'proxy_http_'

  protected buildRequest(context: LlmDecisionContext, timeoutMs: number) {
    const proxyBase = String(this.config.proxyUrl || 'http://localhost:8787').replace(/\/$/, '')
    const payload = buildStructuredPayload(structuredPayloadArgs(context))
    return {
      endpoint: `${proxyBase}/api/ai/battle-decision`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: this.config.provider,
          model: this.config.model || this.getDefaultModel(),
          systemPrompt: buildSystemPrompt(),
          prompt: JSON.stringify(payload),
          timeoutMs,
        }),
      },
    }
  }

  protected async parseResponse(resp: Response): Promise<RawBattleDecision> {
    const text = await resp.text()
    let payload: { decision?: RawBattleDecision; error?: string }
    try {
      payload = JSON.parse(text) as { decision?: RawBattleDecision; error?: string }
    } catch {
      throw new Error(`proxy_response_not_json:${text.slice(0, 140)}`)
    }
    if (payload.error) throw new Error(payload.error)
    const parsed = payload.decision as Record<string, unknown> | undefined
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('proxy_parse_error:no_decision_object')
    }
    return parsed as RawBattleDecision
  }
}

class DirectRemoteLlmDecisionProvider extends BaseHttpLlmProvider {
  protected readonly httpErrorPrefix = 'llm_http_'

  protected buildRequest(context: LlmDecisionContext, _timeoutMs: number) {
    const payload = buildStructuredPayload(structuredPayloadArgs(context))
    return {
      endpoint: this.getEndpoint(),
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey || ''}`,
        },
        body: JSON.stringify({
          model: this.config.model || this.getDefaultModel(),
          temperature: 0.2,
          response_format: { type: 'json_object' },
          max_tokens: 280,
          messages: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: JSON.stringify(payload) },
          ],
        }),
      },
    }
  }

  protected async parseResponse(resp: Response): Promise<RawBattleDecision> {
    const payload = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = String(payload.choices?.[0]?.message?.content || '')
    const parsed = parseJsonObject(content)
    if (!parsed || typeof parsed !== 'object') throw new Error('llm_parse_error')
    return parsed as RawBattleDecision
  }

  private getEndpoint(): string {
    if (this.config.baseUrl) return this.config.baseUrl
    if (this.config.provider === 'deepseek') return 'https://api.deepseek.com/chat/completions'
    if (this.config.provider === 'zhipu') return 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
    throw new Error('missing_llm_base_url')
  }
}

function buildPrompt(context: LlmDecisionContext): string {
  const { session, actor, target, memory } = context
  const distance = Math.hypot(actor.position.x - target.position.x, actor.position.y - target.position.y)
  const skillSummary = actor.skillSlots
    .map((slot) => {
      const skill = getBattleSkillDefinition(slot.skillId)
      if (!skill) return `${slot.skillId}:unknown`
      return `${skill.id}(cd:${slot.cooldownTick - session.tick},mp:${skill.mpCost},r:${skill.range})`
    })
    .join(', ')
  return [
    `tick=${session.tick}`,
    `phase=${session.phase}`,
    `actor=${actor.id},hp=${actor.resources.hp}/${actor.resources.maxHp},mp=${actor.resources.mp},stamina=${actor.resources.stamina}`,
    `target=${target.id},hp=${target.resources.hp}/${target.resources.maxHp}`,
    `distance=${distance.toFixed(2)}`,
    `skills=${skillSummary}`,
    `recentActions=${memory.recentActionSummary.join('|') || 'none'}`,
    `recentRejects=${JSON.stringify(memory.recentRejectReasons)}`,
    'allowedActions=basic_attack,cast_skill,defend,dash,dodge,flee'
  ].join('\n')
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    const slice = trimmed.slice(start, end + 1)
    try {
      return JSON.parse(slice) as Record<string, unknown>
    } catch {
      return null
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class AutoDecisionEngine {
  private readonly provider: DecisionProvider
  private readonly usesRemoteProvider: boolean

  constructor(private readonly config?: LlmProviderConfig) {
    if (config?.proxyUrl) {
      this.provider = new ProxyLlmDecisionProvider(config)
      this.usesRemoteProvider = true
      return
    }
    if (config?.apiKey) {
      this.provider = new DirectRemoteLlmDecisionProvider(config)
      this.usesRemoteProvider = true
      return
    }
    this.provider = new HeuristicDecisionProvider()
    this.usesRemoteProvider = false
  }

  async requestDecision(context: LlmDecisionContext): Promise<DecisionResult> {
    const attempts = this.usesRemoteProvider ? 2 : 1
    let lastError: string | undefined
    for (let a = 0; a < attempts; a += 1) {
      try {
        const decision = await this.provider.request(context)
        return {
          decision,
          source: this.usesRemoteProvider ? 'remote_llm' : 'heuristic_fallback'
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        if (a + 1 < attempts) {
          await sleep(280)
        }
      }
    }
    return {
      decision: null,
      source: 'heuristic_fallback',
      error: lastError
    }
  }
}
