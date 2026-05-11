import { describe, expect, it, vi } from 'vitest'
import type { BattleEntity } from '../src/battle-core/domain/entities/battle-entity'
import { createBattleSession } from '../src/battle-core/domain/entities/battle-session'
import { createInitialBehaviorTree } from '../src/battle-core/service/ai/behavior-tree/initial-behavior-tree'
import { evaluateBehaviorTree } from '../src/battle-core/service/ai/behavior-tree/runtime'

function makeEntity(input: {
  id: string
  team: 'left' | 'right'
  x: number
  y: number
  hp?: number
  skills?: string[]
}): BattleEntity {
  const hp = input.hp ?? 100
  return {
    id: input.id,
    name: input.id,
    team: input.team,
    position: { x: input.x, y: input.y },
    resources: {
      hp,
      maxHp: 100,
      mp: 40,
      maxMp: 40,
      stamina: 40,
      maxStamina: 40,
      rage: 0,
      maxRage: 100,
      shield: 0,
      maxShield: 30,
    },
    atk: 20,
    def: 8,
    spd: 12,
    skillSlots: (input.skills || []).map((skillId) => ({ skillId, cooldownTick: 0 })),
    defending: false,
    alive: true,
    effects: [],
  }
}

describe('behavior tree runtime', () => {
  it('uses finish branch to cast skill on low hp target', () => {
    const left = makeEntity({ id: 'left-finish', team: 'left', x: 3, y: 2, skills: ['arcane_bolt'] })
    const right = makeEntity({ id: 'right-finish', team: 'right', x: 5, y: 2, hp: 15 })
    const session = createBattleSession({ left, right, preparationTicks: 0 })
    const tree = createInitialBehaviorTree({ actorId: left.id, currentTick: session.tick })

    const decision = evaluateBehaviorTree({
      session,
      actor: left,
      target: right,
      tree,
    })

    expect(decision.action).toBe('cast_skill')
    expect(decision.skillId).toBe('arcane_bolt')
    expect(decision.metadata?.btVersion).toBe(2)
  })

  it('retreats when self hp is low', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    const left = makeEntity({ id: 'left-retreat', team: 'left', x: 6, y: 2, hp: 20, skills: ['arcane_bolt'] })
    const right = makeEntity({ id: 'right-retreat', team: 'right', x: 8, y: 2 })
    const session = createBattleSession({ left, right, preparationTicks: 0 })
    const tree = createInitialBehaviorTree({ actorId: left.id, currentTick: session.tick })

    const decision = evaluateBehaviorTree({
      session,
      actor: left,
      target: right,
      tree,
    })

    expect(decision.action).toBe('dash')
    const moveTargetX = Number(decision.metadata?.moveTargetX)
    expect(moveTargetX).toBeLessThan(left.position.x)
    randomSpy.mockRestore()
  })

  it('retreat branch dashes away on X while holding Y (retreat dash target)', () => {
    const left = makeEntity({ id: 'left-ret-y', team: 'left', x: 6, y: 5, hp: 20, skills: ['arcane_bolt'] })
    const right = makeEntity({ id: 'right-ret-y', team: 'right', x: 8, y: 2 })
    const session = createBattleSession({ left, right, preparationTicks: 0 })
    const tree = createInitialBehaviorTree({ actorId: left.id, currentTick: session.tick })

    const decision = evaluateBehaviorTree({
      session,
      actor: left,
      target: right,
      tree,
    })

    expect(decision.action).toBe('dash')
    expect(Number(decision.metadata?.moveTargetX)).toBeLessThan(left.position.x)
    expect(Number(decision.metadata?.moveTargetY)).toBe(left.position.y)
  })

  it('when low hp and near corner, should escape toward center instead of edge-sticking retreat', () => {
    const left = makeEntity({ id: 'left-corner', team: 'left', x: 0.6, y: 0.7, hp: 20, skills: ['arcane_bolt'] })
    const right = makeEntity({ id: 'right-corner', team: 'right', x: 3.2, y: 1.2 })
    const session = createBattleSession({ left, right, preparationTicks: 0 })
    const tree = createInitialBehaviorTree({ actorId: left.id, currentTick: session.tick })

    const decision = evaluateBehaviorTree({
      session,
      actor: left,
      target: right,
      tree,
    })

    expect(decision.action).toBe('dash')
    const moveTargetX = Number(decision.metadata?.moveTargetX)
    const moveTargetY = Number(decision.metadata?.moveTargetY)
    expect(moveTargetX).toBeGreaterThan(left.position.x)
    expect(moveTargetY).toBeGreaterThan(left.position.y)
  })

  it('approaches when no ready melee action exists', () => {
    const left = makeEntity({ id: 'left-approach', team: 'left', x: 2, y: 2, skills: [] })
    const right = makeEntity({ id: 'right-approach', team: 'right', x: 9, y: 2 })
    const session = createBattleSession({ left, right, preparationTicks: 0 })
    const tree = createInitialBehaviorTree({ actorId: left.id, currentTick: session.tick })

    const decision = evaluateBehaviorTree({
      session,
      actor: left,
      target: right,
      tree,
    })

    expect(decision.action).toBe('dash')
    expect(Number(decision.metadata?.moveTargetX)).toBeGreaterThan(left.position.x)
  })

  it('approaches when a skill is ready but still out of range', () => {
    const left = makeEntity({ id: 'left-skill-far', team: 'left', x: 2, y: 2, skills: ['arcane_bolt'] })
    const right = makeEntity({ id: 'right-skill-far', team: 'right', x: 9, y: 2 })
    const session = createBattleSession({ left, right, preparationTicks: 0 })
    const tree = createInitialBehaviorTree({ actorId: left.id, currentTick: session.tick })

    const decision = evaluateBehaviorTree({
      session,
      actor: left,
      target: right,
      tree,
    })

    expect(decision.action).toBe('dash')
    expect(Number(decision.metadata?.moveTargetX)).toBeGreaterThan(left.position.x)
  })
})
