import { createClient } from 'npm:@supabase/supabase-js@2.87.1'
import { requireEnv } from './crypto.ts'

export function createSupabaseAuthed(authHeader: string) {
  const url = requireEnv('SUPABASE_URL')
  const anon = requireEnv('SUPABASE_ANON_KEY')
  return createClient(url, anon, {
    global: {
      headers: authHeader ? { Authorization: authHeader } : {},
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

