'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOrCreateBrowserSupabaseClient } from './supabase/client'
import { LOCAL_WEB_MODE } from './runtime/localWebMode'

function readSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (url && anonKey) return { url, anonKey }
  return null
}

/** True when Supabase env vars are set (guest mode still works when false). */
export function isBattleSupabaseConfigured(): boolean {
  return !LOCAL_WEB_MODE && readSupabaseEnv() !== null
}

const SupabaseContext = createContext<SupabaseClient | null>(null)

export function SupabaseProvider({ children }: { children: ReactNode }) {
  const client = useMemo(
    () => (LOCAL_WEB_MODE ? null : getOrCreateBrowserSupabaseClient()),
    [],
  )

  return <SupabaseContext.Provider value={client}>{children}</SupabaseContext.Provider>
}

/** Returns `null` when env vars are missing; callers must handle guest mode. */
export function useSupabaseOptional(): SupabaseClient | null {
  return useContext(SupabaseContext)
}

/** Throws when Supabase is not configured — same contract as keco-studio. */
export function useSupabase(): SupabaseClient {
  const client = useContext(SupabaseContext)
  if (!client) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.'
    )
  }
  return client
}
