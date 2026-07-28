import { describe, expect, it } from 'vitest'
import { resolveInitialMapPosition } from '@/src/lib/maps/saved-map-position'

describe('resolveInitialMapPosition', () => {
  it('keeps a valid saved position when hydrating the same map', () => {
    expect(resolveInitialMapPosition({
      selectedRef: 'builtin:a',
      savedRef: 'builtin:a',
      savedPosition: { x: 4.25, y: 5 },
      spawn: { x: 1, y: 1 },
      width: 8,
      height: 8,
      isWalkable: () => true,
    })).toEqual({ x: 4.25, y: 5 })
  })

  it('uses spawn when selecting a different map', () => {
    expect(resolveInitialMapPosition({
      selectedRef: 'builtin:b',
      savedRef: 'builtin:a',
      savedPosition: { x: 4, y: 5 },
      spawn: { x: 2, y: 3 },
      width: 8,
      height: 8,
      isWalkable: () => true,
    })).toEqual({ x: 2, y: 3 })
  })

  it('moves an invalid spawn to the nearest walkable grid cell', () => {
    expect(resolveInitialMapPosition({
      selectedRef: 'builtin:a',
      savedRef: 'builtin:a',
      savedPosition: { x: 99, y: 99 },
      spawn: { x: 1, y: 1 },
      width: 4,
      height: 4,
      isWalkable: (x, y) => x === 2 && y === 1,
    })).toEqual({ x: 2, y: 1 })
  })
})
