import type { CombatAnim } from '../hooks/useMapCombatFx'

type GridPos = { x: number; y: number }

export function resolveActorCombatAnim(action: string): CombatAnim | null {
  if (action === 'basic_attack') return 'attack'
  if (action === 'cast_skill') return 'cast'
  return null
}

export function toTowardVector(actorPos: GridPos, targetPos: GridPos): { x: number; y: number } {
  return {
    x: targetPos.x - actorPos.x,
    y: targetPos.y - actorPos.y,
  }
}

export function toHitFromVector(actorPos: GridPos, targetPos: GridPos): { x: number; y: number } {
  return {
    x: targetPos.x - actorPos.x,
    y: targetPos.y - actorPos.y,
  }
}
