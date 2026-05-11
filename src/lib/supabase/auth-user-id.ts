import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve current user id for DB helpers: prefer local persisted session, then Auth server.
 */
export async function getAuthUserId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session?.user?.id) return session.user.id
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}
