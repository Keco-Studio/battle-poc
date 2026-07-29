import { describe, expect, it } from 'vitest'

import {
  EMPTY_V3_PROGRESS,
  initialV3PhaseState,
  recordV3Outcome,
  transitionV3Phase,
} from '@/src/v3/runtime/campaign'

describe('V3 campaign progress', () => {
  it('does not award or unlock content for sandbox victories', () => {
    const next = recordV3Outcome(EMPTY_V3_PROGRESS, {
      encounterId: 'briar_trial',
      result: 'left_win',
      seed: 7319,
      ticks: 12,
    }, 'sandbox')
    expect(next).toEqual(EMPTY_V3_PROGRESS)
  })

  it('unlocks the gate only after all three standard encounters', () => {
    let progress = EMPTY_V3_PROGRESS
    for (const encounterId of ['briar_trial', 'sunforge_trial', 'prism_trial']) {
      progress = recordV3Outcome(progress, {
        encounterId,
        result: 'left_win',
        seed: 7319,
        ticks: 12,
      }, 'standard')
    }
    expect(progress.clearedEncounterIds).toEqual(['briar_trial', 'sunforge_trial', 'prism_trial'])
    expect(progress.unlockedEncounterIds).toContain('marshal_gate')
    expect(progress.exp).toBe(150)
    expect(progress.starlight).toBe(105)
    expect(progress.drops).toEqual(['bloom_core', 'sunforge_coil', 'prism_lens'])
  })

  it('returns to the safe beacon without rewards after defeat', () => {
    const next = recordV3Outcome({ ...EMPTY_V3_PROGRESS, playerPosition: { x: 20, y: 15 } }, {
      encounterId: 'sunforge_trial',
      result: 'right_win',
      seed: 9001,
      ticks: 18,
    }, 'standard')
    expect(next.playerPosition).toEqual({ x: 3, y: 16 })
    expect(next.exp).toBe(0)
    expect(next.starlight).toBe(0)
    expect(next.battleRecords).toHaveLength(1)
  })
})

describe('V3 phase state machine', () => {
  it('allows explore, prepare, battle, report, and return transitions', () => {
    const prepare = transitionV3Phase(initialV3PhaseState(), { type: 'encounter', encounterId: 'briar_trial' })
    expect(prepare).toMatchObject({ phase: 'prepare', encounterId: 'briar_trial' })
    const battle = transitionV3Phase(prepare, { type: 'start_battle', battleId: 'battle-1' })
    expect(battle).toMatchObject({ phase: 'battle', battleId: 'battle-1' })
    const report = transitionV3Phase(battle, { type: 'battle_complete' })
    expect(report.phase).toBe('report')
    expect(transitionV3Phase(report, { type: 'return_to_map' })).toEqual(initialV3PhaseState())
  })

  it('ignores illegal transitions', () => {
    const initial = initialV3PhaseState()
    expect(transitionV3Phase(initial, { type: 'battle_complete' })).toBe(initial)
    expect(transitionV3Phase(initial, { type: 'start_battle', battleId: 'bad' })).toBe(initial)
  })
})
