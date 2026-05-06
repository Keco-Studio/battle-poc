import { resolveDirectionByDelta, type RotationKey } from '../gameMapUtils'

type GridPos = { x: number; y: number }

export type FacingUpdateResult = {
  actorFacing: RotationKey
  targetFacing: RotationKey
  actorIsPlayer: boolean
  actorIsEnemy: boolean
  targetIsPlayer: boolean
  targetIsEnemy: boolean
}

export function computeCombatFacingUpdate(input: {
  actorId: string
  targetId: string
  leftId: string
  rightId: string
  actorPos: GridPos
  targetPos: GridPos
}): FacingUpdateResult {
  const { actorId, targetId, leftId, rightId, actorPos, targetPos } = input
  return {
    actorFacing: resolveDirectionByDelta(targetPos.x - actorPos.x, targetPos.y - actorPos.y),
    targetFacing: resolveDirectionByDelta(actorPos.x - targetPos.x, actorPos.y - targetPos.y),
    actorIsPlayer: actorId === leftId,
    actorIsEnemy: actorId === rightId,
    targetIsPlayer: targetId === leftId,
    targetIsEnemy: targetId === rightId,
  }
}
