import { describe, expect, it } from 'vitest'

import {
  V3_BATTLE_LAYOUT,
  V3_EXPLORE_LAYOUT,
  animationKeysFor,
  directionFromDelta,
  gridPointToWorld,
  worldPointToGrid,
} from '@/src/v3/presentation/viewModel'
import { buildV3AssetCatalog } from '@/src/v3/presentation/assetLoader'

describe('V3 presentation contracts', () => {
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

  it('builds a manifest-driven catalog with every map, character, and skill effect', () => {
    const catalog = buildV3AssetCatalog()
    expect(catalog.maps).toHaveLength(3)
    expect(catalog.characters).toHaveLength(5)
    expect(catalog.skills).toHaveLength(8)
    expect(catalog.characters[0].directions).toHaveLength(8)
    expect(catalog.characters[0].directions.every((direction) => direction.frameCount === 8)).toBe(true)
    expect(catalog.skills.every((skill) => skill.frameCount === 8)).toBe(true)
  })
})
