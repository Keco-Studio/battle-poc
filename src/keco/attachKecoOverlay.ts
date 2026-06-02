import type { BattleSession } from '../battle-core/domain/entities/battle-session'
import { getKecoSkillsRecord } from '@/src/lib/skills/kecoSkillRegistry'
import { defaultBasicKecoSkill, registerKecoSkills } from './kecoSkillBridge'
import { entityToKecoUnit } from './entitySync'
import type { KecoCombatExtension } from './types'

export function attachKecoOverlay(session: BattleSession): BattleSession {
  let skillById = getKecoSkillsRecord() ?? {}
  if (Object.keys(skillById).length === 0) {
    skillById = registerKecoSkills([defaultBasicKecoSkill()])
  }

  const keco: KecoCombatExtension = {
    skillById,
    units: {
      [session.left.id]: entityToKecoUnit(session.left),
      [session.right.id]: entityToKecoUnit(session.right),
    },
    logs: [],
    turn: 0,
  }

  return { ...session, keco }
}
