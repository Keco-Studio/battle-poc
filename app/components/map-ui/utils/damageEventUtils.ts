type DamageSide = 'player' | 'enemy' | null

export function resolveDamageUiSide(targetId: string, rightEntityId: string): DamageSide {
  if (targetId === 'poc-player') return 'player'
  if (targetId === rightEntityId) return 'enemy'
  return null
}

export function buildDamageLogLine(side: DamageSide, damage: number): string | null {
  if (side === 'player') return `Took ${damage} damage`
  if (side === 'enemy') return `Dealt ${damage} damage`
  return null
}

export function buildDamageFloatText(side: DamageSide, damage: number, offsetX: number):
  | { target: 'player' | 'enemy'; text: string; variant: 'damage'; offsetX: number }
  | null {
  if (!side || damage <= 0) return null
  return {
    target: side,
    text: `-${damage}`,
    variant: 'damage',
    offsetX,
  }
}
