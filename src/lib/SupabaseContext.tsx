'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createHybridStorageAdapter } from './hybridStorageAdapter'

function readSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (url && anonKey) return { url, anonKey }
  return null
}

/** True when Supabase env vars are set (guest mode still works when false). */
export function isBattleSupabaseConfigured(): boolean {
  return readSupabaseEnv() !== null
}

const SupabaseContext = createContext<SupabaseClient | null>(null)

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const env = readSupabaseEnv()
    if (!env) return null
    return createClient(env.url, env.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storage: createHybridStorageAdapter(),
      },
    })
  }, [])

  return <SupabaseContext.Provider value={client}>{children}</SupabaseContext.Provider>
}

/** Returns `null` when env vars are missing; callers must handle guest mode. */
export function useSupabaseOptional(): SupabaseClient | null {
  return useContext(SupabaseContext)
}
