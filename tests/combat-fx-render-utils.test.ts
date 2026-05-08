import { describe, expect, test } from 'vitest'
import {
  getActiveCombatFx,
  isCombatActionAnim,
  toCombatSpriteTransform,
} from '../app/components/map-ui/utils/combatFxRenderUtils'

describe('combatFxRenderUtils', () => {
  test('getActiveCombatFx returns active fx before untilMs', () => {
    const fx = { anim: 'attack' as const, untilMs: 200, offsetX: 0.1, offsetY: -0.2 }
    expect(getActiveCombatFx(fx, 199)).toEqual(fx)
  })

  test('getActiveCombatFx returns null at or after untilMs', () => {
    const fx = { anim: 'cast' as const, untilMs: 200, offsetX: 0.1, offsetY: -0.2 }
    expect(getActiveCombatFx(fx, 200)).toBeNull()
    expect(getActiveCombatFx(fx, 250)).toBeNull()
  })

  test('isCombatActionAnim only true for attack or cast', () => {
    expect(isCombatActionAnim({ anim: 'attack', untilMs: 1, offsetX: 0, offsetY: 0 })).toBe(true)
    expect(isCombatActionAnim({ anim: 'cast', untilMs: 1, offsetX: 0, offsetY: 0 })).toBe(true)
    expect(isCombatActionAnim({ anim: 'hit', untilMs: 1, offsetX: 0, offsetY: 0 })).toBe(false)
    expect(isCombatActionAnim({ anim: 'idle', untilMs: 1, offsetX: 0, offsetY: 0 })).toBe(false)
    expect(isCombatActionAnim(null)).toBe(false)
  })

  test('toCombatSpriteTransform formats transform with one decimal place', () => {
    const fx = { anim: 'hit' as const, untilMs: 100, offsetX: 0.123, offsetY: -0.456 }
    expect(toCombatSpriteTransform(fx, 32)).toBe('translate(3.9px, -14.6px)')
  })

  test('toCombatSpriteTransform returns undefined for null fx', () => {
    expect(toCombatSpriteTransform(null, 32)).toBeUndefined()
  })
})
