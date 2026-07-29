import { describe, expect, it } from 'vitest'

import { createBattle, replayBattle, resolveDecisionTick, toBattleRecord } from '@/src/v3/runtime'

describe('V3 battle replay', () => {
  it('replays recorded patches and actions to the same terminal state', () => {
    let state = createBattle({
      seed: 8192,
      mapId: 'sunlit_circuit',
      maxDecisionTicks: 24,
      left: {
        templateType: 'job',
        templateId: 'astra_vanguard',
        skillIds: ['solar_lance', 'bloom_guard', 'gale_step', 'prism_snare'],
        treeId: 'tree_balanced',
      },
      right: {
        templateType: 'enemy',
        templateId: 'sunforge_striker',
        skillIds: ['solar_lance', 'meteor_arc', 'gale_step', 'comet_break'],
        treeId: 'tree_aggressive',
      },
    })

    while (state.result === 'ongoing') state = resolveDecisionTick(state, { left: null, right: null })
    const replayed = replayBattle(toBattleRecord(state))

    expect(replayed.result).toBe(state.result)
    expect(replayed.tick).toBe(state.tick)
    expect(replayed.actors).toEqual(state.actors)
    expect(replayed.events).toEqual(state.events)
  })
})
