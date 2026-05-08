import { describe, expect, test } from 'vitest'
import { buildCombatFxState } from '../app/components/map-ui/hooks/useMapCombatFx'

describe('buildCombatFxState', () => {
  test('attack uses normalized toward vector and default duration', () => {
    const state = buildCombatFxState({
      nowMs: 1000,
      anim: 'attack',
      opts: { toward: { x: 3, y: 4 } },
    })

    expect(state.anim).toBe('attack')
    expect(state.untilMs).toBe(1160)
    expect(state.offsetX).toBeCloseTo(0.084, 6)
    expect(state.offsetY).toBeCloseTo(0.112, 6)
  })

  test('cast uses smaller movement magnitude', () => {
    const state = buildCombatFxState({
      nowMs: 500,
      anim: 'cast',
      opts: { toward: { x: 0, y: 5 } },
    })

    expect(state.untilMs).toBe(710)
    expect(state.offsetX).toBeCloseTo(0, 6)
    expect(state.offsetY).toBeCloseTo(0.08, 6)
  })

  test('hit uses from vector and hit duration', () => {
    const state = buildCombatFxState({
      nowMs: 200,
      anim: 'hit',
      opts: { from: { x: -6, y: 8 } },
    })

    expect(state.untilMs).toBe(340)
    expect(state.offsetX).toBeCloseTo(-0.06, 6)
    expect(state.offsetY).toBeCloseTo(0.08, 6)
  })

  test('idle stays still with zero duration', () => {
    const state = buildCombatFxState({ nowMs: 900, anim: 'idle' })
    expect(state.untilMs).toBe(900)
    expect(state.offsetX).toBe(0)
    expect(state.offsetY).toBe(0)
  })

  test('custom duration overrides defaults', () => {
    const state = buildCombatFxState({
      nowMs: 10,
      anim: 'attack',
      opts: { toward: { x: 1, y: 0 }, durationMs: 999 },
    })
    expect(state.untilMs).toBe(1009)
  })
})
