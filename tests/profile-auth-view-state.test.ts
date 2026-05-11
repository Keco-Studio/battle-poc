import { describe, expect, it } from 'vitest'
import { formatProfileSessionLabel, getProfileAuthViewState } from '../src/lib/auth/profile-auth-view-state'

describe('getProfileAuthViewState', () => {
  it('returns checking before auth resolution to avoid login flicker', () => {
    const state = getProfileAuthViewState({
      supabaseConfigured: true,
      hasSupabaseClient: true,
      authResolved: false,
      session: null,
    })

    expect(state).toBe('checking')
  })

  it('returns authenticated after resolution with a session', () => {
    const state = getProfileAuthViewState({
      supabaseConfigured: true,
      hasSupabaseClient: true,
      authResolved: true,
      session: { email: 'user@example.com', id: 'uuid-1' },
    })

    expect(state).toBe('authenticated')
  })

  it('returns authenticated when user has no email (OAuth edge case)', () => {
    const state = getProfileAuthViewState({
      supabaseConfigured: true,
      hasSupabaseClient: true,
      authResolved: true,
      session: { email: null, id: 'oauth-subject-id' },
    })

    expect(state).toBe('authenticated')
  })

  it('returns unauthenticated after resolution without session', () => {
    const state = getProfileAuthViewState({
      supabaseConfigured: true,
      hasSupabaseClient: true,
      authResolved: true,
      session: null,
    })

    expect(state).toBe('unauthenticated')
  })

  it('formatProfileSessionLabel prefers email, else short id', () => {
    expect(formatProfileSessionLabel({ email: 'a@b.co', id: 'x' })).toBe('a@b.co')
    expect(formatProfileSessionLabel({ email: null, id: 'oauth-subject-id' })).toBe('User oauth-su…')
  })
})
