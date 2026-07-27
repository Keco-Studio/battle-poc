import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/src/lib/db/types'
import { fetchSimulationSkillDraftsForUser } from '@/src/lib/db/simulation-skill-drafts'
import { registerKecoSkills } from '@/src/keco/kecoSkillBridge'
import {
  clearSimulationKecoSkillsRecord,
  setSimulationKecoSkillsRecord,
} from './kecoSkillRegistry'
import {
  applyMergedModulesToRuntime,
  getActiveModule,
  getSimulationSyncModule,
  loadPocSkillModulesState,
  savePocSkillModulesState,
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

function clearSimulationSyncState(): PocSkillModulesState {
  const state = clearSimulationSyncModule(loadPocSkillModulesState())
  savePocSkillModulesState(state, { notify: false })
  clearSimulationKecoSkillsRecord()
  return state
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
  let remoteDrafts
  try {
    remoteDrafts = await fetchSimulationSkillDraftsForUser(supabase, userId)
  } catch (error) {
    const state = clearSimulationSyncState()
    const runtime = applyStateToRuntime(state)
    return {
      state,
      ...runtime,
      errors: [`Failed to load simulation skill drafts: ${error instanceof Error ? error.message : 'request failed'}`],
      warnings: [],
      syncedCount: 0,
    }
  }
  if (remoteDrafts.length === 0) {
    const state = clearSimulationSyncState()
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
    const state = clearSimulationSyncState()
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
    setSimulationKecoSkillsRecord(registerKecoSkills(validation.kecoSkills))
  }

  let state = loadPocSkillModulesState()
  state = upsertSimulationSyncModule(state, validation.definitions)
  savePocSkillModulesState(state, { notify: false })

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
  const state = clearSimulationSyncState()
  const runtime = applyStateToRuntime(state)
  return { state, ...runtime }
}
