import { z } from 'zod'

import type { V3BehaviorTreeState } from '@/src/content/generated/v3'

import { gridDistance, otherActor } from './guardrails'
import type {
  V3ActorId,
  V3BattleState,
  V3BehaviorTreePatch,
  V3BehaviorTreePatchOperation,
} from './types'

const actorIdSchema = z.enum(['left', 'right'])
const pointSchema = z.object({ x: z.number().int(), y: z.number().int() }).strict()
const statusSchema = z.object({ kind: z.enum(['root', 'atk_down', 'def_down']), ticks: z.number().int(), value: z.number() }).strict()
const actorSnapshotSchema = z.object({
  hp: z.number(),
  maxHp: z.number().positive(),
  energy: z.number(),
  maxEnergy: z.number().positive(),
  shield: z.number(),
  position: pointSchema,
  cooldowns: z.record(z.string(), z.number().int()),
  statuses: z.array(statusSchema),
}).strict()

const setThresholdSchema = z.object({
  kind: z.literal('set_threshold'),
  nodeId: z.string().min(1).max(80),
  value: z.number().finite(),
}).strict()
const setActionSchema = z.object({
  kind: z.literal('set_action'),
  nodeId: z.string().min(1).max(80),
  skillId: z.string().min(1).max(80),
}).strict()
const reorderSchema = z.object({
  kind: z.literal('reorder'),
  nodeId: z.string().min(1).max(80),
  childIds: z.array(z.string().min(1).max(80)).min(1).max(12),
}).strict()

export const decisionPatchSchema = z.object({
  actorId: actorIdSchema,
  decisionTick: z.number().int().nonnegative(),
  baseTreeVersion: z.number().int().positive(),
  reason: z.string().min(1).max(160),
  ops: z.array(z.discriminatedUnion('kind', [setThresholdSchema, setActionSchema, reorderSchema])).min(1).max(3),
}).strict()

export const decisionInputSchema = z.object({
  actorId: actorIdSchema,
  decisionTick: z.number().int().nonnegative(),
  baseTreeVersion: z.number().int().positive(),
  snapshot: z.object({
    mapId: z.string().min(1),
    self: actorSnapshotSchema,
    enemy: actorSnapshotSchema,
    distance: z.number().int().nonnegative(),
    recentEvents: z.array(z.object({ type: z.string(), message: z.string(), tick: z.number().int() }).strict()).max(8),
  }).strict(),
  tree: z.object({
    version: z.number().int().positive(),
    rootId: z.string().min(1),
    nodes: z.record(z.string(), z.unknown()),
  }).strict(),
  skillIds: z.array(z.string().min(1)).length(4),
  model: z.object({ provider: z.enum(['minimax', 'deepseek']), model: z.string().min(1).max(120) }).strict(),
  maxPatchOps: z.number().int().min(1).max(3),
}).strict()

export type V3DecisionInput = z.infer<typeof decisionInputSchema>
export type V3DecisionFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export type V3DecisionResult = {
  source: 'llm' | 'fallback'
  status: 'ok' | 'timeout' | 'invalid' | 'unavailable'
  patch: V3BehaviorTreePatch
  rawResponse?: string
  error?: string
  latencyMs: number
}

export function buildDecisionInput(
  state: V3BattleState,
  actorId: V3ActorId,
  model: V3DecisionInput['model'],
): V3DecisionInput {
  const enemyId = otherActor(actorId)
  const actor = state.actors[actorId]
  const enemy = state.actors[enemyId]
  const snapshotActor = (value: typeof actor) => ({
    hp: value.hp,
    maxHp: value.maxHp,
    energy: value.energy,
    maxEnergy: value.maxEnergy,
    shield: value.shield,
    position: { ...value.position },
    cooldowns: { ...value.cooldowns },
    statuses: value.statuses.map((status) => ({ ...status })),
  })
  return {
    actorId,
    decisionTick: state.tick,
    baseTreeVersion: state.trees[actorId].version,
    snapshot: {
      mapId: state.map.id,
      self: snapshotActor(actor),
      enemy: snapshotActor(enemy),
      distance: gridDistance(actor.position, enemy.position),
      recentEvents: state.events.slice(-8).map((event) => ({ type: event.type, message: event.message, tick: event.tick })),
    },
    tree: state.trees[actorId],
    skillIds: [...actor.skillIds],
    model,
    maxPatchOps: 3,
  }
}

