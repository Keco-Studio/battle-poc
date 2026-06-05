import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/src/lib/db/types'
import { fetchSimulationSkillDraftsForUser } from '@/src/lib/db/simulation-skill-drafts'
import { registerKecoSkills } from '@/src/keco/kecoSkillBridge'
import { setKecoSkillsRecord } from './kecoSkillRegistry'
import {
  applyMergedModulesToRuntime,
  getActiveModule,
  getSimulationSyncModule,
  loadPocSkillModulesState,
  notifyPocSkillsUpdated,
  savePocSkillModulesState,
  SIMULATION_SYNC_MODULE_ID,
  upsertSimulationSyncModule,
  clearSimulationSyncModule,
  type PocSkillModulesState,
} from './pocSkillModulesStorage'
import type { Skill } from '@/app/constants'
import { refreshSimulationSkillDraftsWithSupabase } from './refreshSimulationSkillDrafts'
import { validateSimulationSkillDrafts } from './validateSimulationSkillDrafts'

export type SimulationSkillSyncResult = {
  state: PocSkillModulesState
  skills: Skill[]
  baseSkills: Skill[]
  simulationSyncSkills: Skill[]
  errors: string[]
  warnings: string[]
  syncedCount: number
}

function applyStateToRuntime(state: PocSkillModulesState): {
  skills: Skill[]
  baseSkills: Skill[]
  simulationSyncSkills: Skill[]
} {
  const baseModule = getActiveModule(state)
  const simulationModule = getSimulationSyncModule(state)
  return applyMergedModulesToRuntime(baseModule, simulationModule ?? null)
}

export function readMergedSkillsFromPersistence(): {
  state: PocSkillModulesState
  skills: Skill[]
  baseSkills: Skill[]
  simulationSyncSkills: Skill[]
} {
  const state = loadPocSkillModulesState()
  const runtime = applyStateToRuntime(state)
  return { state, ...runtime }
}

export async function syncSimulationSkillsFromRemote(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SimulationSkillSyncResult> {
  const remoteDrafts = await fetchSimulationSkillDraftsForUser(supabase, userId)
  if (remoteDrafts.length === 0) {
    let state = loadPocSkillModulesState()
    state = {
      ...state,
      modules: state.modules.filter((m) => m.id !== SIMULATION_SYNC_MODULE_ID),
    }
    savePocSkillModulesState(state, { notify: false })
    const runtime = applyStateToRuntime(state)
    return {
      state,
      ...runtime,
      errors: [],
      warnings: [
        'No simulation import drafts found. Import skills in keco-simulation (Battle → skills import), ' +
          'while signed in with the same account, then tap Sync again. ' +
          'Studio library data alone is not synced automatically.',
      ],
      syncedCount: 0,
    }
  }

  const { drafts: refreshed, warnings } = await refreshSimulationSkillDraftsWithSupabase(
    supabase,
    remoteDrafts,
  )
  const validation = validateSimulationSkillDrafts(refreshed)

  if (!validation.ok) {
    const state = loadPocSkillModulesState()
    const runtime = applyStateToRuntime(state)
    return {
      state,
      ...runtime,
      errors: validation.draftErrors.map((e) => `${e.label}: ${e.error}`),
      warnings: warnings.map((w) => `${w.label}: ${w.warning}`),
      syncedCount: 0,
    }
  }

  if (validation.kecoSkills.length > 0) {
    setKecoSkillsRecord(registerKecoSkills(validation.kecoSkills))
  }

  let state = loadPocSkillModulesState()
  state = upsertSimulationSyncModule(state, validation.definitions)
  savePocSkillModulesState(state)
  notifyPocSkillsUpdated()

  const runtime = applyStateToRuntime(state)
  return {
    state,
    ...runtime,
    errors: [],
    warnings: warnings.map((w) => `${w.label}: ${w.warning}`),
    syncedCount: validation.definitions.length,
  }
}

export function clearSimulationSyncFromRuntime(): {
  state: PocSkillModulesState
  skills: Skill[]
  baseSkills: Skill[]
  simulationSyncSkills: Skill[]
} {
  let state = loadPocSkillModulesState()
  state = clearSimulationSyncModule(state)
  savePocSkillModulesState(state, { notify: false })
  const runtime = applyStateToRuntime(state)
  return { state, ...runtime }
}
