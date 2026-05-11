export type ProfileAuthViewState = 'guest-mode' | 'checking' | 'authenticated' | 'unauthenticated'

/** Present when Supabase has a valid user (email may be null for some OAuth providers). */
export type ProfileAuthSession = { email: string | null; id: string }

type GetProfileAuthViewStateInput = {
  supabaseConfigured: boolean
  hasSupabaseClient: boolean
  authResolved: boolean
  session: ProfileAuthSession | null
}

export function getProfileAuthViewState({
  supabaseConfigured,
  hasSupabaseClient,
  authResolved,
  session,
}: GetProfileAuthViewStateInput): ProfileAuthViewState {
  if (!supabaseConfigured || !hasSupabaseClient) {
    return 'guest-mode'
  }

  if (!authResolved) {
    return 'checking'
  }

  if (session) {
    return 'authenticated'
  }

  return 'unauthenticated'
}

export function formatProfileSessionLabel(session: ProfileAuthSession): string {
  if (session.email && session.email.trim()) return session.email.trim()
  return `User ${session.id.slice(0, 8)}…`
}
