import { describe, expect, it } from 'vitest'

import { analyzeBattle, createBattle, type V3BattleEvent, type V3BattleState } from '@/src/v3/runtime'

function fixture(events: V3BattleEvent[], result: V3BattleState['result']): V3BattleState {
  const battle = createBattle({
    seed: 7319,
    mapId: 'sunlit_circuit',
    maxDecisionTicks: 80,
    left: { templateType: 'job', templateId: 'astra_vanguard', skillIds: ['solar_lance', 'bloom_guard', 'gale_step', 'prism_snare'], treeId: 'tree_balanced' },
    right: { templateType: 'enemy', templateId: 'sunforge_striker', skillIds: ['solar_lance', 'meteor_arc', 'gale_step', 'comet_break'], treeId: 'tree_aggressive' },
  })
  return {
    ...battle,
    result,
    endReason: result === 'draw' ? 'max_tick' : 'hp_zero',
    tick: Math.max(0, ...events.map((event) => event.tick)),
    events,
  }
}

function event(
  sequence: number,
  values: Partial<V3BattleEvent> & Pick<V3BattleEvent, 'type'>,
): V3BattleEvent {
  return {
    id: `event-${sequence}`,
    tick: values.tick ?? 1,
    sequence,
    message: values.type,
    ...values,
  }
}

describe('V3 battle analysis', () => {
  it('turns observed range failures, incoming burst, and zero damage into adjustments', () => {
    const battle = fixture([
      event(0, { type: 'action_rejected', actorId: 'left', skillId: 'solar_lance', rejectCode: 'out_of_range' }),
      event(1, { type: 'action_rejected', actorId: 'left', skillId: 'solar_lance', rejectCode: 'out_of_range' }),
      event(2, { type: 'action_rejected', actorId: 'left', skillId: 'prism_snare', rejectCode: 'out_of_range' }),
      event(3, { type: 'damage', actorId: 'right', targetId: 'left', skillId: 'meteor_arc', amount: 52, tick: 2 }),
      event(4, { type: 'damage', actorId: 'right', targetId: 'left', skillId: 'comet_break', amount: 128, tick: 3 }),
      event(5, { type: 'result', tick: 3 }),
    ], 'right_win')

    const analysis = analyzeBattle(battle)
    expect(analysis.rejectedActions).toBe(3)
    expect(analysis.decisiveTick).toBe(3)
    expect(analysis.insights).toHaveLength(3)
    expect(analysis.insights.every((insight) => insight.kind === 'adjustment')).toBe(true)
    expect(analysis.insights.map((insight) => insight.detail).join(' ')).toContain('3 次')
    expect(analysis.insights.map((insight) => insight.detail).join(' ')).toContain('日耀枪')
    expect(analysis.insights.map((insight) => insight.detail).join(' ')).toContain('128')
    expect(analysis.insights.map((insight) => insight.detail).join(' ')).toContain('0 点')
  })

  it('identifies the highest contributing skill as a victory strength', () => {
    const battle = fixture([
      event(0, { type: 'damage', actorId: 'left', targetId: 'right', skillId: 'solar_lance', amount: 34 }),
      event(1, { type: 'damage', actorId: 'left', targetId: 'right', skillId: 'meteor_arc', amount: 48, tick: 2 }),
      event(2, { type: 'damage', actorId: 'left', targetId: 'right', skillId: 'meteor_arc', amount: 72, tick: 3 }),
      event(3, { type: 'result', tick: 3 }),
    ], 'left_win')

    const analysis = analyzeBattle(battle)
    expect(analysis.damageBySkill[0]).toEqual({ skillId: 'meteor_arc', damage: 120, hits: 2 })
    expect(analysis.decisiveTick).toBe(3)
    expect(analysis.insights[0]).toMatchObject({ kind: 'strength', title: '核心输出' })
    expect(analysis.insights[0].detail).toContain('流星弧')
    expect(analysis.insights[0].detail).toContain('120')
  })

  it('returns identical analysis for identical records', () => {
    const battle = fixture([
      event(0, { type: 'damage', actorId: 'left', targetId: 'right', amount: 18 }),
      event(1, { type: 'result', tick: 2 }),
    ], 'draw')
    expect(analyzeBattle(battle)).toEqual(analyzeBattle(JSON.parse(JSON.stringify(battle))))
  })
})
