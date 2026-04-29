import { useMemo } from 'react'

type UseMapUiMetricsParams = {
  playerLevel: number
  showBattle: boolean
  battlePlayerMaxHp: number
  totalPlayerMaxHp: number
  playerHP: number
  enemyMaxHp: number
  enemyHP: number
}

export function useMapUiMetrics({
  playerLevel,
  showBattle,
  battlePlayerMaxHp,
  totalPlayerMaxHp,
  playerHP,
  enemyMaxHp,
  enemyHP,
}: UseMapUiMetricsParams): {
  enemyLevelRangeMin: number
  enemyLevelRangeMax: number
  playerHpMaxForUi: number
  playerHpRatioForUi: number
  enemyHpMaxForUi: number
  enemyHpRatioForUi: number
} {
  return useMemo(() => {
    const enemyLevelRangeMin = Math.max(1, playerLevel - 2)
    const enemyLevelRangeMax = Math.max(1, playerLevel - 1)
    const playerHpMaxForUi = showBattle ? Math.max(1, battlePlayerMaxHp) : Math.max(1, totalPlayerMaxHp)
    const playerHpRatioForUi = Math.max(0, Math.min(100, (playerHP / playerHpMaxForUi) * 100))
    const enemyHpMaxForUi = Math.max(1, enemyMaxHp)
    const enemyHpRatioForUi = Math.max(0, Math.min(100, (enemyHP / enemyHpMaxForUi) * 100))

    return {
      enemyLevelRangeMin,
      enemyLevelRangeMax,
      playerHpMaxForUi,
      playerHpRatioForUi,
      enemyHpMaxForUi,
      enemyHpRatioForUi,
    }
  }, [battlePlayerMaxHp, enemyHP, enemyMaxHp, playerHP, playerLevel, showBattle, totalPlayerMaxHp])
}
