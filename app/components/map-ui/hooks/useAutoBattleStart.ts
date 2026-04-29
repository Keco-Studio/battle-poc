import { useEffect } from 'react'
import type { Enemy } from '@/app/constants'

type GridPos = { x: number; y: number }

type UseAutoBattleStartParams = {
  automationTask: unknown
  showBattle: boolean
  nearbyEnemy: Enemy | null
  enemyPositions: Record<number, GridPos>
  playerPos: GridPos
  startBattle: (anchor: { player: GridPos; enemy: GridPos }) => void
}

export function useAutoBattleStart({
  automationTask,
  showBattle,
  nearbyEnemy,
  enemyPositions,
  playerPos,
  startBattle,
}: UseAutoBattleStartParams): void {
  useEffect(() => {
    if (!automationTask) return
    if (showBattle) return
    if (!nearbyEnemy) return
    const ep = enemyPositions[nearbyEnemy.id] || { x: nearbyEnemy.x, y: nearbyEnemy.y }
    startBattle({ player: { ...playerPos }, enemy: { ...ep } })
  }, [automationTask, showBattle, nearbyEnemy, enemyPositions, playerPos, startBattle])
}
