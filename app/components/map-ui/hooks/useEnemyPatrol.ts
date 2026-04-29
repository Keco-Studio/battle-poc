import { useEffect } from 'react'
import type { MutableRefObject } from 'react'
import type { Enemy } from '@/app/constants'
import { ROTATION_KEYS, resolveDirectionByDelta, type RotationKey } from '@/app/components/map-ui/gameMapUtils'

type GridPos = { x: number; y: number }

type UseEnemyPatrolParams = {
  enemies: Enemy[]
  showBattle: boolean
  isPVPMode: boolean
  combatEnemyId: number | null
  isWalkable: (x: number, y: number, actorOpts?: { ignoreEnemyIds?: number[] }) => boolean
  setEnemyPositions: (updater: (prev: Record<number, GridPos>) => Record<number, GridPos>) => void
  setEnemyFacings: (updater: (prev: Record<number, RotationKey>) => Record<number, RotationKey>) => void
  enemyTargetsRef: MutableRefObject<Record<number, GridPos>>
}

export function useEnemyPatrol({
  enemies,
  showBattle,
  isPVPMode,
  combatEnemyId,
  isWalkable,
  setEnemyPositions,
  setEnemyFacings,
  enemyTargetsRef,
}: UseEnemyPatrolParams): void {
  useEffect(() => {
    const initial: Record<number, GridPos> = {}
    const facings: Record<number, RotationKey> = {}
    enemies.forEach((e) => {
      initial[e.id] = { x: e.x, y: e.y }
      facings[e.id] = ROTATION_KEYS[Math.abs(e.id) % ROTATION_KEYS.length]
    })
    setEnemyPositions(() => initial)
    setEnemyFacings(() => facings)
    enemyTargetsRef.current = { ...initial }
  }, [enemies, enemyTargetsRef, setEnemyFacings, setEnemyPositions])

  useEffect(() => {
    const tickMs = 80
    const speedCellPerSec = 0.95
    const moveInterval = window.setInterval(() => {
      setEnemyPositions((prev) => {
        const next = { ...prev }
        const facingUpdates: Record<number, RotationKey> = {}
        const nextTargets = { ...enemyTargetsRef.current }

        enemies.forEach((enemy) => {
          if (showBattle && isPVPMode) return
          if (showBattle && combatEnemyId !== null && enemy.id === combatEnemyId) return

          const from = next[enemy.id] ?? { x: enemy.x, y: enemy.y }
          let target = nextTargets[enemy.id] ?? from

          let dx = target.x - from.x
          let dy = target.y - from.y
          let distance = Math.hypot(dx, dy)

          if (distance < 0.02) {
            const baseX = Math.round(from.x)
            const baseY = Math.round(from.y)
            const candidates = [
              { x: baseX + 1, y: baseY },
              { x: baseX - 1, y: baseY },
              { x: baseX, y: baseY + 1 },
              { x: baseX, y: baseY - 1 },
            ].filter((c) => isWalkable(c.x, c.y, { ignoreEnemyIds: [enemy.id] }))

            if (candidates.length > 0) {
              target = candidates[Math.floor(Math.random() * candidates.length)]
              nextTargets[enemy.id] = target
              dx = target.x - from.x
              dy = target.y - from.y
              distance = Math.hypot(dx, dy)
            }
          }

          if (distance <= 0) {
            next[enemy.id] = from
            return
          }

          const step = (speedCellPerSec * tickMs) / 1000
          const move = Math.min(step, distance)
          const nx = from.x + (dx / distance) * move
          const ny = from.y + (dy / distance) * move
          next[enemy.id] = { x: nx, y: ny }
          facingUpdates[enemy.id] = resolveDirectionByDelta(nx - from.x, ny - from.y)
        })

        if (Object.keys(facingUpdates).length > 0) {
          setEnemyFacings((prevFacing) => ({ ...prevFacing, ...facingUpdates }))
        }
        enemyTargetsRef.current = nextTargets
        return next
      })
    }, tickMs)

    return () => window.clearInterval(moveInterval)
  }, [combatEnemyId, enemies, enemyTargetsRef, isPVPMode, isWalkable, setEnemyFacings, setEnemyPositions, showBattle])
}
