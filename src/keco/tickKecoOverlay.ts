import { processTurnEnd, type BattleState } from '@keco/battle-engine'
import type { BattleSession } from '../battle-core/domain/entities/battle-session'
import { updateEntity } from '../battle-core/engine/session-helpers'
import { applyKecoUnitToEntity, syncEntityToKecoUnit } from './entitySync'

export function tickKecoOverlay(session: BattleSession): BattleSession {
  if (!session.keco || session.phase !== 'battle' || session.result !== 'ongoing') return session

  const turn = session.keco.turn + 1
  let logs = [...session.keco.logs]
  const units = { ...session.keco.units }
  let nextSession = session

  for (const entity of [session.left, session.right]) {
    const unit = syncEntityToKecoUnit(entity, units[entity.id])
    const state: BattleState = {
      phase: 'player_turn',
      currentTurn: turn,
      player: entity.team === 'left' ? unit : units[session.left.id] ?? unit,
      monster: entity.team === 'right' ? unit : units[session.right.id] ?? unit,
      selectedSkill: null,
      skillCooldowns: {},
      battleLogs: logs,
      result: null,
    }
    const result = processTurnEnd(state, unit, logs)
    const advancedUnit = { ...result.newUnit, mp: unit.mp }
    units[entity.id] = advancedUnit
    logs = result.newLogs.filter((entry) => entry.type !== 'mp_recover')
    nextSession = updateEntity(nextSession, applyKecoUnitToEntity(entity, advancedUnit))
  }

  return {
    ...nextSession,
    keco: {
      ...session.keco,
      units,
      logs,
      turn,
    },
  }
}
