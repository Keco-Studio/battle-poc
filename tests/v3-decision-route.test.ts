import { afterEach, describe, expect, it, vi } from 'vitest'

import { POST } from '@/app/api/v3/decision/route'
import { createBattle } from '@/src/v3/runtime'
import { buildDecisionInput } from '@/src/v3/runtime/decisionDirector'

function requestBody() {
  const state = createBattle({
    seed: 7319,
    mapId: 'sunlit_circuit',
    maxDecisionTicks: 20,
    left: { templateType: 'job', templateId: 'astra_vanguard', skillIds: ['solar_lance', 'bloom_guard', 'gale_step', 'prism_snare'], treeId: 'tree_balanced' },
    right: { templateType: 'enemy', templateId: 'briar_sentinel', skillIds: ['solar_lance', 'bloom_guard', 'gale_step', 'prism_snare'], treeId: 'tree_survival' },
  })
  return buildDecisionInput(state, 'left', { provider: 'minimax', model: 'MiniMax-M2.1' })
}

describe('POST /api/v3/decision', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('forwards a constrained Patch request to the local AI proxy', async () => {
    vi.stubEnv('V3_AI_PROXY_URL', 'http://127.0.0.1:9999')
    const proxy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({
      decision: {
        decisionTick: 0,
        baseTreeVersion: 1,
        reason: '优先控制目标',
        ops: [{ kind: 'set_action', nodeId: 'control', skillId: 'prism_snare' }],
      },
    }))

    const response = await POST(new Request('http://local/api/v3/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody()),
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      patch: {
        actorId: 'left',
        decisionTick: 0,
        baseTreeVersion: 1,
        reason: '优先控制目标',
      },
    })
    expect(proxy).toHaveBeenCalledWith(
      'http://127.0.0.1:9999/api/ai/battle-decision',
      expect.objectContaining({ method: 'POST' }),
    )
    const forwarded = JSON.parse(String((proxy.mock.calls[0][1] as RequestInit).body))
    expect(forwarded).toMatchObject({ provider: 'minimax', model: 'MiniMax-M2.1' })
    expect(forwarded.prompt).toContain('outputContract')
    expect(forwarded.prompt).not.toContain('PIXELLAB')
    expect(forwarded.prompt).not.toContain('Supabase')
  })

  it('rejects malformed client snapshots before calling the proxy', async () => {
    const proxy = vi.spyOn(globalThis, 'fetch')
    const response = await POST(new Request('http://local/api/v3/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actorId: 'left', hp: 9999 }),
    }))
    expect(response.status).toBe(400)
    expect(proxy).not.toHaveBeenCalled()
  })
})
