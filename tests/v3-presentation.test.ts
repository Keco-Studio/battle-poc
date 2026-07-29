import { readFile } from 'node:fs/promises'
import path from 'node:path'
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
import { playerEventText, playerNodeText } from '@/src/v3/presentation/playerText'
import { createBattle } from '@/src/v3/runtime'

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

  it('maps gameplay facing to the opposite PixelLab camera-bearing sheet', () => {
    const astra = buildV3AssetCatalog().characters.find((character) => character.id === 'astra_vanguard')
    expect(astra?.directions.map(({ direction, path }) => [direction, path])).toEqual([
      ['n', '/assets/v3/characters/astra-vanguard/move/s/sheet.png'],
      ['ne', '/assets/v3/characters/astra-vanguard/move/sw/sheet.png'],
      ['e', '/assets/v3/characters/astra-vanguard/move/w/sheet.png'],
      ['se', '/assets/v3/characters/astra-vanguard/move/nw/sheet.png'],
      ['s', '/assets/v3/characters/astra-vanguard/move/n/sheet.png'],
      ['sw', '/assets/v3/characters/astra-vanguard/move/ne/sheet.png'],
      ['w', '/assets/v3/characters/astra-vanguard/move/e/sheet.png'],
      ['nw', '/assets/v3/characters/astra-vanguard/move/se/sheet.png'],
    ])
  })

  it('centers and contains the complete battle arena on a mobile canvas', () => {
    expect(cameraFrameFor(V3_BATTLE_LAYOUT, { width: 390, height: 435 }, 'contain')).toEqual({
      centerX: 640,
      centerY: 360,
      zoom: 390 / 720,
    })
  })

  it('lets Phaser report physical travel arrival without opening encounters', async () => {
    const [scene, stage] = await Promise.all([
      readFile(path.resolve('src/v3/presentation/V3WorldScene.ts'), 'utf8'),
      readFile(path.resolve('src/v3/presentation/V3PhaserStage.tsx'), 'utf8'),
    ])

    expect(scene).toContain('onTravelArrival')
    expect(stage).toContain('onTravelArrival')
    expect(scene).not.toContain('onEncounter')
    expect(stage).not.toContain('onEncounter')
    expect(scene).toContain('centerOn(this.player.sprite.x, this.player.sprite.y)')
  })

  it('translates structured battle results, rejections, and behavior nodes for players', () => {
    const battle = createBattle({
      seed: 7319,
      mapId: 'sunlit_circuit',
      maxDecisionTicks: 80,
      left: { templateType: 'job', templateId: 'astra_vanguard', skillIds: ['solar_lance', 'bloom_guard', 'gale_step', 'prism_snare'], treeId: 'tree_balanced' },
      right: { templateType: 'enemy', templateId: 'briar_sentinel', skillIds: ['solar_lance', 'bloom_guard', 'gale_step', 'prism_snare'], treeId: 'tree_survival' },
    })
    expect(playerEventText({
      id: 'result', tick: 3, sequence: 0, type: 'result', message: 'left_win:hp_zero',
    }, { ...battle, result: 'left_win', endReason: 'hp_zero' })).toBe('Our side wins the battle; the opponent has been reduced to zero HP')
    expect(playerEventText({
      id: 'reject', tick: 1, sequence: 0, type: 'action_rejected', actorId: 'left',
      rejectCode: 'not_equipped', message: 'not_equipped',
    }, battle)).toContain('Skill is not equipped')
    expect(playerNodeText('control', 'left', battle)).toBe('Try to cast Prism Snare')
  })
})
