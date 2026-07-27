'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useSupabaseOptional } from '@/src/lib/SupabaseContext'
import { useAuth } from '@/src/lib/contexts/AuthContext'
import type { GameConfigBundle } from './gameConfigTypes'
import {
  DEFAULT_POC_GAME_CONFIG_MODULE_ID,
  POC_GAME_CONFIG_UPDATED_EVENT,
  type PocGameConfigModule,
  type PocGameConfigModulesState,
} from './pocGameConfigModulesStorage'
import {
  activateGameConfigModule,
  applyPocGameConfigDrafts,
  bootstrapPocGameConfigFromPersistence,
  hydratePocGameConfig,
  resetPocGameConfigRuntimeToBuiltin,
} from './pocGameConfigStorage'

type BattleGameConfigContextValue = {
  bundle: GameConfigBundle
  modules: PocGameConfigModule[]
  activeModuleId: string
  configRevision: number
  isHydrating: boolean
  hydrateError: string | null
  selectModule: (moduleId: string) => void
  applyConfigDrafts: () => Promise<{ errors: string[] }>
}

const BattleGameConfigContext = createContext<BattleGameConfigContextValue | null>(null)

export function BattleGameConfigProvider({ children }: { children: ReactNode }) {
  const supabase = useSupabaseOptional()
  const { isAuthenticated } = useAuth()
  const [bundle, setBundle] = useState<GameConfigBundle>(() => bootstrapPocGameConfigFromPersistence())
  const [modulesState, setModulesState] = useState<PocGameConfigModulesState | null>(null)
  const [configRevision, setConfigRevision] = useState(0)
  const [isHydrating, setIsHydrating] = useState(true)
  const [hydrateError, setHydrateError] = useState<string | null>(null)
  const applyingDraftsRef = useRef(false)

  const bump = useCallback(() => setConfigRevision((n) => n + 1), [])

  const runHydrate = useCallback(async () => {
    setIsHydrating(true)
    setHydrateError(null)
    try {
      const client = supabase && isAuthenticated ? supabase : null
      const { state, bundle: next } = await hydratePocGameConfig(client)
      setModulesState(state)
      setBundle(next)
      bump()
    } catch (err) {
      setHydrateError(err instanceof Error ? err.message : 'Failed to load game config')
      const fallback = resetPocGameConfigRuntimeToBuiltin()
      setModulesState(fallback.state)
      setBundle(fallback.bundle)
      bump()
    } finally {
      setIsHydrating(false)
    }
  }, [supabase, isAuthenticated, bump])

  useEffect(() => {
    void runHydrate()
  }, [runHydrate])

  useEffect(() => {
    const onUpdated = () => {
      if (!applyingDraftsRef.current) void runHydrate()
    }
    window.addEventListener(POC_GAME_CONFIG_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(POC_GAME_CONFIG_UPDATED_EVENT, onUpdated)
  }, [runHydrate])

  const selectModule = useCallback(
    (moduleId: string) => {
      const { state, bundle: next } = activateGameConfigModule(moduleId)
      setModulesState(state)
      setBundle(next)
      bump()
    },
    [bump],
  )

  const applyConfigDrafts = useCallback(async () => {
    applyingDraftsRef.current = true
    try {
      const client = supabase && isAuthenticated ? supabase : null
      const { state, bundle: next, errors } = await applyPocGameConfigDrafts(client)
      setModulesState(state)
      setBundle(next)
      bump()
      return { errors }
    } finally {
      applyingDraftsRef.current = false
    }
  }, [supabase, isAuthenticated, bump])

  const value = useMemo<BattleGameConfigContextValue>(
    () => ({
      bundle,
      modules: modulesState?.modules ?? [],
      activeModuleId: modulesState?.activeModuleId ?? DEFAULT_POC_GAME_CONFIG_MODULE_ID,
      configRevision,
      isHydrating,
      hydrateError,
      selectModule,
      applyConfigDrafts,
    }),
    [
      bundle,
      modulesState,
      configRevision,
      isHydrating,
      hydrateError,
      selectModule,
      applyConfigDrafts,
    ],
  )

  return (
    <BattleGameConfigContext.Provider value={value}>{children}</BattleGameConfigContext.Provider>
  )
}

export function useBattleGameConfig(): BattleGameConfigContextValue {
  const ctx = useContext(BattleGameConfigContext)
  if (!ctx) throw new Error('useBattleGameConfig must be used within BattleGameConfigProvider')
  return ctx
}

export function useBattleGameConfigOptional(): BattleGameConfigContextValue | null {
  return useContext(BattleGameConfigContext)
}
