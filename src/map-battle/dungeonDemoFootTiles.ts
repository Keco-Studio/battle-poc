/** 与 `data/maps` 中 `demo-tileset`（dungeon-tileset.png）配套：仅草地与路径类瓦块可落脚 */
export const DEMO_DUNGEON_TILESET_ID = 'demo-tileset'

export function isDemoDungeonFootWalkable(tileId: number): boolean {
  if (tileId <= 0) return true
  if (tileId >= 1 && tileId <= 7) return true
  if (tileId >= 9 && tileId <= 16) return true
  return false
}

/** 碰撞层 +（仅 demo tileset 时）装饰性地砖阻挡，与大地图 / 战斗内走位一致 */
export function isDemoDungeonCellWalkable(input: {
  x: number
  y: number
  mapW: number
  mapH: number
  collision: number[]
  ground: number[]
  tilesetId: string | null | undefined
}): boolean {
  const { x, y, mapW, mapH, collision, ground, tilesetId } = input
  if (x < 0 || y < 0 || x >= mapW || y >= mapH) return false
  const idx = y * mapW + x
  if (collision[idx] === 1) return false
  if (tilesetId === DEMO_DUNGEON_TILESET_ID && ground.length >= mapW * mapH) {
    if (!isDemoDungeonFootWalkable(ground[idx] ?? 0)) return false
  }
  return true
}

/** 出生点落在障碍/装饰格上时，吸附到最近的可走格 */
export function snapGridSpawnToWalkable(
  x: number,
  y: number,
  mapW: number,
  mapH: number,
  collision: number[],
  ground: number[],
  tilesetId: string | null | undefined,
): { x: number; y: number } {
  const cx = Math.max(0, Math.min(mapW - 1, Math.round(x)))
  const cy = Math.max(0, Math.min(mapH - 1, Math.round(y)))
  if (isDemoDungeonCellWalkable({ x: cx, y: cy, mapW, mapH, collision, ground, tilesetId })) {
    return { x: cx, y: cy }
  }
  const queue: Array<{ x: number; y: number }> = [{ x: cx, y: cy }]
  const visited = new Set<string>([`${cx},${cy}`])
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (isDemoDungeonCellWalkable({ x: cur.x, y: cur.y, mapW, mapH, collision, ground, tilesetId })) {
      return cur
    }
    for (const [dx, dy] of dirs) {
      const nx = cur.x + dx
      const ny = cur.y + dy
      if (nx < 0 || ny < 0 || nx >= mapW || ny >= mapH) continue
      const key = `${nx},${ny}`
      if (visited.has(key)) continue
      visited.add(key)
      queue.push({ x: nx, y: ny })
    }
  }
  return { x: cx, y: cy }
}
