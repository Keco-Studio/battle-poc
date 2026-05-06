import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { disengageGridPositions, resolveDirectionByDelta } from '../gameMapUtils'

type GridPos = { x: number; y: number }

type UiOutcome = 'ongoing' | 'win' | 'lose' | 'fled'

type Params = {
  ui: UiOutcome
  session: any
  combatEnemyId: number
  mapWidth: number
  mapHeight: number
  isWalkable: (x: number, y: number, opts?: { ignoreEnemyIds?: number[]; ignorePlayerOnCell?: { x: number; y: number } }) => boolean
  pendingRespawnEnemyIdRef: MutableRefObject<number | null>
  completeMapBattleVictory: (message: string) => void
  completeMapBattleDefeat: () => void
  finalizeMapBattleFleeSuccess: (params: { successMessage: string; clearBattleLog: boolean }) => void
  setPlayerFacing: Dispatch<SetStateAction<any>>
  setPlayerPos: Dispatch<SetStateAction<GridPos>>
  setEnemyPositions: Dispatch<SetStateAction<Record<number, GridPos>>>
  processAutomationAfterBattle: (battleOutcome: 'win' | 'lose' | null) => { continue: boolean; message?: string }
  setBattleLog: Dispatch<SetStateAction<string[]>>
  cancelAutomation: () => void
}

function applyFleeSeparation(params: {
  session: any
  combatEnemyId: number
  mapWidth: number
  mapHeight: number
  isWalkable: Params['isWalkable']
  setPlayerFacing: Params['setPlayerFacing']
  setPlayerPos: Params['setPlayerPos']
  setEnemyPositions: Params['setEnemyPositions']
  finalizeMapBattleFleeSuccess: Params['finalizeMapBattleFleeSuccess']
}) {
  const { session: s, combatEnemyId, mapWidth, mapHeight, isWalkable, setPlayerFacing, setPlayerPos, setEnemyPositions, finalizeMapBattleFleeSuccess } = params
  const p0 = { x: Math.round(s.left.position.x), y: Math.round(s.left.position.y) }
  const e0 = { x: Math.round(s.right.position.x), y: Math.round(s.right.position.y) }
  const sep = disengageGridPositions(
    p0,
    e0,
    mapWidth,
    mapHeight,
    (gx, gy, role) =>
      role === 'playerStep'
        ? isWalkable(gx, gy, { ignoreEnemyIds: combatEnemyId != null ? [combatEnemyId] : [] })
        : isWalkable(gx, gy, { ignorePlayerOnCell: { x: Math.round(p0.x), y: Math.round(p0.y) } }),
  )
  setPlayerFacing(resolveDirectionByDelta(sep.player.x - p0.x, sep.player.y - p0.y))
  setPlayerPos(sep.player)
  setEnemyPositions((prev) => ({ ...prev, [combatEnemyId]: sep.enemy }))
  finalizeMapBattleFleeSuccess({ successMessage: 'Successfully escaped battle.', clearBattleLog: false })
}

export function resolveMapBattleOutcome(params: Params): void {
  const {
    ui,
    session,
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
  } = params

  const battleOutcome: 'win' | 'lose' | null = ui === 'win' ? 'win' : ui === 'lose' ? 'lose' : null
  const automationResult = processAutomationAfterBattle(battleOutcome)
  if (automationResult.message) setBattleLog((prev) => [...prev, automationResult.message!])

  if (ui === 'win') {
    pendingRespawnEnemyIdRef.current = combatEnemyId
    completeMapBattleVictory('Battle victory!')
    if (!automationResult.continue) cancelAutomation()
    return
  }
  if (ui === 'lose') {
    completeMapBattleDefeat()
    if (!automationResult.continue) cancelAutomation()
    return
  }
  if (ui === 'fled') {
    applyFleeSeparation({
      session,
      combatEnemyId,
      mapWidth,
      mapHeight,
      isWalkable,
      setPlayerFacing,
      setPlayerPos,
      setEnemyPositions,
      finalizeMapBattleFleeSuccess,
    })
    if (!automationResult.continue) cancelAutomation()
  }
}
