import { BattleSkillDefinition } from '../../domain/types/skill-types'

const SKILLS: BattleSkillDefinition[] = [
  {
    id: 'arcane_bolt',
    name: 'Arcane Bolt',
    description: 'Single target arcane burst, strong after control.',
    category: 'burst',
    ratio: 1.35,
    mpCost: 4,
    range: 6.5,
    cooldownTicks: 2,
    shatterBonusRatio: 0.45,
    consumeFreezeOnHit: true
  },
  {
    id: 'frost_lock',
    name: 'Frost Lock',
    description: 'Applies freeze and opens combo windows.',
    category: 'control',
    ratio: 1.1,
    mpCost: 6,
    range: 7.2,
    cooldownTicks: 3,
    applyFreezeTicks: 2
  },
  {
    id: 'fireball',
    name: 'Fireball',
    description: 'Reliable mid-range burst projectile.',
    category: 'burst',
    ratio: 1.5,
    mpCost: 6,
    range: 6.2,
    cooldownTicks: 3
  },
  {
    id: 'ice_nova',
    name: 'Ice Nova',
    description: 'Short freeze setup spell for control mages.',
    category: 'control',
    ratio: 1.0,
    mpCost: 5,
    range: 6.8,
    cooldownTicks: 4,
    applyFreezeTicks: 1
  },
  {
    id: 'frost_lock_wave',
    name: 'Frost Lock Wave',
    description: 'Imported frost control wave; freeze-oriented setup.',
    category: 'control',
    ratio: 1.92,
    mpCost: 14,
    range: 8,
    cooldownTicks: 2,
    applyFreezeTicks: 2
  },
  {
    id: 'ice_shard_beam',
    name: 'Ice Shard Beam',
    description: 'Imported shard beam; sustained frost pressure.',
    category: 'burst',
    ratio: 1.48,
    mpCost: 9,
    range: 7,
    cooldownTicks: 1,
    shatterBonusRatio: 0.25
  },
  {
    id: 'arcane_prison_wave',
    name: 'Arcane Prison Wave',
    description: 'Imported arcane control spell; prison-like lock.',
    category: 'control',
    ratio: 1.84,
    mpCost: 13,
    range: 9,
    cooldownTicks: 2,
    applyFreezeTicks: 1
  },
  {
    id: 'mana_pulse_beam',
    name: 'Mana Pulse Beam',
    description: 'Imported arcane pulse beam; medium burst.',
    category: 'burst',
    ratio: 1.52,
    mpCost: 10,
    range: 8,
    cooldownTicks: 1
  },
  {
    id: 'command_aura',
    name: 'Command Aura',
    description: 'Hero pressure pulse that keeps tempo.',
    category: 'utility',
    ratio: 1.18,
    mpCost: 3,
    range: 4.8,
    cooldownTicks: 2
  },
  {
    id: 'rally_call',
    name: 'Rally Call',
    description: 'Hero burst call to quickly re-engage.',
    category: 'burst',
    ratio: 1.4,
    mpCost: 5,
    range: 4.6,
    cooldownTicks: 4
  },
  {
    id: 'shield_wall',
    name: 'Shield Wall',
    description: 'Tank shove with stable frontline damage.',
    category: 'utility',
    ratio: 1.05,
    mpCost: 3,
    range: 2.4,
    cooldownTicks: 2
  },
  {
    id: 'taunt',
    name: 'Taunt',
    description: 'Tank control poke that briefly hinders target.',
    category: 'control',
    ratio: 0.95,
    mpCost: 4,
    range: 2.6,
    cooldownTicks: 3
  },
  {
    id: 'focus_shot',
    name: 'Focus Shot',
    description: 'High precision archer poke.',
    category: 'burst',
    ratio: 1.3,
    mpCost: 4,
    range: 7,
    cooldownTicks: 2
  },
  {
    id: 'volley',
    name: 'Volley',
    description: 'Archer sustained ranged pressure.',
    category: 'sustain',
    ratio: 1.12,
    mpCost: 4,
    range: 6.6,
    cooldownTicks: 3
  },
  {
    id: 'shadow_step',
    name: 'Shadow Step',
    description: 'Assassin gap-close burst.',
    category: 'mobility',
    ratio: 1.55,
    mpCost: 5,
    range: 3.1,
    cooldownTicks: 3
  },
  {
    id: 'backstab',
    name: 'Backstab',
    description: 'Assassin close-range spike damage.',
    category: 'execute',
    ratio: 1.78,
    mpCost: 6,
    range: 2.3,
    cooldownTicks: 4
  },
  {
    id: 'heal_wave',
    name: 'Heal Wave',
    description: 'Support pulse; modeled as low damage utility for now.',
    category: 'sustain',
    ratio: 0.9,
    mpCost: 4,
    range: 5.2,
    cooldownTicks: 2
  },
  {
    id: 'barrier',
    name: 'Barrier',
    description: 'Support control layer that can freeze shortly.',
    category: 'utility',
    ratio: 0.95,
    mpCost: 5,
    range: 5.6,
    cooldownTicks: 3
  }
]

const SKILL_MAP = new Map(SKILLS.map((skill) => [skill.id, skill]))
const ROLE_SKILL_LOADOUTS: Record<string, string[]> = {
  hero: ['rally_call', 'command_aura', 'shield_wall'],
  tank: ['shield_wall', 'taunt', 'barrier'],
  archer: ['focus_shot', 'volley', 'arcane_bolt'],
  mage: ['fireball', 'ice_nova', 'arcane_bolt', 'frost_lock'],
  healer: ['heal_wave', 'barrier', 'command_aura'],
  assassin: ['shadow_step', 'backstab', 'arcane_bolt']
}

export function getBattleSkillDefinition(skillId: string): BattleSkillDefinition | undefined {
  return SKILL_MAP.get(skillId)
}

export function getAllBattleSkillDefinitions(): BattleSkillDefinition[] {
  return Array.from(SKILL_MAP.values())
}

export function upsertBattleSkillDefinition(skill: BattleSkillDefinition): BattleSkillDefinition {
  const normalized: BattleSkillDefinition = {
    ...skill,
    id: String(skill.id || '').trim(),
    name: String(skill.name || skill.id || '').trim(),
    ratio: Number(skill.ratio || 1),
    mpCost: Math.max(0, Number(skill.mpCost || 0)),
    range: Math.max(0.5, Number(skill.range || 1)),
    cooldownTicks: Math.max(0, Math.floor(Number(skill.cooldownTicks || 0))),
    applyFreezeTicks:
      typeof skill.applyFreezeTicks === 'number'
        ? Math.max(0, Math.floor(Number(skill.applyFreezeTicks)))
        : undefined,
    shatterBonusRatio:
      typeof skill.shatterBonusRatio === 'number' ? Number(skill.shatterBonusRatio) : undefined,
    consumeFreezeOnHit:
      typeof skill.consumeFreezeOnHit === 'boolean' ? skill.consumeFreezeOnHit : undefined
  }
  SKILL_MAP.set(normalized.id, normalized)
  return normalized
}

export function upsertBattleSkillDefinitions(skills: BattleSkillDefinition[]): BattleSkillDefinition[] {
  return skills.map((skill) => upsertBattleSkillDefinition(skill))
}

export function getRoleSkillLoadout(role: string): string[] {
  const key = String(role || '').trim().toLowerCase()
  return ROLE_SKILL_LOADOUTS[key] ? [...ROLE_SKILL_LOADOUTS[key]] : ['arcane_bolt', 'frost_lock']
}

