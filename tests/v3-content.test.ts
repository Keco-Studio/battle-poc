import { describe, expect, it } from 'vitest'

import {
  V3_CONTENT,
  V3_CONTENT_VERSION,
  V3_RULESET_VERSION,
  V3_VISUAL_VERSION,
  validateV3ContentGraph,
} from '@/src/content/generated/v3'

describe('V3 generated content', () => {
  it('contains a closed graph with the required authored scope', () => {
    expect(validateV3ContentGraph(V3_CONTENT)).toEqual([])
    expect(Object.keys(V3_CONTENT.skills)).toHaveLength(8)
    expect(Object.keys(V3_CONTENT.enemies)).toHaveLength(4)
    expect(Object.keys(V3_CONTENT.encounters)).toHaveLength(4)
    expect(Object.keys(V3_CONTENT.trees)).toHaveLength(4)
    expect(V3_CONTENT.maps.sunlit_circuit.width).toBe(16)
    expect(V3_CONTENT.maps.sunlit_circuit.height).toBe(16)
    expect(V3_CONTENT.maps.prism_gate.width).toBe(16)
    expect(V3_CONTENT.maps.prism_gate.height).toBe(16)
  })

  it('binds stable content, rules, and visual versions', () => {
    expect(V3_CONTENT_VERSION).toBe('v3.0.0')
    expect(V3_RULESET_VERSION).toBe('v3-rules-1')
    expect(V3_VISUAL_VERSION).toBe('v3-pixellab-1')
    expect(V3_CONTENT.game.contentVersion).toBe(V3_CONTENT_VERSION)
    expect(V3_CONTENT.game.rulesetVersion).toBe(V3_RULESET_VERSION)
    expect(V3_CONTENT.game.visualVersion).toBe(V3_VISUAL_VERSION)
  })

  it('keeps every battle loadout at four valid skills', () => {
    const skillIds = new Set(Object.keys(V3_CONTENT.skills))
    expect(V3_CONTENT.jobs.astra_vanguard.skillIds).toHaveLength(4)
    expect(V3_CONTENT.jobs.astra_vanguard.skillIds.every((id) => skillIds.has(id))).toBe(true)
    for (const enemy of Object.values(V3_CONTENT.enemies)) {
      expect(enemy.skillIds).toHaveLength(4)
      expect(enemy.skillIds.every((id) => skillIds.has(id))).toBe(true)
    }
  })

  it('requires eight directional frames for every character asset', () => {
    const characterAssets = Object.values(V3_CONTENT.assets).filter((asset) => asset.kind === 'character')
    expect(characterAssets).toHaveLength(5)
    for (const asset of characterAssets) {
      expect(asset.directions).toEqual(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'])
      expect(asset.framesPerDirection).toBe(8)
    }
  })
})
