# Battle POC Google OAuth Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current session. Do not dispatch subagents.

**Goal:** Add Keco Studio-compatible Google OAuth login to battle-poc while preserving password auth, guest mode, user-scoped saves, and Studio imports.

**Architecture:** Keep the existing Supabase client and explicitly select PKCE with automatic URL detection. Isolate OAuth request construction and callback session observation into tested helpers; keep `DockFeatureModal` and the callback page responsible only for UI state and navigation.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Supabase JS 2, Vitest 2, Playwright 1.59, Tailwind CSS.

## Global Constraints

- Work only on the existing `rebuild` branch.
- Keco Studio and battle-poc use the same Supabase project and canonical `auth.users.id`.
- Keep password sign-up/sign-in and guest mode unchanged.
- Show Google login only in `Sign in`; first-time Google use is registration.
- Do not add application-level identity linking, schema migrations, RLS changes, or Keco Studio changes.
- Supabase owns PKCE code exchange; the callback page must not call `exchangeCodeForSession`.
- Do not spawn subagents.
- Do not commit any Google OAuth development changes.

---

### Task 1: Make The Browser Auth Flow Explicitly PKCE

**Files:**
- Modify: `src/lib/supabase/client.ts`
- Modify: `src/lib/hybridStorageAdapter.ts`
- Create: `tests/supabase-auth-flow.test.ts`

**Interfaces:**
- Produces: `BATTLE_SUPABASE_AUTH_FLOW` with readonly `flowType: 'pkce'` and `detectSessionInUrl: true`.
- Produces: `resolveHybridStorageKey(key, baseKey, tabScopedKey)` so only a
  session-token key is tab-scoped while `-code-verifier` remains independent.
- Consumes: Existing `createHybridStorageAdapter()` and Supabase `createClient` options.

- [x] **Step 1: Write the failing auth-flow test**

```ts
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
})
```

- [x] **Step 2: Run the test and verify RED**

Run: `npm test -- tests/supabase-auth-flow.test.ts`

Expected: FAIL because `BATTLE_SUPABASE_AUTH_FLOW` and
`resolveHybridStorageKey` are undefined.

- [x] **Step 3: Add and consume the explicit auth-flow options**

```ts
export const BATTLE_SUPABASE_AUTH_FLOW = {
  flowType: 'pkce' as const,
  detectSessionInUrl: true,
}

export function resolveHybridStorageKey(
  key: string,
  baseKey: string,
  tabScopedKey: string,
): string {
  const isSessionTokenKey =
    key === baseKey || (key.startsWith('sb-') && key.endsWith('-auth-token'))
  return isSessionTokenKey ? tabScopedKey : key
}

// Inside createClient(...)
auth: {
  ...BATTLE_SUPABASE_AUTH_FLOW,
  persistSession: true,
  autoRefreshToken: true,
  storage: createHybridStorageAdapter(),
},
```

Use `resolveHybridStorageKey` in the adapter's `getItem`, `setItem`, and
`removeItem` methods. The verifier remains in `sessionStorage` under the exact
key supplied by Supabase and is never copied into `sb-session`.

- [x] **Step 4: Run the focused test and typecheck**

Run: `npm test -- tests/supabase-auth-flow.test.ts && npm run typecheck`

Expected: test PASS and TypeScript exit 0.

---

### Task 2: Add The Google OAuth Request And Sign-In UI

**Files:**
- Create: `src/lib/auth/google-oauth.ts`
- Create: `tests/google-oauth-login.test.ts`
- Modify: `app/components/DockFeatureModal.tsx`
- Modify: `tests/integration/auth.spec.ts`

**Interfaces:**
- Produces: `buildGoogleOAuthRedirectUrl(origin: string): string`.
- Produces: `startGoogleOAuth(auth: GoogleOAuthAuthClient, origin: string): Promise<void>`.
- Consumes: `supabase.auth.signInWithOAuth`, `window.location.origin`, and the profile panel's existing `authError` state.

- [x] **Step 1: Write the failing OAuth request tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { buildGoogleOAuthRedirectUrl, startGoogleOAuth } from '../src/lib/auth/google-oauth'

