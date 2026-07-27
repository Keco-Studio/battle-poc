import { describe, expect, it, vi } from 'vitest'
import { buildGoogleOAuthRedirectUrl, startGoogleOAuth } from '../src/lib/auth/google-oauth'

describe('Google OAuth login', () => {
  it('builds the callback from the active battle origin', () => {
    expect(buildGoogleOAuthRedirectUrl('https://battle.example.com')).toBe(
      'https://battle.example.com/auth/callback',
    )
  })

  it('starts Google OAuth with the Keco Studio provider options', async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({
      data: { provider: 'google' },
      error: null,
    })

    await startGoogleOAuth({ signInWithOAuth }, 'http://localhost:3002')

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3002/auth/callback',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    })
  })

  it('rejects with the provider error so the panel can recover', async () => {
    const error = new Error('provider unavailable')
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: null, error })

    await expect(
      startGoogleOAuth({ signInWithOAuth }, 'http://localhost:3002'),
    ).rejects.toBe(error)
  })
})
