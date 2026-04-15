// 装备类型
export type EquipmentType = 'weapon' | 'ring' | 'armor' | 'shoes'

// 技能类型
export type SkillType = 'damage' | 'heal' | 'defense' | 'counter'

// 技能数据
export interface Skill {
  id: number
  name: string
  icon: string
  unlockLevel: number
  type: SkillType
  multiplier: number
  hits?: number
  desc: string
  /** 使用后的冷却时间（毫秒），普通攻击可省略 */
  cooldownMs?: number
}

/** 自动战斗默认招式，不出现在技能栏 */
export const BASIC_ATTACK: Skill = {
  id: 0,
  name: '普通攻击',
  icon: '👊',
  unlockLevel: 1,
  type: 'damage',
  multiplier: 1.0,
  desc: '造成 ATK×1.0 伤害',
}

// 装备数据
export interface EquipmentInfo {
  name: string
  icon: string
  stat: 'atk' | 'maxHp' | 'def' | 'spd'
  bonus: number
}

// 敌人数据
export interface Enemy {
  id: number
  name: string
  x: number
  y: number
  level: number
}

// 模拟敌人数据
export const initialEnemies: Enemy[] = [
  { id: 1, name: '恶魔守卫', x: 30, y: 40, level: 3 },
  { id: 2, name: '暗影刺客', x: 70, y: 25, level: 5 },
]

// 玩家初始位置
export const PLAYER_START = { x: 15, y: 80 }

// 交互范围
export const INTERACTION_RANGE = 15

// 碰撞检测分辨率
export const COLLISION_SCALE = 2

// 技能数据
export const allSkills: Skill[] = [
  { id: 1, name: '重击', icon: '⚔️', unlockLevel: 1, type: 'damage', multiplier: 1.5, desc: '造成ATK*1.5伤害', cooldownMs: 3000 },
  { id: 2, name: '防御', icon: '🛡️', unlockLevel: 1, type: 'defense', multiplier: 0, desc: '下次受伤减少50%', cooldownMs: 4000 },
  { id: 3, name: '连击', icon: '🔪', unlockLevel: 2, type: 'damage', multiplier: 0.8, hits: 2, desc: '攻击2次，每次ATK*0.8', cooldownMs: 3500 },
  { id: 4, name: '治疗', icon: '💚', unlockLevel: 3, type: 'heal', multiplier: 0.5, desc: '恢复ATK*0.5的HP', cooldownMs: 5000 },
  { id: 5, name: '强击', icon: '💥', unlockLevel: 5, type: 'damage', multiplier: 2.0, desc: '造成ATK*2.0伤害', cooldownMs: 6000 },
  { id: 6, name: '反击', icon: '⚡', unlockLevel: 7, type: 'counter', multiplier: 1.2, desc: '反击ATK*1.2伤害', cooldownMs: 4500 },
]

export function getSkillById(id: number): Skill | undefined {
  if (id === BASIC_ATTACK.id) return BASIC_ATTACK
  return allSkills.find(s => s.id === id)
}

// 装备数据
export const equipmentTypes: Record<EquipmentType, EquipmentInfo> = {
  weapon: { name: '武器', icon: '⚔️', stat: 'atk', bonus: 1 },
  ring: { name: '戒指', icon: '💍', stat: 'maxHp', bonus: 10 },
  armor: { name: '护甲', icon: '🛡️', stat: 'def', bonus: 1 },
  shoes: { name: '鞋子', icon: '👟', stat: 'spd', bonus: 1 },
}

// 玩家等级/属性计算
export const BASE_STATS = { hp: 30, atk: 5, def: 3, spd: 3 }
export const LEVEL_UP = { hp: 10, atk: 5, def: 3, spd: 3 }

export const calcPlayerStats = (level: number) => ({
  maxHp: BASE_STATS.hp + (level - 1) * LEVEL_UP.hp,
  atk: BASE_STATS.atk + (level - 1) * LEVEL_UP.atk,
  def: BASE_STATS.def + (level - 1) * LEVEL_UP.def,
  spd: BASE_STATS.spd + (level - 1) * LEVEL_UP.spd,
})

/** 相对同等级角色基础四维，怪物整体更强（战斗成长用） */
export const MONSTER_VS_PLAYER_STAT_MULT = 1.2

export interface EnemyCombatStats {
  maxHp: number
  atk: number
  def: number
  spd: number
}

/** 按等级取怪物四维：与同等级角色基础属性同曲线，再 × {@link MONSTER_VS_PLAYER_STAT_MULT} */
export function calcEnemyStats(level: number): EnemyCombatStats {
  const p = calcPlayerStats(level)
  const m = MONSTER_VS_PLAYER_STAT_MULT
  return {
    maxHp: Math.round(p.maxHp * m),
    atk: Math.round(p.atk * m),
    def: Math.round(p.def * m),
    spd: Math.round(p.spd * m),
  }
}

/** 开战时敌人等级：比玩家低 1～2 级（不低于 1） */
export function rollEnemyBattleLevel(playerLevel: number): number {
  const lower = 1 + Math.floor(Math.random() * 2)
  return Math.max(1, playerLevel - lower)
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
