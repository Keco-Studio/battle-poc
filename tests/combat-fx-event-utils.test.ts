import { describe, expect, test } from 'vitest'
import { resolveActorCombatAnim, toHitFromVector, toTowardVector } from '../app/components/map-ui/utils/combatFxEventUtils'

describe('combatFxEventUtils', () => {
  test('resolveActorCombatAnim maps supported actions', () => {
    expect(resolveActorCombatAnim('basic_attack')).toBe('attack')
    expect(resolveActorCombatAnim('cast_skill')).toBe('cast')
  })

  test('resolveActorCombatAnim returns null for non-combat actions', () => {
    expect(resolveActorCombatAnim('flee')).toBeNull()
    expect(resolveActorCombatAnim('idle')).toBeNull()
  })

  test('toTowardVector computes delta from actor to target', () => {
    expect(toTowardVector({ x: 2, y: 5 }, { x: -1, y: 11 })).toEqual({ x: -3, y: 6 })
  })

  test('toHitFromVector computes delta from actor to target', () => {
    expect(toHitFromVector({ x: -3, y: 2 }, { x: 4, y: -1 })).toEqual({ x: 7, y: -3 })
  })
})
