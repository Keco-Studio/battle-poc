import type { SupabaseClient } from '@supabase/supabase-js'
import { applyGameConfigBundle } from './gameConfigRegistry'
import type { GameConfigBundle } from './gameConfigTypes'
import {
  getActiveModule,
  clearDraftGameConfigModule,
  loadPocGameConfigModulesState,
  notifyPocGameConfigUpdated,
  savePocGameConfigModulesState,
  upsertDraftModule,
  type PocGameConfigModulesState,
} from './pocGameConfigModulesStorage'
import { loadPocGameConfigDrafts, validateDraftsToBundle } from './pocGameConfigDrafts'
import { refreshPocGameConfigDraftsFromLiveTables } from './refreshPocGameConfigDrafts'
import { createDefaultGameConfigBundle } from './defaultGameConfig'

const DRAFT_MODULE_LABEL = 'Studio game config drafts'

function applyModule(module: { bundle: GameConfigBundle }): GameConfigBundle {
  applyGameConfigBundle(module.bundle)
  return module.bundle
}

export async function hydratePocGameConfig(
  supabase: SupabaseClient | null,
): Promise<{ state: PocGameConfigModulesState; bundle: GameConfigBundle }> {
  const drafts = loadPocGameConfigDrafts()
  if (drafts.length === 0) {
    const state = clearDraftGameConfigModule(loadPocGameConfigModulesState())
    savePocGameConfigModulesState(state, { notify: false })
    return { state, bundle: applyModule(getActiveModule(state)) }
  }
  if (drafts.length > 0) {
    const refreshed = await refreshPocGameConfigDraftsFromLiveTables(supabase, drafts)
    const validated = validateDraftsToBundle(refreshed.drafts)
    if (validated.ok) {
      let state = loadPocGameConfigModulesState()
      state = upsertDraftModule(state, DRAFT_MODULE_LABEL, validated.bundle)
      savePocGameConfigModulesState(state, { notify: false })
      const bundle = applyModule(getActiveModule(state))
      return { state, bundle }
    }
    if (drafts.length > 0 && validated.draftErrors.length > 0) {
      let state = loadPocGameConfigModulesState()
      state = clearDraftGameConfigModule(state)
      savePocGameConfigModulesState(state, { notify: false })
    }
  }

  const state = loadPocGameConfigModulesState()
  const bundle = applyModule(getActiveModule(state))
  return { state, bundle }
}

export function bootstrapPocGameConfigFromPersistence(): GameConfigBundle {
  return applyModule({ bundle: createDefaultGameConfigBundle() })
}

export function resetPocGameConfigRuntimeToBuiltin(): {
  state: PocGameConfigModulesState
  bundle: GameConfigBundle
} {
  const state = clearDraftGameConfigModule(loadPocGameConfigModulesState())
  savePocGameConfigModulesState(state, { notify: false })
  return { state, bundle: applyModule(getActiveModule(state)) }
}

export function activateGameConfigModule(moduleId: string): {
  state: PocGameConfigModulesState
  bundle: GameConfigBundle
} {
  const { setActiveModuleId } = require('./pocGameConfigModulesStorage') as typeof import('./pocGameConfigModulesStorage')
  let state = loadPocGameConfigModulesState()
  state = setActiveModuleId(state, moduleId)
  savePocGameConfigModulesState(state)
  const bundle = applyModule(getActiveModule(state))
  return { state, bundle }
}

export async function applyPocGameConfigDrafts(
  supabase: SupabaseClient | null,
): Promise<{ state: PocGameConfigModulesState; bundle: GameConfigBundle; errors: string[] }> {
  const drafts = loadPocGameConfigDrafts()
  if (drafts.length === 0) {
    let state = loadPocGameConfigModulesState()
    state = clearDraftGameConfigModule(state)
    savePocGameConfigModulesState(state, { notify: false })
    const bundle = applyModule(getActiveModule(state))
    return { state, bundle, errors: ['No Studio game config drafts to apply.'] }
  }
  const refreshed = await refreshPocGameConfigDraftsFromLiveTables(supabase, drafts)
  const validated = validateDraftsToBundle(refreshed.drafts)
  if (!validated.ok) {
    let state = loadPocGameConfigModulesState()
    if (drafts.length > 0 && validated.draftErrors.length > 0) {
      state = clearDraftGameConfigModule(state)
      savePocGameConfigModulesState(state, { notify: false })
      applyModule(getActiveModule(state))
    }
    const bundle = applyModule(getActiveModule(state))
    return {
      state,
      bundle,
      errors: validated.draftErrors.map((e) => `${e.label}: ${e.error}`),
    }
  }

  let state = loadPocGameConfigModulesState()
  state = upsertDraftModule(state, DRAFT_MODULE_LABEL, validated.bundle)
  savePocGameConfigModulesState(state)
  const bundle = applyModule(getActiveModule(state))
  notifyPocGameConfigUpdated()
  return { state, bundle, errors: [] }
}
