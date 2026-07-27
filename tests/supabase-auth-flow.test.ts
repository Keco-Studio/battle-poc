import { describe, expect, it } from 'vitest'
import * as clientModule from '../src/lib/supabase/client'
import * as storageModule from '../src/lib/hybridStorageAdapter'

describe('battle Supabase browser auth flow', () => {
  it('uses PKCE and lets the SDK detect the callback URL', () => {
    expect(clientModule.BATTLE_SUPABASE_AUTH_FLOW).toEqual({
      flowType: 'pkce',
      detectSessionInUrl: true,
    })
  })

  it('does not alias the PKCE verifier to the session-token storage key', () => {
    const baseKey = 'sb-project-auth-token'
    const tabKey = `${baseKey}_tab-1`

    expect(storageModule.resolveHybridStorageKey(baseKey, baseKey, tabKey)).toBe(tabKey)
    expect(
      storageModule.resolveHybridStorageKey(`${baseKey}-code-verifier`, baseKey, tabKey),
    ).toBe(`${baseKey}-code-verifier`)
  })

  it('does not detect a PKCE verifier as the session-token base key', () => {
    const baseKey = 'sb-project-auth-token'

    expect(storageModule.extractSupabaseSessionBaseKey(`${baseKey}-code-verifier`)).toBeNull()
    expect(storageModule.extractSupabaseSessionBaseKey(`${baseKey}_tab-1`)).toBe(baseKey)
  })
})
