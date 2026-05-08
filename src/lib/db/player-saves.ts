import { requireSupabaseClient } from '../supabase/client'
import type { PlayerSaveRow, PlayerSaveUpdate } from './types'
import { pushDataFlowTrace } from '../debug/data-flow-trace'

/**
 * Load the current user's save. Returns null if not found.
 */
export async function loadPlayerSave(): Promise<PlayerSaveRow | null> {
  const supabase = requireSupabaseClient()
  pushDataFlowTrace('loadPlayerSave', 'start')
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    pushDataFlowTrace('loadPlayerSave', 'success', 'Not authenticated')
    return null
  }
  // PVP 迁移里有 `using (true)` 的全表可读策略；必须按 user_id 过滤，否则 .maybeSingle() 会对多行报错 PGRST116。
  const { data, error } = await supabase
    .from('player_saves')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    pushDataFlowTrace('loadPlayerSave', 'error', error.message)
    throw error
  }
  if (!data) {
    pushDataFlowTrace('loadPlayerSave', 'success', 'No save row yet')
    return null
  }
  pushDataFlowTrace('loadPlayerSave', 'success')
  return data
}

/**
 * Persist updates to the current user's save.
 * Upserts on (user_id) — creates the row if it doesn't exist yet.
 */
export async function savePlayerSave(update: PlayerSaveUpdate): Promise<void> {
  const supabase = requireSupabaseClient()
  pushDataFlowTrace('savePlayerSave', 'start')
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    pushDataFlowTrace('savePlayerSave', 'error', 'Not authenticated')
    throw new Error('Not authenticated')
  }

  const { error } = await supabase
    .from('player_saves')
    .upsert({ user_id: user.id, ...update }, { onConflict: 'user_id' })

  if (error) {
    pushDataFlowTrace('savePlayerSave', 'error', error.message)
    throw error
  }
  pushDataFlowTrace('savePlayerSave', 'success')
}

/**
 * Convenience: update only the carried skill ids.
 */
export async function updateCarriedSkills(skillIds: string[]): Promise<void> {
  await savePlayerSave({ carried_skill_ids: skillIds.slice(0, 6) })
}

/**
 * Convenience: update player position.
 */
export async function updatePlayerPosition(x: number, y: number): Promise<void> {
  await savePlayerSave({ pos_x: x, pos_y: y })
}
