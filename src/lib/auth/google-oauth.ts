import type { SupabaseClient } from '@supabase/supabase-js'

export type GoogleOAuthAuthClient = Pick<SupabaseClient['auth'], 'signInWithOAuth'>

export function buildGoogleOAuthRedirectUrl(origin: string): string {
  return new URL('/auth/callback', origin).toString()
}

export async function startGoogleOAuth(
  auth: GoogleOAuthAuthClient,
  origin: string,
): Promise<void> {
  const { error } = await auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: buildGoogleOAuthRedirectUrl(origin),
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error) throw error
}
