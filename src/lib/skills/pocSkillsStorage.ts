import type { SupabaseClient } from '@supabase/supabase-js'
import {
  applyMergedModulesToRuntime,
  getActiveModule,
  getSimulationSyncModule,
  loadPocSkillModulesState,
  notifyPocSkillsUpdated,
  savePocSkillModulesState,
  setActiveModuleId,
  upsertDraftModule,
  type PocSkillModule,
  type PocSkillModulesState,
} from './pocSkillModulesStorage'
import type { Skill } from '@/app/constants'
import { loadPocSkillDrafts } from './pocSkillDrafts'
import { validatePocSkillDraftsFromLiveTables } from './refreshPocSkillDrafts'
import { clearSimulationSyncFromRuntime, readMergedSkillsFromPersistence } from './simulationSkillSync'

const DRAFT_MODULE_LABEL = 'Studio drafts'

function applyRuntimeFromState(state: PocSkillModulesState): {
  skills: Skill[]
  baseSkills: Skill[]
  simulationSyncSkills: Skill[]
} {
  return applyMergedModulesToRuntime(getActiveModule(state), getSimulationSyncModule(state) ?? null)
}

export async function hydratePocSkills(
  supabase: SupabaseClient | null,
  options?: { includeSimulationSync?: boolean },
): Promise<{
  state: PocSkillModulesState
  skills: Skill[]
  baseSkills: Skill[]
  simulationSyncSkills: Skill[]
}> {
  const includeSimulationSync = options?.includeSimulationSync !== false

  const drafts = loadPocSkillDrafts()
  if (drafts.length > 0) {
    const draftResult = await validatePocSkillDraftsFromLiveTables(supabase, drafts)
    if (draftResult.ok && draftResult.definitions.length > 0) {
      let state = loadPocSkillModulesState()
      state = upsertDraftModule(state, DRAFT_MODULE_LABEL, draftResult.definitions)
      savePocSkillModulesState(state, { notify: false })
      if (!includeSimulationSync) {
        state = {
          ...state,
          modules: state.modules.filter((m) => m.source !== 'simulation-sync'),
        }
      }
      return { state, ...applyRuntimeFromState(state) }
    }
  }

  let state = loadPocSkillModulesState()
  if (!includeSimulationSync) {
    state = {
      ...state,
      modules: state.modules.filter((m) => m.source !== 'simulation-sync'),
    }
  }
  return { state, ...applyRuntimeFromState(state) }
}

/** Sync battle-core catalog + return UI skills from persisted modules (no network). */
export function bootstrapPocSkillsFromPersistence(): {
  skills: Skill[]
  baseSkills: Skill[]
  simulationSyncSkills: Skill[]
} {
  const { skills, baseSkills, simulationSyncSkills } = readMergedSkillsFromPersistence()
  return { skills, baseSkills, simulationSyncSkills }
}

export function readPocSkillsForInitialRender(): Skill[] {
  return bootstrapPocSkillsFromPersistence().skills
}

export function activateSkillModule(moduleId: string): {
  state: PocSkillModulesState
  skills: Skill[]
  baseSkills: Skill[]
  simulationSyncSkills: Skill[]
} {
  let state = loadPocSkillModulesState()
  state = setActiveModuleId(state, moduleId)
  savePocSkillModulesState(state)
  return { state, ...applyRuntimeFromState(state) }
}

export function listSkillModules(): PocSkillModule[] {
  return loadPocSkillModulesState().modules.filter((m) => m.source !== 'simulation-sync')
}

export async function applyPocSkillDrafts(
  supabase: SupabaseClient | null,
): Promise<{
  state: PocSkillModulesState
  skills: Skill[]
  baseSkills: Skill[]
  simulationSyncSkills: Skill[]
  errors: string[]
}> {
  const drafts = loadPocSkillDrafts()
  const result = await validatePocSkillDraftsFromLiveTables(supabase, drafts)
  if (!result.ok) {
    const state = loadPocSkillModulesState()
    return {
      state,
      ...applyRuntimeFromState(state),
      errors: result.draftErrors.map((e) => `${e.label}: ${e.error}`),
    }
  }

  let state = loadPocSkillModulesState()
  state = upsertDraftModule(state, DRAFT_MODULE_LABEL, result.definitions)
  savePocSkillModulesState(state)
  notifyPocSkillsUpdated()
  return { state, ...applyRuntimeFromState(state), errors: [] }
}

export { clearSimulationSyncFromRuntime }
