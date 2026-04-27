export type ProfileAuthViewState = 'guest-mode' | 'checking' | 'authenticated' | 'unauthenticated'

type GetProfileAuthViewStateInput = {
  supabaseConfigured: boolean
  hasSupabaseClient: boolean
  authResolved: boolean
  sessionEmail: string | null
}

export function getProfileAuthViewState({
  supabaseConfigured,
  hasSupabaseClient,
  authResolved,
  sessionEmail,
}: GetProfileAuthViewStateInput): ProfileAuthViewState {
  if (!supabaseConfigured || !hasSupabaseClient) {
    return 'guest-mode'
  }

  if (!authResolved) {
    return 'checking'
  }

  if (sessionEmail) {
    return 'authenticated'
  }

  return 'unauthenticated'
}
