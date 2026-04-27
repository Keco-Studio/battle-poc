import {
  getAllBattleSkillDefinitions,
  getRoleSkillLoadout,
} from '../src/battle-core/content/skills/basic-skill-catalog'
import type { BattleSkillDefinition } from '../src/battle-core/domain/types/skill-types'

// Equipment types
export type EquipmentType = 'weapon' | 'ring' | 'armor' | 'shoes'

// Skill types
export type SkillType = 'damage' | 'heal' | 'defense' | 'counter' | 'control' | 'utility' | 'mobility' | 'sustain'

// Skill data
export interface Skill {
  id: string
  /** Domain action corresponding to frontend skill slot */
  action: 'cast_skill' | 'defend'
  /** Maps to battle-core skill id when action=cast_skill */
  coreSkillId?: string
  name: string
  icon: string
  unlockLevel: number
  type: SkillType
  multiplier: number
  hits?: number
  desc: string
  mpCost: number
  /** Range info kept for now, enable judgment after battle mode switch */
  range?: number
  /** battle-core cooldown ticks (special actions can be defined by frontend) */
  cooldownTicks: number
  /** Cooldown time after use (ms), can be omitted for basic attack */
  cooldownMs?: number
}

/** Default auto-battle move, does not appear in skill bar */
export const BASIC_ATTACK: Skill = {
  id: 'basic_attack',
  action: 'cast_skill',
  name: 'Basic Attack',
  icon: '👊',
  unlockLevel: 1,
  type: 'damage',
  multiplier: 1.0,
  desc: 'Deals ATK×1.0 damage',
  mpCost: 0,
  cooldownTicks: 0,
}

const MAP_BATTLE_TICK_MS = 115
const DEFEND_COOLDOWN_TICKS = 20

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
    desc: `${def.description ?? 'domain skill'}（MP ${def.mpCost} / Range ${def.range} / CD ${def.cooldownTicks}t）`,
    mpCost: def.mpCost,
    range: def.range,
    cooldownTicks: def.cooldownTicks,
    cooldownMs: cooldownMsFromTicks(def.cooldownTicks),
  }
}

// Equipment data
export interface EquipmentInfo {
  name: string
  icon: string
  stat: 'atk' | 'maxHp' | 'def' | 'spd'
  bonus: number
}

/** Aligned with ai-rpg-poc `EntityDef.visualId`: renders with independent character sprite on map */
export type MapCharacterVisualId = 'warriorBlue' | 'archerGreen' | `pixellab:${string}`

// Enemy data
export interface Enemy {
  id: number
  name: string
  x: number
  y: number
  level: number
  profile?: EnemyStatProfile
  /** 'agent' marks special AI characters in map (e.g. DeepClaw). */
  enemyType?: 'wild' | 'agent'
  /** Stable id for agent persona routing in chat backend. */
  agentId?: string
  /** When set, uses Warrior/Archer sprite; `null` means force tile sprite only */
  visualId?: MapCharacterVisualId | null
  /** When no valid `visualId`: 1-based tile index from map tileset (consistent with tile layer convention) */
  mapSpriteTileIndex?: number
}

export interface EnemyStatProfile {
  maxHp?: number | null
  atk?: number | null
  def?: number | null
  spd?: number | null
}

// Default enemy data (grid coordinates)
export const initialEnemies: Enemy[] = [
  { id: 1, name: 'Demon Guard', x: 5, y: 5, level: 3, visualId: 'warriorBlue' },
  { id: 2, name: 'Shadow Assassin', x: 10, y: 6, level: 5, visualId: 'warriorBlue' },
  {
    id: 9001,
    name: 'DeepClaw Agent',
    x: 12,
    y: 4,
    level: 8,
    enemyType: 'agent',
    agentId: 'deepclaw',
    visualId: 'archerGreen',
  },
]

// Player starting position (grid coordinates)
export const PLAYER_START = { x: 8, y: 8 }

// Interaction range (tiles)
export const INTERACTION_RANGE = 2.5

// Collision detection resolution
export const COLLISION_SCALE = 2

