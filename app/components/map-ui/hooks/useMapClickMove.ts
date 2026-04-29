import { useCallback } from 'react'
import { resolveDirectionByDelta, type RotationKey } from '@/app/components/map-ui/gameMapUtils'

type GridPos = { x: number; y: number }

type UseMapClickMoveParams = {
  showBattle: boolean
  renderOffsetX: number
  renderOffsetY: number
  renderWidth: number
  renderHeight: number
  mapWidth: number
  mapHeight: number
  playerPos: GridPos
  isWalkable: (x: number, y: number) => boolean
  setPlayerFacing: (facing: RotationKey) => void
  setPlayerPos: (pos: GridPos) => void
}

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
      const x = Math.min(mapWidth - 1, Math.max(0, Math.floor(px * mapWidth)))
      const y = Math.min(mapHeight - 1, Math.max(0, Math.floor(py * mapHeight)))
      if (!isWalkable(x, y)) return
      setPlayerFacing(resolveDirectionByDelta(x - playerPos.x, y - playerPos.y))
      setPlayerPos({ x, y })
    },
    [
      isWalkable,
      mapHeight,
      mapWidth,
      playerPos.x,
      playerPos.y,
      renderHeight,
      renderOffsetX,
      renderOffsetY,
      renderWidth,
      setPlayerFacing,
      setPlayerPos,
      showBattle,
    ],
  )
}
