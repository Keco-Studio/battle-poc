'use client'

import { QueryProvider } from '@/src/lib/providers/QueryProvider'
import { SupabaseProvider } from '@/src/lib/SupabaseContext'
import { AuthProvider } from '@/src/lib/contexts/AuthContext'
import { BattleGameConfigProvider } from '@/src/lib/gameConfig/BattleGameConfigProvider'
import { BattleSkillsProvider } from '@/src/lib/skills/BattleSkillsProvider'
import { BattleJobsProvider } from '@/src/lib/jobs/BattleJobsProvider'

/** Same provider stack as keco-simulation StudioRuntimeProviders, plus battle skills. */
export function BattleRuntimeProviders({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SupabaseProvider>
        <AuthProvider>
          <BattleGameConfigProvider>
            <BattleJobsProvider>
              <BattleSkillsProvider>{children}</BattleSkillsProvider>
            </BattleJobsProvider>
          </BattleGameConfigProvider>
        </AuthProvider>
      </SupabaseProvider>
    </QueryProvider>
  )
}
