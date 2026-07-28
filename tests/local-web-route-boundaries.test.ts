import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_BUILTIN_MAP_REF } from '@/src/lib/maps/map-reference'
import * as authRoute from '@/app/api/auth/me/route'
import * as mapsRoute from '@/app/api/maps/route'
import * as airpgRoute from '@/app/api/airpg-map/route'
import * as pixellabCreateRoute from '@/app/api/pixellab/create-map/route'
import * as agentChatRoute from '@/app/api/agent-chat/route'
import { createServerSupabase } from '@/src/lib/supabase/server'

vi.mock('@/src/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(() => {
    throw new Error('Supabase client must not be created in local Web mode')
  }),
}))

const ONE_PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X3D7WQAAAABJRU5ErkJggg=='

describe('local Web server boundaries', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('keeps built-in maps active while cloud routes are unavailable', async () => {
    const catalog = await mapsRoute.GET()
    expect(catalog.status).toBe(200)
    expect((await catalog.json()).maps.length).toBeGreaterThan(0)

    const map = await airpgRoute.GET(
      new Request(`http://local/api/airpg-map?map=${encodeURIComponent(DEFAULT_BUILTIN_MAP_REF)}`),
    )
    expect(map.status).toBe(200)

    const cloud = await mapsRoute.POST(new Request('http://local/api/maps', { method: 'POST' }))
    expect(cloud.status).toBe(503)
    expect(await cloud.json()).toMatchObject({
      error: 'supabase_disabled_local_mode',
      feature: 'cloud_maps',
    })
  })

  it('blocks auth and Supabase OpenClaw', async () => {
    expect((await authRoute.GET()).status).toBe(503)

    vi.stubEnv('CHAT_BACKEND_MODE', 'supabase_openclaw')
    const health = await agentChatRoute.GET()
    expect(health.status).toBe(503)
    expect(await health.json()).toMatchObject({ feature: 'supabase_openclaw' })
  })

  it('keeps PixelLab generation active without entering Supabase persistence', async () => {
    vi.stubEnv('PIXELLAB_API_TOKEN', 'local-test-token')
    const pixellabFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ image: { base64: ONE_PIXEL_PNG } }),
    )
    const response = await pixellabCreateRoute.POST(
      new Request('http://local/api/pixellab/create-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'local dungeon preview',
          imageSize: { width: 256, height: 256 },
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      ok: true,
      mapRef: null,
      persisted: false,
      previewUrl: `data:image/png;base64,${ONE_PIXEL_PNG}`,
    })
    expect(pixellabFetch).toHaveBeenCalledWith(
      'https://api.pixellab.ai/v1/generate-image-pixflux',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(createServerSupabase).not.toHaveBeenCalled()
  })

  it('bypasses Supabase auth only for retained local capabilities', () => {
    const sync = readFileSync('app/api/pixellab-sync/route.ts', 'utf8')
    const chat = readFileSync('app/api/agent-chat/route.ts', 'utf8')
    expect(sync).toContain('if (!LOCAL_WEB_MODE)')
    expect(chat).toContain('if (!LOCAL_WEB_MODE)')
    expect(chat).toContain("localModeUnavailable('supabase_openclaw')")
  })
})
