import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './types'
import type {
  SimulationSkillDraft,
  SimulationSkillDraftsPersisted,
} from '@/src/lib/skills/simulationSkillDraftTypes'

type SimulationSkillDraftsRow =
  Database['public']['Tables']['simulation_skill_drafts']['Row']

function sanitizeDrafts(raw: unknown): SimulationSkillDraft[] {
  if (!raw || typeof raw !== 'object') return []
  const o = raw as SimulationSkillDraftsPersisted
  if (!Array.isArray(o.drafts)) return []
  return o.drafts.filter(
    (d): d is SimulationSkillDraft =>
      Boolean(d && typeof d === 'object' && typeof d.draftId === 'string'),
  )
}

export async function fetchSimulationSkillDraftsForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<SimulationSkillDraft[]> {
  const { data, error } = await supabase
    .from('simulation_skill_drafts')
    .select('drafts')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return []
  return sanitizeDrafts({ version: 1, drafts: data.drafts as SimulationSkillDraft[] })
}

export async function upsertSimulationSkillDraftsForUser(
  supabase: SupabaseClient,
  userId: string,
  drafts: SimulationSkillDraft[],
): Promise<void> {
  const { error } = await supabase.from('simulation_skill_drafts').upsert(
    {
      user_id: userId,
      drafts,
    },
    { onConflict: 'user_id' },
  )
  if (error) throw error
}

export type { SimulationSkillDraftsRow }
