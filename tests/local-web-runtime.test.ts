import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>()
  return { ...actual, createClient: mocks.createClient }
})

describe('local Web runtime boundary', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.createClient.mockReset()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://local-mode-test.supabase.co')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'local-mode-test-anon-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('pins battle-poc to local mode', async () => {
    const mode = await import('@/src/lib/runtime/localWebMode')
    expect(mode.LOCAL_WEB_MODE).toBe(true)
    expect(mode.LOCAL_MODE_STATUS).toBe('Current mode: local')
    expect(mode.LOCAL_MODE_ERROR).toBe('supabase_disabled_local_mode')
  })

  it('does not mount the Supabase provider', () => {
    const source = readFileSync('src/components/BattleRuntimeProviders.tsx', 'utf8')
    expect(source).not.toMatch(/<SupabaseProvider>/)
    expect(source).toContain('<AuthProvider>')
  })

  it('returns from middleware before legacy Supabase session work', () => {
    const source = readFileSync('middleware.ts', 'utf8')
    const localReturn = source.indexOf('if (LOCAL_WEB_MODE)')
    const clientCreation = source.indexOf('createServerClient(')
    expect(localReturn).toBeGreaterThanOrEqual(0)
    expect(clientCreation).toBeGreaterThan(localReturn)
  })

  it('does not construct a browser Supabase client when importing the local-mode context', async () => {
    await import('@/src/lib/SupabaseContext')

    expect(mocks.createClient).not.toHaveBeenCalled()
  })
})
