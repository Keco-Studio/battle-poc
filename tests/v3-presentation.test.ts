import { describe, expect, it } from 'vitest'

import {
  V3_EXPLORE_MOVE_SPEED,
  V3_BATTLE_LAYOUT,
  V3_EXPLORE_LAYOUT,
  animationKeysFor,
  cameraFrameFor,
  directionFromDelta,
  directionFromPath,
  gridPointToWorld,
  worldPointToGrid,
} from '@/src/v3/presentation/viewModel'
import { buildV3AssetCatalog } from '@/src/v3/presentation/assetLoader'

describe('V3 presentation contracts', () => {
  it('keeps one-tile exploration movement long enough to show several walk poses', () => {
    expect(V3_EXPLORE_MOVE_SPEED).toBeLessThanOrEqual(170)
    expect((V3_EXPLORE_LAYOUT.width / V3_EXPLORE_LAYOUT.columns) / V3_EXPLORE_MOVE_SPEED).toBeGreaterThanOrEqual(0.235)
  })

  it('maps all eight directions to eight-frame Phaser animation keys', () => {
    expect(animationKeysFor('astra')).toEqual([
      'astra-move-n',
      'astra-move-ne',
      'astra-move-e',
      'astra-move-se',
      'astra-move-s',
      'astra-move-sw',
      'astra-move-w',
      'astra-move-nw',
    ])
  })

  it('maps grid centers to the fixed exploration and battle layouts', () => {
    expect(gridPointToWorld({ x: 0, y: 0 }, V3_EXPLORE_LAYOUT)).toEqual({ x: 20, y: 18 })
    expect(gridPointToWorld({ x: 15, y: 15 }, V3_BATTLE_LAYOUT)).toEqual({ x: 977.5, y: 697.5 })
  })

  it('clamps pointer positions to a legal grid tile', () => {
    expect(worldPointToGrid({ x: -20, y: 900 }, V3_EXPLORE_LAYOUT)).toEqual({ x: 0, y: 19 })
    expect(worldPointToGrid({ x: 9999, y: -1 }, V3_BATTLE_LAYOUT)).toEqual({ x: 15, y: 0 })
  })

  it('chooses stable eight-way facing from movement deltas', () => {
    expect(directionFromDelta(1, -1)).toBe('ne')
    expect(directionFromDelta(-4, 0)).toBe('w')
    expect(directionFromDelta(0, 0, 'se')).toBe('se')
  })

  it('uses the final path segment to drive a directional animation', () => {
    expect(directionFromPath([{ x: 2, y: 8 }, { x: 2, y: 9 }], 'e')).toBe('s')
    expect(directionFromPath([{ x: 4, y: 4 }], 'nw')).toBe('nw')
  })

  it('builds a manifest-driven catalog with every map, character, and skill effect', () => {
    const catalog = buildV3AssetCatalog()
    expect(catalog.maps).toHaveLength(3)
    expect(catalog.characters).toHaveLength(5)
    expect(catalog.skills).toHaveLength(8)
    expect(catalog.characters[0].directions).toHaveLength(8)
    expect(catalog.characters[0].directions.every((direction) => direction.frameCount === 8)).toBe(true)
    expect(catalog.skills.every((skill) => skill.frameCount === 8)).toBe(true)
  })

  it('centers and contains the complete battle arena on a mobile canvas', () => {
    expect(cameraFrameFor(V3_BATTLE_LAYOUT, { width: 390, height: 435 }, 'contain')).toEqual({
      centerX: 640,
      centerY: 360,
      zoom: 390 / 720,
    })
  })
})
