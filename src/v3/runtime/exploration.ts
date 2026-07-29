import type { V3Point } from '@/src/content/generated/v3'

export type V3TravelState = {
  committed: V3Point
  route: V3Point[]
  requestId: number
}

type V3TravelBounds = { width: number; height: number }

const CARDINAL_NEIGHBORS: readonly V3Point[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]

function pointKey(point: V3Point): string {
  return `${point.x},${point.y}`
}

function samePoint(left: V3Point, right: V3Point): boolean {
  return left.x === right.x && left.y === right.y
}

function inBounds(point: V3Point, bounds: V3TravelBounds): boolean {
  return point.x >= 0 && point.x < bounds.width && point.y >= 0 && point.y < bounds.height
}

function travelAnchor(state: V3TravelState): V3Point {
  return state.route[0] ?? state.committed
}

export function planTravel(
  state: V3TravelState,
  target: V3Point,
  bounds: V3TravelBounds,
  blocked: readonly V3Point[] = [],
): V3TravelState {
  const anchor = travelAnchor(state)
  const blockedKeys = new Set(blocked.map(pointKey))
  if (!inBounds(target, bounds) || blockedKeys.has(pointKey(target))) return state
  if (samePoint(anchor, target)) {
    if (state.route.length === 0) return state
    return { ...state, route: [{ ...anchor }], requestId: state.requestId + 1 }
  }

  const queue: V3Point[] = [{ ...anchor }]
  const previous = new Map<string, V3Point | null>([[pointKey(anchor), null]])
  let cursor = 0

  while (cursor < queue.length) {
    const current = queue[cursor++]
    if (samePoint(current, target)) break
    for (const delta of CARDINAL_NEIGHBORS) {
      const next = { x: current.x + delta.x, y: current.y + delta.y }
      const key = pointKey(next)
      if (!inBounds(next, bounds) || blockedKeys.has(key) || previous.has(key)) continue
      previous.set(key, current)
      queue.push(next)
    }
  }

  if (!previous.has(pointKey(target))) return state
  const path: V3Point[] = []
  let step = target
  while (!samePoint(step, anchor)) {
    path.push(step)
    const prior = previous.get(pointKey(step))
    if (!prior) return state
    step = prior
  }
  path.reverse()

  return {
    committed: state.committed,
    route: state.route.length > 0 ? [{ ...anchor }, ...path] : path,
    requestId: state.requestId + 1,
  }
}

export function planStepTravel(
  state: V3TravelState,
  delta: V3Point,
  bounds: V3TravelBounds,
  blocked: readonly V3Point[] = [],
): V3TravelState {
  const anchor = travelAnchor(state)
  const target = { x: anchor.x + Math.sign(delta.x), y: anchor.y + Math.sign(delta.y) }
  if (samePoint(anchor, target) || !inBounds(target, bounds)) return state
  if (blocked.some((point) => samePoint(point, target))) return state
  return {
    committed: state.committed,
    route: state.route.length > 0 ? [{ ...anchor }, target] : [target],
    requestId: state.requestId + 1,
  }
}

export function commitTravelArrival(
  state: V3TravelState,
  requestId: number,
  arrived: V3Point,
): V3TravelState {
  const next = state.route[0]
  if (requestId !== state.requestId || !next || !samePoint(next, arrived)) return state
  const deltaX = Math.abs(arrived.x - state.committed.x)
  const deltaY = Math.abs(arrived.y - state.committed.y)
  if (Math.max(deltaX, deltaY) !== 1) return state
  return {
    committed: { ...arrived },
    route: state.route.slice(1),
    requestId: state.requestId,
  }
}
