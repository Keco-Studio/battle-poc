import { describe, expect, test } from 'vitest'
import { buildDamageFloatText, buildDamageLogLine, resolveDamageUiSide } from '../app/components/map-ui/utils/damageEventUtils'

describe('damageEventUtils', () => {
  test('resolveDamageUiSide maps player/enemy/none', () => {
    expect(resolveDamageUiSide('poc-player', 'enemy-1')).toBe('player')
    expect(resolveDamageUiSide('enemy-1', 'enemy-1')).toBe('enemy')
    expect(resolveDamageUiSide('npc-x', 'enemy-1')).toBeNull()
  })

  test('buildDamageLogLine builds expected text', () => {
    expect(buildDamageLogLine('player', 12)).toBe('Took 12 damage')
    expect(buildDamageLogLine('enemy', 9)).toBe('Dealt 9 damage')
    expect(buildDamageLogLine(null, 9)).toBeNull()
  })

  test('buildDamageFloatText returns null for non-positive damage', () => {
    expect(buildDamageFloatText('player', 0, 1)).toBeNull()
  })
})
