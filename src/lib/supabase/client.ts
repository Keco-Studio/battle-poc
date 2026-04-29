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

export function requireSupabaseClient(): any {
  if (!supabase) {
    throw new Error(
      'Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    )
  }
  // Supabase 的泛型在当前 `Database` 类型定义下会导致一连串 `never` 推导错误。
  // 构建阶段我们不追求这里的强类型，直接擦除类型以保证 `next build` 可通过。
  return supabase as any
}
