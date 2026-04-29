import { useCallback } from 'react'
import type { Enemy } from '@/app/constants'

type UseEnemyInfoInteractionParams = {
  showBattle: boolean
  setNearbyEnemy: (enemy: Enemy | null) => void
  setShowEnemyInfo: (show: boolean) => void
}

export function useEnemyInfoInteraction({
  showBattle,
  setNearbyEnemy,
  setShowEnemyInfo,
}: UseEnemyInfoInteractionParams): {
  handleEnemyMarkerClick: (enemy: Enemy) => (event: React.MouseEvent<HTMLDivElement>) => void
  handleEnemyMarkerKeyDown: (enemy: Enemy) => (event: React.KeyboardEvent<HTMLDivElement>) => void
} {
  const openEnemyInfo = useCallback(
    (enemy: Enemy) => {
      if (showBattle) return
      setNearbyEnemy(enemy)
      setShowEnemyInfo(true)
    },
    [setNearbyEnemy, setShowEnemyInfo, showBattle],
  )

  const handleEnemyMarkerClick = useCallback(
    (enemy: Enemy) => (event: React.MouseEvent<HTMLDivElement>) => {
      event.stopPropagation()
      openEnemyInfo(enemy)
    },
    [openEnemyInfo],
  )

  const handleEnemyMarkerKeyDown = useCallback(
    (enemy: Enemy) => (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      openEnemyInfo(enemy)
    },
    [openEnemyInfo],
  )

  return { handleEnemyMarkerClick, handleEnemyMarkerKeyDown }
}
