import { requireSupabaseClient } from '../supabase/client'
import type { BattleHistoryInsert, BattleHistoryRow } from './types'

/**
 * Fetch the most recent N battle records for the current user.
 */
export async function fetchBattleHistory(limit = 50): Promise<BattleHistoryRow[]> {
  const supabase = requireSupabaseClient()
  const { data, error } = await supabase
    .from('battle_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

/**
 * Append a single completed battle record.
 */
export async function recordBattle(entry: Omit<BattleHistoryInsert, 'user_id'>): Promise<void> {
  const supabase = requireSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase
    .from('battle_history')
    .insert({ user_id: user.id, ...entry })

  if (error) throw error
}