describe('Google OAuth login', () => {
  it('builds the callback from the active battle origin', () => {
    expect(buildGoogleOAuthRedirectUrl('https://battle.example.com')).toBe(
      'https://battle.example.com/auth/callback',
    )
  })

  it('starts Google OAuth with the Keco Studio provider options', async () => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: { provider: 'google' }, error: null })

    await startGoogleOAuth({ signInWithOAuth }, 'http://localhost:3002')

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3002/auth/callback',
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    })
  })

  it('rejects with the provider error so the panel can recover', async () => {
    const error = new Error('provider unavailable')
    const signInWithOAuth = vi.fn().mockResolvedValue({ data: null, error })

    await expect(startGoogleOAuth({ signInWithOAuth }, 'http://localhost:3002')).rejects.toBe(error)
  })
})
```

- [x] **Step 2: Run the unit tests and verify RED**

Run: `npm test -- tests/google-oauth-login.test.ts`

Expected: FAIL because `src/lib/auth/google-oauth.ts` does not exist.

- [x] **Step 3: Implement the minimal OAuth helper**

```ts
type GoogleOAuthResult = Promise<{ data: unknown; error: Error | null }>

export type GoogleOAuthAuthClient = {
  signInWithOAuth(options: {
    provider: 'google'
    options: {
      redirectTo: string
      queryParams: { access_type: 'offline'; prompt: 'consent' }
    }
  }): GoogleOAuthResult
}

export function buildGoogleOAuthRedirectUrl(origin: string): string {
  return new URL('/auth/callback', origin).toString()
}

export async function startGoogleOAuth(auth: GoogleOAuthAuthClient, origin: string): Promise<void> {
  const { error } = await auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: buildGoogleOAuthRedirectUrl(origin),
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })
  if (error) throw error
}
```

- [x] **Step 4: Run the helper tests and verify GREEN**

Run: `npm test -- tests/google-oauth-login.test.ts`

Expected: 3 tests PASS.

- [x] **Step 5: Add the failing Playwright UI contract**

Add to `tests/integration/auth.spec.ts`:

```ts
test('shows Google login only in sign-in mode', async ({ page }) => {
  await page.goto('/')
  await openProfilePanel(page)

  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
  await switchToSignUp(page)
  await expect(page.getByRole('button', { name: 'Continue with Google' })).not.toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign up and enter' })).toBeVisible()
})
```

- [x] **Step 6: Run the UI test and verify RED**

Run: `npx playwright test tests/integration/auth.spec.ts -g "shows Google login only"`

Expected: FAIL because the Google button is absent.

- [x] **Step 7: Add Google presentation state and controls to the profile panel**

In `DockFeatureModal`:

```tsx
const [googleAuthLoading, setGoogleAuthLoading] = useState(false)

