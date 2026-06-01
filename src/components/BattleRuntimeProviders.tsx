'use client'

import { QueryProvider } from '@/src/lib/providers/QueryProvider'
import { SupabaseProvider } from '@/src/lib/SupabaseContext'
import { AuthProvider } from '@/src/lib/contexts/AuthContext'
import { BattleSkillsProvider } from '@/src/lib/skills/BattleSkillsProvider'

/** Same provider stack as keco-simulation StudioRuntimeProviders, plus battle skills. */
export function BattleRuntimeProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SupabaseProvider>
        <AuthProvider>
          <BattleSkillsProvider>{children}</BattleSkillsProvider>
        </AuthProvider>
      </SupabaseProvider>
    </QueryProvider>
  )
}
