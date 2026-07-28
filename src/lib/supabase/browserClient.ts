import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../db/types'
import { createHybridStorageAdapter } from '../hybridStorageAdapter'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const isConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const BATTLE_SUPABASE_AUTH_FLOW = {
  flowType: 'pkce' as const,
  detectSessionInUrl: true,
}

/** One browser client per tab — avoids GoTrue "Multiple instances" warnings. */
let browserSupabaseClient: SupabaseClient<Database> | null = null

export function getOrCreateBrowserSupabaseClient(): SupabaseClient<Database> | null {
  if (!isConfigured) return null
  if (!browserSupabaseClient) {
    browserSupabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
      auth: {
        ...BATTLE_SUPABASE_AUTH_FLOW,
        persistSession: true,
        autoRefreshToken: true,
        storage: createHybridStorageAdapter(),
      },
    })
  }
  return browserSupabaseClient
}
