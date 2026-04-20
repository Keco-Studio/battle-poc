import {
  getAllBattleSkillDefinitions,
  getRoleSkillLoadout,
} from '../src/battle-core/content/skills/basic-skill-catalog'
import type { BattleSkillDefinition } from '../src/battle-core/domain/types/skill-types'

// 装备类型
export type EquipmentType = 'weapon' | 'ring' | 'armor' | 'shoes'

// 技能类型
export type SkillType = 'damage' | 'heal' | 'defense' | 'counter' | 'control' | 'utility' | 'mobility' | 'sustain'

// 技能数据
export interface Skill {
  id: string
  /** 前端技能槽对应的 domain 动作 */
  action: 'cast_skill' | 'defend'
  /** action=cast_skill 时映射到 battle-core skill id */
  coreSkillId?: string
  name: string
  icon: string
  unlockLevel: number
  type: SkillType
  multiplier: number
  hits?: number
  desc: string
  mpCost: number
  /** 射程信息先保留，战斗模式切换后再启用判定 */
  range?: number
  /** battle-core 冷却 tick（特殊动作可由前端定义） */
  cooldownTicks: number
  /** 使用后的冷却时间（毫秒），普通攻击可省略 */
  cooldownMs?: number
}

/** 自动战斗默认招式，不出现在技能栏 */
export const BASIC_ATTACK: Skill = {
  id: 'basic_attack',
  action: 'cast_skill',
  name: '普通攻击',
  icon: '👊',
  unlockLevel: 1,
  type: 'damage',
  multiplier: 1.0,
  desc: '造成 ATK×1.0 伤害',
  mpCost: 0,
  cooldownTicks: 0,
}

const MAP_BATTLE_TICK_MS = 115

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

function buildSkillFromDefinition(def: BattleSkillDefinition): Skill {
  return {
    id: def.id,
    action: 'cast_skill',
    coreSkillId: def.id,
    name: def.name,
    icon: iconForCategory(def),
    unlockLevel: 1,
    type: categoryToType(def),
    multiplier: def.ratio,
    desc: `${def.description ?? 'domain 技能'}（MP ${def.mpCost} / 射程 ${def.range} / 冷却 ${def.cooldownTicks}t）`,
    mpCost: def.mpCost,
    range: def.range,
    cooldownTicks: def.cooldownTicks,
    cooldownMs: cooldownMsFromTicks(def.cooldownTicks),
  }
}

// 装备数据
export interface EquipmentInfo {
  name: string
  icon: string
  stat: 'atk' | 'maxHp' | 'def' | 'spd'
  bonus: number
}

/** 与 ai-rpg-poc `EntityDef.visualId` 对齐：地图上用独立角色图渲染 */
export type MapCharacterVisualId = 'warriorBlue' | 'archerGreen'

// 敌人数据
export interface Enemy {
  id: number
  name: string
  x: number
  y: number
  level: number
  profile?: EnemyStatProfile
  /** 有值时用 Warrior / Archer 精灵图；`null` 表示强制只用瓦块图 */
  visualId?: MapCharacterVisualId | null
  /** 无有效 `visualId` 时：地图 tileset 的 1-based 瓦块索引（与地块 layer 约定一致） */
  mapSpriteTileIndex?: number
}

export interface EnemyStatProfile {
  maxHp?: number | null
  atk?: number | null
  def?: number | null
  spd?: number | null
}

// 默认敌人数据（网格坐标）
export const initialEnemies: Enemy[] = [
  { id: 1, name: '恶魔守卫', x: 5, y: 5, level: 3, visualId: 'warriorBlue' },
  { id: 2, name: '暗影刺客', x: 10, y: 6, level: 5, visualId: 'warriorBlue' },
]

// 玩家初始位置（网格坐标）
export const PLAYER_START = { x: 8, y: 8 }

// 交互范围（格）
export const INTERACTION_RANGE = 2.5

// 碰撞检测分辨率
export const COLLISION_SCALE = 2

// 技能数据
export const allSkills: Skill[] = [
  {
    id: 'defend',
    action: 'defend',
    name: '防御',
    icon: '🛡️',
    unlockLevel: 1,
    type: 'defense',
    multiplier: 0,
    desc: '进入防御姿态并获得护盾（domain 动作）',
    mpCost: 0,
    cooldownTicks: 2,
    cooldownMs: cooldownMsFromTicks(2),
  },
  ...getAllBattleSkillDefinitions().map(buildSkillFromDefinition),
]

export function getSkillById(id: string): Skill | undefined {
  if (id === BASIC_ATTACK.id) return BASIC_ATTACK
  return allSkills.find(s => s.id === id)
}

export function getDefaultCarriedSkillIds(role: string = 'hero', maxCount = 6): string[] {
  const loadout = getRoleSkillLoadout(role)
  const valid = loadout.filter((id) => allSkills.some((s) => s.id === id))
  const withDefend = valid.includes('defend') ? valid : ['defend', ...valid]
  const dedup = Array.from(new Set(withDefend))
  return dedup.slice(0, Math.max(1, maxCount))
}

