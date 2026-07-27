import { BattleSession } from '../domain/entities/battle-session'
import { processBattleCommands, type BattleCommandWalkContext } from './command-processor'
import { tickStatusEffects } from './effect-processor'
import { appendEvent } from './session-helpers'
import { tickKecoOverlay } from '@/src/keco/tickKecoOverlay'

export type TickEngineResult = {
  session: BattleSession
  appliedCommandCount: number
}

export class BattleTickEngine {
  public tick(session: BattleSession, walk?: BattleCommandWalkContext): TickEngineResult {
    const advancedTick = session.tick + 1
    const shouldEnterBattle =
      session.phase === 'preparation' && advancedTick >= session.preparationEndTick
    const advancedSession: BattleSession = {
      ...session,
      tick: advancedTick,
      phase: shouldEnterBattle ? 'battle' : session.phase,
      updatedAt: Date.now()
    }
    const processed = processBattleCommands(advancedSession, walk)
    const withEffects = tickStatusEffects(processed.session)
    const withKeco = tickKecoOverlay(withEffects)
    const withRecovery = recoverPassiveResources(withKeco)
    const withResult = resolveEffectVictory(withRecovery)
    return {
      session: withResult,
      appliedCommandCount: processed.appliedCommandCount
    }
  }
}

function resolveEffectVictory(session: BattleSession): BattleSession {
  if (session.result !== 'ongoing') return session
  if (session.left.alive && session.right.alive) return session
  const result = session.left.alive ? 'left_win' : session.right.alive ? 'right_win' : 'draw'
  return appendEvent({ ...session, result }, 'battle_ended', { result, reason: 'status_effect' })
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
