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

type BattleSkillsContextValue = {
  skills: Skill[]
  modules: PocSkillModule[]
  activeModuleId: string
  isHydrating: boolean
  hydrateError: string | null
  selectModule: (moduleId: string) => void
  applySkillDrafts: () => Promise<{ skills: Skill[]; errors: string[] }>
}

const BattleSkillsContext = createContext<BattleSkillsContextValue | null>(null)

function syncGlobals(skills: Skill[]): void {
  setAllSkills(skills)
}

export function BattleSkillsProvider({ children }: { children: ReactNode }) {
  const supabase = useSupabaseOptional()
  const { userProfile, isAuthenticated } = useAuth()
  const [skills, setSkills] = useState<Skill[]>(() => {
    const initial = bootstrapPocSkillsFromPersistence()
    syncGlobals(initial)
    return initial
  })
  const [modulesState, setModulesState] = useState<PocSkillModulesState | null>(null)
  const [isHydrating, setIsHydrating] = useState(true)
  const [hydrateError, setHydrateError] = useState<string | null>(null)

  const runHydrate = useCallback(async () => {
    setIsHydrating(true)
    setHydrateError(null)
    try {
      const client = supabase && isAuthenticated ? supabase : null
      const { state, skills: next } = await hydratePocSkills(client)
      setModulesState(state)
      setSkills(next)
      syncGlobals(next)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load skills'
      setHydrateError(msg)
      const fallback = refreshAllSkillsFromCatalog()
      setSkills(fallback)
      syncGlobals(fallback)
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
    window.addEventListener(POC_SKILLS_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(POC_SKILLS_UPDATED_EVENT, onUpdated)
  }, [runHydrate])

  const selectModule = useCallback((moduleId: string) => {
    const { state, skills: next } = activateSkillModule(moduleId)
    setModulesState(state)
    setSkills(next)
    syncGlobals(next)
  }, [])

  const applySkillDrafts = useCallback(async () => {
    const client = supabase && isAuthenticated ? supabase : null
    const { state, skills: next, errors } = await applyPocSkillDrafts(client)
    setModulesState(state)
    setSkills(next)
    syncGlobals(next)
    return { skills: next, errors }
  }, [supabase, isAuthenticated])

  const value = useMemo<BattleSkillsContextValue>(
    () => ({
      skills,
      modules: modulesState?.modules ?? [],
      activeModuleId: modulesState?.activeModuleId ?? DEFAULT_POC_SKILL_MODULE_ID,
      isHydrating,
      hydrateError,
      selectModule,
      applySkillDrafts,
    }),
    [skills, modulesState, isHydrating, hydrateError, selectModule, applySkillDrafts],
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
