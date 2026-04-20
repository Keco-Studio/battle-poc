import { v4 as uuidv4 } from 'uuid'
import type { BattleEntity } from '../battle-core/domain/entities/battle-entity'
import { createBattleSession, type BattleSession } from '../battle-core/domain/entities/battle-session'
import type { TotalStats } from '../../app/hooks/useGameState'
import type { EnemyCombatStats } from '../../app/constants'

const PLAYER_CORE_SKILLS = [
  'backstab',
  'volley',
  'heal_wave',
  'fireball',
  'focus_shot',
  'rally_call',
] as const

const ENEMY_CORE_SKILLS = ['arcane_bolt', 'fireball'] as const

function buildPlayerEntity(input: {
  id: string
  name: string
  pos: { x: number; y: number }
  stats: TotalStats
  currentHp: number
  currentMp: number
  maxMp: number
  skillIds: string[]
}): BattleEntity {
  const maxHp = Math.max(1, Math.floor(input.stats.maxHp))
  const hp = Math.min(maxHp, Math.max(0, Math.floor(input.currentHp)))
  const maxMp = Math.max(0, Math.floor(input.maxMp))
  const mp = Math.min(maxMp, Math.max(0, Math.floor(input.currentMp)))
  const carried = input.skillIds
    .map((id) => String(id).trim())
    .filter((id) => id.length > 0)
  const skillIds = carried.length > 0 ? carried : [...PLAYER_CORE_SKILLS]
  return {
    id: input.id,
    name: input.name,
    team: 'left',
    position: { x: input.pos.x, y: input.pos.y },
    resources: {
      hp,
      maxHp,
      mp,
      maxMp,
      stamina: 80,
      maxStamina: 80,
      rage: 0,
      maxRage: 100,
      shield: 0,
      maxShield: 40,
    },
    atk: Math.max(1, Math.floor(input.stats.atk)),
    def: Math.max(0, Math.floor(input.stats.def)),
    spd: Math.max(1, Math.floor(input.stats.spd)),
    skillSlots: skillIds.map((skillId) => ({ skillId, cooldownTick: 0 })),
    defending: false,
    alive: true,
    effects: [],
  }
}

function buildEnemyEntity(input: {
  id: string
  name: string
  pos: { x: number; y: number }
  stats: EnemyCombatStats
}): BattleEntity {
  const maxHp = Math.max(1, Math.floor(input.stats.maxHp))
  return {
    id: input.id,
    name: input.name,
    team: 'right',
    position: { x: input.pos.x, y: input.pos.y },
    resources: {
      hp: maxHp,
      maxHp,
      mp: 60,
      maxMp: 60,
      stamina: 60,
      maxStamina: 60,
      rage: 0,
      maxRage: 100,
      shield: 0,
      maxShield: 32,
    },
    atk: Math.max(1, Math.floor(input.stats.atk)),
    def: Math.max(0, Math.floor(input.stats.def)),
    spd: Math.max(1, Math.floor(input.stats.spd)),
    skillSlots: ENEMY_CORE_SKILLS.map((skillId) => ({ skillId, cooldownTick: 0 })),
    defending: false,
    alive: true,
    effects: [],
  }
}

export type MapBattleStartConfig = {
  mapWidth: number
  mapHeight: number
  /** 与大地图 collision 一致；传入则 MapBattleController 会裁剪 dash 目标，避免穿墙 */
  isWalkable?: (gx: number, gy: number) => boolean
  playerName: string
  playerGrid: { x: number; y: number }
  playerStats: TotalStats
  playerHp: number
  playerMp: number
  playerMaxMp: number
  playerSkillIds: string[]
  enemyName: string
  enemyId: string
  enemyGrid: { x: number; y: number }
  enemyStats: EnemyCombatStats
}

export function createMapBattleSession(cfg: MapBattleStartConfig): BattleSession {
  const left = buildPlayerEntity({
    id: 'poc-player',
    name: cfg.playerName,
    pos: { x: cfg.playerGrid.x, y: cfg.playerGrid.y },
    stats: cfg.playerStats,
    currentHp: cfg.playerHp,
    currentMp: cfg.playerMp,
    maxMp: cfg.playerMaxMp,
    skillIds: cfg.playerSkillIds,
  })
  const right = buildEnemyEntity({
    id: cfg.enemyId,
    name: cfg.enemyName,
    pos: { x: cfg.enemyGrid.x, y: cfg.enemyGrid.y },
    stats: cfg.enemyStats,
  })

  return createBattleSession({
    left,
    right,
    mapBounds: {
      minX: 0,
      maxX: Math.max(1, cfg.mapWidth),
      minY: 0,
      maxY: Math.max(1, cfg.mapHeight),
    },
  })
}

export function newCommandId(): string {
  return uuidv4()
}

export function gridDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}
