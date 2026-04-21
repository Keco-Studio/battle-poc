import type { BattleEntity } from '../domain/entities/battle-entity'
import type { BattleSession } from '../domain/entities/battle-session'
import { getBattleSkillDefinition } from '../content/skills/basic-skill-catalog'
import type { ShortTermMemory } from './short-term-memory'

export type RawBattleDecision = {
  action?: string
  targetId?: string
  skillId?: string
  metadata?: Record<string, unknown>
}

export type LlmProviderConfig = {
  provider: 'deepseek' | 'zhipu' | 'custom'
  apiKey?: string
  model?: string
  baseUrl?: string
  timeoutMs?: number
}

export type DecisionContext = {
  session: BattleSession
  actor: BattleEntity
  target: BattleEntity
  memory: ShortTermMemory
}

export type DecisionResult = {
  decision: RawBattleDecision | null
  source: 'remote_llm' | 'heuristic_fallback'
  error?: string
}

interface DecisionProvider {
  request(context: DecisionContext): Promise<RawBattleDecision>
}

class HeuristicDecisionProvider implements DecisionProvider {
  async request(context: DecisionContext): Promise<RawBattleDecision> {
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

class RemoteLlmDecisionProvider implements DecisionProvider {
  constructor(private readonly config: LlmProviderConfig) {}

  async request(context: DecisionContext): Promise<RawBattleDecision> {
    const timeoutMs = Math.max(150, Number(this.config.timeoutMs || 450))
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const endpoint = this.getEndpoint()
      const model = this.config.model || this.getDefaultModel()
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey || ''}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                'You are a battle commander. Output strict JSON only: {"action":"...","targetId":"...","skillId":"...","metadata":{}}.'
            },
            {
              role: 'user',
              content: buildPrompt(context)
            }
          ]
        }),
        signal: controller.signal
      })
      if (!resp.ok) {
        throw new Error(`llm_http_${resp.status}`)
      }
      const payload = (await resp.json()) as {
        choices?: Array<{ message?: { content?: string } }>
      }
      const content = String(payload.choices?.[0]?.message?.content || '')
      const parsed = parseJsonObject(content)
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('llm_parse_error')
      }
      return parsed as RawBattleDecision
    } finally {
      clearTimeout(timer)
    }
  }

  private getEndpoint(): string {
    if (this.config.baseUrl) return this.config.baseUrl
    if (this.config.provider === 'deepseek') {
      return 'https://api.deepseek.com/chat/completions'
    }
    if (this.config.provider === 'zhipu') {
      return 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
    }
    throw new Error('missing_llm_base_url')
  }

  private getDefaultModel(): string {
    if (this.config.provider === 'deepseek') return 'deepseek-chat'
    if (this.config.provider === 'zhipu') return 'glm-4.5'
    return 'gpt-4o-mini'
  }
}

function buildPrompt(context: DecisionContext): string {
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
    // Some models return fenced or extra text.
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

export class AutoDecisionEngine {
  private readonly provider: DecisionProvider
  private readonly decisionCache = new Map<
    string,
    {
      decision: RawBattleDecision
      expiresAt: number
    }
  >()
  private static readonly CACHE_TTL_MS = 2500

  constructor(private readonly config?: LlmProviderConfig) {
    if (config?.apiKey) {
      this.provider = new RemoteLlmDecisionProvider(config)
      return
    }
    this.provider = new HeuristicDecisionProvider()
  }

  async requestDecision(context: DecisionContext): Promise<DecisionResult> {
    const cacheKey = buildDecisionCacheKey(context)
    const cached = this.decisionCache.get(cacheKey)
    const now = Date.now()
    if (cached && cached.expiresAt > now) {
      return {
        decision: cached.decision,
        source: this.config?.apiKey ? 'remote_llm' : 'heuristic_fallback'
      }
    }
    try {
      const decision = await this.provider.request(context)
      this.decisionCache.set(cacheKey, {
        decision,
        expiresAt: Date.now() + AutoDecisionEngine.CACHE_TTL_MS
      })
      return {
        decision,
        source: this.config?.apiKey ? 'remote_llm' : 'heuristic_fallback'
      }
    } catch (error) {
      return {
        decision: null,
        source: 'heuristic_fallback',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

function bucket(value: number, size: number): number {
  return Math.max(0, Math.floor(value / Math.max(1, size)))
}

function buildDecisionCacheKey(context: DecisionContext): string {
  const { session, actor, target } = context
  const distance = Math.hypot(actor.position.x - target.position.x, actor.position.y - target.position.y)
  const actorReadySkills = actor.skillSlots
    .filter((slot) => slot.cooldownTick <= session.tick)
    .map((slot) => slot.skillId)
    .sort()
    .join(',')
  return [
    `phase:${session.phase}`,
    `actor:${actor.id}`,
    `target:${target.id}`,
    `ahp:${bucket(actor.resources.hp, 12)}`,
    `thp:${bucket(target.resources.hp, 12)}`,
    `amp:${bucket(actor.resources.mp, 5)}`,
    `dst:${bucket(distance, 1)}`,
    `ready:${actorReadySkills}`
  ].join('|')
}

