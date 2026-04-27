import { createClient } from '@supabase/supabase-js'
import { createHybridStorageAdapter } from '../hybridStorageAdapter'
import type { Database } from '../db/types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const isConfigured = Boolean(supabaseUrl && supabaseAnonKey)

/**
 * Browser Supabase client.
 * Uses the hybrid storage adapter (cookie + sessionStorage) so each tab
 * maintains an independent auth session.
 */
export const supabase = isConfigured
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: createHybridStorageAdapter(),
      },
    })
  : null

export function requireSupabaseClient() {
  if (!supabase) {
    throw new Error(
      'Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }
  return supabase
}
