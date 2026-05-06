import type { Dispatch, SetStateAction } from 'react'
import { resolveDirectionByDelta } from '../gameMapUtils'

type GridPos = { x: number; y: number }

type ApplyMapBattleStepStateParams = {
  session: any
  combatEnemyId: number
  prevPlayerPos: GridPos
  prevEnemyPos: GridPos
  setPlayerHP: Dispatch<SetStateAction<number>>
  setPlayerMP: Dispatch<SetStateAction<number>>
  setEnemyHP: Dispatch<SetStateAction<number>>
  setEnemyMaxHp: Dispatch<SetStateAction<number>>
  setBattlePlayerMaxHp: Dispatch<SetStateAction<number>>
  setPlayerPos: Dispatch<SetStateAction<GridPos>>
  setPlayerFacing: Dispatch<SetStateAction<any>>
  setEnemyFacings: Dispatch<SetStateAction<Record<number, any>>>
  setEnemyPositions: Dispatch<SetStateAction<Record<number, GridPos>>>
  setIsDefending: Dispatch<SetStateAction<boolean>>
  pushMoveFx: (item: { target: 'player' | 'enemy'; x: number; y: number }) => void
}

export function applyMapBattleStepState(params: ApplyMapBattleStepStateParams): void {
  const {
    session: s,
    combatEnemyId,
    prevPlayerPos,
    prevEnemyPos,
    setPlayerHP,
    setPlayerMP,
    setEnemyHP,
    setEnemyMaxHp,
    setBattlePlayerMaxHp,
    setPlayerPos,
    setPlayerFacing,
    setEnemyFacings,
    setEnemyPositions,
    setIsDefending,
    pushMoveFx,
  } = params

  setPlayerHP(s.left.resources.hp)
  setPlayerMP(s.left.resources.mp)
  setEnemyHP(s.right.resources.hp)
  setEnemyMaxHp(s.right.resources.maxHp)
  setBattlePlayerMaxHp(s.left.resources.maxHp)
  // Keep decimal coordinates during battle to avoid displacement being swallowed by integer grid rounding causing “seems not moving”.
  setPlayerPos({ x: s.left.position.x, y: s.left.position.y })
  if (s.phase === 'preparation') {
    setPlayerFacing(resolveDirectionByDelta(s.right.position.x - s.left.position.x, s.right.position.y - s.left.position.y))
    setEnemyFacings((prevFacing) => ({
      ...prevFacing,
      [combatEnemyId]: resolveDirectionByDelta(s.left.position.x - s.right.position.x, s.left.position.y - s.right.position.y),
    }))
  } else {
    const pdx = s.left.position.x - prevPlayerPos.x
    const pdy = s.left.position.y - prevPlayerPos.y
    if (pdx * pdx + pdy * pdy > 0.0001) {
      setPlayerFacing(resolveDirectionByDelta(pdx, pdy))
    }
  }
  setEnemyPositions((prev) => ({
    ...prev,
    [combatEnemyId]: { x: s.right.position.x, y: s.right.position.y },
  }))
  setIsDefending(!!s.left.defending)
  const playerMoveDist = Math.hypot(s.left.position.x - prevPlayerPos.x, s.left.position.y - prevPlayerPos.y)
  if (playerMoveDist > 0.22) {
    pushMoveFx({ target: 'player', x: s.left.position.x, y: s.left.position.y })
  }
  const enemyMoveDist = Math.hypot(s.right.position.x - prevEnemyPos.x, s.right.position.y - prevEnemyPos.y)
  if (enemyMoveDist > 0.22) {
    pushMoveFx({ target: 'enemy', x: s.right.position.x, y: s.right.position.y })
  }
}
