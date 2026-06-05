import type { BattleSkillDefinition } from '@/src/battle-core/domain/types/skill-types'
import {
  getAllBattleSkillDefinitions,
  getBuiltinBattleSkillDefinitions,
  replaceSkillCatalog,
  resetSkillCatalogToBuiltin,
  upsertBattleSkillDefinitions,
} from '@/src/battle-core/content/skills/basic-skill-catalog'
import { buildUiSkillsFromDefinitions } from './pocSkillUi'
import type { Skill } from '@/app/constants'

export const POC_SKILLS_UPDATED_EVENT = 'battle-poc-skills-updated'

export const DEFAULT_POC_SKILL_MODULE_ID = 'builtin'
export const DRAFT_SKILL_MODULE_ID = 'studio-drafts'
export const SIMULATION_SYNC_MODULE_ID = 'simulation-sync'

export type PocSkillModuleSource = 'builtin' | 'studio' | 'drafts' | 'simulation-sync'

export type PocSkillModule = {
  id: string
  label: string
  source: PocSkillModuleSource
  /** Set when source=studio */
  studioLibraryId?: string
  /** Raw definitions (pre engine CD scaling), persisted for offline fallback */
  definitions: BattleSkillDefinition[]
}

export type PocSkillModulesState = {
  activeModuleId: string
  modules: PocSkillModule[]
}

export const POC_SKILL_MODULES_STORAGE_KEY = 'battle-poc-skill-modules-v1'

function cloneDefinitions(defs: BattleSkillDefinition[]): BattleSkillDefinition[] {
  return JSON.parse(JSON.stringify(defs)) as BattleSkillDefinition[]
}

function isValidDefinition(x: unknown): x is BattleSkillDefinition {
  if (!x || typeof x !== 'object') return false
  const d = x as BattleSkillDefinition
  return (
    typeof d.id === 'string' &&
    d.id.length > 0 &&
    typeof d.name === 'string' &&
    d.name.length > 0 &&
    typeof d.ratio === 'number' &&
    Number.isFinite(d.ratio) &&
    typeof d.mpCost === 'number' &&
    Number.isFinite(d.mpCost) &&
    typeof d.range === 'number' &&
    Number.isFinite(d.range) &&
    typeof d.cooldownTicks === 'number' &&
    Number.isFinite(d.cooldownTicks)
  )
}

function createDefaultState(): PocSkillModulesState {
  const defs = getBuiltinBattleSkillDefinitions()
  return {
    activeModuleId: DEFAULT_POC_SKILL_MODULE_ID,
    modules: [
      {
        id: DEFAULT_POC_SKILL_MODULE_ID,
        label: 'Default skills',
        source: 'builtin',
        definitions: cloneDefinitions(defs),
      },
    ],
  }
}

function isModulesState(x: unknown): x is PocSkillModulesState {
  if (!x || typeof x !== 'object') return false
  const o = x as PocSkillModulesState
  if (typeof o.activeModuleId !== 'string' || !Array.isArray(o.modules)) return false
  for (const m of o.modules) {
    if (!m || typeof m !== 'object') return false
    const mod = m as PocSkillModule
    if (typeof mod.id !== 'string' || typeof mod.label !== 'string' || !Array.isArray(mod.definitions)) {
      return false
    }
    if (!mod.definitions.every(isValidDefinition)) return false
  }
  return o.modules.length > 0
}

function parseModulesJson(raw: string | null): PocSkillModulesState | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as unknown
    return isModulesState(data) ? data : null
  } catch {
    return null
  }
}

export function loadPocSkillModulesState(): PocSkillModulesState {
  if (typeof window === 'undefined') return createDefaultState()
  const fromLs = parseModulesJson(localStorage.getItem(POC_SKILL_MODULES_STORAGE_KEY))
  if (fromLs) return fromLs
  const fresh = createDefaultState()
  savePocSkillModulesState(fresh, { notify: false })
  return fresh
}

export function savePocSkillModulesState(
  state: PocSkillModulesState,
  options?: { notify?: boolean },
): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(POC_SKILL_MODULES_STORAGE_KEY, JSON.stringify(state))
  if (options?.notify !== false) {
    notifyPocSkillsUpdated()
  }
}

export function notifyPocSkillsUpdated(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(POC_SKILLS_UPDATED_EVENT))
}

export function getActiveModule(state: PocSkillModulesState): PocSkillModule {
  return (
    state.modules.find((m) => m.id === state.activeModuleId) ??
    state.modules[0] ??
    createDefaultState().modules[0]!
  )
}

export function studioModuleId(libraryId: string): string {
  return `studio:${libraryId}`
}

export function applyDefinitionsToRuntimeCatalog(definitions: BattleSkillDefinition[]): void {
  if (definitions.length === 0) {
    resetSkillCatalogToBuiltin()
    return
  }
  replaceSkillCatalog(definitions)
}

/** Merge base module defs with simulation-sync defs (simulation wins on duplicate id). */
export function mergeSkillDefinitions(
  base: BattleSkillDefinition[],
  simulationSync: BattleSkillDefinition[],
): BattleSkillDefinition[] {
  const byId = new Map<string, BattleSkillDefinition>()
  for (const def of base) byId.set(def.id, def)
  for (const def of simulationSync) byId.set(def.id, def)
  return [...byId.values()]
}

