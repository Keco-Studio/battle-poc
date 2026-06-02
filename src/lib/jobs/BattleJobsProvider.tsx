'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { JobClassId } from '@/app/constants'
import {
  JOB_CLASS_IDS,
  JOB_DESCRIPTIONS,
  JOB_DISPLAY_NAMES,
  JOB_PREFERRED_RANGE,
  ROLE_STATS,
} from '@/app/constants'

type BattleJobsContextValue = {
  jobClassIds: JobClassId[]
  displayNames: Record<JobClassId, string>
  descriptions: Record<JobClassId, string>
  preferredRanges: Record<JobClassId, 'melee' | 'mid' | 'ranged'>
  roleStats: typeof ROLE_STATS
}

const BattleJobsContext = createContext<BattleJobsContextValue | null>(null)

export function BattleJobsProvider({ children }: { children: ReactNode }) {
  const value = useMemo<BattleJobsContextValue>(
    () => ({
      jobClassIds: JOB_CLASS_IDS,
      displayNames: JOB_DISPLAY_NAMES,
      descriptions: JOB_DESCRIPTIONS,
      preferredRanges: JOB_PREFERRED_RANGE,
      roleStats: ROLE_STATS,
    }),
    [],
  )

  return <BattleJobsContext.Provider value={value}>{children}</BattleJobsContext.Provider>
}

export function useBattleJobs(): BattleJobsContextValue {
  const ctx = useContext(BattleJobsContext)
  if (!ctx) {
    throw new Error('useBattleJobs must be used within BattleJobsProvider')
  }
  return ctx
}
