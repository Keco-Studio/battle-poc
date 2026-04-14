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
  { id: 1, name: '重击', icon: '⚔️', unlockLevel: 1, type: 'damage', multiplier: 1.5, desc: '造成ATK*1.5伤害' },
  { id: 2, name: '防御', icon: '🛡️', unlockLevel: 1, type: 'defense', multiplier: 0, desc: '下次受伤减少50%' },
  { id: 3, name: '连击', icon: '🔪', unlockLevel: 2, type: 'damage', multiplier: 0.8, hits: 2, desc: '攻击2次，每次ATK*0.8' },
  { id: 4, name: '治疗', icon: '💚', unlockLevel: 3, type: 'heal', multiplier: 0.5, desc: '恢复ATK*0.5的HP' },
  { id: 5, name: '强击', icon: '💥', unlockLevel: 5, type: 'damage', multiplier: 2.0, desc: '造成ATK*2.0伤害' },
  { id: 6, name: '反击', icon: '⚡', unlockLevel: 7, type: 'counter', multiplier: 1.2, desc: '反击ATK*1.2伤害' },
]

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

export const expForLevel = (level: number) => level * 10
