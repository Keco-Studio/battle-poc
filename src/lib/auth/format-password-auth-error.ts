/**
 * Maps GoTrue password-grant / sign-in errors to actionable UI copy.
 * The REST endpoint returns HTTP 400 for many auth failures; the `code` field disambiguates.
 */
export function formatPasswordGrantAuthError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Sign-in failed'
  const e = err as { message?: string; code?: string; status?: number }
  const msg = String(e.message || '').trim()
  const code = typeof e.code === 'string' ? e.code : ''

  if (code === 'email_not_confirmed' || /email.*not.*confirmed/i.test(msg)) {
    return 'Email is not confirmed yet. Open the confirmation link from your inbox, or disable “Confirm email” under Supabase Dashboard → Authentication → Providers → Email.'
  }
  if (
    code === 'invalid_credentials' ||
    /invalid login credentials/i.test(msg) ||
    /invalid grant/i.test(msg)
  ) {
    return 'Incorrect email or password. Please try again.'
  }
  if (code === 'user_banned') {
    return 'This account has been disabled.'
  }
  if (code === 'signup_disabled') {
    return 'New sign-ups are disabled for this project.'
  }
  if (code === 'email_exists' || /already registered/i.test(msg)) {
    return 'An account with this email already exists. Try signing in instead.'
  }
  if (code === 'weak_password') {
    return 'Password does not meet the project policy. Try a longer password.'
  }
  if (code === 'email_provider_disabled') {
    return 'Email sign-in is disabled for this project (check Supabase Auth providers).'
  }
  return msg.length > 0 ? msg : 'Sign-in failed'
}
