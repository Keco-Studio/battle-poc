import type { BattleSkillDefinition } from '@/src/battle-core/domain/types/skill-types'
import type { Skill, SkillType } from '@/app/constants'

export const MAP_BATTLE_TICK_MS = 115

export function cooldownMsFromTicks(cooldownTicks: number): number {
  return Math.max(0, cooldownTicks) * MAP_BATTLE_TICK_MS
}

function categoryToType(def: BattleSkillDefinition): SkillType {
  switch (def.category) {
    case 'control':
      return 'control'
    case 'utility':
      return 'utility'
    case 'mobility':
      return 'mobility'
    case 'sustain':
      return 'sustain'
    default:
      return 'damage'
  }
}

function iconForCategory(def: BattleSkillDefinition): string {
  switch (def.category) {
    case 'control':
      return '❄️'
    case 'utility':
      return '🧩'
    case 'mobility':
      return '💨'
    case 'sustain':
      return '🌀'
    default:
      return '💥'
  }
}

export function buildSkillFromDefinition(def: BattleSkillDefinition): Skill {
  return {
    id: def.id,
    action: 'cast_skill',
    coreSkillId: def.id,
    name: def.name,
    icon: iconForCategory(def),
    unlockLevel: 1,
    type: categoryToType(def),
    multiplier: def.ratio,
    desc: `${def.description ?? 'domain skill'} (MP ${def.mpCost} / Range ${def.range} / CD ${def.cooldownTicks}t)`,
    mpCost: def.mpCost,
    range: def.range,
    cooldownTicks: def.cooldownTicks,
    cooldownMs: cooldownMsFromTicks(def.cooldownTicks),
  }
}

export function buildUiSkillsFromDefinitions(definitions: BattleSkillDefinition[]): Skill[] {
  return definitions.map(buildSkillFromDefinition)
}
