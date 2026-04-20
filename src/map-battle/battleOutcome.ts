import type { BattleSession } from '@/src/battle-core/domain/entities/battle-session'

/** 将 battle-core 的 result / battle_ended 归一为 POC UI 结局 */
export function getPocBattleUiOutcome(session: BattleSession): 'ongoing' | 'win' | 'lose' | 'fled' {
  if (session.result === 'ongoing') return 'ongoing'
  const ended = [...session.events].reverse().find((e) => e.type === 'battle_ended')
  const reason = typeof ended?.payload?.reason === 'string' ? ended.payload.reason : ''

  if (reason === 'flee_success') return 'fled'
  if (reason === 'right_defeated' && session.result === 'left_win') return 'win'
  if (reason === 'left_defeated' && session.result === 'right_win') return 'lose'

  if (session.result === 'left_win') return 'win'
  if (session.result === 'right_win') return 'lose'
  return 'ongoing'
}
