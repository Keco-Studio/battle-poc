import type { Skill } from '@keco/battle-engine'
import { upsertBattleSkillDefinition } from '../battle-core/content/skills/basic-skill-catalog'
import type { BattleSkillDefinition } from '../battle-core/domain/types/skill-types'

/** 地图战统一施法距离（格/单位），与默认技能 CSV `range` 列一致。 */
export const KECO_SKILL_CAST_RANGE = 3

function skillCategory(skill: Skill, freezeTicks?: number): BattleSkillDefinition['category'] {
  if (freezeTicks) return 'control'
  if (skill.type === 'heal') return 'sustain'
  return 'burst'
}

function skillBtRatio(skill: Skill): number {
  const base = Math.max(0.5, skill.power)
  const elem = skill.attachElement?.element
  if (elem && elem !== 'random') return base + 0.8
  if (skill.type === 'heal') return base + 0.5
  return base
}

export function kecoSkillToBattleCoreDefinition(skill: Skill): BattleSkillDefinition {
  const freezeTicks =
    skill.crowdControl?.type === 'freeze' ? skill.crowdControl.duration : undefined

  return upsertBattleSkillDefinition({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    category: skillCategory(skill, freezeTicks),
    ratio: skillBtRatio(skill),
    mpCost: skill.mpCost,
    range: KECO_SKILL_CAST_RANGE,
    cooldownTicks: Math.max(0, skill.maxCooldown),
    applyFreezeTicks: freezeTicks,
  })
}

export function registerKecoSkills(skills: Skill[]): Record<string, Skill> {
  const skillById: Record<string, Skill> = {}
  for (const skill of skills) {
    kecoSkillToBattleCoreDefinition(skill)
    skillById[skill.id] = skill
  }
  return skillById
}

export function defaultBasicKecoSkill(): Skill {
  return {
    id: 'keco_basic_strike',
    name: 'Strike',
    type: 'attack',
    power: 1,
    mpCost: 0,
    cooldown: 0,
    maxCooldown: 0,
    description: 'Basic melee strike',
    attachElement: { element: 'random', strength: 'weak', duration: 2 },
  }
}
