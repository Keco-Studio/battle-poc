import type { BattleEntity } from '../../../domain/entities/battle-entity'
import { getBattleSkillRoleSignatures } from '../../../content/skills/basic-skill-catalog'

export type InferredRole = 'hero' | 'tank' | 'archer' | 'mage' | 'healer' | 'assassin'

const ROLE_STRATEGY_HINTS: Record<InferredRole, string> = {
  hero: '均衡型前排，兼顾伤害和控制，保持压迫节奏',
  tank: '重甲前排，吸收伤害保护队友，用嘲讽和控制打断敌方节奏',
  archer: '远程物理输出，保持安全距离持续施压，利用风筝和减速保持距离',
  mage: '远程法术输出，利用控制技能开窗口打爆发，冰冻后追加碎冰伤害',
  healer: '团队辅助，优先维持队友生存，用减益和净化干扰敌方',
  assassin: '近战刺客，利用位移技能绕后切入，对低血目标打斩杀',
}

const ROLE_PREFERRED_RANGE: Record<InferredRole, 'melee' | 'mid' | 'ranged'> = {
  hero: 'melee',
  tank: 'melee',
  archer: 'ranged',
  mage: 'ranged',
  healer: 'mid',
  assassin: 'melee',
}

export type RoleProfile = {
  role: InferredRole
  strategyHint: string
  preferredRangeClass: 'melee' | 'mid' | 'ranged'
}

/**
 * Picks the role whose signature skills best overlap with the provided ids.
 * Signature data lives in basic-skill-catalog so adding new role-defining
 * skills only requires touching the catalog file.
 *
 * Tie-breaking: first signature in declaration order wins (hero before tank
 * before archer before mage before healer before assassin).
 */
export function inferRoleBySkills(skillIds: string[]): InferredRole {
  const ids = new Set(skillIds.map((id) => String(id || '')))
  let bestRole: InferredRole = 'hero'
  let bestScore = -1
  for (const [role, signatures] of getBattleSkillRoleSignatures()) {
    let score = 0
    for (const skillId of signatures) {
      if (ids.has(skillId)) score += 1
    }
    if (score > bestScore) {
      bestScore = score
      bestRole = role as InferredRole
    }
  }
  return bestRole
}

export function inferRoleProfile(entity: BattleEntity): RoleProfile {
  const skillIds = entity.skillSlots.map((s) => s.skillId)
  const role = inferRoleBySkills(skillIds)
  return {
    role,
    strategyHint: ROLE_STRATEGY_HINTS[role],
    preferredRangeClass: ROLE_PREFERRED_RANGE[role],
  }
}
