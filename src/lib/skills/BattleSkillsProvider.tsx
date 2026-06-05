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
import { useSupabaseOptional } from '@/src/lib/SupabaseContext'
import { useAuth } from '@/src/lib/contexts/AuthContext'
import type { Skill } from '@/app/constants'
import { refreshAllSkillsFromCatalog, setAllSkills } from '@/app/constants'
import {
  DEFAULT_POC_SKILL_MODULE_ID,
  POC_SKILLS_UPDATED_EVENT,
  type PocSkillModule,
  type PocSkillModulesState,
} from '@/src/lib/skills/pocSkillModulesStorage'
import {
  activateSkillModule,
  bootstrapPocSkillsFromPersistence,
  hydratePocSkills,
  applyPocSkillDrafts,
} from '@/src/lib/skills/pocSkillsStorage'

import {
  clearSimulationSyncFromRuntime,
  syncSimulationSkillsFromRemote,
} from '@/src/lib/skills/simulationSkillSync'

type BattleSkillsContextValue = {
  skills: Skill[]
  baseSkills: Skill[]
  simulationSyncSkills: Skill[]
  modules: PocSkillModule[]
  activeModuleId: string
  isHydrating: boolean
  hydrateError: string | null
  selectModule: (moduleId: string) => void
  applySkillDrafts: () => Promise<{ skills: Skill[]; errors: string[] }>
  syncSimulationSkills: () => Promise<{
    skills: Skill[]
    errors: string[]
    warnings: string[]
    syncedCount: number
  }>
}

const BattleSkillsContext = createContext<BattleSkillsContextValue | null>(null)

function syncGlobals(skills: Skill[]): void {
  setAllSkills(skills)
}

export function BattleSkillsProvider({ children }: { children: ReactNode }) {
  const supabase = useSupabaseOptional()
  const { userProfile, isAuthenticated } = useAuth()
  const initial = bootstrapPocSkillsFromPersistence()
  const [skills, setSkills] = useState<Skill[]>(() => {
    syncGlobals(initial.skills)
    return initial.skills
  })
  const [baseSkills, setBaseSkills] = useState<Skill[]>(initial.baseSkills)
  const [simulationSyncSkills, setSimulationSyncSkills] = useState<Skill[]>(
    initial.simulationSyncSkills,
  )
  const [modulesState, setModulesState] = useState<PocSkillModulesState | null>(null)
  const [isHydrating, setIsHydrating] = useState(true)
  const [hydrateError, setHydrateError] = useState<string | null>(null)

  const applyRuntime = useCallback(
    (next: { skills: Skill[]; baseSkills: Skill[]; simulationSyncSkills: Skill[] }) => {
      setSkills(next.skills)
      setBaseSkills(next.baseSkills)
      setSimulationSyncSkills(next.simulationSyncSkills)
      syncGlobals(next.skills)
    },
    [],
  )

  const runHydrate = useCallback(async () => {
    setIsHydrating(true)
    setHydrateError(null)
    try {
      const client = supabase && isAuthenticated ? supabase : null
      if (!client) {
        const cleared = clearSimulationSyncFromRuntime()
        setModulesState(cleared.state)
        applyRuntime(cleared)
        return
      }
      const { state, skills: next, baseSkills: nextBase, simulationSyncSkills: nextSim } =
        await hydratePocSkills(client, { includeSimulationSync: true })
      setModulesState(state)
      applyRuntime({ skills: next, baseSkills: nextBase, simulationSyncSkills: nextSim })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load skills'
      setHydrateError(msg)
      const fallback = refreshAllSkillsFromCatalog()
      setSkills(fallback)
      setBaseSkills(fallback)
      setSimulationSyncSkills([])
      syncGlobals(fallback)
    } finally {
      setIsHydrating(false)
    }
  }, [supabase, isAuthenticated, applyRuntime])

  useEffect(() => {
    void runHydrate()
  }, [runHydrate])

  useEffect(() => {
    const onUpdated = () => {
      void runHydrate()
    }
    window.addEventListener(POC_SKILLS_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(POC_SKILLS_UPDATED_EVENT, onUpdated)
  }, [runHydrate])

  const selectModule = useCallback(
    (moduleId: string) => {
      const { state, skills: next, baseSkills: nextBase, simulationSyncSkills: nextSim } =
        activateSkillModule(moduleId)
      setModulesState(state)
      applyRuntime({ skills: next, baseSkills: nextBase, simulationSyncSkills: nextSim })
    },
    [applyRuntime],
  )

  const applySkillDrafts = useCallback(async () => {
    const client = supabase && isAuthenticated ? supabase : null
    const { state, skills: next, baseSkills: nextBase, simulationSyncSkills: nextSim, errors } =
      await applyPocSkillDrafts(client)
    setModulesState(state)
    applyRuntime({ skills: next, baseSkills: nextBase, simulationSyncSkills: nextSim })
    return { skills: next, errors }
  }, [supabase, isAuthenticated, applyRuntime])

  const syncSimulationSkills = useCallback(async () => {
    if (!supabase || !isAuthenticated || !userProfile?.id) {
      return {
        skills,
        errors: ['Sign in to sync skills from keco-simulation.'],
        warnings: [],
        syncedCount: 0,
      }
    }
    const result = await syncSimulationSkillsFromRemote(supabase, userProfile.id)
    setModulesState(result.state)
    applyRuntime({
      skills: result.skills,
      baseSkills: result.baseSkills,
      simulationSyncSkills: result.simulationSyncSkills,
    })
    return {
      skills: result.skills,
      errors: result.errors,
      warnings: result.warnings,
      syncedCount: result.syncedCount,
    }
  }, [supabase, isAuthenticated, userProfile?.id, skills, applyRuntime])

  const value = useMemo<BattleSkillsContextValue>(
    () => ({
      skills,
      baseSkills,
      simulationSyncSkills,
      modules: modulesState?.modules.filter((m) => m.source !== 'simulation-sync') ?? [],
      activeModuleId: modulesState?.activeModuleId ?? DEFAULT_POC_SKILL_MODULE_ID,
      isHydrating,
      hydrateError,
      selectModule,
      applySkillDrafts,
      syncSimulationSkills,
    }),
    [
      skills,
      baseSkills,
      simulationSyncSkills,
      modulesState,
      isHydrating,
      hydrateError,
      selectModule,
      applySkillDrafts,
      syncSimulationSkills,
    ],
  )

  return <BattleSkillsContext.Provider value={value}>{children}</BattleSkillsContext.Provider>
}

export function useBattleSkills(): BattleSkillsContextValue {
  const ctx = useContext(BattleSkillsContext)
  if (!ctx) {
    throw new Error('useBattleSkills must be used within BattleSkillsProvider')
  }
  return ctx
}

/** Optional hook for components that may render outside the provider (tests). */
export function useBattleSkillsOptional(): BattleSkillsContextValue | null {
  return useContext(BattleSkillsContext)
}
