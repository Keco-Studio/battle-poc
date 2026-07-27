import { describe, expect, it } from 'vitest'
import { resolvePostLoginRedirect } from '../src/lib/authPostLoginRedirect'

describe('post-login redirect policy', () => {
  it('accepts a relative battle route', () => {
    expect(
      resolvePostLoginRedirect({ explicitRedirect: '/battle?mode=pvp' }),
    ).toBe('/battle?mode=pvp')
  })

  it('allows an absolute URL as inert query data on a relative route', () => {
    expect(
      resolvePostLoginRedirect({
        explicitRedirect: '/battle?docs=https://docs.example.com',
      }),
    ).toBe('/battle?docs=https://docs.example.com')
  })

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    ' javascript:alert(1)',
  ])('rejects external redirect %s', (redirect) => {
    expect(resolvePostLoginRedirect({ explicitRedirect: redirect })).toBe('/')
  })
})
