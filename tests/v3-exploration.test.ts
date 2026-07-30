import { describe, expect, it } from 'vitest'

import {
  commitTravelArrival,
  planStepTravel,
  planTravel,
  type V3TravelState,
} from '@/src/v3/runtime/exploration'

describe('V3 exploration travel', () => {
  it('commits only the next arrived cell and ignores duplicate arrival', () => {
    const planned = planTravel(
      { committed: { x: 3, y: 16 }, route: [], requestId: 0 },
      { x: 6, y: 16 },
      { width: 32, height: 20 },
    )

    expect(planned.route).toEqual([{ x: 4, y: 16 }, { x: 5, y: 16 }, { x: 6, y: 16 }])
    const once = commitTravelArrival(planned, planned.requestId, { x: 4, y: 16 })
    expect(once.committed).toEqual({ x: 4, y: 16 })
    expect(once.route).toEqual([{ x: 5, y: 16 }, { x: 6, y: 16 }])
    expect(commitTravelArrival(once, planned.requestId, { x: 4, y: 16 })).toBe(once)
  })

  it('routes around blocked cells and leaves unreachable state unchanged', () => {
    const state: V3TravelState = { committed: { x: 0, y: 0 }, route: [], requestId: 0 }

    expect(planTravel(state, { x: 2, y: 0 }, { width: 3, height: 2 }, [{ x: 1, y: 0 }]).route)
      .toEqual([{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 0 }])
    expect(planTravel(state, { x: 2, y: 0 }, { width: 3, height: 1 }, [{ x: 1, y: 0 }])).toBe(state)
  })

  it('keeps eight-way directional input as one adjacent travel leg', () => {
    const state: V3TravelState = { committed: { x: 3, y: 16 }, route: [], requestId: 4 }

    expect(planStepTravel(state, { x: 1, y: -1 }, { width: 32, height: 20 })).toEqual({
      committed: { x: 3, y: 16 },
      route: [{ x: 4, y: 15 }],
      requestId: 5,
    })
  })

  it('replans from the current leg destination when travel is already in flight', () => {
    const state: V3TravelState = {
      committed: { x: 3, y: 16 },
      route: [{ x: 4, y: 16 }, { x: 5, y: 16 }],
      requestId: 2,
    }

    const replanned = planTravel(state, { x: 4, y: 14 }, { width: 32, height: 20 })
    expect(replanned.committed).toEqual({ x: 3, y: 16 })
    expect(replanned.route).toEqual([{ x: 4, y: 16 }, { x: 4, y: 15 }, { x: 4, y: 14 }])
    expect(replanned.requestId).toBe(3)
  })

  it('ignores stale, skipped, and mismatched arrivals', () => {
    const state: V3TravelState = {
      committed: { x: 3, y: 16 },
      route: [{ x: 4, y: 16 }, { x: 5, y: 16 }],
      requestId: 8,
    }

    expect(commitTravelArrival(state, 7, { x: 4, y: 16 })).toBe(state)
    expect(commitTravelArrival(state, 8, { x: 5, y: 16 })).toBe(state)
    expect(commitTravelArrival(state, 8, { x: 4, y: 15 })).toBe(state)
  })
})
