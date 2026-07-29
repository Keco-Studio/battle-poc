import { createBattle, resolveDecisionTick } from './battleEngine'
import type { V3BattleRecord, V3BattleState } from './types'

export function toBattleRecord(state: V3BattleState): V3BattleRecord {
  return {
    initialConfig: JSON.parse(JSON.stringify(state.initialConfig)) as V3BattleRecord['initialConfig'],
    ticks: JSON.parse(JSON.stringify(state.history)) as V3BattleRecord['ticks'],
  }
}

export function replayBattle(record: V3BattleRecord): V3BattleState {
  let state = createBattle(record.initialConfig)
  for (const tick of record.ticks) {
    if (state.result !== 'ongoing') break
    state = resolveDecisionTick(state, tick.decisions)
  }
  return state
}
