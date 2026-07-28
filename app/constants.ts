import {
  getAllBattleSkillDefinitions,
  getRoleSkillLoadout,
} from '../src/battle-core/content/skills/basic-skill-catalog'
import { getActiveRoleStats } from '@/src/lib/jobs/jobConfigRegistry'
import {
  buildSkillFromDefinition,
} from '../src/lib/skills/pocSkillUi'
import {
  getBasicAttack as getActiveBasicAttack,
  getBattleFormulas as getActiveBattleFormulas,
  getBattleRewards as getActiveBattleRewards,
  getEnemyFormula as getActiveEnemyFormula,
  getEquipmentTypes as getActiveEquipmentTypes,
  getExpForLevel as getActiveExpForLevel,
} from '@/src/lib/gameConfig/gameConfigRegistry'

// Equipment types
export type EquipmentType = 'weapon' | 'ring' | 'armor' | 'shoes'

// Skill types
export type SkillType = 'damage' | 'heal' | 'defense' | 'counter' | 'control' | 'utility' | 'mobility' | 'sustain'

// Skill data
export interface Skill {
  id: string
  /** Domain action corresponding to frontend skill slot */
  action: 'cast_skill'
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

export { cooldownMsFromTicks } from '../src/lib/skills/pocSkillUi'

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
  templateId?: string
  skillIds?: string[]
  name: string
  x: number
  y: number
  level: number
  profile?: EnemyStatProfile
  /** When set, uses Warrior/Archer sprite; `null` means force tile sprite only */
  visualId?: MapCharacterVisualId | null
  /** When no valid `visualId`: 1-based tile index from map tileset (consistent with tile layer convention) */
  mapSpriteTileIndex?: number

  /**
   * Optional: special enemy category.
   * Currently used by `ensureDeepClawAgentEnemy()` to inject agent-style enemies.
   */
  enemyType?: 'agent' | string

  /**
   * Optional: identifier for agent enemies (e.g. deepclaw).
   */
  agentId?: string
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
]

// Player starting position (grid coordinates)
export const PLAYER_START = { x: 8, y: 8 }

// Interaction range (tiles)
export const INTERACTION_RANGE = 2.5

// Collision detection resolution
export const COLLISION_SCALE = 2

// Skill data (carry bar: cast-only entries from active skill module)
const _allSkills: Skill[] = [...getAllBattleSkillDefinitions().map(buildSkillFromDefinition)]

function replaceAllSkillsInPlace(skills: Skill[]): void {
  _allSkills.length = 0
  _allSkills.push(...skills)
}

export function setAllSkills(skills: Skill[]): void {
  replaceAllSkillsInPlace(skills)
}

export function getAllSkills(): Skill[] {
  return _allSkills
}

/** @deprecated Prefer getAllSkills() — same array reference, updated in place */
export const allSkills: Skill[] = _allSkills

export function refreshAllSkillsFromCatalog(): Skill[] {
  const next = [...getAllBattleSkillDefinitions().map(buildSkillFromDefinition)]
  replaceAllSkillsInPlace(next)
  return next
}

export function getSkillById(id: string): Skill | undefined {
  if (id === BASIC_ATTACK.id) return getActiveBasicAttack()
  return getAllSkills().find(s => s.id === id)
}

export function getDefaultCarriedSkillIds(role: string = 'hero', maxCount = 6): string[] {
  const loadout = getRoleSkillLoadout(role)
  const skills = getAllSkills()
  const valid = loadout.filter((id) => skills.some((s) => s.id === id))
  const dedup = Array.from(new Set(valid))
  return dedup.slice(0, Math.max(1, maxCount))
}

/** Strips unknown ids, dedupes, caps at 6; falls back to role default when empty. */
export function sanitizeCarriedSkillIds(ids: string[], role: string = 'hero'): string[] {
  const skills = getAllSkills()
  const validIds = new Set(skills.map((s) => s.id))
  const cleaned = Array.from(
    new Set(
      ids
        .map((id) => String(id).trim())
        .filter((id) => id.length > 0 && validIds.has(id)),
    ),
  )
  if (cleaned.length === 0) return getDefaultCarriedSkillIds(role, 6)
  return cleaned.slice(0, 6)
}

// Equipment data
export const equipmentTypes: Record<EquipmentType, EquipmentInfo> = {
  weapon: { name: 'Weapon', icon: '⚔️', stat: 'atk', bonus: 1 },
  ring: { name: 'Ring', icon: '💍', stat: 'maxHp', bonus: 10 },
  armor: { name: 'Armor', icon: '🛡️', stat: 'def', bonus: 1 },
  shoes: { name: 'Shoes', icon: '👟', stat: 'spd', bonus: 1 },
}

// ─────────────────────────────────────────────
// Job / Class system
// ─────────────────────────────────────────────
export type JobClassId = 'relay_warden' | 'hero' | 'tank' | 'archer' | 'mage' | 'healer' | 'assassin'
export const JOB_CLASS_IDS: JobClassId[] = ['hero', 'tank', 'archer', 'mage', 'healer', 'assassin']

export const JOB_DISPLAY_NAMES: Record<JobClassId, string> = {
  relay_warden: 'Relay Warden',
  hero: 'Warrior',
  tank: 'Tank',
  archer: 'Archer',
  mage: 'Mage',
  healer: 'Healer',
  assassin: 'Assassin',
}