function fallbackOperation(input: V3DecisionInput): V3BehaviorTreePatchOperation {
  const nodes = Object.values(input.tree.nodes) as Array<Record<string, unknown>>
  const condition = nodes.find((node) => node.kind === 'condition' && typeof node.id === 'string' && typeof node.value === 'number')
  if (condition) {
    const hpRatio = input.snapshot.self.hp / input.snapshot.self.maxHp
    const value = condition.metric === 'self_hp_ratio'
      ? Math.max(0.25, Math.min(0.7, hpRatio < 0.45 ? 0.52 : Number(condition.value)))
      : Number(condition.value)
    return { kind: 'set_threshold', nodeId: String(condition.id), value }
  }
  const action = nodes.find((node) => node.kind === 'action' && typeof node.id === 'string')
  if (action) return { kind: 'set_action', nodeId: String(action.id), skillId: input.skillIds[0] }
  const root = input.tree.nodes[input.tree.rootId] as Record<string, unknown> | undefined
  const childIds = Array.isArray(root?.children) ? root.children.filter((id): id is string => typeof id === 'string') : []
  if (childIds.length > 0) return { kind: 'reorder', nodeId: input.tree.rootId, childIds }
  return { kind: 'set_action', nodeId: input.tree.rootId, skillId: input.skillIds[0] }
}

export function buildFallbackPatch(input: V3DecisionInput, reason: string): V3BehaviorTreePatch {
  return {
    actorId: input.actorId,
    decisionTick: input.decisionTick,
    baseTreeVersion: input.baseTreeVersion,
    reason,
    ops: [fallbackOperation(input)],
  }
}

function parseRoutePatch(value: unknown): V3BehaviorTreePatch | null {
  const parsed = decisionPatchSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export async function requestDecision(
  input: V3DecisionInput,
  options: { fetcher?: V3DecisionFetcher; timeoutMs?: number } = {},
): Promise<V3DecisionResult> {
  const fetcher = options.fetcher ?? fetch
  const timeoutMs = Math.max(1, options.timeoutMs ?? 1800)
  const controller = new AbortController()
  const startedAt = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort()
        reject(new Error('decision_timeout'))
      }, timeoutMs)
    })
    const response = await Promise.race([
      fetcher('/api/v3/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: controller.signal,
      }),
      timeout,
    ])
    const raw = (await response.text()).slice(0, 64 * 1024)
    if (!response.ok) {
      return {
        source: 'fallback',
        status: 'unavailable',
        patch: buildFallbackPatch(input, '本地 AI 不可用，沿用确定性策略。'),
        rawResponse: raw,
        error: `decision_http_${response.status}`,
        latencyMs: Date.now() - startedAt,
      }
    }
    let payload: unknown
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = null
    }
    const patch = parseRoutePatch((payload as { patch?: unknown } | null)?.patch)
    if (!patch) {
      return {
        source: 'fallback',
        status: 'invalid',
        patch: buildFallbackPatch(input, 'LLM Patch 非法，使用确定性修正。'),
        rawResponse: raw,
        error: 'invalid_patch',
        latencyMs: Date.now() - startedAt,
      }
    }
    return {
      source: 'llm',
      status: 'ok',
      patch,
      rawResponse: typeof (payload as { rawResponse?: unknown }).rawResponse === 'string'
        ? String((payload as { rawResponse: string }).rawResponse).slice(0, 64 * 1024)
        : raw,
      latencyMs: Date.now() - startedAt,
    }
  } catch (error) {
    const timeout = error instanceof Error && error.message === 'decision_timeout'
    return {
      source: 'fallback',
      status: timeout ? 'timeout' : 'unavailable',
      patch: buildFallbackPatch(input, timeout ? 'LLM 超时，使用确定性修正。' : 'LLM 请求失败，使用确定性修正。'),
      error: timeout ? 'decision_timeout' : error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - startedAt,
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function asBehaviorTreeState(input: V3DecisionInput): V3BehaviorTreeState {
  return input.tree as V3BehaviorTreeState
}
