import type { SupabaseClient } from '@supabase/supabase-js'
import {
  applyModuleToRuntime,
  getActiveModule,
  loadPocSkillModulesState,
  notifyPocSkillsUpdated,
  savePocSkillModulesState,
  setActiveModuleId,
  upsertDraftModule,
  type PocSkillModule,
  type PocSkillModulesState,
} from './pocSkillModulesStorage'
import { buildUiSkillsFromDefinitions } from './pocSkillUi'
import type { Skill } from '@/app/constants'
import { loadPocSkillDrafts } from './pocSkillDrafts'
import { validatePocSkillDraftsFromLiveTables } from './refreshPocSkillDrafts'

const DRAFT_MODULE_LABEL = 'Studio drafts'

export async function hydratePocSkills(
  supabase: SupabaseClient | null,
): Promise<{ state: PocSkillModulesState; skills: Skill[] }> {
  const drafts = loadPocSkillDrafts()
  if (drafts.length > 0) {
    const draftResult = await validatePocSkillDraftsFromLiveTables(supabase, drafts)
    if (draftResult.ok && draftResult.definitions.length > 0) {
      let state = loadPocSkillModulesState()
      state = upsertDraftModule(state, DRAFT_MODULE_LABEL, draftResult.definitions)
      savePocSkillModulesState(state, { notify: false })
      const skills = applyModuleToRuntime(getActiveModule(state))
      return { state, skills }
    }
  }

  const state = loadPocSkillModulesState()
  const module = getActiveModule(state)
  const skills = applyModuleToRuntime(module)
  return { state, skills }
}

/** Sync battle-core catalog + return UI skills from persisted active module (no network). */
export function bootstrapPocSkillsFromPersistence(): Skill[] {
  const state = loadPocSkillModulesState()
  const module = getActiveModule(state)
  return applyModuleToRuntime(module)
}

export function readPocSkillsForInitialRender(): Skill[] {
  if (typeof window === 'undefined') {
    return buildUiSkillsFromDefinitions(getActiveModule(loadPocSkillModulesState()).definitions)
  }
  return bootstrapPocSkillsFromPersistence()
}

export function activateSkillModule(moduleId: string): { state: PocSkillModulesState; skills: Skill[] } {
  let state = loadPocSkillModulesState()
  state = setActiveModuleId(state, moduleId)
  savePocSkillModulesState(state)
  const skills = applyModuleToRuntime(getActiveModule(state))
  return { state, skills }
}

export function listSkillModules(): PocSkillModule[] {
  return loadPocSkillModulesState().modules
}

export async function applyPocSkillDrafts(
  supabase: SupabaseClient | null,
): Promise<{ state: PocSkillModulesState; skills: Skill[]; errors: string[] }> {
  const drafts = loadPocSkillDrafts()
  const result = await validatePocSkillDraftsFromLiveTables(supabase, drafts)
  if (!result.ok) {
    return {
      state: loadPocSkillModulesState(),
      skills: applyModuleToRuntime(getActiveModule(loadPocSkillModulesState())),
      errors: result.draftErrors.map((e) => `${e.label}: ${e.error}`),
    }
  }

  let state = loadPocSkillModulesState()
  state = upsertDraftModule(state, DRAFT_MODULE_LABEL, result.definitions)
  savePocSkillModulesState(state)
  const skills = applyModuleToRuntime(getActiveModule(state))
  notifyPocSkillsUpdated()
  return { state, skills, errors: [] }
}
