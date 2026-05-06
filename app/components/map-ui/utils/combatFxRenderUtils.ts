import type { CombatFxState } from '../hooks/useMapCombatFx'

export function getActiveCombatFx(fx: CombatFxState | null | undefined, nowMs: number): CombatFxState | null {
  if (!fx) return null
  return nowMs < fx.untilMs ? fx : null
}

export function isCombatActionAnim(fx: CombatFxState | null): boolean {
  return fx?.anim === 'attack' || fx?.anim === 'cast'
}

export function toCombatSpriteTransform(fx: CombatFxState | null, mapCellDisplayPx: number): string | undefined {
  if (!fx) return undefined
  return `translate(${(fx.offsetX * mapCellDisplayPx).toFixed(1)}px, ${(fx.offsetY * mapCellDisplayPx).toFixed(1)}px)`
}
