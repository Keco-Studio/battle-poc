import { describe, expect, it } from 'vitest'
import { findShortestGridPath4 } from '../app/components/map-ui/utils/gridPathfinding'

describe('findShortestGridPath4', () => {
  it('returns single cell when start equals goal', () => {
    const w = 5
    const h = 5
    const walkable = (_x: number, _y: number) => true
    const path = findShortestGridPath4({
      start: { x: 2, y: 2 },
      goal: { x: 2, y: 2 },
      mapWidth: w,
      mapHeight: h,
      isWalkable: walkable,
    })
    expect(path).toEqual([{ x: 2, y: 2 }])
  })

  it('finds L-shaped path around obstacle', () => {
    const W = 5
    const H = 3
    const blocked = new Set(['1,1', '2,1', '3,1'])
    const isWalkable = (x: number, y: number) => !blocked.has(`${x},${y}`)
    const path = findShortestGridPath4({
      start: { x: 0, y: 1 },
      goal: { x: 4, y: 1 },
      mapWidth: W,
      mapHeight: H,
      isWalkable,
    })
    expect(path).not.toBeNull()
    expect(path!.length).toBeGreaterThan(3)
    expect(path![0]).toEqual({ x: 0, y: 1 })
    expect(path![path!.length - 1]).toEqual({ x: 4, y: 1 })
    for (const c of path!) {
      expect(isWalkable(c.x, c.y)).toBe(true)
    }
    for (let i = 1; i < path!.length; i++) {
      const a = path![i - 1]
      const b = path![i]
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1)
    }
  })

  it('returns null when goal is blocked', () => {
    const path = findShortestGridPath4({
      start: { x: 0, y: 0 },
      goal: { x: 1, y: 0 },
      mapWidth: 3,
      mapHeight: 3,
      isWalkable: () => false,
    })
    expect(path).toBeNull()
  })

  it('returns null when no route exists', () => {
    const path = findShortestGridPath4({
      start: { x: 0, y: 0 },
      goal: { x: 2, y: 0 },
      mapWidth: 3,
      mapHeight: 1,
      isWalkable: (x) => x !== 1,
    })
    expect(path).toBeNull()
  })
})
