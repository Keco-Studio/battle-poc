# Battle POC Google OAuth Login Design

## Context

Keco Studio and battle-poc use the same Supabase project and therefore share
the same `auth.users`, `profiles`, authored Studio tables, row-level security,
and user-scoped game data. Keco Studio already supports both password login and
Google OAuth. battle-poc currently supports password sign-up/sign-in and has an
OAuth callback route, but it does not expose a Google login action and its
callback manually exchanges the authorization code instead of following Keco
Studio's browser PKCE behavior.

## Goal

Add Google login to battle-poc as an additional sign-in method while preserving
password sign-up/sign-in and guest mode. A Google-authenticated session must
flow through the existing battle-poc auth, save hydration, and Studio import
paths using the Supabase user ID returned by the shared backend.

## Non-Goals

- Do not remove or redesign password authentication.
- Do not add a separate Google registration screen. The Google action creates
  a user on first use when Supabase signup is enabled.
- Do not add application-level account linking, user copying, or profile
  merging. Identity linking remains owned by the shared Supabase Auth project,
  matching Keco Studio.
- Do not change Keco Studio, Supabase schemas, RLS policies, or game data.
- Do not introduce server-side route protection or migrate battle-poc's entire
  auth client to `@supabase/ssr` as part of this change.

## User Experience

- The profile panel continues to show the existing `Sign in` and `Sign up`
  modes.
- `Sign in` shows a `Continue with Google` button above the password form, with
  an `or` divider between the OAuth and password choices.
- `Sign up` continues to show only the password registration form. A first-time
  Google user signs up by choosing Google from `Sign in`, matching Keco Studio.
- While Google OAuth is being started, the Google button shows a loading label
  and both Google and password submission controls are disabled.
- If starting OAuth fails before navigation, the button returns to its normal
  state and the existing visible auth error area shows a friendly message.
- If the provider rejects the callback or session establishment fails, the
  battle home page shows a dismissible authentication error notice. `Try again`
  removes the error query and opens the profile sign-in panel.
- Password login, password registration, sign-out, and guest mode retain their
  current behavior.

## OAuth Request

The OAuth request uses the existing browser Supabase client:

```ts
supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
    queryParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  },
})
```

The callback URL is always derived from `window.location.origin`; no build-time
production hostname is embedded. Supabase's deployed redirect allowlist must
contain every battle-poc origin that should support Google login. Provider
enablement and the allowlist are deployment prerequisites, not client code.

The existing browser client is configured explicitly with `flowType: 'pkce'`
and `detectSessionInUrl: true`. The hybrid storage adapter must preserve the
PKCE code verifier under its own SDK-provided key in `sessionStorage` across
the same-tab provider redirect. Only the exact Supabase session-token key may
be mapped to battle-poc's tab-scoped key and cookie; a key ending in
`-code-verifier` must never alias or overwrite the session token. Password
authentication and the existing session persistence settings are not
otherwise changed.

## Callback And Session Establishment

Keco Studio uses an `@supabase/ssr` browser client whose PKCE code exchange can
complete automatically. battle-poc will configure its existing
`@supabase/supabase-js` client for the same automatic PKCE ownership and use a
single callback helper with this contract:

1. If the provider returns an OAuth error query parameter, fail immediately.
2. Record whether an authorization `code` is present, but do not treat the code
   itself as proof of login.
3. Subscribe to authenticated auth state events and check `getSession()` for
   an already established session.
4. If no code and no existing session are present, navigate to
   `/?error=auth_error`; an existing session without a code returns to `/`.
5. If a code is present but a session is not immediately visible, keep
   listening for an auth
   state event and poll `getSession()` for a bounded period.
6. On success, unsubscribe, cancel pending timers, and navigate to the resolved
   post-login path.
7. On automatic exchange failure or timeout, clean up all listeners/timers and
   navigate to `/?error=auth_error`.

The callback page never calls `exchangeCodeForSession`. This prevents it from
racing the Supabase client's automatic exchange and matches Keco Studio. The
presence of a code alone is never treated as successful login.