// 装备数据
export const equipmentTypes: Record<EquipmentType, EquipmentInfo> = {
  weapon: { name: '武器', icon: '⚔️', stat: 'atk', bonus: 1 },
  ring: { name: '戒指', icon: '💍', stat: 'maxHp', bonus: 10 },
  armor: { name: '护甲', icon: '🛡️', stat: 'def', bonus: 1 },
  shoes: { name: '鞋子', icon: '👟', stat: 'spd', bonus: 1 },
}

// 玩家等级/属性计算
export const BASE_STATS = { hp: 100, atk: 5, def: 3, spd: 3 }
export const LEVEL_UP = { hp: 30, atk: 5, def: 3, spd: 3 }

// 敌人等级/属性计算
export const ENEMY_BASE_STATS = { hp: 120, atk: 6, def: 3, spd: 3 }
export const ENEMY_LEVEL_UP = { hp: 36, atk: 6, def: 3, spd: 3 }

export const calcPlayerStats = (level: number) => ({
  maxHp: BASE_STATS.hp + (level - 1) * LEVEL_UP.hp,
  atk: BASE_STATS.atk + (level - 1) * LEVEL_UP.atk,
  def: BASE_STATS.def + (level - 1) * LEVEL_UP.def,
  spd: BASE_STATS.spd + (level - 1) * LEVEL_UP.spd,
})

export const BASIC_DAMAGE_MULTIPLIER = 1.24
export const SKILL_DAMAGE_MULTIPLIER = 1.82
export const DEFEND_DAMAGE_REDUCTION = 0.6
export const DEFEND_SKILL_REDUCTION = 0.62

export interface EnemyCombatStats {
  maxHp: number
  atk: number
  def: number
  spd: number
}

/** 按等级取敌人四维：使用独立基础值与成长值 */
export function calcEnemyStats(level: number): EnemyCombatStats {
  return {
    maxHp: ENEMY_BASE_STATS.hp + (level - 1) * ENEMY_LEVEL_UP.hp,
    atk: ENEMY_BASE_STATS.atk + (level - 1) * ENEMY_LEVEL_UP.atk,
    def: ENEMY_BASE_STATS.def + (level - 1) * ENEMY_LEVEL_UP.def,
    spd: ENEMY_BASE_STATS.spd + (level - 1) * ENEMY_LEVEL_UP.spd,
  }
}

/** 开战时敌人等级：比玩家低 1～2 级（不低于 1） */
export function rollEnemyBattleLevel(playerLevel: number, rng: () => number = Math.random): number {
  const lower = 1 + Math.floor(rng() * 2)
  return Math.max(1, playerLevel - lower)
}

export function mergeEnemyStats(
  baseStats: EnemyCombatStats,
  profile?: EnemyStatProfile,
): EnemyCombatStats {
  const profileHp = profile?.maxHp
  /** 地图 JSON 常带演示用低 maxHp；与按等级算的 base 取较大值，避免高等级玩家两刀秒怪 */
  const maxHp =
    profileHp == null
      ? Math.max(1, Math.round(baseStats.maxHp))
      : Math.max(1, Math.round(Math.max(baseStats.maxHp, profileHp)))
  return {
    maxHp,
    atk: Math.max(1, Math.round(profile?.atk ?? baseStats.atk)),
    def: Math.max(0, Math.round(profile?.def ?? baseStats.def)),
    spd: Math.max(1, Math.round(profile?.spd ?? baseStats.spd)),
  }
}

export function createEnemyEncounter(
  playerLevel: number,
  profile?: EnemyStatProfile,
  rng: () => number = Math.random,
): { level: number; stats: EnemyCombatStats } {
  const level = rollEnemyBattleLevel(playerLevel, rng)
  return {
    level,
    stats: mergeEnemyStats(calcEnemyStats(level), profile),
  }
}

/** 与玩家普攻相同的攻速公式（毫秒，不含随机抖动） */
export function attackIntervalMsFromSpd(spd: number): number {
  return Math.max(380, Math.min(2200, 1150 - spd * 28))
}

/**
 * 战斗用「平滑」物理承伤：有效伤害 = raw × K / (K + 护甲)，避免攻击−防御的硬断层。
 * 护甲越高递减收益越明显，最低 1 点伤害（可配合防御姿态等再乘系数）。
 */
export const BATTLE_ARMOR_K = 50

export function mitigatedPhysicalDamage(
  raw: number,
  armor: number,
  k: number = BATTLE_ARMOR_K,
): number {
  if (raw <= 0) return 1
  const a = Math.max(0, armor)
  const mitigated = (raw * k) / (k + a)
  return Math.max(1, Math.floor(mitigated))
}

export const expForLevel = (level: number) => level * 10

export function getBattleRewards(enemyLevel: number): { exp: number; gold: number } {
  return {
    exp: enemyLevel,
    gold: enemyLevel * 2,
  }
}

/** 击败后同 id 重生野怪时的随机显示名（保持 id 稳定，仅换皮与属性） */
export const RESPAWN_ENEMY_NAMES = [
  '游荡魔',
  '裂隙兽',
  '枯骨兵',
  '暗影蝠',
  '腐化守卫',
  '石像怪',
  '雾隐怪',
  '锈甲傀儡',
]

export function randomRespawnEnemyName(): string {
  return RESPAWN_ENEMY_NAMES[Math.floor(Math.random() * RESPAWN_ENEMY_NAMES.length)]!
}
