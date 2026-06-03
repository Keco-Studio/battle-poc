import type { EquipmentType } from '@/app/constants'
import type { Skill } from '@/app/constants'

export type EquipmentInfo = {
  name: string
  icon: string
  stat: 'atk' | 'maxHp' | 'def' | 'spd'
  bonus: number
}

export type EnemyStatBlock = { hp: number; atk: number; def: number; spd: number }

export type BattleFormulas = {
  armorK: number
  basicDamageMultiplier: number
  skillDamageMultiplier: number
  defendDamageReduction: number
  defendSkillReduction: number
}

export type ProgressionConfig = {
  expPerLevel: number
  rewardExpPerEnemyLevel: number
  rewardGoldPerEnemyLevel: number
}

export type EnemyFormulaConfig = {
  base: EnemyStatBlock
  growth: EnemyStatBlock
  hpMultiplier: number
}

/** Full bundle applied to runtime (Studio module snapshot). */
export type GameConfigBundle = {
  equipment: Record<EquipmentType, EquipmentInfo>
  basicAttack: Skill
  progression: ProgressionConfig
  enemyFormula: EnemyFormulaConfig
  battleFormulas: BattleFormulas
  roleLoadouts: Record<string, string[]>
}

export type GameConfigImportKind = 'equipment' | 'loadout' | 'balance_scalar' | 'basic_attack'
