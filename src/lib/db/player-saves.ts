import { requireSupabaseClient } from '../supabase/client'
import type { PlayerSaveRow, PlayerSaveUpdate } from './types'
import { pushDataFlowTrace } from '../debug/data-flow-trace'

/**
 * Load the current user's save. Returns null if not found.
 */
export async function loadPlayerSave(): Promise<PlayerSaveRow | null> {
  const supabase = requireSupabaseClient()
  pushDataFlowTrace('loadPlayerSave', 'start')
  const { data, error } = await supabase
    .from('player_saves')
    .select('*')
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      pushDataFlowTrace('loadPlayerSave', 'success', 'No save row yet')
      return null // no rows
    }
    pushDataFlowTrace('loadPlayerSave', 'error', error.message)
    throw error
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