// Skill data
export const allSkills: Skill[] = [
  {
    id: 'defend',
    action: 'defend',
    name: 'Defend',
    icon: '🛡️',
    unlockLevel: 1,
    type: 'defense',
    multiplier: 0,
    desc: 'Enter defense stance and gain shield (domain action)',
    mpCost: 0,
    cooldownTicks: DEFEND_COOLDOWN_TICKS,
    cooldownMs: cooldownMsFromTicks(DEFEND_COOLDOWN_TICKS),
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

// Equipment data
export const equipmentTypes: Record<EquipmentType, EquipmentInfo> = {
  weapon: { name: 'Weapon', icon: '⚔️', stat: 'atk', bonus: 1 },
  ring: { name: 'Ring', icon: '💍', stat: 'maxHp', bonus: 10 },
  armor: { name: 'Armor', icon: '🛡️', stat: 'def', bonus: 1 },
  shoes: { name: 'Shoes', icon: '👟', stat: 'spd', bonus: 1 },
}

// Player level/stat calculation
export const BASE_STATS = { hp: 100, atk: 5, def: 3, spd: 3 }
export const LEVEL_UP = { hp: 30, atk: 5, def: 3, spd: 3 }
export const HP_MULTIPLIER = 5

// Enemy level/stat calculation
export const ENEMY_BASE_STATS = { hp: 120, atk: 6, def: 3, spd: 3 }
export const ENEMY_LEVEL_UP = { hp: 36, atk: 6, def: 3, spd: 3 }

export const calcPlayerStats = (level: number) => ({
  maxHp: (BASE_STATS.hp + (level - 1) * LEVEL_UP.hp) * HP_MULTIPLIER,
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

/** Get enemy four stats by level: uses independent base values and growth values */
export function calcEnemyStats(level: number): EnemyCombatStats {
  return {
    maxHp: (ENEMY_BASE_STATS.hp + (level - 1) * ENEMY_LEVEL_UP.hp) * HP_MULTIPLIER,
    atk: ENEMY_BASE_STATS.atk + (level - 1) * ENEMY_LEVEL_UP.atk,
    def: ENEMY_BASE_STATS.def + (level - 1) * ENEMY_LEVEL_UP.def,
    spd: ENEMY_BASE_STATS.spd + (level - 1) * ENEMY_LEVEL_UP.spd,
  }
}

/** Enemy level when battle starts: 1-2 levels lower than player (not lower than 1) */
export function rollEnemyBattleLevel(playerLevel: number, rng: () => number = Math.random): number {
  const lower = 1 + Math.floor(rng() * 2)
  return Math.max(1, playerLevel - lower)
}

export function mergeEnemyStats(
  baseStats: EnemyCombatStats,
  profile?: EnemyStatProfile,
): EnemyCombatStats {
  const profileHp = profile?.maxHp
  /** Map JSON often has low demo maxHp; take the larger value with level-calculated base to avoid high-level players one-shotting enemies */
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

/** Same attack speed formula as player basic attack (ms, without random jitter) */
export function attackIntervalMsFromSpd(spd: number): number {
  return Math.max(380, Math.min(2200, 1150 - spd * 28))
}

/**
 * Battle "smooth" physical damage calculation: effective damage = raw × K / (K + armor), avoiding hard breakpoints from attack-defense.
 * Higher armor = more diminishing returns, minimum 1 damage (can be multiplied again with defensive stance etc).
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

/** Random display names for wild monster respawn with same id (keeps id stable, only changes skin and stats) */
export const RESPAWN_ENEMY_NAMES = [
  'Wandering Demon',
  'Rift Beast',
  'Dried Bone Soldier',
  'Shadow Bat',
  'Corrupted Guard',
  'Stone Golem',
  'Fog Hidden Monster',
  'Rusted Armor Puppet',
]

export function randomRespawnEnemyName(): string {
  return RESPAWN_ENEMY_NAMES[Math.floor(Math.random() * RESPAWN_ENEMY_NAMES.length)]!
}