export function getSimulationSyncModule(
  state: PocSkillModulesState,
): PocSkillModule | undefined {
  return state.modules.find((m) => m.id === SIMULATION_SYNC_MODULE_ID)
}

export function applyModuleToRuntime(module: PocSkillModule): Skill[] {
  applyDefinitionsToRuntimeCatalog(module.definitions)
  return buildUiSkillsFromDefinitions(getAllBattleSkillDefinitions())
}

export function applyMergedModulesToRuntime(
  baseModule: PocSkillModule,
  simulationModule: PocSkillModule | null | undefined,
): { skills: Skill[]; baseSkills: Skill[]; simulationSyncSkills: Skill[] } {
  const merged = mergeSkillDefinitions(
    baseModule.definitions,
    simulationModule?.definitions ?? [],
  )
  applyDefinitionsToRuntimeCatalog(merged)
  const all = buildUiSkillsFromDefinitions(getAllBattleSkillDefinitions())
  const simulationIds = new Set((simulationModule?.definitions ?? []).map((d) => d.id))
  const baseIds = new Set(baseModule.definitions.map((d) => d.id))
  const simulationSyncSkills = all.filter((s) => simulationIds.has(s.id))
  const baseSkills = all.filter((s) => baseIds.has(s.id) && !simulationIds.has(s.id))
  return {
    skills: [...baseSkills, ...simulationSyncSkills],
    baseSkills,
    simulationSyncSkills,
  }
}

export function upsertDraftModule(
  state: PocSkillModulesState,
  label: string,
  definitions: BattleSkillDefinition[],
): PocSkillModulesState {
  const mod: PocSkillModule = {
    id: DRAFT_SKILL_MODULE_ID,
    label,
    source: 'drafts',
    definitions: cloneDefinitions(definitions),
  }
  const idx = state.modules.findIndex((m) => m.id === DRAFT_SKILL_MODULE_ID)
  const modules =
    idx >= 0
      ? state.modules.map((m, i) => (i === idx ? mod : m))
      : [...state.modules, mod]
  return { ...state, modules, activeModuleId: DRAFT_SKILL_MODULE_ID }
}

export function upsertStudioModule(
  state: PocSkillModulesState,
  libraryId: string,
  label: string,
  definitions: BattleSkillDefinition[],
): PocSkillModulesState {
  const id = studioModuleId(libraryId)
  const mod: PocSkillModule = {
    id,
    label,
    source: 'studio',
    studioLibraryId: libraryId,
    definitions: cloneDefinitions(definitions),
  }
  const idx = state.modules.findIndex((m) => m.id === id)
  const modules =
    idx >= 0
      ? state.modules.map((m, i) => (i === idx ? mod : m))
      : [...state.modules, mod]
  return { ...state, modules, activeModuleId: id }
}

export function upsertSimulationSyncModule(
  state: PocSkillModulesState,
  definitions: BattleSkillDefinition[],
): PocSkillModulesState {
  const mod: PocSkillModule = {
    id: SIMULATION_SYNC_MODULE_ID,
    label: 'Simulation sync',
    source: 'simulation-sync',
    definitions: cloneDefinitions(definitions),
  }
  const idx = state.modules.findIndex((m) => m.id === SIMULATION_SYNC_MODULE_ID)
  const modules =
    idx >= 0
      ? state.modules.map((m, i) => (i === idx ? mod : m))
      : [...state.modules, mod]
  return { ...state, modules }
}

export function clearSimulationSyncModule(state: PocSkillModulesState): PocSkillModulesState {
  return {
    ...state,
    modules: state.modules.filter((m) => m.id !== SIMULATION_SYNC_MODULE_ID),
  }
}

export function setActiveModuleId(
  state: PocSkillModulesState,
  moduleId: string,
): PocSkillModulesState {
  if (!state.modules.some((m) => m.id === moduleId)) return state
  return { ...state, activeModuleId: moduleId }
}

export function resetModuleToBuiltin(state: PocSkillModulesState): PocSkillModulesState {
  const defs = getBuiltinBattleSkillDefinitions()
  const idx = state.modules.findIndex((m) => m.id === DEFAULT_POC_SKILL_MODULE_ID)
  const builtinMod: PocSkillModule = {
    id: DEFAULT_POC_SKILL_MODULE_ID,
    label: 'Default skills',
    source: 'builtin',
    definitions: cloneDefinitions(defs),
  }
  const modules =
    idx >= 0
      ? state.modules.map((m, i) => (i === idx ? builtinMod : m))
      : [builtinMod, ...state.modules]
  return { ...state, modules, activeModuleId: DEFAULT_POC_SKILL_MODULE_ID }
}

/** Register extra studio-imported defs without replacing the whole catalog (legacy helper). */
export function registerExtraDefinitions(definitions: BattleSkillDefinition[]): void {
  upsertBattleSkillDefinitions(definitions)
}
