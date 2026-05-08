import { useCallback, useEffect, useRef } from 'react'
import { findShortestGridPath4 } from '@/app/components/map-ui/utils/gridPathfinding'
import { resolveDirectionByDelta, type RotationKey } from '@/app/components/map-ui/gameMapUtils'

type GridPos = { x: number; y: number }

type WalkOpts = { ignorePlayerOnCell?: { x: number; y: number } }

type UseMapClickMoveParams = {
  showBattle: boolean
  renderOffsetX: number
  renderOffsetY: number
  renderWidth: number
  renderHeight: number
  mapWidth: number
  mapHeight: number
  playerPos: GridPos
  /** Same as GameMap `isWalkable` — must accept optional opts so pathfinding can ignore the actor on the start cell. */
  isWalkable: (x: number, y: number, actorOpts?: WalkOpts) => boolean
  setPlayerFacing: (facing: RotationKey) => void
  setPlayerPos: (pos: GridPos) => void
}

const STEP_MS = 90

export function useMapClickMove({
  showBattle,
  renderOffsetX,
  renderOffsetY,
  renderWidth,
  renderHeight,
  mapWidth,
  mapHeight,
  playerPos,
  isWalkable,
  setPlayerFacing,
  setPlayerPos,
}: UseMapClickMoveParams): (e: React.MouseEvent<HTMLDivElement>) => void {
  const pathQueueRef = useRef<GridPos[]>([])
  /** Grid cell we treat as current while executing click-path (sync; avoids stale React state between intervals). */
  const pathCursorRef = useRef<GridPos | null>(null)
  const playerPosRef = useRef(playerPos)
  playerPosRef.current = playerPos
  const isWalkableRef = useRef(isWalkable)
  isWalkableRef.current = isWalkable

  useEffect(() => {
    const CONTROL_KEYS = new Set([
      'w',
      'a',
      's',
      'd',
      'arrowup',
      'arrowdown',
      'arrowleft',
      'arrowright',
    ])
    const CODE_TO_KEY: Record<string, string> = {
      keyw: 'w',
      keya: 'a',
      keys: 's',
      keyd: 'd',
      arrowup: 'arrowup',
      arrowdown: 'arrowdown',
      arrowleft: 'arrowleft',
      arrowright: 'arrowright',
    }
    const resolveControlKey = (e: KeyboardEvent): string => {
      const key = typeof e.key === 'string' ? e.key.toLowerCase() : ''
      if (CONTROL_KEYS.has(key)) return key
      const code = typeof e.code === 'string' ? e.code.toLowerCase() : ''
      return CODE_TO_KEY[code] ?? ''
    }
    const clearPathOnMoveKey = (e: KeyboardEvent) => {
      if (!resolveControlKey(e)) return
      pathQueueRef.current = []
      pathCursorRef.current = null
    }
    window.addEventListener('keydown', clearPathOnMoveKey, { capture: true })
    return () => window.removeEventListener('keydown', clearPathOnMoveKey, { capture: true })
  }, [])

  useEffect(() => {
    if (showBattle) {
      pathQueueRef.current = []
      pathCursorRef.current = null
      return
    }

    const tick = () => {
      const queue = pathQueueRef.current
      if (queue.length === 0) {
        pathCursorRef.current = null
        return
      }

      const cur =
        pathCursorRef.current ?? {
          x: Math.floor(playerPosRef.current.x),
          y: Math.floor(playerPosRef.current.y),
        }
      const next = queue[0]

      const dx = next.x - cur.x
      const dy = next.y - cur.y
      if (Math.abs(dx) + Math.abs(dy) !== 1) {
        pathQueueRef.current = []
        pathCursorRef.current = null
        return
      }

      if (!isWalkableRef.current(next.x, next.y)) {
        pathQueueRef.current = []
        pathCursorRef.current = null
        return
      }

      pathCursorRef.current = next
      setPlayerFacing(resolveDirectionByDelta(dx, dy))
      setPlayerPos({ x: next.x, y: next.y })
      queue.shift()
    }

    const id = window.setInterval(tick, STEP_MS)
    return () => window.clearInterval(id)
  }, [setPlayerFacing, setPlayerPos, showBattle])

  return useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (showBattle) return
      const rect = e.currentTarget.getBoundingClientRect()
      const localX = e.clientX - rect.left
      const localY = e.clientY - rect.top
      if (
        localX < renderOffsetX ||
        localY < renderOffsetY ||
        localX > renderOffsetX + renderWidth ||
        localY > renderOffsetY + renderHeight
      ) {
        return
      }
      const px = (localX - renderOffsetX) / Math.max(1, renderWidth)
      const py = (localY - renderOffsetY) / Math.max(1, renderHeight)
      const gx = Math.min(mapWidth - 1, Math.max(0, Math.floor(px * mapWidth)))
      const gy = Math.min(mapHeight - 1, Math.max(0, Math.floor(py * mapHeight)))

      const p = playerPosRef.current
      // Align with GameMap collision: player occupancy uses Math.round; start cell must be walkable in BFS.
      const sx = Math.round(p.x)
      const sy = Math.round(p.y)

      const walkForPath = (x: number, y: number) =>
        isWalkable(x, y, { ignorePlayerOnCell: { x: p.x, y: p.y } })

      const fullPath = findShortestGridPath4({
        start: { x: sx, y: sy },
        goal: { x: gx, y: gy },
        mapWidth,
        mapHeight,
        isWalkable: walkForPath,
      })
      if (!fullPath || fullPath.length < 2) return

      pathCursorRef.current = { x: fullPath[0].x, y: fullPath[0].y }
      pathQueueRef.current = fullPath.slice(1)
    },
    [
      isWalkable,
      mapHeight,
      mapWidth,
      renderHeight,
      renderOffsetX,
      renderOffsetY,
      renderWidth,
      showBattle,
    ],
  )
}
