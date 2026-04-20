import { describe, expect, it } from 'vitest'
import {
  DEMO_DUNGEON_TILESET_ID,
  isDemoDungeonCellWalkable,
  isDemoDungeonFootWalkable,
  snapGridSpawnToWalkable,
} from '../src/map-battle/dungeonDemoFootTiles'

describe('dungeonDemoFootTiles', () => {
  it('treats tall grass / decor tiles as not foot-walkable', () => {
    expect(isDemoDungeonFootWalkable(1)).toBe(true)
    expect(isDemoDungeonFootWalkable(9)).toBe(true)
    expect(isDemoDungeonFootWalkable(40)).toBe(false)
    expect(isDemoDungeonFootWalkable(48)).toBe(false)
    expect(isDemoDungeonFootWalkable(8)).toBe(false)
  })

  it('combines collision with foot rules for demo tileset', () => {
    const mapW = 3
    const mapH = 1
    const collision = [0, 0, 0]
    const ground = [1, 40, 9]
    expect(
      isDemoDungeonCellWalkable({
        x: 0,
        y: 0,
        mapW,
        mapH,
        collision,
        ground,
        tilesetId: DEMO_DUNGEON_TILESET_ID,
      }),
    ).toBe(true)
    expect(
      isDemoDungeonCellWalkable({
        x: 1,
        y: 0,
        mapW,
        mapH,
        collision,
        ground,
        tilesetId: DEMO_DUNGEON_TILESET_ID,
      }),
    ).toBe(false)
    expect(
      isDemoDungeonCellWalkable({
        x: 2,
        y: 0,
        mapW,
        mapH,
        collision,
        ground,
        tilesetId: DEMO_DUNGEON_TILESET_ID,
      }),
    ).toBe(true)
  })

  it('ignores foot rules for non-demo tileset id', () => {
    expect(
      isDemoDungeonCellWalkable({
        x: 1,
        y: 0,
        mapW: 3,
        mapH: 1,
        collision: [0, 0, 0],
        ground: [1, 40, 9],
        tilesetId: 'other-tileset',
      }),
    ).toBe(true)
  })

  it('snapGridSpawnToWalkable moves off a blocked decor cell', () => {
    const mapW = 3
    const mapH = 1
    const collision = [0, 0, 0]
    const ground = [1, 40, 1]
    const p = snapGridSpawnToWalkable(1, 0, mapW, mapH, collision, ground, DEMO_DUNGEON_TILESET_ID)
    expect(p).toEqual({ x: 0, y: 0 })
  })
})
