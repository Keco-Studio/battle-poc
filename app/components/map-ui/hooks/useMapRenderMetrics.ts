import { useCallback, useMemo } from 'react'

type ViewportSize = {
  width: number
  height: number
}

type UseMapRenderMetricsParams = {
  viewportSize: ViewportSize
  mapWidth: number
  mapHeight: number
}

export function useMapRenderMetrics({
  viewportSize,
  mapWidth,
  mapHeight,
}: UseMapRenderMetricsParams): {
  renderWidth: number
  renderHeight: number
  renderOffsetX: number
  renderOffsetY: number
  mapCellDisplayPx: number
  actorPx: number
  gridToScreen: (x: number, y: number) => { x: number; y: number }
} {
  const mapAspect = mapWidth / Math.max(1, mapHeight)
  const viewAspect = viewportSize.width / Math.max(1, viewportSize.height)
  const renderWidth =
    viewAspect > mapAspect ? Math.floor(viewportSize.height * mapAspect) : Math.floor(viewportSize.width)
  const renderHeight =
    viewAspect > mapAspect ? Math.floor(viewportSize.height) : Math.floor(viewportSize.width / mapAspect)
  const renderOffsetX = Math.max(0, Math.floor((viewportSize.width - renderWidth) / 2))
  const renderOffsetY = Math.max(0, Math.floor((viewportSize.height - renderHeight) / 2))

  const mapCellDisplayPx = useMemo(
    () => Math.min(renderWidth / Math.max(1, mapWidth), renderHeight / Math.max(1, mapHeight)) * 0.92,
    [mapHeight, mapWidth, renderHeight, renderWidth],
  )

  const actorPx = useMemo(() => Math.max(32, Math.round(mapCellDisplayPx * 1.5)), [mapCellDisplayPx])

  const gridToScreen = useCallback(
    (x: number, y: number) => ({
      x: renderOffsetX + ((x + 0.5) / mapWidth) * renderWidth,
      y: renderOffsetY + ((y + 0.5) / mapHeight) * renderHeight,
    }),
    [mapHeight, mapWidth, renderHeight, renderOffsetX, renderOffsetY, renderWidth],
  )

  return {
    renderWidth,
    renderHeight,
    renderOffsetX,
    renderOffsetY,
    mapCellDisplayPx,
    actorPx,
    gridToScreen,
  }
}
