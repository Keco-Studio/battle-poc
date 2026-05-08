import { describe, expect, test } from 'vitest'
import { buildProjectileFxInput } from '../app/components/map-ui/utils/projectileFxUtils'

describe('projectileFxUtils', () => {
  test('buildProjectileFxInput maps positions to start and delta', () => {
    const out = buildProjectileFxInput({
      kind: 'fireball',
      from: 'player',
      actorPos: { x: 2, y: 3 },
      targetPos: { x: 7, y: 1 },
      durationMs: 320,
    })
    expect(out).toEqual({
      kind: 'fireball',
      from: 'player',
      startX: 2,
      startY: 3,
      deltaX: 5,
      deltaY: -2,
      durationMs: 320,
    })
  })
})
