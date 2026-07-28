import { requireSupabaseClient } from '../supabase/client'
import { getAuthUserId } from '../supabase/auth-user-id'
import type { PlayerSaveRow, PlayerSaveUpdate } from './types'
import { pushDataFlowTrace } from '../debug/data-flow-trace'
import type { CloudSaveWriteResult } from './cloud-save-coordinator'

/**
 * Load the current user's save. Returns null if not found.
 */
export async function loadPlayerSave(expectedUserId?: string): Promise<PlayerSaveRow | null> {
  const supabase = requireSupabaseClient()
  pushDataFlowTrace('loadPlayerSave', 'start')
  const userId = expectedUserId ?? await getAuthUserId(supabase)
  if (!userId) {
    pushDataFlowTrace('loadPlayerSave', 'success', 'Not authenticated')
    return null
  }
  // PVP 迁移里有 `using (true)` 的全表可读策略；必须按 user_id 过滤，否则 .maybeSingle() 会对多行报错 PGRST116。
  const { data, error } = await supabase
    .from('player_saves')
    .select('*')
    .eq('user_id', userId)
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
  const userId = await getAuthUserId(supabase)

  if (!userId) {
    pushDataFlowTrace('savePlayerSave', 'error', 'Not authenticated')
    throw new Error('Not authenticated')
  }

  const { error } = await supabase
    .from('player_saves')
    .upsert({ user_id: userId, ...update }, { onConflict: 'user_id' })

  if (error) {
    pushDataFlowTrace('savePlayerSave', 'error', error.message)
    throw error
  }
  pushDataFlowTrace('savePlayerSave', 'success')
}

/**
 * Persist a complete snapshot only when the caller still owns the loaded revision.
 * Returning `conflict` is intentional: callers must hydrate again instead of
 * overwriting a newer save produced by another tab or device.
 */
export async function savePlayerSaveAtRevision(
  userId: string,
  update: PlayerSaveUpdate,
  expectedRevision: number,
): Promise<CloudSaveWriteResult> {
  const supabase = requireSupabaseClient()
  pushDataFlowTrace('savePlayerSaveAtRevision', 'start', `revision=${expectedRevision}`)

  const { data, error } = await supabase
    .from('player_saves')
    .update({ ...update, save_revision: expectedRevision + 1 })
    .eq('user_id', userId)
    .eq('save_revision', expectedRevision)
    .select('save_revision')
    .maybeSingle()

  if (error) {
    pushDataFlowTrace('savePlayerSaveAtRevision', 'error', error.message)
    throw error
  }
  if (!data) {
    pushDataFlowTrace('savePlayerSaveAtRevision', 'error', 'save_conflict')
    return { applied: false, reason: 'conflict' }
  }

  const revision = Number(data.save_revision)
  pushDataFlowTrace('savePlayerSaveAtRevision', 'success', `revision=${revision}`)
  return { applied: true, revision }
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
