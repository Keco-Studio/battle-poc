import { decisionInputSchema, decisionPatchSchema } from '@/src/v3/runtime/decisionDirector'

export const runtime = 'nodejs'

const DEFAULT_PROXY_URL = 'http://127.0.0.1:8787'
const MAX_RESPONSE_BYTES = 64 * 1024

function parseObject(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try {
      return JSON.parse(text.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = decisionInputSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'invalid_decision_snapshot', issues: parsed.error.issues }, { status: 400 })
  }
  const input = parsed.data
  const proxyBase = String(process.env.V3_AI_PROXY_URL ?? process.env.BATTLE_AI_SERVER_URL ?? DEFAULT_PROXY_URL).replace(/\/$/, '')
  const systemPrompt = [
    'You revise a constrained behavior tree for a deterministic 1v1 grid battle.',
    'Return JSON only. Never modify HP, energy, position, damage, Tick, or result.',
    'Use one to three allowed Patch operations: set_threshold, set_action, reorder.',
  ].join(' ')
  const prompt = JSON.stringify({
    situation: input.snapshot,
    behaviorTree: input.tree,
    allowedSkills: input.skillIds,
    decisionTick: input.decisionTick,
    baseTreeVersion: input.baseTreeVersion,
    outputContract: {
      decisionTick: input.decisionTick,
      baseTreeVersion: input.baseTreeVersion,
      reason: 'string, max 160 chars',
      ops: [
        { kind: 'set_threshold', nodeId: 'condition node id', value: 0.5 },
        { kind: 'set_action', nodeId: 'action node id', skillId: 'allowed skill id' },
        { kind: 'reorder', nodeId: 'selector or sequence id', childIds: ['same child ids'] },
      ],
      maxOps: input.maxPatchOps,
    },
  })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const response = await fetch(`${proxyBase}/api/ai/battle-decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: input.model.provider,
        model: input.model.model,
        systemPrompt,
        prompt,
        timeoutMs: 3500,
      }),
      signal: controller.signal,
    })
    const rawResponse = (await response.text()).slice(0, MAX_RESPONSE_BYTES)
    if (!response.ok) {
      return Response.json({ error: `proxy_http_${response.status}`, rawResponse }, { status: 503 })
    }
    const outer = parseObject(rawResponse) as { decision?: unknown } | null
    const decision = parseObject(outer?.decision ?? outer)
    const patchCandidate = decision && typeof decision === 'object'
      ? { ...(decision as Record<string, unknown>), actorId: input.actorId }
      : null
    const patch = decisionPatchSchema.safeParse(patchCandidate)
    if (!patch.success) {
      return Response.json({ error: 'invalid_proxy_patch', rawResponse }, { status: 502 })
    }
    return Response.json({ patch: patch.data, rawResponse })
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503 })
  } finally {
    clearTimeout(timer)
  }
}
