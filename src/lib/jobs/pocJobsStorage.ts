import type { SupabaseClient } from '@supabase/supabase-js'
import { snapshotFromConfigs } from './builtinJobCatalog'
import type { JobCatalogSnapshot } from './jobConfigTypes'
import { applyRoleStatsRegistry } from './jobConfigRegistry'
import {
  getActiveModule,
  loadPocJobModulesState,
  notifyPocJobsUpdated,
  savePocJobModulesState,
  setActiveModuleId,
  upsertDraftModule,
  type PocJobModule,
  type PocJobModulesState,
} from './pocJobModulesStorage'
import { loadPocJobDrafts } from './pocJobDrafts'
import { validatePocJobDraftsFromLiveTables } from './refreshPocJobDrafts'

const DRAFT_MODULE_LABEL = 'Studio class drafts'

function applyModuleToRegistry(module: PocJobModule): JobCatalogSnapshot {
  const snap = snapshotFromConfigs(module.configs)
  applyRoleStatsRegistry(snap.roleStats)
  return snap
}

export async function hydratePocJobs(
  supabase: SupabaseClient | null,
): Promise<{ state: PocJobModulesState; snapshot: JobCatalogSnapshot }> {
  const drafts = loadPocJobDrafts()
  if (drafts.length > 0) {
    const draftResult = await validatePocJobDraftsFromLiveTables(supabase, drafts)
    if (draftResult.ok && draftResult.configs.length > 0) {
      let state = loadPocJobModulesState()
      state = upsertDraftModule(state, DRAFT_MODULE_LABEL, draftResult.configs)
      savePocJobModulesState(state, { notify: false })
      const snapshot = applyModuleToRegistry(getActiveModule(state))
      return { state, snapshot }
    }
  }

  const state = loadPocJobModulesState()
  const snapshot = applyModuleToRegistry(getActiveModule(state))
  return { state, snapshot }
}

export function bootstrapPocJobsFromPersistence(): JobCatalogSnapshot {
  const state = loadPocJobModulesState()
  return applyModuleToRegistry(getActiveModule(state))
}

export function activateJobModule(moduleId: string): {
  state: PocJobModulesState
  snapshot: JobCatalogSnapshot
} {
  let state = loadPocJobModulesState()
  state = setActiveModuleId(state, moduleId)
  savePocJobModulesState(state)
  const snapshot = applyModuleToRegistry(getActiveModule(state))
  return { state, snapshot }
}

export async function applyPocJobDrafts(
  supabase: SupabaseClient | null,
): Promise<{
  state: PocJobModulesState
  snapshot: JobCatalogSnapshot
  errors: string[]
}> {
  const drafts = loadPocJobDrafts()
  const result = await validatePocJobDraftsFromLiveTables(supabase, drafts)
  if (!result.ok) {
    return {
      state: loadPocJobModulesState(),
      snapshot: applyModuleToRegistry(getActiveModule(loadPocJobModulesState())),
      errors: result.draftErrors.map((e) => `${e.label}: ${e.error}`),
    }
  }

  let state = loadPocJobModulesState()
  state = upsertDraftModule(state, DRAFT_MODULE_LABEL, result.configs)
  savePocJobModulesState(state)
  const snapshot = applyModuleToRegistry(getActiveModule(state))
  notifyPocJobsUpdated()
  return { state, snapshot, errors: [] }
}
