import { BATTLE_BALANCE } from '../../../config/battle-balance'
import type { DecisionContext, TacticalMode } from './decision-context'
import { KITE_EXTRA_RANGE, MELEE_RANGE } from './decision-constants'

export function selectTacticalMode(ctx: DecisionContext): TacticalMode {
  // Avoid mirror "both flee": only retreat when low HP *and* losing the HP race vs target.
  // Ties or slight advantage → continue with finish/kite/trade so the fight does not dead-run to the map edge.
  const lowHp = ctx.actorHpRatio <= BATTLE_BALANCE.tacticalLowHpRetreatRatio
  const close = ctx.distance <= BATTLE_BALANCE.tacticalKiteMinDistance
  const bloodDisadvantage = ctx.actorHpRatio < ctx.targetHpRatio
  if (lowHp && close && bloodDisadvantage) {
    return 'retreat'
  }

  if (
    ctx.targetHpRatio <= BATTLE_BALANCE.tacticalTargetLowHpFinishRatio &&
    ctx.distance <= Math.max(MELEE_RANGE + 0.4, ctx.preferredRange)
  ) {
    return 'finish'
  }

  if (ctx.preferredRange > MELEE_RANGE + KITE_EXTRA_RANGE) {
    return 'kite'
  }

  return 'trade'
}
