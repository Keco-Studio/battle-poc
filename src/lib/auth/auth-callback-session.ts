import type { AuthChangeEvent, AuthError, Session } from '@supabase/supabase-js'

export type AuthCallbackSessionResult =
  | 'authenticated'
  | 'missing_code'
  | 'session_error'
  | 'timeout'
  | 'aborted'

export type AuthCallbackClient = {
  getSession(): Promise<{
    data: { session: Session | null }
    error: AuthError | null
  }>
  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ): { data: { subscription: { unsubscribe(): void } } }
}

export function waitForAuthCallbackSession(
  auth: AuthCallbackClient,
  options: {
    hasCode: boolean
    signal?: AbortSignal
    maxPollAttempts?: number
    pollIntervalMs?: number
  },
): Promise<AuthCallbackSessionResult> {
  const maxPollAttempts = options.maxPollAttempts ?? 20
  const pollIntervalMs = options.pollIntervalMs ?? 250

  return new Promise((resolve) => {
    let settled = false
    let pollAttempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let subscription: { unsubscribe(): void } | null = null
    let onAbort: (() => void) | null = null

    const unsubscribe = () => {
      try {
        subscription?.unsubscribe()
      } catch {
        // Cleanup failures must not leave the callback promise pending.
      }
    }

    const finish = (result: AuthCallbackSessionResult) => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      if (onAbort) options.signal?.removeEventListener('abort', onAbort)
      unsubscribe()
      resolve(result)
    }

    onAbort = () => finish('aborted')
    if (options.signal?.aborted) {
      finish('aborted')
      return
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    try {
      const { data } = auth.onAuthStateChange((_event, session) => {
        if (session) finish('authenticated')
      })
      subscription = data.subscription
      if (settled) unsubscribe()
    } catch {
      finish('session_error')
      return
    }

    const checkSession = async (initial: boolean): Promise<void> => {
      if (settled) return
      try {
        const { data: sessionData, error } = await auth.getSession()
        if (settled) return
        if (error) {
          finish('session_error')
          return
        }
        if (sessionData.session) {
          finish('authenticated')
          return
        }
        if (initial && !options.hasCode) {
          finish('missing_code')
          return
        }
        if (pollAttempts >= maxPollAttempts) {
          finish('timeout')
          return
        }
        pollAttempts += 1
        timer = setTimeout(() => void checkSession(false), pollIntervalMs)
      } catch {
        finish('session_error')
      }
    }

    void checkSession(true)
  })
}