The existing `resolvePostLoginRedirect` remains the sole redirect policy. It
accepts only safe relative paths, rejects protocol URLs and protocol-relative
paths, and defaults to `/`.

## Identity And Data Ownership

- Both password and Google sessions are Supabase sessions from the same project.
- `auth.users.id` remains the canonical application user ID.
- `profiles.id`, player saves, Studio table ownership, and import queries
  continue to use that ID without provider-specific branching.
- For matching email identities, battle-poc relies on the same Supabase Auth
  automatic identity-linking policy as Keco Studio. The client must not guess
  account equivalence from email or merge data itself.
- After callback success, the existing `AuthContext` and `useGameState` session
  listeners hydrate the profile, save, and current user-scoped Studio imports.
- Signed-out cleanup and fail-closed import behavior remain unchanged.

## Components And Boundaries

### OAuth request helper

A focused client helper builds the callback URL and starts Google OAuth. It
accepts the Supabase auth dependency and browser origin so request construction
can be unit tested without rendering the whole game panel.

### Profile panel

`DockFeatureModal` owns only presentation state: Google loading, visible error,
button availability, and invoking the request helper. It does not own callback
exchange or account-linking rules.

### Callback session helper

A focused async helper owns session observation, bounded polling, cleanup, and
its success/failure result. The callback page owns URL parsing and navigation
only. The Supabase browser client exclusively owns PKCE exchange.

### Authentication error notice

The home page owns a small notice for `?error=auth_error`. It clears only the
`error` query parameter, can be dismissed, and can reopen the profile sign-in
panel without reloading or interfering with other game state.

## Error Handling

- Missing Supabase configuration retains guest mode and does not render an
  active Google action.
- Synchronous exceptions and rejected OAuth requests display `Google login
  failed` or the provider's safe message and clear loading state.
- Provider cancellation and OAuth callback errors resolve to
  `/?error=auth_error`, where a visible notice offers retry and dismissal.
- Missing callback code with no established session is an auth error.
- Callback polling is bounded so the page cannot remain on `Completing
  sign-in...` indefinitely.
- All auth subscriptions and timers are cleaned up on success, failure, and
  component unmount.

## Test Requirements

### Unit tests

- Google OAuth uses provider `google`, the current origin's `/auth/callback`,
  `access_type=offline`, and `prompt=consent`.
- The browser client explicitly uses PKCE with URL session detection enabled.
- Hybrid storage keeps the session token and PKCE code verifier under distinct
  keys and removes each independently.
- OAuth start errors are returned in a form the profile panel can display.
- Callback rejects provider errors and missing-code/no-session callbacks.
- Callback never invokes `exchangeCodeForSession` itself.
- Callback succeeds for an immediately available session.
- Callback succeeds when the session arrives from an auth state event.
- Callback succeeds when the session appears during bounded polling.
- Callback times out, returns failure, and unsubscribes.
- Redirect resolution continues to reject external and protocol-relative URLs.

### UI/integration tests

- Google login is visible in `Sign in` and absent from `Sign up`.
- Starting Google login passes the expected request to Supabase and disables
  duplicate submission while pending.
- A start failure restores controls and displays an error.
- Existing password and guest controls remain available.
- Callback errors render the home-page notice, and `Try again` clears the error
  query and opens the sign-in panel.

### Project verification

- Run the focused auth tests.
- Run the complete Vitest suite.
- Run `npm run typecheck`.
- Run `npm run build`.
- Run `git diff --check`.

## Acceptance Criteria

1. A signed-out user can start Google OAuth from the profile panel.
2. A first-time Google user can be created by the shared Supabase project.
3. A returning Google user reaches the same Supabase-owned profile, save, and
   Studio data associated with that user's canonical ID.
4. Password sign-up/sign-in and guest mode do not regress.
5. OAuth callback success is based on a real session, not only a query code.
6. OAuth errors and timeout states are visible and recoverable.
7. No callback path can redirect to an external origin.
8. No database migration, Keco Studio change, commit, or new auth provider is
   introduced by this implementation.
