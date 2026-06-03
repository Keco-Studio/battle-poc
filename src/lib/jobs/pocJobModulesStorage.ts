import { getBuiltinJobClassConfigs } from './builtinJobCatalog'
import type { JobClassConfig } from './jobConfigTypes'

export const POC_JOBS_UPDATED_EVENT = 'battle-poc-jobs-updated'

export const DEFAULT_POC_JOB_MODULE_ID = 'builtin'
export const DRAFT_JOB_MODULE_ID = 'studio-drafts'

export type PocJobModuleSource = 'builtin' | 'studio' | 'drafts'

export type PocJobModule = {
  id: string
  label: string
  source: PocJobModuleSource
  studioLibraryId?: string
  configs: JobClassConfig[]
}

export type PocJobModulesState = {
  activeModuleId: string
  modules: PocJobModule[]
}

export const POC_JOB_MODULES_STORAGE_KEY = 'battle-poc-job-modules-v1'

function cloneConfigs(configs: JobClassConfig[]): JobClassConfig[] {
  return JSON.parse(JSON.stringify(configs)) as JobClassConfig[]
}

function isValidConfig(x: unknown): x is JobClassConfig {
  if (!x || typeof x !== 'object') return false
  const c = x as JobClassConfig
  return (
    typeof c.id === 'string' &&
    c.id.length > 0 &&
    typeof c.name === 'string' &&
    c.name.length > 0 &&
    typeof c.stats === 'object' &&
    c.stats !== null &&
    Number.isFinite(c.stats.baseHp)
  )
}

function createDefaultState(): PocJobModulesState {
  const configs = getBuiltinJobClassConfigs()
  return {
    activeModuleId: DEFAULT_POC_JOB_MODULE_ID,
    modules: [
      {
        id: DEFAULT_POC_JOB_MODULE_ID,
        label: 'Default classes',
        source: 'builtin',
        configs: cloneConfigs(configs),
      },
    ],
  }
}

function isModulesState(x: unknown): x is PocJobModulesState {
  if (!x || typeof x !== 'object') return false
  const o = x as PocJobModulesState
  if (typeof o.activeModuleId !== 'string' || !Array.isArray(o.modules)) return false
  for (const m of o.modules) {
    if (!m || typeof m !== 'object') return false
    const mod = m as PocJobModule
    if (typeof mod.id !== 'string' || typeof mod.label !== 'string' || !Array.isArray(mod.configs)) {
      return false
    }
    if (!mod.configs.every(isValidConfig)) return false
  }
  return o.modules.length > 0
}

function parseModulesJson(raw: string | null): PocJobModulesState | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as unknown
    return isModulesState(data) ? data : null
  } catch {
    return null
  }
}

export function loadPocJobModulesState(): PocJobModulesState {
  if (typeof window === 'undefined') return createDefaultState()
  const fromLs = parseModulesJson(localStorage.getItem(POC_JOB_MODULES_STORAGE_KEY))
  if (fromLs) return fromLs
  const fresh = createDefaultState()
  savePocJobModulesState(fresh, { notify: false })
  return fresh
}

export function savePocJobModulesState(
  state: PocJobModulesState,
  options?: { notify?: boolean },
): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(POC_JOB_MODULES_STORAGE_KEY, JSON.stringify(state))
  if (options?.notify !== false) {
    notifyPocJobsUpdated()
  }
}

export function notifyPocJobsUpdated(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(POC_JOBS_UPDATED_EVENT))
}

export function getActiveModule(state: PocJobModulesState): PocJobModule {
  return (
    state.modules.find((m) => m.id === state.activeModuleId) ??
    state.modules[0] ??
    createDefaultState().modules[0]!
  )
}

export function studioModuleId(libraryId: string): string {
  return `studio:${libraryId}`
}

export function upsertDraftModule(
  state: PocJobModulesState,
  label: string,
  configs: JobClassConfig[],
): PocJobModulesState {
  const mod: PocJobModule = {
    id: DRAFT_JOB_MODULE_ID,
    label,
    source: 'drafts',
    configs: cloneConfigs(configs),
  }
  const idx = state.modules.findIndex((m) => m.id === DRAFT_JOB_MODULE_ID)
  const modules =
    idx >= 0 ? state.modules.map((m, i) => (i === idx ? mod : m)) : [...state.modules, mod]
  return { ...state, modules, activeModuleId: DRAFT_JOB_MODULE_ID }
}

export function upsertStudioModule(
  state: PocJobModulesState,
  libraryId: string,
  label: string,
  configs: JobClassConfig[],
): PocJobModulesState {
  const id = studioModuleId(libraryId)
  const mod: PocJobModule = {
    id,
    label,
    source: 'studio',
    studioLibraryId: libraryId,
    configs: cloneConfigs(configs),
  }
  const idx = state.modules.findIndex((m) => m.id === id)
  const modules =
    idx >= 0 ? state.modules.map((m, i) => (i === idx ? mod : m)) : [...state.modules, mod]
  return { ...state, modules, activeModuleId: id }
}

export function setActiveModuleId(
  state: PocJobModulesState,
  moduleId: string,
): PocJobModulesState {
  if (!state.modules.some((m) => m.id === moduleId)) return state
  return { ...state, activeModuleId: moduleId }
}

export function resetModuleToBuiltin(state: PocJobModulesState): PocJobModulesState {
  const configs = getBuiltinJobClassConfigs()
  const builtinMod: PocJobModule = {
    id: DEFAULT_POC_JOB_MODULE_ID,
    label: 'Default classes',
    source: 'builtin',
    configs: cloneConfigs(configs),
  }
  const idx = state.modules.findIndex((m) => m.id === DEFAULT_POC_JOB_MODULE_ID)
  const modules =
    idx >= 0
      ? state.modules.map((m, i) => (i === idx ? builtinMod : m))
      : [builtinMod, ...state.modules]
  return { ...state, modules, activeModuleId: DEFAULT_POC_JOB_MODULE_ID }
}
