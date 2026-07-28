type GridPosition = { x: number; y: number }

type ResolveInitialMapPositionInput = {
  selectedRef: string
  savedRef: string | null | undefined
  savedPosition: GridPosition | null | undefined
  spawn: GridPosition
  width: number
  height: number
  isWalkable: (x: number, y: number) => boolean
}

function isValidPosition(
  position: GridPosition | null | undefined,
  width: number,
  height: number,
  isWalkable: (x: number, y: number) => boolean,
): position is GridPosition {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return false
  if (position.x < 0 || position.y < 0 || position.x >= width || position.y >= height) return false
  return isWalkable(Math.round(position.x), Math.round(position.y))
}

function nearestWalkable(
  spawn: GridPosition,
  width: number,
  height: number,
  isWalkable: (x: number, y: number) => boolean,
): GridPosition {
  const start = {
    x: Math.max(0, Math.min(width - 1, Math.round(spawn.x))),
    y: Math.max(0, Math.min(height - 1, Math.round(spawn.y))),
  }
  const queue = [start]
  const seen = new Set([`${start.x},${start.y}`])
  const directions = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (isWalkable(current.x, current.y)) return current
    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y }
      if (next.x < 0 || next.y < 0 || next.x >= width || next.y >= height) continue
      const key = `${next.x},${next.y}`
      if (seen.has(key)) continue
      seen.add(key)
      queue.push(next)
    }
  }

  return start
}

export function resolveInitialMapPosition(
  input: ResolveInitialMapPositionInput,
): GridPosition {
  if (
    input.selectedRef === input.savedRef &&
    isValidPosition(input.savedPosition, input.width, input.height, input.isWalkable)
  ) {
    return { ...input.savedPosition }
  }
  return nearestWalkable(
    input.spawn,
    input.width,
    input.height,
    input.isWalkable,
  )
}

