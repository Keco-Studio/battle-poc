'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { JobClassId } from '@/app/constants'
import { useSupabaseOptional } from '@/src/lib/SupabaseContext'
import { useAuth } from '@/src/lib/contexts/AuthContext'
import type { JobCatalogSnapshot } from './jobConfigTypes'
import {
  DEFAULT_POC_JOB_MODULE_ID,
  POC_JOBS_UPDATED_EVENT,
  type PocJobModule,
  type PocJobModulesState,
} from './pocJobModulesStorage'
import {
  activateJobModule,
  applyPocJobDrafts,
  bootstrapPocJobsFromPersistence,
  hydratePocJobs,
} from './pocJobsStorage'

type BattleJobsContextValue = {
  jobClassIds: JobClassId[]
  displayNames: Record<string, string>
  descriptions: Record<string, string>
  preferredRanges: Record<string, 'melee' | 'mid' | 'ranged'>
  roleStats: JobCatalogSnapshot['roleStats']
  modules: PocJobModule[]
  activeModuleId: string
  isHydrating: boolean
  hydrateError: string | null
  selectModule: (moduleId: string) => void
  applyJobDrafts: () => Promise<{ errors: string[] }>
}

const BattleJobsContext = createContext<BattleJobsContextValue | null>(null)

export function BattleJobsProvider({ children }: { children: ReactNode }) {
  const supabase = useSupabaseOptional()
  const { isAuthenticated } = useAuth()
  const [snapshot, setSnapshot] = useState<JobCatalogSnapshot>(() => bootstrapPocJobsFromPersistence())
  const [modulesState, setModulesState] = useState<PocJobModulesState | null>(null)
  const [isHydrating, setIsHydrating] = useState(true)
  const [hydrateError, setHydrateError] = useState<string | null>(null)

  const runHydrate = useCallback(async () => {
    setIsHydrating(true)
    setHydrateError(null)
    try {
      const client = supabase && isAuthenticated ? supabase : null
      const { state, snapshot: next } = await hydratePocJobs(client)
      setModulesState(state)
      setSnapshot(next)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load class stats'
      setHydrateError(msg)
      setSnapshot(bootstrapPocJobsFromPersistence())
    } finally {
      setIsHydrating(false)
    }
  }, [supabase, isAuthenticated])

  useEffect(() => {
    void runHydrate()
  }, [runHydrate])

  useEffect(() => {
    const onUpdated = () => {
      void runHydrate()
    }
    window.addEventListener(POC_JOBS_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(POC_JOBS_UPDATED_EVENT, onUpdated)
  }, [runHydrate])

  const selectModule = useCallback((moduleId: string) => {
    const { state, snapshot: next } = activateJobModule(moduleId)
    setModulesState(state)
    setSnapshot(next)
  }, [])

  const applyJobDrafts = useCallback(async () => {
    const client = supabase && isAuthenticated ? supabase : null
    const { state, snapshot: next, errors } = await applyPocJobDrafts(client)
    setModulesState(state)
    setSnapshot(next)
    return { errors }
  }, [supabase, isAuthenticated])

  const value = useMemo<BattleJobsContextValue>(
    () => ({
      jobClassIds: snapshot.jobClassIds as JobClassId[],
      displayNames: snapshot.displayNames,
      descriptions: snapshot.descriptions,
      preferredRanges: snapshot.preferredRanges,
      roleStats: snapshot.roleStats,
      modules: modulesState?.modules ?? [],
      activeModuleId: modulesState?.activeModuleId ?? DEFAULT_POC_JOB_MODULE_ID,
      isHydrating,
      hydrateError,
      selectModule,
      applyJobDrafts,
    }),
    [snapshot, modulesState, isHydrating, hydrateError, selectModule, applyJobDrafts],
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

export function useBattleJobsOptional(): BattleJobsContextValue | null {
  return useContext(BattleJobsContext)
}
