import { describe, expect, it } from 'vitest'

import { createBattle } from '@/src/v3/runtime'
import {
  buildDecisionInput,
  requestDecision,
  requestOptionalDecision,
  type V3DecisionFetcher,
} from '@/src/v3/runtime/decisionDirector'

function input() {
  const state = createBattle({
    seed: 7319,
    mapId: 'sunlit_circuit',
    maxDecisionTicks: 20,
    left: {
      templateType: 'job',
      templateId: 'astra_vanguard',
      skillIds: ['solar_lance', 'bloom_guard', 'gale_step', 'prism_snare'],
      treeId: 'tree_balanced',
    },
    right: {
      templateType: 'enemy',
      templateId: 'briar_sentinel',
      skillIds: ['solar_lance', 'bloom_guard', 'gale_step', 'prism_snare'],
      treeId: 'tree_survival',
    },
  })
  return buildDecisionInput(state, 'left', { provider: 'minimax', model: 'MiniMax-M2.1' })
}

describe('V3 decision director', () => {
  it('returns a validated live Patch from the decision route', async () => {
    const fetcher: V3DecisionFetcher = async () => Response.json({
      patch: {
        actorId: 'left',
        decisionTick: 0,
        baseTreeVersion: 1,
        reason: 'Raise the low-health protection threshold',
        ops: [{ kind: 'set_threshold', nodeId: 'hp_low', value: 0.46 }],
      },
      rawResponse: '{"reason":"Raise the low-health protection threshold"}',
    })

    const result = await requestDecision(input(), { fetcher, timeoutMs: 50 })

    expect(result.source).toBe('llm')
    expect(result.status).toBe('ok')
    expect(result.patch.ops).toEqual([{ kind: 'set_threshold', nodeId: 'hp_low', value: 0.46 }])
  })

  it('uses a labeled deterministic fallback when the request times out', async () => {
    const neverSettles: V3DecisionFetcher = async () => await new Promise<Response>(() => undefined)
    const decisionInput = input()
    const result = await requestDecision(decisionInput, { fetcher: neverSettles, timeoutMs: 5 })

    expect(result.source).toBe('fallback')
    expect(result.status).toBe('timeout')
    expect(result.patch.actorId).toBe('left')
    expect(result.patch.decisionTick).toBe(decisionInput.decisionTick)
    expect(result.patch.baseTreeVersion).toBe(decisionInput.baseTreeVersion)
    expect(result.patch.ops.length).toBeGreaterThan(0)
  })

  it('falls back when the route returns an invalid Patch', async () => {
    const fetcher: V3DecisionFetcher = async () => Response.json({ patch: { hp: 9999, ops: [] } })
    const result = await requestDecision(input(), { fetcher, timeoutMs: 50 })
    expect(result.source).toBe('fallback')
    expect(result.status).toBe('invalid')
    expect(result.error).toBe('invalid_patch')
  })

  it('uses an offline fallback without issuing a request when online AI is disabled', async () => {
    let calls = 0
    const fetcher: V3DecisionFetcher = async () => {
      calls += 1
      return Response.json({})
    }
    const result = await requestOptionalDecision(input(), { online: false, fetcher })

    expect(calls).toBe(0)
    expect(result.source).toBe('fallback')
    expect(result.status).toBe('unavailable')
    expect(result.error).toBe('online_ai_disabled')
  })
})
