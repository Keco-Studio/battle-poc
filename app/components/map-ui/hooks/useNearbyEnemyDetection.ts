import { useEffect } from 'react'
import type { Enemy } from '@/app/constants'

type GridPos = { x: number; y: number }

type UseNearbyEnemyDetectionParams = {
  showBattle: boolean
  enemies: Enemy[]
  enemyPositions: Record<number, GridPos>
  playerPos: GridPos
  interactionRange: number
  setNearbyEnemy: (enemy: Enemy | null) => void
  setShowInteraction: (show: boolean) => void
}

export function useNearbyEnemyDetection({
  showBattle,
  enemies,
  enemyPositions,
  playerPos,
  interactionRange,
  setNearbyEnemy,
  setShowInteraction,
}: UseNearbyEnemyDetectionParams): void {
  useEffect(() => {
    // During battle, nearby enemy is controlled by battle start snapshot.
    if (showBattle) return
    const found = enemies.find((enemy) => {
      const pos = enemyPositions[enemy.id] || { x: enemy.x, y: enemy.y }
      const dx = pos.x - playerPos.x
      const dy = pos.y - playerPos.y
      return Math.sqrt(dx * dx + dy * dy) < interactionRange
    })
    setNearbyEnemy(found || null)
    setShowInteraction(Boolean(found))
  }, [playerPos, enemies, enemyPositions, setNearbyEnemy, setShowInteraction, showBattle, interactionRange])
}
