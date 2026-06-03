import type { EquipmentType, Skill } from '@/app/constants'
import type { EquipmentInfo, GameConfigBundle } from './gameConfigTypes'
import { createDefaultGameConfigBundle } from './defaultGameConfig'

let active: GameConfigBundle = createDefaultGameConfigBundle()

export function getActiveGameConfig(): GameConfigBundle {
  return active
}

export function applyGameConfigBundle(bundle: GameConfigBundle): void {
  active = {
    equipment: JSON.parse(JSON.stringify(bundle.equipment)),
    basicAttack: { ...bundle.basicAttack },
    progression: { ...bundle.progression },
    enemyFormula: {
      base: { ...bundle.enemyFormula.base },
      growth: { ...bundle.enemyFormula.growth },
      hpMultiplier: bundle.enemyFormula.hpMultiplier,
    },
    battleFormulas: { ...bundle.battleFormulas },
    roleLoadouts: JSON.parse(JSON.stringify(bundle.roleLoadouts)),
  }
}

export function resetGameConfigToDefault(): void {
  applyGameConfigBundle(createDefaultGameConfigBundle())
}

export function getEquipmentTypes(): Record<EquipmentType, EquipmentInfo> {
  return active.equipment
}

export function getBasicAttack(): Skill {
  return active.basicAttack
}

export function getRoleSkillLoadout(role: string): string[] {
  const key = String(role || '').trim().toLowerCase()
  const list = active.roleLoadouts[key]
  return list ? [...list] : ['arcane_bolt', 'frost_lock']
}

export function getExpForLevel(level: number): number {
  return Math.max(1, level) * active.progression.expPerLevel
}

export function getBattleRewards(enemyLevel: number): { exp: number; gold: number } {
  const lv = Math.max(1, enemyLevel)
  return {
    exp: lv * active.progression.rewardExpPerEnemyLevel,
    gold: lv * active.progression.rewardGoldPerEnemyLevel,
  }
}

export function getEnemyFormula() {
  return active.enemyFormula
}

export function getBattleFormulas() {
  return active.battleFormulas
}
