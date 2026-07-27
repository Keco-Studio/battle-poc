import type { SupabaseClient } from '@supabase/supabase-js'
import {
  applyMergedModulesToRuntime,
  clearDraftSkillModule,
  getActiveModule,
  getSimulationSyncModule,
  clearSimulationSyncModule,
  loadPocSkillModulesState,
  notifyPocSkillsUpdated,
  savePocSkillModulesState,
  setActiveModuleId,
  upsertDraftModule,
  type PocSkillModule,
  type PocSkillModulesState,
} from './pocSkillModulesStorage'
import type { Skill } from '@/app/constants'
import { getBuiltinBattleSkillDefinitions } from '@/src/battle-core/content/skills/basic-skill-catalog'
import { loadPocSkillDrafts } from './pocSkillDrafts'
import { validatePocSkillDraftsFromLiveTables } from './refreshPocSkillDrafts'
import {
  clearSimulationSyncFromRuntime,
  syncSimulationSkillsFromRemote,
} from './simulationSkillSync'
import { registerKecoSkills } from '@/src/keco/kecoSkillBridge'
import {
  clearBaseKecoSkillsRecord,
  clearKecoSkillsRecord,
  clearSimulationKecoSkillsRecord,
  setKecoSkillsRecord,
} from './kecoSkillRegistry'

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
  options?: { includeSimulationSync?: boolean; userId?: string },
): Promise<{
  state: PocSkillModulesState
  skills: Skill[]
  baseSkills: Skill[]
  simulationSyncSkills: Skill[]
}> {
  clearSimulationKecoSkillsRecord()

  const applySimulationHydrate = async (state: PocSkillModulesState) => {
    if (supabase && options?.includeSimulationSync && options.userId?.trim()) {
      return syncSimulationSkillsFromRemote(supabase as never, options.userId.trim())
    }
    return { state, ...applyRuntimeFromState(state) }
  }

  const drafts = loadPocSkillDrafts()
  if (drafts.length === 0) {
    clearBaseKecoSkillsRecord()
    let state = clearDraftSkillModule(loadPocSkillModulesState())
    state = clearSimulationSyncModule(state)
    savePocSkillModulesState(state, { notify: false })
    return applySimulationHydrate(state)
  }
  if (drafts.length > 0) {
    const draftResult = await validatePocSkillDraftsFromLiveTables(supabase, drafts)
    if (draftResult.ok && draftResult.definitions.length > 0) {
      setKecoSkillsRecord(registerKecoSkills(draftResult.kecoSkills))
      let state = loadPocSkillModulesState()
      state = upsertDraftModule(state, DRAFT_MODULE_LABEL, draftResult.definitions)
      state = clearSimulationSyncModule(state)
      savePocSkillModulesState(state, { notify: false })
      return applySimulationHydrate(state)
    }
    if (drafts.length > 0 && draftResult.draftErrors.length > 0) {
      clearKecoSkillsRecord()
      let state = loadPocSkillModulesState()
      state = clearDraftSkillModule(state)
      state = clearSimulationSyncModule(state)
      savePocSkillModulesState(state, { notify: false })
    }
  }

  let state = loadPocSkillModulesState()
  state = clearSimulationSyncModule(state)
  return applySimulationHydrate(state)
}

/** Sync battle-core catalog + return UI skills from persisted modules (no network). */
export function bootstrapPocSkillsFromPersistence(): {
  skills: Skill[]
  baseSkills: Skill[]
  simulationSyncSkills: Skill[]
} {
  clearKecoSkillsRecord()
  const builtin: PocSkillModule = {
    id: 'builtin',
    label: 'Default skills',
    source: 'builtin',
    definitions: getBuiltinBattleSkillDefinitions(),
  }
  const state: PocSkillModulesState = { activeModuleId: builtin.id, modules: [builtin] }
  return applyRuntimeFromState(state)
}

export function resetPocSkillsRuntimeToBuiltin(): {
  state: PocSkillModulesState
  skills: Skill[]
  baseSkills: Skill[]
  simulationSyncSkills: Skill[]
} {
  clearKecoSkillsRecord()
  let state = clearDraftSkillModule(loadPocSkillModulesState())
  state = clearSimulationSyncModule(state)
  savePocSkillModulesState(state, { notify: false })
  return { state, ...applyRuntimeFromState(state) }
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
  if (drafts.length === 0) {
    clearKecoSkillsRecord()
    let state = loadPocSkillModulesState()
    state = clearDraftSkillModule(state)
    savePocSkillModulesState(state, { notify: false })
    return {
      state,
      ...applyRuntimeFromState(state),
      errors: ['No Studio skill drafts to apply.'],
    }
  }
  const result = await validatePocSkillDraftsFromLiveTables(supabase, drafts)
  if (!result.ok) {
    clearBaseKecoSkillsRecord()
    let state = loadPocSkillModulesState()
    if (drafts.length > 0 && result.draftErrors.length > 0) {
      state = clearDraftSkillModule(state)
      savePocSkillModulesState(state, { notify: false })
    }
    return {
      state,
      ...applyRuntimeFromState(state),
      errors: result.draftErrors.map((e) => `${e.label}: ${e.error}`),
    }
  }

  let state = loadPocSkillModulesState()
  setKecoSkillsRecord(registerKecoSkills(result.kecoSkills))
  state = upsertDraftModule(state, DRAFT_MODULE_LABEL, result.definitions)
  savePocSkillModulesState(state)
  notifyPocSkillsUpdated()
  return { state, ...applyRuntimeFromState(state), errors: [] }
}

export { clearSimulationSyncFromRuntime }