const handleGoogleLogin = async () => {
  if (!supabase || googleAuthLoading || authSubmitLoading) return
  setAuthError(null)
  setGoogleAuthLoading(true)
  try {
    await startGoogleOAuth(supabase.auth, window.location.origin)
  } catch (error) {
    setAuthError(error instanceof Error ? error.message : 'Google login failed')
    setGoogleAuthLoading(false)
  }
}
```

Render before the email field only when `authMode === 'signin'`:

```tsx
{authMode === 'signin' && (
  <>
    <button
      type="button"
      onClick={() => void handleGoogleLogin()}
      disabled={googleAuthLoading || authSubmitLoading}
      className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
    >
      <span aria-hidden="true" className="text-[15px] font-bold text-blue-600">G</span>
      {googleAuthLoading ? 'Connecting...' : 'Continue with Google'}
    </button>
    <div className="mb-3 flex items-center gap-2 text-[10px] text-slate-400">
      <span className="h-px flex-1 bg-slate-200" />
      <span>or</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  </>
)}
```

Also disable the password submit button with
`disabled={authSubmitLoading || googleAuthLoading}` and reset Google loading
when the profile panel closes.

- [x] **Step 8: Run helper and UI tests**

Run: `npm test -- tests/google-oauth-login.test.ts && npx playwright test tests/integration/auth.spec.ts -g "shows Google login only"`

Expected: unit tests PASS and the Playwright UI contract PASS.

---

### Task 3: Make The OAuth Callback Wait For A Real Session

**Files:**
- Create: `src/lib/auth/auth-callback-session.ts`
- Create: `tests/auth-callback-session.test.ts`
- Modify: `app/auth/callback/page.tsx`
- Create: `app/components/AuthErrorNotice.tsx`
- Modify: `app/page.tsx`
- Modify: `tests/integration/auth.spec.ts`

**Interfaces:**
- Produces: `waitForAuthCallbackSession(auth, options): Promise<AuthCallbackSessionResult>`.
- Produces result values: `authenticated`, `missing_code`, `session_error`, `timeout`, and `aborted`.
- Consumes: Supabase `getSession`, `onAuthStateChange`, an authorization-code presence flag, and an optional `AbortSignal`.

- [x] **Step 1: Write callback tests before the helper exists**

Create `tests/auth-callback-session.test.ts` with fake timers and a minimal
fake auth client:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthChangeEvent, AuthError, Session } from '@supabase/supabase-js'
import {
  waitForAuthCallbackSession,
  type AuthCallbackClient,
} from '../src/lib/auth/auth-callback-session'

const session = { user: { id: 'google-user' } } as Session

function fakeAuth(responses: Array<{ session: Session | null; error?: Error }>) {
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
    onAuthStateChange(callback: typeof listener) {
      listener = callback
      return { data: { subscription: { unsubscribe } } }
    },
  } as AuthCallbackClient
  return {
    auth,
    getSession,
    unsubscribe,
    emit(next: Session | null) {
      listener?.('SIGNED_IN', next)
    },
  }
}

describe('waitForAuthCallbackSession', () => {
  afterEach(() => vi.useRealTimers())

  it('returns authenticated for an existing session and unsubscribes', async () => {
    const fake = fakeAuth([{ session }])
    await expect(waitForAuthCallbackSession(fake.auth, { hasCode: true })).resolves.toBe('authenticated')
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
  })

  it('returns missing_code when neither a code nor session exists', async () => {
    const fake = fakeAuth([{ session: null }])
    await expect(waitForAuthCallbackSession(fake.auth, { hasCode: false })).resolves.toBe('missing_code')
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
  })

  it('resolves when an auth event supplies the session', async () => {
    vi.useFakeTimers()
    const fake = fakeAuth([{ session: null }])
    const result = waitForAuthCallbackSession(fake.auth, { hasCode: true })
    await Promise.resolve()
    fake.emit(session)
    await expect(result).resolves.toBe('authenticated')
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
  })

  it('resolves when bounded polling finds the session', async () => {
    vi.useFakeTimers()
    const fake = fakeAuth([{ session: null }, { session }])
    const result = waitForAuthCallbackSession(fake.auth, {
      hasCode: true,
      pollIntervalMs: 10,
    })
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe('authenticated')
    expect(fake.getSession).toHaveBeenCalledTimes(2)
  })

  it('times out after the configured poll limit', async () => {
    vi.useFakeTimers()
    const fake = fakeAuth([{ session: null }])
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

  it('returns session_error when getSession fails', async () => {
    const fake = fakeAuth([{ session: null, error: new Error('session unavailable') }])
    await expect(waitForAuthCallbackSession(fake.auth, { hasCode: true })).resolves.toBe('session_error')
    expect(fake.unsubscribe).toHaveBeenCalledOnce()
  })

  it('aborts immediately and unsubscribes on unmount', async () => {
    vi.useFakeTimers()
    const fake = fakeAuth([{ session: null }])
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
```

Each test asserts the exact result and that `unsubscribe` runs once. The fake
auth object deliberately has no `exchangeCodeForSession` method, proving the
helper cannot perform a second exchange.

- [x] **Step 2: Run callback tests and verify RED**

Run: `npm test -- tests/auth-callback-session.test.ts`

Expected: FAIL because the callback-session helper does not exist.

- [x] **Step 3: Implement bounded observation with centralized cleanup**

Implement `waitForAuthCallbackSession` as one promise. Subscribe before the
first `getSession()` call so an automatic PKCE `SIGNED_IN` event cannot be
missed. If the first check has no session and `hasCode` is false, return
`missing_code`; otherwise poll up to 20 times at 250 ms by default.

```ts
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

    const onAbort = () => finish('aborted')
    const finish = (result: AuthCallbackSessionResult) => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      subscription?.unsubscribe()
      resolve(result)
    }

    if (options.signal?.aborted) {
      finish('aborted')
      return
    }
    options.signal?.addEventListener('abort', onAbort, { once: true })

    const { data } = auth.onAuthStateChange((_event, session) => {
      if (session) finish('authenticated')
    })
    subscription = data.subscription
    if (settled) subscription.unsubscribe()

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
```

