import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, AuthError, Session } from '@supabase/supabase-js'
import {
  waitForAuthCallbackSession,
  type AuthCallbackClient,
} from '../src/lib/auth/auth-callback-session'

const session = { user: { id: 'google-user' } } as Session

function createFakeAuth(responses: Array<{ session: Session | null; error?: Error }>) {
  let listener: ((event: AuthChangeEvent, session: Session | null) => void) | null = null
  const unsubscribe = vi.fn()
  const getSession = vi.fn(async () => {
    const response = responses.length > 1 ? responses.shift()! : responses[0]
    return {
      data: { session: response.session },
      error: (response.error ?? null) as AuthError | null,
    }
  })
  const auth = {
    getSession,
    onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
      listener = callback
      return { data: { subscription: { unsubscribe } } }
    },
  } as AuthCallbackClient

  return {
    auth,
    getSession,
    unsubscribe,
    emit(nextSession: Session | null) {
      listener?.('SIGNED_IN', nextSession)
    },
  }
}

describe('waitForAuthCallbackSession', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns authenticated for an existing session and unsubscribes', async () => {
    const fake = createFakeAuth([{ session }])

    await expect(
      waitForAuthCallbackSession(fake.auth, { hasCode: true }),
    ).resolves.toBe('authenticated')
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
  })

  it('returns missing_code when neither a code nor session exists', async () => {
    const fake = createFakeAuth([{ session: null }])

    await expect(
      waitForAuthCallbackSession(fake.auth, { hasCode: false }),
    ).resolves.toBe('missing_code')
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
  })

  it('resolves when an auth event supplies the session', async () => {
    vi.useFakeTimers()
    const fake = createFakeAuth([{ session: null }])
    const result = waitForAuthCallbackSession(fake.auth, { hasCode: true })
    await Promise.resolve()

    fake.emit(session)

    await expect(result).resolves.toBe('authenticated')
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
  })

  it('resolves when bounded polling finds the session', async () => {
    vi.useFakeTimers()
    const fake = createFakeAuth([{ session: null }, { session }])
    const result = waitForAuthCallbackSession(fake.auth, {
      hasCode: true,
      pollIntervalMs: 10,
    })

    await vi.runAllTimersAsync()

    await expect(result).resolves.toBe('authenticated')
    expect(fake.getSession).toHaveBeenCalledTimes(2)
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
  })

  it('times out after the configured poll limit', async () => {
    vi.useFakeTimers()
    const fake = createFakeAuth([{ session: null }])
    const result = waitForAuthCallbackSession(fake.auth, {
      hasCode: true,
      maxPollAttempts: 2,
      pollIntervalMs: 10,
    })

    await vi.runAllTimersAsync()

    await expect(result).resolves.toBe('timeout')
    expect(fake.getSession).toHaveBeenCalledTimes(3)
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
  })

  it('returns session_error when getSession reports an error', async () => {
    const fake = createFakeAuth([
      { session: null, error: new Error('session unavailable') },
    ])

    await expect(
      waitForAuthCallbackSession(fake.auth, { hasCode: true }),
    ).resolves.toBe('session_error')
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
  })

  it('returns session_error when getSession throws', async () => {
    const fake = createFakeAuth([{ session: null }])
    fake.getSession.mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(
      waitForAuthCallbackSession(fake.auth, { hasCode: true }),
    ).resolves.toBe('session_error')
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
  })

  it('returns session_error when auth subscription setup throws', async () => {
    const fake = createFakeAuth([{ session: null }])
    fake.auth.onAuthStateChange = () => {
      throw new Error('subscription unavailable')
    }

    await expect(
      waitForAuthCallbackSession(fake.auth, { hasCode: true }),
    ).resolves.toBe('session_error')
    expect(fake.getSession).not.toHaveBeenCalled()
  })

  it('still resolves when unsubscribe cleanup throws', async () => {
    const fake = createFakeAuth([{ session }])
    fake.unsubscribe.mockImplementation(() => {
      throw new Error('unsubscribe failed')
    })

    const result = await Promise.race([
      waitForAuthCallbackSession(fake.auth, { hasCode: true }),
      new Promise<'did_not_settle'>((resolve) => {
        setTimeout(() => resolve('did_not_settle'), 20)
      }),
    ])

    expect(result).toBe('authenticated')
  })

  it('aborts immediately and unsubscribes on unmount', async () => {
    vi.useFakeTimers()
    const fake = createFakeAuth([{ session: null }])
    const controller = new AbortController()
    const result = waitForAuthCallbackSession(fake.auth, {
      hasCode: true,
      signal: controller.signal,
    })
    await Promise.resolve()

    controller.abort()

    await expect(result).resolves.toBe('aborted')
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
  })
})
