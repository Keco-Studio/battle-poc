import { requireSupabaseClient } from '../supabase/client'
import { getAuthUserId } from '../supabase/auth-user-id'
import type { BattleHistoryInsert, BattleHistoryRow } from './types'

/**
 * Fetch the most recent N battle records for the current user.
 */
export async function fetchBattleHistory(limit = 50, expectedUserId?: string): Promise<BattleHistoryRow[]> {
  const supabase = requireSupabaseClient()
  let query = supabase
    .from('battle_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (expectedUserId) query = query.eq('user_id', expectedUserId)
  const { data, error } = await query

  if (error) throw error
  return data ?? []
}

/**
 * Append a single completed battle record.
 */
export async function recordBattle(entry: Omit<BattleHistoryInsert, 'user_id'>): Promise<void> {
  const supabase = requireSupabaseClient()
  const userId = await getAuthUserId(supabase)

  if (!userId) throw new Error('Not authenticated')

  // Supabase 的泛型在当前类型定义下会把 insert 入参推断成 `never`。
  // 这里做类型擦除以保证构建通过，同时不影响运行时行为。
  const { error } = await (supabase as any).from('battle_history').insert({ user_id: userId, ...entry })

  if (error) throw error
}
