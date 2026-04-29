import { describe, expect, it } from 'vitest'
import type { BattleEntity } from '../src/battle-core/domain/entities/battle-entity'
import { createBattleSession } from '../src/battle-core/domain/entities/battle-session'
import type { DecisionContext } from '../src/battle-core/service/ai/decision-tree'
import { applyGuardrail } from '../src/battle-core/service/ai/decision-tree'
import { getBattleSkillDefinition } from '../src/battle-core/content/skills/basic-skill-catalog'

function createEntity(input: {
  id: string
  team: 'left' | 'right'
  x: number
  y: number
  skillIds?: string[]
}): BattleEntity {
  return {
    id: input.id,
    name: input.id,
    team: input.team,
    position: { x: input.x, y: input.y },
    resources: {
      hp: 120,
      maxHp: 120,
      mp: 40,
      maxMp: 40,
      stamina: 40,
      maxStamina: 40,
      rage: 0,
      maxRage: 100,
      shield: 0,
      maxShield: 30,
    },
    atk: 22,
    def: 10,
    spd: 10,
    skillSlots: (input.skillIds ?? []).map((skillId) => ({ skillId, cooldownTick: 0 })),
    defending: false,
    alive: true,
    effects: [],
  }
}

describe('decision guardrail', () => {
  it('when skill slightly exceeds range should rewrite to dash approach instead of direct casting', () => {
    const barrier = getBattleSkillDefinition('barrier')
    expect(barrier).toBeTruthy()
    if (!barrier) return

    const left = createEntity({ id: 'left', team: 'left', x: 1, y: 1, skillIds: ['barrier'] })
    const right = createEntity({ id: 'right', team: 'right', x: 1 + barrier.range + 0.1, y: 1 })
    const session = createBattleSession({ left, right, preparationTicks: 0 })

    const ctx: DecisionContext = {
      session,
      actor: left,
      target: right,
      tick: 1,
      distance: barrier.range + 0.1,
      actorHpRatio: 1,
      targetHpRatio: 1,
      readySkills: [
        {
          definition: barrier,
          slotIndex: 0,
          inRange: true,
        },
      ],
      preferredRange: barrier.range,
      isControlled: false,
      mapBounds: {
        minX: session.mapBounds.minX,
        maxX: session.mapBounds.maxX,
        minY: session.mapBounds.minY,
        maxY: session.mapBounds.maxY,
      },
    }

    const guarded = applyGuardrail(ctx, {
      type: 'cast_skill',
      skillId: 'barrier',
      path: 'test>cast',
    })

    expect(guarded.rewritten).toBe(true)
    expect(guarded.rewriteReason).toBe('skill_out_of_range')
    expect(guarded.action.type).toBe('dash')
  })

  it('when skill slightly exceeds range should rewrite to dash approach instead of direct casting', () => {
    const barrier = getBattleSkillDefinition('barrier')
    expect(barrier).toBeTruthy()
    if (!barrier) return

    const left = createEntity({ id: 'left-cd', team: 'left', x: 2, y: 2, skillIds: ['barrier'] })
    const right = createEntity({ id: 'right-cd', team: 'right', x: 6, y: 2 })
    let session = createBattleSession({ left, right, preparationTicks: 0 })
    session = {
      ...session,
      movementState: {
        ...session.movementState,
        [left.id]: {
          consecutiveDashCount: 1,
          dashCooldownUntilTick: 5,
        },
      },
    }

    const ctx: DecisionContext = {
      session,
      actor: left,
      target: right,
      tick: 3,
      distance: 4,
      actorHpRatio: 1,
      targetHpRatio: 1,
      readySkills: [
        {
          definition: barrier,
          slotIndex: 0,
          inRange: true,
        },
      ],
      preferredRange: barrier.range,
      isControlled: false,
      mapBounds: {
        minX: session.mapBounds.minX,
        maxX: session.mapBounds.maxX,
        minY: session.mapBounds.minY,
        maxY: session.mapBounds.maxY,
      },
    }

    const guarded = applyGuardrail(ctx, {
      type: 'dash',
      target: { x: 4, y: 2 },
      path: 'test>dash',
    })

    expect(guarded.rewritten).toBe(true)
    expect(guarded.rewriteReason).toBe('dash_on_cooldown')
    expect(guarded.action.type).toBe('cast_skill')
  })

  it('when dash is on cooldown should rewrite to defensive fallback', () => {
    const barrier = getBattleSkillDefinition('barrier')
    expect(barrier).toBeTruthy()
    if (!barrier) return

    const left = createEntity({ id: 'left-buffer', team: 'left', x: 2, y: 2, skillIds: ['barrier'] })
    const right = createEntity({ id: 'right-buffer', team: 'right', x: 2 + barrier.range + 0.1, y: 2 })
    let session = createBattleSession({ left, right, preparationTicks: 0 })
    session = {
      ...session,
      movementState: {
        ...session.movementState,
        [left.id]: {
          consecutiveDashCount: 0,
          dashCooldownUntilTick: 10,
        },
      },
    }

    const ctx: DecisionContext = {
      session,
      actor: left,
      target: right,
      tick: 3,
      distance: barrier.range + 0.1,
      actorHpRatio: 1,
      targetHpRatio: 1,
      readySkills: [
        {
          definition: barrier,
          slotIndex: 0,
          inRange: true,
        },
      ],
      preferredRange: barrier.range,
      isControlled: false,
      mapBounds: {
        minX: session.mapBounds.minX,
        maxX: session.mapBounds.maxX,
        minY: session.mapBounds.minY,
        maxY: session.mapBounds.maxY,
      },
    }

    const guarded = applyGuardrail(ctx, {
      type: 'dash',
      target: { x: 4, y: 2 },
      path: 'test>dash_buffer',
    })

    expect(guarded.rewritten).toBe(true)
    expect(guarded.rewriteReason).toBe('dash_on_cooldown')
    expect(guarded.action.type).toBe('defend')
  })
})
