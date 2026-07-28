import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { requireServerUser } from '@/src/lib/auth/require-server-user'

describe('requireServerUser', () => {
  it('returns 503 when Supabase is not configured', async () => {
    expect(await requireServerUser(null)).toEqual({
      ok: false,
      status: 503,
      error: 'supabase_not_configured',
    })
  })

  it('returns 401 when getUser has no verified user', async () => {
    const client = {
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
      },
    }

    expect(await requireServerUser(client)).toEqual({
      ok: false,
      status: 401,
      error: 'authentication_required',
    })
  })

  it('does not accept an auth error as an anonymous success', async () => {
    const client = {
      auth: {
        getUser: async () => ({
          data: { user: null },
          error: { message: 'invalid jwt' },
        }),
      },
    }

    expect(await requireServerUser(client)).toEqual({
      ok: false,
      status: 401,
      error: 'invalid jwt',
    })
  })

  it('returns the verified user from getUser', async () => {
    const client = {
      auth: {
        getUser: async () => ({
          data: { user: { id: 'user-a', email: 'a@example.com' } },
          error: null,
        }),
      },
    }

    expect(await requireServerUser(client)).toEqual({
      ok: true,
      user: { id: 'user-a', email: 'a@example.com' },
    })
  })
})

describe('authenticated POST route boundaries', () => {
  it('authenticates before PixelLab token access and persists only to private cloud storage', () => {
    const source = readFileSync('app/api/pixellab/create-map/route.ts', 'utf8')
    const post = source.slice(source.indexOf('export async function POST'))

    expect(post.indexOf('requireServerUser')).toBeGreaterThanOrEqual(0)
    expect(post.indexOf('requireServerUser')).toBeLessThan(post.indexOf('PIXELLAB_API_TOKEN'))
    expect(post).toContain('persistUserMapWithBackground')
    expect(post).not.toMatch(/\bwriteFile\b/)
    expect(post).not.toMatch(/\bmkdir\b/)
  })

  it('disables local PixelLab sync outside development and authenticates before filesystem access', () => {
    const source = readFileSync('app/api/pixellab-sync/route.ts', 'utf8')
    const post = source.slice(source.indexOf('export async function POST'))

    expect(post).toContain("process.env.NODE_ENV !== 'development'")
    expect(post.indexOf('requireServerUser')).toBeGreaterThanOrEqual(0)
    expect(post.indexOf('requireServerUser')).toBeLessThan(post.indexOf('repoRoot'))
  })

  it('authenticates agent chat before parsing or dispatching every POST mode', () => {
    const source = readFileSync('app/api/agent-chat/route.ts', 'utf8')
    const post = source.slice(source.indexOf('export async function POST'))

    expect(post.indexOf('requireServerUser')).toBeGreaterThanOrEqual(0)
    expect(post.indexOf('requireServerUser')).toBeLessThan(post.indexOf('request.json'))
    expect(post.indexOf('requireServerUser')).toBeLessThan(post.indexOf('resolveMode'))
  })
})
