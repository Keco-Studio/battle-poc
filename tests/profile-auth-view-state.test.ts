import { describe, expect, it } from 'vitest'
import { getProfileAuthViewState } from '../src/lib/auth/profile-auth-view-state'

describe('getProfileAuthViewState', () => {
  it('returns checking before auth resolution to avoid login flicker', () => {
    const state = getProfileAuthViewState({
      supabaseConfigured: true,
      hasSupabaseClient: true,
      authResolved: false,
      sessionEmail: null,
    })

    expect(state).toBe('checking')
  })

  it('returns authenticated after resolution with an email', () => {
    const state = getProfileAuthViewState({
      supabaseConfigured: true,
      hasSupabaseClient: true,
      authResolved: true,
      sessionEmail: 'user@example.com',
    })

    expect(state).toBe('authenticated')
  })

  it('returns unauthenticated after resolution without session', () => {
    const state = getProfileAuthViewState({
      supabaseConfigured: true,
      hasSupabaseClient: true,
      authResolved: true,
      sessionEmail: null,
    })

    expect(state).toBe('unauthenticated')
  })
})
