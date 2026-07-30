import { describe, expect, it } from 'vitest'

import { V3_CONTENT } from '@/src/content/generated/v3'
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
        modifiers: { hp: 18, energy: 20, atk: 4, def: 3, spd: 1 },
      },
      right: {
        templateType: 'enemy',
        templateId: 'sunforge_striker',
        skillIds: ['solar_lance', 'meteor_arc', 'gale_step', 'comet_break'],
        treeId: 'tree_aggressive',
        modifiers: { hp: 0, energy: 0, atk: 0, def: 0, spd: 0 },
      },
      versions: {
        content: V3_CONTENT.game.contentVersion,
        rules: V3_CONTENT.game.rulesetVersion,
        visual: V3_CONTENT.game.visualVersion,
        modelProvider: 'deepseek',
        model: 'deepseek-replay-fixture',
      },
    })

    while (state.result === 'ongoing') state = resolveDecisionTick(state, { left: null, right: null })
    const replayed = replayBattle(toBattleRecord(state))

    expect(replayed.result).toBe(state.result)
    expect(replayed.tick).toBe(state.tick)
    expect(replayed.actors).toEqual(state.actors)
    expect(replayed.events).toEqual(state.events)
    expect(replayed.initialConfig.versions).toEqual(state.initialConfig.versions)
    expect(replayed.initialConfig.left.modifiers).toEqual(state.initialConfig.left.modifiers)
    expect(replayed.actors.left.maxHp).toBe(V3_CONTENT.jobs.astra_vanguard.hp + 18)
  })
})
