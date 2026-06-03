import { createDefaultGameConfigBundle } from './defaultGameConfig'
import type { GameConfigBundle } from './gameConfigTypes'

export const POC_GAME_CONFIG_UPDATED_EVENT = 'battle-poc-game-config-updated'
export const DEFAULT_POC_GAME_CONFIG_MODULE_ID = 'builtin'
export const DRAFT_GAME_CONFIG_MODULE_ID = 'studio-drafts'

export type PocGameConfigModule = {
  id: string
  label: string
  source: 'builtin' | 'drafts'
  bundle: GameConfigBundle
}

export type PocGameConfigModulesState = {
  activeModuleId: string
  modules: PocGameConfigModule[]
}

export const POC_GAME_CONFIG_MODULES_STORAGE_KEY = 'battle-poc-game-config-modules-v1'

function cloneBundle(b: GameConfigBundle): GameConfigBundle {
  return JSON.parse(JSON.stringify(b)) as GameConfigBundle
}

function createDefaultState(): PocGameConfigModulesState {
  return {
    activeModuleId: DEFAULT_POC_GAME_CONFIG_MODULE_ID,
    modules: [
      {
        id: DEFAULT_POC_GAME_CONFIG_MODULE_ID,
        label: 'Default game config',
        source: 'builtin',
        bundle: cloneBundle(createDefaultGameConfigBundle()),
      },
    ],
  }
}

export function loadPocGameConfigModulesState(): PocGameConfigModulesState {
  if (typeof window === 'undefined') return createDefaultState()
  try {
    const raw = localStorage.getItem(POC_GAME_CONFIG_MODULES_STORAGE_KEY)
    if (!raw) return createDefaultState()
    const data = JSON.parse(raw) as PocGameConfigModulesState
    if (data?.modules?.length && typeof data.activeModuleId === 'string') return data
  } catch {
    /* ignore */
  }
  return createDefaultState()
}

export function savePocGameConfigModulesState(
  state: PocGameConfigModulesState,
  options?: { notify?: boolean },
): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(POC_GAME_CONFIG_MODULES_STORAGE_KEY, JSON.stringify(state))
  if (options?.notify !== false) {
    window.dispatchEvent(new CustomEvent(POC_GAME_CONFIG_UPDATED_EVENT))
  }
}

export function getActiveModule(state: PocGameConfigModulesState): PocGameConfigModule {
  return (
    state.modules.find((m) => m.id === state.activeModuleId) ??
    state.modules[0] ??
    createDefaultState().modules[0]!
  )
}

export function upsertDraftModule(
  state: PocGameConfigModulesState,
  label: string,
  bundle: GameConfigBundle,
): PocGameConfigModulesState {
  const mod: PocGameConfigModule = {
    id: DRAFT_GAME_CONFIG_MODULE_ID,
    label,
    source: 'drafts',
    bundle: cloneBundle(bundle),
  }
  const idx = state.modules.findIndex((m) => m.id === DRAFT_GAME_CONFIG_MODULE_ID)
  const modules =
    idx >= 0 ? state.modules.map((m, i) => (i === idx ? mod : m)) : [...state.modules, mod]
  return { ...state, modules, activeModuleId: DRAFT_GAME_CONFIG_MODULE_ID }
}

export function setActiveModuleId(
  state: PocGameConfigModulesState,
  moduleId: string,
): PocGameConfigModulesState {
  if (!state.modules.some((m) => m.id === moduleId)) return state
  return { ...state, activeModuleId: moduleId }
}
