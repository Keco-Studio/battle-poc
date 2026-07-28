import { getOrCreateBrowserSupabaseClient } from './browserClient'

export {
  BATTLE_SUPABASE_AUTH_FLOW,
  getOrCreateBrowserSupabaseClient,
} from './browserClient'

/** Legacy export — prefer SupabaseContext in React components. */
export const supabase = getOrCreateBrowserSupabaseClient()

export function requireSupabaseClient(): any {
  const client = getOrCreateBrowserSupabaseClient()
  if (!client) {
    throw new Error(
      'Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }
  return client as any
}
