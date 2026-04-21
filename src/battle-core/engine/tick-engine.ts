import { BattleSession } from '../domain/entities/battle-session'
import { processBattleCommands } from './command-processor'
import { tickStatusEffects } from './effect-processor'

export type TickEngineResult = {
  session: BattleSession
  appliedCommandCount: number
}

export class BattleTickEngine {
  public tick(session: BattleSession): TickEngineResult {
    const advancedTick = session.tick + 1
    const shouldEnterBattle =
      session.phase === 'preparation' && advancedTick >= session.preparationEndTick
    const advancedSession: BattleSession = {
      ...session,
      tick: advancedTick,
      phase: shouldEnterBattle ? 'battle' : session.phase,
      updatedAt: Date.now()
    }
    const processed = processBattleCommands(advancedSession)
    const withEffects = tickStatusEffects(processed.session)
    const withRecovery = recoverPassiveResources(withEffects)
    return {
      session: withRecovery,
      appliedCommandCount: processed.appliedCommandCount
    }
  }
}

function recoverPassiveResources(session: BattleSession): BattleSession {
  const recoverEntity = (entity: BattleSession['left']) => {
    if (!entity.alive) return entity
    const nextMp = Math.min(entity.resources.maxMp, entity.resources.mp + 1)
    const nextStamina = Math.min(entity.resources.maxStamina, entity.resources.stamina + 1)
    if (nextMp === entity.resources.mp && nextStamina === entity.resources.stamina) {
      return entity
    }
    return {
      ...entity,
      resources: {
        ...entity.resources,
        mp: nextMp,
        stamina: nextStamina
      }
    }
  }
  return {
    ...session,
    left: recoverEntity(session.left),
    right: recoverEntity(session.right)
  }
}