export const JOB_DESCRIPTIONS: Record<JobClassId, string> = {
  relay_warden: 'Mid-range signal duelist with pressure, control, shatter, and repair tools.',
  hero: 'Balanced frontline. Balances damage and control, maintains pressure rhythm.',
  tank: 'Heavy armor frontline. Absorbs damage to protect allies, disrupts enemy rhythm.',
  archer: 'Ranged physical DPS. Maintains safe distance for sustained pressure, kites enemies.',
  mage: 'Ranged magic DPS. Uses control to open combo windows, follows freeze with shatter.',
  healer: 'Team support. Prioritizes keeping allies alive, uses debuffs and cleanse.',
  assassin: 'Melee assassin. Uses displacement to flank and dive, executes low-HP targets.',
}

export const JOB_PREFERRED_RANGE: Record<JobClassId, 'melee' | 'mid' | 'ranged'> = {
  relay_warden: 'mid',
  hero: 'melee',
  tank: 'melee',
  archer: 'ranged',
  mage: 'ranged',
  healer: 'mid',
  assassin: 'melee',
}

/** Role-specific base & growth stats, aligned with DB seed (job_classes table). */
export const ROLE_STATS: Record<JobClassId, {
  hp: number; atk: number; def: number; spd: number
  growthHp: number; growthAtk: number; growthDef: number; growthSpd: number
  hpMult: number
}> = {
  relay_warden: { hp: 135, atk: 19, def: 7, spd: 6, growthHp: 32, growthAtk: 5.5, growthDef: 2.8, growthSpd: 2.4, hpMult: 5 },
  hero:     { hp: 120, atk: 6,  def: 4, spd: 4, growthHp: 35, growthAtk: 5, growthDef: 3, growthSpd: 3, hpMult: 5 },
  tank:     { hp: 150, atk: 4,  def: 7, spd: 2, growthHp: 45, growthAtk: 3, growthDef: 5, growthSpd: 1, hpMult: 5 },
  archer:   { hp: 90,  atk: 7,  def: 2, spd: 6, growthHp: 25, growthAtk: 6, growthDef: 2, growthSpd: 4, hpMult: 5 },
  mage:     { hp: 80,  atk: 9,  def: 1, spd: 4, growthHp: 20, growthAtk: 7, growthDef: 1, growthSpd: 3, hpMult: 5 },
  healer:   { hp: 100, atk: 4,  def: 4, spd: 5, growthHp: 28, growthAtk: 3, growthDef: 3, growthSpd: 3, hpMult: 5 },
  assassin: { hp: 85,  atk: 10, def: 2, spd: 8, growthHp: 22, growthAtk: 8, growthDef: 2, growthSpd: 5, hpMult: 5 },
}

// Player level/stat calculation (legacy flat constants kept for reference)
export const BASE_STATS = { hp: 100, atk: 5, def: 3, spd: 3 }
export const LEVEL_UP = { hp: 30, atk: 5, def: 3, spd: 3 }
export const HP_MULTIPLIER = 5

// Enemy level/stat calculation
export const ENEMY_BASE_STATS = { hp: 120, atk: 6, def: 3, spd: 3 }
export const ENEMY_LEVEL_UP = { hp: 36, atk: 6, def: 3, spd: 3 }

/** Set true to multiply player maxHp by JobRoleStats.hpMult. Temporarily disabled. */
export const APPLY_ROLE_HP_MULT = false

export function calcPlayerStats(level: number, jobClassId: JobClassId | string = 'hero') {
  const s = getActiveRoleStats(jobClassId) ?? ROLE_STATS[jobClassId as JobClassId] ?? ROLE_STATS.hero
  const baseMaxHp = s.hp + (level - 1) * s.growthHp
  return {
    maxHp: APPLY_ROLE_HP_MULT ? baseMaxHp * s.hpMult : baseMaxHp,
    // maxHp: baseMaxHp * s.hpMult,
    atk: s.atk + (level - 1) * s.growthAtk,
    def: s.def + (level - 1) * s.growthDef,
    spd: s.spd + (level - 1) * s.growthSpd,
  }
}

export function calcPlayerStatsWithEquipment(
  level: number,
  jobClassId: JobClassId | string,
  equipped: Partial<Record<EquipmentType, unknown>>,
) {
  const stats = calcPlayerStats(level, jobClassId)
  const equipment = getActiveEquipmentTypes()
  for (const type of Object.keys(equipment) as EquipmentType[]) {
    if (!equipped[type]) continue
    const info = equipment[type]
    stats[info.stat] += level * info.bonus
  }
  return stats
}

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
  const formula = getActiveEnemyFormula()
  return {
    maxHp: (formula.base.hp + (level - 1) * formula.growth.hp) * formula.hpMultiplier,
    atk: formula.base.atk + (level - 1) * formula.growth.atk,
    def: formula.base.def + (level - 1) * formula.growth.def,
    spd: formula.base.spd + (level - 1) * formula.growth.spd,
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
  k: number = getActiveBattleFormulas().armorK,
): number {
  if (raw <= 0) return 1
  const a = Math.max(0, armor)
  const mitigated = (raw * k) / (k + a)
  return Math.max(1, Math.floor(mitigated))
}

export const expForLevel = (level: number) => getActiveExpForLevel(level)

export function getBattleRewards(enemyLevel: number): { exp: number; gold: number } {
  return getActiveBattleRewards(enemyLevel)
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
