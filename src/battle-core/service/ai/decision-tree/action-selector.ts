import { BATTLE_BALANCE } from '../../../config/battle-balance'
import type { DecisionAction, DecisionContext, TacticalMode } from './decision-context'
import { KITE_EXTRA_RANGE, MELEE_RANGE, MOVE_STEP } from './decision-constants'
import {
  computeApproach,
  computeKiteRetreat,
  computeRetreatAlongX,
  pickBestInRange,
  pickByCategoryInRange,
} from './decision-helpers'

const RANGE_BUFFER = BATTLE_BALANCE.tacticalRangeBuffer
const CONTROL_TARGET_HP_GATE = 0.15

export function selectAction(ctx: DecisionContext, mode: TacticalMode): DecisionAction {
  switch (mode) {
    case 'retreat': return retreatTree(ctx)
    case 'finish': return finishTree(ctx)
    case 'kite': return kiteTree(ctx)
    case 'trade': return tradeTree(ctx)
  }
}

function retreatTree(ctx: DecisionContext): DecisionAction {
  if (ctx.actor.resources.stamina >= BATTLE_BALANCE.dodgeStaminaCost) {
    return { type: 'dodge', path: 'root>retreat>dodge' }
  }
  const retreatTarget = computeRetreatAlongX(ctx)
  if (retreatTarget) {
    return { type: 'dash', target: retreatTarget, moveStep: MOVE_STEP.retreatFast, path: 'root>retreat>dash_back' }
  }
  const best = pickBestInRange(ctx)
  if (best) {
    return { type: 'cast_skill', skillId: best.definition.id, path: 'root>retreat>cast_desperation' }
  }
  if (ctx.distance <= MELEE_RANGE) {
    return { type: 'basic_attack', path: 'root>retreat>basic_melee' }
  }
  return { type: 'noop', path: 'root>retreat>noop' }
}

function finishTree(ctx: DecisionContext): DecisionAction {
  const best = pickBestInRange(ctx)
  if (best) {
    return { type: 'cast_skill', skillId: best.definition.id, path: 'root>finish>cast_execute' }
  }
  if (ctx.distance <= MELEE_RANGE) {
    return { type: 'basic_attack', path: 'root>finish>basic_melee' }
  }
  const approachTarget = computeApproach(ctx, MELEE_RANGE)
  if (approachTarget) {
    return { type: 'dash', target: approachTarget, path: 'root>finish>dash_close' }
  }
  return { type: 'basic_attack', path: 'root>finish>basic_fallback' }
}

function kiteTree(ctx: DecisionContext): DecisionAction {
  const kiteTooClose = Math.max(MELEE_RANGE + KITE_EXTRA_RANGE, ctx.preferredRange - KITE_EXTRA_RANGE)

  if (ctx.distance < kiteTooClose) {
    const retreat = computeKiteRetreat(ctx)
    if (retreat) {
      return { type: 'dash', target: retreat, moveStep: MOVE_STEP.kiteBack, path: 'root>kite>too_close>dash_back' }
    }
  }

  const control = pickByCategoryInRange(ctx, 'control')
  if (control && ctx.targetHpRatio > CONTROL_TARGET_HP_GATE) {
    return { type: 'cast_skill', skillId: control.definition.id, path: 'root>kite>cast_control' }
  }

  const burst = pickByCategoryInRange(ctx, 'burst')
  if (burst) {
    return { type: 'cast_skill', skillId: burst.definition.id, path: 'root>kite>cast_burst' }
  }

  const anyReady = pickBestInRange(ctx)
  if (anyReady) {
    return { type: 'cast_skill', skillId: anyReady.definition.id, path: 'root>kite>cast_any' }
  }

  if (ctx.distance > ctx.preferredRange + RANGE_BUFFER) {
    const approach = computeApproach(ctx, ctx.preferredRange)
    if (approach) {
      return { type: 'dash', target: approach, path: 'root>kite>dash_to_range' }
    }
  }

  if (ctx.distance <= MELEE_RANGE) {
    return { type: 'basic_attack', path: 'root>kite>basic_melee' }
  }

  return { type: 'noop', path: 'root>kite>noop_wait' }
}

function tradeTree(ctx: DecisionContext): DecisionAction {
  const best = pickBestInRange(ctx)
  if (best) {
    return { type: 'cast_skill', skillId: best.definition.id, path: 'root>trade>cast_best' }
  }
  if (ctx.distance <= MELEE_RANGE) {
    return { type: 'basic_attack', path: 'root>trade>basic_melee' }
  }
  const approach = computeApproach(ctx, ctx.preferredRange)
  if (approach) {
    return { type: 'dash', target: approach, path: 'root>trade>dash_approach' }
  }
  return { type: 'noop', path: 'root>trade>noop' }
}
