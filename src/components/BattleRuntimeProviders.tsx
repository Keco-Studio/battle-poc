'use client'

import { QueryProvider } from '@/src/lib/providers/QueryProvider'
import { SupabaseProvider } from '@/src/lib/SupabaseContext'
import { AuthProvider } from '@/src/lib/contexts/AuthContext'

/** Same provider stack as keco-simulation StudioRuntimeProviders. */
export function BattleRuntimeProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SupabaseProvider>
        <AuthProvider>{children}</AuthProvider>
      </SupabaseProvider>
    </QueryProvider>
  )
}