- [x] **Step 4: Run callback tests and verify GREEN**

Run: `npm test -- tests/auth-callback-session.test.ts`

Expected: all callback cases PASS with no pending-timer warning.

- [x] **Step 5: Replace manual exchange in the callback page**

The effect must:

```ts
const controller = new AbortController()
const errorParam = searchParams.get('error')
if (errorParam) {
  router.replace('/?error=auth_error')
  return () => controller.abort()
}

void waitForAuthCallbackSession(supabase.auth, {
  hasCode: Boolean(searchParams.get('code')),
  signal: controller.signal,
}).then((result) => {
  if (result === 'aborted') return
  if (result === 'authenticated') {
    router.replace(resolvePostLoginRedirect({ explicitRedirect: searchParams.get('redirect') }))
    return
  }
  router.replace('/?error=auth_error')
})

return () => controller.abort()
```

Remove every call to `exchangeCodeForSession` from the page.

- [x] **Step 6: Run callback tests, callback source check, and typecheck**

Run: `npm test -- tests/auth-callback-session.test.ts && ! rg "exchangeCodeForSession" app/auth/callback/page.tsx && npm run typecheck`

Expected: tests PASS, ripgrep finds no manual exchange, and TypeScript exits 0.

- [x] **Step 7: Surface callback failures and provide retry**

Add a home-page notice for `?error=auth_error`. The notice uses `role="alert"`,
clears only the error query on dismissal, and its `Try again` action closes the
job selector and opens `character_login`. Verify in Playwright that a provider
error shows the notice and retry returns the URL to `/` with `Battle Arena`
visible.

---

### Task 4: Lock Down Redirects And Verify The Complete Auth Chain

**Files:**
- Create: `tests/auth-post-login-redirect.test.ts`
- Modify only if a RED test exposes a bug: `src/lib/authPostLoginRedirect.ts`
- Update: `docs/superpowers/plans/2026-07-27-google-oauth-login.md`

**Interfaces:**
- Consumes: `resolvePostLoginRedirect`.
- Produces: regression evidence for relative redirect acceptance and external redirect rejection.

- [x] **Step 1: Add redirect-policy tests**

```ts
expect(resolvePostLoginRedirect({ explicitRedirect: '/battle?mode=pvp' })).toBe('/battle?mode=pvp')
expect(resolvePostLoginRedirect({ explicitRedirect: 'https://evil.example' })).toBe('/')
expect(resolvePostLoginRedirect({ explicitRedirect: '//evil.example' })).toBe('/')
expect(resolvePostLoginRedirect({ explicitRedirect: ' javascript:alert(1)' })).toBe('/')
```

- [x] **Step 2: Run redirect tests**

Run: `npm test -- tests/auth-post-login-redirect.test.ts`

Expected: PASS. If any case fails, first preserve the failing test, then make
the smallest redirect-policy correction and rerun it.

- [x] **Step 3: Run the focused Google auth suite**

Run: `npm test -- tests/supabase-auth-flow.test.ts tests/google-oauth-login.test.ts tests/auth-callback-session.test.ts tests/auth-post-login-redirect.test.ts tests/profile-auth-view-state.test.ts`

Expected: all focused files and tests PASS.

- [x] **Step 4: Run the auth browser contract**

Run: `npx playwright test tests/integration/auth.spec.ts -g "shows Google login only"`

Expected: PASS against `http://localhost:3002`.

- [x] **Step 5: Run full project verification**

Run in order:

```bash
npm test
npm run typecheck
npm --prefix packages/keco-battle-engine run typecheck
npm run build
git diff --check
```

Expected: all commands exit 0. The existing exhaustive-deps warning at
`app/components/map-ui/hooks/useMapBattleLoop.ts:348` may remain; no new warning
is acceptable.

- [x] **Step 6: Confirm branch and leave Google work uncommitted**

Run: `git branch --show-current && git status --short && git log -1 --oneline`

Expected: branch `rebuild`; HEAD remains checkpoint `7843c46`; Google OAuth
spec, plan, implementation, and tests are present as uncommitted changes.
