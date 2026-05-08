import { describe, expect, test } from 'vitest'
import { computeCombatFacingUpdate } from '../app/components/map-ui/utils/combatEventFacingUtils'

describe('computeCombatFacingUpdate', () => {
  test('maps actor/target identity flags correctly', () => {
    const result = computeCombatFacingUpdate({
      actorId: 'left',
      targetId: 'right',
      leftId: 'left',
      rightId: 'right',
      actorPos: { x: 1, y: 1 },
      targetPos: { x: 2, y: 1 },
    })
    expect(result.actorIsPlayer).toBe(true)
    expect(result.actorIsEnemy).toBe(false)
    expect(result.targetIsPlayer).toBe(false)
    expect(result.targetIsEnemy).toBe(true)
    expect(result.actorFacing).toBe('east')
    expect(result.targetFacing).toBe('west')
  })
})
