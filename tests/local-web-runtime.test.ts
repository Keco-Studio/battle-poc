import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('local Web runtime boundary', () => {
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
})
