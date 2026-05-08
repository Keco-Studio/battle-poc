import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { resolveMapBattleOutcome } from './resolveMapBattleOutcome'

export function finalizeMapBattleTick(params: {
  ui: 'ongoing' | 'win' | 'lose' | 'fled'
  session: any
  combatEnemyId: number
  scheduleTick: () => void
  mapBattleEndedRef: MutableRefObject<boolean>
  clearTimers: () => void
  mapBattleControllerRef: MutableRefObject<any>
  setLastBattleTickCount: Dispatch<SetStateAction<number>>
  mapWidth: number
  mapHeight: number
  isWalkable: (x: number, y: number, opts?: { ignoreEnemyIds?: number[]; ignorePlayerOnCell?: { x: number; y: number } }) => boolean
  pendingRespawnEnemyIdRef: MutableRefObject<number | null>
  completeMapBattleVictory: (message: string) => void
  completeMapBattleDefeat: () => void
  finalizeMapBattleFleeSuccess: (params: { successMessage: string; clearBattleLog: boolean }) => void
  setPlayerFacing: Dispatch<SetStateAction<any>>
  setPlayerPos: Dispatch<SetStateAction<{ x: number; y: number }>>
  setEnemyPositions: Dispatch<SetStateAction<Record<number, { x: number; y: number }>>>
  processAutomationAfterBattle: (battleOutcome: 'win' | 'lose' | null) => { continue: boolean; message?: string }
  setBattleLog: Dispatch<SetStateAction<string[]>>
  cancelAutomation: () => void
}): boolean {
  const {
    ui,
    session: s,
    combatEnemyId,
    scheduleTick,
    mapBattleEndedRef,
    clearTimers,
    mapBattleControllerRef,
    setLastBattleTickCount,
    mapWidth,
    mapHeight,
    isWalkable,
    pendingRespawnEnemyIdRef,
    completeMapBattleVictory,
    completeMapBattleDefeat,
    finalizeMapBattleFleeSuccess,
    setPlayerFacing,
    setPlayerPos,
    setEnemyPositions,
    processAutomationAfterBattle,
    setBattleLog,
    cancelAutomation,
  } = params

  if (ui === 'ongoing') {
    scheduleTick()
    return false
  }

  mapBattleEndedRef.current = true
  clearTimers()
  mapBattleControllerRef.current = null
  setLastBattleTickCount(Math.max(0, s.tick))

  resolveMapBattleOutcome({
    ui,
    session: s,
    combatEnemyId,
    mapWidth,
    mapHeight,
    isWalkable,
    pendingRespawnEnemyIdRef,
    completeMapBattleVictory,
    completeMapBattleDefeat,
    finalizeMapBattleFleeSuccess,
    setPlayerFacing,
    setPlayerPos,
    setEnemyPositions,
    processAutomationAfterBattle,
    setBattleLog,
    cancelAutomation,
  })
  return true
}
