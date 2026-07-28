import type { ProjectileKind } from '../skillFxProfile'

type GridPos = { x: number; y: number }

export function buildProjectileFxInput(input: {
  kind: ProjectileKind
  from: 'player' | 'enemy'
  actorPos: GridPos
  targetPos: GridPos
  durationMs: number
  assetUrl?: string | null
}): {
  kind: ProjectileKind
  from: 'player' | 'enemy'
  startX: number
  startY: number
  deltaX: number
  deltaY: number
  durationMs: number
  assetUrl?: string | null
} {
  const { kind, from, actorPos, targetPos, durationMs, assetUrl } = input
  return {
    kind,
    from,
    startX: actorPos.x,
    startY: actorPos.y,
    deltaX: targetPos.x - actorPos.x,
    deltaY: targetPos.y - actorPos.y,
    durationMs,
    assetUrl,
  }
}
